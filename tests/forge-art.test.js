import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { EXPEDITIONS } from "../src/expeditions.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";
import { Soundscape } from "../src/audio.js";
import { forgeState } from "../src/forge-state.js";
import {
  forgePlan,
  buildForgeArchitecture,
  updateForgeArchitecture,
} from "../src/forge-architecture.js";
import {
  forgeGearGeometry,
  furnaceHoodGeometry,
  furnaceFlueGeometry,
} from "../src/forge-geometry.js";
import { calderaGeometry } from "../src/forge-caldera.js";
import {
  buildSoundLandmarks,
  updateSoundSources,
} from "../src/sound-landmarks.js";
import {
  createWaterSurface,
  updateWaterSurfaces,
} from "../src/water-surface.js";

test("forge work cools, ignites, and repairs the correct machinery, including partial and legacy saves", () => {
  const progress = { stage: 0, field: [] };
  for (const stage of [0, 2, 4, 7]) {
    progress.stage = stage;
    progress.field = [];
    let heat = forgeState(progress, stage + 1).heat;
    for (const task of EXPEDITIONS.embers[stage].tasks) {
      progress.field.push(task.id);
      const next = forgeState(progress, stage + 1);
      assert.ok(next.heat < heat);
      assert.ok(next.steam > 0);
      heat = next.heat;
    }
    const complete = forgeState(progress, stage + 1);
    assert.deepEqual(
      forgeState({ stage: stage + 1, field: [] }, stage + 1),
      complete,
    );
    assert.deepEqual(
      forgeState(JSON.parse(JSON.stringify(progress)), stage + 1),
      complete,
    );
  }
  for (const stage of [1, 3, 6]) {
    const ids = EXPEDITIONS.embers[stage].tasks.map((t) => t.id);
    const initial = forgeState({ stage, field: [] }, stage + 1);
    assert.deepEqual(
      forgeState({ stage, field: ids.slice(0, 2) }, stage + 1),
      initial,
    );
    const complete = forgeState({ stage, field: ids }, stage + 1);
    if (stage === 1) assert.ok(complete.heat > initial.heat * 10);
    if (stage === 3) {
      assert.equal(initial.motion, 0);
      assert.ok(complete.motion > 0.8);
    }
    if (stage === 6) {
      assert.ok(complete.heat < initial.heat / 3);
      assert.ok(complete.steam > 0);
    }
  }
  let heat = 0;
  for (let n = 0; n <= 3; n++) {
    const next = forgeState(
      {
        stage: 5,
        field: EXPEDITIONS.embers[5].tasks.slice(0, n).map((t) => t.id),
      },
      6,
    );
    assert.ok(next.heat > heat);
    heat = next.heat;
  }
});

test("forge geometry has finite outward surfaces, open gear hubs, and hollow chimney tops", () => {
  for (const geometry of [
    forgeGearGeometry(),
    forgeGearGeometry(1.333, 10),
    furnaceHoodGeometry(),
    furnaceFlueGeometry(6),
  ]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry,
      p = g.attributes.position;
    let volume = 0;
    assert.ok(p.array.every(Number.isFinite));
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i += 3) {
      const [a, b, c] = [i, i + 1, i + 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, j),
      );
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
      volume += a.dot(b.cross(c)) / 6;
    }
    assert.ok(volume > 0, "solid has outward winding");
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  const material = new THREE.MeshStandardMaterial();
  const rim = new THREE.Mesh(forgeGearGeometry(), material),
    flue = new THREE.Mesh(furnaceFlueGeometry(6), material);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, -1),
  );
  assert.equal(
    ray.intersectObject(rim).length,
    0,
    "gear center remains open for its spokes",
  );
  ray.ray.origin.set(0, 10, 0);
  ray.ray.direction.set(0, -1, 0);
  assert.equal(
    ray.intersectObject(flue).length,
    0,
    "smoke exits through the hollow flue",
  );
  ray.ray.origin.x = 1.3;
  assert.ok(ray.intersectObject(flue).length > 0, "flue has a rim");
});

test("nine built forge halls preserve approaches and camera headroom, and share visible and audible machinery state", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[4],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    groundHeight: profile.height,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    progress: { stage: 0, field: [] },
    elapsed: 0,
    player: { position: new THREE.Vector3() },
    store: { data: { settings: { quality: "high" } } },
    flames: [],
    items: [],
    waterMeshes: [],
  });
  assert.equal(buildForgeArchitecture(game), true);
  buildSoundLandmarks(game);
  game.cameraSurfaces.rebuild();
  assert.equal(
    new Set(map.rooms.map((r) => JSON.stringify(forgePlan(r)))).size,
    9,
  );
  assert.equal(game.forgePatches.length, 9);
  assert.equal(game.forgeLights.length, 2);
  assert.equal(
    game.soundSources.filter((s) => s.forgeRoom !== undefined).length,
    45,
  );
  assert.ok(game.cameraSurfaces.count < 400);
  for (const patch of game.forgePatches) {
    const r = map.rooms[patch.index],
      x = r.x * 7,
      z = r.z * 7,
      y = profile.height(x, z);
    assert.ok(
      patch.root.children.length <= 4,
      "two material batches and two animated gears",
    );
    assert.ok(patch.triangles < 20000);
    for (const o of [...patch.plan.kilns, ...patch.plan.piers]) {
      assert.equal(game.canMove(x + o.x, z + o.z, 0), false);
      for (const f of map.features)
        assert.ok(
          Math.abs((f.x - r.x) * 7 - o.x) > o.w + 2 ||
            Math.abs((f.z - r.z) * 7 - o.z) > o.d + 2,
          `${f.id} approach`,
        );
    }
    assert.equal(game.canMove(x, z - 21, 0), true);
    assert.equal(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x, y + 2, z - 12),
        new THREE.Vector3(x, y + 2, z - 27),
      ),
      1,
    );
    assert.ok(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x - 16.5, y + 3, z - 12),
        new THREE.Vector3(x - 16.5, y + 3, z - 25),
      ) < 1,
    );
    patch.mouths.forEach((p, i) => {
      const s = game.soundSources.find(
        (s) => s.id === `furnace-${patch.index}-${i}`,
      );
      assert.deepEqual([s.x, s.y, s.z], p.toArray());
      const front = new THREE.Vector3(
        p.x,
        profile.height(p.x, p.z + 4),
        p.z + 4,
      );
      const behind = new THREE.Vector3(
        p.x,
        profile.height(p.x, p.z - 12),
        p.z - 12,
      );
      const emitter = new THREE.Vector3(p.x, p.y - 1.4, p.z);
      assert.equal(
        game.lineOfSight(front, emitter),
        true,
        "the firebox must not occlude its own mouth",
      );
      assert.equal(
        game.lineOfSight(behind, emitter),
        false,
        "the furnace back still muffles its sound",
      );
    });
  }
  const patch = game.forgePatches[1];
  game.progress.field = EXPEDITIONS.embers[0].tasks.map((t) => t.id);
  updateForgeArchitecture(game, 1);
  updateSoundSources(game);
  assert.ok(
    patch.state.heat < 1 && patch.state.heat > 0.1,
    "cooling interpolates",
  );
  assert.equal(patch.heat.value, patch.state.heat);
  assert.equal(
    game.soundSources.find((s) => s.id === "furnace-1-0").activity,
    patch.state.heat,
  );
  assert.equal(
    game.soundSources.find((s) => s.id === "coolant-1-0").activity,
    patch.state.steam,
  );
  assert.equal(
    patch.gears[1].rotation.z,
    (-patch.gears[0].rotation.z * 24) / 10 + Math.PI / 10,
  );
  const angle = patch.gears[0].rotation.z;
  updateForgeArchitecture(game, 0);
  assert.equal(
    patch.gears[0].rotation.z,
    angle,
    "zero delta leaves machinery stationary",
  );
  game.player.position.set(-500, 0, -500);
  updateForgeArchitecture(game, 1);
  assert.equal(patch.detail.visible, false);
  assert.equal(patch.effects.visible, false);
  assert.equal(patch.root.visible, true);
  assert.ok(game.forgeLights.every((l) => l.intensity === 0));
  game.level = LEVELS[0];
  assert.equal(buildForgeArchitecture(game), false);
  assert.deepEqual(game.forgeSources, []);
  assert.deepEqual(game.forgePatches, []);
  assert.equal(game.forgeTime, null);
  world.traverse((o) => o.geometry?.dispose());
});

test("cooled lava restores safe dark crust immediately while ignition work does not cool its pool", () => {
  const game = {
    level: LEVELS[4],
    progress: { stage: 0, field: [] },
    elapsed: 0,
    world: new THREE.Group(),
    waterMeshes: [],
    groundHeight: () => -1,
  };
  const water = createWaterSurface(game, {
    kind: "lava",
    x: 0,
    z: 0,
    width: 12,
    length: 10,
    baseY: 0,
    stage: 0,
  });
  const originalColor = water.material.color.getHex();
  game.progress.field = EXPEDITIONS.embers[0].tasks.map((t) => t.id);
  updateWaterSurfaces(game, 100);
  assert.equal(water.userData.cooled, true);
  assert.equal(water.material.userData.forgeUniforms.forgeHeat.value, 0);
  assert.equal(water.material.color.getHex(), originalColor);
  game.progress = { stage: 2, field: [] };
  water.userData.stage = 1;
  updateWaterSurfaces(game, 100);
  assert.equal(water.userData.cooled, false);
  assert.equal(water.material.userData.forgeUniforms.forgeHeat.value, 1);
});

test("eroded caldera stays beyond the playable square and joins smoothly at its seam", () => {
  const extent = createMap(LEVELS[4]).size * 7,
    g = calderaGeometry(extent),
    p = g.attributes.position,
    n = g.attributes.normal;
  const { segments, rings } = g.userData;
  assert.ok(p.array.every(Number.isFinite));
  assert.ok(n.array.every(Number.isFinite));
  assert.equal(g.index.count / 3, 16128);
  for (let i = 0; i < p.count; i++)
    assert.ok(
      Math.hypot(p.getX(i) - extent / 2, p.getZ(i) - extent / 2) >
        (Math.SQRT2 * extent) / 2,
    );
  for (let r = 0; r <= rings; r++)
    for (const attribute of [p, n]) {
      const a = new THREE.Vector3().fromBufferAttribute(
        attribute,
        r * (segments + 1),
      );
      const b = new THREE.Vector3().fromBufferAttribute(
        attribute,
        r * (segments + 1) + segments,
      );
      assert.ok(a.distanceTo(b) < 0.0001);
    }
  g.dispose();
});

test("all ten local forge texture maps match their archived CC0 source hashes", () => {
  const sources = JSON.parse(
    readFileSync(
      new URL("../asset-sources/forge-materials/sources.json", import.meta.url),
    ),
  );
  assert.equal(sources.length, 10);
  for (const s of sources) {
    const b = readFileSync(new URL(`../${s.file}`, import.meta.url));
    assert.equal(b.length, s.bytes);
    assert.equal(createHash("sha256").update(b).digest("hex"), s.sha256);
    assert.equal(s.license, "CC0");
  }
});

test("coolant hiss is a quiet finite band-limited signal distinct from low ridge wind", () => {
  const sound = Object.create(Soundscape.prototype);
  sound.ctx = {
    sampleRate: 48000,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        length,
        sampleRate,
        numberOfChannels: channels,
        getChannelData: (c) => data[c],
      };
    },
  };
  const analyze = (kind) => {
    const data = sound.synthetic(kind, 3).getChannelData(0);
    let power = 0,
      difference = 0,
      sum = 0,
      peak = 0;
    for (let i = 0; i < data.length; i++) {
      assert.ok(Number.isFinite(data[i]));
      power += data[i] ** 2;
      sum += data[i];
      peak = Math.max(peak, Math.abs(data[i]));
      if (i) difference += (data[i] - data[i - 1]) ** 2;
    }
    assert.ok(peak <= 0.720001); // Float32 rounding at the limiter ceiling.
    assert.ok(Math.abs(sum / data.length) < 0.02);
    const rms = Math.sqrt(power / data.length);
    assert.ok(rms > 0.07 && rms <= 0.121);
    return Math.sqrt(difference / power);
  };
  assert.ok(
    analyze("steam") > analyze("wind") * 3,
    "steam has clearly more high-frequency energy",
  );
});
