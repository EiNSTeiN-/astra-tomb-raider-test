import * as THREE from "three";
import { forgeGantryGeometry } from "./forge-furnace-art.js";
import { mergeArchitecture } from "./visuals.js";

// Long end spans carry one bow; the sides follow the three existing pier bays.
// All members sit above the original capstones and outside the crossing route.
export function pressureFramePlan() {
  const spans = [];
  for (const side of [-1, 1]) {
    spans.push({
      axis: "x",
      fixed: side * 21,
      start: -21,
      end: 21,
      rise: 3.8,
      divisions: 12,
    });
    for (let bay = 0; bay < 3; bay++)
      spans.push({
        axis: "z",
        fixed: side * 21,
        start: -21 + bay * 14,
        end: -7 + bay * 14,
        rise: 1.8,
        divisions: 4,
      });
  }
  return spans.map((span) => ({
    ...span,
    bottom: 27.35,
    points: Array.from({ length: span.divisions + 1 }, (_, i) => {
      const t = i / span.divisions;
      return [
        span.start + (span.end - span.start) * t,
        28.15 + span.rise * 4 * t * (1 - t),
      ];
    }),
  }));
}

export function buildPressureFrame(game, materials, solid) {
  const h = game.pressureRelay,
    root = new THREE.Group();
  root.name = "Riveted foundry crown";
  h.root.add(root);
  const plan = pressureFramePlan(),
    { metal, bronze } = materials;
  const part = (geometry, material, parent = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (size, position, material, parent) => {
    const mesh = part(new THREE.BoxGeometry(...size), material, parent);
    mesh.position.set(...position);
    return mesh;
  };
  const beam = (a, b, width, depth, material, parent, capture = true) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const mesh = box(
      [width, delta.length(), depth],
      start.add(end).multiplyScalar(0.5).toArray(),
      material,
      parent,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    if (capture) {
      // Keep a separate transform snapshot while the visible parts are baked
      // into the two static material batches below.
      const proxy = mesh.clone();
      proxy.geometry = mesh.geometry.clone();
      parent.add(proxy);
      game.cameraSurfaces?.capture(proxy);
      proxy.removeFromParent();
      proxy.geometry.dispose();
    }
    return mesh;
  };
  const rivet = (x, y, z, parent) => {
    const mesh = part(
      new THREE.CylinderGeometry(0.055, 0.055, 0.045, 6),
      bronze,
      parent,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
  };
  for (const span of plan) {
    const group = new THREE.Group();
    root.add(group);
    if (span.axis === "x") group.position.z = span.fixed;
    else {
      group.position.x = span.fixed;
      group.rotation.y = -Math.PI / 2;
    }
    // Three continuous strips form each girder. Mitered cross-sections close
    // every bend instead of leaving wedges between separately rotated boxes.
    const girder = (points) => {
      part(forgeGantryGeometry({ points }, 0.34, 0.22), metal, group);
      for (const dy of [-0.2, 0.2])
        part(
          forgeGantryGeometry(
            { points: points.map(([x, y]) => [x, y + dy]) },
            0.1,
            0.84,
          ),
          metal,
          group,
        );
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const proxy = beam([...a, 0], [...b, 0], 0.55, 0.86, metal, group);
        proxy.removeFromParent();
        proxy.geometry.dispose();
      }
    };
    const trimStart = span.axis === "z" && span.start === -21 ? 0.42 : 0;
    const trimEnd = span.axis === "z" && span.end === 21 ? 0.42 : 0;
    girder([
      [span.start + trimStart, span.bottom],
      [span.end - trimEnd, span.bottom],
    ]);
    girder(span.points);
    // Alternating diagonals meet the chords at the gusset centers. A paired
    // web and fasteners on both faces keep the open structure readable inside.
    for (let i = 0; i < span.points.length; i++) {
      const [x, y] = span.points[i];
      const shared = span.axis === "z" && span.start !== -21 && i === 0;
      if (!shared)
        beam([x, span.bottom, 0], [x, y, 0], 0.18, 0.22, metal, group);
      if (i) {
        const before = span.points[i - 1];
        const a = i % 2 ? [before[0], span.bottom, 0] : [...before, 0];
        const b = i % 2 ? [x, y, 0] : [x, span.bottom, 0];
        beam(a, b, 0.2, 0.22, metal, group);
      }
      if (!shared)
        for (const at of [span.bottom, y])
          for (const side of [-1, 1]) {
            box([0.44, 0.48, 0.065], [x, at, side * 0.155], bronze, group);
            for (const dx of [-0.12, 0.12])
              rivet(x + dx, at, side * 0.21, group);
          }
    }
    // Finite overhead bounds keep bodies out of the castings without affecting
    // the intake floor, six pistons, galleries or return-lift envelope.
    const top = Math.max(...span.points.map((p) => p[1])) + 0.28;
    const center = (span.start + span.end) / 2,
      length = span.end - span.start + 0.6;
    solid(
      span.axis === "x" ? center : span.fixed,
      (27.1 + top) / 2,
      span.axis === "x" ? span.fixed : center,
      span.axis === "x" ? length : 0.9,
      top - 27.1,
      span.axis === "x" ? 0.9 : length,
    );
  }
  // Bearing plates contact the existing 27.1 m capstone tops. Corner plates
  // carry both intersecting trusses; intermediate plates carry the side bays.
  for (const x of [-21, 21])
    for (const z of [-21, -7, 7, 21])
      box([1.7, 0.08, 1.7], [x, 27.14, z], bronze, root);
  // Preserve empty span parents for captured camera proxies. Bake only the
  // visible pieces, so the crown adds two static material batches.
  for (const group of [...root.children]) {
    if (!group.isGroup) continue;
    group.updateMatrix();
    for (const mesh of [...group.children]) {
      mesh.updateMatrix();
      mesh.geometry.applyMatrix4(mesh.matrix).applyMatrix4(group.matrix);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      root.add(mesh);
    }
  }
  mergeArchitecture(root);
  h.art.frame = { root, plan };
  return h.art.frame;
}
