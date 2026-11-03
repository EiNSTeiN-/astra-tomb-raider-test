import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mergeArchitecture } from "./visuals.js";
import { RoofCamera } from "./roof-camera.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { projectStoneUVs } from "./stone-uv.js";

const SPRING = 7.16,
  SPAN = 6.68;

// Keep the front clerestory open. Later reading wings remain open around the
// older vaulted core; these profiles do not seal or narrow the working floor.
export function crystalWebPlan(stage) {
  const plans = [
    { name: "Sheltered guide porch", end: -1.3, rises: [0.42, 0.46, 0.55] },
    { name: "Descending limestone barrel", rises: [0.78, 0.63, 0.48] },
    { name: "Mirrored nave canopy", rises: [0.68, 0.68, 0.68] },
    { name: "Rising stone canopy", rises: [0.45, 0.65, 0.85] },
    { name: "Violet cloister vault", cloister: true },
    { name: "Broken western canopy", rises: [0.73, 0.59, 0.59], broken: true },
    { name: "Heart crossing canopy", rises: [0.6, 0.83, 0.6], crossing: true },
    { name: "Lantern canopy", rises: [0.92, 0.92, 0.92], lantern: true },
  ];
  const plan = plans[stage];
  if (!plan) throw new RangeError("Unknown crystal vault web");
  return { start: -6.65, end: 5.5, ...plan, stage };
}

function height(plan, x, z) {
  if (plan.cloister)
    return (
      SPRING +
      4.91 *
        Math.sqrt(
          Math.max(0, 1 - (Math.max(Math.abs(x), Math.abs(z)) / SPAN) ** 2),
        )
    );
  const t = Math.max(0, Math.min(1, Math.abs(z) / 6.5));
  let rise =
    plan.rises[1] +
    ((z < 0 ? plan.rises[0] : plan.rises[2]) - plan.rises[1]) * t;
  if (plan.crossing)
    rise = Math.max(rise, 0.83 * Math.sqrt(Math.max(0, 1 - (z / SPAN) ** 2)));
  return SPRING + Math.sqrt(Math.max(0, SPAN * SPAN - x * x)) * rise;
}

// Each cell is a closed curved block. Continuous beds close the narrow dressed
// joints, while deliberate collapsed cells and the lantern aperture stay open.
export function crystalWebCells(stage) {
  const plan = crystalWebPlan(stage),
    count = Math.ceil((plan.end - plan.start) / 1.35);
  const cuts = Array.from(
    { length: count + 1 },
    (_, i) => plan.start + ((plan.end - plan.start) * i) / count,
  );
  if (plan.lantern) cuts.push(-0.5, 0.5);
  cuts.sort((a, b) => a - b);
  const angles = Array.from({ length: 21 }, (_, i) => (Math.PI * i) / 20);
  if (plan.lantern) angles.push(Math.acos(0.5 / SPAN), Math.acos(-0.5 / SPAN));
  angles.sort((a, b) => a - b);
  const cells = [];
  for (let row = 0; row < cuts.length - 1; row++)
    for (let col = 0; col < angles.length - 1; col++) {
      const a0 = angles[col],
        a1 = angles[col + 1],
        z0 = cuts[row],
        z1 = cuts[row + 1];
      const x = SPAN * Math.cos((a0 + a1) / 2),
        z = (z0 + z1) / 2;
      if (plan.lantern && Math.abs(x) < 0.5 && Math.abs(z) < 0.5) continue;
      if (plan.broken && x < -1.25 && z < -1.25 + (col % 3) * 0.55) continue;
      cells.push({ stage, row, col, a0, a1, z0, z1 });
    }
  return cells;
}

export function crystalWebGeometry(cell, dressed = false) {
  const plan = crystalWebPlan(cell.stage),
    gap = dressed ? 0.008 : 0;
  const a0 = cell.a0 + gap / SPAN,
    a1 = cell.a1 - gap / SPAN;
  const z0 = cell.z0 + gap,
    z1 = cell.z1 - gap;
  const low = dressed ? -0.045 : 0.035,
    high = dressed ? 0.23 : 0.16;
  const positions = [],
    colors = [];
  const tone = dressed
    ? 0.91 + ((cell.col * 7 + cell.row * 11 + cell.stage * 3) % 9) * 0.018
    : 0.63;
  const point = (a, z, lift) => {
    const x = SPAN * Math.cos(a);
    return new THREE.Vector3(x, height(plan, x, z) + lift, z);
  };
  const face = (vertices, outward) => {
    for (let i = 1; i < vertices.length - 1; i++) {
      const triangle = [vertices[0], vertices[i], vertices[i + 1]];
      const normal = triangle[1]
        .clone()
        .sub(triangle[0])
        .cross(triangle[2].clone().sub(triangle[0]));
      if (normal.dot(outward) < 0)
        [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      for (const p of triangle) {
        positions.push(p.x, p.y, p.z);
        colors.push(tone, tone, tone);
      }
    }
  };
  for (let segment = 0; segment < 3; segment++) {
    const a = a0 + ((a1 - a0) * segment) / 3,
      b = a0 + ((a1 - a0) * (segment + 1)) / 3;
    const p = [
      point(a, z0, low),
      point(b, z0, low),
      point(b, z1, low),
      point(a, z1, low),
      point(a, z0, high),
      point(b, z0, high),
      point(b, z1, high),
      point(a, z1, high),
    ];
    face([p[0], p[1], p[2], p[3]], new THREE.Vector3(0, -1, 0));
    face([p[4], p[5], p[6], p[7]], new THREE.Vector3(0, 1, 0));
    face([p[0], p[1], p[5], p[4]], new THREE.Vector3(0, 0, -1));
    face([p[3], p[2], p[6], p[7]], new THREE.Vector3(0, 0, 1));
    if (segment === 0)
      face([p[0], p[3], p[7], p[4]], new THREE.Vector3(1, 0, 0));
    if (segment === 2)
      face([p[1], p[2], p[6], p[5]], new THREE.Vector3(-1, 0, 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      new Float32Array((positions.length / 3) * 2),
      2,
    ),
  );
  geometry.computeVertexNormals();
  return projectStoneUVs(geometry);
}

export function buildCrystalWebs(game, gate, materials) {
  const plan = crystalWebPlan(gate.stage),
    root = new THREE.Group(),
    pieces = [];
  root.name = plan.name;
  gate.root.add(root);
  if (!materials.vaultWeb) {
    const material = materials.trim.clone();
    material.name = "Coursed limestone vault webs";
    material.color.setHex(0xb7b7a8);
    material.vertexColors = true;
    material.normalScale.setScalar(0.28);
    material.roughness = 0.89;
    materials.vaultWeb = material;
  }
  const add = (geometry) => {
    const mesh = new THREE.Mesh(geometry, materials.vaultWeb);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    pieces.push(mesh);
    return mesh;
  };
  const cells = crystalWebCells(gate.stage);
  for (const cell of cells) {
    add(crystalWebGeometry(cell));
    add(crystalWebGeometry(cell, true));
  }
  // The existing roof camera index follows the actual upper and lower faces,
  // including the missing cells. One index replaces thousands of tile boxes.
  const cameraGeometry = mergeGeometries(pieces.map((mesh) => mesh.geometry));
  let cameraKernel;
  try {
    cameraKernel = new RoofCamera(cameraGeometry);
  } finally {
    cameraGeometry.dispose();
  }
  // A continuous edge beam beds into the retained cornices and original
  // springing piers where a later reading wing opens the side wall.
  for (const side of [-1, 1]) {
    const length = plan.end - plan.start + 0.32;
    const geometry = stoneBlockGeometry(
      1.08,
      0.24,
      length,
      901 + gate.stage,
      0.006,
    );
    geometry.translate(side * 6.5, 7.12, (plan.start + plan.end) / 2);
    const tone = new Float32Array(geometry.attributes.position.count * 3);
    tone.fill(0.94);
    geometry.setAttribute("color", new THREE.BufferAttribute(tone, 3));
    game.cameraSurfaces?.capture(add(geometry), { small: true, thin: true });
  }
  const feature = { id: `crystal-webs-${gate.stage}` };
  const solid = stationAssemblySolid(game, feature, pieces, {
    bodyPadding: 0.4,
    layeredSupport: true,
  });
  solid.crystalWeb = true;
  mergeArchitecture(root);
  const mesh = root.children[0];
  mesh.userData.cameraKernel = cameraKernel;
  mesh.geometry.addEventListener("dispose", () => cameraKernel.grid.clear());
  game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
  gate.vaultWeb = { root, plan, cells, solid };
  return gate.vaultWeb;
}
