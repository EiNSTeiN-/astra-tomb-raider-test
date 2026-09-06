import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";
import { pbrMaterial } from "../src/visuals.js";
import {
  buildPalaceArchitecture,
  palacePlan,
  updatePalaceArchitecture,
} from "../src/palace-architecture.js";
import {
  vaultStoneGeometry,
  flutedColumnGeometry,
  shellReliefGeometry,
  vaultCellPresent,
} from "../src/palace-geometry.js";
import { woodlandLayout, coastalPlantAllowed } from "../src/habitat.js";

function inspectSolid(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry,
    p = g.attributes.position,
    edges = new Map();
  assert.ok(p.array.every(Number.isFinite));
  assert.ok(g.attributes.normal.array.every(Number.isFinite));
  const key = (index) =>
    [p.getX(index), p.getY(index), p.getZ(index)]
      .map((x) => Math.round(x * 1e5))
      .join(",");
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(p, j),
    );
    assert.ok(
      b.clone().sub(a).cross(c.clone().sub(a)).length() > 0.000001,
      "every face has area",
    );
    volume += a.dot(b.cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const edge = [key(i + j), key(i + ((j + 1) % 3))].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok(volume > 0, "outward-facing solid encloses positive volume");
  assert.ok(
    [...edges.values()].every((count) => count === 2),
    "all solid boundaries are sealed",
  );
  if (g !== geometry) g.dispose();
}

test("vault voussoirs and fluted columns are sealed, consistently wound solids with finite nondegenerate faces", () => {
  for (const a of [0, 0.7, 1.4, 2.8]) {
    const g = vaultStoneGeometry(5.2, 6.3, a, a + 0.2, 1.4);
    inspectSolid(g);
    g.dispose();
  }
  for (const h of [3, 6.2, 12]) {
    const g = flutedColumnGeometry(h);
    inspectSolid(g);
    g.computeBoundingBox();
    assert.equal(g.boundingBox.min.y, 0);
    assert.ok(Math.abs(g.boundingBox.max.y - h) < 0.000001);
    assert.ok(g.index.count / 3 < 1500);
    g.dispose();
  }
});

test("ten palace plans keep the crossing axes and objective margins clear of their new columns", () => {
  const map = createMap(LEVELS[3]),
    plans = new Set();
  for (const r of map.rooms) {
    const plan = palacePlan(r);
    plans.add(JSON.stringify(plan));
    for (const c of plan.columns) {
      assert.ok(Math.abs(c.x) - c.width / 2 > 3);
      assert.ok(Math.abs(c.z) - c.width / 2 > 3);
      for (const f of map.features)
        assert.ok(
          Math.abs((f.x - r.x) * 7 - c.x) > c.width / 2 + 2 ||
            Math.abs((f.z - r.z) * 7 - c.z) > c.width / 2 + 2,
          `${r.index} ${f.id}: objective approach`,
        );
    }
  }
  assert.equal(plans.size, 10);
});

test("built palace preserves open arches and water banks, blocks their masonry, and seats birds on surviving stone", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[3],
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
    stoneMat: pbrMaterial("palace-stone"),
    darkMat: pbrMaterial("palace-stone"),
    player: { position: new THREE.Vector3() },
    store: { data: { settings: { quality: "high" } } },
  });
  assert.equal(buildPalaceArchitecture(game), true);
  assert.equal(
    game.stoneMat.vertexColors,
    false,
    "gameplay props retain their uncolored geometry material",
  );
  assert.equal(game.darkMat.vertexColors, false);
  game.cameraSurfaces.rebuild();
  assert.equal(game.palacePatches.length, 10);
  assert.ok(
    game.cameraSurfaces.count < 1800,
    `${game.cameraSurfaces.count} camera surfaces`,
  );
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  for (const [i, patch] of game.palacePatches.entries()) {
    const room = map.rooms[i],
      x = room.x * 7,
      z = room.z * 7,
      y = profile.height(x, z),
      spring = patch.plan.spring;
    assert.ok(patch.root.children.length <= 3, "structure batches by material");
    assert.ok(
      patch.triangles < 60000,
      `${patch.triangles} structural triangles`,
    );
    for (const [dx, dz] of [
      [0, 0],
      [0, -18],
      [-14, -14],
      [14, 14],
    ])
      assert.equal(game.canMove(x + dx, z + dz, 0), true);
    assert.equal(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x, y + 2, z - 8),
        new THREE.Vector3(x, y + 2, z - 26),
      ),
      1,
      "camera crosses central hall",
    );
    assert.ok(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x, y + spring + 6, z - 8),
        new THREE.Vector3(x, y + spring + 6, z - 15),
      ) < 1,
      "camera stops at arch crown",
    );
    if (patch.plan.damage === 0) {
      // The intact middle vault must block daylight at both radial and depth
      // joints, even where its decorative blue plaster has narrow gaps.
      for (const [dx, dz] of [
        [0, -20],
        [0.5, -18],
        [1, -16],
      ]) {
        ray.ray.origin.set(x + dx, y + 30, z + dz);
        const hit = ray.intersectObject(patch.root, true)[0];
        assert.ok(
          hit && hit.point.y > y + spring + 5,
          "mortar joint has structural backing",
        );
      }
    } else {
      const row = patch.plan.damage === 1 ? 4 : patch.plan.damage === 2 ? 1 : 3,
        dx = Math.cos((11.5 / 24) * Math.PI) * 5.7,
        dz = -24 + (row + 0.5) * 2;
      ray.ray.origin.set(x + dx, y + 30, z + dz);
      assert.equal(
        ray.intersectObject(patch.root, true).length,
        0,
        "authored roof break remains open",
      );
      assert.equal(
        game.cameraSurfaces.entry(
          new THREE.Vector3(x + dx, y + 30, z + dz),
          new THREE.Vector3(x + dx, y + 2, z + dz),
        ),
        1,
        "camera bounds preserve the skylight",
      );
    }
    for (const c of patch.plan.columns) {
      const o = game.obstacles.find((o) => o.x === x + c.x && o.z === z + c.z);
      assert.ok(
        Math.abs(profile.height(o.x, o.z) + o.h - y - spring - 0.36) < 0.000001,
      );
      assert.equal(game.canMove(o.x, o.z, 0), false);
    }
    const bird = game.palaceBirdPerches[i];
    ray.ray.origin.set(bird.x, bird.y + 0.15, bird.z);
    const hit = ray.intersectObject(patch.root, true)[0];
    assert.ok(
      hit && Math.abs(hit.point.y - bird.y) < 0.001,
      "bird feet meet their bracket",
    );
    for (const site of profile.waters.filter((w) => w.room === room))
      for (let a = 0; a < 24; a++) {
        const px =
            site.x + Math.cos((a / 24) * Math.PI * 2) * (site.width / 2 + 0.5),
          pz =
            site.z + Math.sin((a / 24) * Math.PI * 2) * (site.length / 2 + 0.5);
        assert.ok(
          !game.obstacles.some(
            (o) =>
              Math.abs(px - o.x) < o.w + 0.5 && Math.abs(pz - o.z) < o.d + 0.5,
          ),
          "masonry leaves the water bank free",
        );
      }
  }
  game.player.position.copy(game.palacePatches[0].center);
  updatePalaceArchitecture(game);
  assert.equal(game.palacePatches[0].detail.visible, true);
  game.player.position.set(-500, 0, -500);
  updatePalaceArchitecture(game);
  assert.equal(game.palacePatches[0].detail.visible, false);
  assert.equal(game.palacePatches[0].root.visible, true);
  world.traverse((o) => o.geometry?.dispose());
  game.level = LEVELS[0];
  assert.equal(buildPalaceArchitecture(game), false);
  assert.deepEqual(game.palaceBirdPerches, {});
  assert.deepEqual(game.palacePatches, []);
});

test("broken vault patterns remove distinct connected openings while keeping both spring lines intact", () => {
  const holes = [];
  for (const damage of [0, 1, 2, 3]) {
    const missing = [];
    for (let row = 0; row < 6; row++)
      for (let sector = 0; sector < 24; sector++) {
        const present = vaultCellPresent(sector, row, damage);
        if (sector === 0 || sector === 23) assert.equal(present, true);
        if (!present) missing.push(`${sector},${row}`);
      }
    if (damage === 0) assert.equal(missing.length, 0);
    else assert.ok(missing.length > 10 && missing.length < 45);
    holes.push(JSON.stringify(missing));
  }
  assert.equal(new Set(holes).size, 4);
  const relief = shellReliefGeometry();
  relief.computeBoundingBox();
  assert.ok(relief.boundingBox.max.z - relief.boundingBox.min.z > 0.1);
  assert.ok(relief.attributes.normal.array.every(Number.isFinite));
  relief.dispose();
});

test("coastal dressing excludes underwater roots, reservoir banks, palace supports, and objective pads", () => {
  const level = LEVELS[3],
    map = createMap(level),
    profile = createTerrainProfile(map, level);
  assert.deepEqual(woodlandLayout(map, level, profile.height), []);
  let count = 0;
  for (let z = 3; z < map.size * 7 - 3; z += 2)
    for (let x = 3; x < map.size * 7 - 3; x += 2) {
      if (!coastalPlantAllowed(map, profile, x, z)) continue;
      count++;
      assert.ok(profile.height(x, z) >= -0.9);
      for (const f of map.features)
        assert.ok(Math.hypot(f.x * 7 - x, f.z * 7 - z) >= 6.8);
      for (const w of profile.waters)
        assert.ok(
          Math.abs(w.x - x) >= w.width / 2 + 1 ||
            Math.abs(w.z - z) >= w.length / 2 + 1,
        );
    }
  assert.ok(count > 50, "dry shoreline still offers space for scrub");
});

test("delivered palace material maps match all nine archived source hashes", () => {
  const sources = JSON.parse(
    readFileSync(
      new URL(
        "../asset-sources/palace-materials/sources.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(sources.length, 9);
  for (const s of sources) {
    const file = readFileSync(new URL(`../${s.file}`, import.meta.url));
    assert.equal(file.length, s.bytes);
    assert.equal(createHash("sha256").update(file).digest("hex"), s.sha256);
    assert.equal(s.license, "CC0");
  }
});
