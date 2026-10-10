import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCaverns } from "../src/caverns.js";
import {
  formationGeometry,
  formationReserved,
  planCavernFormations,
} from "../src/cavern-formations.js";
import { rockGroundHeight } from "../src/nature-rocks.js";
import { Adventure } from "../src/game.js";

const level = LEVELS[6],
  map = createMap(level),
  terrainProfile = createTerrainProfile(map, level);
function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world: new THREE.Group(),
    obstacles: [],
    progress: { stage: 0, field: [] },
    jumpY: 0,
  });
  buildCaverns(game);
  t.after(() => {
    const materials = new Set();
    game.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const material of materials) material.dispose();
  });
  return game;
}

test("calcite lobes are closed outward surfaces on slopes in both orientations", () => {
  const surface = (x, z) => 20 + x * 0.08 + z * 0.04;
  for (const ceiling of [false, true]) {
    const site = {
      x: 54,
      z: 68,
      rx: 2.2,
      rz: 1.5,
      height: 6,
      seed: 9.2,
      ceiling,
    };
    const geometry = formationGeometry(site, surface),
      p = geometry.attributes.position,
      edges = new Map();
    assert(p.array.every(Number.isFinite));
    assert(geometry.attributes.normal.array.every(Number.isFinite));
    let volume = 0;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((j) => geometry.index.getX(i + j));
      for (let j = 0; j < 3; j++) {
        const key = [ids[j], ids[(j + 1) % 3]].sort((a, b) => a - b).join(",");
        edges.set(key, (edges.get(key) || 0) + 1);
      }
      a.fromBufferAttribute(p, ids[0]);
      b.fromBufferAttribute(p, ids[1]);
      c.fromBufferAttribute(p, ids[2]);
      assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-6);
      volume += a.dot(b.cross(c)) / 6;
    }
    assert([...edges.values()].every((n) => n === 2));
    assert(volume > 8, `outward volume ${volume}`);
    geometry.dispose();
  }
});

test("every authored calcite root is buried in its rendered floor or embedded in its vault", (t) => {
  const game = fixture(t);
  assert.deepEqual(planCavernFormations(game), game.cavernFormations);
  const floors = game.cavernFormations.filter((s) => !s.ceiling),
    ceilings = game.cavernFormations.filter((s) => s.ceiling);
  assert(floors.length > 0 && ceilings.length > 30);
  let roots = 0,
    vertices = 0;
  for (const site of game.cavernFormations) {
    assert(
      !formationReserved(game, site.x, site.z, site.radius, !site.ceiling),
    );
    const surface = site.ceiling
      ? game.cavernProfile.height
      : (x, z) => rockGroundHeight(terrainProfile, x, z);
    const geometry = formationGeometry(site, surface),
      p = geometry.attributes.position,
      base = surface(site.x, site.z);
    for (let j = 0; j < 24; j++) {
      const next = (j + 1) % 24;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const x = site.x + THREE.MathUtils.lerp(p.getX(j), p.getX(next), t);
        const z = site.z + THREE.MathUtils.lerp(p.getZ(j), p.getZ(next), t);
        const y = base + THREE.MathUtils.lerp(p.getY(j), p.getY(next), t);
        assert(
          site.ceiling ? y >= surface(x, z) : y <= surface(x, z),
          `exposed ${site.ceiling ? "roof" : "floor"} root at ${x},${z}`,
        );
        roots++;
      }
    }
    for (let j = 0; j < p.count; j++) {
      const x = site.x + p.getX(j),
        z = site.z + p.getZ(j),
        y = base + p.getY(j);
      if (site.ceiling)
        assert(y - game.groundHeight(x, z) > 9, "pendant headroom");
      else assert(!game.walkable(x, z), "floor formation enters walking grid");
      vertices++;
    }
    geometry.dispose();
  }
  t.diagnostic(
    `${floors.length} floor lobes, ${ceilings.length} roof pendants; ${roots} root probes, ${vertices} vertices`,
  );
});

test("new roof obstacles leave standing, crouched and jumping movement underneath clear", (t) => {
  const game = fixture(t);
  const baseline = game.obstacles.filter((o) => !o.cavernFormation);
  let probes = 0;
  for (let z = 1; z < map.size - 1; z++)
    for (let x = 1; x < map.size - 1; x++) {
      if (!map.grid[z][x]) continue;
      for (const dx of [-2.9, 0, 2.9])
        for (const dz of [-2.9, 0, 2.9])
          for (const [height, clearance] of [
            [0, 1.8],
            [0, 1.05],
            [4, 1.8],
          ]) {
            const px = x * 7 + dx,
              pz = z * 7 + dz;
            const current = game.canMove(px, pz, height, clearance),
              all = game.obstacles;
            game.obstacles = baseline;
            const old = game.canMove(px, pz, height, clearance);
            game.obstacles = all;
            assert.equal(
              current,
              old,
              `movement changed at ${px},${pz},${height}`,
            );
            probes++;
          }
    }
  game.level = LEVELS[0];
  buildCaverns(game);
  assert.deepEqual(game.cavernFormations, []);
  t.diagnostic(`${probes} movement comparisons`);
});
