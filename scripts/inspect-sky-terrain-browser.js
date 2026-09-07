import { spanCoordinates } from "../src/sky-bridge-rules.js";
import { skyBridgeArtView } from "./inspect-sky-bridge-art-browser.js";

export function skyTerrainView(game, view = "ravine", index = 4) {
  skyBridgeArtView(game, "span", index);
  const bridge = game.skyBridges[index];
  const c = spanCoordinates(bridge, bridge.bx, bridge.bz);
  const at = (along, across, y) => [
    bridge.ax + c.ux * along + c.uz * across,
    bridge.ay + y,
    bridge.az + c.uz * along - c.ux * across,
  ];
  if (view === "cliff") {
    game.camera.position.set(...at(12, 0, 1.8));
    game.camera.lookAt(...at(-1, 8, -6));
  }
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    view,
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    terrainMeshes: game.terrainMeshes.length,
    terrainTriangles: game.terrainMeshes.reduce(
      (n, m) => n + m.geometry.index.count / 3,
      0,
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
