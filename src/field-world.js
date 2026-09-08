import * as THREE from "three";
import { needsCarriedFlame, torchHandsBusy } from "./torch.js";
import {
  hasTraversalCourse,
  buildTraversalCourse,
} from "./traversal-courses.js";
import {
  gateMaterials,
  buildSanctuaryGate,
  updateSanctuaryGate,
} from "./sanctuary-gates.js";
import { fieldComplete, currentFieldTask, EXPEDITIONS } from "./expeditions.js";

export function buildFieldStation(game, f, group) {
  const { stoneMat: stone, darkMat: dark, goldMat: gold } = game;
  if (hasTraversalCourse(game.level, f)) buildTraversalCourse(game, f, group);
  game.cylinder(0.85, 1.1, 0.7, dark, 0, 0.35, 0, group, 12);
  game.cylinder(0.94, 0.94, 0.14, gold, 0, 0.74, 0, group, 16);
  const core = new THREE.Group();
  group.add(core);
  f.core = core;
  if (["valve", "winch"].includes(f.kind)) {
    game.box(0.22, 1.2, 0.22, gold, 0, 1.3, 0, group);
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.085, 8, 28),
      gold,
    );
    core.add(wheel);
    core.position.y = 1.7;
    for (let i = 0; i < 6; i++) {
      const spoke = game.box(0.06, 1.4, 0.06, gold, 0, 0, 0, core);
      spoke.rotation.z = (i * Math.PI) / 3;
    }
    for (const side of [-1, 1])
      game.box(0.35, 1.5, 0.35, stone, side * 1.45, 0.75, 0, group);
  } else if (f.kind === "brazier") {
    game.cylinder(0.7, 0.28, 0.6, gold, 0, 1.1, 0, group, 12);
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 1.1, 7),
      new THREE.MeshBasicMaterial({ color: 0xffbb6a, toneMapped: false }),
    );
    fire.position.y = 1.95;
    group.add(fire);
    f.fire = fire;
    game.flames.push(fire);
  } else if (["lift", "delivery", "resonance"].includes(f.kind)) {
    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      f.kind === "resonance" ? game.glowMat : gold,
    );
    core.add(gem);
    core.position.y = 1.2;
    if (f.kind === "delivery") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.06, 8, 24),
        gold,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.83;
      group.add(ring);
    }
  } else {
    const tablet = game.box(1.3, 1.05, 0.16, stone, 0, 1.3, 0, group);
    tablet.rotation.x = -0.25;
    for (let i = 0; i < 4; i++)
      game.box(
        0.75 - i * 0.1,
        0.035,
        0.06,
        gold,
        0,
        1.1 + i * 0.14,
        0.12,
        group,
      );
  }
  // The station's framing is small enough to leave all approach trails clear.
  for (const side of [-1, 1]) {
    game.box(0.65, 3.4, 0.7, stone, side * 2.7, 1.7, -1.5, group);
    game.box(0.82, 0.2, 0.9, gold, side * 2.7, 3.45, -1.5, group);
  }
  game.box(6.2, 0.45, 0.8, stone, 0, 3.8, -1.5, group);
}

export function buildFieldGates(game) {
  game.fieldGates = [];
  game.gateSources = [];
  const materials = gateMaterials(game.level);
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const gate = buildSanctuaryGate(game, feature, materials);
    game.fieldGates.push(gate);
    game.gateSources.push(...gate.sources);
  }
}

export function updateFieldWorld(game, dt) {
  const current = currentFieldTask(game.level, game.progress);
  for (const f of game.items) {
    if (f.type !== "field") continue;
    const done =
      f.stage < game.progress.stage || game.progress.field.includes(f.id);
    f.group.visible = true;
    f.marker.visible = current?.id === f.id;
    if (f.fire) f.fire.visible = done;
    if (f.kind === "lift") f.core.visible = !done;
    if (f.kind === "delivery") f.core.visible = done;
    if (["valve", "winch"].includes(f.kind))
      f.core.rotation.z +=
        ((done ? Math.PI * 1.5 : 0) - f.core.rotation.z) * Math.min(1, dt * 3);
    if (f.kind === "resonance") f.core.rotation.y += dt * (done ? 1.2 : 0.2);
  }
  for (const gate of game.fieldGates) updateSanctuaryGate(game, gate, dt);
}

export function finishFieldTask(game, f) {
  if (currentFieldTask(game.level, game.progress)?.id !== f.id) {
    game.cb.toast?.(
      "Follow the gold marker. This station belongs to another part of the route.",
    );
    return false;
  }
  if (
    needsCarriedFlame(game.level, f) &&
    (!game.progress.torch ||
      game.swimming ||
      game.diving ||
      torchHandsBusy(game))
  ) {
    game.cb.toast?.(
      "This brazier needs a carried flame. Light your torch at a camp or a burning brazier with T / Torch.",
      5500,
    );
    return false;
  }
  game.progress.field.push(f.id);
  game.audio.tone("field");
  const mission = EXPEDITIONS[game.level.id][f.stage];
  const complete = fieldComplete(game.level, game.progress);
  game.cb.toast?.(
    complete
      ? mission.aftermath
      : `${f.label} · ${f.step + 1} / 3 field stations restored`,
    complete ? 6500 : 3500,
  );
  if (complete) game.audio.tone("gate");
  game.save();
  return true;
}
