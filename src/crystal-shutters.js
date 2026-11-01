import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { projectStoneUVs } from "./stone-uv.js";

const rectangle = (x, y, w, h, cut = 0.09) => [
  [x - w / 2 + cut, y],
  [x + w / 2 - cut, y],
  [x + w / 2, y + cut],
  [x + w / 2, y + h - cut],
  [x + w / 2 - cut, y + h],
  [x - w / 2 + cut, y + h],
  [x - w / 2, y + h - cut],
  [x - w / 2, y + cut],
];
const lancet = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h * 0.72],
  [x, y + h],
  [x - w / 2, y + h * 0.72],
];
const lens = (x, y, w, h) =>
  Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return [x + (Math.cos(a) * w) / 2, y + (Math.sin(a) * h) / 2];
  });

// These are architectural motifs, not an additional numeric puzzle. Each pair
// is carved on both faces of the existing descending shutter and uses its drive.
export function crystalShutterPlan(stage, side) {
  const pockets = [],
    braces = [],
    stones = [];
  let name;
  switch (stage) {
    case 0:
      name = "Guide-light niches";
      for (const x of [-1.85, 0, 1.85]) {
        pockets.push(lancet(x, 1.05, 1.22, 4.9));
        stones.push([x, 4.25, 0.18, 0.58]);
        braces.push([x, 3.42, 0.85, 0.11]);
      }
      break;
    case 1:
      name = "Descending echo registers";
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 1.82,
          top = 6.45 - (side * 3.1 + x + 6) * 0.32;
        pockets.push(rectangle(x, 0.94, 1.38, top - 0.94));
        if (6.52 - top - 0.42 > 0.4)
          pockets.push(rectangle(x, top + 0.42, 1.38, 6.52 - top - 0.42));
        for (let y = 1.35; y < top - 0.25; y += 0.69)
          braces.push([x, y, 1.08, 0.095]);
      }
      break;
    case 2:
      name = "Mirrored archive lenses";
      for (const x of [-1.32, 1.32]) {
        pockets.push(lancet(x, 0.94, 1.95, 5.58));
        stones.push([x, 3.75, 0.31, 1.05]);
        braces.push([x, 2.24, 1.48, 0.13], [x, 5.14, 1.48, 0.13]);
      }
      break;
    case 3:
      name = "Ascending stone flutes";
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 0.75,
          h = 2.9 + (side * 3.1 + x + 6) * 0.24;
        pockets.push(rectangle(x, 0.96, 0.4, h, 0.06));
        braces.push([x, 0.91, 0.55, 0.16], [x, 1.02 + h, 0.55, 0.16]);
      }
      break;
    case 4:
      name = "Counterpoint fan";
      for (let i = 0; i < 7; i++) {
        const a = ((17 + i * 21) * Math.PI) / 180,
          b = ((31 + i * 21) * Math.PI) / 180;
        pockets.push([
          [Math.cos(a) * 0.78, 2.35 + Math.sin(a) * 0.78],
          [Math.cos(a) * 2.59, 2.35 + Math.sin(a) * 3.95],
          [Math.cos(b) * 2.59, 2.35 + Math.sin(b) * 3.95],
          [Math.cos(b) * 0.78, 2.35 + Math.sin(b) * 0.78],
        ]);
      }
      pockets.push(rectangle(0, 0.92, 3.9, 0.72));
      stones.push([0, 2.3, 0.3, 0.43]);
      break;
    case 5:
      name = "Cramped archive fragments";
      pockets.push(
        [
          [-2.5, 0.98],
          [-0.35, 0.98],
          [-0.69, 2.58],
          [-2.5, 2.78],
        ],
        [
          [0.03, 0.98],
          [2.47, 0.98],
          [2.47, 2.28],
          [0.4, 2.57],
        ],
        [
          [-2.5, 3.12],
          [-0.78, 2.99],
          [-0.31, 4.25],
          [-2.5, 4.79],
        ],
        [
          [0.32, 2.99],
          [2.47, 2.71],
          [2.47, 5.18],
          [0.75, 4.61],
        ],
        [
          [-2.5, 5.21],
          [-0.11, 4.68],
          [0.43, 5.08],
          [2.47, 5.62],
          [2.47, 6.5],
          [-2.5, 6.5],
        ],
      );
      braces.push(
        [-0.14, 2.85, 1.03, 0.15],
        [-0.02, 4.54, 1.08, 0.15],
        [-1.55, 4.98, 0.63, 0.14],
        [1.65, 5.39, 0.63, 0.14],
      );
      break;
    case 6:
      name = "Paired-voice mandorlas";
      for (const x of [-1.3, 1.3]) {
        pockets.push(lens(x, 3.7, 1.94, 5.54));
        stones.push([x, 3.7, 0.22, 0.68]);
        for (const y of [2.1, 5.3]) braces.push([x, y, 0.85, 0.11]);
      }
      break;
    case 7:
      name = "Prism-path meander";
      pockets.push([
        [-2.5, 0.96],
        [2.48, 0.96],
        [2.48, 6.5],
        [-2.5, 6.5],
        [-2.5, 2.06],
        [1.22, 2.06],
        [1.22, 5.22],
        [-1.24, 5.22],
        [-1.24, 3.22],
        [0.05, 3.22],
        [0.05, 4.17],
        [-0.25, 4.17],
        [-0.25, 4.46],
        [0.48, 4.46],
        [0.48, 2.78],
        [-1.72, 2.78],
        [-1.72, 5.72],
        [1.72, 5.72],
        [1.72, 1.56],
        [-2.5, 1.56],
      ]);
      stones.push([-0.35, 3.76, 0.14, 0.3]);
      break;
    default:
      throw new RangeError("Unknown crystal shutter");
  }
  return { name, stage, pockets, braces, stones };
}

function shape(outline, holes = []) {
  const result = new THREE.Shape(
    outline.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  for (const points of holes)
    result.holes.push(
      new THREE.Path(points.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  return result;
}
function slab(outline, holes, back, depth, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape(outline, holes), {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, back);
  return projectStoneUVs(geometry);
}

// Broad recessed stone is visible at distance; the small metal lips, cramps and
// cradles share the existing detail cull. Every pocket has a closed, seated back.
export function buildCrystalShutter({
  gate,
  leaf,
  detail,
  side,
  cx,
  materials: m,
}) {
  const plan = crystalShutterPlan(gate.stage, side);
  let seed = 63917 + gate.stage * 397 + side * 31;
  for (const face of [1, -1]) {
    const transform = new THREE.Matrix4().makeRotationY(
      face === 1 ? 0 : Math.PI,
    );
    transform.setPosition(cx, 0, 0);
    const add = (geometry, material, fine = false) => {
      geometry.applyMatrix4(transform);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      (fine ? detail : leaf).add(mesh);
      return mesh;
    };
    const block = (w, h, d, x, y, z, material, fine = false) => {
      const geometry = stoneBlockGeometry(w, h, d, ++seed, 0.018);
      geometry.translate(x, y, z);
      return add(geometry, material, fine);
    };
    add(
      slab(rectangle(0, 0.15, 6.02, 7.1, 0.12), plan.pockets, 0.22, 0.2, 0.016),
      m.wall,
    );
    for (const pocket of plan.pockets) {
      add(slab(pocket, [], 0.22, 0.055), m.dark);
      // Joined strips follow concave channels as well as convex coffers. Each
      // strip overlaps the carved return; a scaled inner contour would cross
      // the narrow turns of the prism meander.
      for (let i = 0; i < pocket.length; i++) {
        const a = pocket[i],
          b = pocket[(i + 1) % pocket.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1];
        const lip = stoneBlockGeometry(
          Math.hypot(dx, dy) + 0.04,
          0.06,
          0.03,
          ++seed,
          0.005,
        );
        lip.rotateZ(Math.atan2(dy, dx));
        lip.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.433);
        add(lip, m.metal, true);
      }
    }
    for (const [x, y, w, h] of plan.braces) {
      const raised = [3, 5].includes(gate.stage),
        z = raised ? 0.44 : 0.33;
      block(w, h, 0.12, x, y, z, m.metal, true);
      for (const dx of [-w * 0.34, w * 0.34]) {
        const pin = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8);
        pin.rotateX(Math.PI / 2);
        pin.translate(x + dx, y, raised ? 0.51 : 0.42);
        add(pin, m.metal, true);
      }
    }
    for (const [x, y, w, h] of plan.stones) {
      block(w * 2.8, 0.15, 0.18, x, y - h * 0.55, 0.31, m.metal, true);
      const gem = new THREE.OctahedronGeometry(1, 0);
      gem.scale(w, h, 0.12);
      gem.translate(x, y, 0.34);
      add(gem, m.inlay, true);
    }
    for (const yy of [0.48, 6.92]) {
      block(5.76, 0.17, 0.13, 0, yy, 0.46, m.trim);
      for (const xx of [-2.55, 2.55])
        block(0.16, 0.34, 0.11, xx, yy, 0.49, m.metal, true);
    }
    for (const xx of [-2.8, 2.8]) block(0.12, 6.2, 0.1, xx, 3.7, 0.45, m.trim);
  }
  leaf.userData.crystalShutter = {
    name: plan.name,
    coffers: plan.pockets.length,
    faces: 2,
  };
  return leaf.userData.crystalShutter;
}
