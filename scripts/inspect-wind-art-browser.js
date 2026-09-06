import * as THREE from "three";

export function windArtView(game, view = "bearing") {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const site = game.windSites[4];
  game.player.position.copy(site.tablet.group.position);
  game.elapsed = 10;
  game.updateDecorations(1);
  game.world.updateMatrixWorld(true);
  game.camera.fov = 58;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  if (view === "bearing" || view === "wheel") {
    const text = view === "bearing" ? "B2 · FIXED" : "A1";
    const label = site.rendering.labels.sources.find(
      (o) => o.userData.windLabel === text,
    );
    const p = label.getWorldPosition(new THREE.Vector3());
    game.camera.position.copy(p).add(new THREE.Vector3(0.25, 0.32, 1.8));
    game.camera.lookAt(p.x, p.y + 0.17, p.z);
  } else {
    const c = site.root.position;
    game.camera.position.set(c.x - 10, c.y + site.airHeight + 5, c.z + 26);
    game.camera.lookAt(c.x, c.y + site.airHeight - 1, c.z + 14);
  }
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    quality: game.store.data.settings.quality,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    camera: game.camera.position.toArray(),
  };
}
