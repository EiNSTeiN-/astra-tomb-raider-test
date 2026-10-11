import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { poseFeet } from "./pose.js";
import { waterAt } from "./hydrology.js";
import { CROUCH_DROP, playerFootstep } from "./stealth.js";
import { strideScale } from "./stride.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";
import { fitCrouchTerrain } from "./explorer-terrain-pose.js";

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
      clearanceIndices: candidates,
      lifted: false,
    };
  });
}

function probes(foot, complete = false) {
  return (complete ? foot.clearanceIndices : foot.indices).map((i) =>
    foot.shoe
      .getVertexPosition(i, new THREE.Vector3())
      .applyMatrix4(foot.shoe.matrixWorld),
  );
}

// The animated foot frame can already pitch the outsole, particularly when
// the model leans into a crouch. Fit its actual outsole instead of assuming
// world up: adding a terrain tilt to an already tilted boot leaves a high heel.
function footPlane(points) {
  const center = new THREE.Vector3();
  for (const point of points) center.add(point);
  center.divideScalar(points.length || 1);
  let xx = 0,
    zz = 0,
    xz = 0,
    xy = 0,
    zy = 0;
  for (const point of points) {
    const x = point.x - center.x,
      y = point.y - center.y,
      z = point.z - center.z;
    xx += x * x;
    zz += z * z;
    xz += x * z;
    xy += x * y;
    zy += z * y;
  }
  const determinant = xx * zz - xz * xz;
  if (determinant <= 1e-10) return null;
  return {
    center,
    normal: new THREE.Vector3(
      -(xy * zz - zy * xz) / determinant,
      1,
      -(zy * xx - xy * xz) / determinant,
    ).normalize(),
  };
}

function terrainSoleNormal(points, support, ankle) {
  const anchor = ankle.clone();
  const floors = [
    ...points.map((point) => point.clone()),
    anchor,
    ...[
      [-0.12, 0],
      [0.12, 0],
      [0, -0.12],
      [0, 0.12],
    ].map(([x, z]) => anchor.clone().add(new THREE.Vector3(x, 0, z))),
  ];
  if (
    !floors.every((point) => {
      const floor = support(point.x, point.z);
      if (!floor) return false;
      point.y = floor.height;
      return true;
    })
  )
    return null;
  const plane = footPlane(floors);
  if (!plane || plane.normal.y <= 0.55) return null;
  const { center, normal } = plane;
  return floors.every((point) => {
    const predicted =
      center.y -
      (normal.x * (point.x - center.x) + normal.z * (point.z - center.z)) /
        normal.y;
    return Math.abs(point.y - predicted) < 0.04;
  })
    ? normal
    : null;
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
  const bodySupport = supportAt(
    game,
    root.x,
    root.z,
    root.y,
    NATURE_BODY_RADIUS,
  );
  const support = (x, z) => {
    const result = supportAt(game, x, z, root.y + 0.45);
    // A boot beside a finite cap can reach its steep bevel while the other
    // boot stands on top. Lowering the pelvis toward that edge bends the knee
    // through the cap. Treat a substantial drop as an unsupported foothold.
    if (bodySupport.surface?.triangles && root.y - result.height > 0.12)
      return null;
    return result.height >= root.y - 0.5 && result.height <= root.y + 0.65
      ? result
      : null;
  };
  const plans = state.feet.map((foot) => {
    const points = probes(foot),
      ankle = foot.bone.getWorldPosition(new THREE.Vector3());
    const lift = moving
      ? Math.max(0, Math.min(...points.map((p) => p.y)) - root.y)
      : 0;
    const local = ankle.clone().sub(root).applyQuaternion(inverseFacing);
    const crouch = rig.crouchBlend || 0;
    // A crouched recovery passes beneath the hips instead of lifting the heel
    // far behind them, which would drive the bent knee into the floor.
    const recovery = THREE.MathUtils.smoothstep(lift, 0.015, 0.045) * 0.2;
    const offset = new THREE.Vector3(
      0,
      0,
      local.z * (state.stride - 1) + crouch * (moving ? 0.14 + recovery : 0),
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
      const normal = terrainSoleNormal(
        points.map((point) => point.clone().add(offset)),
        support,
        ankle,
      );
      // Follow continuous supported banks as well as gentle slopes. Keep the
      // animated angle beside a discontinuous ledge and during a raised stride.
      if (normal) {
        const tilt = new THREE.Quaternion().setFromUnitVectors(
          moving ? UP : footPlane(points)?.normal || UP,
          normal,
        );
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
  const drop = (rig.crouchBlend || 0) * CROUCH_DROP,
    ankleTargets = plans.map((p) =>
      p.ankle.clone().add(new THREE.Vector3(0, p.shift, 0)),
    ),
    applyPelvis = (value) => {
      game.avatar.position.y = value - drop;
      poseFeet(game, ankleTargets);
      for (const p of plans) setWorldRotation(p.foot.bone, p.rotation);
      updateSkin(game);
    };
  applyPelvis(state.pelvis);
  state.pelvis = fitCrouchTerrain(game, state.pelvis, drop, applyPelvis);
  // Re-solving a deeply bent leg can shift the posed sole slightly from its
  // planned clearance. Check the delivered sole after IK, then fit the knees
  // again if an ankle needs lifting. Keep this bounded and visual only.
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false;
    for (const [index, p] of plans.entries()) {
      if (!p.valid) continue;
      // A continuous bank can rise inside the sole perimeter, and toe weights
      // can bend its medial vertices below the outline. Read the complete low
      // footwear here; keep the small perimeter for orientation and footsteps.
      const gaps = probes(p.foot, true).flatMap((point) => {
        const floor = support(point.x, point.z);
        return floor ? [point.y - floor.height] : [];
      });
      const lift = Math.min(0.03, 0.006 - Math.min(...gaps));
      if (lift > 0.0001) {
        ankleTargets[index].y += lift;
        adjusted = true;
      }
    }
    if (!adjusted) break;
    applyPelvis(state.pelvis);
    state.pelvis = fitCrouchTerrain(game, state.pelvis, drop, applyPelvis);
  }
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
