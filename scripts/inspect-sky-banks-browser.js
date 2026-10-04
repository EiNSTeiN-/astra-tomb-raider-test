// Supported bridge-level observers, looking back at each landing's shoulders.
// Disposable opened bridges establish the viewpoints, not mission completion.
import * as THREE from "three";
import {
  spanCoordinates,
  bridgeDeckY,
  skyDeckAt,
} from "../src/sky-bridge-rules.js";
import { updateAtmosphere } from "../src/atmosphere.js";

export function skyBankView(game, index, end = 0, side = 1, quality = "high") {
  const bridge = game.skyBridges[index],
    c = spanCoordinates(bridge, bridge.bx, bridge.bz),
    fromB = end === 1,
    start = fromB ? c.length : 0,
    sign = fromB ? -1 : 1,
    point = (along, across, y) =>
      new THREE.Vector3(
        bridge.ax + c.ux * along + c.uz * across,
        y,
        bridge.az + c.uz * along - c.ux * across,
      );
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  for (const span of game.skyBridges) span.open = 1;
  game.store.data.settings.quality = quality;
  game.applySettings();
  let eye;
  for (const distance of [9, 7, 11, 6]) {
    const along = start + sign * distance,
      y = bridgeDeckY(bridge, along);
    const feet = point(along, 0, y);
    const support = skyDeckAt(game, feet.x, feet.z, y + 0.1);
    if (!support || Math.abs(support.height - y) > 1e-6) continue;
    if (!game.canMove(feet.x, feet.z, y - game.groundHeight(feet.x, feet.z)))
      continue;
    const candidate = feet.clone().add(new THREE.Vector3(0, 2.1, 0));
    if (!game.cameraSpace(candidate)) continue;
    eye = candidate;
    game.player.position.copy(feet);
    break;
  }
  if (!eye) return { id: bridge.id, index, end, side, quality, blocked: true };
  const target = point(
    start - sign * 2,
    side * 10,
    (fromB ? bridge.by : bridge.ay) - 6,
  );
  game.player.visible = false;
  game.camera.fov = 62;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.elapsed = 12;
  game.updateDecorations(2);
  updateAtmosphere(game, game.player.position);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    id: bridge.id,
    index,
    end,
    side,
    quality,
    eye: eye.toArray(),
    target: target.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL(),
  };
}
