import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";

export function bellView(game, stage = 1) {
  const c = game.bellSites[stage].root.position;
  game.player.position.set(c.x, game.groundHeight(c.x, c.z + 7), c.z + 7);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(c.x + 8, c.y + 6, c.z + 14);
  game.camera.lookAt(c.x, c.y + 2.5, c.z);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
  };
}
export function inspectBells(game) {
  return {
    courts: game.bellSites.length,
    controls: game.items
      .filter((f) => f.type === "bell")
      .map((f) => ({
        id: f.id,
        clear: [-0.12, 0, 0.12].every((dx) =>
          [-0.12, 0, 0.12].every((dz) =>
            game.canMove(
              f.x * 7 + dx,
              f.z * 7 + dz,
              game.bellSites[f.stage].root.position.y -
                game.groundHeight(f.x * 7 + dx, f.z * 7 + dz),
            ),
          ),
        ),
      })),
    sources: game.bellSites.flatMap((site) =>
      site.bells.map((bell) => ({
        id: bell.control.id,
        clear: game.lineOfSight(
          new THREE.Vector3(
            bell.control.x * 7,
            site.root.position.y,
            bell.control.z * 7,
          ),
          bell.audioPosition.clone().add(new THREE.Vector3(0, -1.4, 0)),
        ),
      })),
    ),
    camera: game.cameraSurfaces.count,
    linked: game.renderer.info.programs.every((p) =>
      game.renderer
        .getContext()
        .getProgramParameter(p.program, game.renderer.getContext().LINK_STATUS),
    ),
  };
}

// Assisted local circulation, using real movement physics and open field gates.
export function walkBellRacks(game) {
  const position = game.player.position.clone(),
    stage = game.progress.stage;
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
    ].map((k) => [k, game[k]]),
  );
  const results = [];
  game.progress.stage = 8;
  game.updateDecorations(100);
  try {
    for (const site of game.bellSites) {
      const points = [
        site.tablet,
        ...site.bells.map((b) => b.control),
        site.tablet,
      ].map((f) => ({ x: f.x * 7, z: f.z * 7 }));
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1],
          end = points[i];
        const route = findRoute(
          (x, z) =>
            game.canMove(x, z, site.root.position.y - game.groundHeight(x, z)),
          start,
          end,
          { cell: 0.18, margin: 3, maxVisited: 4000, maxDistance: 12 },
        );
        let arrived = route.status === "complete",
          frames = 0;
        if (arrived) {
          game.player.position.set(start.x, site.root.position.y, start.z);
          Object.assign(game, {
            jumpY: site.root.position.y - game.groundHeight(start.x, start.z),
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
              ) > 0.12 &&
              n++ < 240
            ) {
              const dx = p.x - game.player.position.x,
                dz = p.z - game.player.position.z,
                d = Math.hypot(dx, dz);
              advanceCharacter(
                game,
                { x: (dx / d) * 3.2, z: (dz / d) * 3.2 },
                1 / 60,
              );
              frames++;
            }
            if (
              n >= 240 ||
              Math.abs(game.player.position.y - site.root.position.y) > 0.3
            ) {
              arrived = false;
              break;
            }
          }
        }
        results.push({
          stage: site.stage,
          leg: i,
          arrived,
          frames,
          status: route.status,
        });
      }
    }
  } finally {
    Object.assign(game, motion);
    game.player.position.copy(position);
    game.progress.stage = stage;
    game.updateDecorations(100);
  }
  return results;
}
