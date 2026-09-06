import * as THREE from "three";
import { LEVELS } from "../src/campaign.js";
import { TILE } from "../src/counterweight-rules.js";
import {
  counterweightInteract,
  releaseCounterweight,
  updateCounterweightGrip,
  counterweightsReady,
} from "../src/counterweights.js";
import { advanceCharacter } from "../src/character-motion.js";
import { solveCounterweights } from "./solve-counterweights.js";

// Development-assisted integration check. Opens the already-tested field gate,
// then walks between every stone face using the real world collision/terrain.
export async function verifyCounterweights(indices) {
  const game = window.__vesper.game,
    results = [];
  for (const index of indices) {
    game.load(LEVELS[index], index);
    game.renderer.setAnimationLoop(null);
    await game.visualsReady;
    game.setPaused(true);
    game.progress.stage = 0;
    game.progress.field = [
      ...new Set([
        ...game.progress.field,
        "field-0-0",
        "field-0-1",
        "field-0-2",
      ]),
    ];
    game.resetCounterweights();
    game.updateDecorations(10);
    const chamber = game.counterweights,
      solution = solveCounterweights(chamber.trial);
    if (!solution) throw new Error(`No solution: ${game.level.id}`);
    const point = (cell) => {
      const p = chamber.group.position
        .clone()
        .add(new THREE.Vector3((cell[0] - 2) * TILE, 0, (cell[1] - 2) * TILE));
      p.y = game.groundHeight(p.x, p.z);
      return p;
    };
    const walk = (target) => {
      for (let tick = 0; tick < 600; tick++) {
        const delta = target.clone().sub(game.player.position);
        delta.y = 0;
        if (delta.length() < 0.035) return;
        const distance = delta.length();
        delta.normalize().multiplyScalar(Math.min(3.8, distance * 60));
        advanceCharacter(game, delta, 1 / 60);
      }
      throw new Error(
        `${game.level.id}: blocked walking to ${target.toArray()} from ${game.player.position.toArray()}`,
      );
    };
    for (const action of solution.path) {
      for (const cell of action.walking) walk(point(cell));
      const target = point(chamber.saved.positions[action.index]).add(
        new THREE.Vector3(-action.axis[0] * 1.25, 0, -action.axis[1] * 1.25),
      );
      walk(target);
      if (
        !counterweightInteract(game) ||
        game.blockGrip?.block.index !== action.index
      )
        throw new Error(`${game.level.id}: cannot grip stone ${action.index}`);
      const previous = chamber.saved.moves;
      for (let tick = 0; tick < 60 && chamber.saved.moves === previous; tick++)
        updateCounterweightGrip(game, 1 / 60, action.pull ? -1 : 1);
      if (chamber.saved.moves !== previous + 1)
        throw new Error(
          `${game.level.id}: stone cannot move ${JSON.stringify(action)}`,
        );
      releaseCounterweight(game);
    }
    game.updateDecorations(2);
    game.yaw = 0;
    game.pitch = 0.42;
    game.updateCamera(1);
    game.renderScene();
    if (!counterweightsReady(game, chamber.feature))
      throw new Error(`${game.level.id}: mechanism remains locked`);
    results.push({
      chapter: game.level.id,
      moves: chamber.saved.moves,
      solved: chamber.saved.solved,
      positions: chamber.saved.positions,
    });
  }
  return results;
}
