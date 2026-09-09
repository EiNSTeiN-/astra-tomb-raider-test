import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { poseFeet } from "./pose.js";
import { waterAt } from "./hydrology.js";
import { CROUCH_DROP, playerFootstep } from "./stealth.js";
import { strideScale } from "./stride.js";

const UP = new THREE.Vector3(0, 1, 0);

// Cache a small perimeter of each sole from the delivered, skinned boots. These
// probes follow the animated toe bones as well as the ankle; a bone origin alone
// cannot tell whether the visible heel has penetrated a slope.
function makeFeet(model) {
  const shoe = model.getObjectByName("shoes04");
  if (!shoe?.isSkinnedMesh) return null;
  const { position, skinWeight, skinIndex } = shoe.geometry.attributes;
  return ["Left", "Right"].map((side) => {
    const candidates = [];
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > 0.035) continue;
      let dominant = 0;
      for (let k = 1; k < 4; k++)
        if (
          skinWeight.getComponent(i, k) > skinWeight.getComponent(i, dominant)
        )
          dominant = k;
      if (
        shoe.skeleton.bones[skinIndex.getComponent(i, dominant)].name.includes(
          side,
        )
      )
        candidates.push(i);
    }
    const indices = new Set();
    for (let j = 0; j < 16; j++) {
      const angle = (j * Math.PI) / 8;
      // Include both the outsole edge and the lowest edge of its bevel.
      for (const depth of [0, 4]) {
        let best = -Infinity,
          selected;
        for (const i of candidates) {
          const score =
            position.getX(i) * Math.cos(angle) +
            position.getZ(i) * Math.sin(angle) -
            position.getY(i) * depth;
          if (score > best) {
            best = score;
            selected = i;
          }
        }
        if (selected !== undefined) indices.add(selected);
      }
    }
    return {
      bone: model.getObjectByName(`mixamorig${side}Foot`),
      shoe,
      indices: [...indices],
      lifted: false,
    };
  });
}

function probes(foot) {
  return foot.indices.map((i) =>
    foot.shoe
      .getVertexPosition(i, new THREE.Vector3())
      .applyMatrix4(foot.shoe.matrixWorld),
  );
}
function setWorldRotation(bone, rotation) {
  bone.quaternion.copy(
    bone.parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(rotation),
  );
  bone.updateWorldMatrix(false, true);
}
function updateSkin(game) {
  game.avatar.updateWorldMatrix(true, false);
  // SkinnedMesh.updateMatrixWorld refreshes the attached bind inverse. The
  // generic updateWorldMatrix does not; querying vertices before rendering would
  // otherwise apply the player's translation twice.
  game.rig.model.updateMatrixWorld(true);
}

// Visual only: support queries share the character controller's decks and
// platforms, but this never changes its capsule, velocity or persistent position.
export function groundExplorer(game, dt, moving, sprinting) {
  const rig = game.rig;
  const eligible =
    game.grounded &&
    !game.swimming &&
    !game.climb &&
    !game.ropeRide &&
    !game.zipRide &&
    !game.dodge &&
    typeof game.groundHeight === "function" &&
    Array.isArray(game.obstacles);
  if (!eligible) {
    if (rig.grounding) {
      rig.grounding.active = false;
      rig.grounding.previous = null;
    }
    return false;
  }
  const state = (rig.grounding ??= {
    feet: makeFeet(rig.model),
    active: false,
    pelvis: 0,
    clock: 0,
    travel: 0,
    lastStep: -1,
  });
  if (!state.feet?.every((f) => f.bone && f.indices.length)) return false;
  const root = game.player.position;
  const water = waterAt(game, root.x, root.z);
  const wading = water && water.y - root.y > 0.12;
  const distance = state.previous
    ? Math.hypot(root.x - state.previous.x, root.z - state.previous.z)
    : 0;
  const reset = !state.active || !state.previous || distance > 1.5;
  state.previous = root.clone();
  state.clock += dt;
  state.travel = reset || !moving ? 0 : state.travel + distance;
  updateSkin(game);
  const facing = game.avatar.getWorldQuaternion(new THREE.Quaternion());
  const inverseFacing = facing.clone().invert();
  const speed =
    game.actualMoveSpeed ??
    Math.hypot(game.moveVelocity?.x || 0, game.moveVelocity?.z || 0);
  const scale = game.blockGrip ? 1 : strideScale(game, rig.state, speed);
  state.stride = reset
    ? scale
    : THREE.MathUtils.damp(state.stride ?? 1, scale, 14, dt);
  const support = (x, z) => {
    const result = supportAt(game, x, z, root.y + 0.45);
    return Math.abs(result.height - root.y) <= 0.5 ? result : null;
  };
  const plans = state.feet.map((foot) => {
    const points = probes(foot),
      ankle = foot.bone.getWorldPosition(new THREE.Vector3());
    const lift = Math.max(0, Math.min(...points.map((p) => p.y)) - root.y);
    const local = ankle.clone().sub(root).applyQuaternion(inverseFacing);
    const crouch = rig.crouchBlend || 0;
    // A crouched recovery passes beneath the hips instead of lifting the heel
    // far behind them, which would drive the bent knee into the floor.
    const recovery = THREE.MathUtils.smoothstep(lift, 0.015, 0.045) * 0.2;
    const offset = new THREE.Vector3(
      0,
      0,
      local.z * (state.stride - 1) + crouch * (0.14 + recovery),
    ).applyQuaternion(facing);
    ankle.add(offset);
    const rotation = foot.bone.getWorldQuaternion(new THREE.Quaternion());
    const center = support(ankle.x, ankle.z);
    const samples = [
      support(ankle.x - 0.12, ankle.z),
      support(ankle.x + 0.12, ankle.z),
      support(ankle.x, ankle.z - 0.12),
      support(ankle.x, ankle.z + 0.12),
    ];
    if (center && samples.every(Boolean)) {
      const normal = new THREE.Vector3(
        samples[0].height - samples[1].height,
        0.24,
        samples[2].height - samples[3].height,
      ).normalize();
      // Discontinuous ledges and very steep ground retain the animated boot
      // angle. A planted foot follows a walkable slope; a raised toe keeps roll.
      if (normal.y > 0.88) {
        const tilt = new THREE.Quaternion().setFromUnitVectors(UP, normal);
        tilt.slerp(
          new THREE.Quaternion(),
          THREE.MathUtils.smoothstep(lift, 0.04, 0.2),
        );
        rotation.premultiply(tilt);
        setWorldRotation(foot.bone, rotation);
      }
    }
    const clearances = probes(foot).flatMap((p) => {
      p.add(offset);
      const floor = support(p.x, p.z);
      return floor ? [p.y - floor.height] : [];
    });
    const valid = clearances.length > 0;
    const shift = valid
      ? THREE.MathUtils.clamp(
          lift + 0.006 - Math.min(...clearances),
          -0.42,
          0.42,
        )
      : 0;
    return { foot, ankle, rotation, lift, valid, center, shift };
  });
  let pelvis = Math.max(-0.3, Math.min(0, ...plans.map((p) => p.shift)));
  // Longer steps need room to extend. Lower only the visual pelvis enough for
  // the existing leg lengths to reach the ankle targets, preserving sole lift.
  for (const p of plans) {
    const knee = p.foot.bone.parent,
      thigh = knee.parent;
    const hip = thigh.getWorldPosition(new THREE.Vector3());
    const reach =
      (knee.position.length() + p.foot.bone.position.length()) * 0.995;
    const horizontal = Math.hypot(p.ankle.x - hip.x, p.ankle.z - hip.z);
    const vertical = Math.sqrt(
      Math.max(0.01, reach * reach - horizontal * horizontal),
    );
    const needed =
      p.ankle.y +
      p.shift +
      vertical -
      hip.y +
      (rig.crouchBlend || 0) * CROUCH_DROP;
    pelvis = Math.min(pelvis, Math.max(-0.3, needed));
  }
  state.pelvis = reset
    ? pelvis
    : Math.min(
        pelvis,
        THREE.MathUtils.lerp(state.pelvis, pelvis, 1 - Math.exp(-20 * dt)),
      );
  game.avatar.position.y = state.pelvis - (rig.crouchBlend || 0) * CROUCH_DROP;
  poseFeet(
    game,
    plans.map((p) => p.ankle.clone().add(new THREE.Vector3(0, p.shift, 0))),
  );
  for (const p of plans) setWorldRotation(p.foot.bone, p.rotation);
  updateSkin(game);
  state.active = true;
  state.contacts = plans.map((p) => {
    const points = probes(p.foot),
      supported = points
        .flatMap((point) => {
          const floor = support(point.x, point.z);
          return floor ? [{ point, gap: point.y - floor.height }] : [];
        })
        .sort((a, b) => a.gap - b.gap);
    const contact = supported[0];
    if (reset) p.foot.lifted = false;
    if (p.lift > 0.055) p.foot.lifted = true;
    if (p.lift < 0.03 && p.foot.lifted) {
      p.foot.lifted = false;
      if (
        moving &&
        dt > 0 &&
        distance > 0.001 &&
        state.travel > 0.18 &&
        !game.paused &&
        contact &&
        contact.gap < 0.045 &&
        state.clock - state.lastStep > 0.16 &&
        !wading
      ) {
        playerFootstep(
          game,
          p.center?.surface?.skyBridge || p.center?.surface?.courier
            ? "wood"
            : game.level?.biome,
          sprinting,
          contact.point,
        );
        state.travel = 0;
        state.lastStep = state.clock;
      }
    }
    return {
      lift: p.lift,
      clearance: contact?.gap ?? null,
      supported: p.valid,
    };
  });
  return true;
}
