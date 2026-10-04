import * as THREE from "three";
import { supportAt } from "../src/character-motion.js";
import { updateAtmosphere } from "../src/atmosphere.js";

export function bellRackView(game, stage, view = "front", quality = "high") {
  const site = game.bellSites[stage],
    c = site.root.position;
  const candidates =
    view === "door"
      ? [
          [-1.6, -2.2],
          [1.6, -2.2],
          [0, -2.2],
        ]
      : view === "platform"
        ? [
            [1.6, 2.1],
            [-1.6, 2.1],
            [1.8, 1.8],
          ]
        : view === "rear"
          ? [
              [5.5, -6],
              [-5.5, -6],
              [4.8, -4.2],
              [1.6, -2.2],
              [-1.6, -2.2],
            ]
          : view === "fittings"
            ? [
                [-1.5, 1.7],
                [-0.7, 2.1],
                [0.7, 2.1],
              ]
            : [
                [5.5, 7],
                [-5.5, 7],
                [0, 8],
                [6, 5],
              ];
  const target = c
    .clone()
    .add(
      new THREE.Vector3(
        view === "fittings" ? -1.5 : 0,
        view === "fittings" ? 4.15 : 2.45,
        view === "door" ? 3 : view === "fittings" ? 0.1 : -0.65,
      ),
    );
  let eye;
  for (const [dx, dz] of candidates) {
    const x = c.x + dx,
      z = c.z + dz,
      feet = supportAt(game, x, z).height;
    if (
      ![-0.35, 0, 0.35].every((ox) =>
        [-0.35, 0, 0.35].every((oz) =>
          game.canMove(
            x + ox,
            z + oz,
            feet - game.groundHeight(x + ox, z + oz),
          ),
        ),
      )
    )
      continue;
    const p = new THREE.Vector3(x, feet + 2.05, z);
    if (game.cameraSurfaces.entry(p, target, 0) < 0.99) continue;
    eye = p;
    break;
  }
  if (!eye) return { stage, view, blocked: true };
  game.player.position.set(eye.x, eye.y - 2.05, eye.z);
  game.store.data.settings.quality = quality;
  game.applySettings();
  game.updateDecorations(0);
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = view === "fittings" ? 63 : view === "platform" ? 82 : 64;
  game.camera.updateProjectionMatrix();
  game.camera.updateMatrixWorld();
  updateAtmosphere(game, c);
  const visible = game.avatar.visible;
  game.avatar.visible = false;
  game.renderScene(0);
  game.renderScene(0);
  const image = game.renderer.domElement.toDataURL("image/png");
  game.avatar.visible = visible;
  const gl = game.renderer.getContext();
  return {
    stage,
    view,
    quality,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    image,
  };
}
