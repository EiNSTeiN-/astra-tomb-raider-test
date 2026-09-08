import * as THREE from "three";
import {
  CLEFT_HAND_HEIGHT,
  CLEFT_RECORD,
  CLEFT_TERRACES,
  cleftDirection,
  insideCleft,
  cleftDeckAt,
} from "./cleft-rules.js";
import { updateCleftArt } from "./cleft-art.js";

const smooth = (t) => t * t * (3 - 2 * t);
const feet = (n) =>
  n.grip.clone().add(new THREE.Vector3(0, -CLEFT_HAND_HEIGHT, 0.55));
export function cleftSafePoint(game, index = game.cleft.anchor) {
  const d = game.cleft.decks[index];
  return new THREE.Vector3(d.x, d.y, d.z + 0.15);
}
export function cleftSavePosition(game) {
  return game.wallGrip ? cleftSafePoint(game) : null;
}
function sync(game) {
  const p = game.player.position;
  game.jumpY = p.y - game.groundHeight(p.x, p.z);
  game.fallPeak = p.y;
  game.velocityY = 0;
  game.airVelocity = null;
  game.moveVelocity = { x: 0, z: 0 };
  game.nearest = null;
  game.avatar.rotation.y = Math.PI;
  game.grounded = false;
  updateCleftArt(game);
}
function audible(game, point, force = 1) {
  game.audio.noiseHit?.(0.009 * force, 0.13, 650, point);
}
function finishOnTerrace(game, index) {
  const c = game.cleft;
  c.anchor = index;
  c.saved.terrace = Math.max(c.saved.terrace, index);
  game.player.position.copy(cleftSafePoint(game, index));
  sync(game);
  game.wallGrip = null;
  game.grounded = true;
  game.stamina = Math.max(25, game.stamina);
  game.cleftCooldown = 0.35;
  game.keys.delete("Space");
  game.save();
  updateCleftArt(game);
}
export function recoverCleft(game) {
  if (!game.cleft || game.wallGrip?.kind === "recover") return;
  game.wallGrip = {
    kind: "recover",
    start: game.player.position.clone(),
    end: cleftSafePoint(game),
    time: 0,
    duration: 1.65,
  };
  game.keys.delete("Space");
  sync(game);
  audible(game, game.player.position, 2);
  game.cb.toast?.(
    "The belay line catches you · returning to your last rest terrace.",
    4500,
  );
}
export function cleftCandidate(game) {
  const c = game.cleft,
    p = game.player?.position;
  if (
    !c ||
    !p ||
    game.wallGrip ||
    !game.grounded ||
    game.swimming ||
    game.carrying ||
    game.climb ||
    game.dodge ||
    game.ropeRide ||
    game.zipRide ||
    game.cleftCooldown > 0
  )
    return null;
  return (
    c.nodes.find(
      (n) =>
        n.terrace >= 0 &&
        Math.abs(p.y - (n.grip.y - CLEFT_HAND_HEIGHT)) < 0.25 &&
        Math.hypot(p.x - n.grip.x, p.z - n.grip.z) < 2.05,
    ) || null
  );
}
function beginGrip(game, n) {
  if (game.stamina < 18) {
    game.cb.toast?.("Rest on the terrace until your stamina recovers.");
    return;
  }
  const c = game.cleft;
  c.anchor = n.terrace;
  c.saved.visited = true;
  game.crouching = false;
  game.courseAnchor = null;
  game.keys.delete("Space");
  game.wallGrip = {
    kind: "reach",
    node: n.id,
    start: game.player.position.clone(),
    end: feet(n),
    time: 0,
    duration: 0.5,
  };
  sync(game);
  audible(game, n.grip);
  game.save();
}
export function cleftInteract(game) {
  const c = game.cleft;
  if (!c || game.paused) return false;
  if (game.wallGrip) {
    if (game.wallGrip.kind === "hang") recoverCleft(game);
    return true;
  }
  const n = cleftCandidate(game);
  if (n) {
    beginGrip(game, n);
    return true;
  }
  if (
    !game.grounded ||
    game.swimming ||
    game.climb ||
    game.dodge ||
    !insideCleft(game)
  )
    return false;
  const p = game.player.position;
  if (p.distanceTo(c.guidePoint) < 2.2) {
    game.cb.cleftGuide?.();
    return true;
  }
  if (p.distanceTo(c.recordPoint) < 1.65 && !c.saved.recovered) {
    c.saved.visited = true;
    c.saved.terrace = 3;
    c.saved.recovered = true;
    c.record.visible = false;
    game.audio.tone("discover");
    game.save();
    game.cb.cleftRecord?.(CLEFT_RECORD);
    return true;
  }
  if (p.distanceTo(c.returnStart) < 1.4) {
    c.anchor = 3;
    game.wallGrip = {
      kind: "rappel-reach",
      start: p.clone(),
      end: c.returnStart.clone(),
      time: 0,
      duration: 0.6,
    };
    sync(game);
    game.keys.delete("Space");
    return true;
  }
  return false;
}
export function cleftHint(game) {
  const c = game.cleft,
    g = game.wallGrip;
  if (!c) return null;
  if (g) {
    if (g.kind === "recover")
      return {
        key: "↘",
        label: "Belay recovery · your last rest terrace is saved",
      };
    if (g.kind.startsWith("rappel"))
      return { key: "↘", label: "Lowering down the surveyors’ return line" };
    if (g.kind === "leap")
      return { key: "E", label: "Hold Use to catch the far handhold" };
    const n = c.nodes[g.node];
    if (n.terrace > 0)
      return {
        key: "SPACE",
        label: "Step onto the rest terrace · W / ↑ continues climbing",
      };
    return {
      key: "WASD",
      label:
        "Climb / traverse · Space + direction leaps · hold E to catch · E releases",
    };
  }
  if (cleftCandidate(game))
    return {
      key: "E",
      label: "Grip the surveyors’ handholds · rest here to recover stamina",
    };
  if (!game.grounded) return null;
  const p = game.player.position;
  if (p.distanceTo(c.guidePoint) < 2.2)
    return { key: "E", label: "Read the surveyors’ climbing instructions" };
  if (p.distanceTo(c.recordPoint) < 1.65 && !c.saved.recovered)
    return { key: "E", label: "Recover the surveyors’ last bearing" };
  if (p.distanceTo(c.returnStart) < 1.4)
    return { key: "E", label: "Descend the return line" };
  return null;
}
export function cleftObjective(game) {
  if (!insideCleft(game)) return null;
  const c = game.cleft;
  return {
    step: c.saved.recovered ? 4 : c.saved.terrace,
    text: c.saved.recovered
      ? "Follow the upper balcony to the return line"
      : c.saved.terrace === 3
        ? "Read the survey record on the upper balcony"
        : `Climb to ${CLEFT_TERRACES[Math.min(3, c.saved.terrace + 1)].name.toLowerCase()}`,
  };
}
export function updateCleft(game, dt, x = 0, up = 0) {
  const c = game.cleft;
  if (!c) return false;
  if (game.paused) {
    updateCleftArt(game);
    return !!game.wallGrip;
  }
  game.cleftCooldown = Math.max(0, (game.cleftCooldown || 0) - dt);
  if (insideCleft(game) && !c.saved.visited) {
    c.saved.visited = true;
    game.save();
    game.cb.toast?.(
      "Optional climb · The Surveyor’s Cleft. Read the cairn at the wall’s western foot.",
      6500,
    );
  }
  let g = game.wallGrip;
  if (!g) {
    const p = game.player.position,
      d = cleftDeckAt(game, p.x, p.z, p.y)?.surface;
    if (
      game.grounded &&
      d?.cleftTerrace !== undefined &&
      Math.abs(p.y - d.y) < 0.25
    ) {
      c.anchor = d.cleftTerrace;
      if (c.anchor > c.saved.terrace) {
        c.saved.terrace = c.anchor;
        game.save();
      }
    }
    // Walking or jumping off an upper rest terrace also remains on belay.
    if (
      insideCleft(game) &&
      c.anchor > 0 &&
      !game.grounded &&
      p.y < c.decks[c.anchor].y - 1.5 &&
      !game.climb
    ) {
      recoverCleft(game);
      return true;
    }
    updateCleftArt(game);
    return false;
  }
  game.keys.delete("KeyF");
  if (g.kind === "hang") {
    game.stamina = Math.max(0, game.stamina - dt * 2);
    if (game.stamina === 0) {
      recoverCleft(game);
      return true;
    }
    const n = c.nodes[g.node],
      direction = cleftDirection(g.node, x, up),
      jump = game.keys.has("Space");
    game.keys.delete("Space");
    if (jump && n.terrace >= 0 && Math.hypot(x, up) < 0.35) {
      game.wallGrip = {
        kind: "mount",
        node: g.node,
        start: game.player.position.clone(),
        end: cleftSafePoint(game, n.terrace),
        time: 0,
        duration: 0.85,
      };
    } else if (direction) {
      if (direction.leap && !jump) {
        if ((g.promptAt || 0) > game.elapsed) {
          sync(game);
          return true;
        }
        g.promptAt = game.elapsed + 3;
        game.cb.toast?.(
          "Broken span · hold a direction, press Jump, then hold Use to catch.",
          1800,
        );
      } else if (!direction.leap || game.stamina >= 12) {
        const end = c.nodes[direction.id];
        game.wallGrip = {
          kind: direction.leap ? "leap" : "move",
          node: g.node,
          next: direction.id,
          start: feet(n),
          end: feet(end),
          time: 0,
          duration: direction.leap ? 0.95 : 0.64,
        };
        if (direction.leap) {
          game.stamina -= 10;
          audible(game, n.grip, 1.5);
        }
      }
    }
    sync(game);
    return true;
  }
  g.time += dt;
  const t = Math.min(1, g.time / g.duration);
  game.player.position.copy(g.start).lerp(g.end, smooth(t));
  if (g.kind === "leap") game.player.position.y += Math.sin(t * Math.PI) * 0.65;
  if (g.kind === "mount") game.player.position.y += Math.sin(t * Math.PI) * 0.3;
  if (g.kind === "recover")
    game.player.position.z += Math.sin(t * Math.PI) * 1.1;
  if (
    ["move", "reach", "leap", "mount"].includes(g.kind) &&
    game.canMove &&
    !game.canMove(
      game.player.position.x,
      game.player.position.z,
      game.player.position.y -
        game.groundHeight(game.player.position.x, game.player.position.z),
    )
  ) {
    recoverCleft(game);
    return true;
  }
  if (["move", "reach", "leap"].includes(g.kind))
    game.stamina = Math.max(0, game.stamina - dt * 4);
  if (g.kind === "leap" && t >= 0.62 && game.keys.has("KeyE")) g.caught = true;
  sync(game);
  if (t < 1) return true;
  if (g.kind === "recover" || g.kind === "mount") {
    const index = g.kind === "mount" ? c.nodes[g.node].terrace : c.anchor;
    finishOnTerrace(game, index);
    return true;
  }
  if (g.kind === "rappel-reach") {
    game.wallGrip = {
      kind: "rappel",
      start: c.returnStart.clone(),
      end: c.returnEnd.clone(),
      time: 0,
      duration: 7,
    };
    return true;
  }
  if (g.kind === "rappel") {
    game.wallGrip = null;
    game.grounded = true;
    c.anchor = 0;
    game.cleftCooldown = 0.5;
    game.save();
    updateCleftArt(game);
    return true;
  }
  if (g.kind === "leap" && !g.caught) {
    recoverCleft(game);
    return true;
  }
  game.wallGrip = { kind: "hang", node: g.next ?? g.node };
  audible(game, c.nodes[game.wallGrip.node].grip);
  return true;
}
