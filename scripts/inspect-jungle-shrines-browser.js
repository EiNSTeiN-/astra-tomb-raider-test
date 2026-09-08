// Development inspection on disposable progress, with the animation loop stopped.
import * as THREE from "three";
import { torchFireSource } from "/src/torch.js";
import { safeArrival } from "/src/character-motion.js";

export function inspectShrineAccess(game) {
  const results = [];
  for (const f of game.items.filter((f) => f.shrine)) {
    const x = f.group.position.x,
      z = f.group.position.z;
    game.progress.stage = f.stage;
    game.progress.field = [f.id];
    game.progress.torch = false;
    game.swimming = game.diving = false;
    const source = game.soundSources.find((s) => s.field === f.id);
    const flame = f.fire.getWorldPosition(new THREE.Vector3());
    const approaches = [];
    for (const [dx, dz] of [
      [2.2, 0],
      [-2.2, 0],
      [0, 2.2],
      [0, -2.2],
    ]) {
      game.player.position.set(
        x + dx,
        game.groundHeight(x + dx, z + dz),
        z + dz,
      );
      approaches.push({
        dx,
        dz,
        clear: game.canMove(x + dx, z + dz, 0),
        fire: torchFireSource(game)?.id,
      });
    }
    const solids = game.obstacles.filter((o) => o.shrine === f.id);
    const arrival = safeArrival(game, { x, y: game.groundHeight(x, z), z });
    game.updateDecorations(0);
    results.push({
      id: f.id,
      approaches,
      solid: solids.every((o) => !game.canMove(o.x, o.z, 0)),
      sourceError: flame.distanceTo(
        new THREE.Vector3(source.x, source.y, source.z),
      ),
      arrival,
      arrivalClear: game.canMove(
        arrival.x,
        arrival.z,
        arrival.y - game.groundHeight(arrival.x, arrival.z),
      ),
      embers: f.shrine.coals.emissiveIntensity > 0 && f.shrine.sparks.visible,
    });
  }
  return results;
}

export function observeShrineDisposal(game) {
  const geometries = new Set(),
    materials = new Set(),
    disposed = { geometries: 0, materials: 0 };
  for (const f of game.items.filter((f) => f.shrine)) {
    for (const root of [f.shrine.root, f.shrine.sparks])
      root.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
  }
  for (const g of geometries)
    g.addEventListener("dispose", () => disposed.geometries++);
  for (const m of materials)
    m.addEventListener("dispose", () => disposed.materials++);
  return {
    expected: { geometries: geometries.size, materials: materials.size },
    disposed,
  };
}
