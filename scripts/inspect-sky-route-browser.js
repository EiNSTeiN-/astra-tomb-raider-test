// Assisted route inspection. Uses the delivered player controller,
// follow camera and mechanisms; enemy AI and combat are not advanced.
import * as THREE from "three";
import { searchRoute } from "../src/navigation.js";
import { supportAt } from "../src/character-motion.js";
import { spanCoordinates } from "../src/sky-bridge-rules.js";
import { predictedRopeLanding } from "../src/traversal.js";

export function prepareSkyRoute(game) {
  if (game.level.biome !== "sky") throw Error("Load the sky chapter first");
  game.renderer.setAnimationLoop(null);
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.store.data.settings.quality = "high";
  game.applySettings();
  game.setPaused(false);
  game.pitch = 0.13;
  game.updateCamera(10);
  return {
    start: game.player.position.toArray(),
    course: game.traversalCourses.find((c) => c.stage === 0).id,
    spans: game.skyBridges.filter((b) => b.stage === 0).map((b) => b.id),
  };
}

function tick(game, state, direction = { x: 0, z: 0 }) {
  const old = game.player.position.clone();
  if (Math.hypot(direction.x, direction.z) > 0.01) {
    const desired = Math.atan2(-direction.x, -direction.z),
      angle = Math.atan2(
        Math.sin(desired - game.yaw),
        Math.cos(desired - game.yaw),
      );
    game.yaw += (angle * 4) / 60;
  }
  game.touchMove = {
    x: direction.x * Math.cos(game.yaw) - direction.z * Math.sin(game.yaw),
    z: direction.x * Math.sin(game.yaw) + direction.z * Math.cos(game.yaw),
  };
  game.elapsed += 1 / 60;
  game.progress.time += 1 / 60;
  game.updatePlayer(1 / 60);
  game.updateCamera(1 / 60);
  if (state.frames % 12 === 0) game.updateDecorations(12 / 60);
  const step = old.distanceTo(game.player.position);
  state.distance += step;
  state.largestStep = Math.max(state.largestStep || 0, step);
  if (step > 1) {
    state.largeSteps ??= [];
    state.largeSteps.push({
      frame: state.frames,
      distance: step,
      from: old.toArray(),
      to: game.player.position.toArray(),
      cable: !!game.zipRide,
      rope: !!game.ropeRide,
    });
  }
  state.frames++;
  state.stall =
    old.distanceTo(game.player.position) < 0.0001 ? state.stall + 1 : 0;
  state.peakWind = Math.max(
    state.peakWind || 0,
    Math.abs(game.skyWind?.force || 0),
  );
}

export function skyRouteSnapshot(game, state) {
  game.updateDecorations(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    frames: state.frames,
    distance: state.distance,
    stall: state.stall,
    peakWind: state.peakWind || 0,
    largestStep: state.largestStep || 0,
    largeSteps: state.largeSteps || [],
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    yaw: game.yaw,
    pitch: game.pitch,
    cameraArm: game.camera.position.distanceTo(
      game.player.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
    ),
    health: game.health,
    grounded: game.grounded,
    climbing: !!game.climb,
    height: game.jumpY,
    ledge: game.courseAnchor?.ledge,
    ridingRope: !!game.ropeRide,
    ridingCable: !!game.zipRide,
    ropeReleaseSafe: !!predictedRopeLanding(game)?.safe,
    field: [...game.progress.field],
    nearest: game.nearest?.id,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}

export async function planSkyWalk(game, target, height = null) {
  const clear =
    height === null
      ? (x, z) =>
          game.canMove(x, z, 0) &&
          Math.abs(
            game.groundHeight(x, z) -
              game.terrainProfile.foundationHeight(x, z),
          ) < 0.05
      : (x, z) =>
          game.canMove(x, z, height - game.groundHeight(x, z)) &&
          Math.abs(supportAt(game, x, z, height).height - height) < 0.05;
  const search = searchRoute(clear, game.player.position, target, {
    cell: height === null ? 0.7 : 0.18,
    margin: height === null ? 25 : 3,
    maxVisited: height === null ? 18000 : 3000,
    maxDistance: height === null ? 160 : 12,
  });
  let result;
  do {
    result = search.next();
    if (!result.done) await new Promise((resolve) => setTimeout(resolve, 0));
  } while (!result.done);
  return result.value;
}

// Wait through the ordinary approach and quarter-turn. Advancing only scenery
// would skip the controller movement required when a route ends off the pad.
export function finishSkyWindTurn(game, state, stage, index) {
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.updatePlayer(0);
  if (game.nearest?.id !== `wind-${stage}-wheel-${index}`)
    throw Error(
      `Expected wind wheel ${stage}/${index}, found ${game.nearest?.id}`,
    );
  const site = game.windSites[stage],
    node = site.nodes[index],
    moves = site.state.moves;
  game.interact();
  for (let frame = 0; frame < 120; frame++) {
    tick(game, state);
    if (site.state.moves > moves + 1)
      throw Error("A single interaction added multiple turns");
    if (
      site.state.moves === moves + 1 &&
      !game.windApproach &&
      !game.windGrip &&
      Math.abs(node.angle - node.goal) < 0.002
    )
      return skyRouteSnapshot(game, state);
  }
  throw Error(`Wind wheel ${stage}/${index} did not finish its turn`);
}

export function advanceSkyWalk(game, state, limit = 120) {
  game.keys.clear();
  for (let i = 0; i < limit && state.index < state.points.length; i++) {
    const point = state.points[state.index],
      dx = point.x - game.player.position.x,
      dz = point.z - game.player.position.z,
      d = Math.hypot(dx, dz);
    if (d < 0.02) {
      state.index++;
      state.stall = 0;
      continue;
    }
    const speed = Math.min(4, d * 25) / 6;
    tick(game, state, { x: (dx / d) * speed, z: (dz / d) * speed });
    if (state.stall > 180) break;
  }
  return {
    index: state.index,
    waypoints: state.points.length,
    ...skyRouteSnapshot(game, state),
  };
}

export function stepSkyCourse(game, state, local, seconds, keys = []) {
  const c = game.traversalCourses.find((c) => c.stage === 0),
    direction = {
      x: local.x * c.axis.x - local.z * c.axis.z,
      z: local.x * c.axis.z + local.z * c.axis.x,
    };
  game.keys = new Set(keys);
  for (let i = 0; i < Math.ceil(seconds * 60); i++)
    tick(game, state, direction);
  return skyRouteSnapshot(game, state);
}

export function approachSkyTakeoff(game, state) {
  const c = game.traversalCourses.find((c) => c.stage === 0),
    target = c.transform(-10, -0.1);
  game.keys.clear();
  let frames = 0;
  while (
    Math.hypot(
      target.x - game.player.position.x,
      target.z - game.player.position.z,
    ) > 0.12 &&
    frames++ < 180
  )
    tick(game, state, { x: c.axis.z, z: -c.axis.x });
  if (frames >= 180) throw Error("Takeoff edge not reached");
  return skyRouteSnapshot(game, state);
}

export function pumpSkyRope(game, state) {
  const c = game.ropeRide;
  if (!c) throw Error("Rope was not caught");
  game.keys.clear();
  let frames = 0;
  while (!predictedRopeLanding(game)?.safe && frames++ < 240)
    tick(game, state, c.axis);
  if (!predictedRopeLanding(game)?.safe) throw Error("No safe release cue");
  return skyRouteSnapshot(game, state);
}

export function finishSkyField(game, state, id) {
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.updatePlayer(0);
  if (game.nearest?.id !== id)
    throw Error(`Expected ${id}, nearest is ${game.nearest?.id}`);
  game.interact();
  if (!game.progress.field.includes(id))
    throw Error(`Field task ${id} did not complete`);
  return skyRouteSnapshot(game, state);
}

export function advanceSkyStone(game, state, index, pull = false) {
  const chamber = game.counterweights,
    previous = chamber.saved.moves;
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.updatePlayer(0);
  game.interact();
  if (game.blockGrip?.block.index !== index)
    throw Error(`Expected grip on stone ${index}`);
  game.keys.add(pull ? "ArrowDown" : "ArrowUp");
  for (let frame = 0; frame < 70 && chamber.saved.moves === previous; frame++)
    tick(game, state);
  game.keys.clear();
  if (chamber.saved.moves !== previous + 1)
    throw Error(`Stone ${index} did not move`);
  if (game.blockGrip) game.interact();
  return {
    moves: chamber.saved.moves,
    solved: chamber.saved.solved,
    positions: chamber.saved.positions.map((cell) => [...cell]),
    ...skyRouteSnapshot(game, state),
  };
}

export function boardSkyReturn(game, state) {
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.interact();
  if (!game.zipRide) throw Error("Return cable did not board");
  for (let i = 0; i < 185; i++) tick(game, state);
  if (game.zipRide) throw Error("Return cable did not finish");
  return skyRouteSnapshot(game, state);
}

export function advanceSkySpan(game, state, id, direction = 1, limit = 120) {
  const b = game.skyBridges.find((b) => b.id === id),
    end = spanCoordinates(b, b.bx, b.bz);
  game.keys.clear();
  for (let i = 0; i < limit; i++) {
    const q = spanCoordinates(
      b,
      game.player.position.x,
      game.player.position.z,
    );
    if (direction === 1 ? q.along >= end.length + 1 : q.along <= -1)
      return { done: true, ...skyRouteSnapshot(game, state) };
    if (b.open < 0.995) {
      tick(game, state);
      continue;
    }
    const vx = q.ux * 4 * direction - q.uz * q.across * 3,
      vz = q.uz * 4 * direction + q.ux * q.across * 3;
    const jump =
      game.grounded &&
      b.gaps.some((g) => {
        const d = direction === 1 ? g.start - q.along : q.along - g.end;
        return d > 0 && d < 1.15;
      });
    if (jump) game.keys.add("Space");
    // Carrying lowers the controller's base walking speed. Keep this assisted
    // crossing at the same measured 4 m/s rather than scaling it down twice.
    const speed = game.carrying ? 4.6 : 6;
    tick(game, state, { x: vx / speed, z: vz / speed });
  }
  return { done: false, ...skyRouteSnapshot(game, state) };
}

export function skyRouteTargets(game) {
  const c = game.traversalCourses.find((c) => c.stage === 0),
    fields = game.items.filter((f) => f.type === "field" && f.stage === 0),
    spans = game.skyBridges.filter((b) => b.stage === 0);
  return {
    // Leave extra mantle reach at the first approach.
    entry: c.transform(-10, 11.7),
    second: { ...c.transform(-10, 6), height: c.ledges[0].y },
    takeoff: c.transform(-10, -0.1),
    corner: c.transform(3.2, c.pivotLocalZ + 1.82),
    summit: {
      x: fields[0].x * 7,
      z: fields[0].z * 7 + 2.2,
      height: c.ledges[4].y,
    },
    launch: c.launch
      .clone()
      .lerp(
        new THREE.Vector3(c.ledges[4].x, c.ledges[4].y, c.ledges[4].z),
        0.15,
      ),
    fields: fields
      .slice(1)
      .map((f) => ({ id: f.id, x: f.x * 7, z: f.z * 7 + 2.2 })),
    spans: spans.map((b) => {
      const q = spanCoordinates(b, b.bx, b.bz);
      return {
        id: b.id,
        a: { x: b.ax - q.ux, z: b.az - q.uz },
        b: { x: b.bx + q.ux, z: b.bz + q.uz },
      };
    }),
    tablet: {
      x: game.windSites[0].tablet.x * 7,
      z: game.windSites[0].tablet.z * 7,
    },
  };
}
