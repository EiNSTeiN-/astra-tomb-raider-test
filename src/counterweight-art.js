import * as THREE from "three";
import { TILE } from "./counterweight-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { weatherSkyStone } from "./sky-architecture.js";
import { windMetal, windSurface } from "./wind-art.js";
import { skyWindReliefGeometry } from "./sky-chamber-walls.js";
import {
  stationAssemblySolid,
  stationMeshSolid,
  stationSolid,
} from "./field-station-solids.js";
import { footprintMinimum } from "./masonry-foundations.js";

function masonryCopy(source) {
  const material = source.clone();
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  return material;
}

// Shallow, closed regional seals sit on the fixed pillar's packed face.
// They decorate the chamber without occupying a stone track or grip stance.
function regionalMotifGeometry(biome, variant) {
  let points;
  if (biome === "jungle")
    points = Array.from({ length: 40 }, (_, i) => {
      const a = (i * Math.PI * 2) / 40,
        r = 0.19 + 0.045 * Math.cos((5 + (variant % 2)) * a);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  else if (biome === "desert")
    points = Array.from({ length: 48 }, (_, i) => {
      const a = (i * Math.PI * 2) / 48,
        r = i % 4 === 0 ? 0.25 : 0.17;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  else if (biome === "snow")
    points = [
      [-0.23, -0.19],
      [0.23, -0.19],
      [0.15, -0.11],
      [0.11, 0.13],
      [0.06, 0.21],
      [-0.06, 0.21],
      [-0.11, 0.13],
      [-0.15, -0.11],
    ];
  else if (biome === "water")
    points = [
      [-0.18, -0.19],
      [0.18, -0.19],
      ...Array.from({ length: 25 }, (_, i) => {
        const a = (i * Math.PI) / 24,
          r = 0.225 + 0.018 * Math.cos(a * 12);
        return [Math.cos(a) * r, -0.13 + Math.sin(a) * 0.36];
      }),
    ];
  else if (biome === "volcano")
    points = [
      [0, -0.24],
      [0.21, -0.1],
      [0.23, 0.12],
      [0.09, 0.02],
      [0.07, 0.24],
      [-0.06, 0.1],
      [-0.15, 0.2],
      [-0.23, -0.06],
    ];
  else if (biome === "crystal")
    points = [
      [0, -0.24],
      [0.22, -0.1],
      [0.18, 0.12],
      [0, 0.25],
      [-0.18, 0.12],
      [-0.22, -0.1],
    ];
  else
    points = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8,
        r = i % 2 === 0 ? 0.245 : 0.105;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  const shape = new THREE.Shape(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  });
  geometry.userData.counterweightMotif = biome;
  return geometry;
}

// Keep the stone tracks, movable footprints and pressure heights of the
// delivered chamber. Fittings belong to their stone or receiver, including
// while a stone slides or a loaded plate depresses.
export function buildCounterweightArt(game, chamber, label) {
  const { group, trial, feature } = chamber,
    biome = game.level.biome,
    sky = biome === "sky",
    stone = sky ? pbrMaterial("rock", 0xc3c9c4) : masonryCopy(game.stoneMat),
    trim = sky ? pbrMaterial("temple", 0xacaea1) : masonryCopy(game.darkMat),
    bronze = windMetal(),
    worn = windMetal("worn"),
    iron = windMetal("iron");
  stone.name = `${biome} counterweights: dressed masonry`;
  trim.name = `${biome} counterweights: bearing caps`;
  stone.normalScale.set(0.25, 0.25);
  trim.normalScale.set(0.22, 0.22);
  if (sky) {
    weatherSkyStone(stone);
    weatherSkyStone(trim);
  }
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
        sky
          ? skyWindReliefGeometry(i % 3, 0.6)
          : regionalMotifGeometry(biome, i),
        worn,
        0,
        sky ? 1.49 : 1.42,
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
  const receiverX = trial.goals.map(
    (goal) =>
      goal.cells.reduce((sum, cell) => sum + (cell[0] - 2) * TILE, 0) /
      goal.cells.length,
  );
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
    // Mount to the solid lower wall band, clear of recessed paintings. The
    // lettering aligns with the actual receiver rather than an unrelated row.
    const x = receiverX[index],
      width = Math.min(
        1.98,
        ...receiverX
          .filter((_, i) => i !== index)
          .map((other) => Math.abs(other - x) - 0.12),
      );
    for (const side of [-1, 1])
      block(
        0.22,
        0.34,
        0.68,
        stone,
        x + side * (width / 2 - 0.25),
        0.83,
        -6.35,
      );
    block(width, 0.55, 0.16, bronze, x, 0.83, -6.03);
    block(width - 0.15, 0.42, 0.018, iron, x, 0.83, -5.946);
    const sign = label(goal.name, width - 0.43);
    sign.position.set(x, 0.83, -5.933);
    sign.userData.counterweightReceiver = index;
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
  for (const x of [-0.9, 0.9]) {
    const post = block(0.1, 2.25, 0.1, bronze, x, 1.15, 0, cage);
    game.cameraSurfaces?.capture(post, { small: true, thin: true });
  }
  const header = block(1.9, 0.12, 0.1, worn, 0, 2.28, 0, cage);
  game.cameraSurfaces?.capture(header, { small: true, thin: true });
  chamber.cage = cage;
  chamber.cageHeaderSolid = stationSolid(
    game,
    feature,
    group,
    [1.9, 0.12, 0.1],
    [0, 2.28, -5],
    { bodyPadding: 0.4, descentEscapeRadius: 0.65, support: false, node: cage },
  );
  chamber.cageHeaderSolid.ceiling = true;

  // Grounded channels carry the sliding posts. Their diagonal ties enter the
  // rear cornice, above the wall imagery, and the cable meets the moving head.
  const fixed = [];
  const keep = (mesh) => {
    fixed.push(mesh);
    return mesh;
  };
  for (const x of [-0.9, 0.9]) {
    const sample = (px, pz) => game.groundHeight(px, pz) - group.position.y;
    const wx = group.position.x + x,
      wz = group.position.z - 5.04;
    const low = footprintMinimum(sample, wx, wz, 0.4, 0.44) - 0.08;
    const high =
      -footprintMinimum((px, pz) => -sample(px, pz), wx, wz, 0.4, 0.44) + 0.11;
    keep(block(0.4, high - low, 0.44, trim, x, (high + low) / 2, -5.04));
    keep(block(0.24, 5.15 - high, 0.045, iron, x, (high + 5.15) / 2, -5.125));
    for (const side of [-1, 1])
      keep(
        block(
          0.04,
          5.15 - high,
          0.22,
          bronze,
          x + side * 0.1,
          (high + 5.15) / 2,
          -5.035,
        ),
      );
    cameraSolid(0.3, 5.15 - low, 0.46, x, (low + 5.15) / 2, -5.04);
    const a = new THREE.Vector3(x, 5.15, -5.04),
      b = new THREE.Vector3(x, 7.04, -6.49),
      delta = b.clone().sub(a),
      length = delta.length(),
      q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      ),
      mid = a.clone().add(b).multiplyScalar(0.5);
    const shape = new THREE.CylinderGeometry(0.035, 0.035, length, 12);
    const proxy = new THREE.Mesh(shape.clone(), stone);
    proxy.position.copy(mid);
    proxy.quaternion.copy(q);
    group.add(proxy);
    game.cameraSurfaces?.capture(proxy, {
      small: true,
      thin: true,
      cylinderAxis: "y",
    });
    group.remove(proxy);
    proxy.geometry.dispose();
    shape.applyQuaternion(q).translate(mid.x, mid.y, mid.z);
    keep(add(shape, iron, 0, 0, 0));
    const anchor = keep(block(0.3, 0.28, 0.32, bronze, x, 7.02, -6.49));
    game.cameraSurfaces?.capture(anchor, { small: true, thin: true });
  }
  const beam = keep(block(2.16, 0.16, 0.24, worn, 0, 5.15, -5.04));
  game.cameraSurfaces?.capture(beam, { small: true, thin: true });
  chamber.cageGuideSolid = stationAssemblySolid(game, feature, fixed, {
    bodyPadding: 0.4,
    support: false,
  });
  chamber.cageGuideSolid.counterweightGuide = true;
  const cable = add(
    new THREE.CylinderGeometry(0.018, 0.018, 1, 8),
    iron,
    0,
    0,
    -5,
    group,
  );
  cable.userData.animated = true;
  chamber.hoistCable = cable;
  const control = new THREE.Group();
  control.name = "Counterweight sanctuary control";
  control.position.z = -5;
  group.add(control);
  // Keep the original head and upper seat, but bury the lower edge across
  // the terrain footprint instead of leaving a five-centimetre air gap.
  const bottom =
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        group.position.x,
        group.position.z - 5,
        1.56,
        1.56,
      ) -
      group.position.y -
      0.08,
    base = add(
      new THREE.CylinderGeometry(0.6, 0.78, 0.75 - bottom, 16),
      trim,
      0,
      (bottom + 0.75) / 2,
      0,
      control,
    ),
    collar = cylinder(0.48, 0.06, bronze, 0, 0.77, 0, control);
  const core = add(
    new THREE.OctahedronGeometry(0.36),
    game.glowMat,
    0,
    1.2,
    0,
    control,
  );
  feature.core = core;
  feature.fixedCore = true;
  core.visible = feature.stage >= game.progress.stage;
  chamber.controlSolid = stationAssemblySolid(game, feature, [base, collar], {
    bodyPadding: 0.55,
    // A drop onto the steep crystal must clear its head, then the broad
    // lower base, before settling on nearby ground or a real cap.
    descentEscapeRadius: 0.78 + 0.55,
  });
  chamber.controlHeadSolid = stationMeshSolid(game, feature, core, {
    bodyPadding: 0.55,
    descentEscapeRadius: 0.36 + 0.55,
    node: core,
  });
  for (const mesh of [base, collar])
    game.cameraSurfaces?.capture(mesh, {
      small: true,
      thin: true,
      cylinderAxis: "y",
    });
  // The regional courts and completed stages may hide this head. A child
  // proxy keeps camera coverage attached to that same visibility state.
  const headProxy = new THREE.Mesh(core.geometry, core.material);
  core.add(headProxy);
  game.cameraSurfaces?.capture(headProxy, { small: true });
  core.remove(headProxy);
  // The rear control is five metres from the board's centre. Place its hum
  // just above the crystal, clear of the new physical shell.
  feature.soundAnchor = group.position
    .clone()
    .add(new THREE.Vector3(0, 1.8, -5));
  // A seated tablet carries lettering at the slab's own tilt. The cloud's
  // forecourt keeps the reader and reset stance clear of its wind stands;
  // the crystal's right aisle clears its tall
  // central resonator. Other chapters retain their original reading location.
  const tx = sky ? -6 : biome === "crystal" ? 5 : 0,
    tz = sky ? 11.3 : 8.4,
    centreFloor =
      game.groundHeight(group.position.x + tx, group.position.z + tz) -
      group.position.y;
  let low = centreFloor,
    floor = centreFloor;
  if (!sky) {
    for (let iz = -3; iz <= 3; iz++)
      for (let ix = -8; ix <= 8; ix++) {
        const y =
          game.groundHeight(
            group.position.x + tx + ix * 0.11,
            group.position.z + tz + iz * 0.11,
          ) - group.position.y;
        low = Math.min(low, y);
        floor = Math.max(floor, y);
      }
  }
  const baseTop = floor + 0.125,
    baseBottom = low - 0.09;
  block(
    1.62,
    sky ? 0.14 : baseTop - baseBottom,
    sky ? 0.46 : 0.66,
    trim,
    tx,
    sky ? floor + 0.055 : (baseTop + baseBottom) / 2,
    tz,
  );
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
    h: floor - centreFloor + 1.3,
    counterweightTablet: true,
  });
}
