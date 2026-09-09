import * as THREE from "three";
import { spanCoordinates, bridgeDeckY } from "../src/sky-bridge-rules.js";
import { advanceCharacter } from "../src/character-motion.js";
import { recoverSkyBridgeFall } from "../src/sky-bridges.js";
import { findRoute } from "../src/navigation.js";

export function skyBridgeView(game, index = 0) {
  const b = game.skyBridges[index],
    c = spanCoordinates(b, b.bx, b.bz);
  game.player.position.set(
    b.ax - c.ux * 3,
    game.groundHeight(b.ax - c.ux * 3, b.az - c.uz * 3),
    b.az - c.uz * 3,
  );
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(
    (b.ax + b.bx) / 2 - c.ux * 12 + c.uz * 22,
    (b.ay + b.by) / 2 + 14,
    (b.az + b.bz) / 2 - c.uz * 12 - c.ux * 22,
  );
  game.camera.lookAt(
    (b.ax + b.bx) / 2,
    bridgeDeckY(b, c.length / 2) + 1,
    (b.az + b.bz) / 2,
  );
  game.renderScene(0);
  return {
    id: b.id,
    open: b.open,
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}
export function inspectSkyBridges(game) {
  const approaches = game.map.features
    .filter((f) => f.type !== "guardian")
    .map((f) => {
      const course = game.traversalCourses.find((c) => c.id === f.id),
        summit = course?.ledges.at(-1);
      return {
        id: f.id,
        clear:
          Array.from({ length: 24 }, (_, i) => ({
            x: f.x * 7 + Math.cos((i / 24) * Math.PI * 2) * 2.1,
            z: f.z * 7 + Math.sin((i / 24) * Math.PI * 2) * 2.1,
          })).some((p) =>
            game.canMove(
              p.x,
              p.z,
              summit ? summit.y - game.groundHeight(p.x, p.z) : f.yOffset || 0,
            ),
          ) &&
          (!course || game.canMove(course.entry.x, course.entry.z, 0)),
      };
    });
  const gl = game.renderer.getContext();
  return {
    approaches,
    camera: game.cameraSurfaces.count,
    bridges: game.skyBridges.length,
    sources: game.skyBridgeSources.length,
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
      log: gl.getProgramInfoLog(p.program),
    })),
  };
}

export function inspectSkyBanks(game) {
  const previous = {
    stage: game.progress.stage,
    field: [...game.progress.field],
    completed: game.progress.completed,
  };
  Object.assign(game.progress, { stage: 9, completed: true });
  game.updateDecorations(100);
  const result = [];
  try {
    const bankPoint = (b, end) => {
      const p = spanCoordinates(b, b.bx, b.bz),
        s = end ? p.length + 1 : -1;
      return { x: b.ax + p.ux * s, z: b.az + p.uz * s };
    };
    const stationPoint = (f, depart = false) => {
      const course = game.traversalCourses.find((c) => c.id === f.id);
      return course
        ? depart
          ? { x: course.exit.x, z: course.exit.z }
          : course.entry
        : { x: f.x * 7, z: f.z * 7 };
    };
    for (let stage = 0; stage < 9; stage++) {
      const stations = game.items.filter(
          (f) => f.type === "field" && f.stage === stage,
        ),
        spans = game.skyBridges.filter((b) => b.stage === stage);
      const room = game.map.rooms[stage],
        next = game.map.rooms[stage + 1];
      const pairs = [
        [{ x: room.x * 7, z: (room.z + 2) * 7 }, stationPoint(stations[0])],
        [stationPoint(stations[0], true), bankPoint(spans[0], false)],
        [bankPoint(spans[0], true), stationPoint(stations[1])],
        [stationPoint(stations[1], true), bankPoint(spans[1], false)],
        [bankPoint(spans[1], true), stationPoint(stations[2])],
        [stationPoint(stations[2], true), { x: next.x * 7, z: next.z * 7 + 5 }],
      ];
      for (const [i, [a, b]] of pairs.entries()) {
        const canStand = (x, z) =>
          game.canMove(x, z, 0) &&
          Math.abs(
            game.groundHeight(x, z) -
              game.terrainProfile.foundationHeight(x, z),
          ) < 0.05;
        const route = findRoute(canStand, a, b, {
          cell: 0.7,
          maxDistance: 100,
          maxVisited: 9000,
          margin: 17,
        });
        result.push({
          stage,
          leg: i,
          status: route.status,
          points: route.points.length,
          from: a,
          to: b,
        });
      }
    }
  } finally {
    Object.assign(game.progress, previous);
    game.updateDecorations(100);
  }
  return result;
}

// Baseline gap/collision review without the later crosswind controller; not a
// timed or blind playthrough. Current wind checks are documented in sky-crosswinds.md.
export function crossSkyBridges(game) {
  const oldProgress = {
    stage: game.progress.stage,
    field: [...game.progress.field],
    completed: game.progress.completed,
  };
  const oldPosition = game.player.position.clone(),
    result = [];
  Object.assign(game.progress, { stage: 9, completed: true });
  game.updateDecorations(100);
  try {
    for (const b of game.skyBridges)
      for (const direction of [1, -1]) {
        const c = spanCoordinates(b, b.bx, b.bz),
          start = direction === 1 ? -1 : c.length + 1;
        const x = b.ax + c.ux * start,
          z = b.az + c.uz * start;
        game.player.position.set(x, game.groundHeight(x, z), z);
        Object.assign(game, {
          grounded: true,
          velocityY: 0,
          airVelocity: null,
          jumpBuffer: 0,
          coyote: 0,
          fallPeak: game.player.position.y,
        });
        let falls = 0,
          jumps = 0,
          finished = false;
        for (let frame = 0; frame < 900; frame++) {
          const p = spanCoordinates(
            b,
            game.player.position.x,
            game.player.position.z,
          );
          if (direction === 1 ? p.along > c.length + 0.8 : p.along < -0.8) {
            finished = true;
            break;
          }
          const jump =
            game.grounded &&
            b.gaps.some((g) => {
              const d = direction === 1 ? g.start - p.along : p.along - g.end;
              return d > 0 && d < 1.15;
            });
          if (jump) jumps++;
          advanceCharacter(
            game,
            { x: c.ux * 4.6 * direction, z: c.uz * 4.6 * direction },
            1 / 60,
            jump,
          );
          if (recoverSkyBridgeFall(game)) falls++;
        }
        result.push({
          id: b.id,
          direction,
          finished,
          falls,
          jumps,
          along: spanCoordinates(
            b,
            game.player.position.x,
            game.player.position.z,
          ).along,
        });
      }
  } finally {
    Object.assign(game.progress, oldProgress);
    game.player.position.copy(oldPosition);
    game.velocityY = 0;
    game.grounded = true;
    game.jumpY =
      oldPosition.y - game.groundHeight(oldPosition.x, oldPosition.z);
    game.updateDecorations(100);
  }
  return result;
}
