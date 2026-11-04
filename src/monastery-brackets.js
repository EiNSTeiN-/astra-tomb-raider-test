import * as T from "three";
import { geometryFromFaces, PavilionCamera } from "./fitted-facades.js";
import { RoofCamera } from "./roof-camera.js";
import { stationAssemblySolid } from "./field-station-solids.js";

const FORMS = [
  [1.9, 1.55, 0.32, [1, 0.85, 0.61, 0.34, 0.17, 0.12]],
  [2.05, 1.65, 0.3, [1, 0.82, 0.64, 0.46, 0.28, 0.1]],
  [1.7, 1.8, 0.36, [1, 0.67, 0.43, 0.28, 0.19, 0.13]],
  [1.85, 1.4, 0.34, [1, 0.9, 0.72, 0.48, 0.22, 0.11]],
  [1.55, 1.3, 0.4, [1, 0.95, 0.8, 0.58, 0.34, 0.17]],
  [2.15, 1.6, 0.28, [1, 0.76, 0.53, 0.33, 0.19, 0.1]],
  [1.9, 2, 0.34, [1, 0.71, 0.46, 0.29, 0.18, 0.11]],
  [2.2, 1.35, 0.38, [1, 0.92, 0.75, 0.5, 0.27, 0.14]],
  [2.1, 1.85, 0.36, [1, 0.89, 0.68, 0.4, 0.21, 0.12]],
];

export function monasteryBracketPlan(index, family) {
  const [reach, drop, depth, curve] = FORMS[index % 9],
    scale = family === "main" ? 1 : family === "wing" ? 0.82 : 0.7;
  return { reach: reach * scale, drop: drop * scale, depth, curve: [...curve] };
}

function clip(polygon, axis, value, positive) {
  const out = [],
    distance = (p) => (p[axis] - value) * (positive ? 1 : -1);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      d = distance(p),
      e = distance(q);
    if (d >= -1e-9) out.push(p);
    if (d * e < 0) out.push(p.clone().lerp(q, d / (d - e)));
  }
  return out.filter(
    (p, i) => p.distanceToSquared(out[(i + 1) % out.length]) > 1e-14,
  );
}

// The upper faces are clipped from the delivered bearer underside. Each profile
// break also clips those triangles, so neither a curved shoulder nor a chipped
// beam face is replaced by an assumed flat construction plane.
export function monasteryBracketGeometry(bearer, frame, options) {
  const { axis, start, cross, direction, reach, drop, depth, curve } = options,
    transverse = axis === "x" ? "z" : "x",
    p = bearer.geometry.attributes.position,
    ids = bearer.geometry.index,
    faces = [],
    joints = [];
  bearer.updateWorldMatrix(true, false);
  frame.updateWorldMatrix(true, false);
  const matrix = frame.matrixWorld
    .clone()
    .invert()
    .multiply(bearer.matrixWorld);
  for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3()
        .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
        .applyMatrix4(matrix),
    );
    if (new T.Triangle(...v).getNormal(new T.Vector3()).y >= -1e-6) continue;
    let strip = clip(
      clip(v, transverse, cross - depth / 2, true),
      transverse,
      cross + depth / 2,
      false,
    );
    for (let j = 0; j < curve.length - 1 && strip.length; j++) {
      const a = start + (direction * reach * j) / (curve.length - 1),
        b = start + (direction * reach * (j + 1)) / (curve.length - 1),
        cell = clip(
          clip(strip, axis, Math.min(a, b), true),
          axis,
          Math.max(a, b),
          false,
        );
      if (cell.length < 3) continue;
      const top = [...cell]
          .reverse()
          .map((v) => v.clone().add(new T.Vector3(0, 0.006, 0))),
        bottom = top.map((v) => {
          const t = T.MathUtils.clamp((v[axis] - a) / (b - a), 0, 1);
          return v
            .clone()
            .add(
              new T.Vector3(
                0,
                -drop * T.MathUtils.lerp(curve[j], curve[j + 1], t),
                0,
              ),
            );
        });
      for (let k = 1; k < top.length - 1; k++) {
        if (new T.Triangle(top[0], top[k], top[k + 1]).getArea() < 1e-10)
          continue;
        const upper = [top[0], top[k], top[k + 1]],
          lower = [bottom[0], bottom[k], bottom[k + 1]];
        faces.push(upper, [...lower].reverse());
        for (let e = 0; e < 3; e++)
          faces.push([
            upper[e],
            lower[e],
            lower[(e + 1) % 3],
            upper[(e + 1) % 3],
          ]);
        joints.push(
          new T.Triangle(...upper).getMidpoint(new T.Vector3()).toArray(),
        );
      }
    }
  }
  if (!faces.length) throw Error("Missing bracket bearer");
  return { geometry: geometryFromFaces(faces), joints };
}

function bounds(mesh, parent) {
  mesh.updateWorldMatrix(true, false);
  parent.updateWorldMatrix(true, false);
  return new T.Box3()
    .setFromBufferAttribute(mesh.geometry.attributes.position)
    .applyMatrix4(
      parent.matrixWorld.clone().invert().multiply(mesh.matrixWorld),
    );
}

export function buildMonasteryBrackets(
  game,
  parent,
  index,
  posts,
  wings,
  wood,
) {
  const records = [],
    meshes = [],
    cameras = [],
    box = new T.Box3();
  const available = [],
    temporary = [];
  for (const wing of wings)
    for (const geometry of wing.bracketBearers) {
      const mesh = new T.Mesh(geometry, wood);
      mesh.name = "Bearing floor joist";
      wing.root.add(mesh);
      temporary.push(mesh);
    }
  parent.traverse((m) => {
    if (
      m.isMesh &&
      [
        "Pavilion cross bearer",
        "Pavilion depth bearer",
        "Bearing floor joist",
        "Cloister longitudinal beam",
      ].includes(m.name)
    )
      available.push({ mesh: m, box: bounds(m, parent) });
  });
  const add = (post, axis, direction, family) => {
    const plan = monasteryBracketPlan(index, family),
      transverse = axis === "x" ? "z" : "x",
      start = post[axis],
      cross = post[transverse],
      candidates = available.filter(
        ({ box: b }) =>
          b.min[axis] <=
            Math.min(start, start + direction * plan.reach) + 0.01 &&
          b.max[axis] >=
            Math.max(start, start + direction * plan.reach) - 0.01 &&
          cross >= b.min[transverse] - 0.5 &&
          cross <= b.max[transverse] + 0.5 &&
          Math.abs(b.min.y - post.top) < 0.9,
      );
    candidates.sort(
      (a, b) =>
        Math.abs(a.box.min.y - post.top) - Math.abs(b.box.min.y - post.top),
    );
    const target = candidates[0];
    if (!target)
      throw Error(
        `No ${family} bearer at ${post.x},${post.z},${axis},${direction}`,
      );
    const width = target.box.max[transverse] - target.box.min[transverse],
      depth = Math.min(plan.depth, width - 0.08),
      center = T.MathUtils.clamp(
        cross,
        target.box.min[transverse] + depth / 2 + 0.025,
        target.box.max[transverse] - depth / 2 - 0.025,
      ),
      options = { ...plan, depth, axis, direction, start, cross: center },
      model = monasteryBracketGeometry(target.mesh, parent, options),
      mesh = new T.Mesh(model.geometry, wood),
      id = records.length + 1;
    mesh.name = "Beam-fitted monastery bracket";
    mesh.castShadow = mesh.receiveShadow = true;
    const p = mesh.geometry.attributes.position,
      colors = [];
    for (let i = 0; i < p.count; i++) {
      const shade =
        0.91 +
        0.075 *
          Math.sin(p.getX(i) * 0.83 + p.getY(i) * 0.29 + p.getZ(i) * 0.53);
      colors.push(shade, shade, shade);
    }
    mesh.geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(colors, 3),
    );
    mesh.geometry.setAttribute(
      "monasteryBracket",
      new T.Float32BufferAttribute(new Float32Array(p.count).fill(id), 1),
    );
    parent.add(mesh);
    meshes.push(mesh);
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
    cameras.push({
      box: mesh.geometry.boundingBox.clone(),
      inverse: new T.Matrix4(),
      kernel: new RoofCamera(mesh.geometry),
    });
    records.push({
      id,
      family,
      post: { ...post },
      options,
      joints: model.joints,
    });
  };
  try {
    for (const post of posts) {
      if (post.top > 10) {
        add(post, "x", -Math.sign(post.x), "main");
        add(post, "z", post.z < -18 ? 1 : -1, "main");
      } else if (post.z < -10)
        add(post, "x", Math.sign(Math.sign(post.x) * 13.35 - post.x), "wing");
      else {
        add(post, "z", -1, "gallery");
        if (post.z < 18) add(post, "z", 1, "gallery");
      }
    }
  } finally {
    for (const mesh of temporary) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    for (const wing of wings) delete wing.bracketBearers;
  }
  const solid = stationAssemblySolid(
    game,
    { id: `monastery-brackets-${index}` },
    meshes,
    { bodyPadding: 0.55, supportRadius: 0, bodySupport: false },
  );
  solid.roofTimber = true;
  const size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3()),
    proxy = new T.Mesh(
      new T.BoxGeometry(size.x, size.y, size.z).translate(
        center.x,
        center.y,
        center.z,
      ),
      wood,
    );
  parent.add(proxy);
  game.cameraSurfaces?.capture(proxy, {
    kernel: new PavilionCamera(cameras),
    small: true,
    thin: true,
  });
  parent.remove(proxy);
  proxy.geometry.dispose();
  return { records, solid };
}
