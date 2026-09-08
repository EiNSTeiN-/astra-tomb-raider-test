import * as THREE from "three";
import { random } from "./campaign.js";
import { mergeArchitecture } from "./visuals.js";
import { campMaterials } from "./camp-materials.js";
import {
  campBox,
  campStone,
  campLog,
  bedrollGeometry,
  campTube,
  tintCampGeometry,
} from "./camp-geometry.js";
import {
  campEffectsMaterials,
  campParticles,
  campAshMaterial,
} from "./camp-effects.js";

export function buildCamp(game, feature, group) {
  const rng = random(game.level.seed + feature.x * 173 + feature.z * 59),
    mats = (game.campMaterials ??= campMaterials(game.level.biome));
  game.campTime ??= { value: 0 };
  const fx = (game.campEffects ??= campEffectsMaterials(game.campTime));
  const solid = new THREE.Group(),
    fine = new THREE.Group();
  solid.name = "Camp hearth and expedition supplies";
  fine.name = "Camp buckles, stitching and end grain";
  group.add(solid, fine);
  const height = (x, z) =>
    game.groundHeight(group.position.x + x, group.position.z + z) -
    group.position.y;
  const mesh = (
    geometry,
    material,
    x = 0,
    y = 0,
    z = 0,
    parent = solid,
    shade = 1,
  ) => {
    const m = new THREE.Mesh(tintCampGeometry(geometry, shade), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z, parent = solid, r = 0.018) =>
    mesh(campBox(w, h, d, r), material, x, y, z, parent);
  const tube = (points, r, material, parent = fine, segments = 24) =>
    mesh(campTube(points, r, segments), material, 0, 0, 0, parent);
  const seated = (g, material, x, z, sx, sy, sz, angle = 0) => {
    const m = mesh(g, material, x, 0, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = angle;
    m.updateMatrix();
    g.computeBoundingBox();
    const floor = g.boundingBox.min.y;
    let lift = -Infinity;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) < floor + 0.04) {
        const v = new THREE.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(m.matrix);
        lift = Math.max(lift, height(v.x, v.z) - v.y);
      }
    m.position.y = lift - 0.008;
    return m;
  };
  const ashGeometry = new THREE.CircleGeometry(1.15, 64);
  ashGeometry.rotateX(-Math.PI / 2);
  const ap = ashGeometry.attributes.position;
  for (let i = 0; i < ap.count; i++)
    ap.setY(i, height(ap.getX(i), ap.getZ(i)) + 0.012);
  ashGeometry.computeVertexNormals();
  const ash = new THREE.Mesh(ashGeometry, campAshMaterial());
  ash.receiveShadow = true;
  group.add(ash);
  for (let i = 0; i < 13; i++) {
    const a = (i * Math.PI * 2) / 13 + (rng() - 0.5) * 0.12,
      r = 0.85 + (rng() - 0.5) * 0.07;
    seated(
      campStone(i * 0.7),
      mats.stone,
      Math.cos(a) * r,
      Math.sin(a) * r,
      0.18 + rng() * 0.045,
      0.14 + rng() * 0.045,
      0.16 + rng() * 0.04,
      a,
    );
  }
  for (let i = 0; i < 27; i++) {
    const a = rng() * Math.PI * 2,
      r = Math.sqrt(rng()) * 0.58;
    seated(
      campStone(i + 17),
      mats.coal,
      Math.cos(a) * r,
      Math.sin(a) * r,
      0.055 + rng() * 0.04,
      0.045 + rng() * 0.03,
      0.06 + rng() * 0.05,
      rng() * 6,
    );
  }
  for (let i = 0; i < 5; i++) {
    const length = 1.18 + rng() * 0.25,
      radius = 0.1 + rng() * 0.035,
      a = i * 1.17 + 0.1,
      center = new THREE.Vector3(
        (rng() - 0.5) * 0.14,
        0.16 + (i % 2) * 0.095,
        (rng() - 0.5) * 0.14,
      );
    const log = mesh(
      campLog(length, radius, i * 1.9),
      mats.bark,
      ...center.toArray(),
    );
    log.rotation.y = a;
    for (const sign of [-1, 1]) {
      const offset = new THREE.Vector3((sign * length) / 2, 0, 0)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
          .add(center),
        end = mesh(
          new THREE.CircleGeometry(radius * (sign > 0 ? 1 : 0.86), 20),
          mats.grain,
          ...offset.toArray(),
          fine,
          0.78 + rng() * 0.2,
        );
      end.rotation.y = a + (sign * Math.PI) / 2;
    }
  }
  // The replacement chest retains the old supply box's location. Independent
  // foot pads meet the terrain; the body remains level on a sloping camp floor.
  const cx = 2,
    cz = 1,
    feet = [
      [-0.48, -0.3],
      [0.48, -0.3],
      [-0.48, 0.3],
      [0.48, 0.3],
    ],
    base = Math.max(...feet.map(([x, z]) => height(cx + x, cz + z))) + 0.065;
  const chest = new THREE.Group();
  chest.position.set(cx, base, cz);
  solid.add(chest);
  const details = new THREE.Group();
  details.position.copy(chest.position);
  fine.add(details);
  for (const [x, z] of feet) {
    const low = height(cx + x, cz + z) - base - 0.006;
    box(
      0.16,
      -low + 0.045,
      0.15,
      mats.metal,
      x,
      low / 2 + 0.022,
      z,
      chest,
      0.012,
    );
  }
  box(1.1, 0.46, 0.72, mats.wood, 0, 0.25, 0, chest, 0.028);
  box(1.14, 0.085, 0.76, mats.wood, 0, 0.525, 0, chest, 0.018);
  for (const y of [0.08, 0.4])
    box(1.16, 0.035, 0.765, mats.metal, 0, y, 0, chest, 0.009);
  for (const x of [-0.5, 0.5]) {
    box(0.035, 0.5, 0.77, mats.metal, x, 0.28, 0, chest, 0.008);
    for (const z of [-0.37, 0.37])
      for (const y of [0.085, 0.405, 0.515]) {
        const rivet = mesh(
          new THREE.SphereGeometry(0.017, 8, 5),
          mats.brass,
          x,
          y,
          z,
          details,
        );
        rivet.scale.z = 0.35;
      }
  }
  // Lid seam and individual board joints remain visible at interaction distance.
  for (const x of [-0.31, 0, 0.31])
    box(0.008, 0.004, 0.65, mats.leather, x, 0.571, 0, details, 0.001);
  for (const x of [-0.28, 0.28]) {
    box(0.075, 0.13, 0.027, mats.brass, x, 0.44, 0.397, details, 0.007);
    box(0.045, 0.055, 0.035, mats.metal, x, 0.435, 0.417, details, 0.007);
    box(0.07, 0.115, 0.04, mats.metal, x, 0.49, -0.4, details, 0.006);
  }
  for (const side of [-1, 1]) {
    const x = side * 0.585;
    tube(
      [
        [x, 0.33, -0.13],
        [x + side * 0.05, 0.27, -0.14],
        [x + side * 0.055, 0.21, 0],
        [x + side * 0.05, 0.27, 0.14],
        [x, 0.33, 0.13],
      ],
      0.012,
      mats.metal,
      details,
      20,
    );
  }
  mesh(bedrollGeometry(), mats.cloth, 0, 0.76, -0.01, chest);
  for (const x of [-0.32, 0.32]) {
    const band = mesh(
      new THREE.TorusGeometry(0.159, 0.011, 6, 40),
      mats.leather,
      x,
      0.76,
      -0.01,
      details,
    );
    band.rotation.y = Math.PI / 2;
    box(0.055, 0.025, 0.085, mats.brass, x, 0.923, -0.01, details, 0.006);
    box(0.032, 0.031, 0.055, mats.leather, x, 0.925, -0.01, details, 0.005);
  }
  for (const sign of [-1, 1]) {
    const points = [];
    for (let i = 0; i <= 100; i++) {
      const a = i * 0.25,
        r = 0.012 + i * 0.00155;
      points.push([
        sign * 0.515,
        0.76 + Math.cos(a) * r,
        -0.01 + Math.sin(a) * r,
      ]);
    }
    tube(points, 0.0045, mats.seam, details, 100);
  }
  // Sewn folded map sleeve under the front of the roll and a secured rope coil.
  const sleeve = box(
    0.48,
    0.025,
    0.27,
    mats.cloth,
    0.14,
    0.59,
    0.23,
    chest,
    0.01,
  );
  sleeve.rotation.y = -0.08;
  for (let i = 0; i < 16; i++)
    box(
      0.008,
      0.003,
      0.018,
      mats.seam,
      -0.065 + i * 0.025,
      0.606,
      0.337,
      details,
      0.001,
    );
  for (let i = 0; i < 3; i++) {
    const rope = mesh(
      new THREE.TorusGeometry(0.095 + i * 0.019, 0.012, 6, 32),
      mats.seam,
      -0.36,
      0.591 + i * 0.009,
      0.22,
      details,
    );
    rope.rotation.x = -Math.PI / 2;
  }
  // Soot-dark kettle with a rolled rim, lid and arched wire handle.
  const kettle = new THREE.Group(),
    kx = 1.14,
    kz = -0.39;
  kettle.position.set(kx, height(kx, kz) + 0.015, kz);
  solid.add(kettle);
  const profile = [
    [0, 0],
    [0.1, 0],
    [0.155, 0.04],
    [0.165, 0.17],
    [0.14, 0.23],
    [0.13, 0.245],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(profile, 24), mats.metal, 0, 0, 0, kettle);
  mesh(
    new THREE.CylinderGeometry(0.137, 0.146, 0.026, 24),
    mats.metal,
    0,
    0.25,
    0,
    kettle,
  );
  mesh(
    new THREE.SphereGeometry(0.032, 10, 7),
    mats.leather,
    0,
    0.28,
    0,
    kettle,
  );
  tube(
    [
      [-0.148, 0.16, 0],
      [-0.17, 0.31, 0],
      [0, 0.43, 0],
      [0.17, 0.31, 0],
      [0.148, 0.16, 0],
    ],
    0.009,
    mats.metal,
    kettle,
  );
  const spout = mesh(
    new THREE.CylinderGeometry(0.028, 0.044, 0.15, 12),
    mats.metal,
    0.18,
    0.18,
    0,
    kettle,
  );
  spout.rotation.z = -0.9;
  // Flatten nested rigid parts before batching by material. Small fittings
  // retain separate batches with a shorter visibility range.
  for (const root of [solid, fine]) {
    root.updateMatrixWorld(true);
    const children = [];
    root.traverse((o) => {
      if (o.isMesh) children.push(o);
    });
    for (const child of children) if (child.parent !== root) root.attach(child);
    for (const child of [...root.children])
      if (!child.isMesh) root.remove(child);
    mergeArchitecture(root);
  }
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), fx.fire);
  fire.name = "Camp flame";
  fire.position.y = 0.75;
  fire.userData.campFire = true;
  group.add(fire);
  game.flames.push(fire);
  feature.fire = fire;
  const smoke = campParticles(fx.smoke, rng, true),
    sparks = campParticles(fx.sparks, rng, false);
  group.add(smoke, sparks);
  const obstacle = {
    x: group.position.x + cx,
    z: group.position.z + cz,
    w: 0.66,
    d: 0.43,
    h:
      group.position.y +
      base +
      0.96 -
      game.groundHeight(group.position.x + cx, group.position.z + cz),
    camp: feature.id,
  };
  game.obstacles.push(obstacle);
  const stats = { triangles: 0, calls: 0 };
  for (const root of [solid, fine])
    root.traverse((o) => {
      if (o.isMesh) {
        stats.triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        stats.calls++;
      }
    });
  const camp = {
    id: feature.id,
    group,
    solid,
    fine,
    ash,
    fire,
    smoke,
    sparks,
    obstacle,
    stats,
  };
  (game.camps ??= []).push(camp);
  return camp;
}

export function updateCamps(game) {
  if (!game.campTime) return;
  // Presentation frames may render while paused; their simulation clocks stay put.
  if (!game.paused) game.campTime.value = game.elapsed;
  const quality = game.store.data.settings.quality,
    range = quality === "high" ? 100 : quality === "medium" ? 85 : 65,
    detail = quality === "high" ? 38 : quality === "medium" ? 30 : 23;
  game.campEffects.pixelScale.value =
    (game.renderer?.domElement.height || 800) *
    game.camera.projectionMatrix.elements[5] *
    0.5;
  for (const camp of game.camps) {
    const distance = camp.group.position.distanceTo(game.player.position);
    camp.solid.visible = distance < range;
    camp.fine.visible = distance < detail;
    camp.ash.visible = distance < range;
    camp.fire.visible = distance < range;
    camp.smoke.visible = distance < (quality === "low" ? 18 : 32);
    camp.sparks.visible = distance < (quality === "low" ? 22 : 38);
  }
}
