import * as THREE from "three";
import { updateHydraulicCourts } from "../src/hydraulic-courts.js";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";

export function hydraulicView(game, stage = 1) {
  const site = game.hydraulicSites[stage],
    c = site.root.position;
  game.player.position.set(
    c.x + 4,
    game.groundHeight(c.x + 4, c.z + 23.4),
    c.z + 23.4,
  );
  game.updateDecorations(0);
  game.camera.position.set(c.x + 16, c.y + 13, c.z + 42);
  game.camera.lookAt(c.x, c.y + 2, c.z + 19.5);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
  };
}
export function inspectHydraulics(game) {
  const gl = game.renderer.getContext();
  return {
    courts: game.hydraulicSites.length,
    tanks: game.hydraulicSites.reduce((n, s) => n + s.tanks.length, 0),
    controls: game.items
      .filter((f) => f.type === "hydraulic")
      .map((f) => ({
        id: f.id,
        clear: [-0.12, 0, 0.12].every((dx) =>
          [-0.12, 0, 0.12].every((dz) =>
            game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0),
          ),
        ),
      })),
    pumps: game.hydraulicSites.flatMap((s) =>
      s.tanks.map((t) => ({
        id: t.pump.id,
        clear: game.lineOfSight(
          t.control.group.position,
          new THREE.Vector3(t.pump.x, t.pump.y - 1.4, t.pump.z),
        ),
      })),
    ),
    anchors: game.hydraulicSites.flatMap((s) =>
      s.tanks.map((t) => ({
        id: t.control.id,
        attached: t.handles.every((h) => h.parent === t.wheel),
      })),
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    camera: game.cameraSurfaces.count,
  };
}
// Assisted local circulation between the tablet and all three pumps, using real physics.
export function walkHydraulicCourts(game) {
  const saved = {
    position: game.player.position.clone(),
    stage: game.progress.stage,
    completed: game.progress.completed,
    hydraulics: game.hydraulicSites.map((site) => ({
      state: structuredClone(site.state),
      display: [...site.display],
      flow: site.flow ? structuredClone(site.flow) : null,
    })),
  };
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
    ].map((k) => [k, game[k]]),
  );
  const result = [];
  try {
    game.progress.completed = true;
    game.updateDecorations(100);
    for (const site of game.hydraulicSites) {
      const points = [
        site.tablet,
        ...site.tanks.map((t) => t.control),
        site.tablet,
      ].map((f) => ({ x: f.x * 7, z: f.z * 7 }));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          route = findRoute((x, z) => game.canMove(x, z, 0), a, b, {
            cell: 0.35,
            margin: 8,
            maxVisited: 16000,
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
              ) > 0.15 &&
              n++ < 800
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
            if (n >= 800) {
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
    Object.assign(game.progress, {
      stage: saved.stage,
      completed: saved.completed,
    });
    game.player.position.copy(saved.position);
    Object.assign(game, motion);
    // Preserve selected pumps and unfinished visual transfers during the review.
    game.hydraulicSites.forEach((site, i) =>
      Object.assign(site, saved.hydraulics[i]),
    );
    game.updateDecorations(0);
  }
  return result;
}
