import * as THREE from "three";
import { pbrMaterial } from "./visuals.js";
import { weatherDesertStone } from "./desert-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { footprintMinimum } from "./masonry-foundations.js";

export function solarInstrumentMaterials(game) {
  const stone = game?.stoneMat?.clone() || pbrMaterial("sandstone", 0xd6c3a3),
    bronze = patinatedBronze();
  stone.name = "Solar bearing sandstone";
  stone.color.setHex(0xd6c3a3);
  stone.normalScale.set(0.35, 0.35);
  weatherDesertStone(stone);
  bronze.name = "Weathered solar castings";
  bronze.color.setHex(0xb49658);
  bronze.roughness = 0.45;
  return { stone, bronze };
}

// Closed turned castings retain metre-scaled side UVs. Flat ends use their
// actual X/Z coordinates, so the caps do not collapse into texture stripes.
export function solarCastingGeometry(profile, segments = 32) {
  const source = new THREE.LatheGeometry(
      profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
      segments,
    ),
    geometry = source.toNonIndexed(),
    positions = geometry.attributes.position,
    uv = geometry.attributes.uv,
    radius = Math.max(...profile.map((p) => p[0]));
  source.dispose();
  for (let i = 0; i < positions.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, i),
      b = new THREE.Vector3().fromBufferAttribute(positions, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(positions, i + 2),
      normal = b.sub(a).cross(c.sub(a));
    const flat =
      Math.abs(normal.y) > 1e-10 &&
      Math.hypot(normal.x, normal.z) < Math.abs(normal.y) * 1e-6;
    for (let j = i; j < i + 3; j++)
      uv.setXY(
        j,
        flat ? positions.getX(j) / 2 : uv.getX(j) * Math.PI * radius,
        flat ? positions.getZ(j) / 2 : positions.getY(j) / 2,
      );
  }
  geometry.computeBoundingBox();
  geometry.userData.solarCasting = true;
  return geometry;
}

function chamferPath(width, height, bevel, path = new THREE.Shape()) {
  const x = width / 2,
    y = height / 2;
  path.moveTo(-x + bevel, -y);
  path.lineTo(x - bevel, -y);
  path.lineTo(x, -y + bevel);
  path.lineTo(x, y - bevel);
  path.lineTo(x - bevel, y);
  path.lineTo(-x + bevel, y);
  path.lineTo(-x, y - bevel);
  path.lineTo(-x, -y + bevel);
  path.closePath();
  return path;
}

export function solarPlateGeometry(width, height, depth, opening = null) {
  const shape = chamferPath(width, height, 0.035);
  if (opening)
    shape.holes.push(
      chamferPath(opening[0], opening[1], 0.015, new THREE.Path()),
    );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function part(game, parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  game.cameraSurfaces?.capture(mesh, {
    small:
      geometry.userData.solarCasting ||
      (parent.userData.cameraDynamic && parent.name === "Guided solar shutter"),
    cylinderAxis: geometry.userData.solarCasting ? "y" : null,
  });
  return mesh;
}

export function addSolarPedestal(game, group, height, materials, kind) {
  const radius = kind === "mirror" ? 0.83 : 1.02,
    position = group.getWorldPosition(new THREE.Vector3()),
    bottom =
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        position.x,
        position.z,
        radius * 2,
        radius * 2,
        game.terrainProfile?.step,
      ) -
      position.y -
      0.18,
    top = kind === "mirror" ? 0.45 : 0.5;
  part(
    game,
    group,
    solarCastingGeometry([
      [0, bottom],
      [radius, bottom],
      [radius, 0.045],
      [radius * 0.92, 0.1],
      [radius * 0.92, top - 0.12],
      [radius * 0.8, top - 0.035],
      [radius * 0.8, top],
      [0, top],
    ]),
    materials.stone,
    0,
    0,
    0,
  );
  const casting = (profile, material = materials.bronze) =>
    part(game, group, solarCastingGeometry(profile), material, 0, 0, 0);
  casting([
    [0, top - 0.015],
    [radius * 0.77, top - 0.015],
    [radius * 0.77, top + 0.06],
    [radius * 0.6, top + 0.12],
    [0, top + 0.12],
  ]);
  if (kind === "mirror") {
    casting(
      [
        [0, 0.54],
        [0.52, 0.54],
        [0.49, 0.62],
        [0.39, 0.88],
        [0, 0.88],
      ],
      materials.stone,
    );
    const shaftTop = height - 0.97;
    casting([
      [0, 0.6],
      [0.25, 0.6],
      [0.25, 0.72],
      [0.21, 1.24],
      [0.18, 1.31],
      [0.18, shaftTop],
      [0, shaftTop],
    ]);
    casting([
      [0, height - 1.12],
      [0.24, height - 1.12],
      [0.29, height - 1.07],
      [0.29, height - 0.985],
      [0.24, height - 0.94],
      [0, height - 0.94],
    ]);
  } else {
    casting(
      [
        [0, 0.53],
        [0.56, 0.53],
        [0.54, 0.68],
        [0.39, height - 0.91],
        [0.39, height - 0.8],
        [0, height - 0.8],
      ],
      materials.stone,
    );
    casting([
      [0, height - 0.86],
      [0.43, height - 0.86],
      [0.45, height - 0.81],
      [0.45, height - 0.73],
      [0.36, height - 0.7],
      [0, height - 0.7],
    ]);
    for (const y of [0.72, (height - 0.8 + 0.72) / 2]) {
      const t = (y - 0.68) / (height - 0.91 - 0.68),
        r = THREE.MathUtils.lerp(0.54, 0.39, t);
      casting([
        [0, y - 0.025],
        [r + 0.015, y - 0.025],
        [r + 0.015, y + 0.025],
        [0, y + 0.025],
      ]);
    }
  }
  return {
    x: position.x,
    z: position.z,
    bottom: position.y + bottom,
    radius,
    kind,
    height,
  };
}

export function addSolarReflectorFrame(game, pivot, bronze, stage) {
  part(
    game,
    pivot,
    solarPlateGeometry(2.03, 1.864, 0.144, [1.75, 1.49]),
    bronze,
    0,
    0,
    0,
  );
  part(game, pivot, solarPlateGeometry(1.95, 1.76, 0.064), bronze, 0, 0, -0.06);
  for (const x of [-0.38, 0.38])
    part(
      game,
      pivot,
      solarPlateGeometry(0.085, 1.62, 0.024),
      bronze,
      x,
      0,
      -0.104,
    );
  for (const [r, tube] of [
    [0.43, 0.018],
    [0.28, 0.014],
  ])
    part(
      game,
      pivot,
      new THREE.TorusGeometry(r, tube, 6, 40),
      bronze,
      0,
      0,
      -0.108,
    );
  const rays = 12 + (stage % 3) * 2;
  for (let i = 0; i < rays; i++) {
    const angle = (i * Math.PI * 2) / rays,
      ray = part(
        game,
        pivot,
        solarPlateGeometry(0.045, 0.115, 0.014),
        bronze,
        Math.sin(angle) * 0.51,
        Math.cos(angle) * 0.51,
        -0.105,
      );
    ray.rotation.z = -angle;
  }
  for (const x of [-0.95, 0.95])
    for (const y of [-0.865, 0.865])
      part(
        game,
        pivot,
        new THREE.SphereGeometry(0.025, 8, 6),
        bronze,
        x,
        y,
        0.074,
      );
}

export function addSolarLabelMount(game, group, bronze) {
  const plate = part(
    game,
    group,
    solarPlateGeometry(0.49, 0.49, 0.049),
    bronze,
    0.558,
    0.68,
    0,
  );
  plate.rotation.y = Math.PI / 2;
  game.box(0.11, 0.2, 0.12, bronze, 0.483, 0.68, 0, group);
}

export function addSolarConsole(game, group, materials) {
  const position = group.getWorldPosition(new THREE.Vector3()),
    bottom =
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        position.x,
        position.z,
        0.76,
        0.76,
        game.terrainProfile?.step,
      ) -
      position.y -
      0.18,
    base = part(
      game,
      group,
      solarCastingGeometry([
        [0, bottom],
        [0.38, bottom],
        [0.38, 0.055],
        [0.33, 0.13],
        [0.28, 0.74],
        [0.29, 0.8],
        [0, 0.8],
      ]),
      materials.stone,
      0,
      0,
      0,
    ),
    crown = part(
      game,
      group,
      solarCastingGeometry([
        [0, 0.76],
        [0.3, 0.76],
        [0.33, 0.79],
        [0.33, 0.86],
        [0.31, 0.9],
        [0, 0.9],
      ]),
      materials.bronze,
      0,
      0,
      0,
    );
  return {
    meshes: [base, crown],
    footing: {
      x: position.x,
      z: position.z,
      bottom: position.y + bottom,
      radius: 0.38,
      kind: "console",
      height: 0.9,
    },
  };
}

export function addSolarSunSeal(group, material) {
  const seal = new THREE.Group(),
    ring = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.112, 32), material),
    positions = [];
  ring.rotation.x = -Math.PI / 2;
  seal.add(ring);
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6,
      points = [
        [0.13, angle - 0.045],
        [0.195, angle - 0.045],
        [0.195, angle + 0.045],
        [0.13, angle + 0.045],
      ].map(([r, a]) => [Math.cos(a) * r, 0, Math.sin(a) * r]);
    for (const index of [0, 2, 1, 0, 3, 2]) positions.push(...points[index]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  seal.add(new THREE.Mesh(geometry, material));
  seal.position.y = 0.901;
  group.add(seal);
  return seal;
}

export function addSolarShutter(game, group, height, materials) {
  for (const z of [-0.79, 0.79])
    game.box(
      0.14,
      3.37,
      0.1,
      materials.bronze,
      -0.38,
      height + 0.905,
      z,
      group,
    );
  for (const y of [height - 0.8, height + 2.59])
    game.box(0.14, 0.16, 1.74, materials.bronze, -0.38, y, 0, group);
  const shutter = new THREE.Group();
  shutter.name = "Guided solar shutter";
  shutter.userData.cameraDynamic = true;
  shutter.position.set(-0.32, height, 0);
  group.add(shutter);
  const plate = part(
    game,
    shutter,
    solarPlateGeometry(1.48, 1.48, 0.184),
    materials.stone,
    0,
    0,
    0,
  );
  plate.rotation.y = Math.PI / 2;
  for (const y of [-0.52, 0.52])
    game.box(0.21, 0.08, 1.48, materials.bronze, 0, y, 0, shutter);
  return shutter;
}
