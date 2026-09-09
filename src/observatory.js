import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { flutedColumnGeometry, vaultStoneGeometry } from "./palace-geometry.js";
import { domePanelGeometry, patinatedBronze } from "./observatory-geometry.js";
import { observatoryState } from "./observatory-state.js";

export function buildObservatory(game) {
  game.observatories = [];
  game.observatorySources = [];
  game.orreryFocus = null;
  game.observatoryMaterials = null;
  if (game.level.biome !== "eclipse") return false;
  const stone = pbrMaterial("temple", 0xc0c4bf),
    bronze = patinatedBronze();
  const dark = pbrMaterial("palace-stone", 0x606e78);
  game.observatoryMaterials = { stone, dark, bronze };
  const glow = new THREE.MeshStandardMaterial({
    color: 0xdde3cd,
    emissive: 0xc7daca,
    emissiveIntensity: 1.1,
    roughness: 0.35,
  });
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7 - 17,
      radius = 9.6 + (room.index % 3) * 0.3;
    const state = observatoryState(game.level, game.progress, room.index);
    const base = Math.max(
      ...Array.from({ length: 24 }, (_, i) =>
        game.groundHeight(
          x + Math.cos((i * Math.PI) / 12) * radius,
          z + Math.sin((i * Math.PI) / 12) * radius,
        ),
      ),
    );
    const root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    root.name = `Meridian observatory ${room.index}`;
    game.world.add(root, detail);
    const patch = {
      root,
      detail,
      index: room.index,
      base,
      center: new THREE.Vector3(x, base + 7.8, z),
      state,
      petals: [],
      rings: [],
      instruments: [],
      targets: [],
      aperture: state.aperture,
      motion: 0,
    };
    const add = (geo, mat, px, py, pz, parent = root, capture = false) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    const block = (w, h, d, mat, px, py, pz, parent = root, capture = false) =>
      add(
        stoneBlockGeometry(
          w,
          h,
          d,
          room.index + Math.round(px * 7 + py * 13 + pz * 3),
        ),
        mat,
        px,
        py,
        pz,
        parent,
        capture,
      );
    const spring = 7.4,
      domeY = spring + Math.sin(Math.PI / 8) * radius + 0.35;
    const points = Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) * Math.PI) / 4;
      return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
    });
    for (const [i, p] of points.entries()) {
      const samples = [-1.25, 0, 1.25].flatMap((dx) =>
        [-1.25, 0, 1.25].map(
          (dz) => game.groundHeight(x + p.x + dx, z + p.z + dz) - base,
        ),
      );
      const ground = Math.max(...samples),
        floor = Math.min(...samples) - 0.2;
      block(
        2.5,
        ground - floor + 0.8,
        2.5,
        stone,
        p.x,
        (ground + floor + 0.8) / 2,
        p.z,
        root,
        true,
      );
      add(
        flutedColumnGeometry(Math.max(0.5, spring - ground - 1.1), 0.91),
        stone,
        p.x,
        ground + 0.6,
        p.z,
        root,
        true,
      );
      for (const h of [ground + 0.4, spring - 0.15])
        block(2.8, 0.42, 2.8, dark, p.x, h, p.z, detail);
      game.obstacles.push({
        x: x + p.x,
        z: z + p.z,
        w: 1.45,
        d: 1.45,
        h: base + spring + 0.1 - game.groundHeight(x + p.x, z + p.z),
        observatory: true,
      });
      const q = points[(i + 1) % 8],
        width = Math.hypot(q.x - p.x, q.z - p.z) / 2;
      const yaw = Math.atan2(-(q.z - p.z), q.x - p.x);
      for (let k = 0; k < 9; k++) {
        const arch = add(
          vaultStoneGeometry(
            width - 0.6,
            width + 0.1,
            (k * Math.PI) / 9 + 0.008,
            ((k + 1) * Math.PI) / 9 - 0.008,
            1.15,
            3,
          ),
          stone,
          (p.x + q.x) / 2,
          spring,
          (p.z + q.z) / 2,
          root,
          true,
        );
        arch.rotation.y = yaw;
      }
    }
    for (let i = 0; i < 16; i++) {
      const band = add(
        vaultStoneGeometry(
          radius - 0.65,
          radius + 0.5,
          (i * Math.PI) / 8 + 0.003,
          ((i + 1) * Math.PI) / 8 - 0.003,
          0.5,
          4,
        ),
        stone,
        0,
        domeY,
        0,
      );
      band.rotation.x = Math.PI / 2;
    }
    // Petal hinges sit on the supported cornice; opening exposes the actual oculus.
    for (let i = 0; i < 8; i++) {
      if ([4, 7].includes(room.index) && i === (room.index + 2) % 8) continue;
      const a = (i * Math.PI) / 4,
        pivot = new THREE.Group();
      pivot.userData.cameraDynamic = true;
      pivot.position.set(Math.cos(a) * radius, domeY, Math.sin(a) * radius);
      root.add(pivot);
      const geometry = domePanelGeometry(
        radius,
        [4.8, 5.6, 6.1, 5.2][room.index % 4],
        a - Math.PI / 8 + 0.012,
        a + Math.PI / 8 - 0.012,
      );
      geometry.translate(-pivot.position.x, 0, -pivot.position.z);
      add(geometry, bronze, 0, 0, 0, pivot, true);
      patch.petals.push({
        pivot,
        axis: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)),
      });
    }
    const ground = game.groundHeight(x, z) - base;
    add(
      new THREE.CylinderGeometry(3.15, 4, 3 - ground, 32),
      dark,
      0,
      (ground + 3) / 2,
      0,
      root,
      true,
    );
    game.obstacles.push({
      x,
      z,
      w: 3.8,
      d: 3.8,
      h: 3 - ground,
      observatory: true,
    });
    add(
      new THREE.CylinderGeometry(0.7, 1.2, 4.8, 24),
      bronze,
      0,
      5.3,
      0,
      root,
      true,
    );
    add(new THREE.SphereGeometry(0.9, 24, 16), dark, 0, 7.8, 0);
    for (let ring = 0; ring < 3; ring++) {
      const cradle = new THREE.Group(),
        wheel = new THREE.Group(),
        r = 3.15 + ring * 1.12;
      cradle.position.y = 7.8;
      cradle.rotation.set(
        Math.PI / 2 + [0.15, -0.42, 0.57][ring],
        0,
        [0, 0.3, -0.22][ring],
      );
      root.add(cradle);
      patch.instruments.push(cradle);
      wheel.userData.cameraDynamic = true;
      cradle.add(wheel);
      for (let i = 0; i < 8; i++)
        add(
          vaultStoneGeometry(
            r - 0.13,
            r + 0.13,
            (i * Math.PI) / 4,
            ((i + 1) * Math.PI) / 4,
            0.2,
            10,
          ),
          bronze,
          0,
          0,
          0,
          wheel,
          true,
        );
      for (let i = 0; i < 32; i++) {
        const a = (i * Math.PI) / 16,
          tick = add(
            new THREE.BoxGeometry(
              i % 4 ? 0.06 : 0.1,
              i % 4 ? 0.16 : 0.35,
              0.24,
            ),
            bronze,
            Math.sin(a) * (r + 0.17),
            Math.cos(a) * (r + 0.17),
            0,
            wheel,
          );
        tick.rotation.z = -a;
      }
      const planetMaterial = new THREE.MeshStandardMaterial({
        color: [0x8ba9ad, 0xd5af63, 0xc9d0c8][ring],
        roughness: 0.28,
        metalness: 0.5,
      });
      add(
        new THREE.SphereGeometry([0.38, 0.48, 0.32][ring], 20, 12),
        planetMaterial,
        0,
        r,
        0,
        wheel,
      );
      const needle = add(
        new THREE.ConeGeometry(0.19, 0.6, 4),
        glow,
        0,
        r + 0.65,
        0,
        wheel,
      );
      const target = new THREE.Group();
      target.rotation.z = (-state.target[ring] * Math.PI) / 4;
      cradle.add(target);
      add(new THREE.OctahedronGeometry(0.22), glow, 0, r + 1.1, 0, target);
      wheel.rotation.z = (-state.values[ring] * Math.PI) / 4;
      mergeArchitecture(wheel);
      patch.rings.push(wheel);
      patch.targets.push(target);
    }
    // The graduated meridian runs between the instrument and its control sanctuary.
    for (let i = 0; i < 18; i++) {
      const pz = z + 5 + i * 0.58,
        py = game.groundHeight(x, pz) + 0.045;
      block(
        i % 3 === 0 ? 1.2 : 0.48,
        0.04,
        0.07,
        bronze,
        0,
        py - base,
        pz - z,
        detail,
      );
    }
    mergeArchitecture(root);
    mergeArchitecture(detail);
    game.observatorySources.push({
      id: `orrery-${room.index}`,
      kind: "machine",
      x,
      y: base + 4.5,
      z: z + 4.15,
      gain: 0.22,
      near: 3,
      range: 32,
      observatoryRoom: room.index,
      channel: "gear",
      activity: 0.18,
    });
    game.observatorySources.push({
      id: `alignment-${room.index}`,
      kind: "crystal",
      x,
      y: base + 6,
      z: z + 4.15,
      gain: 0.2,
      near: 3,
      range: 36,
      observatoryRoom: room.index,
      channel: "tone",
      rate: 0.65 + room.index * 0.012,
      activity: state.glow,
    });
    game.observatories.push(patch);
  }
  updateObservatory(game, 100);
  return true;
}

export function updateObservatory(game, dt) {
  for (const patch of game.observatories || []) {
    const state = observatoryState(game.level, game.progress, patch.index);
    const before = patch.aperture;
    patch.aperture = THREE.MathUtils.damp(
      patch.aperture,
      state.aperture,
      1.8,
      dt,
    );
    patch.motion = Math.abs(patch.aperture - before) / Math.max(0.001, dt);
    for (const { pivot, axis } of patch.petals)
      pivot.quaternion.setFromAxisAngle(axis, -patch.aperture * Math.PI * 0.78);
    patch.rings.forEach((ring, i) => {
      const goal = (-state.values[i] * Math.PI) / 4;
      const delta =
        THREE.MathUtils.euclideanModulo(
          goal - ring.rotation.z + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      const step = delta * (1 - Math.exp(-5 * dt));
      ring.rotation.z += step;
      patch.motion += (Math.abs(step) / Math.max(0.001, dt)) * 0.14;
    });
    patch.state = state;
    const near =
      !game.player ||
      (game.orreryFocus != null && patch.index === game.orreryFocus + 1) ||
      patch.center.distanceTo(game.player.position) <
        (patch.detail.visible ? 105 : 95);
    patch.detail.visible = near;
    patch.instruments.forEach((instrument) => {
      instrument.visible = near;
    });
  }
}

export function focusObservatory(game) {
  if (
    game.orreryFocus === null ||
    game.orreryFocus === undefined ||
    !game.paused
  )
    return false;
  const patch = game.observatories?.find(
    (p) => p.index === game.orreryFocus + 1,
  );
  if (!patch) return false;
  const c = patch.center;
  const compact =
    game.renderer.domElement.clientWidth < 600 &&
    game.renderer.domElement.clientHeight > 560;
  const right = new THREE.Vector3(16, 0, -11).normalize();
  game.camera.position.set(c.x + 11, c.y + 22, c.z + 16);
  const target = c.clone().addScaledVector(right, compact ? 0 : 5);
  if (compact) {
    game.camera.lookAt(c);
    target.addScaledVector(
      new THREE.Vector3(0, 1, 0).applyQuaternion(game.camera.quaternion),
      -9,
    );
  }
  game.camera.lookAt(target);
  game.avatar.visible = true;
  return true;
}
