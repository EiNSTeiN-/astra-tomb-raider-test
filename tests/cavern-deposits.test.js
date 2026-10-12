import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCaverns } from "../src/caverns.js";
import { Adventure } from "../src/game.js";
import { depositGeometry, planCavernDeposits } from "../src/cavern-deposits.js";
import { formationReserved } from "../src/cavern-formations.js";

test("limestone debris is closed, grounded and clear of routes and discoveries", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[6],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      terrainProfile,
      world: new THREE.Group(),
      obstacles: [],
      progress: { stage: 0, field: [] },
      jumpY: 0,
    });
  buildCaverns(game);
  const geometries = new Set(),
    materials = new Set();
  game.world.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  t.after(() => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  });
  assert(game.cavernDeposits.length > 100);
  assert.deepEqual(planCavernDeposits(game), game.cavernDeposits);
  let rootProbes = 0,
    vertices = 0,
    triangles = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    surface = terrainProfile.surfaceHeight;
  for (const site of game.cavernDeposits) {
    assert(!formationReserved(game, site.x, site.z, site.radius, true));
    const geometry = depositGeometry(site, surface),
      p = geometry.attributes.position,
      edges = new Map(),
      base = surface(site.x, site.z);
    assert(p.array.every(Number.isFinite));
    assert(geometry.attributes.normal.array.every(Number.isFinite));
    let volume = 0;
    for (let i = 0; i < geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((j) => geometry.index.getX(i + j));
      for (let j = 0; j < 3; j++) {
        const key = [ids[j], ids[(j + 1) % 3]].sort((a, b) => a - b).join(",");
        edges.set(key, (edges.get(key) || 0) + 1);
      }
      a.fromBufferAttribute(p, ids[0]);
      b.fromBufferAttribute(p, ids[1]);
      c.fromBufferAttribute(p, ids[2]);
      assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-7);
      volume += a.dot(b.cross(c)) / 6;
      triangles++;
    }
    assert(volume > 0, "outward faces");
    assert(
      [...edges.values()].every((n) => n === 2),
      "closed fragment",
    );
    for (let j = 0; j < 8; j++)
      for (let k = 0; k <= 8; k++) {
        const v = k / 8,
          next = (j + 1) % 8,
          x = site.x + THREE.MathUtils.lerp(p.getX(j), p.getX(next), v),
          z = site.z + THREE.MathUtils.lerp(p.getZ(j), p.getZ(next), v),
          y = base + THREE.MathUtils.lerp(p.getY(j), p.getY(next), v);
        assert(y < surface(x, z), "buried perimeter edge");
        rootProbes++;
      }
    for (let j = 0; j < p.count; j++) {
      const x = site.x + p.getX(j),
        z = site.z + p.getZ(j),
        y = base + p.getY(j);
      assert(!game.walkable(x, z), "fragment enters walking cell");
      assert(y < game.cavernProfile.height(x, z), "fragment enters vault");
      vertices++;
    }
    geometry.dispose();
  }
  const roots = game.world.children.filter(
    (o) => o.name === "Bank-foot limestone debris",
  );
  assert(roots.length > 5 && roots.length < 150);
  assert(
    !game.obstacles.some((o) => o.cavernDeposit),
    "debris introduces no walking obstacle",
  );
  game.level = LEVELS[0];
  buildCaverns(game);
  assert.deepEqual(game.cavernDeposits, []);
  t.diagnostic(
    `${vertices / 26} fragments, ${roots.length} spatial chunks, ${triangles} triangles, ${rootProbes} buried edge probes`,
  );
});
