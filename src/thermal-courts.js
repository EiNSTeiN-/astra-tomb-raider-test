import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  THERMAL_TRIALS,
  thermalPosition,
  normalizeThermal,
} from "./thermal-rules.js";
import { restorePuzzle, applyMove, isSolved } from "./puzzles.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { hydraulicPlaque } from "./hydraulic-geometry.js";
import { forgePlume, moltenMaterial } from "./forge-effects.js";
import { poseHands } from "./pose.js";

export function thermalReady(game, site) {
  return (
    !!site &&
    !game.progress.completed &&
    site.stage === game.progress.stage &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}
export const thermalName = (trial, index) =>
  String.fromCharCode(65 + Math.floor(index / trial.columns)) +
  ((index % trial.columns) + 1);

function wheelGeometry() {
  const parts = [
    new THREE.TorusGeometry(0.32, 0.037, 6, 24),
    new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12).rotateX(Math.PI / 2),
  ];
  for (let i = 0; i < 6; i++)
    parts.push(
      new THREE.BoxGeometry(0.035, 0.57, 0.045).rotateZ((i * Math.PI) / 3),
    );
  const result = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return result;
}

export function buildThermalCourts(game) {
  game.thermalSites = [];
  game.thermalSources = [];
  game.thermalFocus = null;
  game.thermalGrip = null;
  game.thermalTime = null;
  if (game.level.biome !== "volcano") return false;
  game.thermalTime = { value: 0 };
  const metal = pbrMaterial("forge-metal", 0x8a9997),
    stone = game.darkMat,
    trim = new THREE.MeshStandardMaterial({
      color: 0xafa37b,
      metalness: 0.68,
      roughness: 0.46,
    }),
    wheels = wheelGeometry(),
    hot = new THREE.Color(0xf26524),
    cool = new THREE.Color(0x325a65);
  metal.metalness = 0.65;
  metal.normalScale.set(0.38, 0.38);
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const stage = feature.stage,
      trial = THERMAL_TRIALS[stage],
      root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.copy(feature.group.position);
    root.name = trial.title;
    root.add(detail);
    game.world.add(root);
    const state = restorePuzzle(
      game.level,
      stage,
      game.progress.thermal?.[stage],
    );
    if (game.progress.completed || stage < game.progress.stage)
      state.mask = state.targetMask;
    const site = {
      stage,
      trial,
      feature,
      root,
      detail,
      state,
      nodes: [],
      pipes: [],
      visualTime: 0,
      active: false,
    };
    game.thermalSites.push(site);
    let serial = game.level.seed + stage * 271;
    const floor = (x, z) =>
      game.groundHeight(root.position.x + x, root.position.z + z) -
      root.position.y;
    const add = (geometry, material, x, y, z, parent = root) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w, h, d, material, x, y, z, parent = root) =>
      add(stoneBlockGeometry(w, h, d, ++serial), material, x, y, z, parent);
    const control = (index, kind, x, z) => {
      const group = new THREE.Group();
      group.position.set(
        root.position.x + x,
        game.groundHeight(root.position.x + x, root.position.z + z),
        root.position.z + z,
      );
      game.world.add(group);
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12),
        game.glowMat,
      );
      marker.position.y = 2.7;
      group.add(marker);
      const f = {
        id: `thermal-${stage}-${kind === "tablet" ? "tablet" : index}`,
        type: "thermal",
        kind,
        index,
        stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        group,
        marker,
        label:
          kind === "tablet"
            ? "Read the regulator’s firing record"
            : `Turn valve ${thermalName(trial, index)}`,
      };
      game.items.push(f);
      return f;
    };
    for (let i = 0; i < state.effects.length; i++) {
      const { x, z } = thermalPosition(trial, i),
        y = floor(x, z),
        body = new THREE.Group();
      body.position.set(x, y, z);
      detail.add(body);
      const heatValue =
        (thermalReady(game, site) ||
          stage < game.progress.stage ||
          game.progress.completed) &&
        state.mask & (1 << i)
          ? 1
          : 0;
      const heatMaterial = new THREE.MeshStandardMaterial({
        color: cool,
        emissive: hot,
        emissiveIntensity: heatValue * 1.9,
        roughness: 0.62,
      });
      box(1.5, 0.22, 1.5, stone, x, y + 0.07, z);
      box(1.18, 1.47, 1.08, metal, x, y + 0.82, z);
      box(1.35, 0.14, 1.26, trim, x, y + 1.57, z);
      // A recessed hot chamber under two hinged shutter leaves.
      const heatUniform = { value: heatValue };
      const chamber = add(
        new THREE.BoxGeometry(0.95, 0.08, 0.85),
        moltenMaterial(game.thermalTime, heatUniform),
        0,
        1.66,
        0,
        body,
      );
      const hinges = [];
      for (const side of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(side * 0.52, 1.73, 0);
        body.add(hinge);
        add(
          new THREE.BoxGeometry(0.52, 0.06, 0.94),
          metal,
          -side * 0.26,
          0,
          0,
          hinge,
        );
        hinges.push({ group: hinge, side });
        box(0.09, 0.16, 1.24, trim, x + side * 0.61, y + 1.74, z);
        for (const dz of [-0.45, 0.45])
          add(
            new THREE.SphereGeometry(0.035, 6, 4),
            trim,
            x + side * 0.59,
            y + 1.82,
            z + dz,
          );
      }
      const wheel = add(wheels, trim, 0, 1.07, 0.73, body);
      const handles = [-1, 1].map((side) => {
        const anchor = new THREE.Object3D();
        anchor.position.set(side * 0.27, 0.02, 0.02);
        wheel.add(anchor);
        return anchor;
      });
      const target = !!(state.targetMask & (1 << i)),
        plaque = hydraulicPlaque(
          `${thermalName(trial, i)} · ${target ? "HEAT" : "COOL"}`,
          1.22,
        );
      plaque.position.set(0, 1.43, 0.563);
      body.add(plaque);
      const gauge = add(
        new THREE.PlaneGeometry(0.29, 0.37),
        heatMaterial,
        0.38,
        0.95,
        0.548,
        body,
      );
      const signal = add(
        new THREE.TorusGeometry(0.74, 0.025, 4, 28),
        game.glowMat,
        0,
        1.88,
        0,
        body,
      );
      signal.rotation.x = -Math.PI / 2;
      const amount = { value: 0 },
        plume = forgePlume(game.thermalTime, amount, true, stage * 31 + i);
      plume.position.set(-0.38, 1.67, 0.83);
      plume.scale.setScalar(0.3);
      body.add(plume);
      const outlet = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.38, 1.49, 0.55),
        new THREE.Vector3(-0.38, 1.56, 0.72),
        new THREE.Vector3(-0.38, 1.67, 0.83),
      ]);
      add(
        new THREE.TubeGeometry(outlet, 6, 0.045, 6, false),
        trim,
        0,
        0,
        0,
        body,
      );
      const f = control(i, "valve", x, z + 1.5);
      const source = (channel, kind, near, range, gain) => {
        const s = {
          id: `thermal-${stage}-${i}-${channel}`,
          kind,
          x: root.position.x + x + (channel === "hiss" ? -0.38 : 0),
          y: root.position.y + y + (channel === "hiss" ? 1.67 : 1.13),
          z: root.position.z + z + (channel === "hiss" ? 0.83 : 0.78),
          thermalStage: stage,
          thermalIndex: i,
          channel,
          near,
          range,
          gain,
          activity: 0,
        };
        game.thermalSources.push(s);
        return s;
      };
      const node = {
        index: i,
        x,
        z,
        y,
        body,
        wheel,
        handles,
        hinges,
        chamber,
        gauge,
        plaque,
        signal,
        heatMaterial,
        heat: heatValue,
        heatUniform,
        amount,
        plume,
        control: f,
        rumble: source("rumble", "machine", 1.2, 16, 0.13),
        hiss: source("hiss", "steam", 1.2, 20, 0.17),
      };
      site.nodes.push(node);
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z,
        w: 0.69,
        d: 0.65,
        h: 2.2,
        thermal: true,
      });
      // Bounds retain the court parent through batching; the proxy is not drawn.
      const proxy = add(
        new THREE.BoxGeometry(1.38, 2.2, 1.3),
        metal,
        x,
        y + 1.1,
        z,
      );
      game.cameraSurfaces?.capture(proxy);
      root.remove(proxy);
      proxy.geometry.dispose();
    }
    // Copper signal conduits follow the actual coupling; collars stay below foot height.
    const pairs = new Set();
    for (let i = 0; i < state.effects.length; i++)
      for (let j = 0; j < state.effects.length; j++) {
        if (i === j || !(state.effects[i] & (1 << j))) continue;
        const key = [i, j].sort((a, b) => a - b).join(":");
        if (pairs.has(key)) continue;
        pairs.add(key);
        const a = site.nodes[i],
          b = site.nodes[j],
          points = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8,
            x = a.x + (b.x - a.x) * t,
            z = a.z + (b.z - a.z) * t;
          points.push(new THREE.Vector3(x, floor(x, z) + 0.13, z));
        }
        const curve = new THREE.CatmullRomCurve3(points),
          pipe = add(
            new THREE.TubeGeometry(curve, 8, 0.038, 5, false),
            trim,
            0,
            0,
            0,
          );
        site.pipes.push({ a: i, b: j, curve });
      }
    const tx = 1.1,
      tz = 20.9,
      ty = floor(tx, tz);
    box(1.9, 0.3, 0.75, stone, tx, ty + 0.15, tz);
    box(1.75, 1.12, 0.25, metal, tx, ty + 0.84, tz);
    const label = hydraulicPlaque("FIRING RECORD", 1.65);
    label.position.set(tx, ty + 1.18, tz + 0.14);
    detail.add(label);
    site.tablet = control(-1, "tablet", tx, tz + 1.4);
    game.obstacles.push({
      x: root.position.x + tx,
      z: root.position.z + tz,
      w: 0.97,
      d: 0.41,
      h: 1.43,
      thermal: true,
    });
    if (stage > 0) {
      const retired = new Set(
        feature.group.children.filter((m) => m !== feature.marker),
      );
      retired.forEach((m) => (m.visible = false));
      if (game.cameraSurfaces?.pending)
        game.cameraSurfaces.pending = game.cameraSurfaces.pending.filter(
          (e) => !retired.has(e.mesh),
        );
      box(2.1, 0.4, 1.4, stone, 0, 0.2, 0);
      box(1.35, 0.9, 0.5, metal, 0, 0.8, 0);
    }
    mergeArchitecture(root);
  }
  updateThermalCourts(game, 0);
  return true;
}

export function saveThermalState(game, stage, state, event) {
  const site = game.thermalSites?.[stage];
  if (!thermalReady(game, site)) return false;
  const clean = normalizeThermal({ [stage]: state })[stage];
  if (!clean) return false;
  (game.progress.thermal ??= {})[stage] = clean;
  site.state = restorePuzzle(game.level, stage, clean);
  if (!event)
    for (const node of site.nodes)
      node.heat = site.state.mask & (1 << node.index) ? 1 : 0;
  if (event?.kind === "changed") {
    site.flashUntil = site.visualTime + 1.5;
    const f = site.nodes[event.index].control;
    game.audio.noiseHit?.(
      0.008,
      0.14,
      520,
      new THREE.Vector3(f.x * 7, f.group.position.y + 1.1, f.z * 7 - 0.7),
    );
    if (game.paused) game.presentationRemaining = 1.5;
  }
  game.save();
  game.renderOnce = true;
  return true;
}

export function updateThermalCourts(game, dt) {
  if (!game.thermalSites?.length) return;
  game.thermalTime.value += Math.max(0, dt);
  const hot = new THREE.Color(0xf26524),
    cool = new THREE.Color(0x325a65);
  for (const site of game.thermalSites) {
    const completed =
      game.progress.completed || site.stage < game.progress.stage;
    site.active = thermalReady(game, site);
    site.visualTime += Math.max(0, dt);
    if (completed) site.state.mask = site.state.targetMask;
    if (site.stage > 0) {
      site.feature.core.visible = false;
      if (site.active) site.feature.marker.visible = false;
    }
    const near =
      game.thermalFocus === site.stage ||
      !game.player ||
      Math.hypot(
        game.player.position.x - site.root.position.x - 10,
        game.player.position.z - site.root.position.z - 14,
      ) < (site.detail.visible ? 95 : 85);
    site.detail.visible = near;
    const inspect =
      game.nearest?.type === "thermal" &&
      game.nearest.stage === site.stage &&
      game.nearest.index >= 0
        ? game.nearest.index
        : game.thermalFocus === site.stage ||
            site.visualTime < (site.flashUntil || 0)
          ? site.state.last
          : null;
    const affected =
      inspect !== null && inspect !== undefined
        ? site.state.effects[inspect]
        : 0;
    site.moving = false;
    for (const node of site.nodes) {
      const goal =
        (site.active || completed) && site.state.mask & (1 << node.index)
          ? 1
          : 0;
      const gap = Math.abs(goal - node.heat);
      node.heat +=
        (goal - node.heat) *
        (dt === 0 ? 0 : 1 - Math.exp(-Math.max(0, dt) * 6));
      if (gap < 0.003) node.heat = goal;
      else site.moving = true;
      node.heatMaterial.color.copy(cool).lerp(hot, node.heat);
      node.heatUniform.value = node.heat;
      node.heatMaterial.emissiveIntensity = 0.06 + node.heat * 1.8;
      node.hinges.forEach(
        (h) => (h.group.rotation.z = -h.side * node.heat * 1.05),
      );
      node.wheel.rotation.z = node.heat * 0.8;
      node.signal.visible = site.active && !!(affected & (1 << node.index));
      node.amount.value = site.active ? gap * 0.8 : 0;
      node.plume.visible = near && node.amount.value > 0.01;
      node.rumble.activity = site.active || completed ? node.heat * 0.22 : 0;
      node.hiss.activity = site.active ? gap * 0.9 : 0;
      const name = thermalName(site.trial, node.index),
        wanted = site.state.targetMask & (1 << node.index) ? "HEAT" : "COOL";
      node.control.label = `Valve ${name} · ${site.state.mask & (1 << node.index) ? "hot" : "cool"} / target ${wanted}`;
      node.control.marker.visible = site.active && game.sense > 0;
    }
    site.tablet.marker.visible = site.active;
  }
  const grip = game.thermalGrip,
    site = game.thermalSites[grip?.stage];
  if (grip && site) {
    if (
      game.paused ||
      site.visualTime > grip.until ||
      !game.grounded ||
      game.swimming ||
      game.blockGrip ||
      game.climb ||
      game.ropeRide ||
      game.dodge ||
      game.player.position.distanceTo(grip.position) > 0.25
    )
      game.thermalGrip = null;
    else if (game.rig) {
      game.avatar.rotation.y = Math.PI;
      const n = site.nodes[grip.index];
      n.wheel.updateWorldMatrix(true, true);
      poseHands(
        game,
        n.handles.map((h) => h.getWorldPosition(new THREE.Vector3())),
      );
    }
  }
}
export function settleThermal(game) {
  game.thermalGrip = null;
  for (const site of game.thermalSites || [])
    for (const n of site.nodes)
      n.heat =
        (thermalReady(game, site) ||
          site.stage < game.progress.stage ||
          game.progress.completed) &&
        site.state.mask & (1 << n.index)
          ? 1
          : 0;
  updateThermalCourts(game, 0);
}
export function thermalInteract(game) {
  const f = game.nearest;
  if (f?.type !== "thermal") return false;
  const site = game.thermalSites?.[f.stage];
  if (
    !thermalReady(game, site) ||
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 1.6 ||
    Math.abs(game.player.position.y - f.group.position.y) > 0.8
  )
    return true;
  if (f.kind === "tablet") {
    game.setPaused(true);
    game.cb.puzzle?.(site.feature, game.level);
    return true;
  }
  const state = restorePuzzle(
      game.level,
      f.stage,
      game.progress.thermal?.[f.stage],
    ),
    event = applyMove(state, { index: f.index });
  saveThermalState(game, f.stage, state, event);
  game.thermalGrip = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.55,
    position: game.player.position.clone(),
  };
  game.cb.toast?.(
    isSolved(state)
      ? "The firing pattern is correct. Activate the regulator at its record."
      : `${event.affected.length} linked shutters changed. Follow the HEAT / COOL marks.`,
    3200,
  );
  game.keys.clear();
  return true;
}
export function thermalTarget(game) {
  const site = game.thermalSites?.[game.progress.stage];
  return thermalReady(game, site) ? site.tablet : null;
}
export function focusThermal(game) {
  const site = game.thermalSites?.[game.thermalFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  game.camera.position.set(
    c.x + (compact ? 10 : 18),
    c.y + (compact ? 25 : 18),
    c.z + (compact ? 64 : 43),
  );
  game.camera.lookAt(
    c.x + (compact ? 10 : 16),
    c.y + (compact ? -8 : 1),
    c.z + 13,
  );
  return true;
}
