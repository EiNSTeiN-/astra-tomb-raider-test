import * as THREE from "three";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

export function gateView(game, stage = 1, opened = false) {
  const gate = game.fieldGates[stage],
    c = gate.root.position;
  game.player.position.set(c.x, game.groundHeight(c.x, c.z + 15), c.z + 15);
  game.updateDecorations(0);
  if (opened) {
    gate.amount = 1;
    updateSanctuaryGate(game, gate, 0);
  }
  game.camera.position.set(c.x + 12, c.y + 10, c.z + 24);
  game.camera.lookAt(c.x, c.y + 5, c.z + 4);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    name: gate.design.name,
  };
}

// Assisted inspection. Temporary progress and gate transforms are restored without saving.
export function inspectGates(game) {
  const savedCompleted = game.progress.completed;
  const saved = game.fieldGates.map((g) => ({
    amount: g.amount,
    open: g.open,
    motion: g.motion,
  }));
  try {
    const sourcePaths = game.fieldGates.flatMap((g) =>
      g.sources.map((s) => ({
        id: s.id,
        clear: game.lineOfSight(
          new THREE.Vector3(s.x, s.y - 1.4, s.z),
          new THREE.Vector3(s.x, game.groundHeight(s.x, s.z + 5), s.z + 5),
        ),
      })),
    );
    game.progress.completed = true;
    for (const g of game.fieldGates) {
      g.amount = 1;
      updateSanctuaryGate(game, g, 0);
    }
    const thresholds = game.fieldGates.map((g) => ({
      stage: g.stage,
      clear: [-3, 0, 3].every((dx) =>
        [5.8, 6.5, 7.2].every((dz) =>
          game.canMove(g.root.position.x + dx, g.root.position.z + dz, 0),
        ),
      ),
    }));
    const approaches = game.map.features
      .filter((f) => f.type !== "guardian")
      .map((f) => {
        const course = game.traversalCourses?.find((c) => c.id === f.id),
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
      });
    const gl = game.renderer.getContext();
    return {
      gates: game.fieldGates.length,
      sources: sourcePaths,
      thresholds,
      approaches,
      camera: game.cameraSurfaces.count,
      linked: game.renderer.info.programs.every((p) =>
        gl.getProgramParameter(p.program, gl.LINK_STATUS),
      ),
    };
  } finally {
    game.progress.completed = savedCompleted;
    game.fieldGates.forEach((g, i) => {
      g.amount = saved[i].amount;
      updateSanctuaryGate(game, g, 0);
      g.motion = saved[i].motion;
    });
    updateSoundSources(game);
  }
}
