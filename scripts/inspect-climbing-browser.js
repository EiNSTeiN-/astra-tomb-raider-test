import * as THREE from "three";
import {
  resetTraversal,
  trackTraversalSupport,
  predictedRopeLanding,
  traversalInteract,
  updateTraversal,
  cableApproachClear,
} from "../src/traversal.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { searchRoute } from "../src/navigation.js";

// Assisted full-world route check. It bypasses field work and known-answer
// deductions, but uses the delivered movement, collision and rope simulation.
export function exerciseClimbing(game) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const report = [];
  for (const c of game.traversalCourses) {
    let phase = "entry";
    const check = (ok, label) => {
      if (!ok) throw Error(label);
    };
    try {
      resetTraversal(game);
      Object.assign(game, {
        yaw: 0,
        grounded: true,
        jumpY: 0,
        velocityY: 0,
        elapsed: 0,
        stamina: 100,
        health: 100,
        swimming: false,
      });
      game.progress.stage = c.stage;
      game.progress.field = [];
      game.progress.completed = false;
      game.player.position.set(
        c.entry.x,
        game.groundHeight(c.entry.x, c.entry.z),
        c.entry.z,
      );
      for (const other of game.traversalCourses) {
        other.angle = 0;
        other.omega = 0;
      }
      const input = (x, z) => ({
        x: x * c.axis.x - z * c.axis.z,
        z: x * c.axis.z + z * c.axis.x,
      });
      const step = (direction, seconds, keys = []) => {
        game.keys = new Set(keys);
        game.touchMove = { x: direction.x, z: direction.z };
        for (let i = 0; i < Math.ceil(seconds * 60); i++) {
          game.elapsed += 1 / 60;
          game.updatePlayer(1 / 60);
        }
      };
      const walk = (x, z, s, keys) => step(input(x, z), s, keys);
      const mantle = (x, z) => {
        const d = input(x, z);
        check(game.tryClimb(d.x, d.z), "mantle unavailable");
        for (let i = 0; i < 52; i++) {
          if (game.climb) game.updateClimb(1 / 60);
          const p = game.player.position;
          check(
            !game.obstacles.some(
              (o) => o.fieldStation && stationBlocked(o, p.x, p.y, p.z),
            ),
            "mantle intersects station",
          );
        }
        check(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          "mantle ends inside solid",
        );
        trackTraversalSupport(game);
      };
      mantle(0, -1);
      check(game.courseAnchor?.ledge === 0, "first ledge");
      phase = "second ledge";
      walk(0, -1, 0.6);
      mantle(0, -1);
      check(game.courseAnchor?.ledge === 1, "second ledge");
      phase = "jump gap";
      const takeoff = c.transform(-10, -0.1);
      let ticks = 0;
      while (
        game.player.position.distanceTo(
          new THREE.Vector3(takeoff.x, c.ledges[1].y, takeoff.z),
        ) > 0.12 &&
        ticks++ < 180
      )
        walk(0, -1, 1 / 60);
      check(ticks < 180, "takeoff approach");
      walk(0, -1, 0.82, ["Space"]);
      check(game.courseAnchor?.ledge === 2, "jump landing");
      phase = "rope";
      walk(1, 0, 0.33);
      walk(1, 0, 0.65, ["Space", "KeyE"]);
      check(game.ropeRide, "rope catch");
      let swing = 0;
      while (!predictedRopeLanding(game)?.safe && swing++ < 240)
        walk(1, 0, 1 / 60);
      check(predictedRopeLanding(game)?.safe, "release cue");
      walk(0, 0, 0.02, ["Space"]);
      check(!game.ropeRide, "release");
      let landing = 0;
      while (!game.grounded && landing++ < 120) walk(0, 0, 1 / 60);
      check(game.courseAnchor?.ledge === 3, "far landing");
      phase = "summit";
      const corner = c.transform(3, c.pivotLocalZ + 2.05),
        delta = new THREE.Vector3(
          corner.x - game.player.position.x,
          0,
          corner.z - game.player.position.z,
        );
      step(delta.clone().normalize(), delta.length() / 6);
      mantle(-0.6, 0.8);
      check(game.courseAnchor?.ledge === 4, "summit ledge");
      const last = c.ledges[4],
        center = new THREE.Vector3(
          last.x - game.player.position.x,
          0,
          last.z - game.player.position.z,
        );
      step(center.clone().normalize(), center.length() / 6);
      game.progress.field.push(c.id);
      phase = "return cable";
      if (!cableApproachClear(game, c)) {
        const outward = game.player.position
          .clone()
          .sub(new THREE.Vector3(last.x, last.y, last.z))
          .setY(0)
          .normalize();
        step(outward, 0.35 / 6);
        const target = c.launch
            .clone()
            .lerp(new THREE.Vector3(last.x, last.y, last.z), 0.15),
          canStand = (x, z) =>
            Math.abs(x - last.x) < last.w &&
            Math.abs(z - last.z) < last.d &&
            game.canMove(x, z, last.y - game.groundHeight(x, z)),
          search = searchRoute(canStand, game.player.position, target, {
            cell: 0.2,
            margin: 3,
            maxVisited: 1800,
            maxDistance: 8,
          });
        let route;
        do {
          route = search.next();
        } while (!route.done);
        check(route.value.status === "complete", "walking approach to cable");
        for (const point of route.value.points) {
          const delta = new THREE.Vector3(
            point.x - game.player.position.x,
            0,
            point.z - game.player.position.z,
          );
          step(delta.clone().normalize(), delta.length() / 6);
        }
      }
      check(traversalInteract(game), "cable launch");
      check(game.zipRide, "cable boarded");
      for (let i = 0; i < 185; i++) {
        updateTraversal(game, 1 / 60, { x: 0, z: 0 });
        check(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          "cable clearance",
        );
      }
      check(
        !game.zipRide && game.player.position.distanceTo(c.exit) < 0.01,
        "cable exit",
      );
      report.push({ id: c.id, ok: true });
    } catch (error) {
      report.push({
        id: c.id,
        ok: false,
        phase,
        error: error.message,
        position: game.player.position.toArray(),
      });
    }
  }
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.setPaused(true);
  return report;
}

export function climbingView(game, index = 0, close = false) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const c = game.traversalCourses[index],
    a = c.transform(close ? -5 : -10, close ? -4 : 15),
    b = c.transform(close ? -2.5 : -3, close ? c.pivotLocalZ : -1);
  game.player.position.set(
    c.entry.x,
    game.groundHeight(c.entry.x, c.entry.z),
    c.entry.z,
  );
  game.camera.fov = close ? 50 : 65;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(a.x, c.base + (close ? c.pivot.h + 2 : 4), a.z);
  game.camera.lookAt(b.x, c.base + (close ? c.pivot.h : 9), b.z);
  game.updateDecorations(0, 1, 1);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    level: game.level.id,
    courses: game.traversalCourses.length,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
