// Development-only inspection; use disposable progress and a loaded snow chapter.
import * as THREE from "three";

export function inspectFirGrounding(game) {
  game.world.updateMatrixWorld(true);
  const terrain = game.terrainMeshes.map((mesh) => {
    mesh.geometry.computeBoundingBox();
    return { mesh, bounds: mesh.geometry.boundingBox };
  });
  const point = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    records = [];
  for (const [patchIndex, patch] of game.forestPatches.entries()) {
    const trunk = patch.tiers[0].find((m) => /trunk/.test(m.material.name));
    if (!trunk) continue;
    trunk.geometry.computeBoundingBox();
    const position = trunk.geometry.attributes.position,
      base = trunk.geometry.boundingBox.min.y,
      roots = [];
    for (let i = 0; i < position.count; i++)
      if (position.getY(i) < base + 0.25)
        roots.push(new THREE.Vector3().fromBufferAttribute(position, i));
    for (const [instance, matrix] of patch.matrices.entries()) {
      let highest = -Infinity,
        lowest = Infinity,
        unsupported = 0,
        walkable = 0;
      for (const root of roots) {
        point.copy(root).applyMatrix4(matrix);
        const surfaces = terrain
          .filter(
            ({ bounds: b }) =>
              point.x >= b.min.x &&
              point.x <= b.max.x &&
              point.z >= b.min.z &&
              point.z <= b.max.z,
          )
          .map((t) => t.mesh);
        ray.set(
          new THREE.Vector3(point.x, point.y + 100, point.z),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObjects(surfaces)[0];
        if (!hit) {
          unsupported++;
          continue;
        }
        const gap = point.y - hit.point.y;
        highest = Math.max(highest, gap);
        lowest = Math.min(lowest, gap);
        if (game.map.grid[Math.round(point.z / 7)]?.[Math.round(point.x / 7)])
          walkable++;
      }
      records.push({
        patchIndex,
        instance,
        material: trunk.material.name,
        position: patch.positions[instance].toArray(),
        samples: roots.length,
        highest,
        lowest,
        unsupported,
        walkable,
      });
    }
  }
  return records;
}

export function firRootView(game, record, quality = "high", angle = 0) {
  game.store.data.settings.quality = quality;
  game.applySettings();
  const [x, , z] = record.position,
    target = new THREE.Vector3(x, game.groundHeight(x, z) + 1, z);
  let eye;
  for (const r of [4, 6, 8, 10])
    for (const a of [
      angle,
      angle + 0.6,
      angle - 0.6,
      angle + 1.2,
      angle - 1.2,
      angle + Math.PI,
    ]) {
      const px = x + Math.sin(a) * r,
        pz = z + Math.cos(a) * r;
      if (!game.canMove(px, pz, 0)) continue;
      const p = new THREE.Vector3(px, game.groundHeight(px, pz) + 1.7, pz);
      if (!eye && game.cameraSurfaces.entry(p, target, 0) >= 0.99) eye = p;
    }
  if (!eye) return { blocked: true };
  game.player.position.copy(eye).setY(eye.y - 1.7);
  game.updateDecorations(0);
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.updateMatrixWorld();
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    eye: eye.toArray(),
    target: target.toArray(),
    quality,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
