import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";

export function observatoryView(game, index = 0, close = false) {
  game.orreryFocus = null;
  const r = game.map.rooms[index],
    x = r.x * 7,
    z = r.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 12);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(
    x + (close ? 13 : 22),
    y + (close ? 9 : 9),
    z + (close ? 12 : 29),
  );
  game.camera.lookAt(x, y + 8, z - 12);
  game.renderScene(0);
  return {
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}

export function inspectObservatory(game) {
  const gl = game.renderer.getContext();
  return {
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
    observatories: game.observatories.length,
    camera: game.cameraSurfaces.count,
    emitters: game.soundSources
      .filter((s) => s.observatoryRoom !== undefined)
      .map((s) => ({
        id: s.id,
        activity: s.activity,
        frontClear: game.lineOfSight(
          new THREE.Vector3(s.x, game.groundHeight(s.x, s.z + 4), s.z + 4),
          new THREE.Vector3(s.x, s.y - 1.4, s.z),
        ),
      })),
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
      log: gl.getProgramInfoLog(p.program),
    })),
  };
}

// Development-assisted local routes and real character physics; not a timed playthrough.
export function inspectObservatoryRoutes(game) {
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
  const original = game.player.position.clone(),
    old = {
      stage: game.progress.stage,
      completed: game.progress.completed,
      field: [...game.progress.field],
    };
  const result = [];
  Object.assign(game.progress, { stage: 10, completed: true });
  game.updateDecorations(100);
  try {
    for (const room of game.map.rooms) {
      const x = room.x * 7,
        z = room.z * 7;
      const pairs = [
        [
          [x - 14, z - 5],
          [x + 14, z - 5],
        ],
        [
          [x, z - 5],
          [x, z - 30],
        ],
        [
          [x - 14, z - 20],
          [x + 14, z - 20],
        ],
      ];
      for (const [a, b] of pairs) {
        const start = { x: a[0], z: a[1] },
          end = { x: b[0], z: b[1] };
        // Court pads may terminate at rock banks; test only valid endpoints.
        if (
          !game.canMove(start.x, start.z, 0) ||
          !game.canMove(end.x, end.z, 0)
        )
          continue;
        const route = findRoute(
          (px, pz) => game.canMove(px, pz, 0),
          start,
          end,
          { cell: 0.7, maxDistance: 60, maxVisited: 6000, margin: 13 },
        );
        let arrived = route.status === "complete",
          frames = 0;
        if (arrived) {
          game.player.position.set(
            start.x,
            game.groundHeight(start.x, start.z),
            start.z,
          );
          game.jumpY = 0;
          game.velocityY = 0;
          game.grounded = true;
          game.moveVelocity = { x: 0, z: 0 };
          game.jumpBuffer = 0;
          game.airVelocity = { x: 0, z: 0 };
          for (const point of route.points) {
            let n = 0;
            while (
              Math.hypot(
                point.x - game.player.position.x,
                point.z - game.player.position.z,
              ) > 0.25 &&
              n++ < 900
            ) {
              const dx = point.x - game.player.position.x,
                dz = point.z - game.player.position.z,
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
        result.push({
          room: room.index,
          from: start,
          to: end,
          status: route.status,
          points: route.points.length,
          arrived,
          frames,
        });
      }
    }
  } finally {
    Object.assign(game.progress, old);
    game.player.position.copy(original);
    Object.assign(game, motion);
    game.updateDecorations(100);
  }
  return result;
}
