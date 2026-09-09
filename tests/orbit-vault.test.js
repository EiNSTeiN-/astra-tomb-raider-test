import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { supportAt, advanceCharacter } from "../src/character-motion.js";
import {
  buildOrbitVault,
  updateOrbitVault,
  recoverOrbitFall,
  orbitSector,
  orbitInteract,
  orbitBlocked,
} from "../src/orbit-vault.js";
import {
  ORBIT_RINGS,
  orbitRingAt,
  normalizeOrbit,
  orbitDeckAt,
  orbitSavePosition,
  restoreOrbitArrival,
} from "../src/orbit-rules.js";

function fixture() {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillText() {} }) }),
  };
  const world = new THREE.Group(),
    store = new SaveStore({ getItem: () => null, setItem() {} }),
    g = Object.assign(Object.create(Adventure.prototype), {
      world,
      store,
      level: LEVELS[7],
      map: { orbitVault: { x: 0, z: 0 } },
      groundHeight: (x, z) => (Math.hypot(x, z) < 19 ? -10 : 0),
      walkable: () => true,
      obstacles: [],
      player: new THREE.Group(),
      avatar: new THREE.Group(),
      cameraSurfaces: new CameraSurfaces(world),
      stoneMat: new THREE.MeshStandardMaterial(),
      darkMat: new THREE.MeshStandardMaterial(),
      glowMat: new THREE.MeshStandardMaterial(),
      progress: store.level("eclipse"),
      grounded: true,
      jumpY: 0.18,
      velocityY: 0,
      health: 100,
      saves: [],
      audio: { tone() {} },
      cb: {
        toast() {},
        orbitGuide() {
          g.guides++;
        },
        orbitRecord() {
          g.records++;
        },
      },
      guides: 0,
      records: 0,
      save() {
        this.saves.push(orbitSavePosition(this));
      },
      damage(n) {
        this.health -= n;
      },
    });
  try {
    buildOrbitVault(g);
  } finally {
    globalThis.document = old;
  }
  g.cameraSurfaces.rebuild();
  g.player.position.set(-22, 0.18, 0);
  return g;
}

test("the western bank gap can be jumped onto the moving outer ring and back at walking speed", () => {
  for (const outward of [false, true]) {
    const g = fixture(),
      h = g.orbitVault;
    h.saved.started = true;
    h.saved.visited = true;
    g.player.position.set(outward ? -16.5 : -20.2, h.y, 0);
    g.jumpY = h.y - g.groundHeight(g.player.position.x, 0);
    for (let i = 0; i < 70; i++) {
      updateOrbitVault(g, 1 / 60);
      advanceCharacter(
        g,
        { x: i < 37 ? (outward ? -6 : 6) : 0, z: 0 },
        1 / 60,
        i === 0,
      );
      recoverOrbitFall(g);
    }
    assert.equal(g.health, 100);
    assert(g.grounded);
    const d = orbitDeckAt(
      g,
      g.player.position.x,
      g.player.position.z,
      g.player.position.y,
    );
    assert.equal(d.surface, outward ? h.bank : h.rings[0]);
  }
});

test("orbital sectors have outward closed faces and their gaps stay clear in support and camera collision", () => {
  const geo = orbitSector(10, 13, 0, Math.PI / 2),
    p = geo.attributes.position,
    n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    assert(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
    if (n.getY(i) > 0.9) assert.equal(p.getY(i), 0);
    if (n.getY(i) < -0.9) assert(Math.abs(p.getY(i) + 0.35) < 1e-6);
  }
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i += 3) {
    const area =
      (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) -
      (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i));
    assert(Math.abs(area) > 1e-6, "cut edges must have non-collapsed UVs");
  }
  const g = fixture(),
    h = g.orbitVault;
  assert.equal(orbitDeckAt(g, 14, 0), null);
  assert.equal(orbitDeckAt(g, 16.5, 0)?.surface, h.rings[0]);
  const x = Math.cos(5.5) * 16.5,
    z = Math.sin(5.5) * 16.5;
  assert.equal(orbitDeckAt(g, x, z), null);
  assert.equal(
    g.cameraSurfaces.entry(
      new THREE.Vector3(x, 1, z),
      new THREE.Vector3(x, -0.05, z),
      0.01,
    ),
    1,
  );
  assert.equal(
    g.cameraSurfaces.entry(
      new THREE.Vector3(14, 1, 0),
      new THREE.Vector3(14, -0.05, 0),
      0.01,
    ),
    1,
  );
  assert(
    g.cameraSurfaces.entry(
      new THREE.Vector3(-16.5, 1, 0),
      new THREE.Vector3(-16.5, -0.05, 0),
      0.01,
    ) < 1,
  );
  assert(orbitBlocked(g, -16.5, 0, -0.5, 1.8));
  assert(!orbitBlocked(g, -16.5, 0, 0.18));
  assert(
    g.canMove(-23, 0, 0),
    "the low rim must remain step-up accessible from its outside approach",
  );
  h.rings[0].angle = 1.5;
  updateOrbitVault(g, 0, true);
  const q = 5.5 + 1.5,
    rx = Math.cos(q) * 16.5,
    rz = Math.sin(q) * 16.5;
  assert.equal(
    g.cameraSurfaces.entry(
      new THREE.Vector3(rx, 1, rz),
      new THREE.Vector3(rx, -0.05, rz),
      0.01,
    ),
    1,
  );
});

test("a ring carries a grounded rider around its axis, leaves air and fixed landings independent, and freezes on pause", () => {
  const g = fixture(),
    h = g.orbitVault;
  h.saved.started = true;
  h.saved.visited = true;
  g.player.position.set(-16.5, h.y, 0);
  g.jumpY = 10.18;
  for (let i = 0; i < 60; i++) updateOrbitVault(g, 1 / 60);
  assert(
    Math.abs(g.player.position.x - Math.cos(Math.PI + 0.08) * 16.5) < 1e-8,
  );
  assert(
    Math.abs(g.player.position.z - Math.sin(Math.PI + 0.08) * 16.5) < 1e-8,
  );
  assert.equal(
    supportAt(g, g.player.position.x, g.player.position.z, g.player.position.y)
      .surface,
    h.rings[0],
  );
  const saved = orbitSavePosition(g);
  assert.deepEqual(saved, { x: -22, y: 0.18, z: 0 });
  const before = g.player.position.clone(),
    angle = h.rings[0].angle;
  g.paused = true;
  updateOrbitVault(g, 4);
  assert(g.player.position.equals(before));
  assert.equal(h.rings[0].angle, angle);
  assert.equal(h.rings[0].source.activity, 0);
  g.paused = false;
  g.grounded = false;
  updateOrbitVault(g, 0.5);
  assert(g.player.position.equals(before));
  g.grounded = true;
  g.player.position.set(0, h.y, -13.7);
  updateOrbitVault(g, 0.5);
  assert.deepEqual(g.player.position.toArray(), [0, 0.18, -13.7]);
  assert.equal(h.saved.rest, 1);
  assert.equal(orbitSavePosition(g), null);
});

test("three calibrated bearings unlock their next rings, save independently, and open the return crossing after the centre record", () => {
  const g = fixture(),
    h = g.orbitVault;
  assert(orbitInteract(g));
  assert(h.saved.started);
  assert.equal(g.guides, 1);
  for (let i = 0; i < 3; i++) {
    const c = h.controls.find((c) => c.kind === "bearing" && c.index === i);
    g.player.position.copy(c.position);
    g.grounded = true;
    updateOrbitVault(g, 0);
    assert(orbitInteract(g));
    assert.equal(h.saved.aligned, i + 1);
    orbitInteract(g);
    assert.equal(h.saved.aligned, i + 1);
    const normalized = normalizeSave({
      version: 1,
      levels: { eclipse: g.progress, crystal: { orbitVault: h.saved } },
    });
    assert.deepEqual(normalized.levels.eclipse.orbitVault, h.saved);
    assert.equal(normalized.levels.crystal.orbitVault, null);
    const angles = h.rings.map((r) => r.angle);
    updateOrbitVault(g, 1);
    for (let j = 0; j < 3; j++)
      assert.equal(h.rings[j].angle !== angles[j], j === i + 1);
  }
  assert(!h.returnRoot.visible);
  g.player.position.copy(h.controls.find((c) => c.kind === "record").position);
  assert(orbitInteract(g));
  assert(h.saved.recovered);
  assert(h.returnRoot.visible);
  assert.equal(g.records, 1);
  assert.equal(orbitDeckAt(g, -14, 0).height, h.y + 0.1);
  assert.equal(g.progress.stage, 0);
});

test("a missed crossing and an unsupported imported arrival restore the latest fixed landing without granting calibration", () => {
  const g = fixture(),
    h = g.orbitVault;
  h.saved.visited = h.saved.started = true;
  h.saved.aligned = 1;
  h.saved.rest = 1;
  h.anchor = 1;
  g.player.position.set(-14, h.y - 3, 0);
  g.grounded = false;
  recoverOrbitFall(g);
  assert.deepEqual(g.player.position.toArray(), [0, 0.18, -13.7]);
  assert.equal(g.health, 92);
  assert.equal(h.saved.aligned, 1);
  g.player.position.set(-14, -10, 0);
  restoreOrbitArrival(g);
  assert.deepEqual(g.player.position.toArray(), [0, 0.18, -13.7]);
  assert.equal(
    normalizeOrbit({
      visited: false,
      started: true,
      aligned: 3,
      recovered: true,
    }).recovered,
    false,
  );
  assert.deepEqual(
    normalizeOrbit({
      visited: true,
      started: true,
      aligned: 1,
      rest: 99,
      angles: [Infinity, -1, NaN],
    }),
    {
      visited: true,
      started: true,
      aligned: 1,
      rest: 2,
      recovered: false,
      angles: [0, Math.PI * 2 - 1, 0],
    },
  );
});

test("the new recessed court reserves existing feature positions and supplies a flat approach with a real deep well", () => {
  const map = createMap(LEVELS[7]),
    terrain = createTerrainProfile(map, LEVELS[7]),
    x = map.orbitVault.x * 7,
    z = map.orbitVault.z * 7;
  for (const f of map.features)
    assert(Math.hypot(f.x * 7 - x, f.z * 7 - z) > 25, f.id);
  assert(
    Math.abs(terrain.height(x + 23, z) - terrain.height(x, z) - 10) < 0.02,
  );
  for (const r of [0, 5, 10, 15])
    assert(Math.abs(terrain.height(x + r, z) - terrain.height(x, z)) < 0.02);
  assert(!createMap(LEVELS[6]).orbitVault);
  for (const ring of ORBIT_RINGS)
    for (const angle of [0, 1, 3, 5])
      for (const [a, b] of ring.arcs) {
        const t = (a + b) / 2 + angle,
          r = (ring.inner + ring.outer) / 2;
        assert(orbitRingAt(ring, angle, Math.cos(t) * r, Math.sin(t) * r, 0.4));
      }
});
