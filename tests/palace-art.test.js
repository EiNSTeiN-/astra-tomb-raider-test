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
import { palaceRoofCellGeometry } from "../src/palace-courts.js";
import { palaceRoofCells } from "../src/palace-court-plan.js";
import { arcadeUpperCells } from "../src/palace-arcades.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";
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

test("authored arcade fill and coping have closed, outward faces through every stepped profile", () => {
  for (let room = 0; room < 10; room++)
    for (const length of [7.5, 9]) {
      const upper = arcadeUpperCells(room, 1, 0, length, room === 9 ? 7 : 6.2);
      for (const geometry of [upper.fill, upper.cap]) {
        inspectSolid(geometry);
        geometry.dispose();
      }
    }
});

test("new roof cells are closed and their inset skins stay seated on the actual core planes", () => {
  const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    ),
    material = new THREE.MeshBasicMaterial();
  for (let room = 0; room < 10; room++)
    for (const roof of palacePlan({ index: room }).court.roofs)
      for (const cell of palaceRoofCells(roof)) {
        const spring = room === 9 ? 7 : 6.2,
          core = palaceRoofCellGeometry(roof, spring, cell),
          skin = palaceRoofCellGeometry(roof, spring, cell, true);
        inspectSolid(core);
        inspectSolid(skin);
        const mesh = new THREE.Mesh(core, material),
          p = skin.attributes.position,
          bottoms = new Map();
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            z = p.getZ(i),
            key = `${x}/${z}`,
            y = p.getY(i);
          if (!bottoms.has(key) || bottoms.get(key).y > y)
            bottoms.set(key, { x, y, z });
        }
        for (const { x, y, z } of bottoms.values()) {
          ray.ray.origin.set(x, 30, z);
          const hit = ray.intersectObject(mesh)[0];
          assert(hit, "skin stays over its actual core");
          assert(
            hit.point.y - y >= 0.024 && hit.point.y - y <= 0.026,
            "skin underside sits 25 mm inside the actual core plane",
          );
        }
        core.dispose();
        skin.dispose();
      }
  material.dispose();
});

test("ten palace plans keep the crossing axes and objective margins clear of their new columns", () => {
  const map = createMap(LEVELS[3]),
    plans = new Set();
  for (const r of map.rooms) {
    const plan = palacePlan(r);
    plans.add(
      JSON.stringify({
        columns: plan.columns,
        galleries: plan.galleries,
        spring: plan.spring,
        roofs: plan.court.roofs,
        walls: plan.court.walls,
      }),
    );
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
    terrainProfile: profile,
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
    game.cameraSurfaces.count < 2600,
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
      y = profile.surfaceHeight(x, z),
      spring = patch.plan.spring;
    assert.ok(patch.root.children.length <= 3, "structure batches by material");
    assert.ok(
      // Closed gallery heads add at most 960 triangles to an existing court.
      // Keep a bounded allowance for the new stone and its real silhouettes.
      patch.triangles < 61000,
      `${i}: ${patch.triangles} structural triangles`,
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
    for (const roof of patch.court.roofs) {
      for (const [a, b, c, d] of roof.holes) {
        const px = x + (a + b) / 2,
          pz = z + (c + d) / 2;
        ray.ray.origin.set(px, y + 30, pz);
        assert.equal(
          ray.intersectObject(patch.root, true).length,
          0,
          "roof light passes through both skins",
        );
        assert.equal(
          game.cameraSurfaces.entry(
            new THREE.Vector3(px, y + 30, pz),
            new THREE.Vector3(px, y + 2, pz),
          ),
          1,
          "camera runs preserve real roof light",
        );
      }
      for (const cell of roof.cells.filter((_, i) => i % 27 === 0)) {
        const px = x + (cell.x0 + cell.x1) / 2,
          pz = z + (cell.z0 + cell.z1) / 2;
        ray.ray.origin.set(px, y + 30, pz);
        const hit = ray.intersectObject(patch.root, true)[0];
        assert(hit);
        const support = Math.max(
          ...patch.court.solids.map(
            (s) => stationSupport(s, px, pz) ?? -Infinity,
          ),
        );
        assert(
          Math.abs(hit.point.y - support) < 1e-5,
          "roof support matches actual rendered stone",
        );
        assert(
          patch.court.solids.some((s) =>
            stationBlocked(s, px, support - 0.08, pz, 0.2),
          ),
          "finite roof thickness blocks raised bodies",
        );
        assert(
          game.cameraSurfaces.entry(
            new THREE.Vector3(px, support + 3, pz),
            new THREE.Vector3(px, support - 0.4, pz),
          ) < 1,
          "camera stops at rendered roof",
        );
      }
    }
    for (const wall of patch.court.walls) {
      const c = Math.cos(wall.angle),
        s = Math.sin(wall.angle),
        p = { x: x + wall.x + wall.door * c, z: z + wall.z - wall.door * s },
        floor = profile.surfaceHeight(p.x, p.z);
      if (wall.kind === "door") {
        for (let step = -6; step <= 6; step++)
          assert(
            game.canMove(p.x + s * step * 0.3, p.z + c * step * 0.3, 0),
            "doorway has supported walking space through both faces",
          );
        assert.equal(
          game.cameraSurfaces.entry(
            new THREE.Vector3(p.x + s * 1.5, floor + 1.3, p.z + c * 1.5),
            new THREE.Vector3(p.x - s * 1.5, floor + 1.3, p.z - c * 1.5),
          ),
          1,
          "camera passes through the doorway",
        );
      } else {
        assert.equal(
          game.canMove(p.x, p.z, 0),
          false,
          "shore window has a physical sill",
        );
        const q = { x: p.x + c * 0.525, z: p.z - s * 0.525 },
          height = y + 1.2 - profile.surfaceHeight(q.x, q.z);
        assert.equal(
          game.canMove(q.x, q.z, height),
          false,
          "mullions prevent the body crossing above the sill",
        );
        assert.equal(
          game.cameraSurfaces.entry(
            new THREE.Vector3(q.x + s * 1.5, y + 2.4, q.z + c * 1.5),
            new THREE.Vector3(q.x - s * 1.5, y + 2.4, q.z - c * 1.5),
          ),
          1,
          "real window gap admits a sight ray",
        );
      }
      const u = (-wall.length / 2 + wall.door - wall.doorWidth / 2) / 2,
        q = { x: x + wall.x + u * c, z: z + wall.z - u * s };
      assert.equal(
        game.canMove(q.x, q.z, 0),
        false,
        "dressed wall blocks the body",
      );
    }
    for (const c of patch.plan.columns) {
      const o = game.obstacles.find((o) => o.x === x + c.x && o.z === z + c.z);
      assert.ok(
        Math.abs(profile.surfaceHeight(o.x, o.z) + o.h - y - spring - 0.24) <
          0.000001,
      );
      assert.equal(o.bodyPadding, 0.65);
      assert.equal(o.supportable, false);
      assert.equal(game.canMove(o.x, o.z, 0), false);
    }
    assert.equal(patch.arcades.length, patch.plan.galleries.length * 4);
    for (const arcade of patch.arcades) {
      const px = x + arcade.side * 19,
        pz = z + (arcade.az + arcade.bz) / 2,
        floor = game.groundHeight(px, pz);
      assert.equal(stationBlocked(arcade.solid, px, floor, pz), false);
      assert.equal(
        stationBlocked(
          arcade.solid,
          px,
          y + spring + arcade.plan.outer + 0.2,
          pz,
          0.2,
          0,
        ),
        true,
      );
      const oldBearingGap = y + spring + arcade.plan.outer + 0.04,
        joinRay = new THREE.Raycaster(
          new THREE.Vector3(px - 2, oldBearingGap, pz),
          new THREE.Vector3(1, 0, 0),
          0,
          4,
        );
      assert(
        joinRay.intersectObject(patch.root, true).length > 0,
        "delivered stone closes the former gap above the arch crest",
      );
      assert(
        stationBlocked(arcade.solid, px, oldBearingGap, pz, 0.001, 0),
        "the repaired bearing is physical stone",
      );
      ray.ray.origin.set(px, y + 30, pz);
      const top = ray.intersectObject(patch.root, true)[0];
      assert(top);
      assert(
        Math.abs(top.point.y - stationSupport(arcade.solid, px, pz)) < 1e-5,
        "gallery roof support matches delivered stone",
      );
      assert.equal(
        game.cameraSurfaces.entry(
          new THREE.Vector3(px - 2, floor + 2, pz),
          new THREE.Vector3(px + 2, floor + 2, pz),
        ),
        1,
        "camera crosses the opening below the new upper stone",
      );
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
        // The water mesh also extends beneath dry terrain. Architecture reserves
        // the excavated bank, not that invisible surface margin.
        const px =
            site.x +
            Math.cos((a / 24) * Math.PI * 2) *
              ((site.bedWidth ?? site.width) / 2 + 0.5),
          pz =
            site.z +
            Math.sin((a / 24) * Math.PI * 2) *
              ((site.bedLength ?? site.length) / 2 + 0.5);
        assert.ok(
          !game.obstacles.some((o) =>
            stationBlocked(o, px, game.groundHeight(px, pz), pz, 1.8, 0.5),
          ),
          "masonry leaves the water bank free",
        );
      }
  }
  game.player.position.copy(game.palacePatches[0].center);
  assert.equal(
    game.canMove(227.75, 252.8, 0),
    false,
    "retained Queen-column boot contact stops outside the original base",
  );
  assert.equal(
    game.canMove(227, 252.8, 0),
    true,
    "a nearby supported point remains free",
  );
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
