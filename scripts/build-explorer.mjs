// Offline conversion of CC0 MakeHuman geometry into Vesper's game rig.
// Source meshes, targets and weights remain outside public/. See asset credits.
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import sharp from "sharp";

const root = path.resolve("asset-sources/characters/makehuman");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const vec = (a) => new T.Vector3().fromArray(a);
function obj(text) {
  const vertices = [],
    uvs = [],
    faces = [],
    groups = new Map();
  let group = "body";
  for (const line of text.split(/\r?\n/)) {
    const [op, ...values] = line.trim().split(/\s+/);
    if (op === "v") vertices.push(values.map(Number));
    if (op === "vt") uvs.push(values.map(Number));
    if (op === "g") group = values[0];
    if (op === "f") {
      const corners = values.map((s) => s.split("/").map((s) => Number(s) - 1));
      faces.push({ corners, group });
      if (!groups.has(group)) groups.set(group, new Set());
      corners.forEach(([v]) => groups.get(group).add(v));
    }
  }
  return { vertices, uvs, faces, groups };
}
const base = obj(read("base.obj"));
const shaped = base.vertices.map((v) => [...v]);
for (const [file, amount] of [
  ["female-young.target", 1],
  ["female-athletic.target", 0.45],
]) {
  for (const line of read(file).split(/\r?\n/)) {
    if (!/^\d/.test(line)) continue;
    const [i, ...offset] = line.split(/\s+/).map(Number);
    offset.forEach((v, axis) => (shaped[i][axis] += v * amount));
  }
}
const bodyIndices = [...base.groups.get("body")];
const floor = Math.min(...bodyIndices.map((i) => shaped[i][1]));
const height = Math.max(...bodyIndices.map((i) => shaped[i][1])) - floor;
const unit = 1.74 / height;
const world = (p) =>
  new T.Vector3(p[0] * unit, (p[1] - floor) * unit, p[2] * unit);
const rigSpec = JSON.parse(read("rig.json"));
const weightSpec = JSON.parse(read("weights.json")).weights;
const names = Object.keys(rigSpec),
  indices = new Map(names.map((n, i) => [n, i]));
const weights = base.vertices.map(() => new Map());
for (const [name, entries] of Object.entries(weightSpec)) {
  if (!indices.has(name)) continue;
  for (const [i, w] of entries) if (w > 0) weights[i].set(indices.get(name), w);
}
function joint(ref) {
  const ids =
    ref.strategy === "CUBE"
      ? [...base.groups.get(ref.cube_name)]
      : ref.strategy === "VERTEX"
        ? [ref.vertex_index]
        : ref.vertex_indices;
  return world(
    ids.reduce(
      (p, i) => p.map((v, axis) => v + shaped[i][axis] / ids.length),
      [0, 0, 0],
    ),
  );
}

// Read animation transforms without decoding the donor's materials or geometry.
const io = new NodeIO();
const donor = await io.read("asset-sources/characters/locomotion-source.glb");
const sourceRoot = new T.Group();
sourceRoot.rotation.y = Math.PI; // The donor faces -Z; the game uses +Z.
const sourceNodes = new Map(),
  byName = new Map();
for (const n of donor.getRoot().listNodes()) {
  const o = new T.Object3D();
  o.name = n.getName();
  o.position.fromArray(n.getTranslation());
  o.quaternion.fromArray(n.getRotation());
  o.scale.fromArray(n.getScale());
  sourceNodes.set(n, o);
  byName.set(o.name, o);
}
for (const [n, o] of sourceNodes)
  for (const c of n.listChildren()) o.add(sourceNodes.get(c));
for (const n of donor.getRoot().listScenes()[0].listChildren())
  sourceRoot.add(sourceNodes.get(n));
function sample(clip, time) {
  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler(),
      times = sampler.getInput().getArray(),
      values = sampler.getOutput().getArray();
    let a = 0;
    while (a + 1 < times.length && times[a + 1] <= time) a++;
    const b = Math.min(a + 1, times.length - 1),
      t = b === a ? 0 : (time - times[a]) / (times[b] - times[a]);
    const node = sourceNodes.get(channel.getTargetNode()),
      prop = channel.getTargetPath();
    if (prop === "rotation")
      node.quaternion
        .fromArray(values, a * 4)
        .slerp(new T.Quaternion().fromArray(values, b * 4), t);
    else if (prop === "translation" || prop === "scale")
      node[prop === "translation" ? "position" : "scale"]
        .fromArray(values, a * 3)
        .lerp(new T.Vector3().fromArray(values, b * 3), t);
  }
  sourceRoot.updateMatrixWorld(true);
}
sample(
  donor
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === "TPose"),
  0,
);
const sourceHip = byName
  .get("mixamorig:Hips")
  .getWorldPosition(new T.Vector3());
const sourceRest = new Map(
  [...byName].map(([n, o]) => [
    n,
    {
      position: o.getWorldPosition(new T.Vector3()),
      rotation: o.getWorldQuaternion(new T.Quaternion()),
    },
  ]),
);
const bones = new Map(),
  targetRoot = new T.Group();
function makeBone(name) {
  if (bones.has(name)) return bones.get(name);
  const def = rigSpec[name],
    bone = new T.Bone(),
    head = joint(def.head),
    tail = joint(def.tail);
  bone.name = name;
  const source = byName.get(name),
    rest = sourceRest.get(name);
  const child = source?.children.find((o) => o.name.startsWith("mixamorig:"));
  const bind = rest?.rotation.clone() || new T.Quaternion();
  if (child) {
    const direction = child
      .getWorldPosition(new T.Vector3())
      .sub(rest.position)
      .normalize();
    bind.premultiply(
      new T.Quaternion().setFromUnitVectors(
        direction,
        tail.clone().sub(head).normalize(),
      ),
    );
  }
  const parent = def.parent ? makeBone(def.parent) : targetRoot;
  parent.updateWorldMatrix(true, false);
  parent.add(bone);
  bone.position.copy(parent.worldToLocal(head.clone()));
  bone.quaternion.copy(
    parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(bind),
  );
  bone.updateWorldMatrix(true, true);
  bone.userData.bindRotation = bind;
  bones.set(name, bone);
  return bone;
}
names.forEach(makeBone);
targetRoot.updateMatrixWorld(true);
const ordered = [];
targetRoot.traverse((b) => {
  if (b.isBone) ordered.push(b);
});
const targetHip = bones.get("mixamorig:Hips").getWorldPosition(new T.Vector3());
const hipScale = targetHip.y / sourceHip.y;

const document = new Document(),
  buffer = document.createBuffer(),
  scene = document.createScene("Vesper Vale");
const nodes = new Map();
for (const name of names) {
  const b = bones.get(name),
    n = document
      .createNode(name)
      .setTranslation(b.position.toArray())
      .setRotation(b.quaternion.toArray());
  nodes.set(name, n);
}
for (const name of names) {
  const parent = rigSpec[name].parent;
  if (parent) nodes.get(parent).addChild(nodes.get(name));
  else scene.addChild(nodes.get(name));
}
function accessor(name, type, data) {
  return document
    .createAccessor(name)
    .setType(type)
    .setArray(data)
    .setBuffer(buffer);
}
const matrices = names.flatMap((name) =>
  bones.get(name).matrixWorld.clone().invert().toArray(),
);
const skin = document
  .createSkin("Vesper skeleton")
  .setSkeleton(nodes.get("mixamorig:Root"));
names.forEach((name) => skin.addJoint(nodes.get(name)));
skin.setInverseBindMatrices(
  accessor("bind matrices", "MAT4", new Float32Array(matrices)),
);
const textures = new Map();
function texture(file) {
  const full = path.join(root, file);
  if (!textures.has(full))
    textures.set(
      full,
      document
        .createTexture(path.basename(file))
        .setImage(fs.readFileSync(full))
        .setMimeType(file.endsWith(".jpg") ? "image/jpeg" : "image/png"),
    );
  return textures.get(full);
}
function material(name, file, options = {}) {
  const m = document
    .createMaterial(name)
    .setMetallicFactor(0)
    .setRoughnessFactor(options.roughness ?? 0.8);
  if (file) m.setBaseColorTexture(texture(file));
  if (options.normal)
    m.setNormalTexture(texture(options.normal)).setNormalScale(0.55);
  if (options.alpha)
    m.setAlphaMode("MASK").setAlphaCutoff(0.38).setDoubleSided(true);
  return m;
}
function weight4(map) {
  const entries = [...map]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (!entries.length) entries.push([indices.get("mixamorig:Hips"), 1]);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const joints = [0, 0, 0, 0],
    values = [0, 0, 0, 0];
  entries.forEach(([j, w], i) => {
    joints[i] = j;
    values[i] = w / total;
  });
  return { joints, values };
}
let triangleCount = 0;
function addMesh(name, data, points, vertexWeights, mat, keep = () => true) {
  const positions = [],
    uvs = [],
    joints = [],
    values = [],
    index = [],
    keyMap = new Map(),
    original = [];
  const normals = points.map(() => new T.Vector3());
  for (const face of data.faces.filter(keep)) {
    for (let i = 1; i < face.corners.length - 1; i++) {
      const ids = [
        face.corners[0][0],
        face.corners[i][0],
        face.corners[i + 1][0],
      ];
      const normal = points[ids[1]]
        .clone()
        .sub(points[ids[0]])
        .cross(points[ids[2]].clone().sub(points[ids[0]]));
      ids.forEach((v) => normals[v].add(normal));
    }
    const faceIndices = face.corners.map(([v, uv]) => {
      const key = `${v}/${uv}`;
      if (!keyMap.has(key)) {
        keyMap.set(key, positions.length / 3);
        positions.push(...points[v].toArray());
        original.push(v);
        const tex = data.uvs[uv] || [0, 0];
        uvs.push(tex[0], 1 - tex[1]);
        const w = weight4(vertexWeights[v]);
        joints.push(...w.joints);
        values.push(...w.values);
      }
      return keyMap.get(key);
    });
    for (let i = 1; i < faceIndices.length - 1; i++)
      index.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const primitive = document
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute(
      "POSITION",
      accessor(`${name} position`, "VEC3", new Float32Array(positions)),
    )
    .setAttribute(
      "NORMAL",
      accessor(
        `${name} normal`,
        "VEC3",
        new Float32Array(
          original.flatMap((v) => normals[v].clone().normalize().toArray()),
        ),
      ),
    )
    .setAttribute(
      "TEXCOORD_0",
      accessor(`${name} uv`, "VEC2", new Float32Array(uvs)),
    )
    .setAttribute(
      "JOINTS_0",
      accessor(`${name} joints`, "VEC4", new Uint16Array(joints)),
    )
    .setAttribute(
      "WEIGHTS_0",
      accessor(`${name} weights`, "VEC4", new Float32Array(values)),
    )
    .setIndices(accessor(`${name} indices`, "SCALAR", new Uint32Array(index)));
  const mesh = document.createMesh(name).addPrimitive(primitive);
  scene.addChild(document.createNode(name).setMesh(mesh).setSkin(skin));
  triangleCount += index.length / 3;
  console.log(
    name,
    positions.length / 3,
    "vertices",
    index.length / 3,
    "triangles",
  );
}
const hidden = new Set();
function fitAsset(folder, basename, mat) {
  const prefix = `system/${folder}/${basename}`,
    text = read(`${prefix}.mhclo`);
  const data = obj(read(`${prefix}.obj`)),
    mapping = [],
    scale = [1, 1, 1];
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(),
      a = line.split(/\s+/);
    if (line.startsWith("#") || !line) continue;
    if (/^[xyz]_scale/.test(line)) {
      const axis = "xyz".indexOf(a[0][0]);
      scale[axis] = Math.abs(shaped[+a[1]][axis] - shaped[+a[2]][axis]) / +a[3];
    }
    if (a[0] === "verts" || a[0] === "delete_verts") {
      section = a[0];
      continue;
    }
    if (!/^\d/.test(line)) continue;
    if (section === "verts") mapping.push(a.map(Number));
    if (section === "delete_verts")
      for (let i = 0; i < a.length; i++) {
        const start = +a[i];
        if (a[i + 1] === "-") {
          for (let j = start; j <= +a[i + 2]; j++) hidden.add(j);
          i += 2;
        } else hidden.add(start);
      }
  }
  if (mapping.length !== data.vertices.length)
    throw Error(
      `${basename}: invalid mapping ${mapping.length}/${data.vertices.length}`,
    );
  const fitted = [],
    fittedWeights = [];
  for (const row of mapping) {
    if (row.length === 1) {
      fitted.push(world(shaped[row[0]]));
      fittedWeights.push(weights[row[0]]);
      continue;
    }
    const p = [0, 0, 0],
      w = new Map();
    for (let i = 0; i < 3; i++) {
      const v = row[i],
        influence = row[i + 3];
      for (let axis = 0; axis < 3; axis++)
        p[axis] += shaped[v][axis] * influence;
      for (const [j, weight] of weights[v])
        w.set(j, (w.get(j) || 0) + weight * Math.max(0, influence));
    }
    for (let axis = 0; axis < 3; axis++) p[axis] += row[axis + 6] * scale[axis];
    fitted.push(world(p));
    fittedWeights.push(w);
  }
  addMesh(
    basename,
    data,
    fitted,
    fittedWeights,
    mat,
    (face) =>
      basename !== "shoes04" || !face.corners.some(([v]) => fitted[v].y > 0.15),
  );
  return { points: fitted, weights: fittedWeights.map(weight4) };
}
fitAsset(
  "clothes/female_casualsuit01",
  "female_casualsuit01",
  material("Expedition fabric", "vesper-outfit-padded.png", {
    normal: "system/clothes/female_casualsuit01/female_casualsuit01_normal.png",
  }),
);
const shoes = fitAsset(
  "clothes/shoes04",
  "shoes04",
  material("Walking boots", "system/clothes/shoes04/shoes04_diffuse.png"),
);
fitAsset(
  "hair/ponytail01",
  "ponytail01",
  material("Brown hair", "system/hair/ponytail01/ponytail01_diffuse.png", {
    alpha: true,
    roughness: 0.65,
  }),
);
fitAsset(
  "eyes/high-poly",
  "high-poly",
  material("Brown eyes", "system/eyes/materials/brown_eye.png", {
    alpha: true,
    roughness: 0.17,
  }),
);
fitAsset(
  "eyebrows/eyebrow001",
  "eyebrow001",
  material("Eyebrows", "system/eyebrows/eyebrow001/eyebrow001.png", {
    alpha: true,
  }),
);
fitAsset(
  "eyelashes/eyelashes01",
  "eyelashes01",
  material("Eyelashes", "system/eyelashes/eyelashes01/eyelashes01.png", {
    alpha: true,
  }),
);
addMesh(
  "Vesper",
  base,
  shaped.map(world),
  weights,
  material(
    "Skin",
    "system/skins/young_caucasian_female/young_lightskinned_female_diffuse.png",
    { roughness: 0.57 },
  ),
  (face) =>
    face.group === "body" &&
    !face.corners.some(([v]) => hidden.has(v)) &&
    !face.corners.every(([v]) => {
      const p = world(shaped[v]);
      return p.y < 1.065 && Math.abs(p.x) < 0.31;
    }),
);

// Equipment is original geometry, bound to the torso/hips/shins rather than
// floating in player space. Each bone/material group becomes one draw call.
const gear = new Map();
const palette = {
  canvas: 0x756c54,
  leather: 0x3e342b,
  edge: 0x9d8a61,
  rope: 0xb4a17a,
  metal: 0x70766c,
  bottle: 0x4c5947,
};
function piece(bone, kind, geometry) {
  const key = `${bone}/${kind}`;
  if (!gear.has(key)) gear.set(key, { bone, kind, parts: [] });
  gear.get(key).parts.push(geometry);
}
function box(bone, kind, size, p) {
  piece(
    bone,
    kind,
    new RoundedBoxGeometry(
      ...size,
      kind === "canvas" ? 4 : 2,
      Math.min(...size) * (kind === "canvas" ? 0.35 : 0.2),
    ).translate(...p),
  );
}
function tube(bone, kind, points, radius = 0.005) {
  piece(
    bone,
    kind,
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map(vec)),
      32,
      radius,
      6,
      false,
    ),
  );
}
const torso = "mixamorig:Spine2",
  hip = "mixamorig:Hips";
box(torso, "canvas", [0.29, 0.36, 0.15], [0, 1.28, -0.17]);
box(torso, "canvas", [0.23, 0.13, 0.065], [0, 1.18, -0.258]);
box(torso, "canvas", [0.31, 0.055, 0.19], [0, 1.457, -0.18]);
for (const side of [-1, 1]) {
  box(torso, "canvas", [0.065, 0.17, 0.12], [side * 0.168, 1.26, -0.17]);
  box(torso, "leather", [0.027, 0.35, 0.01], [side * 0.085, 1.28, -0.253]);
  box(torso, "metal", [0.037, 0.028, 0.014], [side * 0.085, 1.3, -0.263]);
  const strap = [
    [side * 0.11, 1.14, -0.105],
    [side * 0.12, 1.41, -0.13],
    [side * 0.105, 1.46, -0.025],
    [side * 0.125, 1.37, 0.175],
    [side * 0.115, 1.25, 0.2],
    [side * 0.105, 1.14, 0.14],
    [side * 0.13, 1.1, 0.08],
  ];
  for (let i = 0; i < strap.length - 1; i++) {
    const a = vec(strap[i]),
      b = vec(strap[i + 1]),
      delta = b.clone().sub(a);
    const geometry = new RoundedBoxGeometry(
      0.034,
      delta.length() + 0.012,
      0.009,
      1,
      0.003,
    );
    geometry
      .applyQuaternion(
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.clone().normalize(),
        ),
      )
      .translate(...a.add(b).multiplyScalar(0.5).toArray());
    piece(torso, "leather", geometry);
  }
  tube(
    torso,
    "edge",
    strap.map((p) => [p[0] + side * 0.013, p[1], p[2]]),
    0.0013,
  );
}
box(hip, "leather", [0.105, 0.145, 0.09], [0.17, 1.005, 0.015]);
box(hip, "metal", [0.035, 0.029, 0.013], [0.17, 1.04, 0.069]);
const belt = new T.TorusGeometry(0.145, 0.013, 8, 48)
  .rotateX(Math.PI / 2)
  .scale(1, 1, 0.75)
  .translate(0, 1.055, 0.018);
piece(hip, "leather", belt);
box(hip, "metal", [0.05, 0.033, 0.02], [0, 1.055, 0.134]);
for (let i = 0; i < 6; i++)
  piece(
    torso,
    "rope",
    new T.TorusGeometry(0.083 - i * 0.0035, 0.0045, 6, 48)
      .scale(0.8, 1, 1)
      .rotateY(-0.15)
      .translate(-0.125, 1.19, -0.294 - i * 0.005),
  );
box(torso, "leather", [0.025, 0.09, 0.014], [-0.125, 1.273, -0.32]);
piece(
  torso,
  "bottle",
  new T.CylinderGeometry(0.039, 0.043, 0.145, 16).translate(
    0.207,
    1.27,
    -0.175,
  ),
);
piece(
  torso,
  "metal",
  new T.CylinderGeometry(0.017, 0.017, 0.025, 12).translate(
    0.207,
    1.353,
    -0.175,
  ),
);
tube(
  hip,
  "metal",
  [
    [0.17, 0.94, 0.03],
    [0.19, 0.91, 0.035],
    [0.182, 0.873, 0.039],
    [0.15, 0.866, 0.039],
    [0.137, 0.902, 0.035],
    [0.15, 0.932, 0.03],
    [0.17, 0.94, 0.03],
  ],
  0.0035,
);
for (const side of ["Left", "Right"]) {
  const foot = bones
      .get(`mixamorig:${side}Foot`)
      .getWorldPosition(new T.Vector3()),
    knee = bones.get(`mixamorig:${side}Leg`).getWorldPosition(new T.Vector3()),
    dir = knee.sub(foot).normalize();
  const gaiter = new T.CylinderGeometry(0.054, 0.05, 0.16, 16)
    .applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir),
    )
    .translate(...foot.clone().addScaledVector(dir, 0.09).toArray());
  piece(`mixamorig:${side}Leg`, "leather", gaiter);
}
for (const { bone, kind, parts } of gear.values()) {
  const vertices = [],
    uvs = [],
    faces = [];
  for (const g of parts) {
    const p = g.attributes.position,
      uv = g.attributes.uv,
      offset = vertices.length;
    for (let i = 0; i < p.count; i++) {
      vertices.push([p.getX(i), p.getY(i), p.getZ(i)]);
      uvs.push([uv?.getX(i) || 0, uv?.getY(i) || 0]);
    }
    const ix = g.index?.array || Array.from({ length: p.count }, (_, i) => i);
    for (let i = 0; i < ix.length; i += 3)
      faces.push({
        corners: [ix[i], ix[i + 1], ix[i + 2]].map((j) => [
          offset + j,
          offset + j,
        ]),
      });
  }
  const mat = material(`Equipment ${kind}`, null, {
    roughness: kind === "metal" ? 0.4 : 0.82,
  }).setBaseColorFactor([...new T.Color(palette[kind]).toArray(), 1]);
  if (kind === "metal") mat.setMetallicFactor(0.65);
  addMesh(
    `${bone.split(":")[1]} ${kind}`,
    { vertices, uvs, faces },
    vertices.map(vec),
    vertices.map(() => new Map([[indices.get(bone), 1]])),
    mat,
  );
}

// Bake world-orientation retargeting into ordinary local glTF keyframes.
// Target bind frames follow the MakeHuman limbs; posed frames follow the donor.
// This accounts for the donor's T-pose versus MakeHuman's bent-arm bind pose.
for (const clip of donor
  .getRoot()
  .listAnimations()
  .filter((a) => ["Idle", "Walk", "Run"].includes(a.getName()))) {
  const duration = Math.max(
    ...clip.listSamplers().map((s) => s.getInput().getMax([])[0]),
  );
  const count = Math.ceil(duration * 30),
    times = new Float32Array(count + 1),
    rotations = new Map(names.map((n) => [n, []])),
    positions = [];
  for (let frame = 0; frame <= count; frame++) {
    const time = (duration * frame) / count;
    times[frame] = time;
    sample(clip, time);
    for (const bone of ordered) {
      const s = byName.get(bone.name);
      if (s)
        bone.quaternion.copy(
          bone.parent
            .getWorldQuaternion(new T.Quaternion())
            .invert()
            .multiply(s.getWorldQuaternion(new T.Quaternion())),
        );
      if (bone.name === "mixamorig:Hips") {
        const p = s
          .getWorldPosition(new T.Vector3())
          .sub(sourceHip)
          .multiplyScalar(hipScale)
          .add(targetHip);
        p.x = targetHip.x;
        p.z = targetHip.z; // Locomotion comes from collision-aware gameplay.
        bone.position.copy(bone.parent.worldToLocal(p));
      }
      bone.updateWorldMatrix(true, false);
      rotations.get(bone.name).push(...bone.quaternion.toArray());
    }
    targetRoot.updateMatrixWorld(true);
    const skinMatrices = names.map((n, i) =>
      bones
        .get(n)
        .matrixWorld.clone()
        .multiply(new T.Matrix4().fromArray(matrices, i * 16)),
    );
    let lowest = Infinity;
    for (let i = 0; i < shoes.points.length; i++) {
      const p = new T.Vector3(),
        w = shoes.weights[i];
      for (let j = 0; j < 4; j++)
        if (w.values[j])
          p.addScaledVector(
            shoes.points[i].clone().applyMatrix4(skinMatrices[w.joints[j]]),
            w.values[j],
          );
      lowest = Math.min(lowest, p.y);
    }
    const hips = bones.get("mixamorig:Hips");
    hips.position.y -= lowest;
    positions.push(...hips.position.toArray());
  }
  const output = document.createAnimation(clip.getName()),
    timeAccessor = accessor(`${clip.getName()} time`, "SCALAR", times);
  for (const name of names) {
    if (!byName.has(name)) continue;
    const sampler = document
      .createAnimationSampler()
      .setInput(timeAccessor)
      .setOutput(
        accessor(
          `${clip.getName()} ${name}`,
          "VEC4",
          new Float32Array(rotations.get(name)),
        ),
      )
      .setInterpolation("LINEAR");
    output
      .addSampler(sampler)
      .addChannel(
        document
          .createAnimationChannel()
          .setTargetNode(nodes.get(name))
          .setTargetPath("rotation")
          .setSampler(sampler),
      );
  }
  const sampler = document
    .createAnimationSampler()
    .setInput(timeAccessor)
    .setOutput(
      accessor(`${clip.getName()} hips`, "VEC3", new Float32Array(positions)),
    )
    .setInterpolation("LINEAR");
  output
    .addSampler(sampler)
    .addChannel(
      document
        .createAnimationChannel()
        .setTargetNode(nodes.get("mixamorig:Hips"))
        .setTargetPath("translation")
        .setSampler(sampler),
    );
}
document.getRoot().setExtras({
  provenance:
    "CC0 MakeHuman mesh, targets, rig and clothing; Mixamo locomotion from Three.js Soldier; generated Vesper fabric",
  height: 1.74,
});
// Re-encode color maps for delivery; preserve alpha cards and normal maps.
for (const tex of document.getRoot().listTextures()) {
  const name = tex.getName();
  if (/normal|hair|ponytail|eye|eyelash|eyebrow/i.test(name)) {
    const bytes = await sharp(tex.getImage())
      .resize({
        width: /normal/.test(name) ? 1024 : 1024,
        height: 1024,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    tex.setImage(bytes);
    continue;
  }
  const bytes = await sharp(tex.getImage())
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 91 })
    .toBuffer();
  tex.setImage(bytes).setMimeType("image/jpeg");
}
fs.mkdirSync("public/assets/characters", { recursive: true });
await io.write("public/assets/characters/vesper.glb", document);
console.log(
  "Vesper:",
  triangleCount,
  "triangles",
  fs.statSync("public/assets/characters/vesper.glb").size,
  "bytes",
);
