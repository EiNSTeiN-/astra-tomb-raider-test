import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { keeperShrinePlan } from "./keeper-shrine-plan.js";
import { cipherRelief } from "./cipher-art.js";
import { cipherClue } from "./cipher-rules.js";

function recordGeometry(style) {
  const shape = new THREE.Shape();
  shape.moveTo(-2.2, -1.4);
  shape.lineTo(2.2, -1.4);
  shape.lineTo(2.2, 1.4);
  if (style === "rain-register") {
    shape.lineTo(1.4, 1.4);
    shape.quadraticCurveTo(0.8, 1.95, 0, 1.68);
    shape.quadraticCurveTo(-0.8, 1.4, -1.4, 1.6);
    shape.lineTo(-2.2, 1.4);
  } else if (style === "moon-canopy" || style === "heart-shrine") {
    shape.quadraticCurveTo(0, 2.4, -2.2, 1.4);
  } else if (style === "oath-pediment") {
    shape.lineTo(0, 2.05);
    shape.lineTo(-2.2, 1.4);
  } else {
    shape.lineTo(1.5, 1.4);
    shape.lineTo(1.5, 1.65);
    shape.lineTo(-1.5, 1.65);
    shape.lineTo(-1.5, 1.4);
    shape.lineTo(-2.2, 1.4);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.02,
    bevelSegments: 1,
    curveSegments: 12,
    steps: 1,
  }).translate(0, 0, -0.18);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return geometry;
}

export function buildKeeperShrine(game, site, materials, plaque) {
  const plan = keeperShrinePlan(site.stage),
    root = new THREE.Group(),
    worldX = site.root.position.x + plan.x,
    worldZ = site.root.position.z + plan.z,
    floor = game.groundHeight(worldX, worldZ);
  root.name = `${site.trial.title} keeper shrine`;
  root.position.set(plan.x, floor - site.root.position.y, plan.z);
  site.fixed.add(root);
  const { stone, relief } = materials,
    parts = [],
    solids = [];
  let serial = 391 + site.stage * 71;
  const add = (geometry, material, position, parent = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  const block = (w, h, d, x, y, z, material = stone) =>
    add(stoneBlockGeometry(w, h, d, ++serial), material, [x, y, z]);
  // A conservative grid lower bound buries the complete base under its cells.
  // Raise the cap above uphill corners so soil cannot cover the lowest line.
  const bottom =
    footprintMinimum(
      (x, z) => game.groundHeight(x, z),
      worldX,
      worldZ,
      plan.width,
      plan.depth,
      game.terrainProfile?.step,
    ) -
    floor -
    0.07;
  let high = 0;
  for (const x of [-plan.width / 2, 0, plan.width / 2])
    for (const z of [-plan.depth / 2, 0, plan.depth / 2])
      high = Math.max(high, game.groundHeight(worldX + x, worldZ + z) - floor);
  const cap = high + 0.2;
  block(plan.width, cap - bottom, plan.depth, 0, (cap + bottom) / 2, 0);
  const reading = new THREE.Group();
  reading.position.set(0, cap + 0.08 + 1.4 * Math.cos(plan.tilt), 0);
  reading.rotation.x = -plan.tilt;
  root.add(reading);
  const readingFace = add(
    recordGeometry(plan.style),
    stone,
    [0, 0, 0],
    reading,
  );
  // The atlas text follows the real reading face, including the low altars.
  const inscriptions = [
    site.trial.title.toUpperCase(),
    ...site.trial.clues.map(cipherClue),
  ];
  const header = plaque(inscriptions[0], 3.8);
  header.position.set(0, 1.17, 0.207);
  reading.add(header);
  site.trial.clues.forEach((clue, i) => {
    const line = plaque(cipherClue(clue), 4);
    line.position.set(0, 0.8 - i * 0.25, 0.207);
    reading.add(line);
  });
  if (site.trial.clues.length <= 5) {
    const seal = add(
      cipherRelief(plan.sign),
      relief,
      [0, site.trial.clues.length === 4 ? -0.72 : -0.9, 0.19],
      reading,
    );
    seal.scale.setScalar(site.trial.clues.length === 4 ? 1.4 : 1.05);
    seal.userData.decoration = true;
    seal.userData.floorRelief = true;
  }
  const icon = (sign, x, y, z, scale = 1) => {
    const mesh = add(cipherRelief(sign), relief, [x, y, z]);
    mesh.scale.setScalar(scale);
    mesh.userData.decoration = true;
    return mesh;
  };
  if (plan.tilt) {
    // Closed side cheeks support the inclined face; the base stays low enough
    // to reveal the drums from the central approach.
    const profile = new THREE.Shape();
    const half = 1.4 * Math.sin(plan.tilt),
      top = cap + 0.08 + 2.8 * Math.cos(plan.tilt);
    profile.moveTo(-half, cap);
    profile.lineTo(half, cap);
    profile.lineTo(half, top);
    profile.lineTo(-half, cap + 0.08);
    profile.closePath();
    for (const side of [-1, 1]) {
      const cheek = new THREE.ExtrudeGeometry(profile, {
        depth: 0.24,
        bevelEnabled: false,
        steps: 1,
      });
      // Profile x becomes z and extrusion z becomes x.
      cheek.rotateY(Math.PI / 2);
      add(cheek, relief, [side * 2.12 - 0.12, 0, 0]);
    }
    for (const side of [-1, 1]) {
      block(0.45, 0.3, plan.depth * 0.85, side * 2.38, cap + 0.15, 0);
      block(0.5, 0.9, 0.5, side * 2.38, cap + 0.45, plan.depth / 2 - 0.3);
      icon(plan.sign, side * 2.38, cap + 0.55, plan.depth / 2 - 0.055, 0.7);
    }
    if (plan.style === "garden-altar")
      block(4.75, 0.17, 0.45, 0, top + 0.05, -half);
  } else {
    const heights = {
        "root-portal": 3.7,
        "rain-register": 3.0,
        "witness-screen": 3.9,
        "moon-canopy": 3.35,
        "oath-pediment": 3.55,
        "heart-shrine": 3.8,
      },
      height = heights[plan.style];
    for (const side of [-1, 1]) {
      block(0.5, height, 0.65, side * 2.38, cap + height / 2, 0);
      block(0.6, 0.2, 0.85, side * 2.38, cap + height + 0.1, 0);
      icon(plan.sign, side * 2.38, cap + 1.6, 0.315, 0.7);
    }
    if (plan.style === "root-portal" || plan.style === "heart-shrine") {
      const tiers = plan.style === "heart-shrine" ? 3 : 2;
      for (let i = 0; i < tiers; i++)
        block(5.1 - i * 0.85, 0.22, 0.72, 0, cap + height + 0.22 + i * 0.22, 0);
      block(0.95, 0.8, 0.24, 0, cap + height + 0.86, 0);
      icon(plan.sign, 0, cap + height + 0.86, 0.1, 1.1);
    } else if (plan.style === "witness-screen") {
      block(4.85, 0.6, 0.45, 0, cap + 3.34, 0);
      for (const x of [-1.65, -0.55, 0.55, 1.65])
        icon(x < 0 ? 0 : 2, x, cap + 3.35, 0.2, 0.65);
    } else if (plan.style === "moon-canopy") {
      const arch = new THREE.Shape();
      arch.moveTo(-2.5, 0);
      arch.quadraticCurveTo(0, 2, 2.5, 0);
      arch.lineTo(2.5, 0.3);
      arch.quadraticCurveTo(0, 2.4, -2.5, 0.3);
      arch.closePath();
      add(
        new THREE.ExtrudeGeometry(arch, { depth: 0.55, bevelEnabled: false }),
        stone,
        [0, cap + 3.4, -0.275],
      );
      block(0.16, 0.95, 0.14, 0, cap + 4.05, 0);
      add(
        new THREE.CylinderGeometry(0.44, 0.44, 0.16, 32).rotateX(Math.PI / 2),
        stone,
        [0, cap + 3.78, 0.14],
      );
      icon(3, 0, cap + 3.78, 0.207, 0.85);
    } else if (plan.style === "oath-pediment") {
      icon(1, 0, cap + 3.2, 0.18, 0.75);
    } else {
      for (const side of [-1, 1])
        block(1.5, 0.18, 0.55, side * 1.55, cap + 3.22, 0);
      add(
        new THREE.CylinderGeometry(0.44, 0.44, 0.16, 32).rotateX(Math.PI / 2),
        stone,
        [0, cap + 3.48, 0.14],
      );
      icon(2, 0, cap + 3.48, 0.207, 0.9);
    }
  }
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root, true),
    staticMeshes = [];
  root.traverse((node) => {
    if (node.isMesh) staticMeshes.push(node);
  });
  // The existing batcher reads direct children. Preserve each complete world
  // transform while moving the finished stone and lettering into that layer.
  // Capture camera shapes afterwards so their saved parent/local pair agrees.
  for (const mesh of staticMeshes) site.fixed.attach(mesh);
  site.fixed.remove(root);
  site.fixed.updateWorldMatrix(true, true);
  let readingSolid;
  const floorReliefs = [];
  for (const mesh of parts) {
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    const matrix = mesh.matrixWorld.elements,
      inclined =
        Math.abs(matrix[1]) +
          Math.abs(matrix[4]) +
          Math.abs(matrix[6]) +
          Math.abs(matrix[9]) >
        1e-6;
    const slopedFace = mesh === readingFace && !!plan.tilt,
      options = {
        layeredSupport: true,
        bodySupport: !mesh.userData.decoration,
        supportRadius: 0,
        groundingSlope:
          slopedFace || (!!plan.tilt && mesh.userData.floorRelief),
      };
    let solid;
    if (inclined) {
      // TriangleSolids uses upright transforms. Bake the pitched reading face
      // into world coordinates so support and body queries use its true slope.
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
        physical = new THREE.Mesh(geometry, mesh.material);
      try {
        solid = stationMeshSolid(game, site.feature, physical, options);
      } finally {
        geometry.dispose();
      }
    } else {
      solid = stationMeshSolid(game, site.feature, mesh, options);
    }
    solids.push(solid);
    if (mesh === readingFace) readingSolid = solid;
    if (plan.tilt && mesh.userData.floorRelief) floorReliefs.push(solid);
  }
  for (const solid of floorReliefs) solid.groundingFace = readingSolid;
  return {
    plan,
    inscriptions,
    solids,
    bounds,
    foundation: {
      x: worldX,
      z: worldZ,
      bottom: floor + bottom,
      cap: floor + cap,
    },
  };
}
