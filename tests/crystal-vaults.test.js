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
import { stationSupport } from "../src/field-station-solids.js";
import {
  advanceCharacter,
  supportAt,
  safeArrival,
} from "../src/character-motion.js";

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
      supports = gate.root.children.filter(
        (o) => o.isMesh || o === gate.enclosure?.root,
      );
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
            const hits = ray.intersectObjects(supports, true);
            supported += hits.some(
              (h) => h.point.y >= gate.root.position.y + 7.05,
            )
              ? 1
              : 0;
            bearings++;
          }
        assert(
          supported >= 5,
          `stage ${gate.stage} springing ${x},${z} lacks masonry bearing`,
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

test("windowed archive fronts bear on existing masonry and retain physical holes and roof surfaces after batching", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(),
    point = new THREE.Vector3();
  assert.equal(
    new Set(game.fieldGates.map((g) => JSON.stringify(g.facade.plan.top))).size,
    8,
  );
  game.cameraSurfaces.rebuild();
  let rays = 0,
    windows = 0,
    bearings = 0,
    vertices = 0,
    tops = 0;
  for (const gate of game.fieldGates) {
    const { root, solid, plan } = gate.facade,
      c = gate.root.position;
    for (const mesh of root.children) {
      const p = mesh.geometry.attributes.position;
      assert(p.array.every(Number.isFinite));
      assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        assert(
          point.y < game.cavernProfile.height(point.x, point.z) - 0.1,
          `facade enters cave roof, stage ${gate.stage}`,
        );
        vertices++;
      }
    }
    const cast = (x, y) => {
      const from = new THREE.Vector3(c.x + x, c.y + y, c.z + 10),
        to = from.clone().add(new THREE.Vector3(0, 0, -8));
      ray.set(from, new THREE.Vector3(0, 0, -1));
      ray.far = 8;
      const hit = ray.intersectObject(root, true)[0],
        entry = solid.triangles.entry(from, to);
      if (hit) {
        assert(entry !== null);
        assert(
          Math.abs(hit.distance - entry * 8) < 0.001,
          `render/physical face disagreement at ${gate.stage} ${x},${y}`,
        );
      } else assert.equal(entry, null);
      rays++;
      return hit;
    };
    for (let y = 7.35; y <= 14.65; y += 0.53)
      for (let x = -7.25; x <= 7.25; x += 0.71) cast(x, y);
    for (const window of plan.windows) {
      const [x, y] = window.reduce(
        (s, p) => [s[0] + p[0] / window.length, s[1] + p[1] / window.length],
        [0, 0],
      );
      assert.equal(
        cast(x, y),
        undefined,
        `blocked real window in stage ${gate.stage}`,
      );
      assert.equal(
        game.cameraSurfaces.entry(
          new THREE.Vector3(c.x + x, c.y + y, c.z + 10),
          new THREE.Vector3(c.x + x, c.y + y, c.z + 5.95),
          0.02,
        ),
        1,
        `camera blocks real window in stage ${gate.stage}`,
      );
      windows++;
    }
    const supports = gate.root.children.filter(
      (o) => o !== root && o !== gate.vault.root,
    );
    ray.far = Infinity;
    for (let x = -6; x <= 6; x += 0.5)
      for (const z of [6.25, 6.6, 6.95]) {
        ray.set(
          new THREE.Vector3(c.x + x, c.y + 19, c.z + z),
          new THREE.Vector3(0, -1, 0),
        );
        assert(
          ray
            .intersectObjects(supports, true)
            .some((h) => h.point.y >= c.y + plan.base - 0.001),
          `missing lintel bearing, stage ${gate.stage}, ${x},${z}`,
        );
        bearings++;
      }
    for (const side of [-1, 1])
      for (const x of [6.1, 6.5, 6.9])
        for (const z of [3.65, 4.6, 5.5, 6.4]) {
          ray.set(
            new THREE.Vector3(c.x + side * x, c.y + 19, c.z + z),
            new THREE.Vector3(0, -1, 0),
          );
          assert(
            ray
              .intersectObjects(supports, true)
              .some((h) => h.point.y >= c.y + plan.shoulderBase - 0.001),
            `missing shoulder bearing, stage ${gate.stage}, ${side * x},${z}`,
          );
          bearings++;
        }
    for (const x of [-5.5, -3, 0, 3, 5.5]) {
      ray.set(
        new THREE.Vector3(c.x + x, c.y + 19, c.z + 6.5),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(root, true)[0],
        support = stationSupport(solid, c.x + x, c.z + 6.5);
      assert(hit && support !== null);
      assert(Math.abs(hit.point.y - support) < 0.001);
      tops++;
    }
  }
  assert(
    windows >= 20 &&
      rays > 2000 &&
      bearings > 700 &&
      tops === 40 &&
      vertices > 10000,
  );
  t.diagnostic(
    `${vertices} facade vertices below the vault, ${rays} physical/render rays, ${windows} clear windows, ${bearings} masonry bearings, ${tops} top supports`,
  );
});

test("archive jamb foundations bury their delivered lower faces and retain the visible pier surfaces for contact", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(),
    covered = new Set();
  let bottomSamples = 0,
    gaps = 0,
    physicalRays = 0;
  for (const gate of game.fieldGates) {
    assert.equal(gate.jambMeshes, undefined);
    const c = gate.root.position,
      { root, beds, solid } = gate.footings;
    for (const bed of beds)
      for (const mesh of root.children) {
        assert(bed.bottom < bed.top);
        const p = mesh.geometry.attributes.position,
          index = mesh.geometry.index;
        for (let i = 0; i < (index?.count ?? p.count); i += 3) {
          const vertices = [0, 1, 2].map((j) =>
            new THREE.Vector3()
              .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
              .applyMatrix4(mesh.matrixWorld),
          );
          if (
            vertices.some(
              (v) =>
                Math.abs(v.y - (c.y + bed.bottom)) > 0.00001 ||
                Math.abs(v.x - c.x - bed.x) > 1,
            )
          )
            continue;
          for (const weights of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [0.5, 0.5, 0],
            [0, 0.5, 0.5],
            [0.5, 0, 0.5],
            [1 / 3, 1 / 3, 1 / 3],
          ]) {
            const v = vertices.reduce(
              (sum, p, i) => sum.addScaledVector(p, weights[i]),
              new THREE.Vector3(),
            );
            assert(v.y < game.groundHeight(v.x, v.z));
            bottomSamples++;
            covered.add(`${gate.stage}:${bed.x}`);
          }
        }
      }
    const materials = new Set();
    gate.root.traverse((o) => {
      if (o.material) materials.add(o.material);
    });
    const sides = [...materials].map((m) => m.side);
    for (const m of materials) m.side = THREE.DoubleSide;
    for (const side of [-1, 1])
      for (const dx of [-0.3, 0, 0.3])
        for (const dz of [-0.4, 0, 0.4, 0.7]) {
          const x = c.x + side * 6.5 + dx,
            z = c.z + 6.5 + dz;
          ray.set(
            new THREE.Vector3(x, c.y + 20, z),
            new THREE.Vector3(0, -1, 0),
          );
          ray.far = Infinity;
          const hits = ray.intersectObject(gate.root, true);
          assert(
            Math.min(...hits.map((h) => h.point.y)) < game.groundHeight(x, z),
            `unseated jamb ${gate.stage} ${x},${z}`,
          );
          gaps++;
        }
    [...materials].forEach((m, i) => (m.side = sides[i]));
    for (const side of [-1, 1])
      for (const dx of [-0.4, 0.4])
        for (const height of [2.35, 4.7]) {
          const from = new THREE.Vector3(
              c.x + side * 6.5 + dx,
              c.y + height,
              c.z + 10,
            ),
            to = from.clone().add(new THREE.Vector3(0, 0, -8));
          ray.set(from, new THREE.Vector3(0, 0, -1));
          ray.far = 8;
          const hit = ray.intersectObject(gate.root, true)[0],
            entry = solid.triangles.entry(from, to);
          assert(hit && entry !== null);
          assert(
            Math.abs(hit.distance - entry * 8) < 0.001,
            `jamb surface disagreement in stage ${gate.stage}`,
          );
          physicalRays++;
        }
  }
  assert(
    bottomSamples > 200 &&
      covered.size === 16 &&
      gaps === 192 &&
      physicalRays === 64,
  );
  t.diagnostic(
    `${bottomSamples} buried lower-face samples, ${gaps} terrain/jamb sections, ${physicalRays} rendered/physical pier rays`,
  );
});

test("archive caps reject the recorded unsupported rest while retaining a clear crown walk-off", (t) => {
  const game = fixture(t),
    gate = game.fieldGates[0],
    c = gate.root.position,
    x = 203.96352549156242,
    z = 70.92658477444273,
    formerHeight = c.y + 8.55;
  assert(
    supportAt(game, x, z, formerHeight, 0.55).height < formerHeight - 1,
    "the body margin must not hold the player beyond the cap's boot reach",
  );
  const arrival = safeArrival(game, { x: 203.5, y: c.y + 8.5, z: 69.5 });
  assert(
    arrival &&
      game.canMove(
        arrival.x,
        arrival.z,
        arrival.y - game.groundHeight(arrival.x, arrival.z),
      ),
  );
  const startZ = c.z + 6.5,
    top = stationSupport(gate.facade.solid, c.x, startZ);
  assert(
    top !== null &&
      game.canMove(c.x, startZ, top - game.groundHeight(c.x, startZ)),
  );
  game.player.position.set(c.x, top, startZ);
  Object.assign(game, {
    jumpY: top - game.groundHeight(c.x, startZ),
    grounded: true,
    velocityY: 0,
    airVelocity: { x: 0, z: 0 },
    jumpBuffer: 0,
  });
  let airborne = false;
  for (let i = 0; i < 240; i++) {
    advanceCharacter(game, { x: 0, z: 3 }, 1 / 60);
    airborne ||= !game.grounded;
    assert(
      game.canMove(game.player.position.x, game.player.position.z, game.jumpY),
    );
  }
  assert(airborne && game.grounded && game.player.position.z > startZ + 2);
  assert(
    Math.abs(
      game.player.position.y -
        game.groundHeight(game.player.position.x, game.player.position.z),
    ) < 0.02,
  );
});
