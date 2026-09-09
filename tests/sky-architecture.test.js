import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";
import { buildSoundLandmarks } from "../src/sound-landmarks.js";
import { inspectCitadelSupports } from "../scripts/inspect-citadel-supports-browser.js";
import {
  fittedStoneCells,
  fittedStoneGeometry,
  insetStonePolygon,
} from "../src/sky-masonry.js";
import {
  buildSkyArchitecture,
  skyCitadelPlan,
} from "../src/sky-architecture.js";

const area = (p) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a[0] * b[1] - a[1] * b[0];
    }, 0),
  ) / 2;

test("fitted masonry partitions sloping panels, retains narrow joints, and forms sealed outward stone solids", () => {
  for (const boundary of [
    [
      [-7, 0],
      [7, 0],
      [7, 5],
      [-7, 6],
    ],
    [
      [-1, 0],
      [1, 0],
      [1.7, 8],
      [-1, 8],
    ],
    [
      [-0.69, 1.4],
      [0.69, 1.4],
      [0.51, 3.4],
      [-0.51, 3.4],
    ],
  ]) {
    const cells = fittedStoneCells(boundary, 921);
    assert.deepEqual(cells, fittedStoneCells(boundary, 921));
    assert.ok(
      Math.abs(cells.reduce((n, p) => n + area(p), 0) - area(boundary)) < 1e-6,
    );
    for (const polygon of cells) {
      const p = insetStonePolygon(polygon, 0.014);
      if (p.length < 3) continue;
      assert.ok(area(p) < area(polygon));
      const g = fittedStoneGeometry(p, 1.55, 921),
        v = g.attributes.position;
      assert.ok(v.array.every(Number.isFinite));
      assert.ok(g.attributes.normal.array.every(Number.isFinite));
      const edges = new Map();
      let volume = 0;
      const key = (i) =>
        [v.getX(i), v.getY(i), v.getZ(i)].map((n) => n.toFixed(5)).join(",");
      for (let i = 0; i < v.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) =>
          new THREE.Vector3().fromBufferAttribute(v, i + k),
        );
        volume += a.dot(b.cross(c)) / 6;
        for (let j = 0; j < 3; j++) {
          const e = [key(i + j), key(i + ((j + 1) % 3))].sort().join("|");
          edges.set(e, (edges.get(e) || 0) + 1);
        }
      }
      assert.ok(volume > 0);
      assert.ok(
        [...edges.values()].every((n) => n === 2),
        "each edge has two incident faces",
      );
      g.dispose();
    }
  }
});

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[5],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world: new THREE.Group(),
    obstacles: [],
    jumpY: 0,
  });
  g.cameraSurfaces = new CameraSurfaces(g.world);
  buildSkyArchitecture(g);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const materials = new Set();
    g.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const m of materials) {
      m.map?.dispose();
      m.normalMap?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
  });
  return g;
}

test("all ten citadels keep feature approaches and portal paths clear with recessed niches and grounded bird perches", (t) => {
  const g = fixture(t);
  Object.assign(g, { flames: [], items: [], waterMeshes: [] });
  buildSoundLandmarks(g);
  assert.equal(g.skyCitadels.length, 10);
  assert.equal(
    new Set(g.map.rooms.map((r) => JSON.stringify(skyCitadelPlan(r)))).size,
    10,
  );
  for (const f of g.map.features) {
    for (const dx of [-0.7, 0, 0.7])
      for (const dz of [-0.7, 0, 0.7])
        assert.ok(
          g.canMove(f.x * 7 + dx, f.z * 7 + dz, 0),
          `${f.id}: approach at ${dx}/${dz}`,
        );
  }
  const ray = new THREE.Raycaster();
  for (const [i, p] of g.skyCitadels.entries()) {
    assert.ok(
      p.root.children.length <= 2,
      "courts batch by two shared materials",
    );
    const r = g.map.rooms[i],
      x = r.x * 7,
      z = r.z * 7;
    for (let dz = -22; dz <= -12; dz += 0.5)
      for (const dx of [-1, 0, 1])
        assert.ok(g.canMove(x + dx, z + dz, 0), `court ${i}: central portal`);
    for (const n of p.niches) {
      const dir = new THREE.Vector3(Math.sin(n.angle), 0, Math.cos(n.angle));
      ray.set(
        new THREE.Vector3(n.x, n.y, n.z).addScaledVector(dir, 3),
        dir.clone().negate(),
      );
      const hit = ray.intersectObject(p.root, true)[0];
      assert.ok(hit, "niche has a stone back");
      assert.ok(hit.distance > 3.2, "niche is recessed beyond its front face");
    }
    // The backing, reveals and lintel band must join into a solid wall. A
    // previous band offset left a long daylight slit between the niche heads.
    for (const side of [-1, 1]) {
      const floor = g.groundHeight(x + side * 12, z - 18) - 0.28;
      for (let along = -6.8; along <= 6.8; along += 0.31)
        for (const height of [0.4, 1.4, 2.2, 3.4, 3.5, 3.6, 3.8]) {
          ray.set(
            new THREE.Vector3(x + side * 12 + along, floor + height, z - 15),
            new THREE.Vector3(0, 0, -1),
          );
          const hit = ray.intersectObject(p.root, true)[0];
          assert.ok(
            hit && hit.distance < 5,
            `court ${i}: solid wall at ${along}/${height}`,
          );
        }
    }
    const bird = g.skyBirdPerches[i];
    const source = g.soundSources.find((s) => s.id === `birds-${i}`);
    assert.deepEqual(g.birds[i].bird.position.toArray(), [
      bird.x,
      bird.y,
      bird.z,
    ]);
    assert.deepEqual([source.x, source.y, source.z], [bird.x, bird.y, bird.z]);
    ray.set(
      new THREE.Vector3(bird.x, bird.y + 1, bird.z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(p.root, true)[0];
    assert.ok(
      hit &&
        Math.abs(hit.point.y - bird.surfaceY) < 0.04 &&
        Math.abs(bird.y - 0.18 - bird.surfaceY) < 0.001,
      `court ${i}: bird rests on its cap`,
    );
  }
});

test("citadel walls block movement and the camera while the portal remains open, and other chapters clear their state", (t) => {
  const g = fixture(t),
    r = g.map.rooms[5],
    x = r.x * 7,
    z = r.z * 7;
  const y = g.groundHeight(x, z);
  assert.equal(g.canMove(x + 12, z - 18, 0), false);
  const from = new THREE.Vector3(x + 12, y + 2, z - 12),
    to = new THREE.Vector3(x + 12, y + 2, z - 24);
  assert.ok(g.cameraSurfaces.entry(from, to) < 1);
  assert.equal(
    g.cameraSurfaces.entry(
      new THREE.Vector3(x, y + 2, z - 12),
      new THREE.Vector3(x, y + 2, z - 24),
    ),
    1,
  );
  g.level = LEVELS[6];
  assert.equal(buildSkyArchitecture(g), false);
  assert.deepEqual(g.skyCitadels, []);
  assert.deepEqual(g.skyBirdPerches, {});
});

test("upper citadel masonry and intact coping have continuous stone bearings from both sides", (t) => {
  const g = fixture(t);
  for (const result of inspectCitadelSupports(g))
    assert.deepEqual(
      result.holes,
      [],
      `court ${result.index}: daylight through a masonry bearing`,
    );
});
