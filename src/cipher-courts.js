import * as THREE from "three";
import {
  CIPHER_TRIALS,
  CIPHER_SIGNS,
  cipherName,
  cipherClue,
  normalizeCipher,
} from "./cipher-rules.js";
import {
  cipherRelief,
  cipherPlaques,
  batchCipherDrum,
  cipherWheelGeometry,
} from "./cipher-art.js";
import { restorePuzzle, applyMove, isSolved } from "./puzzles.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { poseHands } from "./pose.js";

export function cipherReady(game, site) {
  return (
    !!site &&
    !game.progress.completed &&
    site.stage === game.progress.stage &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}
export function buildCipherCourts(game) {
  game.cipherSites = [];
  game.cipherSources = [];
  game.cipherFocus = null;
  game.cipherGrip = null;
  if (game.level.biome !== "jungle") return false;
  const stone = (game.templeMaterial || game.stoneMat).clone(),
    bronze = game.goldMat,
    relief = stone.clone(),
    plaque = cipherPlaques(),
    signs = CIPHER_SIGNS.map((_, i) => cipherRelief(i));
  stone.vertexColors = false;
  relief.vertexColors = false;
  if (game.templeMaterial) {
    for (const material of [stone, relief]) {
      material.onBeforeCompile = game.templeMaterial.onBeforeCompile;
      material.customProgramCacheKey =
        game.templeMaterial.customProgramCacheKey;
    }
  }
  relief.color.multiplyScalar(0.68);
  relief.roughness = 0.92;
  const drumGeometry = stoneBlockGeometry(1.5, 1.1, 1.5, 73),
    frameGeometry = stoneBlockGeometry(1.57, 0.12, 1.57, 82),
    pedestalGeometry = new THREE.LatheGeometry(
      [
        [0, 0],
        [1.05, 0],
        [1.05, 0.14],
        [0.93, 0.23],
        [0.88, 0.32],
        [0.58, 0.48],
        [0.52, 0.7],
        [0, 0.7],
      ].map((p) => new THREE.Vector2(...p)),
      24,
    ),
    wheelGeometry = cipherWheelGeometry();
  const features = game.items.filter((f) => f.type === "mechanism");
  for (const feature of features) {
    const stage = feature.stage,
      trial = CIPHER_TRIALS[stage],
      root = new THREE.Group(),
      fixed = new THREE.Group(),
      detail = new THREE.Group();
    root.position.copy(feature.group.position);
    root.name = trial.title;
    root.add(fixed, detail);
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
      game.progress.cipher?.[stage],
    );
    if (stage < game.progress.stage || game.progress.completed)
      state.values = [...state.target];
    const site = {
      stage,
      trial,
      feature,
      root,
      fixed,
      detail,
      state,
      nodes: [],
      visualTime: 0,
      moving: false,
    };
    game.cipherSites.push(site);
    const floor = (x, z) =>
      game.groundHeight(root.position.x + x, root.position.z + z) -
      root.position.y;
    const add = (geometry, material, x, y, z, parent = fixed) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const control = (kind, index, x, z) => {
      const group = new THREE.Group();
      group.position
        .copy(root.position)
        .add(new THREE.Vector3(x, floor(x, z), z));
      game.world.add(group);
      const marker = add(
        new THREE.OctahedronGeometry(0.1),
        game.glowMat,
        0,
        2.8,
        0,
        group,
      );
      const f = {
        id: `cipher-${stage}-${kind}-${index}`,
        type: "cipher",
        kind,
        index,
        stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        group,
        marker,
        label:
          kind === "tablet"
            ? "Read the keeper's covenant"
            : `Turn drum ${cipherName(index)}`,
      };
      game.items.push(f);
      return f;
    };
    for (const [index, [x, z]] of trial.positions.entries()) {
      const y = floor(x, z),
        body = new THREE.Group(),
        rotor = new THREE.Group();
      body.position.set(x, y, z);
      detail.add(body);
      add(pedestalGeometry, stone, x, y, z);
      add(
        new THREE.CylinderGeometry(0.38, 0.44, 0.7, 16),
        relief,
        x,
        y + 0.81,
        z,
      );
      rotor.position.y = 1.78;
      body.add(rotor);
      add(drumGeometry, stone, 0, 0, 0, rotor);
      for (const h of [-0.58, 0.58]) add(frameGeometry, relief, 0, h, 0, rotor);
      for (let sign = 0; sign < 4; sign++) {
        const face = new THREE.Group();
        face.rotation.y = (sign * Math.PI) / 2;
        rotor.add(face);
        add(
          stoneBlockGeometry(1.02, 0.9, 0.035, sign + index * 11),
          relief,
          0,
          0,
          0.756,
          face,
        );
        add(signs[sign], stone, 0, 0.1, 0.793, face);
        const label = plaque(CIPHER_SIGNS[sign], 0.82, 0.13);
        label.position.set(0, 0.45, 0.802);
        face.add(label);
      }
      batchCipherDrum(rotor);
      // A square lotus capital and tapered finial retain the temple silhouette.
      add(
        stoneBlockGeometry(1.8, 0.18, 1.8, stage + index),
        stone,
        x,
        y + 2.6,
        z,
      );
      for (let tier = 0; tier < 3; tier++)
        add(
          stoneBlockGeometry(
            1.5 - tier * 0.34,
            0.16,
            1.5 - tier * 0.34,
            stage + index + tier,
          ),
          stone,
          x,
          y + 2.76 + tier * 0.16,
          z,
        );
      add(new THREE.ConeGeometry(0.21, 0.42, 4), stone, x, y + 3.28, z);
      add(
        new THREE.CylinderGeometry(0.14, 0.14, 2.6, 12),
        relief,
        x,
        y + 1.5,
        z,
      );
      const number = plaque(cipherName(index), 0.6, 0.2);
      number.position.set(x, y + 0.46, z + 0.91);
      fixed.add(number);
      // The standing apron can slope below the pillar's foundation. Fit the
      // handwheel and shaft to that supported stance, rather than the plinth.
      const wheelY = 1.25 + floor(x, z + 1.52) - y,
        wheel = add(wheelGeometry, bronze, 0, wheelY, 1.16, body),
        handles = [];
      add(
        new THREE.CylinderGeometry(0.065, 0.065, 0.45, 12).rotateX(Math.PI / 2),
        bronze,
        0,
        wheelY,
        0.96,
        body,
      );
      for (const side of [-1, 1]) {
        const h = new THREE.Object3D();
        h.position.set(side * 0.27, 0, 0.05);
        wheel.add(h);
        handles.push(h);
      }
      const f = control("drum", index, x, z + 1.52);
      const sound = {
        id: `cipher-${stage}-${index}`,
        kind: "machine",
        x: root.position.x + x,
        y: root.position.y + y + wheelY,
        z: root.position.z + z + 1.2,
        near: 1.2,
        range: 20,
        gain: 0.065,
        rate: 0.7 + index * 0.045,
        cipherStage: stage,
        cipherIndex: index,
        activity: 0,
      };
      game.cipherSources.push(sound);
      site.nodes.push({
        index,
        x,
        y,
        z,
        body,
        rotor,
        wheel,
        handles,
        control: f,
        sound,
        display: state.values[index],
      });
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z,
        w: 1.02,
        d: 1.04,
        h: 3.55,
        cipher: true,
      });
      const proxy = add(
        new THREE.BoxGeometry(2.04, 3.55, 2.08),
        stone,
        x,
        y + 1.775,
        z,
      );
      proxy.visible = false;
      game.cameraSurfaces?.capture(proxy);
      fixed.remove(proxy);
      proxy.geometry.dispose();
    }
    const recordZ = stage === 0 ? 17 : 23,
      recordY = floor(0, recordZ);
    const tabletBody = add(
      stoneBlockGeometry(4.4, 2.8, 0.42, stage + 53),
      stone,
      0,
      recordY + 1.45,
      recordZ,
    );
    game.cameraSurfaces?.capture(tabletBody);
    add(
      stoneBlockGeometry(4.75, 0.24, 0.75, stage + 59),
      stone,
      0,
      recordY + 2.93,
      recordZ,
    );
    const header = plaque("READ THE COVENANT", 3.8, 0.32);
    header.position.set(0, recordY + 2.62, recordZ + 0.24);
    fixed.add(header);
    trial.clues.forEach((clue, i) => {
      const line = plaque(cipherClue(clue), 4, 0.23);
      line.position.set(0, recordY + 2.25 - i * 0.25, recordZ + 0.24);
      fixed.add(line);
    });
    site.tablet = control("tablet", 0, 0, recordZ + 1.7);
    game.obstacles.push({
      x: root.position.x,
      z: root.position.z + recordZ,
      w: 2.2,
      d: 0.3,
      h: 3.1,
      cipher: true,
    });
    mergeArchitecture(fixed);
  }
  settleCipher(game);
  return true;
}
export function saveCipherState(game, stage, state, event) {
  const value = normalizeCipher({ [stage]: state })[stage],
    site = game.cipherSites?.[stage];
  if (!value || !cipherReady(game, site)) return false;
  game.progress.cipher ||= {};
  game.progress.cipher[stage] = value;
  site.state = restorePuzzle(game.level, stage, value);
  if (event?.kind === "changed") {
    const node = site.nodes[event.index];
    node.display = state.values[event.index] - event.delta;
    game.audio.noiseHit?.(0.006, 0.13, 650, node.control.group.position);
    if (game.paused) {
      game.presentationRemaining = 0.9;
      game.renderOnce = true;
    }
  } else settleCipher(game);
  game.save();
  return true;
}
export function updateCipherCourts(game, dt) {
  for (const site of game.cipherSites || []) {
    site.visualTime += Math.max(0, dt);
    const active = cipherReady(game, site),
      complete = site.stage < game.progress.stage || game.progress.completed;
    site.feature.core.visible = false;
    site.feature.marker.visible = false;
    site.detail.visible =
      game.cipherFocus === site.stage ||
      !game.player ||
      site.root.position.distanceTo(game.player.position) <
        (site.detail.visible ? 110 : 100);
    site.tablet.marker.visible = active;
    site.moving = false;
    site.tablet.label = isSolved(site.state)
      ? "The covenant is aligned · activate the sun gate"
      : "Read the keeper's covenant";
    for (const node of site.nodes) {
      const target = (complete ? site.state.target : site.state.values)[
          node.index
        ],
        delta = target - node.display;
      node.display =
        Math.abs(delta) < 0.002
          ? target
          : THREE.MathUtils.lerp(node.display, target, 1 - Math.exp(-12 * dt));
      node.rotor.rotation.y = (-node.display * Math.PI) / 2;
      node.wheel.rotation.z = (-node.display * Math.PI) / 2;
      node.sound.activity = active
        ? Math.min(1, Math.abs(target - node.display) * 2)
        : 0;
      site.moving ||= node.sound.activity > 0.01;
      node.control.marker.visible = active && game.sense > 0;
      node.control.label = `Turn drum ${cipherName(node.index)} · ${CIPHER_SIGNS[target]}`;
    }
  }
  const grip = game.cipherGrip,
    site = game.cipherSites?.[grip?.stage];
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
      game.cipherGrip = null;
    else if (game.rig) {
      game.avatar.rotation.y = Math.PI;
      const n = site.nodes[grip.index];
      n.wheel.updateWorldMatrix(true, true);
      poseHands(
        game,
        (grip.order || [0, 1]).map((i) =>
          n.handles[i].getWorldPosition(new THREE.Vector3()),
        ),
      );
    }
  }
}
export function settleCipher(game) {
  game.cipherGrip = null;
  for (const site of game.cipherSites || [])
    for (const n of site.nodes)
      n.display = (
        site.stage < game.progress.stage || game.progress.completed
          ? site.state.target
          : site.state.values
      )[n.index];
  updateCipherCourts(game, 0);
}
export function cipherInteract(game) {
  const f = game.nearest;
  if (f?.type !== "cipher") return false;
  const site = game.cipherSites?.[f.stage];
  if (
    !cipherReady(game, site) ||
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
      game.progress.cipher?.[f.stage],
    ),
    delta = game.keys.has("ShiftLeft") || game.keys.has("ShiftRight") ? -1 : 1,
    event = applyMove(state, { index: f.index, delta });
  saveCipherState(game, f.stage, state, event);
  game.cipherGrip = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.5,
    position: game.player.position.clone(),
    order:
      Math.cos(((state.values[f.index] - delta * 0.5) * Math.PI) / 2) < 0
        ? [1, 0]
        : [0, 1],
  };
  // Only reach for handles from a position close enough to touch them. Keep the
  // normal interaction margin available for keyboard and touch controls.
  if (game.player.position.distanceTo(f.group.position) > 0.2)
    game.cipherGrip = null;
  game.cb.toast?.(
    isSolved(state)
      ? "The covenant is aligned. Activate the sun gate at its inscription."
      : `${cipherName(f.index)} now bears ${CIPHER_SIGNS[state.values[f.index]]}. Every turn saves.`,
    2500,
  );
  game.keys.delete("KeyE");
  return true;
}
export function cipherTarget(game) {
  const site = game.cipherSites?.[game.progress.stage];
  return cipherReady(game, site) ? site.tablet : null;
}
export function focusCipher(game) {
  const site = game.cipherSites?.[game.cipherFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  game.camera.position.set(
    c.x,
    c.y + (compact ? 10 : 13),
    c.z + (compact ? 35 : 30),
  );
  game.camera.fov = compact ? 100 : 78;
  game.camera.filmOffset = compact
    ? 0
    : 0.46 *
      game.camera.getFilmWidth() *
      Math.tan((game.camera.fov * Math.PI) / 360) *
      game.camera.aspect;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(c.x, c.y + (compact ? -6 : 1), c.z + 15);
  return true;
}
