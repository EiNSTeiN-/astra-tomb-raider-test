import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";

export function solarView(game, stage = 1, close = false) {
  const site = game.solarSites[stage],
    x = site.root.position.x,
    z = site.root.position.z,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 16);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(
    x + (close ? 11 : 21),
    y + (close ? 7 : 14),
    z + (close ? 24 : 35),
  );
  game.camera.lookAt(x, y + 2, z + 12);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
  };
}

export function inspectSolar(game) {
  const gl = game.renderer.getContext();
  return {
    sites: game.solarSites.length,
    mirrors: game.solarSites.map((s) => s.mirrors.length),
    sources: game.solarSources.length,
    controls: game.items
      .filter((f) => f.type === "solar")
      .map((f) => ({
        id: f.id,
        clear: [-0.18, 0, 0.18].every((dx) =>
          [-0.18, 0, 0.18].every((dz) =>
            game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0),
          ),
        ),
      })),
    approaches: game.map.features
      .filter((f) => f.type !== "guardian")
      .map((f) => {
        const course = game.traversalCourses.find((c) => c.id === f.id),
          summit = course?.ledges.at(-1);
        return {
          id: f.id,
          clear:
            Array.from({ length: 24 }, (_, i) => ({
              x: f.x * 7 + Math.cos((i * Math.PI) / 12) * 2.1,
              z: f.z * 7 + Math.sin((i * Math.PI) / 12) * 2.1,
            })).some((p) =>
              game.canMove(
                p.x,
                p.z,
                summit
                  ? summit.y - game.groundHeight(p.x, p.z)
                  : f.yOffset || 0,
              ),
            ) &&
            (!course || game.canMove(course.entry.x, course.entry.z, 0)),
        };
      }),
    emitterFronts: game.solarSources.map((s) => ({
      id: s.id,
      clear: game.lineOfSight(
        new THREE.Vector3(s.x, game.groundHeight(s.x, s.z), s.z),
        new THREE.Vector3(s.x, s.y - 1.4, s.z),
      ),
    })),
    camera: game.cameraSurfaces.count,
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
    })),
  };
}

// Computed paths with actual movement physics and open field gates, not a playthrough.
export function walkSolarCourts(game) {
  const motion = Object.fromEntries(
    [
      "jumpY",
      "velocityY",
      "grounded",
      "moveVelocity",
      "jumpBuffer",
      "coyote",
      "motionLanding",
      "fallPeak",
      "airVelocity",
    ].map((key) => [key, game[key]]),
  );
  const position = game.player.position.clone(),
    progress = {
      stage: game.progress.stage,
      completed: game.progress.completed,
    };
  const results = [];
  Object.assign(game.progress, { stage: 9, completed: true });
  game.updateDecorations(100);
  try {
    for (const site of game.solarSites) {
      const points = [
        { x: site.root.position.x, z: site.root.position.z + 8 },
        ...site.mirrors.map((m) => ({
          x: m.feature.x * 7,
          z: m.feature.z * 7,
        })),
        { x: site.receiver.x * 7, z: site.receiver.z * 7 },
      ];
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1],
          end = points[i];
        const route = findRoute((x, z) => game.canMove(x, z, 0), start, end, {
          cell: 0.35,
          margin: 8,
          maxVisited: 16000,
          maxDistance: 50,
        });
        let arrived = route.status === "complete",
          frames = 0;
        if (arrived) {
          game.player.position.set(
            start.x,
            game.groundHeight(start.x, start.z),
            start.z,
          );
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
              ) > 0.15 &&
              n++ < 900
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
            if (n >= 900) {
              arrived = false;
              break;
            }
          }
        }
        results.push({
          stage: site.stage,
          leg: i,
          status: route.status,
          arrived,
          frames,
          points: route.points.length,
        });
      }
    }
  } finally {
    Object.assign(game.progress, progress);
    Object.assign(game, motion);
    game.player.position.copy(position);
    game.updateDecorations(100);
  }
  return results;
}
