import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import { resetDiving } from "../src/diving.js";
import { galleryAt, galleryClear } from "../src/sunken-gallery-layout.js";
import {
  buildSunkenGallery,
  updateSunkenGallery,
  galleryInteract,
  captureGallery,
  restoreGalleryArrival,
} from "../src/sunken-gallery.js";
import { normalizeGallery } from "../src/sunken-gallery-record.js";
import { cutTerrainGeometry } from "../src/terrain-cut.js";
import { normalizeSave, defaults } from "../src/storage.js";
import { createWaterSurface } from "../src/water-surface.js";
import { buildSoundLandmarks } from "../src/sound-landmarks.js";
import {
  beginGalleryWheel,
  canUseGalleryWheel,
  advanceGalleryWheel,
} from "../src/gallery-wheel.js";

export function galleryGame(savedGallery = null) {
  const level = LEVELS[3],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const game = {
    level,
    map,
    terrainProfile,
    groundHeight: terrainProfile.height,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    world: new THREE.Group(),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    soundSources: [],
    obstacles: [],
    keys: new Set(),
    elapsed: 0,
    stamina: 100,
    yaw: 0,
    health: 100,
    paused: false,
    progress: { gallery: normalizeGallery(savedGallery) },
    audio: { tone() {}, noiseHit() {} },
    cb: { toast() {}, update() {} },
    save() {
      captureGallery(this);
    },
    state() {
      return {};
    },
    damage() {
      this.health--;
    },
    tryClimb() {
      return false;
    },
  };
  game.waterMeshes = terrainProfile.waters.map((site) => {
    const m = new THREE.Mesh();
    m.position.set(site.x, site.baseY, site.z);
    Object.assign(m.userData, site);
    return m;
  });
  game.canMove = Adventure.prototype.canMove.bind(game);
  game.walkable = Adventure.prototype.walkable.bind(game);
  resetDiving(game);
  buildSunkenGallery(game);
  return game;
}

export function galleryStep(
  game,
  seconds,
  input = { x: 0, z: 0 },
  rise = false,
) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    game.elapsed += 1 / 60;
    advanceSwimming(game, input, 1 / 60, rise);
    updateSunkenGallery(game, 1 / 60);
  }
}

export function swimTo(game, x, y, z) {
  const origin = game.terrainProfile.gallery.origin,
    target = new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z);
  for (let i = 0; i < 1500; i++) {
    const delta = target.clone().sub(game.player.position);
    if (delta.length() < 0.16) return;
    const distance = Math.hypot(delta.x, delta.z);
    game.keys.clear();
    if (delta.y < -0.08) game.keys.add("KeyX");
    const moving = distance > 0.07;
    galleryStep(
      game,
      1 / 60,
      {
        x: moving ? delta.x / Math.max(1, distance) : 0,
        z: moving ? delta.z / Math.max(1, distance) : 0,
      },
      delta.y > 0.08,
    );
  }
  assert.fail(
    `Blocked toward (${x},${y},${z}) at ${game.player.position.clone().sub(new THREE.Vector3().copy(origin)).toArray()}`,
  );
}

test("the memorial vault blocks ascent at its visible surface and leaves room to swim below", () => {
  const g = galleryGame({ opened: true }),
    o = g.terrainProfile.gallery.origin;
  g.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const z of [44.7, 46.8, 49])
    for (const x of [-5, -3.5, -1.5, 0, 1.5, 3.5, 5]) {
      ray.set(
        new THREE.Vector3(o.x - 8 + x, o.y - 7.9, o.z + z),
        new THREE.Vector3(0, 1, 0),
      );
      const hit = ray.intersectObject(g.world, true)[0];
      assert(hit, `missing roof at ${x},${z}`);
      assert(
        hit.point.y < o.y - 3.25 && hit.point.y > o.y - 4.5,
        "vault stays beneath the courtyard",
      );
      assert.equal(
        galleryClear(
          g,
          hit.point.x,
          hit.point.y - 0.06,
          hit.point.z,
          0.1,
          0.02,
        ),
        false,
        `ascent must meet the visible stone at ${x},${z}`,
      );
      assert.equal(
        galleryClear(g, hit.point.x, hit.point.y - 0.6, hit.point.z, 0.1, 0.02),
        true,
        `clear water below the stone at ${x},${z}`,
      );
    }
  assert.equal(
    galleryClear(g, o.x - 8, o.y - 4.8, o.z + 49.65),
    false,
    "lamp has collision",
  );
  assert.equal(
    galleryClear(g, o.x - 8, o.y - 7.2, o.z + 48.5),
    true,
    "record approach remains clear",
  );
  assert.equal(
    galleryClear(g, o.x - 8, o.y - 5.8, o.z + 52.1),
    false,
    "carving has collision",
  );
});

test("terrain subtraction opens bank triangles, keeps the upper surface, and interpolates attributes", () => {
  const plane = new THREE.PlaneGeometry(6, 6, 1, 1),
    box = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  const cut = cutTerrainGeometry(plane, [
    box,
    { min: { x: 0, y: -1, z: -1 }, max: { x: 2, y: 1, z: 1 } },
  ]);
  let area = 0;
  const p = cut.attributes.position,
    uv = cut.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const triangleArea = b.sub(a).cross(c.sub(a)).length() / 2;
    assert(triangleArea > 1e-8);
    area += triangleArea;
  }
  assert(Math.abs(area - 30) < 1e-5, `area ${area}`);
  for (let i = 0; i < p.count; i++) {
    assert(Math.abs(uv.getX(i) - (p.getX(i) / 6 + 0.5)) < 1e-6);
    assert(Math.abs(uv.getY(i) - (p.getY(i) / 6 + 0.5)) < 1e-6);
  }
  const upper = plane.clone().translate(0, 0, 2);
  assert.equal(cutTerrainGeometry(upper, [box]), upper);
  const touching = cutTerrainGeometry(plane, [
    { min: { x: -2, y: -2, z: 0 }, max: { x: 2, y: 2, z: 1 } },
  ]);
  assert.equal(
    touching.attributes.position.count,
    6,
    "coplanar boundaries retain the original two triangles",
  );
  for (const g of [plane, cut, upper, touching]) g.dispose();
});

test("the memorial route crosses the bank, breathes in both bells, opens both gates and returns with its record", () => {
  const g = galleryGame(),
    o = g.terrainProfile.gallery.origin;
  g.player.position.set(o.x, o.y - 0.38, o.z);
  g.swimming = true;
  g.grounded = false;
  for (const point of [
    [0, -3.5, 0],
    [-4, -3.5, 0],
    [-29, -3.5, 0],
    [-29, -5.35, 5],
    [-29, -5.35, 12],
    [-29, -3.18, 12],
  ])
    swimTo(g, ...point);
  galleryStep(g, 0.3, undefined, true);
  assert.equal(g.diving, false);
  assert.equal(g.progress.gallery.rest, "bell-a");
  g.keys.clear();
  galleryStep(g, 4);
  assert.equal(g.diveAir, 32);
  for (const point of [
    [-29, -5.35, 12],
    [-29, -5.35, 18],
    [-29, -4.1, 20],
    [-29, -4.1, 24],
    [-29, -6.3, 24],
    [-29, -6.3, 30],
    [-29, -6.3, 34],
    [-8, -6.3, 34],
    [-8, -3.18, 34],
  ])
    swimTo(g, ...point);
  galleryStep(g, 0.3, undefined, true);
  assert.equal(g.diving, false);
  assert.equal(g.progress.gallery.rest, "bell-b");
  g.keys.clear();
  galleryStep(g, 4);
  assert.equal(g.diveAir, 32);
  const gate = g.terrainProfile.gallery.gates[0];
  assert.equal(galleryClear(g, gate.x, gate.y + 2, gate.z), false);
  for (const point of [
    [-8, -5.8, 34],
    [-4.5, -5.8, 33.7],
  ])
    swimTo(g, ...point);
  assert.equal(galleryInteract(g), true);
  assert(g.sunkenGallery.operation);
  assert.equal(
    g.progress.gallery.opened,
    false,
    "the wheel must finish turning",
  );
  g.keys.clear();
  galleryStep(g, 2);
  assert.equal(g.progress.gallery.opened, true);
  assert.equal(galleryClear(g, gate.x, gate.y + 2, gate.z), true);
  for (const point of [
    [-8, -6.3, 36],
    [-8, -6.3, 44],
    [-8, -7.2, 48.5],
  ])
    swimTo(g, ...point);
  assert.equal(galleryInteract(g), true);
  assert.equal(g.progress.gallery.recovered, true);
  for (const point of [
    [-8, -5.35, 38],
    [-8, -5.35, 34],
    [-8, -3.18, 34],
  ])
    swimTo(g, ...point);
  g.keys.clear();
  galleryStep(g, 0.3, undefined, true);
  galleryStep(g, 4);
  for (const point of [
    [-8, -5.35, 34],
    [-7, -5.35, 30],
    [-7, -5.35, 3],
    [-7, -3.5, 0],
    [0, -3.5, 0],
    [0, -0.38, 0],
  ])
    swimTo(g, ...point);
  galleryStep(g, 0.3, undefined, true);
  assert.equal(g.diving, false);
  assert.equal(g.health, 100);
  captureGallery(g);
  assert.equal(g.progress.gallery.resume, false);
});

test("interior collision retains the courtyard above, air-bell walls and ceiling, and saved recovery anchors", () => {
  const g = galleryGame(),
    b = g.terrainProfile.gallery.bells[0];
  assert(galleryAt(g, b.x, b.y - 0.38, b.z));
  assert.equal(galleryAt(g, b.x, g.groundHeight(b.x, b.z), b.z), null);
  assert.equal(galleryClear(g, b.x + b.radius, b.y - 0.38, b.z), false);
  assert.equal(galleryClear(g, b.x, b.ceiling - 0.2, b.z), false);
  assert.equal(galleryClear(g, b.x + b.radius, b.rim - 1, b.z), true);
  g.progress.gallery = {
    ...normalizeGallery(null),
    rest: "bell-a",
    resume: true,
    opened: true,
    recovered: true,
  };
  restoreWaterArrival(g);
  restoreGalleryArrival(g);
  assert.equal(g.player.position.y, b.y - 0.38);
  assert.equal(g.diving, false);
  assert.equal(g.diveAir, 32);
  const data = defaults();
  data.levels.tides = {
    gallery: {
      ...g.progress.gallery,
      visited: ["entrance", "bogus", "entrance"],
    },
  };
  data.levels.verdant = { gallery: g.progress.gallery };
  const normalized = normalizeSave(data);
  assert.deepEqual(normalized.levels.tides.gallery.visited, ["entrance"]);
  assert.equal(normalized.levels.verdant.gallery, null);
  assert.deepEqual(normalizeSave(normalized).levels, normalized.levels);
});

test("the coastal sea is cut out of buried rooms and remains compatible with sound landmarks", () => {
  const g = galleryGame();
  g.waterMeshes = [];
  const sea = createWaterSurface(g, {
    id: "sea",
    kind: "water",
    sea: true,
    x: 213.5,
    z: 213.5,
    width: 1281,
    length: 1281,
    baseY: -2.3,
  });
  sea.updateMatrixWorld(true);
  const geometry = sea.geometry,
    positions = geometry.attributes.position;
  assert.equal(geometry.index, null);
  assert.equal(geometry.attributes.bedHeight.count, positions.count);
  let area = 0;
  for (let i = 0; i < positions.count; i += 3) {
    const points = [0, 1, 2].map((n) =>
      new THREE.Vector3()
        .fromBufferAttribute(positions, i + n)
        .applyMatrix4(sea.matrixWorld),
    );
    const center = points
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .multiplyScalar(1 / 3);
    for (const room of g.terrainProfile.gallery.volumes)
      assert(
        !(
          center.x > room.min.x + 1e-4 &&
          center.x < room.max.x - 1e-4 &&
          center.z > room.min.z + 1e-4 &&
          center.z < room.max.z - 1e-4 &&
          center.y > room.min.y &&
          center.y < room.max.y
        ),
        room.id,
      );
    area +=
      points[1].sub(points[0]).cross(points[2].sub(points[0])).length() / 2;
  }
  assert(area > 1281 ** 2 - 1500 && area < 1281 ** 2 - 100);
  g.map = { rooms: [] };
  g.flames = g.items = [];
  assert.doesNotThrow(() => buildSoundLandmarks(g));
  assert.equal(g.soundSources.length, 0, "the sea is not a small pool emitter");
});

test("air-bell skirts obstruct sound above the rim, and gate drives follow motion and pause", () => {
  const g = galleryGame(),
    b = g.terrainProfile.gallery.bells[0];
  g.lineOfSight = Adventure.prototype.lineOfSight.bind(g);
  const ray = (y) =>
    g.lineOfSight(
      new THREE.Vector3(b.x, y - 1.4, b.z),
      new THREE.Vector3(b.x + 4.5, y - 1.4, b.z),
    );
  assert.equal(ray(b.y + 0.2), false);
  assert.equal(ray(b.rim - 0.5), true);
  g.progress.gallery.opened = true;
  updateSunkenGallery(g, 0.5, false);
  for (const gate of g.sunkenGallery.gates) {
    assert(gate.source.activity > 0 && gate.source.activity <= 1);
    assert.equal(gate.source.y, gate.pinions[1].group.position.y);
    assert.equal(gate.source.x, gate.pinions[1].group.position.x);
    assert.equal(gate.source.z, gate.pinions[1].group.position.z);
  }
  g.paused = true;
  updateSunkenGallery(g, 0, false);
  assert(g.sunkenGallery.gates.every((gate) => gate.source.activity === 0));
  g.paused = false;
  updateSunkenGallery(g, 3, false);
  assert(g.sunkenGallery.gates.every((gate) => gate.source.activity === 0));
});

test("gallery gates retract below their floors, preserve passage clearance and reload at their stops", () => {
  const g = galleryGame();
  const inspect = (opened) => {
    g.sunkenGallery.root.updateMatrixWorld(true);
    for (const gate of g.sunkenGallery.gates) {
      const { site } = gate,
        bounds = new THREE.Box3().setFromObject(gate.group);
      assert(
        bounds.max.y <= site.y + site.height + 0.01,
        "bars never rise through the roof",
      );
      if (opened) {
        assert(bounds.max.y < site.y - 0.6, "bars stow beneath the threshold");
        assert(gate.box.max.y < site.y, "collision stows with the gate");
      }
      for (let y = site.y + 0.4; y < site.y + site.height - 0.85; y += 0.35)
        assert.equal(
          galleryClear(g, site.x, y, site.z),
          opened,
          `${site.id} at ${y}`,
        );
    }
  };
  inspect(false);
  const bearings = g.sunkenGallery.gates.map((gate) =>
    gate.pinions.map((p) => p.group.position.clone()),
  );
  g.progress.gallery.opened = true;
  for (let i = 0; i < 120; i++) {
    updateSunkenGallery(g, 1 / 60, false);
    for (const [index, gate] of g.sunkenGallery.gates.entries()) {
      assert(gate.box.max.y <= gate.site.y + gate.site.height);
      for (const [side, pinion] of gate.pinions.entries())
        assert(
          pinion.group.position.equals(bearings[index][side]),
          "drive bearings stay seated",
        );
    }
  }
  inspect(true);
  const resumed = galleryGame({ opened: true });
  for (const [i, gate] of resumed.sunkenGallery.gates.entries()) {
    assert(gate.group.position.equals(g.sunkenGallery.gates[i].group.position));
    assert.deepEqual(gate.box, g.sunkenGallery.gates[i].box);
    assert.equal(gate.group.visible, false);
    assert.equal(gate.source.activity, 0);
  }
});

test("exhausted air retains descent control beneath a ceiling and first-entry reload returns to open water", () => {
  const g = galleryGame(),
    o = g.terrainProfile.gallery.origin;
  g.player.position.set(o.x - 20, o.y - 3.5, o.z);
  g.swimming = g.diving = true;
  g.diveAir = 0;
  g.diveRecovery = true;
  g.keys.add("KeyX");
  const height = g.player.position.y;
  galleryStep(g, 0.1);
  assert(g.player.position.y < height - 0.25);
  assert(g.health < 100);
  captureGallery(g);
  assert.equal(g.progress.gallery.rest, "entry");
  assert.equal(g.progress.gallery.resume, true);
  restoreWaterArrival(g);
  restoreGalleryArrival(g);
  assert.equal(g.player.position.y, g.sunkenGallery.well.position.y - 0.38);
  assert.equal(g.diving, false);
  assert.equal(g.diveAir, 32);
  // Building the next world must not observe a previous chapter's old player.
  g.progress.gallery = normalizeGallery(null);
  const bell = g.terrainProfile.gallery.bells[0];
  g.player.position.set(bell.x, bell.y - 0.38, bell.z);
  buildSunkenGallery(g);
  assert.deepEqual(g.progress.gallery, normalizeGallery(null));
});

test("wheel operation checks its approach, consumes air, freezes on pause and saves only the completed turn", () => {
  const g = galleryGame(),
    w = g.sunkenGallery.profile.wheel;
  g.swimming = g.diving = true;
  g.player.position.set(w.x, w.y, w.z + 1);
  assert.equal(
    canUseGalleryWheel(g),
    false,
    "cannot operate through the pedestal back",
  );
  g.player.position.set(w.x - 0.95, w.y + 1.2, w.z - 0.6);
  assert(
    galleryClear(g, ...g.player.position.toArray()),
    "approach starts in clear water",
  );
  assert.equal(
    canUseGalleryWheel(g),
    false,
    "the skirt blocks the path to the wheel",
  );
  g.player.position.set(w.x, w.y, w.z - 2);
  assert(canUseGalleryWheel(g));
  g.progress.gallery.rest = "bell-b";
  let writes = 0;
  g.save = () => {
    writes++;
    captureGallery(g);
  };
  assert(beginGalleryWheel(g));
  for (let i = 0; i < 45; i++) {
    const before = g.player.position.clone();
    galleryStep(g, 1 / 60);
    assert(
      g.player.position.distanceTo(before) <= 3.1 / 60 + 1e-8,
      "alignment respects swimming speed",
    );
    assert(galleryClear(g, ...g.player.position.toArray()));
  }
  assert.equal(g.progress.gallery.opened, false);
  assert.equal(writes, 0);
  assert(
    g.diveAir < 31.3 && g.diveAir > 31.2,
    "turning consumes the normal air reserve",
  );
  captureGallery(g);
  const interrupted = galleryGame(g.progress.gallery);
  restoreGalleryArrival(interrupted);
  assert.equal(interrupted.progress.gallery.opened, false);
  assert.equal(interrupted.sunkenGallery.operation, undefined);
  assert.equal(interrupted.diving, false);
  assert.equal(interrupted.diveAir, 32);
  g.paused = true;
  const time = g.sunkenGallery.operation.time,
    angle = g.sunkenGallery.wheel.rotation.z;
  advanceGalleryWheel(g, 10, { x: 0, z: 0 }, false);
  updateSunkenGallery(g, 10, false);
  assert.equal(g.sunkenGallery.operation.time, time);
  assert.equal(g.sunkenGallery.wheel.rotation.z, angle);
  assert.equal(g.sunkenGallery.lift, 0);
  g.paused = false;
  galleryStep(g, 1);
  assert.equal(g.progress.gallery.opened, true);
  assert.equal(writes, 1);
  g.paused = true;
  const lift = g.sunkenGallery.lift;
  updateSunkenGallery(g, 10, false);
  assert.equal(g.sunkenGallery.lift, lift, "gate travel also freezes on pause");
  const completed = galleryGame(g.progress.gallery);
  assert(
    completed.sunkenGallery.gates.every((gate) => gate.box.max.y < gate.site.y),
  );
  assert.equal(completed.sunkenGallery.operation, undefined);
});

test("movement and descent release the wheel, and a diving reset discards transient interaction", () => {
  const g = galleryGame(),
    w = g.sunkenGallery.profile.wheel;
  const start = () => {
    g.swimming = g.diving = true;
    g.keys.clear();
    g.player.position.set(w.x, w.y, w.z - 1.3);
    updateSunkenGallery(g, 10, false);
    assert(beginGalleryWheel(g));
    galleryStep(g, 0.65);
    assert(g.sunkenGallery.operation.turn > 0);
  };
  start();
  const before = g.player.position.clone();
  galleryStep(g, 1 / 60, { x: 0, z: -1 });
  assert.equal(g.sunkenGallery.operation, null);
  assert(
    g.player.position.z < before.z,
    "movement responds on the cancellation frame",
  );
  assert.equal(g.progress.gallery.opened, false);
  start();
  g.keys.add("KeyX");
  galleryStep(g, 1 / 60);
  assert.equal(g.sunkenGallery.operation, null);
  assert.equal(g.progress.gallery.opened, false);
  start();
  resetDiving(g);
  assert.equal(g.sunkenGallery.operation, null);
  assert.equal(g.progress.gallery.opened, false);
});
