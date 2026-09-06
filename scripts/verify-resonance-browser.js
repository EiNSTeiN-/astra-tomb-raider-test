import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";
import { updateResonanceCourts } from "../src/resonance-courts.js";
export function resonanceView(game, stage = 5) {
  const site = game.resonanceSites[stage],
    c = site.root.position;
  game.player.position.set(c.x, game.groundHeight(c.x, c.z + 23), c.z + 23);
  game.updateDecorations(4);
  game.cb.update?.(game.state());
  game.camera.fov = 80;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(c.x, c.y + 8, c.z + 29);
  game.camera.lookAt(c.x, c.y + 2, c.z + 13);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
  };
}
export function inspectResonance(game) {
  const gl = game.renderer.getContext();
  return {
    arrays: game.resonanceSites.length,
    nodes: game.resonanceSites.reduce((n, s) => n + s.nodes.length, 0),
    controls: game.items
      .filter((f) => f.type === "resonator")
      .map((f) => ({
        id: f.id,
        clear: [-0.12, 0, 0.12].every((dx) =>
          [-0.12, 0, 0.12].every((dz) =>
            game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0),
          ),
        ),
      })),
    sounds: game.resonanceSites.flatMap((s) =>
      s.nodes.flatMap((n) =>
        [n.voice, n.reference].map((source) => ({
          id: source.id,
          clear: game.lineOfSight(
            n.control.group.position,
            new THREE.Vector3(source.x, source.y - 1.4, source.z),
          ),
        })),
      ),
    ),
    anchors: game.resonanceSites.flatMap((s) =>
      s.nodes.map((n) => ({
        id: n.control.id,
        attached: n.handles.every((h) => h.parent === n.wheel),
      })),
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
// Assisted local routes use actual character physics; they do not establish play duration.
export function walkResonanceCourts(game) {
  const saved = {
    position: game.player.position.clone(),
    stage: game.progress.stage,
    completed: game.progress.completed,
    sites: game.resonanceSites.map((s) => ({
      state: structuredClone(s.state),
      display: s.nodes.map((n) => n.display),
    })),
  };
  const motion = Object.fromEntries(
    [
      "jumpY",
      "velocityY",
      "grounded",
      "jumpBuffer",
      "coyote",
      "motionLanding",
      "fallPeak",
      "airVelocity",
    ].map((k) => [
      k,
      game[k]?.clone
        ? game[k].clone()
        : game[k] && typeof game[k] === "object"
          ? structuredClone(game[k])
          : game[k],
    ]),
  );
  const result = [];
  try {
    game.progress.completed = true;
    game.updateDecorations(100);
    for (const site of game.resonanceSites) {
      const points = [
        site.tablet,
        ...site.nodes.map((n) => n.control),
        site.tablet,
      ].map((f) => ({ x: f.x * 7, z: f.z * 7 }));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          route = findRoute((x, z) => game.canMove(x, z, 0), a, b, {
            cell: 0.3,
            margin: 7,
            maxVisited: 12000,
            maxDistance: 50,
          });
        let arrived = route.status === "complete",
          frames = 0;
        if (arrived) {
          game.player.position.set(a.x, game.groundHeight(a.x, a.z), a.z);
          Object.assign(game, {
            jumpY: 0,
            velocityY: 0,
            grounded: true,
            jumpBuffer: 0,
            airVelocity: { x: 0, z: 0 },
          });
          for (const p of route.points) {
            let n = 0;
            while (
              Math.hypot(
                p.x - game.player.position.x,
                p.z - game.player.position.z,
              ) > 0.14 &&
              n++ < 700
            ) {
              const dx = p.x - game.player.position.x,
                dz = p.z - game.player.position.z,
                d = Math.hypot(dx, dz);
              advanceCharacter(
                game,
                { x: (dx / d) * 4.6, z: (dz / d) * 4.6 },
                1 / 60,
              );
              frames++;
            }
            if (n >= 700) {
              arrived = false;
              break;
            }
          }
        }
        result.push({
          stage: site.stage,
          leg: i,
          arrived,
          frames,
          status: route.status,
        });
      }
    }
  } finally {
    game.progress.stage = saved.stage;
    game.progress.completed = saved.completed;
    game.player.position.copy(saved.position);
    Object.assign(game, motion);
    game.resonanceSites.forEach((s, i) => {
      s.state = saved.sites[i].state;
      s.nodes.forEach((n, j) => (n.display = saved.sites[i].display[j]));
    });
    game.updateDecorations(0);
    updateResonanceCourts(game, 0);
  }
  return result;
}
