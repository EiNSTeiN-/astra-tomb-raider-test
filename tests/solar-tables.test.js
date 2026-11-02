import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCourtDais } from "../src/court-dais.js";
import { courtWalkingHeight } from "../src/court-dais-rules.js";
import { buildSolarTable, updateSolarTables } from "../src/solar-tables.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  stationEntry,
  stationSupport,
  stationBlocked,
} from "../src/field-station-solids.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import { createPuzzle } from "../src/puzzles.js";
import { normalizeSave } from "../src/storage.js";
import {
  buildSolarChambers,
  updateSolarChambers,
} from "../src/solar-chambers.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  t.after(() => (globalThis.document = oldDocument));
  const level = LEVELS[1],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: terrain,
    world,
    waterMeshes: [],
    groundHeight: Adventure.prototype.groundHeight,
    walkable: () => true,
    stoneMat: new T.MeshStandardMaterial(),
    darkMat: new T.MeshStandardMaterial(),
    obstacles: [],
    courtDaises: [],
    courtDaisMaterials: null,
    solarTables: [],
    progress: normalizeSave({ version: 1, levels: { sands: { stage: 1 } } })
      .levels.sands,
    items: [],
    player: new T.Group(),
    avatar: new T.Group(),
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    audio: { tone() {} },
    health: 100,
  });
  g.cameraSurfaces = new CameraSurfaces(world);
  for (const room of map.rooms) if (room.index > 1) buildCourtDais(g, room);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    const group = new T.Group();
    group.position.set(f.x * 7, g.groundHeight(f.x * 7, f.z * 7), f.z * 7);
    f.group = group;
    world.add(group);
    g.items.push(f);
    if (f.stage > 0) assert(buildSolarTable(g, f, group));
  }
  buildSolarChambers(g);
  updateSolarTables(g);
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const m of materials)
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    for (const r of [...geometries, ...materials, ...textures]) r.dispose();
  });
  return g;
}
function closed(shape) {
  const edges = new Map();
  let volume = 0;
  const key = (v) =>
    v
      .toArray()
      .map((x) => Math.round(x * 1e6))
      .join(",");
  for (const tri of shape.triangles) {
    const [a, b, c] = tri.vertices;
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-14) continue;
    volume += a.dot(b.clone().cross(c)) / 6;
    const p = tri.vertices.map(key);
    for (let i = 0; i < 3; i++) {
      const k = [p[i], p[(i + 1) % 3]].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  assert(
    [...edges.values()].every((n) => n === 2),
    "each structural piece has closed paired edges",
  );
  assert(volume > 1e-6, "outward volume");
}

test("eight optical tables retain closed delivered surfaces, raised floor contact and precise support after batching", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster(),
    silhouettes = new Set();
  let rays = 0,
    supports = 0,
    parts = 0;
  assert.equal(g.solarTables.length, 8);
  for (const c of g.solarTables) {
    const centre = c.root.getWorldPosition(new T.Vector3()),
      signature = [];
    assert(
      Math.abs(c.floor - courtWalkingHeight(g, centre.x, centre.z)) < 1e-6,
    );
    assert(Math.abs(c.floor - c.feature.group.position.y - 0.515) < 1e-8);
    for (const k of c.physical.triangles.solids) {
      closed(k.shape);
      parts++;
    }
    for (let turn = 0; turn < 32; turn++)
      for (const y of [0.05, 0.5, 0.95, 1.3, 1.82, 2.2, 2.6, 3.1, 3.35]) {
        const a = ((turn + 0.137) * Math.PI) / 16,
          n = new T.Vector3(Math.sin(a), 0, Math.cos(a)),
          from = centre
            .clone()
            .addScaledVector(n, 6)
            .setY(c.floor + y),
          to = centre
            .clone()
            .addScaledVector(n, -6)
            .setY(c.floor + y);
        ray.set(from, n.clone().negate());
        ray.far = 12;
        const hit = ray.intersectObject(c.root, true)[0],
          entry = stationEntry(c.physical, from, to);
        if (hit) {
          assert(entry !== null && Math.abs(entry * 12 - hit.distance) < 2e-5);
          signature.push(Math.round(hit.distance * 1000));
          assert(g.cameraSurfaces.entry(from, to, 0) <= entry + 2e-5);
        } else {
          assert.equal(entry, null);
          signature.push(-1);
        }
        rays++;
      }
    silhouettes.add(signature.join(","));
    for (let ix = -7; ix <= 7; ix++)
      for (let iz = -7; iz <= 7; iz++) {
        const x = centre.x + ix * 0.3 + 0.003,
          z = centre.z + iz * 0.3 + 0.007;
        ray.set(new T.Vector3(x, c.floor + 6, z), new T.Vector3(0, -1, 0));
        ray.far = 7;
        const hit = ray.intersectObject(c.root, true)[0],
          height = stationSupport(c.physical, x, z);
        if (hit)
          assert(height !== null && Math.abs(height - hit.point.y) < 2e-5);
        else assert.equal(height, null);
        supports++;
      }
    assert(
      !stationBlocked(
        c.physical,
        c.feature.soundAnchor.x,
        c.feature.soundAnchor.y,
        c.feature.soundAnchor.z,
        0,
        0,
      ),
    );
    assert(
      c.feature.markerHeight + c.feature.group.position.y >
        c.physical.bounds.max.y + 0.15,
    );
  }
  assert.equal(silhouettes.size, 8);
  assert.equal(rays, 2304);
  assert.equal(supports, 1800);
  assert(parts > 90);
});

test("all table approaches, occupied arrivals and drops retain clear movement and reachable mechanisms", (t) => {
  const g = fixture(t);
  for (const c of g.solarTables) {
    const p = c.root.getWorldPosition(new T.Vector3()),
      ground = g.groundHeight(p.x, p.z);
    assert.equal(
      g.canMove(p.x, p.z, c.floor - ground),
      false,
      "the old occupied centre is rejected",
    );
    const all = g.obstacles;
    g.obstacles = all.filter((o) => !o.solarTable);
    assert.equal(
      g.canMove(p.x, p.z, c.floor - ground),
      true,
      "negative control: the raised floor alone allowed the old overlap",
    );
    g.obstacles = all;
    const start = new T.Vector3(
      p.x,
      courtWalkingHeight(g, p.x, p.z + 3.4),
      p.z + 3.4,
    );
    g.player.position.copy(start);
    g.jumpY = start.y - g.groundHeight(start.x, start.z);
    g.grounded = true;
    g.velocityY = 0;
    for (let i = 0; i < 120; i++)
      advanceCharacter(g, new T.Vector3(0, 0, -3), 1 / 60);
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
    assert(g.player.position.z > p.z + 1.8);
    assert(g.player.position.distanceTo(p) < 5);
    for (let i = 0; i < 30; i++)
      advanceCharacter(g, new T.Vector3(0, 0, 3), 1 / 60);
    assert(g.player.position.z > p.z + 3.3);
    const arrival = safeArrival(g, p);
    assert(
      arrival &&
        g.canMove(
          arrival.x,
          arrival.z,
          arrival.y - g.groundHeight(arrival.x, arrival.z),
        ),
    );
    assert(Math.hypot(arrival.x - p.x, arrival.z - p.z) < 3.5);
    g.player.position.copy(p).add(new T.Vector3(0, 5.5, 0));
    g.jumpY = 5.5 + c.floor - ground;
    g.grounded = false;
    g.velocityY = 0;
    for (let i = 0; i < 180; i++) {
      advanceCharacter(g, new T.Vector3(), 1 / 60);
      assert(
        Math.hypot(g.player.position.x - p.x, g.player.position.z - p.z) < 1e-6,
        "a vertical drop retains its horizontal position on every frame",
      );
      assert(
        g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
        `${c.stage} drop frame ${i}`,
      );
    }
    assert(g.grounded);
    const settled = g.player.position.clone();
    assert(
      Math.hypot(settled.x - p.x, settled.z - p.z) < 1e-6,
      "a vertical drop lands on the table without sideways recovery",
    );
    assert(settled.y > c.floor + 0.9, "the explorer stands on the glass deck");
    for (let i = 0; i < 120; i++) {
      const before = g.player.position.clone();
      advanceCharacter(g, new T.Vector3(0, 0, 3), 1 / 60);
      assert(
        Math.hypot(
          g.player.position.x - before.x,
          g.player.position.z - before.z,
        ) < 0.10001,
        `${c.stage} frame ${i}: departure from ${before.toArray()} to ${g.player.position.toArray()} does not require a sideways ejection`,
      );
    }
    assert(
      g.player.position.z > settled.z + 1.5,
      `${c.stage}: front departure from ${settled.toArray()} to ${g.player.position.toArray()}`,
    );
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  }
});

test("optical tables restore actual mirror angles and display the delivered light segments, including interrupted turns", (t) => {
  const g = fixture(t),
    matrix = new T.Matrix4();
  for (const c of g.solarTables) {
    const site = g.solarSites[c.stage],
      state = createPuzzle(g.level, c.stage);
    g.progress.stage = c.stage;
    g.progress.field = [0, 1, 2].map((i) => `field-${c.stage}-${i}`);
    state.values[0] = 1 - state.values[0];
    g.progress.solar[c.stage] = { values: state.values, moves: 1 };
    g.progress = normalizeSave({
      version: 1,
      levels: { sands: g.progress },
    }).levels.sands;
    updateSolarChambers(g, 1 / 60);
    updateSolarTables(g);
    assert.deepEqual(c.displayValues, state.values);
    assert.deepEqual(
      c.mirrors.map((m) => m.rotation.y),
      site.mirrors.map((m) => m.pivot.rotation.y),
    );
    assert.equal(c.light.count, site.segments.length);
    updateSolarChambers(g, 100);
    updateSolarTables(g);
    assert.deepEqual(
      c.mirrors.map((m) => m.rotation.y),
      state.values.map((v) => (v ? -Math.PI / 4 : Math.PI / 4)),
    );
    g.progress.solar[c.stage] = { values: [...site.state.target], moves: 12 };
    updateSolarChambers(g, 100);
    updateSolarTables(g);
    assert(
      site.aligned && c.traceHit,
      `actual solved route remains clear: ${c.stage}`,
    );
    for (let i = 0; i < c.light.count; i++) {
      c.light.getMatrixAt(i, matrix);
      const ends = [-0.5, 0.5].map((x) =>
        new T.Vector3(x, 0, 0).applyMatrix4(matrix),
      );
      const expected = site.segments[i].map(
        (p) =>
          new T.Vector3(
            (p.x * 0.38) / 3.2,
            0.183,
            ((p.z - 8.8 - 2.5 * 2.35) * 0.33) / 2.35,
          ),
      );
      assert(ends[0].distanceTo(expected[0]) < 1e-6);
      assert(ends[1].distanceTo(expected[1]) < 1e-6);
      for (const end of ends) {
        assert(Math.abs(end.x) + 0.006 < 1.51 && Math.abs(end.z) + 0.006 < 1.2);
        assert(
          end.y + 0.004 < 0.19,
          "the whole light strip is behind the glass",
        );
      }
    }
    // A completed-sector reload keeps its restored target independently of the
    // saved intermediate record. A dormant sector carries no invented beam.
    g.progress.stage = c.stage + 1;
    g.progress.solar[c.stage] = { values: [...state.values], moves: 1 };
    updateSolarChambers(g, 100);
    updateSolarTables(g);
    assert.deepEqual(c.displayValues, site.state.target);
    g.progress.stage = c.stage;
    g.progress.field = [];
    updateSolarChambers(g, 100);
    updateSolarTables(g);
    assert.equal(c.light.count, 0);
  }
  for (const level of LEVELS.filter((l) => l.biome !== "desert"))
    assert.equal(
      buildSolarTable({ level }, { stage: 1 }, new T.Group()),
      false,
    );
  assert.equal(buildSolarTable(g, { stage: 0 }, new T.Group()), false);
});
