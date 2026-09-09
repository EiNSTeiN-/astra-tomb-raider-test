import * as THREE from "three";

// Test the rendered surfaces, after batching, across the expected masonry
// connection. Front and rear samples also catch a one-sided cosmetic patch.
export function inspectCitadelSupports(game) {
  const ray = new THREE.Raycaster(),
    results = [];
  for (const [index, patch] of game.skyCitadels.entries()) {
    const room = game.map.rooms[index],
      plan = patch.plan;
    const x = room.x * 7,
      z = room.z * 7;
    let samples = 0;
    const holes = [];
    const sample = (px, y, surface) => {
      for (const side of [-1, 1]) {
        ray.set(
          new THREE.Vector3(px, y, z - 18 + side * 3),
          new THREE.Vector3(0, 0, -side),
        );
        const hit = ray.intersectObject(patch.root, true)[0];
        samples++;
        if (!hit || hit.distance > 4.2)
          holes.push({ x: px, y, z: z - 18, side, surface });
      }
    };
    if (plan.tower) {
      const tx = plan.towerSide * 14.5;
      const y =
        game.groundHeight(x + plan.towerSide * 12, z - 18) -
        0.28 +
        plan.wallHeight;
      for (let dx = -2.8; dx <= 2.81; dx += 0.4)
        for (let dy = -1.3; dy <= 0.151; dy += 0.1)
          sample(x + tx + dx, y + dy, "tower bearing");
    }
    for (const side of [-1, 1])
      if (side !== plan.breakSide) {
        const y =
          game.groundHeight(x + side * 12, z - 18) - 0.28 + plan.wallHeight;
        for (let dx = -6.9; dx <= 6.91; dx += 0.37)
          sample(x + side * 12 + dx, y - 0.045, "intact cap bearing");
      }
    results.push({ index, samples, holes });
  }
  return results;
}

export function citadelBearingView(game, index = 8, side = 1) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const room = game.map.rooms[index],
    plan = game.skyCitadels[index].plan;
  const x = room.x * 7,
    z = room.z * 7,
    tx = x + plan.towerSide * 14.5;
  const y =
    game.groundHeight(x + plan.towerSide * 12, z - 18) + plan.wallHeight - 0.28;
  game.player.position.set(tx, game.groundHeight(tx, z - 12), z - 12);
  game.elapsed = 10;
  game.updateDecorations(0);
  game.updateCamera(1);
  game.camera.fov = 50;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(tx + side * 8, y + 2.5, z - 18 + side * 16);
  game.camera.lookAt(tx, y + plan.tower * 0.35, z - 18);
  game.camera.updateMatrixWorld(true);
  game.renderScene(0);
  game.cb.update(game.state());
  const gl = game.renderer.getContext();
  return {
    index,
    side,
    quality: game.store.data.settings.quality,
    camera: game.camera.position.toArray(),
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
