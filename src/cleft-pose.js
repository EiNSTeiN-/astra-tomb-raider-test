import * as THREE from "three";
import { poseCylinderGrip } from "./hand-grip.js";
import { poseHands, poseFeet } from "./pose.js";

export function cleftHandTargets(game) {
  const g = game.wallGrip,
    c = game.cleft;
  if (!g || !c || g.kind === "recover") return null;
  if (g.kind.startsWith("rappel"))
    return [1.8, 1.48].map((height) => {
      const y = game.player.position.y + height;
      return c.returnLineStart
        .clone()
        .lerp(
          c.returnLineEnd,
          (c.returnLineStart.y - y) / (c.returnLineStart.y - c.returnLineEnd.y),
        );
    });
  const a = c.nodes[g.node].grip,
    b = c.nodes[g.next ?? g.node].grip;
  const t = g.duration ? Math.min(1, g.time / g.duration) : 0;
  if (g.kind === "leap" && t > 0.12 && t < 0.82) return null;
  // Alternate the reaching hand; keep the release/catch in the reachable arc.
  return [-1, 1].map((side, i) => {
    const phase =
      g.kind === "move"
        ? THREE.MathUtils.smoothstep(t, i ? 0.2 : 0, i ? 1 : 0.8)
        : g.kind === "leap" && t >= 0.82
          ? 1
          : 0;
    return a
      .clone()
      .lerp(b, phase)
      .add(new THREE.Vector3(side * 0.26, 0, 0));
  });
}
export function poseCleft(game) {
  const g = game.wallGrip,
    p = game.player.position;
  if (!g) return;
  const targets = cleftHandTargets(game);
  let weight = 1;
  if (g.kind === "reach")
    weight = THREE.MathUtils.smoothstep(g.time / g.duration, 0, 0.8);
  if (g.kind === "mount")
    weight = 1 - THREE.MathUtils.smoothstep(g.time / g.duration, 0.1, 0.7);
  if (g.kind.startsWith("rappel")) {
    const axis = game.cleft.returnLineStart
      .clone()
      .sub(game.cleft.returnLineEnd)
      .normalize();
    poseCylinderGrip(
      game,
      targets,
      axis,
      new THREE.Vector3(-1, 0, 0),
      g.kind === "rappel-reach" ? Math.min(1, g.time / g.duration) : 1,
      1,
      true,
    );
  } else if (targets && weight > 0.001) {
    poseCylinderGrip(
      game,
      targets,
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      weight,
      1,
      true,
    );
  } else {
    poseHands(
      game,
      [-1, 1].map((side) =>
        p.clone().add(new THREE.Vector3(side * 0.4, 1.35, -0.22)),
      ),
    );
  }
  const stride =
    g.kind === "move" ? Math.sin((g.time / g.duration) * Math.PI) * 0.18 : 0;
  poseFeet(
    game,
    [-1, 1].map((side, i) =>
      p
        .clone()
        .add(
          new THREE.Vector3(
            side * 0.2,
            g.kind.startsWith("rappel")
              ? 0.15 + (i ? 0.1 : 0)
              : 0.5 + (i ? stride : 0),
            g.kind.startsWith("rappel") ? -0.12 : -0.52,
          ),
        ),
    ),
  );
}
