import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  RESONANCE_TRIALS,
  resonanceName,
  resonanceClue,
  resonanceFrequency,
  normalizeResonance,
} from "./resonance-rules.js";
import { restorePuzzle, applyMove, isSolved } from "./puzzles.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { mergeArchitecture } from "./visuals.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { quartzGeometry } from "./cavern-geometry.js";
import { mineralMaterial } from "./cavern-material.js";
import { hydraulicPlaque } from "./hydraulic-geometry.js";
import { poseHands } from "./pose.js";

export function resonanceReady(game, site) {
  return (
    !!site &&
    !game.progress.completed &&
    site.stage === game.progress.stage &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}
export function buildResonanceCourts(game) {
  game.resonanceSites = [];
  game.resonanceSources = [];
  game.resonanceFocus = null;
  game.resonanceGrip = null;
  if (game.level.biome !== "crystal") return false;
  const bronze = patinatedBronze(),
    stone = game.darkMat,
    gold = game.goldMat;
  const pieces = [new THREE.TorusGeometry(0.42, 0.045, 8, 36)];
  for (let i = 0; i < 6; i++)
    pieces.push(
      new THREE.BoxGeometry(0.045, 0.8, 0.045).rotateZ((i * Math.PI) / 3),
    );
  const wheelGeometry = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const stage = feature.stage,
      trial = RESONANCE_TRIALS[stage],
      root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.copy(feature.group.position);
    root.name = trial.title;
    root.add(detail);
    game.world.add(root);
    if (stage > 0) {
      const retired = new Set(
        feature.group.children.filter((m) => m !== feature.marker),
      );
      retired.forEach((m) => (m.visible = false));
      if (game.cameraSurfaces?.pending)
        game.cameraSurfaces.pending = game.cameraSurfaces.pending.filter(
          (e) => !retired.has(e.mesh),
        );
    }
    const state = restorePuzzle(
      game.level,
      stage,
      game.progress.resonance?.[stage],
    );
    if (stage < game.progress.stage || game.progress.completed)
      state.values = [...state.target];
    const site = {
      stage,
      trial,
      feature,
      root,
      detail,
      state,
      nodes: [],
      links: [],
      visualTime: 0,
      moving: false,
    };
    game.resonanceSites.push(site);
    const floor = (x, z) =>
      game.groundHeight(root.position.x + x, root.position.z + z) -
      root.position.y;
    const add = (geometry, material, x, y, z, parent = root) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const control = (kind, index, x, z) => {
      const group = new THREE.Group();
      group.position.set(
        root.position.x + x,
        root.position.y + floor(x, z),
        root.position.z + z,
      );
      game.world.add(group);
      const marker = add(
        new THREE.OctahedronGeometry(0.11),
        game.glowMat,
        0,
        2.4,
        0,
        group,
      );
      const f = {
        id: `resonance-${stage}-${kind}-${index}`,
        type: "resonator",
        kind,
        index,
        stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        group,
        marker,
        label:
          kind === "tablet"
            ? "Read the memory inscription"
            : `Tune crystal ${resonanceName(index)}`,
      };
      game.items.push(f);
      return f;
    };
    for (const [index, [x, z]] of trial.positions.entries()) {
      const y = floor(x, z),
        body = new THREE.Group();
      body.position.set(x, y, z);
      detail.add(body);
      const level = { value: 0.3 },
        color = new THREE.Color(
          [0x8cafdf, 0x93c7bc, 0xbc99da, 0xa2adce, 0xc1b6db][index],
        ),
        material = mineralMaterial(color, level);
      add(
        new THREE.CylinderGeometry(1.12, 1.35, 0.38, 12),
        stone,
        x,
        y + 0.16,
        z,
      );
      add(
        new THREE.CylinderGeometry(0.86, 1.05, 0.75, 12),
        bronze,
        x,
        y + 0.67,
        z,
      );
      const crystal = add(
        quartzGeometry(0.66, 3.05 + (index % 3) * 0.28, stage * 0.2),
        material,
        0,
        0.95,
        0,
        body,
      );
      for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
        const support = add(
          new THREE.BoxGeometry(0.14, 2.05, 0.17),
          bronze,
          Math.sin(a) * 0.87,
          1.6,
          Math.cos(a) * 0.87,
          body,
        );
        support.rotation.z = -Math.sin(a) * 0.15;
        support.rotation.x = Math.cos(a) * 0.15;
        add(
          quartzGeometry(0.18, 0.65, index + a),
          material,
          Math.sin(a) * 0.95,
          0.37,
          Math.cos(a) * 0.95,
          body,
        );
      }
      for (const height of [0.99, 2.36]) {
        const ring = add(
          new THREE.TorusGeometry(0.86, 0.05, 8, 48),
          bronze,
          x,
          y + height,
          z,
        );
        ring.rotation.x = Math.PI / 2;
      }
      const collar = new THREE.Group();
      collar.position.set(0, 1.43, 0);
      body.add(collar);
      const band = add(
        new THREE.TorusGeometry(0.91, 0.07, 8, 48),
        gold,
        0,
        0,
        0,
        collar,
      );
      band.rotation.x = Math.PI / 2;
      for (let n = 0; n < 12; n++) {
        const a = (n * Math.PI) / 6;
        const tick = add(
          new THREE.BoxGeometry(0.055, 0.16, n % 3 === 0 ? 0.26 : 0.15),
          bronze,
          Math.sin(a) * 0.95,
          0,
          Math.cos(a) * 0.95,
          collar,
        );
        tick.rotation.y = a;
      }
      mergeArchitecture(collar);
      const wheel = add(wheelGeometry, bronze, 0, 1.07, 1.12, body);
      const handles = [-1, 1].map((side) => {
        const h = new THREE.Object3D();
        h.position.set(side * 0.36, 0, 0.03);
        wheel.add(h);
        return h;
      });
      const plaque = hydraulicPlaque(
        resonanceClue(trial, index),
        1.88,
        "#dfd8c2",
        76,
      );
      plaque.position.set(0, 0.65, 1.28);
      body.add(plaque);
      const reading = hydraulicPlaque(
        `${resonanceName(index)} · ${state.values[index]}`,
        1.4,
        "#bddbec",
        76,
      );
      reading.position.set(0, 1.86, 1.04);
      body.add(reading);
      const plateParts = [
        new THREE.BoxGeometry(1.95, 0.38, 0.08).translate(0, 0.65, 1.23),
        new THREE.BoxGeometry(1.48, 0.28, 0.06).translate(0, 1.86, 1),
      ];
      add(mergeGeometries(plateParts), stone, 0, 0, 0, body);
      plateParts.forEach((part) => part.dispose());
      const rings = [0, 1].map((i) => {
        const m = add(
          new THREE.TorusGeometry(0.75, 0.018, 5, 48),
          new THREE.MeshBasicMaterial({
            color: i ? 0xd5bbed : 0x95d8d5,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
          }),
          0,
          2.7,
          0,
          body,
        );
        m.rotation.x = Math.PI / 2;
        return m;
      });
      const f = control("wheel", index, x, z + 1.8);
      const sounds = ["voice", "reference"].map((channel) => {
        const s = {
          id: `resonance-${stage}-${index}-${channel}`,
          kind: "resonator",
          x: root.position.x + x,
          y: root.position.y + y + 2,
          z: root.position.z + z + 1.35,
          near: 1.2,
          range: 16,
          gain: channel === "voice" ? 0.14 : 0.11,
          rate:
            resonanceFrequency(
              channel === "voice" ? state.values[index] : state.target[index],
            ) / 200,
          resonanceStage: stage,
          resonanceIndex: index,
          channel,
          activity: 0,
        };
        game.resonanceSources.push(s);
        return s;
      });
      const node = {
        index,
        x,
        y,
        z,
        center: root.position.clone().add(new THREE.Vector3(x, y, z)),
        body,
        crystal,
        material,
        level,
        color,
        collar,
        wheel,
        handles,
        plaque,
        reading,
        rings,
        control: f,
        voice: sounds[0],
        reference: sounds[1],
        display: state.values[index],
        lastLabel: state.values[index],
      };
      site.nodes.push(node);
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z,
        w: 1.02,
        d: 1.07,
        h: 4.3,
        resonator: true,
      });
      const proxy = add(
        new THREE.BoxGeometry(2.04, 4.3, 2.14),
        bronze,
        x,
        y + 2.15,
        z,
      );
      game.cameraSurfaces?.capture(proxy);
      root.remove(proxy);
      proxy.geometry.dispose();
    }
    // Inlaid connections follow the named relation without adding trip hazards.
    for (const [to, clue] of trial.clues.entries())
      if (clue.from !== undefined) {
        const a = site.nodes[clue.from],
          b = site.nodes[to],
          points = [];
        for (let n = 0; n <= 10; n++) {
          const t = n / 10,
            x = a.x + (b.x - a.x) * t,
            z = a.z + (b.z - a.z) * t;
          points.push(new THREE.Vector3(x, floor(x, z) + 0.08, z));
        }
        const curve = new THREE.CatmullRomCurve3(points),
          material = new THREE.MeshStandardMaterial({
            color: 0x688c9c,
            emissive: 0x79c4d1,
            emissiveIntensity: 0.1,
            roughness: 0.45,
            metalness: 0.6,
          });
        add(
          new THREE.TubeGeometry(curve, 12, 0.035, 5, false),
          material,
          0,
          0,
          0,
        );
        site.links.push({ from: clue.from, to, material });
      }
    add(new THREE.BoxGeometry(2, 0.7, 0.48), stone, 0, floor(0, 17) + 0.4, 17);
    const record = hydraulicPlaque("READ · TUNE · REMEMBER", 1.95);
    record.position.set(0, floor(0, 17) + 0.64, 17.26);
    root.add(record);
    site.tablet = control("tablet", 0, 0, 18.3);
    game.obstacles.push({
      x: root.position.x,
      z: root.position.z + 17,
      w: 1,
      d: 0.27,
      h: 0.8,
      resonator: true,
    });
    mergeArchitecture(root);
  }
  settleResonance(game);
  return true;
}
export function saveResonanceState(game, stage, state, event) {
  const value = normalizeResonance({ [stage]: state })[stage],
    site = game.resonanceSites?.[stage];
  if (!value || !resonanceReady(game, site)) return false;
  game.progress.resonance ||= {};
  game.progress.resonance[stage] = value;
  site.state = restorePuzzle(game.level, stage, value);
  if (event?.kind === "changed") {
    const node = site.nodes[event.index];
    // Choose the short mechanical turn even when crossing 11/0.
    node.display = state.values[event.index] - event.delta;
    game.audio.noiseHit?.(0.006, 0.12, 1100, node.control.group.position);
    if (game.paused) {
      game.presentationRemaining = 0.8;
      game.renderOnce = true;
    }
  } else settleResonance(game);
  game.save();
  return true;
}
export function updateResonanceCourts(game, dt) {
  for (const site of game.resonanceSites || []) {
    site.visualTime += Math.max(0, dt);
    const active = resonanceReady(game, site),
      complete = site.stage < game.progress.stage || game.progress.completed;
    site.feature.core.visible = false;
    site.detail.visible =
      game.resonanceFocus === site.stage ||
      !game.player ||
      site.root.position.distanceTo(game.player.position) <
        (site.detail.visible ? 95 : 85);
    site.moving = false;
    for (const n of site.nodes) {
      const value = complete
          ? site.state.target[n.index]
          : site.state.values[n.index],
        error = Math.abs(value - site.state.target[n.index]);
      const gap = value - n.display;
      n.display += gap * (1 - Math.exp(-Math.max(0, dt) * 9));
      if (Math.abs(gap) < 0.003) n.display = value;
      else site.moving = true;
      n.collar.rotation.y = (n.display * Math.PI) / 6;
      n.wheel.rotation.z = (-n.display * Math.PI) / 6;
      n.level.value = active || complete ? (error === 0 ? 1 : 0.28) : 0.1;
      n.material.emissiveIntensity =
        (active || complete ? 0.35 : 0.12) +
        (error === 0 && (active || complete) ? 0.45 : 0);
      const pulse =
        active && error > 0
          ? Math.sin(site.visualTime * (1.5 + error * 0.32)) * 0.18
          : 0;
      n.rings.forEach((ring, i) => {
        ring.scale.setScalar(1 + (i ? pulse : -pulse));
        ring.material.opacity =
          active || complete ? (error === 0 ? 0.65 : 0.36) : 0.08;
      });
      n.voice.rate = resonanceFrequency(value) / 200;
      n.reference.rate = resonanceFrequency(site.state.target[n.index]) / 200;
      n.voice.activity = active ? 1 : complete ? 0.2 : 0;
      n.reference.activity = active && error !== 0 ? 1 : 0;
      n.control.label = `Crystal ${resonanceName(n.index)} · mark ${value} · ${resonanceClue(site.trial, n.index)}`;
      n.control.marker.visible = active && game.sense > 0;
      site.tablet.marker.visible = active;
      if (n.lastLabel !== value) {
        const map = n.reading.material.map,
          c = map.image.getContext("2d");
        c.clearRect(0, 0, 768, 128);
        c.fillStyle = "#bddbec";
        c.font = "600 76px Georgia";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(`${resonanceName(n.index)} · ${value}`, 384, 64, 748);
        map.needsUpdate = true;
        n.lastLabel = value;
      }
    }
    site.links.forEach(
      (link) =>
        (link.material.emissiveIntensity =
          active || complete
            ? site.state.values[link.from] === site.state.target[link.from] &&
              site.state.values[link.to] === site.state.target[link.to]
              ? 0.65
              : 0.08
            : 0),
    );
  }
  const grip = game.resonanceGrip,
    site = game.resonanceSites?.[grip?.stage];
  if (grip && site) {
    if (
      game.paused ||
      site.visualTime > grip.until ||
      !game.grounded ||
      game.swimming ||
      game.climb ||
      game.ropeRide ||
      game.blockGrip ||
      game.dodge ||
      game.player.position.distanceTo(grip.position) > 0.25
    )
      game.resonanceGrip = null;
    else if (game.rig) {
      const n = site.nodes[grip.index];
      game.avatar.rotation.y = Math.PI;
      n.wheel.updateWorldMatrix(true, true);
      poseHands(
        game,
        n.handles.map((h) => h.getWorldPosition(new THREE.Vector3())),
      );
    }
  }
}
export function settleResonance(game) {
  game.resonanceGrip = null;
  for (const site of game.resonanceSites || [])
    site.nodes.forEach(
      (n) =>
        (n.display = (
          site.stage < game.progress.stage || game.progress.completed
            ? site.state.target
            : site.state.values
        )[n.index]),
    );
  updateResonanceCourts(game, 0);
}
export function resonanceInteract(game) {
  const f = game.nearest;
  if (f?.type !== "resonator") return false;
  const site = game.resonanceSites?.[f.stage];
  if (
    !resonanceReady(game, site) ||
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 1.55 ||
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
      game.progress.resonance?.[f.stage],
    ),
    delta = game.keys.has("ShiftLeft") || game.keys.has("ShiftRight") ? -1 : 1,
    event = applyMove(state, { index: f.index, delta });
  saveResonanceState(game, f.stage, state, event);
  game.resonanceGrip = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.5,
    position: game.player.position.clone(),
  };
  game.cb.toast?.(
    isSolved(state)
      ? "The array holds one voice. Recover its memory at the inscription."
      : `${resonanceName(f.index)} · ${state.values[f.index]} / 11. Match the inscription; the two wave rings settle at unison.`,
    3000,
  );
  game.keys.delete("KeyE");
  return true;
}
export function resonanceTarget(game) {
  const site = game.resonanceSites?.[game.progress.stage];
  return resonanceReady(game, site) ? site.tablet : null;
}
export function focusResonance(game) {
  const site = game.resonanceSites?.[game.resonanceFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  game.camera.position.set(
    c.x,
    c.y + (compact ? 18 : 15),
    c.z + (compact ? 26 : 27),
  );
  // Widen and shift the inspection lens while keeping its eye inside the vault.
  // The normal follow camera restores its lens on leaving this view.
  game.camera.fov = compact ? 115 : 90;
  game.camera.filmOffset = compact
    ? 0
    : 0.46 *
      game.camera.getFilmWidth() *
      Math.tan((game.camera.fov * Math.PI) / 360) *
      game.camera.aspect;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(
    c.x,
    c.y + (compact ? -10 : 3),
    c.z + (compact ? 25.9 : 14),
  );
  return true;
}
