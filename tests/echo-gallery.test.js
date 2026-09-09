import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import { Soundscape, scoreBar } from "../src/audio.js";
import {
  ECHO_EDGES,
  ECHO_STONES,
  ECHO_ORDER,
  ECHO_SHORTCUTS,
  echoCell,
  echoCellAt,
  echoWalls,
  normalizeEcho,
  echoEnvelope,
} from "../src/echo-gallery-rules.js";
import {
  buildEchoGallery,
  updateEchoGallery,
  echoInteract,
  echoBlocked,
  echoOccludes,
  echoObjective,
} from "../src/echo-gallery.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  const world = new THREE.Group(),
    store = new SaveStore({ getItem: () => null, setItem() {} });
  const g = Object.assign(Object.create(Adventure.prototype), {
    world,
    store,
    level: LEVELS[6],
    map: { echoGallery: {}, grid: [] },
    progress: store.level("crystal"),
    player: new THREE.Group(),
    groundHeight: () => 0,
    walkable: () => true,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    goldMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    audio: { tone() {} },
    cb: {
      toast() {},
      echoFragment(i) {
        g.heard.push(i);
      },
      echoGuide() {
        g.guide++;
      },
    },
    heard: [],
    guide: 0,
    elapsed: 0,
    save() {
      this.saves++;
    },
    saves: 0,
  });
  try {
    buildEchoGallery(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  return g;
}
function place(g, cell) {
  const p = echoCell(cell);
  g.player.position.set(p.x, 0, p.z);
  g.grounded = true;
  g.jumpY = 0;
  g.velocityY = 0;
}

test("listening gallery graph has two kinds of branches, two released shortcuts, and clear routes between all cells", (t) => {
  const g = fixture(t),
    h = g.echoGallery;
  assert.equal(ECHO_STONES.length, 5);
  assert.equal(new Set(ECHO_ORDER).size, 3);
  for (const n of h.nodes)
    assert(
      g.lineOfSight(
        n.control.position,
        new THREE.Vector3(n.source.x, n.source.y - 1.4, n.source.z),
      ),
      `stone ${n.index} must not muffle its own listening approach`,
    );
  const seen = new Set([23]);
  for (let i = 0; i < 32; i++)
    for (const [a, b] of ECHO_EDGES) {
      if (seen.has(a)) seen.add(b);
      if (seen.has(b)) seen.add(a);
    }
  assert.equal(seen.size, 32);
  assert(ECHO_EDGES.length > 31); // loops, not one corridor
  assert.equal(h.doors.length, 2);
  assert(h.doors.every((d) => d.opening === 0));
  for (const [a, b] of ECHO_EDGES)
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      place(g, from);
      const p = echoCell(to),
        dx = p.x - g.player.position.x,
        dz = p.z - g.player.position.z;
      for (let i = 0; i < 140; i++)
        advanceCharacter(g, { x: (dx / 7) * 3, z: (dz / 7) * 3 }, 1 / 60);
      assert(
        Math.hypot(g.player.position.x - p.x, g.player.position.z - p.z) < 0.02,
        `${from} → ${to}`,
      );
    }
  for (const wall of echoWalls())
    assert(!g.canMove(wall.x, wall.z, 0), `wall ${wall.a}/${wall.b}`);
  assert(g.canMove(35, 66.5, 0));
  assert.equal(echoCellAt(35, 66.5), null);
  const occupied = new THREE.Vector3(35, 0, 38.5),
    restored = safeArrival(g, occupied);
  assert(!g.canMove(occupied.x, occupied.z, 0));
  assert.notEqual(restored.x, occupied.x);
  assert(restored);
  assert(g.canMove(restored.x, restored.z, restored.y));
});

test("ordered memories reject false or premature echoes, open shortcuts, save partial work, and require the return tablet", (t) => {
  const g = fixture(t),
    h = g.echoGallery;
  g.player.position.copy(h.nodes[2].control.position);
  assert(echoInteract(g));
  assert.equal(h.saved.fragments, 0);
  g.player.position.copy(h.nodes[0].control.position);
  echoInteract(g);
  assert.equal(h.saved.fragments, 0);
  for (const [step, index] of ECHO_ORDER.entries()) {
    g.player.position.copy(h.nodes[index].control.position);
    updateEchoGallery(g, 0);
    assert(echoInteract(g));
    assert.equal(h.saved.fragments, step + 1);
    assert.equal(h.saved.recovered, false);
    echoInteract(g);
    assert.equal(h.saved.fragments, step + 1);
    const loaded = normalizeSave({
      version: 1,
      levels: { crystal: g.progress, sands: { echoGallery: h.saved } },
    });
    assert.deepEqual(loaded.levels.crystal.echoGallery, h.saved);
    assert.equal(loaded.levels.sands.echoGallery, null);
    updateEchoGallery(g, 4);
    assert(h.nodes[index].source.activity === 0);
    if (step < 2) assert.equal(h.doors[step].opening, 7.2);
  }
  assert.deepEqual(g.heard, [0, 1, 2]);
  assert.equal(echoObjective(g).step, 3);
  g.player.position.copy(h.controls[0].position);
  echoInteract(g);
  assert(h.saved.recovered);
  assert.equal(g.guide, 1);
  assert.equal(echoObjective(g).step, 4);
  assert.equal(g.progress.stage, 0);
  assert.equal(
    normalizeEcho({ visited: false, fragments: 99, recovered: true }).fragments,
    0,
  );
  assert.deepEqual(
    normalizeEcho({
      visited: true,
      fragments: 2,
      recovered: true,
      charted: [31, 3, 3, -1, 32, "2", NaN],
    }),
    { visited: true, fragments: 2, recovered: false, charted: [3, 31] },
  );
});

test("shortcut collision follows its moving panel, pause freezes it, and camera surfaces follow the raised parent", (t) => {
  const g = fixture(t),
    h = g.echoGallery,
    d = h.doors[0];
  h.saved.fragments = 1;
  updateEchoGallery(g, 0.5);
  assert.equal(d.opening, 1.2);
  assert(echoBlocked(g, d.x, d.z, 0));
  g.paused = true;
  updateEchoGallery(g, 10);
  assert.equal(d.opening, 1.2);
  assert.equal(d.source.activity, 0);
  g.player.position.copy(h.nodes[1].control.position);
  assert.equal(echoInteract(g), false);
  g.paused = false;
  g.audio.ctx = { state: "suspended", currentTime: 0 };
  g.elapsed = 0.1;
  updateEchoGallery(g, 0);
  assert(
    h.nodes[0].material.emissiveIntensity > 0.5,
    "visible pulses keep moving when audio is unavailable",
  );
  g.audio.ctx = { state: "running", currentTime: 3 };
  updateEchoGallery(g, 0);
  assert.equal(
    h.nodes[0].material.emissiveIntensity,
    0.35,
    "running audio supplies the shared phrase clock",
  );
  updateEchoGallery(g, 3);
  assert.equal(d.opening, 7.2);
  assert(!echoBlocked(g, d.x, d.z, 0));
  assert(echoBlocked(g, d.x, d.z, 7));
  const a = { x: d.x - 2, y: 1.6, z: d.z },
    b = { x: d.x + 2, y: 1.6, z: d.z };
  assert(!echoOccludes(g, a, b));
  assert(g.cameraSurfaces.dynamic.some((s) => s.parent === d.root));
  g.world.updateMatrixWorld(true);
  for (const s of g.cameraSurfaces.dynamic) g.cameraSurfaces.updateSurface(s);
  assert(
    g.cameraSurfaces.dynamic
      .filter((s) => s.parent === d.root)
      .every((s) => s.bounds.min.y > 7),
  );
  for (const shortcut of ECHO_SHORTCUTS) {
    place(g, shortcut.a);
    const p = echoCell(shortcut.b);
    if (shortcut.after === 1) {
      for (let i = 0; i < 140; i++) advanceCharacter(g, { x: 3, z: 0 }, 1 / 60);
      assert(Math.abs(g.player.position.x - p.x) < 0.02);
    }
  }
});

test("listening terrain is flat with a sealed cavern above, preserves existing features, and only expands the crystal map", () => {
  const map = createMap(LEVELS[6]),
    terrain = createTerrainProfile(map, LEVELS[6]),
    cave = createCavernProfile(map, terrain);
  const y = terrain.height(21, 56);
  for (let i = 0; i < 32; i++) {
    const p = echoCell(i);
    assert.equal(terrain.height(p.x, p.z), y);
    assert(cave.height(p.x, p.z) > y + 9);
  }
  for (const f of map.features)
    assert(
      !(f.x * 7 >= 6 && f.x * 7 <= 43 && f.z * 7 >= 27 && f.z * 7 <= 85),
      f.id,
    );
  assert(!createMap(LEVELS[0]).echoGallery);
  assert.equal(map.features.length, 54);
});

test("all four crystal phrases have countable pulses, silent loop boundaries, synchronized envelopes and a sparse listening score", () => {
  const ctx = {
    sampleRate: 8000,
    createBuffer(_channels, n, sampleRate) {
      const a = new Float32Array(n);
      return { getChannelData: () => a, length: n, duration: n / sampleRate };
    },
  };
  for (let n = 1; n <= 4; n++) {
    const b = Soundscape.prototype.synthetic.call({ ctx }, `echo${n}`, 13),
      a = b.getChannelData(0);
    assert.equal(b.duration, 4);
    assert.equal(a[0], 0);
    assert(a.at(-1) === 0);
    for (let p = 0; p < 5; p++) {
      const start = Math.round(p * 0.55 * ctx.sampleRate),
        end = start + Math.round(0.36 * ctx.sampleRate);
      const power = a.slice(start, end).reduce((s, x) => s + x * x, 0);
      assert(p < n ? power > 1 : power === 0, `${n} pulses, slot ${p}`);
    }
    assert(Math.abs(echoEnvelope(n, 4.1) - echoEnvelope(n, 0.1)) < 1e-12);
  }
  for (let bar = 0; bar < 8; bar++)
    assert(
      scoreBar("crystal", 0, bar, "explore", "tuning").every((e) =>
        ["pad", "bass"].includes(e.voice),
      ),
    );
});
