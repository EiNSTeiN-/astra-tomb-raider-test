import * as THREE from "three";
import {
  COUNTERWEIGHTS,
  TILE,
  normalizeWeights,
  pressureState,
  weightsSolved,
  stoneMove,
} from "./counterweight-rules.js";
import { fieldComplete } from "./expeditions.js";
import { poseHands } from "./pose.js";
import { boxEntry } from "./camera-collision.js";
import { mergeArchitecture } from "./visuals.js";
const GRIP_DISTANCE = 1.1;

function label(text, size = 1.3) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d6c391";
  ctx.font = "600 38px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64, 490);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size / 4),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.userData.animated = true;
  return mesh;
}
export const hasCounterweights = (feature) =>
  feature.type === "mechanism" && feature.stage === 0;
export function counterweightsReady(game, feature) {
  return (
    !hasCounterweights(feature) ||
    game.progress.stage > 0 ||
    !!game.counterweights?.saved.solved
  );
}
export function buildCounterweights(game, feature, group) {
  const trial = COUNTERWEIGHTS[game.level.id];
  const saved = normalizeWeights(game.level.id, game.progress.counterweights);
  game.progress.counterweights = saved;
  const chamber = (game.counterweights = {
    trial,
    saved,
    feature,
    group,
    blocks: [],
    plates: [],
    open: game.progress.stage > 0 || saved.solved,
  });
  const stone = game.stoneMat,
    gold = game.goldMat,
    dark = game.darkMat;
  // The board sits inside the existing first sanctuary, preserving its entrance.
  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 5; x++) {
      const tile = game.box(
        TILE - 0.05,
        0.055,
        TILE - 0.05,
        stone,
        (x - 2) * TILE,
        0.035,
        (z - 2) * TILE,
        group,
      );
      tile.receiveShadow = true;
      for (const turn of [0, 1]) {
        const line = game.box(
          1.25,
          0.015,
          0.025,
          gold,
          (x - 2) * TILE,
          0.07,
          (z - 2) * TILE,
          group,
        );
        line.rotation.y = (turn * Math.PI) / 2;
      }
    }
  for (const cell of trial.walls) {
    const x = (cell[0] - 2) * TILE,
      z = (cell[1] - 2) * TILE;
    game.box(1.43, 1.95, 1.43, stone, x, 0.975, z, group);
    game.box(1.49, 0.16, 1.49, dark, x, 2.03, z, group);
    game.obstacles.push({
      x: group.position.x + x,
      z: group.position.z + z,
      w: 1.17,
      d: 1.17,
      h: 2.15,
    });
  }
  trial.goals.forEach((goal, index) => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x807653,
      metalness: 0.65,
      roughness: 0.45,
      emissive: 0x355440,
      emissiveIntensity: 0,
    });
    const plates = goal.cells.map((cell) => {
      const plate = game.box(
        1.32,
        0.065,
        1.32,
        material,
        (cell[0] - 2) * TILE,
        0.085,
        (cell[1] - 2) * TILE,
        group,
      );
      plate.userData.animated = true;
      const name = label(goal.name, 1.24);
      name.rotation.x = -Math.PI / 2;
      name.position.y = 0.046;
      plate.add(name);
      return plate;
    });
    const sign = label(goal.name, 1.55);
    sign.position.set(-3.5 + index * 2.35, 2.65, -5.95);
    group.add(sign);
    chamber.plates.push({ goal, material, meshes: plates, active: false });
  });
  trial.stones.forEach((definition, index) => {
    const block = new THREE.Group();
    block.userData.cameraDynamic = true;
    block.name = `${definition.name} counterweight`;
    group.add(block);
    game.box(1.16, 1.22, 1.16, stone, 0, 0.66, 0, block);
    game.box(1.22, 0.12, 1.22, gold, 0, 1.27, 0, block);
    for (let side = 0; side < 4; side++) {
      const face = new THREE.Group();
      face.rotation.y = (side * Math.PI) / 2;
      block.add(face);
      const name = label(definition.name, 0.95);
      name.position.set(0, 0.84, 0.587);
      face.add(name);
      game.box(0.72, 0.065, 0.06, gold, 0, 1.1, 0.6, face);
      for (let mark = 0; mark < definition.weight; mark++)
        game.box(
          0.07,
          0.13,
          0.035,
          gold,
          (mark - (definition.weight - 1) / 2) * 0.14,
          0.65,
          0.613,
          face,
        );
    }
    const obstacle = { x: 0, z: 0, w: 1.03, d: 1.03, h: 1.32 };
    game.obstacles.push(obstacle);
    chamber.blocks.push({ definition, group: block, obstacle, index });
  });
  // A physical restraint withdraws from the control when the pressure latches.
  const cage = new THREE.Group();
  cage.userData.cameraDynamic = true;
  group.add(cage);
  cage.position.set(0, 0, -5);
  for (const x of [-0.9, 0.9]) game.box(0.1, 2.25, 0.1, gold, x, 1.15, 0, cage);
  game.box(1.9, 0.12, 0.1, gold, 0, 2.28, 0, cage);
  chamber.cage = cage;
  const control = new THREE.Group();
  control.position.z = -5;
  group.add(control);
  game.cylinder(0.6, 0.78, 0.7, dark, 0, 0.4, 0, control, 12);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36), game.glowMat);
  core.position.y = 1.2;
  control.add(core);
  feature.core = core;
  const tablet = game.box(1.5, 1.15, 0.25, stone, 0, 0.65, 8.4, group);
  tablet.rotation.x = -0.14;
  const name = label("COUNTERWEIGHTS", 1.45);
  name.position.set(0, 0.94, 8.57);
  group.add(name);
  chamber.tablet = group.position.clone().add(new THREE.Vector3(0, 0, 8.4));
  mergeArchitecture(group);
  syncCounterweights(game, 0);
}
function worldCell(chamber, cell) {
  return new THREE.Vector3(
    chamber.group.position.x + (cell[0] - 2) * TILE,
    chamber.group.position.y,
    chamber.group.position.z + (cell[1] - 2) * TILE,
  );
}
function positionBlock(chamber, block, position) {
  block.group.position.copy(position).sub(chamber.group.position);
  block.obstacle.x = position.x;
  block.obstacle.z = position.z;
}
export function syncCounterweights(game, dt) {
  const chamber = game.counterweights;
  if (!chamber) return;
  for (const block of chamber.blocks) {
    if (game.blockGrip?.block === block && game.blockGrip.move) continue;
    positionBlock(
      chamber,
      block,
      worldCell(chamber, chamber.saved.positions[block.index]),
    );
  }
  const states = pressureState(chamber.trial, chamber.saved.positions);
  states.forEach((state, i) => {
    const plate = chamber.plates[i];
    plate.material.color.setHex(
      state.active ? 0x89ac87 : state.weight === 0 ? 0x816355 : 0x807653,
    );
    plate.material.emissiveIntensity = state.active ? 0.45 : 0;
    for (const mesh of plate.meshes)
      mesh.position.y = state.active ? 0.062 : 0.085;
    if (state.active && !plate.active && dt > 0) {
      const position = worldCell(chamber, state.cells[0]);
      game.audio.noiseHit?.(0.018, 0.35, 400 + i * 260, position);
      if (game.level.biome === "crystal") game.audio.note?.([220, 330, 440][i]);
    }
    plate.active = state.active;
  });
  chamber.open = game.progress.stage > 0 || chamber.saved.solved;
  if (chamber.feature.marker)
    chamber.feature.marker.position.z = chamber.open ? -5 : 0;
  chamber.cage.position.y +=
    ((chamber.open ? 2.5 : 0) - chamber.cage.position.y) *
    (dt === 0 ? 1 : Math.min(1, dt * 3));
}
function available(game) {
  return (
    game.counterweights &&
    game.progress.stage === 0 &&
    !game.counterweights.saved.solved &&
    fieldComplete(game.level, game.progress, 0)
  );
}
function standClear(game, position, ignore) {
  const height = ignore.h;
  ignore.h = 0;
  try {
    return game.canMove(
      position.x,
      position.z,
      position.y - game.groundHeight(position.x, position.z),
    );
  } finally {
    ignore.h = height;
  }
}
function slideClear(game, from, to, ignore, radius) {
  const extra = Math.max(0, radius - 0.45);
  for (const obstacle of game.obstacles) {
    if (obstacle === ignore || obstacle.h <= 0.2) continue;
    const base = game.groundHeight(obstacle.x, obstacle.z);
    if (base + obstacle.h <= from.y + 0.05 || base >= from.y + 1.3) continue;
    if (
      boxEntry(
        from,
        to,
        {
          min: {
            x: obstacle.x - obstacle.w - extra,
            y: from.y - 1,
            z: obstacle.z - obstacle.d - extra,
          },
          max: {
            x: obstacle.x + obstacle.w + extra,
            y: from.y + 2,
            z: obstacle.z + obstacle.d + extra,
          },
        },
        0,
        true,
      ) !== null
    )
      return false;
  }
  return true;
}
function candidate(game) {
  if (
    !available(game) ||
    !game.grounded ||
    game.swimming ||
    game.carrying ||
    game.climb ||
    game.dodge ||
    game.ropeRide ||
    game.zipRide
  )
    return null;
  const chamber = game.counterweights,
    p = game.player.position;
  let nearest = null,
    distance = 2.45;
  for (const block of chamber.blocks) {
    const position = worldCell(chamber, chamber.saved.positions[block.index]);
    const delta = p.clone().sub(position);
    if (Math.abs(delta.y) > 0.35 || delta.length() > distance) continue;
    const axis =
      Math.abs(delta.x) > Math.abs(delta.z)
        ? [-Math.sign(delta.x) || 1, 0]
        : [0, -Math.sign(delta.z) || 1];
    const target = position
      .clone()
      .add(
        new THREE.Vector3(
          -axis[0] * GRIP_DISTANCE,
          0,
          -axis[1] * GRIP_DISTANCE,
        ),
      );
    if (
      p.distanceTo(target) > 1.35 ||
      !standClear(game, target, block.obstacle)
    )
      continue;
    let clear = true;
    for (let step = 1; step <= 8; step++)
      if (!standClear(game, p.clone().lerp(target, step / 8), block.obstacle))
        clear = false;
    if (!clear) continue;
    nearest = { block, axis, target };
    distance = delta.length();
  }
  return nearest;
}
export function counterweightHint(game) {
  if (game.blockGrip)
    return { key: "E", label: "Release stone · Up / Down to push / pull" };
  const chamber = game.counterweights;
  if (!chamber) return null;
  if (game.player.position.distanceTo(chamber.tablet) < 2.7)
    return { key: "E", label: "Read counterweight inscription / reset stones" };
  const grip = candidate(game);
  return grip
    ? {
        key: "E",
        label: `Grip ${grip.block.definition.name} stone · ${grip.block.definition.weight} measures`,
      }
    : null;
}
export function counterweightInteract(game) {
  if (game.blockGrip) {
    if (game.blockGrip.move) game.blockGrip.release = true;
    else releaseCounterweight(game);
    return true;
  }
  const chamber = game.counterweights;
  if (!chamber) return false;
  if (game.player.position.distanceTo(chamber.tablet) < 2.7) {
    game.cb.counterweights?.(chamber);
    return true;
  }
  const grip = candidate(game);
  if (!grip) return false;
  game.player.position.copy(grip.target);
  game.nearest = null;
  game.keys.delete("KeyE");
  game.keys.delete("Space");
  game.aimUntil = 0;
  grip.cancel = () =>
    positionBlock(
      chamber,
      grip.block,
      worldCell(chamber, chamber.saved.positions[grip.block.index]),
    );
  game.blockGrip = grip;
  game.avatar.rotation.y = Math.atan2(grip.axis[0], grip.axis[1]);
  game.cb.toast?.(
    "Up pushes; Down pulls. Release with E to walk around the stone.",
    4500,
  );
  return true;
}
export function releaseCounterweight(game) {
  game.blockGrip?.cancel?.();
  game.blockGrip = null;
  game.moveVelocity = { x: 0, z: 0 };
}
export function updateCounterweightGrip(game, dt, direction) {
  const grip = game.blockGrip;
  if (!grip) return false;
  const chamber = game.counterweights;
  game.keys.delete("Space");
  if (!grip.move && Math.abs(direction) > 0.25) {
    const plan = stoneMove(
      chamber.trial,
      chamber.saved.positions,
      grip.block.index,
      grip.axis,
      direction < 0,
    );
    const blockTarget = plan && worldCell(chamber, plan.to);
    const playerTarget = blockTarget
      ?.clone()
      .add(
        new THREE.Vector3(
          -grip.axis[0] * GRIP_DISTANCE,
          0,
          -grip.axis[1] * GRIP_DISTANCE,
        ),
      );
    if (
      plan &&
      standClear(game, playerTarget, grip.block.obstacle) &&
      slideClear(
        game,
        worldCell(chamber, plan.from),
        blockTarget,
        grip.block.obstacle,
        0.61,
      ) &&
      slideClear(
        game,
        game.player.position,
        playerTarget,
        grip.block.obstacle,
        0.45,
      )
    ) {
      grip.move = {
        plan,
        pull: direction < 0,
        time: 0,
        from: worldCell(chamber, plan.from),
        to: blockTarget,
        playerFrom: game.player.position.clone(),
        playerTo: playerTarget,
      };
      game.audio.noiseHit?.(0.035, 0.55, 850, grip.move.from);
    } else if (!grip.bumpUntil || game.elapsed >= grip.bumpUntil) {
      grip.bumpUntil = game.elapsed + 2;
      game.cb.toast?.(
        "The track is blocked. Pull back or release and try another face.",
        3000,
      );
    }
  }
  game.moveVelocity = { x: 0, z: 0 };
  if (grip.move) {
    const move = grip.move;
    move.time += dt;
    const t = Math.min(1, move.time / 0.85),
      ease = t * t * (3 - 2 * t);
    positionBlock(chamber, grip.block, move.from.clone().lerp(move.to, ease));
    const previous = game.player.position.clone();
    game.player.position.copy(move.playerFrom).lerp(move.playerTo, ease);
    game.moveVelocity = {
      x: (game.player.position.x - previous.x) / Math.max(dt, 0.001),
      z: (game.player.position.z - previous.z) / Math.max(dt, 0.001),
    };
    if (t === 1) {
      chamber.saved.positions[grip.block.index] = [...move.plan.to];
      chamber.saved.moves++;
      chamber.saved.solved = weightsSolved(
        chamber.trial,
        chamber.saved.positions,
      );
      grip.move = null;
      syncCounterweights(game, dt);
      game.save();
      if (chamber.saved.solved) {
        game.audio.tone("gate");
        game.cb.toast?.(
          "The pressure latches hold. The sanctuary mechanism is ready.",
          5500,
        );
        releaseCounterweight(game);
      } else if (grip.release) releaseCounterweight(game);
    }
  }
  game.jumpY =
    game.player.position.y -
    game.groundHeight(game.player.position.x, game.player.position.z);
  return true;
}
export function poseCounterweight(game) {
  const grip = game.blockGrip;
  if (!grip || !game.rig) return;
  game.rig.model.rotation.x = 0.14;
  game.avatar.rotation.y = Math.atan2(grip.axis[0], grip.axis[1]);
  const center = grip.block.group.getWorldPosition(new THREE.Vector3());
  const side = new THREE.Vector3(grip.axis[1], 0, -grip.axis[0]);
  const hand = center
    .clone()
    .add(new THREE.Vector3(-grip.axis[0] * 0.61, 1.1, -grip.axis[1] * 0.61));
  poseHands(game, [
    hand.clone().addScaledVector(side, 0.3),
    hand.clone().addScaledVector(side, -0.3),
  ]);
}
export function resetCounterweights(game) {
  if (!game.counterweights || game.progress.stage > 0) return;
  releaseCounterweight(game);
  const chamber = game.counterweights;
  chamber.saved = game.progress.counterweights = normalizeWeights(
    game.level.id,
    null,
  );
  game.player.position.copy(chamber.tablet).add(new THREE.Vector3(0, 0, 1.3));
  game.player.position.y = game.groundHeight(
    game.player.position.x,
    game.player.position.z,
  );
  game.jumpY = 0;
  game.grounded = true;
  game.velocityY = 0;
  syncCounterweights(game, 0);
  game.save();
}
