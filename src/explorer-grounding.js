import { restingFoothold } from "./explorer-foothold.js";
import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { poseFeet } from "./pose.js";
import { waterAt } from "./hydrology.js";
import { CROUCH_DROP, playerFootstep, footstepSurface } from "./stealth.js";
import { strideScale } from "./stride.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";
import { fitCrouchTerrain, lowerBodyProbes } from "./explorer-terrain-pose.js";

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
      soleIndices: candidates.filter((i) => position.getY(i) <= 0.025),
      lifted: false,
    };
  });
}

function probes(foot, complete = false) {
  return (
    complete === "sole"
      ? foot.soleIndices
      : complete
        ? foot.clearanceIndices
        : foot.indices
  ).map((i) =>
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
      const floor = support(point.x, point.z, point.y);
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

function applyBalanceOffset(game, state, posedTerrain = false) {
  const root = game.player.position;
  // The visual weight shift must also fit a clear standing body at this height.
  let balanceClear = state.balance.lengthSq() < 1e-8;
  for (let attempt = 0; !balanceClear && attempt < 6; attempt++) {
    const x = root.x + state.balance.x,
      z = root.z + state.balance.z;
    const height = root.y - game.groundHeight(x, z);
    if (
      game.canMove(x, z, height) ||
      (posedTerrain &&
        game.canMove(x, z, height, 1.8, { terrainEnvelope: false }))
    ) {
      balanceClear = true;
      break;
    }
    state.balance.multiplyScalar(0.5);
  }
  if (!balanceClear) state.balance.set(0, 0, 0);
  const localBalance = state.balance
    .clone()
    .applyQuaternion(
      game.avatar.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),
    );
  game.avatar.position.x = localBalance.x;
  game.avatar.position.z = localBalance.z;
}

// A descending jump can clear the controller at its root while the uphill
// toe reaches the bank first. Tuck the flight pose using the delivered soles;
// leave the root, velocity and ordinary airborne targets unchanged in clear air.
export function poseAirborneTerrainFeet(game, targets) {
  poseFeet(game, targets);
  if (typeof game.groundHeight !== "function") return;
  const rig = game.rig;
  if (rig.airborneFeet?.model !== rig.model)
    rig.airborneFeet = { model: rig.model, feet: makeFeet(rig.model) };
  const feet = rig.airborneFeet.feet;
  if (!feet) return;
  const limits = targets.map((p) => p.y + 0.45);
  for (let pass = 0; pass < 6; pass++) {
    updateSkin(game);
    let adjusted = false;
    for (const [i, foot] of feet.entries()) {
      let lift = 0;
      for (const p of probes(foot, true)) {
        const floor = game.groundHeight(p.x, p.z);
        if (Number.isFinite(floor)) lift = Math.max(lift, floor + 0.006 - p.y);
      }
      lift = Math.min(0.1, lift, limits[i] - targets[i].y);
      if (lift <= 0.0001) continue;
      targets[i].y += lift;
      adjusted = true;
    }
    if (!adjusted) break;
    poseFeet(game, targets);
  }
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
      if (rig.grounding.balance) {
        if (
          !game.grounded &&
          !game.swimming &&
          !game.climb &&
          !game.ropeRide &&
          !game.zipRide &&
          !game.dodge
        ) {
          rig.grounding.balance.multiplyScalar(Math.exp(-14 * dt));
          applyBalanceOffset(game, rig.grounding);
        } else rig.grounding.balance.set(0, 0, 0);
      }
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
  const finiteSupport =
    bodySupport.surface?.triangles || bodySupport.surface?.shape;
  const naturalBed = !!bodySupport.surface?.terrainFootholds;
  const terrainFloor = naturalBed || !bodySupport.surface;
  const fitStandingTerrain = naturalBed || (!moving && terrainFloor);
  const support = (x, z, footY) => {
    // A steep side beside a root tread is a wall, not a higher floor for the
    // boot. Follow upward scan faces while the collision queries retain sides.
    // A natural bed may overhang a boot. Query its eligible lower faces at
    // the actual foot height instead of pulling the ankle above a roof.
    const maxY =
      naturalBed && Number.isFinite(footY)
        ? Math.min(root.y + 0.45, footY - 0.18)
        : root.y + 0.45;
    const result = supportAt(game, x, z, maxY, 0, 0.65);
    // A boot beside a finite cap can reach its steep bevel while the other
    // boot stands on top. Lowering the pelvis toward that edge bends the knee
    // through the cap. Treat a substantial drop as an unsupported foothold.
    const continuousSlope =
      bodySupport.surface?.groundingSlope &&
      Math.abs(
        result.height -
          (bodySupport.surface.triangles.support(x, z, root.y + 0.45, 0, 0.65)
            ?.height ?? -Infinity),
      ) < 0.08;
    // Natural roots and stones can continue onto a lower nearby foothold;
    // authored finite caps retain their stricter edge-drop rejection.
    if (
      finiteSupport &&
      !bodySupport.surface?.shape &&
      !bodySupport.surface?.terrainFootholds &&
      !continuousSlope &&
      root.y - result.height > 0.12
    )
      return null;
    return result.height >= root.y - 0.5 && result.height <= root.y + 0.65
      ? result
      : null;
  };
  let restStride = 1;
  let restAlong = 0;
  if (!moving && terrainFloor) {
    const cached = state.restPlan;
    if (
      !reset &&
      cached &&
      state.clock < cached.until &&
      cached.surface === bodySupport.surface &&
      cached.root.distanceToSquared(root) < 1e-8 &&
      Math.abs(cached.facing.dot(facing)) > 1 - 1e-6
    ) {
      restStride = cached.stride;
      restAlong = cached.along;
    } else {
      const outlines = state.feet.map((foot) => ({
        points: probes(foot),
        along: foot.bone
          .getWorldPosition(new THREE.Vector3())
          .sub(root)
          .applyQuaternion(inverseFacing).z,
      }));
      const floors = (stride, shift = 0) =>
        outlines.map(({ points, along }) => {
          const offset = new THREE.Vector3(
            0,
            0,
            along * (stride - 1) + shift,
          ).applyQuaternion(facing);
          return Math.max(
            ...points.map(
              (point) =>
                support(point.x + offset.x, point.z + offset.z, point.y)
                  ?.height ??
                game.groundHeight(point.x + offset.x, point.z + offset.z),
            ),
          );
        });
      // A long idle stagger can put the boots on opposite sides of a sharp bank.
      // Bring them closer along the facing direction while keeping stance width.
      // Recheck the shifted sole outlines: an ankle can remain on flat soil
      // while a toe crosses a grid break, so height need not change linearly.
      for (let pass = 0; pass < 4; pass++) {
        const heights = floors(restStride),
          difference = Math.abs(heights[0] - heights[1]);
        if (difference <= 0.18 || restStride <= 0.1) break;
        restStride = Math.max(0.1, (restStride * 0.18) / difference);
      }
      // A shortened toe can still reach a sharp wall immediately ahead of the
      // body's clear floor. Let the feet settle a little fore or aft within
      // their existing reach, choosing the closest position with a lower tread.
      let peak = Math.max(...floors(restStride));
      if (peak > root.y + 0.18)
        for (const shift of [-0.04, 0.04, -0.08, 0.08, -0.12, 0.12]) {
          const candidate = Math.max(...floors(restStride, shift));
          if (candidate < peak - 0.001) {
            peak = candidate;
            restAlong = shift;
          }
          if (peak <= root.y + 0.18) break;
        }
      // Footprints are stable while resting. Refresh four times per second;
      // motion, facing or a changed support invalidates the plan immediately.
      // Final skin/sole clearance still reads the current surfaces every frame.
      state.restPlan = {
        root: root.clone(),
        facing: facing.clone(),
        surface: bodySupport.surface,
        until: state.clock + 0.25,
        stride: restStride,
        along: restAlong,
      };
    }
  } else state.restPlan = null;
  state.restStride = reset
    ? restStride
    : THREE.MathUtils.damp(state.restStride ?? 1, restStride, 14, dt);
  state.restAlong = reset
    ? restAlong
    : THREE.MathUtils.damp(state.restAlong ?? 0, restAlong, 14, dt);
  const restOffset = (ankle) => {
    const local = ankle.clone().sub(root).applyQuaternion(inverseFacing);
    return new THREE.Vector3(
      0,
      0,
      local.z * (state.restStride - 1) + state.restAlong,
    ).applyQuaternion(facing);
  };
  let plant = null;
  // A low natural bed can hold the controller's edge while both boots reach
  // ordinary ground. Keep that two-foot stance instead of dragging one boot
  // across the body onto the bed and lifting the other above its real floor.
  const terrainStance =
    !moving &&
    terrainFloor &&
    state.feet.every((foot) => {
      const ankle = foot.bone.getWorldPosition(new THREE.Vector3());
      ankle.add(restOffset(ankle));
      return support(ankle.x, ankle.z, ankle.y - 0.08);
    });
  if (
    !moving &&
    finiteSupport &&
    !bodySupport.surface.groundingSlope &&
    !terrainStance
  ) {
    // A scan may support the body beside a rising bank while its nearest
    // tread is covered by soil. Plant only on the exposed part of a surface.
    const exposed = (point) =>
      point.y >= game.groundHeight(point.x, point.z) - 0.002;
    const old = state.plant,
      oldAnkle = old?.foot.bone.getWorldPosition(new THREE.Vector3());
    if (
      old &&
      Math.hypot(old.point.x - oldAnkle.x, old.point.z - oldAnkle.z) <= 0.55 &&
      old.surface === bodySupport.surface &&
      Math.hypot(root.x - old.root.x, root.z - old.root.z) < 0.02 &&
      Math.abs(old.facing.dot(facing)) > 0.9995 &&
      exposed(old.point) &&
      support(old.point.x, old.point.z, old.point.y)
    ) {
      plant = old;
    } else {
      let distance = 0.55 * 0.55;
      for (const foot of state.feet) {
        const ankle = foot.bone.getWorldPosition(new THREE.Vector3());
        const tread = restingFoothold(
          bodySupport.surface,
          ankle,
          root.y,
          0.65,
          exposed,
        );
        if (!tread) continue;
        const { point, normal } = tread;
        const d = (point.x - ankle.x) ** 2 + (point.z - ankle.z) ** 2;
        if (d < distance) {
          distance = d;
          plant = {
            foot,
            point,
            normal,
            root: root.clone(),
            facing: facing.clone(),
            surface: bodySupport.surface,
          };
        }
      }
    }
  }
  state.plant = plant;
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
      local.z * (state.stride * state.restStride - 1) +
        state.restAlong +
        crouch * (moving ? 0.14 + recovery : 0),
    ).applyQuaternion(facing);
    ankle.add(offset);
    let anchorIndex;
    const rotation = foot.bone.getWorldQuaternion(new THREE.Quaternion());
    if (foot === plant?.foot) {
      rotation.premultiply(
        new THREE.Quaternion().setFromUnitVectors(
          footPlane(points)?.normal || UP,
          plant.normal,
        ),
      );
      setWorldRotation(foot.bone, rotation);
      // Plant the nearest real outsole point. A narrow tread can carry the
      // boot's edge while the rest of the sole stays outside the steep side.
      let anchor,
        nearest = Infinity;
      for (const [i, point] of probes(foot, "sole").entries()) {
        point.add(offset);
        const distance =
          (point.x - plant.point.x) ** 2 + (point.z - plant.point.z) ** 2;
        if (distance < nearest) {
          nearest = distance;
          anchor = point;
          anchorIndex = foot.soleIndices[i];
        }
      }
      const dx = plant.point.x - anchor.x,
        dz = plant.point.z - anchor.z;
      if (Math.hypot(dx, dz) <= 0.65) {
        offset.x += dx;
        offset.z += dz;
        ankle.x += dx;
        ankle.z += dz;
      }
    }
    const center =
      foot === plant?.foot
        ? support(plant.point.x, plant.point.z, plant.point.y)
        : support(ankle.x, ankle.z, ankle.y - 0.08);
    const samples = [
      support(ankle.x - 0.12, ankle.z, ankle.y - 0.08),
      support(ankle.x + 0.12, ankle.z, ankle.y - 0.08),
      support(ankle.x, ankle.z - 0.12, ankle.y - 0.08),
      support(ankle.x, ankle.z + 0.12, ankle.y - 0.08),
    ];
    if (foot !== plant?.foot && center && samples.every(Boolean)) {
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
      if (foot === plant?.foot) {
        const n = plant.normal,
          floor =
            plant.point.y -
            (n.x * (p.x - plant.point.x) + n.z * (p.z - plant.point.z)) / n.y;
        return [p.y - floor];
      }
      const floor = support(p.x, p.z, p.y);
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
    return { foot, ankle, rotation, lift, valid, center, shift, anchorIndex };
  });
  // On a narrow tread, carry the visual hips over the planted ankle instead
  // of leaving the torso suspended beside it. Preserve both targets on a
  // broad top; the free leg follows the weight shift with a small knee bend.
  const supported = plans.filter((p) => p.valid && p.center);
  const balance = new THREE.Vector3();
  if (!moving && terrainFloor && supported.length === 2)
    balance
      .set(0, 0, state.restAlong * (naturalBed ? 1 : 1.5))
      .applyQuaternion(facing);
  if ((plant || naturalBed) && supported.length === 1) {
    const hips = rig.model.getObjectByName("mixamorigHips");
    if (hips) {
      const hip = hips.getWorldPosition(new THREE.Vector3()),
        ankle = (
          plant ? plans.find((p) => p.foot === plant.foot) : supported[0]
        ).ankle;
      // The planted material point may lie on a toe or sole edge. Balance
      // over the fitted ankle rather than carrying that contact offset into
      // the torso; the sole keeps its independently fitted tread target.
      balance.set(ankle.x - hip.x, 0, ankle.z - hip.z);
      const distance = balance.length();
      if (distance > 0.06)
        balance.multiplyScalar(Math.min(0.6, distance - 0.06) / distance);
      else balance.set(0, 0, 0);
    }
  }
  if (!state.balance) state.balance = balance.clone();
  else state.balance.lerp(balance, 1 - Math.exp(-14 * dt));
  // Ordinary bank poses refine terrain against their delivered clothed legs
  // below. Keep the full prop guards here; a circular standing margin alone
  // can reject a small, clear hip shift between two narrow soil shoulders.
  applyBalanceOffset(game, state, !moving && !bodySupport.surface);
  for (const plan of plans)
    if (!supported.includes(plan)) {
      plan.ankle.add(state.balance);
      if ((plant || naturalBed) && supported.length === 1) plan.ankle.y += 0.12;
    }
  updateSkin(game);
  // When both boots can reach soil beside a low bed, the body disk can be
  // higher than either visible sole. Accommodate the same 50 cm floor range
  // accepted above rather than stopping the visual reach at an arbitrary
  // 30 cm drop. The ordinary cap and single-foot limits remain bounded.
  const minimumPelvis =
    terrainStance ||
    (!moving && !bodySupport.surface && plans.every((p) => p.valid))
      ? -0.5
      : -0.3;
  let pelvis = Math.max(
    minimumPelvis,
    Math.min(0, ...plans.map((p) => p.shift)),
  );
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
    pelvis = Math.min(pelvis, Math.max(minimumPelvis, needed));
  }
  state.pelvis = reset
    ? pelvis
    : Math.min(
        pelvis,
        THREE.MathUtils.lerp(state.pelvis, pelvis, 1 - Math.exp(-20 * dt)),
      );
  const drop = (rig.crouchBlend || 0) * CROUCH_DROP,
    crouchSupport = bodySupport.surface
      ? (x, z, y, restHeight) => {
          const ground = game.groundHeight(x, z);
          if (y - ground < 0.03) return ground;
          const floor = support(x, z, y);
          if (!floor) return null;
          const triangles = floor.surface?.triangles;
          // Low cuffs can pass below a curved rim or overhang. Their actual
          // volume contact matters; the highest surface above them is not
          // necessarily a floor. Knees retain the conservative floor fit.
          if (restHeight < 0.18 && triangles?.layeredSupport) {
            if (!triangles.blocked(x, y, z, 0, 0)) return null;
            // Use the same small contact skin as the collision surfaces.
            // A near-side cuff contact must not force it above the object's
            // upper face. The escape must clear the complete assembly.
            const escape = triangles.pointExit(x, y, z, 0.014);
            if (
              escape &&
              !triangles.blocked(x + escape.x, y + escape.y, z + escape.z, 0, 0)
            )
              return null;
          }
          return floor.height;
        }
      : (x, z) => game.groundHeight(x, z),
    ankleTargets = plans.map((p) =>
      p.ankle.clone().add(new THREE.Vector3(0, p.shift, 0)),
    ),
    reachOrigins = ankleTargets.map((point) => point.clone()),
    applyPelvis = (value) => {
      game.avatar.position.y = value - drop;
      poseFeet(game, ankleTargets);
      for (const p of plans) setWorldRotation(p.foot.bone, p.rotation);
      updateSkin(game);
    };
  applyPelvis(state.pelvis);
  if (drop > 0.02 && bodySupport.surface?.triangles?.layeredSupport) {
    if (rig.terrainCrouch?.model !== rig.model)
      rig.terrainCrouch = {
        model: rig.model,
        probes: lowerBodyProbes(rig.model),
      };
    const cuffs = (rig.terrainCrouch.cuffs ??= rig.terrainCrouch.probes.flatMap(
      ({ mesh, index }) => {
        if (mesh.geometry.attributes.position.getY(index) >= 0.18) return [];
        const { skinWeight, skinIndex } = mesh.geometry.attributes;
        let dominant = 0;
        for (let k = 1; k < 4; k++)
          if (
            skinWeight.getComponent(index, k) >
            skinWeight.getComponent(index, dominant)
          )
            dominant = k;
        const bone =
            mesh.skeleton.bones[skinIndex.getComponent(index, dominant)].name,
          side = bone.includes("Left")
            ? "Left"
            : bone.includes("Right")
              ? "Right"
              : null,
          foot = plans.findIndex((p) =>
            p.foot.bone.name.includes(`${side}Foot`),
          );
        return foot < 0 ? [] : [{ mesh, index, foot }];
      },
    ));
    // A folded cuff can enter a curved lid while its outsole still contacts
    // the tread. Fit that ankle before asking the pelvis to straighten the
    // whole body. Keep the contact skin and bound each visual correction.
    for (let pass = 0; pass < 3; pass++) {
      const corrections = plans.map(() => null);
      for (const { mesh, index, foot } of cuffs) {
        const point = mesh
            .getVertexPosition(index, new THREE.Vector3())
            .applyMatrix4(mesh.matrixWorld),
          escape = bodySupport.surface.triangles.pointExit(
            point.x,
            point.y,
            point.z,
            0.08,
          );
        if (!escape || escape.length() <= 0.015) continue;
        if (
          !corrections[foot] ||
          escape.lengthSq() > corrections[foot].lengthSq()
        )
          corrections[foot] = escape;
      }
      if (corrections.every((correction) => !correction)) break;
      corrections.forEach((correction, i) => {
        if (correction) ankleTargets[i].add(correction.clampLength(0, 0.03));
      });
      applyPelvis(state.pelvis);
    }
  }
  state.pelvis = fitCrouchTerrain(
    game,
    state.pelvis,
    drop,
    applyPelvis,
    crouchSupport,
    fitStandingTerrain,
  );
  // Refit the actual planted material point after leg IK. Weighted boot/toe
  // vertices can differ slightly from the rigid planning pose on a steep root.
  const planted = plans.findIndex((p) => p.foot === plant?.foot);
  if (planted >= 0 && plans[planted].anchorIndex !== undefined) {
    const plan = plans[planted];
    for (let pass = 0; pass < 2; pass++) {
      // Weighted toes can move the originally chosen material point while a
      // neighboring part of the real outsole is already on the same tread.
      // Keep that contact instead of pulling the ankle through the curved rim.
      if (
        probes(plan.foot, "sole").some((point) => {
          const floor = support(point.x, point.z, point.y),
            gap = floor ? point.y - floor.height : Infinity;
          return floor?.surface === plant.surface && gap >= 0 && gap <= 0.012;
        })
      )
        break;
      const actual = plan.foot.shoe
          .getVertexPosition(plan.anchorIndex, new THREE.Vector3())
          .applyMatrix4(plan.foot.shoe.matrixWorld),
        correction = plant.point
          .clone()
          .add(new THREE.Vector3(0, 0.006, 0))
          .sub(actual);
      if (correction.length() < 0.0001) break;
      correction.clampLength(0, 0.03);
      ankleTargets[planted].add(correction);
      state.pelvis = Math.max(
        minimumPelvis,
        state.pelvis + Math.min(0, correction.y),
      );
      applyPelvis(state.pelvis);
      state.pelvis = fitCrouchTerrain(
        game,
        state.pelvis,
        drop,
        applyPelvis,
        crouchSupport,
        fitStandingTerrain,
      );
    }
  }
  // Re-solving a deeply bent leg can shift the posed sole slightly from its
  // planned clearance. Check the delivered sole after IK, then fit the knees
  // again if an ankle needs lifting. Keep this bounded and visual only.
  for (let pass = 0; pass < 10; pass++) {
    let adjusted = false;
    for (const [index, p] of plans.entries()) {
      if (!p.valid) continue;
      let bevel = null;
      // A continuous bank can rise inside the sole perimeter, and toe weights
      // can bend its medial vertices below the outline. Read the complete low
      // footwear here; keep the small perimeter for orientation and footsteps.
      const gaps = probes(p.foot, true).flatMap((point) => {
        const floor = support(point.x, point.z, point.y);
        let corrected = false;
        if (
          bodySupport.surface?.shape ||
          bodySupport.surface?.triangles?.layeredSupport ||
          naturalBed
        )
          for (const scans of bodySupport.surface.shape
            ? [game.natureRockSolids, game.jungleTreeSolids]
            : [bodySupport.surface.triangles]) {
            const escape = scans?.pointExit(point.x, point.y, point.z);
            if (!escape) continue;
            corrected = true;
            if (!bevel || escape.lengthSq() > bevel.lengthSq()) bevel = escape;
          }
        return corrected || !floor ? [] : [point.y - floor.height];
      });
      if (bevel) {
        ankleTargets[index].add(bevel);
        state.pelvis = Math.max(
          minimumPelvis,
          state.pelvis + Math.min(0, bevel.y),
        );
        adjusted = true;
      }
      const gap = Math.min(...gaps);
      // A downhill foot can be below the straight leg's reach while the
      // uphill knee already constrains the pelvis. Find the nearest small
      // uphill step that the existing leg can reach instead of leaving a
      // boot in the air or lifting the physical player.
      if (!moving && !bodySupport.surface && gap > 0.02) {
        const [upper, lower, bone] = rig.legs[index],
          hip = upper.getWorldPosition(new THREE.Vector3()),
          knee = lower.getWorldPosition(new THREE.Vector3()),
          ankle = bone.getWorldPosition(new THREE.Vector3()),
          reach = hip.distanceTo(knee) + knee.distanceTo(ankle);
        if (hip.distanceTo(ankle) > reach * 0.98) {
          const gradient = new THREE.Vector3(
              game.groundHeight(ankle.x + 0.04, ankle.z) -
                game.groundHeight(ankle.x - 0.04, ankle.z),
              0,
              game.groundHeight(ankle.x, ankle.z + 0.04) -
                game.groundHeight(ankle.x, ankle.z - 0.04),
            ).normalize(),
            outline = probes(p.foot),
            other = plans[1 - index].foot.bone.getWorldPosition(
              new THREE.Vector3(),
            );
          let step = null;
          search: for (
            let distance = 0.02;
            distance <= 0.18001;
            distance += 0.02
          ) {
            for (const angle of [
              0,
              -Math.PI / 6,
              Math.PI / 6,
              -Math.PI / 3,
              Math.PI / 3,
            ]) {
              const offset = gradient
                  .clone()
                  .applyAxisAngle(UP, angle)
                  .multiplyScalar(distance),
                target = ankle.clone().add(offset);
              const origin = reachOrigins[index];
              if (
                Math.hypot(target.x - origin.x, target.z - origin.z) > 0.18 ||
                Math.hypot(target.x - other.x, target.z - other.z) < 0.16
              )
                continue;
              const clearances = outline.map((point) => {
                const floor = support(
                  point.x + offset.x,
                  point.z + offset.z,
                  point.y,
                );
                return floor ? point.y - floor.height : Infinity;
              });
              if (clearances.some((value) => !Number.isFinite(value))) continue;
              target.y += 0.006 - Math.min(...clearances);
              if (hip.distanceTo(target) <= reach * 0.98) {
                step = target;
                break search;
              }
            }
          }
          if (step) {
            ankleTargets[index].copy(step);
            adjusted = true;
            continue;
          }
        }
      }
      const settle =
          terrainFloor &&
          !moving &&
          (p.center || !bodySupport.surface) &&
          !bevel &&
          gap > 0.02,
        lift = settle
          ? Math.max(-0.03, 0.006 - gap)
          : Math.min(0.03, 0.006 - gap);
      if (lift > 0.0001 || (settle && lift < -0.0001)) {
        ankleTargets[index].y += lift;

        adjusted = true;
      }
    }
    if (!adjusted) break;
    applyPelvis(state.pelvis);
    state.pelvis = fitCrouchTerrain(
      game,
      state.pelvis,
      drop,
      applyPelvis,
      crouchSupport,
      fitStandingTerrain,
    );
  }
  state.active = true;
  state.contacts = plans.map((p) => {
    const points = probes(p.foot),
      supported = points
        .flatMap((point) => {
          const floor = support(point.x, point.z, point.y);
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
          footstepSurface(game, p.center?.surface),
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
