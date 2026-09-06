import * as THREE from "three";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { restorePuzzle, applyMove, isSolved } from "./puzzles.js";
import {
  HYDRAULIC_TRIALS,
  CISTERN_NAMES,
  hydraulicMessage,
  normalizeHydraulics,
} from "./hydraulic-rules.js";
import {
  cisternRadius,
  cisternGeometry,
  hydraulicPlaque,
  hydraulicStreamMaterial,
  CISTERN_DEPTH,
  CISTERN_FLOOR,
} from "./hydraulic-geometry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { waterMaterial } from "./water-surface.js";
import { poseHands } from "./pose.js";

export function hydraulicReady(game, site) {
  return (
    !!site &&
    !game.progress.completed &&
    game.progress.stage === site.stage &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}
export function buildHydraulicCourts(game) {
  game.hydraulicSites = [];
  game.hydraulicSources = [];
  game.hydraulicFocus = null;
  game.hydraulicGrip = null;
  if (game.level.biome !== "water") return false;
  game.hydraulicTime = { value: 0 };
  const stone = pbrMaterial("palace-stone", 0xc9c9b1),
    bronze = patinatedBronze(),
    dark = pbrMaterial("palace-mosaic", 0x799d94),
    stream = hydraulicStreamMaterial(game.hydraulicTime);
  stone.normalScale.set(0.35, 0.35);
  dark.normalScale.set(0.3, 0.3);
  const water = waterMaterial(game, { width: 3, length: 3, x: 0, z: 0 });
  water.name = "Cistern water";
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const stage = feature.stage,
      trial = HYDRAULIC_TRIALS[stage],
      state = restorePuzzle(
        game.level,
        stage,
        game.progress.hydraulics?.[stage],
      );
    const completed = game.progress.completed || stage < game.progress.stage;
    if (completed) {
      state.values = [...state.target];
      state.selected = null;
    }
    const root = new THREE.Group(),
      detail = new THREE.Group();
    root.name = trial.title;
    root.position.copy(feature.group.position);
    root.add(detail);
    game.world.add(root);
    const site = {
      stage,
      feature,
      trial,
      state,
      root,
      detail,
      tanks: [],
      pipes: [],
      flow: null,
      visualTime: 0,
      display: [...state.values],
      active: false,
    };
    const floor = (x, z) =>
      game.groundHeight(root.position.x + x, root.position.z + z) -
      root.position.y;
    const add = (g, m, x, y, z, parent = root, capture = false) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    let serial = game.level.seed + stage * 821;
    const block = (w, h, d, m, x, y, z, parent = root, capture = false) =>
      add(stoneBlockGeometry(w, h, d, ++serial), m, x, y, z, parent, capture);
    const source = (id, kind, x, y, z, extra = {}) => {
      const s = {
        id: `hydraulic-${stage}-${id}`,
        kind,
        x: root.position.x + x,
        y: root.position.y + y,
        z: root.position.z + z,
        hydraulicStage: stage,
        activity: 0,
        ...extra,
      };
      game.hydraulicSources.push(s);
      return s;
    };
    const control = (index, kind, x, z) => {
      const group = new THREE.Group();
      group.position.set(
        root.position.x + x,
        game.groundHeight(root.position.x + x, root.position.z + z),
        root.position.z + z,
      );
      game.world.add(group);
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14),
        game.glowMat,
      );
      marker.position.y = 3.4;
      group.add(marker);
      const f = {
        id: `hydraulic-${stage}-${kind === "tablet" ? "tablet" : index}`,
        type: "hydraulic",
        kind,
        index,
        stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        group,
        marker,
        label:
          kind === "tablet"
            ? "Read the royal measure"
            : `Operate cistern ${CISTERN_NAMES[index]}`,
      };
      game.items.push(f);
      return f;
    };
    // The court occupies dry paving beyond the reservoir and the gate approach.
    for (let i = 0; i < 3; i++) {
      const [x, z] = trial.positions[i],
        y = floor(x, z),
        variant = (stage + i) % 3,
        r = cisternRadius(state.capacity[i], variant),
        tank = new THREE.Group();
      tank.name = `Cistern ${CISTERN_NAMES[i]}`;
      tank.position.set(x, y, z);
      root.add(tank);
      let low = 0;
      for (let n = 0; n < 16; n++)
        low = Math.min(
          low,
          floor(
            x + Math.cos((n * Math.PI) / 8) * (r + 0.4),
            z + Math.sin((n * Math.PI) / 8) * (r + 0.4),
          ) - y,
        );
      add(
        new THREE.CylinderGeometry(
          r + 0.4,
          r + 0.44,
          0.3 - low,
          variant === 1 ? 12 : 48,
        ),
        dark,
        0,
        (low + 0.3) / 2,
        0,
        tank,
      );
      add(
        cisternGeometry(state.capacity[i], variant),
        stone,
        0,
        0,
        0,
        tank,
        true,
      );
      add(
        new THREE.TorusGeometry(r + 0.14, 0.055, 7, variant === 1 ? 12 : 64),
        bronze,
        0,
        3.04,
        0,
        tank,
      ).rotation.x = Math.PI / 2;
      const obstacle = {
        x: root.position.x + x,
        z: root.position.z + z,
        w: r + 0.39,
        d: r + 0.39,
        h: 3.06,
      };
      game.obstacles.push(obstacle);
      // Volume markers, an engraved target and a floating indicator share a scale.
      const gaugeX = -r * 0.55,
        gaugeZ = r + 0.185;
      block(0.12, CISTERN_DEPTH + 0.14, 0.1, bronze, gaugeX, 1.8, gaugeZ, tank);
      for (let n = 0; n <= state.capacity[i]; n++)
        block(
          n % 5 === 0 ? 0.3 : 0.2,
          0.027,
          0.045,
          bronze,
          gaugeX,
          CISTERN_FLOOR + (n / state.capacity[i]) * CISTERN_DEPTH,
          gaugeZ + 0.065,
          tank,
        );
      const goal = add(
        new THREE.ConeGeometry(0.13, 0.3, 4),
        game.glowMat,
        gaugeX - 0.27,
        CISTERN_FLOOR + (state.target[i] / state.capacity[i]) * CISTERN_DEPTH,
        gaugeZ + 0.08,
        tank,
      );
      goal.rotation.z = -Math.PI / 2;
      const float = add(
        new THREE.SphereGeometry(0.1, 12, 8),
        new THREE.MeshStandardMaterial({
          color: 0x8ec7c3,
          emissive: 0x164645,
          emissiveIntensity: 0.45,
          metalness: 0.4,
          roughness: 0.3,
        }),
        gaugeX + 0.18,
        0,
        gaugeZ + 0.09,
        tank,
      );
      float.userData.animated = true;
      const plaque = hydraulicPlaque(
        `${CISTERN_NAMES[i]} · ${state.capacity[i]} UNITS`,
        r * 2 + 0.4,
      );
      plaque.position.set(0, 3.38, r + 0.12);
      tank.add(plaque);
      const target = hydraulicPlaque(`MEASURE ${state.target[i]}`, r * 1.7);
      target.position.set(0, 0.5, r + 0.36);
      tank.add(target);
      const body = new THREE.CircleGeometry(r - 0.025, variant === 1 ? 12 : 64);
      body.setAttribute(
        "bedHeight",
        new THREE.Float32BufferAttribute(
          Array(body.attributes.position.count).fill(
            root.position.y + y + CISTERN_FLOOR,
          ),
          1,
        ),
      );
      const surface = add(
        body,
        water,
        0,
        CISTERN_FLOOR + (state.values[i] / state.capacity[i]) * CISTERN_DEPTH,
        0,
        tank,
      );
      surface.rotation.x = -Math.PI / 2;
      surface.castShadow = false;
      surface.userData.animated = true;
      // Each handwheel controls a pressure-driven intake at its own cistern.
      const pumpZ = r + 0.65;
      block(0.74, 0.45, 0.6, dark, 0, 0.225, pumpZ, tank);
      block(0.32, 1.02, 0.27, bronze, 0, 0.95, pumpZ, tank);
      const wheel = new THREE.Group();
      wheel.position.set(0, 1.35, pumpZ + 0.13);
      tank.add(wheel);
      add(new THREE.TorusGeometry(0.38, 0.055, 8, 36), bronze, 0, 0, 0, wheel);
      add(
        new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12),
        bronze,
        0,
        0,
        0,
        wheel,
      ).rotation.x = Math.PI / 2;
      for (let n = 0; n < 4; n++) {
        const spoke = block(0.06, 0.64, 0.08, bronze, 0, 0, 0, wheel);
        spoke.rotation.z = (n * Math.PI) / 4;
      }
      const handles = [-0.27, 0.27].map((dx) => {
        add(
          new THREE.CylinderGeometry(0.035, 0.035, 0.17, 8),
          bronze,
          dx,
          0,
          0.13,
          wheel,
        ).rotation.x = Math.PI / 2;
        const anchor = new THREE.Object3D();
        anchor.position.set(dx, 0, 0.13);
        wheel.add(anchor);
        return anchor;
      });
      mergeArchitecture(wheel);
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z + pumpZ,
        w: 0.44,
        d: 0.43,
        h: 1.1,
      });
      const handle = control(i, "pump", x, z + r + 1.37);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0x587879,
        emissive: 0x183b37,
        emissiveIntensity: 0.15,
        roughness: 0.35,
        metalness: 0.4,
      });
      const lamp = add(
        new THREE.SphereGeometry(0.11, 12, 8),
        lampMat,
        0.55,
        1.65,
        pumpZ,
        tank,
      );
      const nozzle = v(0, 3.65, -r * 0.32);
      const streamMesh = add(
        new THREE.CylinderGeometry(0.07, 0.1, 1, 10, 8, true),
        stream,
        nozzle.x,
        0,
        nozzle.z,
        tank,
      );
      streamMesh.userData.animated = true;
      streamMesh.castShadow = false;
      streamMesh.visible = false;
      const ripple = add(
        new THREE.TorusGeometry(0.29, 0.018, 5, 36),
        new THREE.MeshBasicMaterial({
          color: 0xc4e0d3,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
        nozzle.x,
        0,
        nozzle.z,
        tank,
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.userData.animated = true;
      ripple.visible = false;
      // Solid pickup and separate falling outlet make the water route legible.
      const pickup = new THREE.CatmullRomCurve3([
        v(r * 0.55, 0.82, 0),
        v(r * 0.55, 3.2, 0),
        v(r * 0.35, 3.58, 0),
        nozzle,
      ]);
      add(
        new THREE.TubeGeometry(pickup, 24, 0.075, 8, false),
        bronze,
        0,
        0,
        0,
        tank,
      );
      const record = {
        group: tank,
        radius: r,
        variant,
        control: handle,
        wheel,
        handles,
        goal,
        float,
        surface,
        lamp,
        stream: streamMesh,
        ripple,
        nozzle,
        display: state.values[i],
        pump: source(`pump-${i}`, "machine", x, y + 1.4, z + pumpZ + 0.35, {
          tankIndex: i,
          channel: "pump",
          near: 1.5,
          range: 24,
          gain: 0.22,
        }),
        outlet: source(`water-${i}`, "stream", x, y + 3.3, z + nozzle.z, {
          tankIndex: i,
          channel: "water",
          near: 1.5,
          range: 26,
          gain: 0.32,
        }),
      };
      mergeArchitecture(tank);
      site.tanks.push(record);
    }
    // Three supported overhead branches, with actual permitted flow arrows.
    for (const [edge, [a, b]] of [
      [0, [0, 1]],
      [1, [1, 2]],
      [2, [0, 2]],
    ]) {
      const ta = site.tanks[a],
        tb = site.tanks[b],
        pa = ta.group.position.clone().add(ta.nozzle),
        pb = tb.group.position.clone().add(tb.nozzle);
      const high = Math.max(pa.y, pb.y) + 0.45 + edge * 0.23;
      const curve = new THREE.CatmullRomCurve3([
        pa,
        v(pa.x, high, pa.z),
        v(
          (pa.x + pb.x) / 2,
          high + 0.25,
          (pa.z + pb.z) / 2 + (edge === 2 ? -2 : 0),
        ),
        v(pb.x, high, pb.z),
        pb,
      ]);
      add(
        new THREE.TubeGeometry(curve, 40, 0.11, 10, false),
        bronze,
        0,
        0,
        0,
        root,
      );
      // Capture the pipe itself instead of the empty air inside its full curve bounds.
      for (let segment = 0; segment < 4; segment++) {
        const a = curve.getPointAt(segment / 4),
          b = curve.getPointAt((segment + 1) / 4),
          delta = b.clone().sub(a);
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, delta.length(), 0.28),
          bronze,
        );
        proxy.position.copy(a).add(b).multiplyScalar(0.5);
        proxy.quaternion.setFromUnitVectors(v(0, 1, 0), delta.normalize());
        root.add(proxy);
        game.cameraSurfaces?.capture(proxy);
        root.remove(proxy);
        proxy.geometry.dispose();
      }
      for (const u of [0.08, 0.48, 0.92]) {
        const point = curve.getPointAt(u),
          collar = add(
            new THREE.TorusGeometry(0.145, 0.038, 6, 18),
            bronze,
            point.x,
            point.y,
            point.z,
            detail,
          );
        collar.quaternion.setFromUnitVectors(v(0, 0, 1), curve.getTangentAt(u));
      }
      for (const [from, to] of [
        [a, b],
        [b, a],
      ])
        if (state.links.some(([x, y]) => x === from && y === to)) {
          const u = from === a ? 0.37 : 0.63,
            point = curve.getPointAt(u),
            arrow = add(
              new THREE.ConeGeometry(0.16, 0.48, 5),
              game.glowMat,
              point.x,
              point.y + 0.05,
              point.z,
              detail,
            );
          arrow.quaternion.setFromUnitVectors(
            v(0, 1, 0),
            curve.getTangentAt(u).multiplyScalar(from === a ? 1 : -1),
          );
        }
      const two =
        state.links.some(([x, y]) => x === b && y === a) &&
        state.links.some(([x, y]) => x === a && y === b);
      const from = state.links.some(([x, y]) => x === a && y === b) ? a : b,
        to = from === a ? b : a;
      const sign = hydraulicPlaque(
        `${CISTERN_NAMES[from]} ${two ? "↔" : "→"} ${CISTERN_NAMES[to]}`,
        1.7,
      );
      sign.position.copy(curve.getPointAt(0.5)).add(v(0, 0.46, 0));
      detail.add(sign);
      site.pipes.push({ a, b, curve });
    }
    const ty = floor(0, 13.5);
    block(3.8, 0.45, 1.05, dark, 0, ty + 0.225, 13.5);
    block(3.6, 0.9, 0.35, stone, 0, ty + 0.95, 13.5, root, true);
    const measure = hydraulicPlaque(
      `ROYAL MEASURE · ${state.target.join(" / ")}`,
      3.4,
    );
    measure.position.set(0, ty + 1.06, 13.7);
    root.add(measure);
    game.obstacles.push({
      x: root.position.x,
      z: root.position.z + 13.5,
      w: 1.95,
      d: 0.6,
      h: 1.42,
    });
    site.tablet = control(-1, "tablet", 0, 14.7);
    // Retain the first chamber; later pedestals become low pressure receivers.
    if (stage > 0) {
      const retired = new Set(
        feature.group.children.filter((o) => o !== feature.marker),
      );
      retired.forEach((o) => (o.visible = false));
      if (game.cameraSurfaces?.pending)
        game.cameraSurfaces.pending = game.cameraSurfaces.pending.filter(
          (e) => !retired.has(e.mesh),
        );
      block(2.4, 0.35, 1.8, dark, 0, 0.175, 0);
      block(1.7, 0.8, 0.55, stone, 0, 0.7, 0, root);
      const plate = hydraulicPlaque("PRESSURE RECEIVER", 1.55);
      plate.position.set(0, 0.83, 0.3);
      root.add(plate);
    }
    mergeArchitecture(root);
    mergeArchitecture(detail);
    game.hydraulicSites.push(site);
  }
  updateHydraulicCourts(game, 0);
  return true;
}

export function saveHydraulicState(game, stage, state, event) {
  const site = game.hydraulicSites?.[stage];
  if (!hydraulicReady(game, site)) return false;
  const clean = normalizeHydraulics({ [stage]: state })[stage];
  if (!clean) return false;
  const before = [...site.state.values];
  (game.progress.hydraulics ??= {})[stage] = clean;
  site.state = restorePuzzle(game.level, stage, clean);
  if (event?.kind === "transfer" && event.amount > 0) {
    site.display = [...before];
    site.flow = {
      from: event.from,
      to: event.to,
      amount: event.amount,
      old: before,
      elapsed: 0,
      duration: 0.65 + event.amount * 0.12,
    };
    if (game.paused) {
      game.presentationRemaining = site.flow.duration + 0.25;
      game.renderOnce = true;
    }
  } else if (!event) {
    site.flow = null;
    site.display = [...clean.values];
  }
  game.save();
  game.renderOnce = true;
  return true;
}
export function updateHydraulicCourts(game, dt) {
  if (!game.hydraulicSites?.length) return;
  game.hydraulicTime.value += Math.max(0, dt);
  for (const site of game.hydraulicSites) {
    const completed =
      game.progress.completed || site.stage < game.progress.stage;
    site.active = hydraulicReady(game, site);
    if (site.stage > 0) {
      site.feature.core.visible = false;
      if (site.active) site.feature.marker.visible = false;
    }
    site.visualTime += Math.max(0, dt);
    if (completed) {
      site.state.values = [...site.state.target];
      site.state.selected = null;
      site.flow = null;
      site.display = [...site.state.target];
    }
    if (site.flow) {
      const flow = site.flow;
      flow.elapsed += Math.max(0, dt);
      const t = Math.min(1, flow.elapsed / flow.duration),
        u = t * t * (3 - 2 * t);
      site.display = flow.old.map((v, i) => v + (site.state.values[i] - v) * u);
      if (t === 1) site.flow = null;
    }
    const flow = site.flow;
    const near =
      game.hydraulicFocus === site.stage ||
      !game.player ||
      Math.hypot(
        game.player.position.x - site.root.position.x,
        game.player.position.z - site.root.position.z - 21,
      ) < (site.detail.visible ? 115 : 105);
    site.detail.visible = near;
    for (const [i, tank] of site.tanks.entries()) {
      const value = site.display[i],
        height =
          CISTERN_FLOOR + (value / site.state.capacity[i]) * CISTERN_DEPTH;
      tank.surface.position.y = height;
      tank.surface.visible = value > 0.003;
      tank.surface.material.userData.waterUniforms.waterTime.value =
        game.hydraulicTime.value;
      tank.float.position.y = height;
      tank.lamp.material.emissiveIntensity =
        site.state.selected === i
          ? 2.2
          : site.state.values[i] === site.state.target[i]
            ? site.active || completed
              ? 0.7
              : 0.18
            : 0.08;
      if (flow && (flow.from === i || flow.to === i))
        tank.wheel.rotation.z += dt * 3.2 * (flow.from === i ? 1 : -1);
      tank.stream.visible = near && flow?.to === i;
      if (tank.stream.visible) {
        const length = tank.nozzle.y - height;
        tank.stream.scale.y = Math.max(0.01, length);
        tank.stream.position.y = (tank.nozzle.y + height) / 2;
      }
      tank.ripple.visible = tank.stream.visible;
      tank.ripple.position.y = height + 0.018;
      tank.ripple.scale.setScalar(0.7 + ((site.visualTime * 1.5) % 1.0));
      tank.pump.activity =
        site.active && flow && (flow.from === i || flow.to === i) ? 0.75 : 0;
      tank.outlet.activity = site.active && flow?.to === i ? 1 : 0;
      tank.outlet.y =
        site.root.position.y +
        tank.group.position.y +
        (tank.nozzle.y + height) / 2;
      tank.control.marker.visible = site.active && game.sense > 0;
      tank.control.label =
        site.state.selected === null
          ? `Cistern ${CISTERN_NAMES[i]} · ${site.state.values[i]} / ${site.state.capacity[i]} units`
          : site.state.selected === i
            ? `Cancel ${CISTERN_NAMES[i]} pump selection`
            : `Send ${CISTERN_NAMES[site.state.selected]} → ${CISTERN_NAMES[i]}`;
    }
    site.tablet.marker.visible = site.active;
  }
  const grip = game.hydraulicGrip,
    site = game.hydraulicSites[grip?.stage];
  if (grip && site) {
    if (
      site.visualTime > grip.until ||
      game.paused ||
      !game.grounded ||
      game.swimming ||
      game.blockGrip ||
      game.dodge ||
      game.ropeRide ||
      game.climb ||
      game.player.position.distanceTo(grip.position) > 0.25
    )
      game.hydraulicGrip = null;
    else if (game.rig) {
      const tank = site.tanks[grip.index];
      game.avatar.rotation.y = Math.PI;
      tank.wheel.updateWorldMatrix(true, true);
      poseHands(
        game,
        tank.handles.map((h) => h.getWorldPosition(new THREE.Vector3())),
      );
    }
  }
}
export function hydraulicInteract(game) {
  const f = game.nearest;
  if (f?.type !== "hydraulic") return false;
  const site = game.hydraulicSites?.[f.stage];
  if (
    !hydraulicReady(game, site) ||
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 1.6 ||
    Math.abs(game.player.position.y - game.groundHeight(f.x * 7, f.z * 7)) > 0.8
  )
    return true;
  if (f.kind === "tablet") {
    game.setPaused(true);
    game.cb.puzzle?.(site.feature, game.level);
    return true;
  }
  if (site.flow) {
    game.cb.toast?.("Let the pump finish this transfer.");
    return true;
  }
  const state = restorePuzzle(
      game.level,
      f.stage,
      game.progress.hydraulics?.[f.stage],
    ),
    event = applyMove(state, { index: f.index });
  saveHydraulicState(game, f.stage, state, event);
  game.audio.noiseHit?.(
    0.008,
    0.12,
    650,
    site.tanks[f.index].control.group.position
      .clone()
      .add(new THREE.Vector3(0, 1.35, -0.7)),
  );
  game.hydraulicGrip = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.65,
    position: game.player.position.clone(),
  };
  game.cb.toast?.(
    isSolved(state)
      ? "The royal measure is balanced. Activate it at the tablet."
      : hydraulicMessage(event),
    3500,
  );
  game.keys.clear();
  return true;
}
export function hydraulicTarget(game) {
  const site = game.hydraulicSites?.[game.progress.stage];
  return hydraulicReady(game, site) ? site.tablet : null;
}
export function focusHydraulics(game) {
  const site = game.hydraulicSites?.[game.hydraulicFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  game.camera.position.set(
    c.x + (compact ? 0 : 7.5),
    c.y + (compact ? 16 : 13),
    c.z + (compact ? 74 : 48),
  );
  game.camera.lookAt(
    c.x + (compact ? 0 : 7.5),
    c.y + (compact ? -9 : 1.2),
    c.z + 21,
  );
  return true;
}

export function settleHydraulics(game) {
  game.hydraulicGrip = null;
  for (const site of game.hydraulicSites || []) {
    site.flow = null;
    site.display = [...site.state.values];
  }
  updateHydraulicCourts(game, 0);
}
