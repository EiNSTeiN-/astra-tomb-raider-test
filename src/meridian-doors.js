import * as THREE from "three";
import { projectStoneUVs } from "./stone-uv.js";
import { meridianDoorPlan } from "./meridian-door-plan.js";

const outline = [
  [-2.9, 0.1],
  [2.9, 0.1],
  [3.01, 0.21],
  [3.01, 7.19],
  [2.9, 7.3],
  [-2.9, 7.3],
  [-3.01, 7.19],
  [-3.01, 0.21],
];
function slab(points, holes, z, depth, bevel = 0) {
  const shape = new THREE.Shape(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  for (const p of holes)
    shape.holes.push(
      new THREE.Path(p.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, z);
  return g;
}

// Both faces are seated on the existing structural core. Recess backs overlap
// the core, and all medallions enter those backs or the bronze face plate.
export function buildMeridianDoor({
  gate,
  leaf,
  detail,
  side,
  cx,
  materials: m,
}) {
  const plan = meridianDoorPlan(gate.stage, side);
  for (const face of [1, -1]) {
    const transform = new THREE.Matrix4().makeRotationY(
      face === 1 ? 0 : Math.PI,
    );
    // Rear ornament stays shallow outside the .24 m structural half-depth.
    // Its .31 m reach fits the existing folded-leaf pocket behind the deep
    // exterior blind bays; the front retains the complete relief depth.
    if (face < 0) transform.scale(new THREE.Vector3(1, 1, 0.25));
    transform.setPosition(cx, 0, face < 0 ? -0.18 : 0);
    const add = (g, material, fine = false) => {
      g.applyMatrix4(transform);
      // Project after the rear depth fit so its short returns keep the same
      // physical texture scale as the broad faces.
      if (!g.index) projectStoneUVs(g);
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = mesh.receiveShadow = true;
      (fine ? detail : leaf).add(mesh);
      return mesh;
    };
    const block = (x, y, z, w, h, d, material, fine = false) => {
      const box = new THREE.BoxGeometry(w, h, d),
        g = box.toNonIndexed();
      box.dispose();
      g.translate(x, y, z);
      return add(g, material, fine);
    };
    add(slab(outline, plan.pockets, 0.22, 0.14, 0.018), m.metal);
    for (const pocket of plan.pockets)
      add(slab(pocket, [], 0.233, 0.04), m.dark);
    for (const stone of plan.stones) {
      add(
        slab(stone.points, [], stone.raised ? 0.345 : 0.255, 0.095, 0.01),
        m.trim,
      );
    }
    for (const [x, y, radius] of plan.pins) {
      const g = new THREE.CylinderGeometry(radius, radius, 0.075, 12);
      const z = [1, 8].includes(gate.stage)
        ? 0.47
        : [3, 6].includes(gate.stage)
          ? 0.39
          : 0.294;
      g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      add(g, m.inlay);
    }
    for (const x of [-2.81, 2.81]) {
      block(x, 3.7, 0.386, 0.1, 6.8, 0.075, m.trim);
      for (const y of [0.85, 2.65, 4.75, 6.55]) {
        const g = new THREE.CylinderGeometry(0.067, 0.067, 0.07, 6);
        g.rotateX(Math.PI / 2);
        g.translate(x, y, 0.435);
        add(g, m.metal, true);
      }
    }
    for (const y of [0.43, 6.97]) block(0, y, 0.386, 5.66, 0.11, 0.075, m.trim);
    const hx = -side * 2.81;
    for (const y of [3.2, 3.9]) block(hx, y, 0.405, 0.2, 0.18, 0.16, m.metal);
    const grip = new THREE.CylinderGeometry(0.06, 0.06, 0.65, 10);
    grip.translate(hx, 3.55, 0.46);
    add(grip, m.metal);
  }
  leaf.userData.meridianDoor = {
    name: plan.name,
    faces: 2,
    pockets: plan.pockets.length,
  };
  return leaf.userData.meridianDoor;
}
