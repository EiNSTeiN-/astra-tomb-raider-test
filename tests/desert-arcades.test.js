import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  buildDesertArchitecture,
  archStoneGeometry,
} from "../src/desert-architecture.js";
import { makeArcadeHead } from "../src/desert-arcade-heads.js";
import { inspectArcadeBearings } from "../scripts/inspect-desert-arcades-browser.js";
import { advanceCharacter } from "../src/character-motion.js";
function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[1],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    store: { data: { settings: { quality: "high" } } },
    player: { position: new THREE.Vector3() },
  });
  buildDesertArchitecture(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const resources = new Set();
    world.traverse((m) => {
      if (m.geometry) resources.add(m.geometry);
      if (m.material) {
        resources.add(m.material);
        for (const v of Object.values(m.material))
          if (v?.isTexture) resources.add(v);
      }
    });
    resources.forEach((r) => r.dispose());
  });
  return game;
}
function closed(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index?.array || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const a = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(p, ids[i + j]),
    );
    if (a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])).lengthSq() < 1e-16)
      continue;
    volume += a[0].dot(a[1].clone().cross(a[2])) / 6;
    const k = a.map((v) =>
      v
        .toArray()
        .map((n) => Math.round(n * 1e5))
        .join(","),
    );
    for (let j = 0; j < 3; j++) {
      const key = [k[j], k[(j + 1) % 3]].sort().join("/");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert(volume > 0);
  assert([...edges.values()].every((n) => n === 2));
  assert([...p.array].every(Number.isFinite));
  assert([...geometry.attributes.normal.array].every(Number.isFinite));
}

test("four arcade families and their broken heads retain closed outward stone and finite camera cells", () => {
  let parts = 0;
  for (const family of ["pointed", "round", "lintel", "corbel"])
    for (const length of [6, 10, 12])
      for (const broken of [false, true]) {
        const head = makeArcadeHead(
          family,
          length,
          broken,
          archStoneGeometry,
          12,
        );
        assert(Number.isFinite(head.foot));
        assert(head.pieces.some((p) => p.foot));
        for (const p of head.pieces) {
          closed(p.geometry);
          assert(
            p.geometry.userData.arcadePlanes.flat().every(Number.isFinite),
          );
          p.geometry.dispose();
          parts++;
        }
        for (const p of head.cameraCells) {
          closed(p.geometry);
          p.geometry.dispose();
        }
      }
  assert(parts > 300);
});

test("all delivered arcade springs enter real pier masonry and lifted-head negative controls lose their bearings", (t) => {
  const g = fixture(t),
    r = inspectArcadeBearings(g);
  assert.equal(r.courts, 10);
  assert.equal(new Set(r.styles).size, 10);
  assert.equal(r.bearings, 184);
  assert.deepEqual(r.failures, []);
  assert(r.contacts > r.bearings * 3);
  const raised = inspectArcadeBearings(g, { raiseHeads: 0.35 });
  assert(
    raised.failures.length > r.bearings / 2,
    "lifting the delivered feet detects disconnected bearings",
  );
  t.diagnostic(
    `${r.bearings} bearings, ${r.queries} delivered toe queries, ${raised.failures.length} disconnected controls`,
  );
});

test("actual coping and pier caps catch prepared falls without changing horizontal position", (t) => {
  const g = fixture(t),
    ray = new THREE.Raycaster();
  g.player = new THREE.Group();
  g.grounded = false;
  g.audio = { tone() {} };
  g.health = 100;
  g.crouching = false;
  let checked = 0;
  for (const room of [1, 3, 5, 7, 9]) {
    const patch = g.desertPatches[room],
      span = patch.plan.spans.find(
        (s) => !s.broken && s.a.x === s.b.x && s.a.z === -6 && s.b.z === 6,
      ),
      c = patch.root.position,
      x = c.x + (span.a.x + span.b.x) / 2,
      z = c.z + (span.a.z + span.b.z) / 2 + 0.18;
    g.world.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(x, c.y + 30, z), new THREE.Vector3(0, -1, 0));
    ray.far = 35;
    const top = ray.intersectObject(patch.root, true)[0];
    assert(top);
    g.player.position.copy(top.point).add(new THREE.Vector3(0, 1.6, 0));
    Object.assign(g, {
      jumpY: g.player.position.y - g.groundHeight(x, z),
      velocityY: 0,
      grounded: false,
      airVelocity: null,
      fallPeak: g.player.position.y,
      health: 100,
    });
    for (let i = 0; i < 180; i++)
      advanceCharacter(g, new THREE.Vector3(), 1 / 60);
    assert(g.grounded, `landing ${room}`);
    assert(g.canMove(x, z, g.jumpY), `legal supported landing ${room}`);
    assert(Math.abs(g.player.position.y - top.point.y) < 0.015);
    assert(Math.hypot(g.player.position.x - x, g.player.position.z - z) < 1e-6);
    assert.equal(g.health, 100);
    checked++;
  }
  assert.equal(checked, 5);
});
