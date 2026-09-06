import * as THREE from "three";
import { bellGeometry } from "./monastery-architecture.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { restorePuzzle, isSolved } from "./puzzles.js";
import { poseHands } from "./pose.js";
import {
  BELL_FREQUENCIES,
  BELL_INTERVAL,
  BELL_LEAD,
  BELL_LESSONS,
  bellCue,
  normalizeBells,
} from "./bell-rules.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";

export function bellReady(game, site) {
  return (
    !!site &&
    site.stage === game.progress.stage &&
    !game.progress.completed &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}

function plaque(text, width = 0.95) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e9d5a4";
  ctx.font = "28px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
}

export function buildBellCourts(game) {
  cancelBellPlayback(game);
  game.bellSites = [];
  game.bellFocus = null;
  game.bellPull = null;
  if (game.level.biome !== "snow") return false;
  const bronze = patinatedBronze(),
    wood = pbrMaterial("monastery-wood", 0x866956);
  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9b99a,
    roughness: 0.95,
  });
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    if (feature.stage > 0) {
      const retired = new Set(
        feature.group.children.filter((mesh) => mesh !== feature.marker),
      );
      for (const mesh of retired) mesh.visible = false;
      // Captured bounds survive batching and do not retain each mesh's visibility.
      // Remove the replaced pedestal before its invisible bounds enter the index.
      if (game.cameraSurfaces?.pending)
        game.cameraSurfaces.pending = game.cameraSurfaces.pending.filter(
          (entry) => !retired.has(entry.mesh),
        );
    }
    const root = new THREE.Group();
    root.name = `Bell rack ${feature.stage + 1}`;
    root.position.copy(feature.group.position);
    if (feature.stage === 0) {
      root.position.z += 12;
      root.position.y = game.groundHeight(root.position.x, root.position.z);
    }
    game.world.add(root);
    const site = {
      root,
      stage: feature.stage,
      feature,
      bells: [],
      playback: null,
      visualTime: 0,
    };
    game.bellSites.push(site);
    const add = (
      geometry,
      material,
      x,
      y,
      z,
      parent = root,
      capture = false,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    for (const x of [-2.72, 2.72]) {
      add(
        new THREE.BoxGeometry(0.28, 4.75, 0.35),
        wood,
        x,
        2.4,
        -1.25,
        root,
        true,
      );
      add(
        new THREE.CylinderGeometry(0.28, 0.36, 0.3, 12),
        game.stoneMat,
        x,
        0.16,
        -1.25,
      );
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z - 1.25,
        w: 0.23,
        d: 0.27,
        h:
          root.position.y -
          game.groundHeight(root.position.x + x, root.position.z - 1.25) +
          4.8,
      });
    }
    add(
      new THREE.BoxGeometry(5.95, 0.35, 0.48),
      wood,
      0,
      4.68,
      -1.25,
      root,
      true,
    );
    add(new THREE.BoxGeometry(5.8, 0.14, 0.61), game.goldMat, 0, 4.9, -1.25);
    const controls = (kind, index, x, z, label) => {
      const group = new THREE.Group();
      group.position.set(
        root.position.x + x,
        root.position.y,
        root.position.z + z,
      );
      game.world.add(group);
      const marker = add(
        new THREE.OctahedronGeometry(0.1),
        game.glowMat,
        0,
        1.65,
        0,
        group,
      );
      const f = {
        id: `bell-${site.stage}-${kind}-${index}`,
        type: "bell",
        kind,
        index,
        stage: site.stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        yOffset:
          root.position.y -
          game.groundHeight(group.position.x, group.position.z),
        group,
        marker,
        label,
      };
      game.items.push(f);
      return f;
    };
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 1.4,
        scale = 0.55 - i * 0.045;
      const hinge = new THREE.Group();
      hinge.position.set(x, 4.05, -1.25);
      hinge.userData.cameraDynamic = true;
      root.add(hinge);
      const shell = add(bellGeometry(), bronze, 0, 0, 0, hinge, true);
      shell.scale.setScalar(scale);
      const crown = add(
        new THREE.TorusGeometry(0.13, 0.035, 6, 14),
        bronze,
        0,
        0.26,
        0,
        hinge,
      );
      add(
        new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6),
        bronze,
        0,
        -0.25,
        0,
        hinge,
      );
      add(new THREE.SphereGeometry(0.1, 12, 8), bronze, 0, -0.6, 0, hinge);
      const suspension = add(
        new THREE.TorusGeometry(0.16, 0.025, 6, 16),
        bronze,
        x,
        4.37,
        -1.25,
      );
      suspension.rotation.y = Math.PI / 2;
      const glow = new THREE.MeshStandardMaterial({
        color: 0xb9c4ad,
        emissive: 0xf5d491,
        emissiveIntensity: 0,
        metalness: 0.6,
        roughness: 0.3,
      });
      const lip = add(
        new THREE.TorusGeometry(scale * 1.1, 0.035, 6, 32),
        glow,
        0,
        -1.62 * scale,
        0,
        hinge,
      );
      lip.rotation.x = Math.PI / 2;
      // A forward pulley lets the explorer pull clear of the swinging bronze.
      add(new THREE.BoxGeometry(0.12, 0.15, 2.2), wood, x, 4.45, -0.25);
      const pulley = add(
        new THREE.TorusGeometry(0.14, 0.035, 6, 16),
        bronze,
        x,
        4.29,
        0.9,
      );
      pulley.rotation.y = Math.PI / 2;
      const diagonal = add(
        new THREE.CylinderGeometry(0.018, 0.018, 1, 6),
        ropeMaterial,
        0,
        0,
        0,
      );
      const vertical = add(
        new THREE.CylinderGeometry(0.025, 0.025, 1, 6),
        ropeMaterial,
        x,
        2.8,
        0.9,
      );
      const grip = add(
        new THREE.TorusGeometry(0.18, 0.044, 7, 18),
        ropeMaterial,
        x,
        1.3,
        0.9,
      );
      const name = plaque(game.level.symbols[i]);
      name.position.set(x, 1.02, 0.96);
      root.add(name);
      const control = controls(
        "rope",
        i,
        x,
        1.05,
        `Ring ${game.level.symbols[i]}`,
      );
      for (const mesh of [hinge, diagonal, vertical, grip, lip])
        mesh.userData.animated = true;
      mergeArchitecture(hinge);
      site.bells.push({
        hinge,
        crown,
        glow,
        diagonal,
        vertical,
        grip,
        control,
        scale,
        struck: -100,
        audioPosition: new THREE.Vector3(
          root.position.x + x,
          root.position.y + 3.4,
          root.position.z - 1.25,
        ),
      });
    }
    const tablet = add(
      new THREE.BoxGeometry(1.1, 0.85, 0.22),
      game.stoneMat,
      0,
      0.48,
      2.3,
    );
    tablet.rotation.x = -0.15;
    const inscription = plaque("LISTEN · ANSWER", 1.06);
    inscription.position.set(0, 0.67, 2.46);
    root.add(inscription);
    site.tablet = controls(
      "tablet",
      0,
      0,
      2.55,
      "Read the bellkeeper's lesson",
    );
    mergeArchitecture(root);
  }
  updateBellCourts(game, 0);
  return true;
}

export function saveBellState(game, stage, state) {
  const value = normalizeBells({ [stage]: state })[stage];
  if (!value) return false;
  game.progress.bells ||= {};
  game.progress.bells[stage] = value;
  game.save();
  return true;
}

export function strikeBell(game, stage, index, options = {}) {
  const site = game.bellSites?.[stage],
    bell = site?.bells[index];
  if (!bell) return null;
  if (!options.delay) bell.struck = site.visualTime;
  const blocked = !game.lineOfSight(
    game.player.position,
    bell.audioPosition.clone().add(new THREE.Vector3(0, -1.4, 0)),
  );
  const sound = game.audio.bell?.(BELL_FREQUENCIES[index], bell.audioPosition, {
    ...options,
    blocked,
  });
  if (game.paused) {
    game.presentationRemaining = 1.6;
    game.renderOnce = true;
  }
  return sound;
}

export function cancelBellPlayback(game) {
  game.bellPull = null;
  for (const site of game.bellSites || []) {
    site.playback?.sounds.forEach((sound) => sound?.stop());
    site.playback = null;
  }
}

export function playBellPhrase(game, stage, { presentation = false } = {}) {
  const site = game.bellSites?.[stage];
  if (!bellReady(game, site)) return false;
  cancelBellPlayback(game);
  const state = restorePuzzle(game.level, stage, game.progress.bells?.[stage]);
  state.heard = true;
  saveBellState(game, stage, state);
  const notes = bellCue(state.target, stage),
    gap = BELL_INTERVAL,
    started = game.audio.ctx?.currentTime ?? null;
  const sounds = notes.map((note, i) =>
    strikeBell(game, stage, note, {
      delay: BELL_LEAD + i * gap,
      atTime: started === null ? undefined : started + BELL_LEAD + i * gap,
    }),
  );
  site.playback = {
    notes,
    gap,
    sounds,
    started,
    elapsed: 0,
    active: -1,
    presentation,
  };
  if (presentation) {
    game.presentationRemaining = notes.length * gap + BELL_LEAD + 0.5;
    game.renderOnce = true;
  }
  game.audio.setMode("puzzle");
  game.cb.toast?.(`Listen and watch: ${BELL_LESSONS[stage].instruction}`, 5500);
  return true;
}

export function updateBellCourts(game, dt) {
  const axis = new THREE.Vector3(0, 1, 0);
  for (const site of game.bellSites || []) {
    site.visualTime += Math.max(0, dt);
    const ready = bellReady(game, site),
      complete = game.progress.completed || site.stage < game.progress.stage;
    site.feature.core.visible = false;
    site.root.visible =
      game.bellFocus === site.stage ||
      !game.player ||
      site.root.position.distanceTo(game.player.position) <
        (site.root.visible ? 125 : 115);
    if (site.playback && (!game.paused || site.playback.presentation)) {
      const play = site.playback;
      play.elapsed =
        play.started === null
          ? play.elapsed + dt
          : game.audio.ctx.currentTime - play.started;
      const index = Math.floor((play.elapsed - BELL_LEAD) / play.gap);
      if (index >= 0 && index < play.notes.length && play.active !== index) {
        play.active = index;
        site.bells[play.notes[index]].struck =
          site.visualTime - ((play.elapsed - BELL_LEAD) % play.gap);
      }
      if (play.elapsed > play.notes.length * play.gap + BELL_LEAD) {
        site.playback = null;
        game.audio.setMode(game.paused ? "puzzle" : "explore");
        game.cb.toast?.(
          "Your turn. Pull the ropes to answer. The tablet can replay or clear your phrase.",
          4500,
        );
      }
    }
    site.bells.forEach((bell) => {
      const age = site.visualTime - bell.struck,
        envelope = Math.exp(-age * 2.8);
      bell.hinge.rotation.z = Math.sin(age * 9) * 0.26 * envelope;
      bell.glow.emissiveIntensity = envelope * 3 + (complete ? 0.16 : 0);
      const gripY = 1.3 - envelope * 0.24;
      bell.grip.position.y = gripY;
      bell.vertical.position.set(
        bell.hinge.position.x,
        (4.29 + gripY) / 2,
        0.9,
      );
      bell.vertical.scale.y = 4.29 - gripY;
      const start = new THREE.Vector3(0, -0.6, 0)
        .applyEuler(bell.hinge.rotation)
        .add(bell.hinge.position);
      const end = new THREE.Vector3(bell.hinge.position.x, 4.29, 0.9),
        delta = end.clone().sub(start);
      bell.diagonal.position.copy(start).add(end).multiplyScalar(0.5);
      bell.diagonal.quaternion.setFromUnitVectors(
        axis,
        delta.clone().normalize(),
      );
      bell.diagonal.scale.y = delta.length();
      bell.control.marker.visible = ready && (game.sense > 0 || envelope > 0.3);
      bell.control.marker.position.y = 1.7;
      bell.control.group.visible = site.root.visible;
    });
    site.tablet.marker.visible = ready;
    site.tablet.marker.position.y = 1.4;
    site.tablet.group.visible = site.root.visible;
  }
  const pull = game.bellPull;
  if (pull) {
    const site = game.bellSites[pull.stage],
      bell = site?.bells[pull.index];
    if (
      !bell ||
      site.visualTime > pull.until ||
      !game.grounded ||
      game.climb ||
      game.dodge ||
      game.player.position.distanceTo(pull.position) > 0.3
    )
      game.bellPull = null;
    else if (game.rig) {
      const target = bell.grip.position.clone().add(site.root.position);
      game.avatar.rotation.y = Math.atan2(
        target.x - game.player.position.x,
        target.z - game.player.position.z,
      );
      poseHands(game, target);
    }
  }
}

export function bellInteract(game) {
  const f = game.nearest;
  if (f?.type !== "bell") return false;
  const site = game.bellSites?.[f.stage];
  if (
    !bellReady(game, site) ||
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 1.35 ||
    Math.abs(game.player.position.y - site.root.position.y) > 0.9
  )
    return true;
  if (f.kind === "tablet") {
    game.setPaused(true);
    game.cb.puzzle?.(site.feature, game.level);
    return true;
  }
  if (site.playback) {
    game.cb.toast?.("Let the phrase finish. Watch which bell sounds.");
    return true;
  }
  if (site.visualTime - site.bells[f.index].struck < 0.25) return true;
  const state = restorePuzzle(
    game.level,
    f.stage,
    game.progress.bells?.[f.stage],
  );
  strikeBell(game, f.stage, f.index);
  game.bellPull = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.55,
    position: game.player.position.clone(),
  };
  if (state.values.length >= state.target.length) {
    game.cb.toast?.(
      "Your phrase is full. Return to the tablet to check it or clear it.",
    );
    return true;
  }
  state.values.push(f.index);
  state.moves++;
  saveBellState(game, f.stage, state);
  game.cb.toast?.(
    isSolved(state)
      ? "The answer rings true. Activate the lesson at the tablet."
      : `${state.values.length} / ${state.target.length} notes · ${game.level.symbols[f.index]}`,
    2500,
  );
  game.keys.clear();
  return true;
}

export function bellTarget(game) {
  const site = game.bellSites?.[game.progress.stage];
  return bellReady(game, site) ? site.tablet : null;
}

export function focusBells(game) {
  const site = game.bellSites?.[game.bellFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  // Stay inside the sanctuary lintel, below its front beam.
  game.camera.position.set(
    c.x + (compact ? 0.2 : 0.8),
    c.y + (compact ? 2 : 2.5),
    c.z + (compact ? 10.5 : 7.4),
  );
  const target = new THREE.Vector3(
    c.x + (compact ? 0 : 2.3),
    c.y + (compact ? 0 : 2.7),
    c.z - 0.3,
  );
  game.camera.lookAt(target);
  return true;
}
