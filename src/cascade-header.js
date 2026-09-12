import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { flumeMaterial } from "./waterfall-material.js";
import { hydraulicStreamMaterial } from "./hydraulic-geometry.js";
import { mergeArchitecture } from "./visuals.js";

// A supplied upper reservoir, with a buried riser and an open nozzle. Its front
// feeds the three existing ports, then the lower overflow sill and falling water.
export function buildCascadeHeader(game, art, time, seed) {
  const root = new THREE.Group(),
    stone = art.mesh.material,
    bronze = patinatedBronze();
  root.name = "Supplied cascade reservoir";
  art.root.add(root);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  let serial = 0;
  const mesh = (geometry, material, x, y, z, camera = false) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    if (camera) game.cameraSurfaces?.capture(m, { small: true, thin: true });
    return m;
  };
  const block = (w, h, d, x, y, z, camera = false) =>
    mesh(
      stoneBlockGeometry(w, h, d, seed + serial++, 0.025),
      stone,
      x,
      y,
      z,
      camera,
    );
  block(5.55, 0.18, 2.52, 0, 6.87, -6.4, true);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++)
      block(0.4, 0.32, 2.52, side * 2.5, 7.05 + row * 0.32, -6.4, true);
    block(0.54, 0.16, 2.66, side * 2.5, 7.94, -6.4, true);
    // Vertical pilasters support the crown on the rear reservoir, not in water.
    for (let row = 0; row < 2; row++)
      block(0.52, 0.52, 0.56, side * 2.38, 7.29 + row * 0.52, -7.41, true);
  }
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 5; i++)
      block(1.035, 0.315, 0.3, (i - 2) * 1.048, 7.05 + row * 0.32, -7.56, true);
  const biome = game.level.biome;
  if (biome === "water") {
    for (let i = 0; i < 15; i++)
      mesh(
        vaultStoneGeometry(
          2.12,
          2.62,
          (i * Math.PI) / 15 + 0.004,
          ((i + 1) * Math.PI) / 15 - 0.004,
          0.48,
          3,
        ),
        stone,
        0,
        7.8,
        -7.42,
        true,
      );
  } else if (biome === "jungle") {
    for (let row = 0; row < 5; row++)
      for (const side of [-1, 1])
        block(
          1.05,
          0.38,
          0.62,
          side * (2.13 - row * 0.41),
          8.02 + row * 0.38,
          -7.42,
          true,
        );
    block(1.35, 0.34, 0.74, 0, 9.9, -7.42, true);
  } else {
    for (const side of [-1, 1]) {
      const a = v(side * 2.37, 7.94, -7.42),
        b = v(0, 9.52, -7.42);
      const beam = block(
        0.46,
        a.distanceTo(b) + 0.12,
        0.65,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        a.z,
      );
      beam.quaternion.setFromUnitVectors(v(0, 1, 0), b.sub(a).normalize());
      game.cameraSurfaces?.capture(beam, { small: true });
    }
    block(0.74, 0.35, 0.83, 0, 9.57, -7.42, true);
  }
  // Recessed service panels articulate the back and sides of the deep support.
  for (const side of [-1, 1]) {
    for (const z of [-5.9, -6.9]) {
      block(0.075, 4.7, 0.07, side * 2.66, 3.35, z);
    }
    for (const y of [1.01, 5.69])
      block(0.075, 0.08, 1.06, side * 2.66, y, -6.4);
  }
  const bottom =
    game.groundHeight(art.root.position.x, art.root.position.z - 7.92) -
    art.root.position.y -
    0.28;
  const curve = new THREE.CatmullRomCurve3(
    [
      v(0, bottom, -7.94),
      v(0, 2.4, -7.94),
      v(0, 7.96, -7.94),
      v(0, 8.42, -7.76),
      v(0, 8.42, -6.72),
      v(0, 8.05, -6.46),
      v(0, 7.55, -6.46),
    ],
    false,
    "centripetal",
  );
  const outer = new THREE.TubeGeometry(curve, 72, 0.18, 12, false);
  const inner = new THREE.TubeGeometry(curve, 72, 0.13, 12, false);
  const normals = inner.attributes.normal,
    indices = inner.index.array;
  for (let i = 0; i < normals.array.length; i++) normals.array[i] *= -1;
  for (let i = 0; i < indices.length; i += 3)
    [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
  const ring = new THREE.RingGeometry(0.13, 0.18, 12);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 7.55, -6.46);
  const pipeParts = [
      outer.toNonIndexed(),
      inner.toNonIndexed(),
      ring.toNonIndexed(),
    ],
    pipeGeometry = mergeGeometries(pipeParts);
  pipeParts.forEach((g) => g.dispose());
  mesh(pipeGeometry, bronze, 0, 0, 0);
  outer.dispose();
  inner.dispose();
  ring.dispose();
  for (const y of [1.2, 3.4, 5.6, 7.7]) {
    mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.14, 12), bronze, 0, y, -7.94);
    mesh(new THREE.BoxGeometry(0.48, 0.11, 0.5), bronze, 0, y, -7.69);
    for (const x of [-0.17, 0.17])
      mesh(new THREE.SphereGeometry(0.045, 8, 6), bronze, x, y, -8.05);
  }
  const water = mesh(
    new THREE.PlaneGeometry(4.58, 2.02),
    flumeMaterial(time, game.level),
    0,
    7.1,
    -6.4,
  );
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  water.userData.animated = true;
  const jet = mesh(
    new THREE.CylinderGeometry(0.1, 0.125, 0.47, 12, 4, true),
    hydraulicStreamMaterial(time),
    0,
    7.315,
    -6.46,
  );
  jet.castShadow = false;
  jet.userData.animated = true;
  // The three outlets cross the rear wall's genuinely open feed mouths.
  const feeds = [-1.7, 0, 1.7].map((x) => {
    const m = mesh(
      new THREE.PlaneGeometry(0.5, 0.46),
      flumeMaterial(time, game.level),
      x,
      7.065,
      -5.33,
    );
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
    m.userData.animated = true;
    return m;
  });
  mergeArchitecture(root);
  return { root, water, jet, feeds, nozzle: v(0, 7.55, -6.46), bottom };
}
