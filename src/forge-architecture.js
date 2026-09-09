import * as THREE from "three";
import { materialTextureLoader } from "./asset-loading.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  forgeGearGeometry,
  furnaceHoodGeometry,
  furnaceFlueGeometry,
} from "./forge-geometry.js";
import { forgeState } from "./forge-state.js";
import { moltenMaterial, forgePlume } from "./forge-effects.js";

export function forgePlan(room) {
  const i = room.index % 9;
  return {
    stacks: [14, 16, 12, 15, 13, 17, 14, 16, 20][i],
    crown: [12, 11.5, 12.8, 13.2, 11.8, 14, 12.4, 11.3, 15][i],
    kilns: [-16.5, 16.5].map((x) => ({ x, z: -21, w: 4, d: 3.5 })),
    piers: [-5.8, 5.8].map((x) => ({ x, z: -21, w: 1.25, d: 1.65 })),
  };
}

export function buildForgeArchitecture(game) {
  game.forgePatches = [];
  game.forgeSources = [];
  game.forgeLights = [];
  game.forgeTime = null;
  if (game.level.biome !== "volcano") return false;
  const time = (game.forgeTime = { value: game.elapsed || 0 });
  const stone = game.stoneMat;
  const metal = pbrMaterial("forge-metal", 0xc8cbcc);
  metal.name = "Corroded furnace steel";
  metal.normalScale.set(0.42, 0.42);
  metal.metalness = 1;
  metal.metalnessMap = materialTextureLoader().load(
    "/assets/textures/forge-metal-metalness.jpg",
  );
  metal.metalnessMap.wrapS = metal.metalnessMap.wrapT = THREE.RepeatWrapping;
  metal.metalnessMap.anisotropy = 8;
  let serial = game.level.seed;
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7,
      base = game.groundHeight(x, z),
      plan = forgePlan(room);
    const root = new THREE.Group(),
      detail = new THREE.Group(),
      effects = new THREE.Group();
    root.name = `Volcanic forge hall ${room.index}`;
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    effects.position.copy(root.position);
    game.world.add(root, detail, effects);
    const state = forgeState(game.progress, room.index);
    const heat = { value: state.heat },
      steam = { value: state.steam };
    const patch = {
      root,
      detail,
      effects,
      plan,
      state,
      heat,
      steam,
      gears: [],
      mouths: [],
      index: room.index,
      center: new THREE.Vector3(x, base + 5, z - 15),
    };
    const add = (
      geometry,
      material,
      px,
      py,
      pz,
      parent = root,
      capture = false,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    const block = (w, h, d, mat, px, py, pz, parent = root, capture = false) =>
      add(
        stoneBlockGeometry(w, h, d, ++serial),
        mat,
        px,
        py,
        pz,
        parent,
        capture,
      );
    const beam = (a, b, width, depth, material = stone, parent = root) => {
      const direction = b.clone().sub(a);
      const m = add(
        new THREE.BoxGeometry(width, direction.length(), depth),
        material,
        ...a.clone().add(b).multiplyScalar(0.5).toArray(),
        parent,
      );
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      game.cameraSurfaces?.capture(m);
      return m;
    };
    for (const p of plan.piers) {
      const ground = game.groundHeight(x + p.x, z + p.z) - base;
      block(
        2.5,
        8.7 - ground,
        3.3,
        stone,
        p.x,
        (ground + 8.7) / 2,
        p.z,
        root,
        true,
      );
      for (let y = Math.ceil(ground + 0.6); y < 8.7; y += 1.3)
        block(2.64, 0.14, 3.42, metal, p.x, y, p.z, detail);
      block(3.1, 0.42, 3.9, stone, p.x, 8.7, p.z);
      game.obstacles.push({
        x: x + p.x,
        z: z + p.z,
        w: p.w,
        d: p.d,
        h: 8.9 - ground,
        forge: true,
      });
      beam(
        new THREE.Vector3(p.x, 8.8, -21),
        new THREE.Vector3(0, plan.crown, -21),
        1.2,
        3.3,
      );
    }
    // A cross-shaft is suspended from the masonry crown. Gear teeth and spokes
    // are geometry; both wheels retain their ratio when objectives change speed.
    beam(
      new THREE.Vector3(0, plan.crown, -21),
      new THREE.Vector3(0, 9.3, -21),
      0.48,
      0.55,
      metal,
    );
    for (const [gx, radius, teeth] of [
      [0, 3.2, 24],
      [4.533, 1.333, 10],
    ]) {
      const group = new THREE.Group();
      group.position.set(gx, 9.3, -18.2);
      group.rotation.z = gx ? Math.PI / 10 : 0;
      root.add(group);
      add(forgeGearGeometry(radius, teeth), metal, 0, 0, 0, group);
      const hub = add(
        new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.78, 16),
        metal,
        0,
        0,
        0,
        group,
      );
      hub.rotation.x = Math.PI / 2;
      for (let spoke = 0; spoke < 6; spoke++) {
        const a = (spoke * Math.PI) / 3;
        const m = block(
          radius * 0.16,
          radius * 0.67,
          0.31,
          metal,
          Math.sin(a) * radius * 0.44,
          Math.cos(a) * radius * 0.44,
          0,
          group,
        );
        m.rotation.z = -a;
      }
      mergeArchitecture(group);
      patch.gears.push(group);
      const shaft = add(
        new THREE.CylinderGeometry(0.21, 0.21, 3.4, 12),
        metal,
        gx,
        9.3,
        -19.65,
      );
      shaft.rotation.x = Math.PI / 2;
    }
    game.forgeSources.push({
      id: `forge-gear-${room.index}`,
      kind: "machine",
      x,
      y: base + 9.3,
      z: z - 18.2,
      gain: 0.21,
      near: 3,
      range: 30,
      forgeRoom: room.index,
      forgeChannel: "motion",
      activity: state.motion,
    });

    for (const [side, kiln] of plan.kilns.entries()) {
      const px = kiln.x,
        pz = kiln.z;
      const centerGround = game.groundHeight(x + px, z + pz) - base;
      // Courts blend into sloping volcanic ground. Seat the firebox above the
      // highest edge, with a solid foundation down to the lowest sampled edge.
      const heights = [-3.9, 0, 3.9].flatMap((dx) =>
        [-3.4, 0, 3.62].map(
          (dz) => game.groundHeight(x + px + dx, z + pz + dz) - base,
        ),
      );
      const ground = Math.max(centerGround, ...heights),
        lower = Math.min(centerGround, ...heights) - 0.15;
      block(
        8,
        ground - lower + 0.08,
        7,
        stone,
        px,
        (ground + lower) / 2,
        pz,
        root,
        true,
      );
      const top = ground + 6.2;
      // Three solid walls and a recessed firebox framed by front jambs.
      for (const sx of [-1, 1]) {
        block(
          1.25,
          6.2,
          7,
          stone,
          px + sx * 3.375,
          ground + 3.1,
          pz,
          root,
          true,
        );
        block(
          2.3,
          3.8,
          0.9,
          stone,
          px + sx * 2.85,
          ground + 2.9,
          pz + 3.05,
          root,
          true,
        );
      }
      block(5.5, 6.2, 1, stone, px, ground + 3.1, pz - 3, root, true);
      block(5.5, 1, 6, stone, px, ground + 0.5, pz);
      block(5.5, 1.4, 6.2, stone, px, ground + 5.5, pz, root, true);
      for (const y of [1, 4.8, 6.2])
        block(8.15, 0.18, 7.15, metal, px, ground + y, pz);
      const mouth = add(
        new THREE.PlaneGeometry(3.35, 3.7),
        moltenMaterial(time, heat),
        px,
        ground + 2.87,
        pz + 2.72,
        effects,
      );
      mouth.castShadow = false;
      for (let bar = -2; bar <= 2; bar++)
        block(0.12, 3.85, 0.2, metal, px + bar * 0.63, ground + 2.9, pz + 3.18);
      block(3.6, 0.16, 0.2, metal, px, ground + 2.65, pz + 3.2);
      add(furnaceHoodGeometry(), metal, px, top + 1.8, pz, root, true);
      const chimneyBase = top + 3.6;
      const chimneyTop = Math.max(
        chimneyBase + 2.5,
        ground + plan.stacks + side * 2.1,
      );
      add(
        furnaceFlueGeometry(chimneyTop - chimneyBase),
        metal,
        px,
        chimneyBase,
        pz,
        root,
        true,
      );
      for (let y = chimneyBase; y <= chimneyTop + 0.01; y += 1.5) {
        const ring = add(
          new THREE.TorusGeometry(1.42, 0.11, 6, 8),
          metal,
          px,
          y,
          pz,
          detail,
        );
        ring.rotation.x = Math.PI / 2;
        for (let bolt = 0; bolt < 8; bolt++) {
          const a = (bolt * Math.PI) / 4;
          add(
            new THREE.IcosahedronGeometry(0.095, 0),
            metal,
            px + Math.cos(a) * 1.46,
            y,
            pz + Math.sin(a) * 1.46,
            detail,
          );
        }
      }
      // Inner return pipe remains overhead; the small outlet beneath it is where
      // white steam and the local pressure hiss actually originate.
      const sign = Math.sign(px);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px - sign * 2.8, top + 1.3, pz),
        new THREE.Vector3(px - sign * 4.2, top + 2, pz),
        new THREE.Vector3(sign * 8.8, 10.7, pz),
        new THREE.Vector3(sign * 5.8, 8.9, pz),
      ]);
      add(new THREE.TubeGeometry(curve, 18, 0.3, 10, false), metal, 0, 0, 0);
      const outletX = px - sign * 3.5;
      const outlet = add(
        new THREE.CylinderGeometry(0.3, 0.3, 1.4, 12, 1, true),
        metal,
        outletX,
        top + 0.2,
        pz + 0.5,
      );
      const smoke = forgePlume(time, heat, false, room.index * 2 + side);
      smoke.position.set(px, chimneyTop - 0.08, pz);
      const mist = forgePlume(time, steam, true, room.index * 2 + side);
      mist.position.set(outletX, outlet.position.y + 0.7, pz + 0.5);
      effects.add(smoke, mist);
      const position = new THREE.Vector3(
        x + px,
        base + ground + 2.87,
        z + pz + 3.62,
      );
      patch.mouths.push(position);
      game.forgeSources.push({
        id: `furnace-${room.index}-${side}`,
        kind: "lava",
        ...Object.fromEntries(["x", "y", "z"].map((a) => [a, position[a]])),
        gain: 0.45,
        near: 3,
        range: 40,
        forgeRoom: room.index,
        forgeChannel: "heat",
        activity: state.heat,
      });
      game.forgeSources.push({
        id: `coolant-${room.index}-${side}`,
        kind: "steam",
        x: x + mist.position.x,
        y: base + mist.position.y,
        z: z + mist.position.z,
        gain: 0.16,
        near: 2,
        range: 22,
        forgeRoom: room.index,
        forgeChannel: "steam",
        activity: state.steam,
      });
      game.obstacles.push({
        x: x + px,
        z: z + pz,
        w: kiln.w,
        d: kiln.d,
        h: ground + 6.2 - centerGround,
        forge: true,
      });
      game.obstacles.push({
        x: x + px,
        z: z + pz,
        w: 1.38,
        d: 1.38,
        h: chimneyTop - centerGround,
        forge: true,
      });
    }
    mergeArchitecture(root);
    mergeArchitecture(detail);
    patch.triangles = 0;
    root.traverse((m) => {
      if (m.geometry)
        patch.triangles +=
          (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
    });
    game.forgePatches.push(patch);
  }
  game.forgeLights = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xff812d, 0, 18, 2);
    game.world.add(light);
    return light;
  });
  return true;
}

export function updateForgeArchitecture(game, dt) {
  if (!game.forgeTime) return;
  game.forgeTime.value = game.elapsed;
  const lights = [];
  for (const patch of game.forgePatches) {
    const target = forgeState(game.progress, patch.index);
    const blend = 1 - Math.exp(-Math.max(0, dt) * 0.9);
    for (const channel of ["heat", "motion", "steam"])
      patch.state[channel] += (target[channel] - patch.state[channel]) * blend;
    patch.heat.value = patch.state.heat;
    patch.steam.value = patch.state.steam;
    patch.gears[0].rotation.z += dt * patch.state.motion * 0.24;
    patch.gears[1].rotation.z =
      (-patch.gears[0].rotation.z * 24) / 10 + Math.PI / 10;
    const distance = patch.center.distanceTo(game.player.position);
    const range = game.store.data.settings.quality === "low" ? 55 : 90;
    patch.detail.visible = distance < range + (patch.detail.visible ? 5 : 0);
    patch.effects.visible = distance < 145;
    for (const position of patch.mouths) {
      const d = position.distanceTo(game.player.position);
      if (d < 40)
        lights.push({
          position,
          heat: patch.state.heat,
          score: patch.state.heat / (d + 2),
        });
    }
  }
  for (const position of game.pressureRelay?.art?.heatLights || []) {
    const d = position.distanceTo(game.player.position);
    if (d < 40) lights.push({ position, heat: 0.55, score: 0.55 / (d + 2) });
  }
  lights.sort((a, b) => b.score - a.score);
  game.forgeLights.forEach((light, i) => {
    const selected = lights[i];
    // Keep the fixed light slots alive so changing distance does not recompile
    // every scene material as furnaces enter and leave view.
    light.intensity = selected ? 48 * selected.heat * selected.heat : 0;
    if (selected) light.position.copy(selected.position);
  });
}
