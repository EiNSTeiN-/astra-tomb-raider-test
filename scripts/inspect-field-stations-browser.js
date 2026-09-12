// Run against disposable progress. These are assisted geometry/input checks,
// not an end-to-end chapter playthrough or a subjective graphics/audio review.
import * as THREE from "three";
import {
  safeArrival,
  advanceCharacter,
  supportAt,
} from "../src/character-motion.js";
import { resetTraversal } from "../src/traversal.js";
import { EXPEDITIONS } from "../src/expeditions.js";
import { updateFieldWorld } from "../src/field-world.js";
import { updateAtmosphere } from "../src/atmosphere.js";
import { AUDIO_SOURCES, distanceGain } from "../src/audio.js";

export function prepareStation(game, f, point) {
  resetTraversal(game);
  game.progress.stage = f.stage;
  game.progress.completed = false;
  game.progress.field = EXPEDITIONS[game.level.id]
    .slice(0, f.stage + 1)
    .flatMap((m, i) =>
      m.tasks
        .filter(
          (t) => i < f.stage || (t.id !== f.id && Number(t.id.at(-1)) < f.step),
        )
        .map((t) => t.id),
    );
  game.progress.torch = true;
  game.player.position.copy(
    point || f.group.position.clone().add(new THREE.Vector3(0, 0, 2.2)),
  );
  Object.assign(game, {
    grounded: true,
    velocityY: 0,
    health: 100,
    hitTimer: 0,
    swimming: false,
    diving: false,
    moveVelocity: null,
    elapsed: 0,
  });
  game.jumpY =
    game.player.position.y -
    game.groundHeight(game.player.position.x, game.player.position.z);
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.yaw = 0;
  game.updateDecorations(100);
  game.updatePlayer(0);
}

export function inspectFieldStations(game) {
  const records = [];
  for (const f of game.items.filter((f) => f.stationSolids)) {
    prepareStation(game, f);
    const y = f.group.position.y,
      x = f.x * 7,
      z = f.z * 7;
    const front = { x, y, z: z + 2.2 },
      clear = game.canMove(
        front.x,
        front.z,
        y - game.groundHeight(front.x, front.z),
      );
    const nearest = game.nearest?.id;
    game.interact();
    const completed = game.progress.field.includes(f.id);
    updateFieldWorld(game, 1);
    const workingClear = game.canMove(
      front.x,
      front.z,
      y - game.groundHeight(front.x, front.z),
    );
    for (let i = 0; i < 90; i++)
      advanceCharacter(game, { x: 0, z: -6 }, 1 / 60);
    const stopped = game.player.position.clone(),
      bodyClear = game.canMove(
        stopped.x,
        stopped.z,
        stopped.y - game.groundHeight(stopped.x, stopped.z),
      );
    const arrival = safeArrival(game, { x, y, z }),
      arrivalClear =
        arrival &&
        game.canMove(
          arrival.x,
          arrival.z,
          arrival.y - game.groundHeight(arrival.x, arrival.z),
        );
    const course = game.traversalCourses.find((c) => c.id === f.id);
    const frameFits =
      !course ||
      f.stationSolids.every(
        (s) =>
          s.bounds.min.x >= x - 2.5 &&
          s.bounds.max.x <= x + 2.5 &&
          s.bounds.min.z >= z - 2.5 &&
          s.bounds.max.z <= z + 2.5,
      );
    let sound;
    if (f.fire) {
      const source = game.soundSources.find((s) => s.field === f.id),
        spec = AUDIO_SOURCES[source.kind],
        listening = [];
      for (const distance of [6, 12, 18]) {
        let spot;
        for (let i = 0; i < 32; i++) {
          const a = (i * Math.PI) / 16,
            px = x + Math.sin(a) * distance,
            pz = z + Math.cos(a) * distance,
            p = new THREE.Vector3(px, game.groundHeight(px, pz), pz);
          if (
            !game.canMove(px, pz, 0) ||
            !game.lineOfSight(
              p,
              new THREE.Vector3(source.x, source.y - 1.4, source.z),
            )
          )
            continue;
          const actual = Math.hypot(
            px - source.x,
            p.y + 1.4 - source.y,
            pz - source.z,
          );
          spot = {
            position: p.toArray(),
            distance: actual,
            gain: distanceGain(
              actual,
              source.near ?? spec.near,
              source.range ?? spec.range,
            ),
          };
          break;
        }
        listening.push(spot || null);
      }
      sound = {
        id: source.id,
        attached:
          f.fire
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(new THREE.Vector3(source.x, source.y, source.z)) <
          0.001,
        lit: f.fire.visible,
        listening,
      };
    }
    records.push({
      id: f.id,
      kind: f.kind,
      elevated: !!course,
      front,
      clear,
      nearest,
      completed,
      workingClear,
      stopped: stopped.toArray(),
      bodyClear,
      arrival,
      arrivalClear,
      heightPreserved: Math.abs(arrival?.y - y) < 0.3,
      frameFits,
      solids: f.stationSolids.length,
      sound,
    });
  }
  return records;
}

export function stationView(
  game,
  id,
  { rear = false, quality = "high", completed = false, detail = false } = {},
) {
  const f = game.items.find((f) => f.id === id),
    target = f.group.position
      .clone()
      .add(new THREE.Vector3(0, detail ? 1.2 : 2.65, 0));
  prepareStation(game, f);
  if (detail) game.progress.torch = false;
  if (completed) {
    game.progress.field.push(f.id);
    updateFieldWorld(game, 10);
  }
  let eye;
  search: for (const radius of detail
    ? [2.2, 2.45]
    : f.yOffset
      ? [6, 8, 10, 2.2]
      : [6, 8, 10])
    for (const angle of rear
      ? [2.6, 3.5, 2.9, 2.0, 4.1]
      : [0.5, -0.5, 0, 1.2, -1.2]) {
      const x = target.x + Math.sin(angle) * radius,
        z = target.z + Math.cos(angle) * radius;
      const y = supportAt(game, x, z, f.group.position.y).height;
      if (!game.canMove(x, z, y - game.groundHeight(x, z))) continue;
      const p = new THREE.Vector3(x, y + 2.1, z);
      // A detail view deliberately ends on the control's surface. Only its
      // final 90 cm may meet the pictured object; earlier obstructions reject
      // the view. The observer must still occupy a clear supported position.
      const limit = detail ? 1 - 0.9 / p.distanceTo(target) : 0.98;
      if (game.cameraSurfaces.entry(p, target, 0) < limit) continue;
      eye = p;
      break search;
    }
  if (!eye) return { id, rear, quality, blocked: true };
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
    completed,
    detail,
    eye: eye.toArray(),
    target: target.toArray(),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
