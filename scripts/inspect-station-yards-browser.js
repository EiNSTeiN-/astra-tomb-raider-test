import * as THREE from "three";
import { prepareStation } from "./inspect-field-stations-browser.js";
import { supportAt, safeArrival } from "../src/character-motion.js";
import { updateAtmosphere } from "../src/atmosphere.js";

export function inspectStationYards(game) {
  const all = game.obstacles,
    old = all.filter((o) => !o.stationYard),
    routes = [];
  const points = new Map();
  for (const path of game.map.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        dx = (b.x - a.x) * 7,
        dz = (b.z - a.z) * 7,
        length = Math.hypot(dx, dz);
      if (length < 1e-8) continue;
      for (let j = 0; j <= Math.ceil(length / 0.5); j++)
        for (const offset of [-1.2, 0, 1.2]) {
          const t = j / Math.ceil(length / 0.5),
            x = a.x * 7 + dx * t - (dz / length) * offset,
            z = a.z * 7 + dz * t + (dx / length) * offset;
          if (
            !game.stationYards.some(
              (y) =>
                Math.abs(x - y.root.position.x) < 13 &&
                Math.abs(z - y.root.position.z) < 13,
            )
          )
            continue;
          points.set(`${x.toFixed(3)},${z.toFixed(3)}`, { x, z });
        }
    }
  try {
    game.obstacles = old;
    for (const p of points.values())
      if (game.canMove(p.x, p.z, 0)) routes.push(p);
  } finally {
    game.obstacles = all;
  }
  const blocked = routes.filter((p) => !game.canMove(p.x, p.z, 0));
  const yards = game.stationYards.map((y) => {
    const arrivals = [];
    for (const p of y.pieces) {
      const oldPosition = {
        x: y.root.position.x + p.x,
        y: game.groundHeight(y.root.position.x + p.x, y.root.position.z + p.z),
        z: y.root.position.z + p.z,
      };
      const arrival = safeArrival(game, oldPosition);
      arrivals.push({
        kind: p.kind,
        clear:
          !!arrival &&
          game.canMove(
            arrival.x,
            arrival.z,
            arrival.y - game.groundHeight(arrival.x, arrival.z),
          ),
        distance: arrival
          ? Math.hypot(arrival.x - oldPosition.x, arrival.z - oldPosition.z)
          : null,
      });
    }
    return {
      id: y.id,
      modules: y.modules,
      pieces: y.pieces,
      pavers: y.paving.length,
      arrivals,
    };
  });
  return { level: game.level.id, routes: routes.length, blocked, yards };
}

export function stationYardView(
  game,
  id,
  { rear = false, quality = "high", piece = null } = {},
) {
  const f = game.items.find((f) => f.id === id),
    target = f.group.position.clone().add(new THREE.Vector3(0, 2.65, 0));
  let bearing = 0;
  if (piece !== null) {
    const p = f.yard.pieces[piece];
    target
      .copy(f.yard.root.position)
      .add(new THREE.Vector3(p.x, p.ground + p.h * 0.55, p.z));
    if (p.d > p.w) bearing = Math.PI / 2;
  }
  prepareStation(game, f);
  game.progress.torch = false;
  let eye;
  search: for (const radius of piece !== null
    ? [4, 5, 6]
    : [17, 15, 20, 13, 11])
    for (const offset of rear
      ? [2.7, 3.6, 2.4, 3.9]
      : [0.45, -0.45, 0.2, -0.2]) {
      const angle = bearing + offset;
      const x = target.x + Math.sin(angle) * radius,
        z = target.z + Math.cos(angle) * radius;
      const y = supportAt(game, x, z, f.group.position.y + 0.3).height;
      if (!game.canMove(x, z, y - game.groundHeight(x, z))) continue;
      const p = new THREE.Vector3(x, y + 2.1, z);
      let terrainClear = true;
      const steps = Math.ceil(p.distanceTo(target) / 0.2);
      for (let i = 1; i < steps; i++) {
        const sample = p.clone().lerp(target, i / steps);
        if (sample.y < game.groundHeight(sample.x, sample.z) + 0.06) {
          terrainClear = false;
          break;
        }
      }
      if (!terrainClear) continue;
      const limit = piece !== null ? 1 - 0.75 / p.distanceTo(target) : 0.98;
      if (game.cameraSurfaces.entry(p, target, 0) < limit) continue;
      eye = p;
      break search;
    }
  if (!eye) return { id, rear, blocked: true };
  game.player.position.copy(eye).y -= 2.1;
  game.avatar.visible = false;
  game.store.data.settings.quality = quality;
  game.applySettings();
  game.updateDecorations(0);
  game.camera.position.copy(eye);
  game.camera.lookAt(target);
  game.camera.fov = 58;
  game.camera.updateProjectionMatrix();
  updateAtmosphere(game, target);
  game.renderScene(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    id,
    rear,
    quality,
    piece,
    eye: eye.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
