import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { crownPrism } from "./desert-crowns.js";
import { projectStoneUVs } from "./stone-uv.js";

const rect = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h],
  [x - w / 2, y + h],
];
const circle = (x, y, r, n = 32) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  });
const arch = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  ...Array.from({ length: 17 }, (_, i) => {
    const a = (i * Math.PI) / 16;
    return [x + (Math.cos(a) * w) / 2, y + h - w / 2 + (Math.sin(a) * w) / 2];
  }),
];

// Architectural records accompany the bell lessons; they add no new code or
// sequence for the player to memorize. The two leaves form a mirrored pair.
export function monasteryDoorPlan(stage, side) {
  const pockets = [],
    marks = [];
  let name;
  switch (stage) {
    case 0:
      name = "Pilgrim portals";
      for (const x of [-1.35, 1.35]) {
        pockets.push(arch(x, 1.0, 1.95, 5.38));
        marks.push(rect(x, 1.65, 1.35, 0.12), rect(x, 4.65, 1.35, 0.12));
      }
      break;
    case 1:
      name = "Valley bells";
      pockets.push([
        [-2.42, 1.25],
        [2.42, 1.25],
        [2.42, 1.68],
        [1.62, 2.22],
        [1.38, 4.8],
        [0.86, 5.55],
        [0.42, 5.88],
        [0.42, 6.38],
        [-0.42, 6.38],
        [-0.42, 5.88],
        [-0.86, 5.55],
        [-1.38, 4.8],
        [-1.62, 2.22],
        [-2.42, 1.68],
      ]);
      marks.push(
        rect(0, 1.62, 3.8, 0.13),
        rect(0, 4.45, 2.22, 0.11),
        circle(0, 2.15, 0.2),
      );
      break;
    case 2:
      name = "Prayer records";
      for (const x of [-1.3, 1.3])
        for (const y of [1.0, 2.94, 4.88]) {
          pockets.push(rect(x, y, 2.08, 1.5));
          marks.push(
            rect(x, y + 0.69, 1.25, 0.12),
            rect(x - 0.38, y + 0.38, 0.11, 0.72),
            rect(x + 0.38, y + 0.38, 0.11, 0.72),
          );
        }
      break;
    case 3:
      name = "Pilgrim stair";
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 1.22,
          h = 3.3 + (1.5 - side * (i - 1.5)) * 0.66;
        pockets.push(rect(x, 1.0, 0.86, h));
        for (let y = 1.6; y < h + 0.55; y += 0.75)
          marks.push(rect(x, y, 0.57, 0.09));
      }
      break;
    case 4:
      name = "Wheel of memory";
      pockets.push(circle(0, 3.7, 2.3, 48));
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          b = a + 0.16;
        marks.push([
          [Math.cos(a) * 0.8, 3.7 + Math.sin(a) * 0.8],
          [Math.cos(a) * 1.96, 3.7 + Math.sin(a) * 1.96],
          [Math.cos(b) * 1.96, 3.7 + Math.sin(b) * 1.96],
          [Math.cos(b) * 0.8, 3.7 + Math.sin(b) * 0.8],
        ]);
      }
      marks.push(circle(0, 3.7, 0.36));
      break;
    case 5:
      name = "Woven wind";
      for (const x of [-1.28, 1.28])
        for (const y of [2.15, 5.12]) {
          pockets.push([
            [x - 1.0, y],
            [x, y - 1.2],
            [x + 1.0, y],
            [x, y + 1.2],
          ]);
          marks.push(
            rect(x, y - 0.52, 0.12, 1.04),
            rect(x, y - 0.06, 0.82, 0.12),
          );
        }
      break;
    case 6:
      name = "Summit light";
      pockets.push([
        [-2.28, 2.95],
        [2.28, 2.95],
        ...Array.from({ length: 25 }, (_, i) => {
          const a = (i * Math.PI) / 24;
          return [2.28 * Math.cos(a), 3.0 + 3.28 * Math.sin(a)];
        }),
      ]);
      pockets.push(rect(0, 1.0, 4.78, 1.28));
      for (let i = 0; i < 7; i++) {
        const a = ((i + 0.5) * Math.PI) / 7,
          b = a + 0.055;
        marks.push([
          [Math.cos(a) * 0.64, 3.12 + Math.sin(a) * 0.64],
          [Math.cos(a) * 2.0, 3.12 + Math.sin(a) * 2.65],
          [Math.cos(b) * 2.0, 3.12 + Math.sin(b) * 2.65],
          [Math.cos(b) * 0.64, 3.12 + Math.sin(b) * 0.64],
        ]);
      }
      marks.push(rect(0, 1.57, 3.85, 0.12));
      break;
    case 7:
      name = "Silent library";
      for (let i = 0; i < 5; i++) {
        const x = i - 2;
        pockets.push(arch(x, 1.0, 0.64, 5.38 - Math.abs(i - 2) * 0.24));
        for (const y of [1.7, 2.12, 4.35, 4.77])
          marks.push(rect(x, y, 0.46, 0.08));
      }
      break;
    default:
      throw new RangeError(`Unknown monastery door ${stage}`);
  }
  return { name, pockets, marks, pullPocket: circle(-side * 2.64, 3.45, 0.29) };
}

function prism(points, depth, holes = []) {
  if (!holes.length) return crownPrism(points, depth, [], 0);
  // Seal each triangulated cell, including collinear hole bridges, so thin
  // returns and the broad facing share exactly the same cap boundary.
  const outer = points.map((p) => new THREE.Vector2(...p)),
    rings = holes.map((r) => r.map((p) => new THREE.Vector2(...p))),
    vertices = [...outer, ...rings.flat()],
    faces = THREE.ShapeUtils.triangulateShape(outer, rings).filter(
      ([a, b, c]) =>
        Math.abs(
          vertices[b]
            .clone()
            .sub(vertices[a])
            .cross(vertices[c].clone().sub(vertices[a])),
        ) > 1e-10,
    ),
    cells = faces.map((face) =>
      crownPrism(
        face.map((i) => vertices[i].toArray()),
        depth,
        [],
        0,
      ),
    ),
    geometry = mergeGeometries(cells, false);
  cells.forEach((g) => g.dispose());
  return geometry;
}

export function buildMonasteryDoor({
  gate,
  leaf,
  detail,
  side,
  cx,
  materials: m,
}) {
  const plan = monasteryDoorPlan(gate.stage, side),
    parts = [];
  if (!m.monasteryDoorPaint) {
    m.monasteryDoorPaint = m.wood.clone();
    m.monasteryDoorPaint.name = "Weathered red ochre door timber";
    m.monasteryDoorPaint.color.setHex(0x985d4d);
    m.monasteryDoorPaint.roughness = 0.8;
    m.monasteryDoorPaint.normalScale.set(0.3, 0.3);
  }
  let face = 1;
  const add = (geometry, material, kind, fine = false) => {
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    projectStoneUVs(geometry);
    const matrix = new THREE.Matrix4().makeRotationY(face < 0 ? Math.PI : 0);
    matrix.setPosition(cx, 0, 0);
    geometry.applyMatrix4(matrix);
    const id = parts.length;
    geometry.setAttribute(
      "monasteryDoorPart",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(id),
        1,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    (fine ? detail : leaf).add(mesh);
    parts.push({ id, kind, face, fine });
    return mesh;
  };
  const slab = (points, z, depth, material, kind, holes = []) => {
    const geometry = prism(points, depth, holes);
    geometry.translate(0, 0, z);
    return add(geometry, material, kind);
  };
  const box = (x, y, z, w, h, d, material, kind) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    return add(geometry, material, kind);
  };
  box(0, 3.7, 0, 6.15, 7.4, 0.3, m.wood, "continuous timber core");
  for (face of [1, -1]) {
    slab(
      rect(0, 0.12, 6.0, 7.16),
      0.211,
      0.132,
      m.monasteryDoorPaint,
      "recessed painted facing",
      [...plan.pockets, plan.pullPocket.map(([x, y]) => [x * face, y])],
    );
    for (const pocket of plan.pockets)
      slab(pocket, 0.155, 0.02, m.chamberInset, "chalk panel back");
    for (const mark of plan.marks)
      slab(mark, 0.1725, 0.035, m.metal, "seated bronze record");
    for (const x of [-3, 3])
      box(x, 3.7, 0.235, 0.13, 7.16, 0.1, m.wood, "door stile");
    for (const y of [0.28, 6.99])
      box(0, y, 0.235, 5.83, 0.24, 0.1, m.wood, "door rail");
    for (const y of [0.66, 6.65])
      box(0, y, 0.273, 5.55, 0.07, 0.025, m.metal, "bronze border");
    // Reverse-face geometry flips X; keep both pulls beside the meeting edge.
    const hx = -side * 2.64 * face;
    for (const y of [3.2, 3.7])
      box(hx, y, 0.22, 0.18, 0.13, 0.15, m.metal, "pull bearing");
    const grip = new THREE.TorusGeometry(0.23, 0.035, 8, 32);
    grip.translate(hx, 3.45, 0.26);
    add(grip, m.metal, "ring pull");
    for (const x of [-3, 3])
      for (const y of [0.78, 2.28, 5.12, 6.62]) {
        const pin = new THREE.CylinderGeometry(0.052, 0.052, 0.035, 12);
        pin.rotateX(Math.PI / 2);
        pin.translate(x, y, 0.276);
        add(pin, m.metal, "stile fastener", true);
      }
  }
  return (leaf.userData.monasteryDoor = { name: plan.name, faces: 2, parts });
}
