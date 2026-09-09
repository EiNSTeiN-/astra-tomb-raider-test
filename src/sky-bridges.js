import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { bridgeGust, updateSkyGusts } from "./sky-gusts.js";
import {
  skyStreamerMaterial,
  buildSkyStreamers,
  updateSkyStreamers,
} from "./sky-streamers.js";
import {
  bridgeArtMaterials,
  bridgeBoardGeometry,
  bridgeRopeGeometry,
  bridgeRope,
  bridgeLashingGeometry,
  buildBridgeAnchor,
  prepareBridgeGeometry,
} from "./sky-bridge-art.js";
import {
  bridgeDeployed,
  bridgeDeckY,
  bridgeHasGap,
  spanCoordinates,
  skyDeckAt,
} from "./sky-bridge-rules.js";

export function buildSkyBridges(game) {
  game.skyBridges = [];
  game.skyBridgeSources = [];
  game.skyTether = null;
  game.skyWind = null;
  if (game.level.biome !== "sky") return;
  const materials = bridgeArtMaterials();
  const streamerMaterial = skyStreamerMaterial();
  const { wood, rope } = materials;
  for (const plan of game.terrainProfile.bridges) {
    const c = spanCoordinates(plan, plan.bx, plan.bz),
      yaw = Math.atan2(c.ux, c.uz);
    const root = new THREE.Group(),
      detail = new THREE.Group();
    root.name = plan.id;
    root.position.set(plan.ax, plan.ay, plan.az);
    root.rotation.y = yaw;
    detail.position.copy(root.position);
    detail.rotation.y = yaw;
    game.world.add(root, detail);
    const bridge = {
      ...plan,
      root,
      detail,
      open: Number(bridgeDeployed(game.progress, plan)),
      halves: [],
      deckDetails: [],
      drums: [],
      driveActivity: 0,
      lastBank: "a",
      gust: bridgeGust(plan, 0),
    };
    const add = (
      geometry,
      material,
      x,
      y,
      z,
      parent = root,
      capture = false,
    ) => {
      const m = new THREE.Mesh(
        prepareBridgeGeometry(geometry, material, materials),
        material,
      );
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      if (capture) game.cameraSurfaces?.capture(m);
      return m;
    };
    const box = (w, h, d, material, x, y, z, parent = root, capture = false) =>
      add(
        stoneBlockGeometry(w, h, d, plan.stage * 37 + x * 9 + z),
        material,
        x,
        y,
        z,
        parent,
        capture,
      );
    for (const [end, sign] of [
      [0, 1],
      [c.length, -1],
    ]) {
      buildBridgeAnchor({ bridge, c, end, sign, game, m: materials, add, box });
    }
    // Each half folds up from a bank. A pair of anchored suspension cables
    // remains visible above the lowered boards once the associated winch is set.
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 2.55, 5.7, -0.49),
        ...Array.from({ length: 33 }, (_, i) => {
          const s = (i / 32) * c.length;
          return new THREE.Vector3(
            side * 2.55,
            bridgeDeckY(bridge, s) -
              plan.ay +
              1.5 +
              4.2 * Math.pow(Math.abs(i / 16 - 1), 2),
            s,
          );
        }),
        new THREE.Vector3(
          side * 2.55,
          plan.by - plan.ay + 5.7,
          c.length + 0.49,
        ),
      ]);
      add(bridgeRopeGeometry(curve, 0.085, 96), rope, 0, 0, 0);
      const handlinePoints = [
        new THREE.Vector3(side * 2.55, 1.5, -0.49),
        ...Array.from(
          { length: 33 },
          (_, i) =>
            new THREE.Vector3(
              side * 2.55,
              bridgeDeckY(bridge, (i / 32) * c.length) - plan.ay + 1.5,
              (i / 32) * c.length,
            ),
        ),
        new THREE.Vector3(
          side * 2.55,
          plan.by - plan.ay + 1.5,
          c.length + 0.49,
        ),
      ];
      add(
        bridgeRopeGeometry(
          new THREE.CatmullRomCurve3(handlinePoints),
          0.05,
          48,
          6,
        ),
        rope,
        0,
        0,
        0,
      );
      // A permanent rope cradle stays under the independently folding boards.
      add(
        bridgeRope(
          Array.from({ length: 33 }, (_, i) => {
            const s = (i / 32) * c.length;
            return [side * 2.55, bridgeDeckY(bridge, s) - plan.ay - 0.23, s];
          }),
          0.07,
          48,
          6,
        ),
        rope,
        0,
        0,
        0,
      );
      for (let s = 1.5; s < c.length; s += 2.8) {
        const floor = bridgeDeckY(bridge, s) - plan.ay,
          top =
            floor + 1.5 + 4.2 * Math.pow(Math.abs((s / c.length) * 2 - 1), 2);
        add(
          bridgeRope(
            [
              [side * 2.55, floor - 0.23, s],
              [side * 2.55, top, s],
            ],
            0.032,
            2,
          ),
          rope,
          0,
          0,
          0,
          detail,
        );
        for (const y of [floor - 0.23, floor + 1.5, top]) {
          const tie = add(
            new THREE.TorusGeometry(0.093, 0.025, 4, 8),
            rope,
            side * 2.55,
            y,
            s,
            detail,
          );
        }
      }
    }
    for (let half = 0; half < 2; half++) {
      const pivot = new THREE.Group();
      pivot.userData.cameraDynamic = true;
      pivot.rotation.order = "YXZ";
      pivot.position.set(0, half ? plan.by - plan.ay : 0, half ? c.length : 0);
      pivot.rotation.y = half ? Math.PI : 0;
      root.add(pivot);
      bridge.halves.push(pivot);
      const deckDetail = new THREE.Group();
      pivot.add(deckDetail);
      bridge.deckDetails.push(deckDetail);
      const count = Math.ceil(c.length / 0.8),
        step = c.length / count;
      for (let index = 0; index < count; index++) {
        const s = (index + 0.5) * step;
        if (Number(s >= c.length / 2) !== half || bridgeHasGap(bridge, s))
          continue;
        const local = half ? c.length - s : s,
          y = bridgeDeckY(bridge, s) - (half ? plan.by : plan.ay);
        const warning = bridge.gaps.some(
          (g) =>
            Math.abs(s - g.start) < step * 1.5 ||
            Math.abs(s - g.end) < step * 1.5,
        );
        const plank = add(
          bridgeBoardGeometry(
            plan.width,
            step * 0.95,
            game.level.seed + plan.stage * 101 + index,
            warning,
          ),
          wood,
          0,
          y - 0.095,
          local,
          pivot,
        );
        const slope =
          (bridgeDeckY(bridge, s + 0.05) - bridgeDeckY(bridge, s - 0.05)) / 0.1;
        plank.rotation.x = (half ? 1 : -1) * Math.atan(slope);
        game.cameraSurfaces?.capture(plank);
        const pairPrevious =
          index % 2 === 1 &&
          Number(s - step >= c.length / 2) === half &&
          !bridgeHasGap(bridge, s - step);
        if (!pairPrevious) {
          const pairNext =
            index % 2 === 0 &&
            s + step < c.length &&
            Number(s + step >= c.length / 2) === half &&
            !bridgeHasGap(bridge, s + step);
          const tieS = s + (pairNext ? step / 2 : 0);
          const tieY = bridgeDeckY(bridge, tieS) - (half ? plan.by : plan.ay);
          for (const side of [-1, 1]) {
            const lashing = add(
              bridgeLashingGeometry(step * (pairNext ? 1.95 : 0.95), index),
              rope,
              side * 2.13,
              tieY - 0.095,
              half ? c.length - tieS : tieS,
              deckDetail,
            );
            lashing.rotation.x = plank.rotation.x;
          }
        }
        if (index % 4 === 0) {
          const bearer = box(5.2, 0.12, 0.18, wood, 0, y - 0.23, local, pivot);
          bearer.rotation.x = plank.rotation.x;
        }
      }
      for (const side of [-1, 1]) {
        const points = Array.from({ length: 25 }, (_, i) => {
          const local = ((i / 24) * c.length) / 2;
          const s = half ? c.length - local : local;
          return [
            side * 2.13,
            bridgeDeckY(bridge, s) - (half ? plan.by : plan.ay) - 0.23,
            local,
          ];
        });
        add(bridgeRope(points, 0.045, 48), rope, 0, 0, 0, deckDetail);
      }
      mergeArchitecture(deckDetail);
      mergeArchitecture(pivot);
    }
    for (const { rotor } of bridge.drums) mergeArchitecture(rotor);
    mergeArchitecture(root);
    mergeArchitecture(detail);
    buildSkyStreamers(bridge, streamerMaterial);
    const middle = c.length / 2;
    game.skyBridgeSources.push({
      id: `${plan.id}-wind`,
      kind: "wind",
      x: (plan.ax + plan.bx) / 2,
      y: bridgeDeckY(bridge, middle) + 2,
      z: (plan.az + plan.bz) / 2,
      gain: 0.32,
      range: 55,
      near: 3,
      skyBridgeWind: plan.id,
      activity: bridge.gust.activity,
    });
    game.skyBridgeSources.push({
      id: `${plan.id}-rope`,
      kind: "rope",
      x: (plan.ax + plan.bx) / 2,
      y: bridgeDeckY(bridge, middle) + 1,
      z: (plan.az + plan.bz) / 2,
      gain: 0.18,
      range: 25,
      near: 3,
      skyBridge: plan.id,
      activity: bridge.open,
    });
    for (const [i, { rotor, sign }] of bridge.drums.entries()) {
      const position = rotor.position.clone();
      position.z += sign * 0.4;
      detail.localToWorld(position);
      game.skyBridgeSources.push({
        id: `${plan.id}-drum-${i}`,
        kind: "rope",
        x: position.x,
        y: position.y,
        z: position.z,
        gain: 0.14,
        near: 2,
        range: 22,
        skyBridgeDrum: plan.id,
        activity: 0,
      });
    }
    game.skyBridges.push(bridge);
    poseBridge(bridge);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(33 * 3), 3),
  );
  const tether = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xc8b481,
      transparent: true,
      opacity: 0.85,
    }),
  );
  tether.frustumCulled = false;
  tether.visible = false;
  game.world.add(tether);
  game.skyTether = tether;
}

function poseBridge(bridge) {
  for (const pivot of bridge.halves)
    pivot.rotation.x = -(1 - bridge.open) * Math.PI * 0.47;
  for (const { rotor, side, sign } of bridge.drums)
    rotor.rotation.x = bridge.open * Math.PI * 6 * side * sign;
}

export function updateSkyBridges(game, dt) {
  if (!game.skyBridges?.length) return;
  if (game.paused) dt = 0;
  updateSkyGusts(game);
  let tether = null;
  for (const bridge of game.skyBridges) {
    const target = Number(bridgeDeployed(game.progress, bridge));
    bridge.open = THREE.MathUtils.damp(bridge.open, target, 1.7, dt);
    if (Math.abs(bridge.open - target) < 0.001) bridge.open = target;
    bridge.driveActivity =
      bridge.open > 0 && bridge.open < 1
        ? Math.min(1, Math.abs(target - bridge.open) * 3 + 0.15)
        : 0;
    poseBridge(bridge);
    const p = spanCoordinates(
      bridge,
      game.player.position.x,
      game.player.position.z,
    );
    bridge.activity =
      0.18 +
      0.18 * (0.5 + 0.5 * Math.sin(game.elapsed * 0.8 + bridge.stage)) +
      (bridge.open > 0 && bridge.open < 1 ? 0.6 : 0) +
      (p.along >= 0 &&
      p.along <= p.length &&
      Math.abs(p.across) < bridge.width / 2
        ? 0.5
        : 0);
    bridge.detail.visible = Math.hypot(p.along - p.length / 2, p.across) < 85;
    bridge.streamers.mesh.visible =
      Math.hypot(p.along - p.length / 2, p.across) < 110;
    if (!game.paused) updateSkyStreamers(bridge, game.elapsed);
    for (const detail of bridge.deckDetails)
      detail.visible = Math.hypot(p.along - p.length / 2, p.across) < 48;
    if (Math.abs(p.across) < 5 && p.along >= -3 && p.along <= p.length + 3) {
      if (p.along < 1.5 && game.grounded) bridge.lastBank = "a";
      if (p.along > p.length - 1.5 && game.grounded) bridge.lastBank = "b";
      if (
        p.along >= 0 &&
        p.along <= p.length &&
        game.player.position.y > bridgeDeckY(bridge, p.along) - 6
      )
        tether = bridge;
    }
  }
  game.skyTether.visible = !!tether;
  if (tether) {
    const end = tether.lastBank === "b",
      p = spanCoordinates(tether, tether.bx, tether.bz);
    const a = new THREE.Vector3(
      end ? tether.bx : tether.ax,
      (end ? tether.by : tether.ay) + 1.5,
      end ? tether.bz : tether.az,
    );
    a.x += p.uz * 2.55;
    a.z -= p.ux * 2.55;
    const b = game.player.position.clone().add(new THREE.Vector3(0, 1, 0));
    const points = game.skyTether.geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const t = i / (points.count - 1),
        v = a.clone().lerp(b, t);
      v.y -= Math.sin(Math.PI * t) * 0.65;
      points.setXYZ(i, v.x, v.y, v.z);
    }
    points.needsUpdate = true;
  }
}

export function recoverSkyBridgeFall(game) {
  for (const bridge of game.skyBridges || []) {
    const p = spanCoordinates(
      bridge,
      game.player.position.x,
      game.player.position.z,
    );
    if (
      p.along < 0 ||
      p.along > p.length ||
      Math.abs(p.across) > 7 ||
      game.player.position.y >= bridgeDeckY(bridge, p.along) - 5.5
    )
      continue;
    const end = bridge.lastBank === "b",
      sign = end ? 1 : -1;
    const x = (end ? bridge.bx : bridge.ax) + p.ux * sign * 3,
      z = (end ? bridge.bz : bridge.az) + p.uz * sign * 3;
    game.player.position.set(x, game.groundHeight(x, z), z);
    game.jumpY = 0;
    game.velocityY = 0;
    game.grounded = true;
    game.airVelocity = null;
    game.fallPeak = game.player.position.y;
    game.motionLanding = null;
    game.stamina = Math.max(25, game.stamina - 12);
    game.audio.noiseHit?.(0.025, 0.3, 750, game.player.position);
    game.cb.toast?.(
      "Your safety tether caught you. Resume from the last bridge anchor.",
      4000,
    );
    return true;
  }
  return false;
}

export function restoreSkyBridgeArrival(game) {
  const player = game.player.position;
  for (const bridge of game.skyBridges || []) {
    const p = spanCoordinates(bridge, player.x, player.z);
    if (p.along < 0 || p.along > p.length || Math.abs(p.across) > 4.5) continue;
    bridge.lastBank = p.along > p.length / 2 ? "b" : "a";
    const floor = skyDeckAt(game, player.x, player.z);
    if (floor && Math.abs(player.y - floor.height) < 0.25) return;
    // A save made during a jump or a fall resumes at a secure bank; never load
    // below the deck, or place a player in midair above missing boards.
    const end = bridge.lastBank === "b",
      sign = end ? 1 : -1;
    const x = (end ? bridge.bx : bridge.ax) + p.ux * sign * 3,
      z = (end ? bridge.bz : bridge.az) + p.uz * sign * 3;
    player.set(x, game.groundHeight(x, z), z);
    game.jumpY = 0;
    game.velocityY = 0;
    game.grounded = true;
    game.fallPeak = player.y;
    return;
  }
}

export function skyBridgeHint(game) {
  for (const bridge of game.skyBridges || []) {
    const p = spanCoordinates(
      bridge,
      game.player.position.x,
      game.player.position.z,
    );
    if (Math.abs(p.across) > 4 || p.along < -3 || p.along > p.length + 3)
      continue;
    if (bridge.open < 0.995)
      return {
        key: "",
        label: bridgeDeployed(game.progress, bridge)
          ? "The crossing is unfolding"
          : "Restore the marked anchor to lower this crossing",
      };
    const gap = bridge.gaps.find(
      (g) =>
        Math.min(Math.abs(p.along - g.start), Math.abs(p.along - g.end)) < 4,
    );
    if (gap)
      return {
        key: "Space",
        label:
          bridge.gust.strength > 0.25
            ? "Jump the gap · steer into the crosswind"
            : "Jump the missing boards · your safety tether is attached",
      };
    return {
      key: "B",
      label: game.crouching
        ? "Braced against the wind · stand to jump"
        : bridge.gust.warning > 0.1
          ? "Streamers rising · crouch to brace for the gust"
          : bridge.gust.strength > 0.25
            ? "Crosswind · crouch to brace or steer against the streamers"
            : "Watch the streamers · crouch to brace, stand to jump",
    };
  }
  return null;
}
