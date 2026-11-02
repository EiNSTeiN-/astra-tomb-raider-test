import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCourtDais } from "../src/court-dais.js";
import { courtWalkingHeight } from "../src/court-dais-rules.js";
import {
  buildMeridianConsole,
  updateMeridianConsoles,
} from "../src/meridian-consoles.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  stationEntry,
  stationSupport,
  stationBlocked,
} from "../src/field-station-solids.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import { createPuzzle } from "../src/puzzles.js";
import { normalizeSave } from "../src/storage.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[7],
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
    meridianConsoles: [],
    progress: { stage: 1, field: [], alignments: {} },
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
  for (const f of map.features.filter(
    (f) => f.type === "mechanism" && f.stage > 0,
  )) {
    const group = new T.Group();
    group.position.set(f.x * 7, g.groundHeight(f.x * 7, f.z * 7), f.z * 7);
    f.group = group;
    world.add(group);
    assert(buildMeridianConsole(g, f, group));
  }
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
    assert(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-14);
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

test("nine individual consoles retain closed delivered surfaces, raised floor contact and precise support after batching", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster(),
    silhouettes = new Set();
  let rays = 0,
    supports = 0,
    parts = 0;
  assert.equal(g.meridianConsoles.length, 9);
  for (const c of g.meridianConsoles) {
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
        c.physical.bounds.max.y + 0.45,
    );
  }
  assert.equal(silhouettes.size, 9);
  assert.equal(rays, 2592);
  assert.equal(supports, 2025);
  assert(parts > 100);
});

test("all console approaches, occupied arrivals and drops retain clear movement and reachable mechanisms", (t) => {
  const g = fixture(t);
  for (const c of g.meridianConsoles) {
    const p = c.root.getWorldPosition(new T.Vector3()),
      ground = g.groundHeight(p.x, p.z);
    assert.equal(
      g.canMove(p.x, p.z, c.floor - ground),
      false,
      "the old occupied centre is rejected",
    );
    const all = g.obstacles;
    g.obstacles = all.filter((o) => !o.meridianConsole);
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
    assert(g.player.position.z > p.z + 2);
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
        g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
        `${c.stage} drop frame ${i}`,
      );
    }
    assert(g.grounded);
    const settled = g.player.position.clone();
    for (let i = 0; i < 120; i++)
      advanceCharacter(g, new T.Vector3(0, 0, 3), 1 / 60);
    assert(
      g.player.position.z > settled.z + 1.5,
      `${c.stage}: front departure from ${settled.toArray()} to ${g.player.position.toArray()}`,
    );
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  }
});

test("world dial pointers follow partial and completed saved rings while other chapters retain their existing consoles", (t) => {
  const g = fixture(t);
  for (const c of g.meridianConsoles) {
    const values = [(c.stage + 1) % 8, (c.stage + 3) % 8, (c.stage + 5) % 8],
      before = structuredClone(g.progress);
    g.progress.stage = c.stage;
    g.progress.alignments[c.stage] = { values, moves: 3 };
    const partial = normalizeSave({
      version: 1,
      levels: { eclipse: g.progress },
    }).levels.eclipse;
    g.progress = partial;
    updateMeridianConsoles(g);
    assert.deepEqual(
      c.needles.map((n) => n.rotation.z),
      values.map((v) => (-v * Math.PI) / 4),
    );
    g.progress.stage = c.stage + 1;
    updateMeridianConsoles(g);
    assert.deepEqual(
      c.needles.map((n) => n.rotation.z),
      createPuzzle(g.level, c.stage).target.map((v) => (-v * Math.PI) / 4),
    );
    g.progress = before;
  }
  for (const level of LEVELS.slice(0, 7)) {
    const other = { level, world: new T.Group(), obstacles: [] },
      f = { stage: 1 };
    assert.equal(buildMeridianConsole(other, f, new T.Group()), false);
    assert.equal(other.obstacles.length, 0);
  }
});
