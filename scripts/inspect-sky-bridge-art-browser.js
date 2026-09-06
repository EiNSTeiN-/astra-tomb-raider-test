import { spanCoordinates, bridgeDeckY } from "../src/sky-bridge-rules.js";

// Assisted art viewpoints; these do not measure campaign duration.
export function skyBridgeArtView(
  game,
  view = "front",
  index = 4,
  opened = true,
) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const bridge = game.skyBridges[index];
  const c = spanCoordinates(bridge, bridge.bx, bridge.bz);
  game.progress.completed = opened;
  for (const b of game.skyBridges) b.open = opened ? 1 : 0;
  game.elapsed = 10;
  game.player.position.set(
    bridge.ax - c.ux * 3,
    game.groundHeight(bridge.ax - c.ux * 3, bridge.az - c.uz * 3),
    bridge.az - c.uz * 3,
  );
  game.updateCamera(1);
  game.updateDecorations(0);
  const at = (along, across, y) => [
    bridge.ax + c.ux * along + c.uz * across,
    bridge.ay + y,
    bridge.az + c.uz * along - c.ux * across,
  ];
  const views = {
    front: [
      [-3, -1.2, 2.25],
      [18, 0, 2.1],
    ],
    anchor: [
      [2.6, 1.1, 4.3],
      [-1.2, 3.05, 4.65],
    ],
    span: [
      [c.length / 2 - 12, 22, 14],
      [c.length / 2, 0, 1],
    ],
    deck: [
      [8, -1.2, 2.1],
      [13, 1.5, -0.2],
    ],
  };
  const [eye, target] = views[view];
  game.camera.fov = view === "anchor" ? 58 : 62;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(...at(...eye));
  game.camera.lookAt(...at(...target));
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    id: bridge.id,
    open: bridge.open,
    view,
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    middleY: bridgeDeckY(bridge, c.length / 2),
  };
}
