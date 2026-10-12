import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { crystalVaultPlan, crystalRibGeometry } from "../src/crystal-vaults.js";

function fixture(t, completed = true) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[6],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      terrainProfile,
      world,
      obstacles: [],
      items: map.features.filter((f) => f.type === "mechanism"),
      progress: { completed, field: [], stage: completed ? 8 : 0 },
      elapsed: 0,
      player: new THREE.Group(),
      audio: { noiseHit() {} },
      cameraSurfaces: new CameraSurfaces(world),
    });
  game.cavernProfile = createCavernProfile(map, terrainProfile);
  buildFieldGates(game);
  world.updateMatrixWorld(true);
  const owned = new Set(),
    materials = new Set();
  world.traverse((o) => {
    if (o.geometry) owned.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
  });
  t.after(() => {
    for (const g of owned) g.dispose();
    for (const m of materials) m.dispose();
  });
  return game;
}

test("eight archive crowns are distinct closed masonry within the vault and above reachable bodies", (t) => {
  const game = fixture(t);
  assert.equal(new Set(game.fieldGates.map((g) => g.vault.plan.name)).size, 8);
  assert.equal(
    new Set(game.fieldGates.map((g) => JSON.stringify(g.vault.plan.ribs))).size,
    8,
  );
  let vertices = 0,
    bodyQueries = 0,
    bearings = 0,
    triangles = 0,
    sourceTriangles = 0,
    geometryBytes = 0;
  const ray = new THREE.Raycaster(),
    point = new THREE.Vector3();
  for (const gate of game.fieldGates) {
    assert.deepEqual(gate.vault.plan, crystalVaultPlan(gate.stage));
    const roofs = gate.vault.root.children,
      old = gate.root.children.filter((o) => o.isMesh);
    assert(roofs.length >= 2 && roofs.length <= 4);
    for (const mesh of roofs) {
      const p = mesh.geometry.attributes.position;
      sourceTriangles += (mesh.geometry.index?.count ?? p.count) / 3;
      for (const attribute of Object.values(mesh.geometry.attributes))
        geometryBytes += attribute.array.byteLength;
      geometryBytes += mesh.geometry.index?.array.byteLength ?? 0;
      assert(p.array.every(Number.isFinite));
      assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
      for (let j = 0; j < p.count; j++) {
        point.fromBufferAttribute(p, j).applyMatrix4(mesh.matrixWorld);
        assert(
          point.y < game.cavernProfile.height(point.x, point.z) - 0.1,
          "masonry enters cave roof",
        );
        vertices++;
      }
    }
    for (const r of gate.vault.ribs) {
      for (const segment of [0, 19]) {
        const geo = crystalRibGeometry(r, segment),
          p = geo.attributes.position,
          edges = new Map();
        let volume = 0;
        const a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          c = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 3) {
          const ps = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(p, i + j),
          );
          for (let j = 0; j < 3; j++) {
            const key = [ps[j], ps[(j + 1) % 3]]
              .map((v) =>
                v
                  .toArray()
                  .map((n) => n.toFixed(5))
                  .join(","),
              )
              .sort()
              .join("|");
            edges.set(key, (edges.get(key) || 0) + 1);
          }
          a.copy(ps[0]);
          b.copy(ps[1]);
          c.copy(ps[2]);
          volume += a.dot(b.cross(c)) / 6;
          triangles++;
        }
        assert(volume > 0);
        assert(
          [...edges.values()].every((n) => n === 2),
          "closed voussoir",
        );
        geo.dispose();
      }
      for (const side of [-1, 1]) {
        const radius = (r.radius ?? 6.16) + 0.31,
          x = gate.root.position.x + r.x + Math.cos(r.yaw) * radius * side,
          z = gate.root.position.z + r.z - Math.sin(r.yaw) * radius * side;
        let supported = 0;
        // A dressed spring straddles the intentional narrow cornice joints;
        // assess its footprint, including both sides of a centre joint.
        for (const dx of [-0.22, 0, 0.22])
          for (const dz of [-0.22, 0, 0.22]) {
            ray.set(
              new THREE.Vector3(x + dx, gate.root.position.y + 19, z + dz),
              new THREE.Vector3(0, -1, 0),
            );
            const hits = ray.intersectObjects(old, false);
            supported += hits.some(
              (h) => h.point.y >= gate.root.position.y + 7.05,
            )
              ? 1
              : 0;
            bearings++;
          }
        assert(
          supported >= 5,
          `stage ${gate.stage} springing ${x},${z} lacks existing masonry bearing`,
        );
      }
    }
    for (let dz = -7; dz <= 7; dz += 0.35)
      for (let dx = -7; dx <= 7; dx += 0.35) {
        const x = gate.root.position.x + dx,
          z = gate.root.position.z + dz;
        if (!game.canMove(x, z, 4, 1.8)) continue;
        ray.set(
          new THREE.Vector3(x, game.groundHeight(x, z) + 6, z),
          new THREE.Vector3(0, -1, 0),
        );
        ray.far = 6;
        assert.equal(
          ray.intersectObjects(roofs, false).length,
          0,
          "masonry intersects reachable head envelope",
        );
        bodyQueries++;
      }
    ray.far = Infinity;
  }
  assert(bodyQueries > 3000);
  assert(bearings > 40);
  game.cameraSurfaces.rebuild();
  assert(game.cameraSurfaces.count > 0);
  t.diagnostic(
    `${vertices} rendered vertices; ${bodyQueries} reachable body rays; ${bearings} masonry bearings; ${triangles} closed-stone triangles; ${sourceTriangles} source triangles, ${geometryBytes} geometry-array bytes`,
  );
});

test("all eight crystal gates retain locked and restored threshold clearance", (t) => {
  const game = fixture(t, false);
  let queries = 0;
  for (const gate of game.fieldGates) {
    const c = gate.root.position;
    assert.equal(
      game.canMove(c.x, c.z + 6.5, 0),
      false,
      `stage ${gate.stage} locked`,
    );
    game.progress.field.push(
      ...[0, 1, 2].map((i) => `field-${gate.stage}-${i}`),
    );
    updateSanctuaryGate(game, gate, 100);
    for (const dx of [-3, 0, 3])
      for (const dz of [5.8, 6.5, 7.2]) {
        assert.equal(
          game.canMove(c.x + dx, c.z + dz, 0),
          true,
          `stage ${gate.stage} threshold ${dx},${dz}`,
        );
        queries++;
      }
  }
  assert.equal(queries, 72);
});
