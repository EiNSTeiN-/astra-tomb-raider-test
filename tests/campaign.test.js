import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, createMap } from "../src/campaign.js";
import { SaveStore, SAVE_KEY, normalizeSave } from "../src/storage.js";

function reachable(map) {
  const queue = [map.spawn],
    visited = new Set([`${map.spawn.x},${map.spawn.z}`]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        z = p.z + dz,
        key = `${x},${z}`;
      if (map.grid[z]?.[x] && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, z });
      }
    }
  }
  return visited;
}
test("all eight worlds have distinct maps and every objective, enemy and discovery is reachable", () => {
  const hashes = new Set();
  for (const level of LEVELS) {
    const map = createMap(level),
      visited = reachable(map);
    hashes.add(JSON.stringify(map.grid));
    assert.equal(
      map.features.filter((f) => f.type === "mechanism").length,
      level.mechanisms,
    );
    assert.equal(level.objectiveNames.length, level.mechanisms);
    assert.equal(map.features.filter((f) => f.type === "note").length, 12);
    assert.equal(map.features.filter((f) => f.type === "treasure").length, 6);
    assert.equal(
      new Set(map.features.map((f) => f.id)).size,
      map.features.length,
    );
    for (const f of [...map.features, ...map.enemies])
      assert.ok(
        visited.has(`${f.x},${f.z}`),
        `${level.id}: ${f.id} is unreachable`,
      );
    assert.deepEqual(
      map,
      createMap(level),
      "generation must be stable across sessions",
    );
  }
  assert.equal(hashes.size, 8);
});
test("mechanism answers fit the offered symbols", () => {
  for (const l of LEVELS)
    for (const f of createMap(l).features.filter(
      (f) => f.type === "mechanism",
    )) {
      assert.ok(f.answer.length >= 3);
      assert.ok(
        f.answer.every(
          (v) => Number.isInteger(v) && v >= 0 && v < l.symbols.length,
        ),
      );
    }
});
test("local saves survive a new store and preserve all independent chapter progress", () => {
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    };
  const a = new SaveStore(storage);
  for (const [i, l] of LEVELS.entries()) {
    Object.assign(a.level(l.id), {
      stage: i,
      found: ["note-0", "treasure-12"],
      defeated: ["guardian-0"],
      health: 65,
      medkits: 2,
      position: { x: 120, z: 80 },
      checkpoint: { x: 110, z: 70 },
      completed: i === 0,
      time: 1200,
    });
  }
  a.data.currentLevel = 3;
  a.data.createdAt = 1700000000000;
  a.data.settings.volume = 0;
  assert.equal(a.save(), true);
  const b = new SaveStore(storage);
  assert.deepEqual(b.data.levels, a.data.levels);
  assert.equal(b.data.currentLevel, 3);
  assert.equal(b.data.settings.volume, 0);
  assert.equal(b.data.createdAt, a.data.createdAt);
  assert.equal(b.total().notes, 8);
  assert.equal(b.total().treasures, 8);
  assert.equal(b.total().completed, 1);
  assert.ok(memory.has(SAVE_KEY));
});
test("invalid and unavailable storage do not prevent a new expedition", () => {
  const store = new SaveStore({
    getItem: () => "{broken",
    setItem: () => {
      throw Error("quota");
    },
  });
  assert.equal(store.available, false);
  assert.equal(store.level("verdant").health, 100);
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: {
        stage: Infinity,
        found: [123, "note-0"],
        position: { x: -1, z: 1 },
        health: -30,
      },
    },
    currentLevel: 99,
    settings: { quality: "ultra", volume: 1000 },
  });
  assert.equal(save.currentLevel, 7);
  assert.equal(save.levels.verdant.position, null);
  assert.deepEqual(save.levels.verdant.found, ["note-0"]);
  assert.equal(save.levels.verdant.health, 1);
  assert.equal(save.settings.quality, "high");
  assert.equal(save.settings.volume, 100);
});
test("save export and import round trip, rejecting unrelated JSON", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  const a = new SaveStore(storage);
  a.level("snow").stage = 5;
  a.data.createdAt = 1700000000000;
  const b = new SaveStore(storage);
  b.import(a.export());
  assert.equal(b.level("snow").stage, 5);
  assert.equal(b.data.createdAt, a.data.createdAt);
  assert.throws(() => b.import('{"hello":"world"}'));
});

test("older or malformed expedition creation times receive a valid default", () => {
  for (const createdAt of [
    undefined,
    null,
    "1700000000000",
    0,
    -1,
    NaN,
    Infinity,
  ]) {
    const before = Date.now(),
      save = normalizeSave({ version: 1, levels: {}, createdAt });
    assert.ok(save.createdAt >= before && save.createdAt <= Date.now());
  }
});

test("import validates structure and rejects invalid discovery identifiers", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  const store = new SaveStore(storage);
  store.level("verdant").stage = 2;
  assert.throws(() => store.import('{"version":1,"levels":"bad"}'));
  assert.throws(() => store.import('{"version":1,"levels":[]}'));
  assert.equal(store.level("verdant").stage, 2);
  const save = normalizeSave({
    version: 1,
    levels: {
      verdant: {
        found: ["note-bad", "note-100", "note-0", "note-0", "treasure-12"],
        explored: ["1,2", "1,2", "999,2"],
        defeated: ["guardian-0", "guardian-100"],
      },
    },
  });
  assert.deepEqual(save.levels.verdant.found, ["note-0", "treasure-12"]);
  assert.deepEqual(save.levels.verdant.explored, ["1,2"]);
  assert.deepEqual(save.levels.verdant.defeated, ["guardian-0"]);
});
