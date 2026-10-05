import * as THREE from "three";
import { TILE } from "./counterweight-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { weatherSkyStone } from "./sky-architecture.js";
import { windMetal, windSurface } from "./wind-art.js";
import { skyWindReliefGeometry } from "./sky-chamber-walls.js";

// Keep the stone tracks, movable footprints and pressure heights of the
// delivered chamber. Fittings belong to their stone or receiver, including
// while a stone slides or a loaded plate depresses.
export function buildSkyCounterweightArt(game, chamber, label) {
  const { group, trial, feature } = chamber,
    stone = pbrMaterial("rock", 0xc3c9c4),
    trim = pbrMaterial("temple", 0xacaea1),
    bronze = windMetal(),
    worn = windMetal("worn"),
    iron = windMetal("iron");
  stone.name = "Cloud counterweights: dressed granite";
  trim.name = "Cloud counterweights: stone caps";
  stone.normalScale.set(0.25, 0.25);
  trim.normalScale.set(0.22, 0.22);
  weatherSkyStone(stone);
  weatherSkyStone(trim);
  let serial = game.level.seed + 6310;
  const add = (geometry, material, x, y, z, parent = group) => {
    if (material.userData.windMetal) windSurface(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const block = (w, h, d, material, x, y, z, parent = group) =>
    add(
      stoneBlockGeometry(w, h, d, ++serial, 0.022),
      material,
      x,
      y,
      z,
      parent,
    );
  const cylinder = (r, h, material, x, y, z, parent = group) =>
    add(new THREE.CylinderGeometry(r, r, h, 16), material, x, y, z, parent);
  const fitFace = (face, parent) => {
    face.updateMatrix();
    for (const child of [...face.children]) {
      if (!child.isMesh || child.userData.animated) continue;
      face.remove(child);
      child.applyMatrix4(face.matrix);
      parent.add(child);
    }
  };
  const cameraSolid = (w, h, d, x, y, z, parent = group) => {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    proxy.position.set(x, y, z);
    parent.add(proxy);
    game.cameraSurfaces?.capture(proxy, { small: true });
    parent.remove(proxy);
    proxy.geometry.dispose();
  };

  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 5; x++) {
      const px = (x - 2) * TILE,
        pz = (z - 2) * TILE;
      block(TILE - 0.05, 0.08, TILE - 0.05, stone, px, 0.02, pz);
      // Narrow iron tracks inset into the paving; bronze rivets identify the
      // intersections without covering the working floor with bright crosses.
      for (const turn of [0, 1]) {
        const rail = block(1.25, 0.015, 0.024, iron, px, 0.065, pz);
        rail.rotation.y = (turn * Math.PI) / 2;
      }
      cylinder(0.045, 0.012, worn, px, 0.069, pz);
    }
  for (const [i, cell] of trial.walls.entries()) {
    const x = (cell[0] - 2) * TILE,
      z = (cell[1] - 2) * TILE;
    block(1.35, 1.91, 1.35, iron, x, 1.01, z);
    for (const y of [0.505, 1.4325]) block(1.43, 0.915, 1.43, stone, x, y, z);
    block(1.49, 0.16, 1.49, trim, x, 2.03, z);
    cameraSolid(1.6, 2.12, 1.6, x, 1.06, z);
    for (let side = 0; side < 4; side++) {
      const face = new THREE.Group();
      face.position.set(x, 0, z);
      face.rotation.y = (side * Math.PI) / 2;
      group.add(face);
      block(0.76, 0.48, 0.026, iron, 0, 1.42, 0.722, face);
      const relief = add(
        skyWindReliefGeometry(i % 3, 0.6),
        worn,
        0,
        1.49,
        0.736,
        face,
      );
      relief.scale.y = 0.7;
      for (const sx of [-0.32, 0.32])
        block(0.048, 0.048, 0.018, worn, sx, 1.42, 0.743, face);
      fitFace(face, group);
    }
    game.obstacles.push({
      x: group.position.x + x,
      z: group.position.z + z,
      w: 1.17,
      d: 1.17,
      h: 2.15,
    });
  }
  trial.goals.forEach((goal, index) => {
    const material = windMetal("worn");
    material.emissive.setHex(0x355440);
    material.emissiveIntensity = 0;
    const plates = goal.cells.map((cell) => {
      const plate = block(
        1.32,
        0.065,
        1.32,
        material,
        (cell[0] - 2) * TILE,
        0.085,
        (cell[1] - 2) * TILE,
      );
      plate.userData.animated = true;
      for (const side of [-1, 1]) {
        block(1.2, 0.025, 0.035, bronze, 0, 0.035, side * 0.596, plate);
        block(0.035, 0.025, 1.2, bronze, side * 0.596, 0.035, 0, plate);
      }
      const name = label(goal.name, 1.17);
      name.rotation.x = -Math.PI / 2;
      name.position.y = 0.039;
      plate.add(name);
      return plate;
    });
    // The existing rear wall's inner face is z=-6.09. These plaque backs
    // enter it by 2 cm, so the readable text has a physical mounting surface.
    const x = -3.5 + index * 2.35;
    block(1.98, 0.55, 0.16, bronze, x, 2.65, -6.03);
    block(1.83, 0.42, 0.018, iron, x, 2.65, -5.946);
    const sign = label(goal.name, 1.55);
    sign.position.set(x, 2.65, -5.933);
    group.add(sign);
    chamber.plates.push({ goal, material, meshes: plates, active: false });
  });
  trial.stones.forEach((definition, index) => {
    const body = new THREE.Group();
    body.name = `${definition.name} counterweight`;
    body.userData.cameraDynamic = true;
    group.add(body);
    block(1.16, 0.09, 1.16, trim, 0, 0.1075, 0, body);
    block(1.12, 1.1, 1.12, stone, 0, 0.685, 0, body);
    block(1.18, 0.07, 1.18, trim, 0, 1.27, 0, body);
    block(1.07, 0.028, 1.07, bronze, 0, 1.304, 0, body);
    for (let side = 0; side < 4; side++) {
      const face = new THREE.Group();
      face.rotation.y = (side * Math.PI) / 2;
      body.add(face);
      block(0.8, 0.48, 0.029, bronze, 0, 0.79, 0.568, face);
      block(0.69, 0.34, 0.019, iron, 0, 0.8, 0.588, face);
      const name = label(definition.name, 0.62);
      name.position.set(0, 0.88, 0.601);
      face.add(name);
      for (let mark = 0; mark < definition.weight; mark++)
        block(
          0.05,
          0.1,
          0.014,
          worn,
          (mark - (definition.weight - 1) / 2) * 0.13,
          0.7,
          0.604,
          face,
        );
      const grip = add(
        new THREE.CylinderGeometry(0.028, 0.028, 0.72, 16),
        worn,
        0,
        1.1,
        0.6,
        face,
      );
      grip.rotation.z = Math.PI / 2;
      for (const sx of [-0.34, 0.34])
        block(0.075, 0.12, 0.07, bronze, sx, 1.08, 0.58, face);
      fitFace(face, body);
    }
    mergeArchitecture(body, 2);
    cameraSolid(1.28, 1.32, 1.28, 0, 0.66, 0, body);
    const obstacle = { x: 0, z: 0, w: 1.03, d: 1.03, h: 1.32 };
    game.obstacles.push(obstacle);
    chamber.blocks.push({ definition, group: body, obstacle, index });
  });
  const cage = new THREE.Group();
  cage.userData.cameraDynamic = true;
  cage.position.set(0, 0, -5);
  group.add(cage);
  for (const x of [-0.9, 0.9]) block(0.1, 2.25, 0.1, bronze, x, 1.15, 0, cage);
  block(1.9, 0.12, 0.1, worn, 0, 2.28, 0, cage);
  chamber.cage = cage;
  const control = new THREE.Group();
  control.position.z = -5;
  group.add(control);
  add(new THREE.CylinderGeometry(0.6, 0.78, 0.7, 16), trim, 0, 0.4, 0, control);
  cylinder(0.48, 0.06, bronze, 0, 0.77, 0, control);
  const core = add(
    new THREE.OctahedronGeometry(0.36),
    game.glowMat,
    0,
    1.2,
    0,
    control,
  );
  feature.core = core;
  // A seated tablet carries the inscription; its lettering follows the face
  // tilt instead of hovering in front of the stone at a different angle.
  // The left aisle provides a direct view instead of facing the first duct's
  // pedestal, which begins immediately in front of the former central tablet.
  const tx = -5,
    tz = 8.3,
    floor =
      game.groundHeight(group.position.x + tx, group.position.z + tz) -
      group.position.y;
  block(1.62, 0.14, 0.46, trim, tx, floor + 0.055, tz);
  const tablet = new THREE.Group();
  tablet.position.set(tx, floor + 0.65, tz);
  tablet.rotation.x = -0.14;
  group.add(tablet);
  const slab = block(1.5, 1.15, 0.25, stone, 0, 0, 0, tablet);
  game.cameraSurfaces?.capture(slab, { small: true });
  const name = label("COUNTERWEIGHTS", 1.36);
  name.position.set(0, 0.26, 0.132);
  tablet.add(name);
  chamber.tablet = group.position.clone().add(new THREE.Vector3(tx, floor, tz));
  game.obstacles.push({
    x: chamber.tablet.x,
    z: chamber.tablet.z,
    w: 1.26,
    d: 0.7,
    h: 1.3,
    counterweightTablet: true,
  });
}
