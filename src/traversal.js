import * as THREE from "three";
import { updateReturnCable } from "./return-cable.js";
import { supportAt } from "./character-motion.js";
import { ropeGrip, updateCourseVisual } from "./traversal-courses.js";

const HAND_HEIGHT = 2.15;
const done = (game, c) =>
  game.progress.completed ||
  c.stage < game.progress.stage ||
  game.progress.field.includes(c.id);
export function resetTraversal(game) {
  game.blockGrip?.cancel?.();
  game.blockGrip = null;
  game.ropeRide = null;
  game.zipRide = null;
  game.airVelocity = null;
  game.courseAnchor = null;
  game.ropeCooldown = 0;
  game.jumpBuffer = 0;
  game.coyote = 0;
  game.velocityY = 0;
  game.climb = null;
  game.dodge = null;
  game.aimUntil = 0;
  if (game.avatar) {
    game.avatar.rotation.x = 0;
    game.avatar.position.x = 0;
    game.avatar.position.y = 0;
    game.avatar.position.z = 0;
  }
  if (game.rig?.weapon) game.rig.weapon.group.visible = false;
  if (game.rig) game.rig.hangLift = 0;
}
export function restoreTraversal(game) {
  const saved = game.progress.traversal,
    c = game.traversalCourses.find((c) => c.id === saved?.id);
  if (c && Number.isInteger(saved.ledge) && c.ledges[saved.ledge]) {
    const l = c.ledges[saved.ledge];
    game.player.position.set(l.x, l.y, l.z);
    game.courseAnchor = { id: c.id, ledge: saved.ledge };
  } else if (Number.isFinite(game.progress.position?.height)) {
    const p = game.player.position,
      y = game.groundHeight(p.x, p.z) + game.progress.position.height;
    const floor = supportAt(game, p.x, p.z, y);
    if (
      Math.abs(floor.height - y) < 0.25 &&
      game.canMove(p.x, p.z, y - game.groundHeight(p.x, p.z))
    )
      p.y = floor.height;
  }
  game.jumpY = Math.max(
    0,
    game.player.position.y -
      game.groundHeight(game.player.position.x, game.player.position.z),
  );
  game.fallPeak = game.player.position.y;
}
export function captureTraversal(game) {
  const saved = game.courseAnchor,
    c = game.traversalCourses?.find((c) => c.id === saved?.id);
  return c &&
    (!done(game, c) || game.ropeRide || game.zipRide) &&
    game.player.position.distanceTo(
      new THREE.Vector3(
        c.ledges[saved.ledge].x,
        c.ledges[saved.ledge].y,
        c.ledges[saved.ledge].z,
      ),
    ) < 35
    ? { ...saved }
    : null;
}
export function trackTraversalSupport(game) {
  if (!game.grounded || game.climb || game.ropeRide || game.zipRide) return;
  const p = game.player.position,
    support = supportAt(game, p.x, p.z, p.y);
  if (support.surface?.courseId) {
    const next = { id: support.surface.courseId, ledge: support.surface.ledge };
    if (
      game.courseAnchor?.id !== next.id ||
      game.courseAnchor?.ledge !== next.ledge
    ) {
      game.courseAnchor = next;
      game.save?.();
    }
  } else if (game.courseAnchor) {
    const c = game.traversalCourses.find((c) => c.id === game.courseAnchor.id);
    if (c && !done(game, c) && game.motionLanding?.drop > 2) {
      const l = c.ledges[game.courseAnchor.ledge];
      p.set(l.x, l.y, l.z);
      game.jumpY = l.y - game.groundHeight(l.x, l.z);
      game.velocityY = 0;
      game.airVelocity = null;
      game.fallPeak = l.y;
      game.stamina = Math.max(25, game.stamina - 12);
      game.audio.noiseHit?.(0.025, 0.3, 600, p);
      game.cb.toast?.(
        "Your safety line held. Resume from the last secure ledge.",
        3500,
      );
    } else game.courseAnchor = null;
  }
}
function grabCandidate(game) {
  if (
    game.grounded ||
    game.climb ||
    game.dodge ||
    game.ropeCooldown > 0 ||
    game.stamina < 12 ||
    game.carrying
  )
    return null;
  const hand = game.player.position
    .clone()
    .add(new THREE.Vector3(0, HAND_HEIGHT, 0));
  return game.traversalCourses.find((c) => hand.distanceTo(ropeGrip(c)) < 2.5);
}
export function tryGrabRope(game) {
  const c = grabCandidate(game);
  if (!c) return false;
  const hand = game.player.position
    .clone()
    .add(new THREE.Vector3(0, HAND_HEIGHT, 0));
  const projected =
    (hand.x - c.anchor.x) * c.axis.x + (hand.z - c.anchor.z) * c.axis.z;
  const angle = Math.max(
    -1,
    Math.min(1, Math.atan2(projected, c.anchor.y - hand.y)),
  );
  const old = c.angle;
  c.angle = angle;
  const foot = ropeGrip(c);
  foot.y -= HAND_HEIGHT;
  if (
    !game.canMove(foot.x, foot.z, foot.y - game.groundHeight(foot.x, foot.z))
  ) {
    c.angle = old;
    return false;
  }
  const v = game.moveVelocity || { x: 0, z: 0 };
  c.omega =
    ((v.x * c.axis.x + v.z * c.axis.z) * Math.cos(angle) +
      game.velocityY * Math.sin(angle)) /
    c.length;
  game.ropeRide = c;
  game.grounded = false;
  game.airVelocity = null;
  game.jumpBuffer = 0;
  game.keys.delete("Space");
  game.player.position.copy(foot);
  game.nearest = null;
  game.audio.noiseHit?.(0.025, 0.2, 1400, foot);
  game.cb.toast?.(
    "Hold a direction to build your swing. Press Space toward the far ledge to let go.",
    5000,
  );
  return true;
}
function releaseRope(game, boost = true) {
  const c = game.ropeRide;
  if (!c) return;
  const speed = c.length * c.omega;
  game.airVelocity = {
    x: c.axis.x * Math.cos(c.angle) * speed,
    z: c.axis.z * Math.cos(c.angle) * speed,
  };
  game.velocityY = Math.sin(c.angle) * speed + (boost ? 2 : 0);
  game.ropeRide = null;
  game.ropeCooldown = 0.7;
  game.grounded = false;
  game.fallPeak = game.player.position.y;
  game.keys.delete("Space");
  game.jumpBuffer = 0;
  game.coyote = 0;
  game.audio.noiseHit?.(0.012, 0.18, 1900, game.player.position);
}
function zipCandidate(game) {
  return game.traversalCourses.find(
    (c) =>
      done(game, c) &&
      (!c.zipRig || c.zipRig.travel < 0.02) &&
      game.grounded &&
      game.player.position.distanceTo(
        new THREE.Vector3(c.ledges[4].x, c.ledges[4].y, c.ledges[4].z),
      ) < 2.7,
  );
}
export function traversalInteract(game) {
  if (game.ropeRide || game.zipRide) return true;
  if (tryGrabRope(game)) return true;
  const c = zipCandidate(game);
  if (c) {
    game.zipRide = {
      course: c,
      time: 0,
      start: game.player.position.clone(),
      duration: 2.4,
      approach: true,
    };
    game.nearest = null;
    game.grounded = false;
    game.keys.delete("KeyE");
    game.audio.noiseHit?.(0.023, 0.18, 1800, game.player.position);
    return true;
  }
  return false;
}
export function predictedRopeLanding(game) {
  const c = game.ropeRide;
  if (!c) return null;
  const p = game.player.position.clone(),
    l = c.ledges[3],
    speed = c.length * c.omega;
  let vx = c.axis.x * Math.cos(c.angle) * speed,
    vz = c.axis.z * Math.cos(c.angle) * speed,
    vy = Math.sin(c.angle) * speed + 2;
  for (let t = 0; t < 3; t += 1 / 60) {
    const old = p.y;
    vy -= 19 / 60;
    p.y += vy / 60;
    p.x += vx / 60;
    p.z += vz / 60;
    vx *= Math.exp(-0.9 / 60);
    vz *= Math.exp(-0.9 / 60);
    if (vy < 0 && old >= l.y && p.y <= l.y)
      return {
        safe:
          Math.abs(p.x - l.x) < l.w - 0.25 && Math.abs(p.z - l.z) < l.d - 0.25,
        position: p,
      };
  }
  return null;
}
export function traversalHint(game) {
  if (game.ropeRide)
    return {
      key: "Space",
      label: predictedRopeLanding(game)?.safe
        ? "Release now for the far ledge"
        : "Hold direction to swing · Space releases the rope",
    };
  if (game.zipRide)
    return { key: "", label: "Returning along the service cable" };
  if (zipCandidate(game)) return { key: "E", label: "Ride the return cable" };
  if (grabCandidate(game)) return { key: "E", label: "Catch the rope" };
  const c = game.traversalCourses.find(
    (c) =>
      !done(game, c) &&
      game.player.position.distanceTo(
        new THREE.Vector3(
          c.entry.x,
          game.groundHeight(c.entry.x, c.entry.z),
          c.entry.z,
        ),
      ) < 6,
  );
  if (c)
    return {
      key: "Space",
      label: `${c.theme.name} · move toward the gold ledge to climb`,
    };
  const a = game.courseAnchor;
  if (a && [1, 2].includes(a.ledge))
    return {
      key: a.ledge === 1 ? "Space" : "E",
      label:
        a.ledge === 1
          ? "Jump the gap to the next gold ledge"
          : "Jump toward the rope while holding E to catch it",
    };
  return null;
}
export function traversalTarget(game, target) {
  const c = game.traversalCourses?.find((c) => c.id === target?.id);
  if (!c || done(game, c)) return target;
  const a = game.courseAnchor?.id === c.id ? game.courseAnchor.ledge : -1;
  const l = c.ledges[Math.min(4, a + 1)];
  return {
    ...target,
    x: l.x / 7,
    z: l.z / 7,
    yOffset: l.y - game.groundHeight(l.x, l.z),
  };
}
export function updateTraversal(game, dt, input) {
  game.ropeCooldown = Math.max(0, (game.ropeCooldown || 0) - dt);
  for (const c of game.traversalCourses) {
    const drive =
      game.ropeRide === c
        ? (input.x * c.axis.x + input.z * c.axis.z) * 0.95
        : 0;
    c.omega +=
      ((-19 / c.length) * Math.sin(c.angle) + drive - c.omega * 0.18) * dt;
    c.omega = Math.max(-1.6, Math.min(1.6, c.omega));
    c.angle += c.omega * dt;
    if (Math.abs(c.angle) > 1.15) {
      c.angle = Math.sign(c.angle) * 1.15;
      c.omega *= -0.3;
    }
    c.zip.visible = done(game, c);
    updateCourseVisual(c);
    updateReturnCable(game, c, dt);
    if (
      game.ropeRide === c &&
      Math.abs(c.omega) > 0.35 &&
      (c.lastCreak || 0) < game.elapsed
    ) {
      game.audio.noiseHit?.(
        0.009 + Math.abs(c.omega) * 0.008,
        0.35,
        380,
        c.anchor,
      );
      c.lastCreak = game.elapsed + 1.1;
    }
  }
  if (game.zipRide) {
    const ride = game.zipRide;
    ride.time += dt;
    const t = Math.min(1, ride.time / (ride.approach ? 0.55 : ride.duration)),
      ease = t * t * (3 - 2 * t);
    game.player.position.lerpVectors(
      ride.start,
      ride.approach ? ride.course.launch : ride.course.exit,
      ease,
    );
    updateReturnCable(game, ride.course, 0);
    if (!ride.approach && (ride.nextRoll || 0) <= ride.time) {
      game.audio.noiseHit?.(0.009, 0.34, 2100, game.player.position);
      ride.nextRoll = ride.time + 0.28;
    }
    game.avatar.rotation.y = Math.atan2(
      ride.course.exit.x - ride.start.x,
      ride.course.exit.z - ride.start.z,
    );
    game.jumpY =
      game.player.position.y -
      game.groundHeight(game.player.position.x, game.player.position.z);
    if (t >= 1 && ride.approach) {
      ride.approach = false;
      ride.time = 0;
      ride.start.copy(ride.course.launch);
      return true;
    }
    if (t >= 1) {
      if (ride.course.zipRig) {
        ride.course.zipRig.travel = 1;
        ride.course.zipRig.returning = true;
      }
      game.zipRide = null;
      game.grounded = true;
      game.velocityY = 0;
      game.courseAnchor = null;
      game.fallPeak = game.player.position.y;
      game.save?.();
    }
    return true;
  }
  if (!game.ropeRide && game.keys.has("KeyE")) tryGrabRope(game);
  const c = game.ropeRide;
  if (!c) return false;
  const foot = ropeGrip(c);
  foot.y -= HAND_HEIGHT;
  if (
    !game.canMove(foot.x, foot.z, foot.y - game.groundHeight(foot.x, foot.z))
  ) {
    releaseRope(game, false);
    return false;
  }
  game.player.position.copy(foot);
  game.jumpY = foot.y - game.groundHeight(foot.x, foot.z);
  game.avatar.rotation.y = Math.atan2(
    c.axis.x * Math.sign(c.omega || 1),
    c.axis.z * Math.sign(c.omega || 1),
  );
  game.stamina = Math.max(0, game.stamina - dt * 6);
  if (game.keys.has("Space") || game.stamina === 0) {
    releaseRope(game, game.stamina > 0);
    return false;
  }
  return true;
}
