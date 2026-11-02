import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { normalizeSave } from "../src/storage.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import {
  solarCoverGeometry,
  solarThresholdPose,
  restoreSolarThresholdArrival,
  buildSolarThreshold,
} from "../src/solar-thresholds.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[1],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group(),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: terrain,
      groundHeight: terrain.height,
      walkable: () => true,
      obstacles: [],
      items: [],
      waterMeshes: [],
      flames: [],
      progress: normalizeSave({ version: 1, levels: { sands: { stage: 9 } } })
        .levels.sands,
      player: new T.Group(),
      avatar: new T.Group(),
      grounded: true,
      jumpY: 0,
      velocityY: 0,
      health: 100,
      audio: { tone() {} },
    });
  g.cameraSurfaces = new CameraSurfaces(world);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new T.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    g.items.push(f);
  }
  buildFieldGates(g);
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    const resources = new Set();
    world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    for (const r of resources) r.dispose();
  });
  return g;
}
function closed(geometry) {
  const p = geometry.attributes.position,
    edges = new Map();
  let volume = 0;
  const key = (v) =>
    v
      .toArray()
      .map((x) => Math.round(x * 1e6))
      .join(",");
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, i + j),
    );
    assert(
      v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq() > 1e-14,
    );
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const edge = [key(v[j]), key(v[(j + 1) % 3])].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert([...edges.values()].every((n) => n === 2));
  assert(Math.abs(volume - 12.45 * 0.65625 * 0.06) < 1e-6);
}

test("flush framed covers remain closed outward slabs with two complete material batches", () => {
  for (const n of [6, 7, 8]) {
    const geometry = solarCoverGeometry(n);
    closed(geometry);
    assert.equal(geometry.groups.length, 2);
    assert.equal(
      geometry.groups.reduce((s, g) => s + g.count, 0),
      geometry.attributes.position.count,
    );
    assert(geometry.groups.every((g) => g.count > 0));
    geometry.dispose();
  }
});

test("all nine shutters and sliding covers retain disjoint delivered bounds throughout both directions", (t) => {
  const g = fixture(t);
  let poses = 0;
  for (const gate of g.fieldGates) {
    const record = gate.solarThreshold;
    assert(record);
    g.progress.stage = 0;
    g.progress.field = [];
    const forward = Array.from({ length: 201 }, (_, i) => i);
    for (const i of [...forward, ...forward.toReversed()]) {
      gate.amount = i / 200;
      updateSanctuaryGate(g, gate, 0);
      g.world.updateMatrixWorld(true);
      const door = new T.Box3().setFromObject(gate.door);
      for (const c of record.covers) {
        const box = new T.Box3().setFromObject(c.mesh);
        assert(
          !box.intersectsBox(door),
          `shutter/cover overlap ${gate.stage} at ${gate.amount}`,
        );
        assert(Math.abs(c.solid.bounds.min.z - box.min.z) < 1e-6);
        assert(Math.abs(c.solid.bounds.max.y - box.max.y) < 1e-6);
        assert(
          Math.abs(
            c.solid.h - (box.max.y - g.groundHeight(c.solid.x, c.solid.z)),
          ) < 1e-6,
        );
        for (const o of record.solids.filter(
          (o) => !record.covers.some((c) => c.solid === o),
        )) {
          // Each retained static box is exact. A merged material batch spans
          // both storage pockets and has a broad bound across their empty gap.
          const fixed = new T.Box3(
            new T.Vector3(o.bounds.min.x, o.bounds.min.y, o.bounds.min.z),
            new T.Vector3(o.bounds.max.x, o.bounds.max.y, o.bounds.max.z),
          );
          assert(
            !box.intersectsBox(fixed),
            `cover/storage overlap ${gate.stage} at ${gate.amount}`,
          );
        }
      }
      const expected = solarThresholdPose(gate.amount);
      assert.equal(gate.door.position.y, -7.65 * expected.door);
      poses++;
    }
    // Negative control: closing the crossing before lowering the shutter would
    // put actual delivered cover geometry through its leaf.
    gate.amount = 0;
    updateSanctuaryGate(g, gate, 0);
    const c = record.covers[1],
      saved = c.group.position.z;
    c.group.position.z = 6.5 + 0.328125;
    g.world.updateMatrixWorld(true);
    assert(
      new T.Box3()
        .setFromObject(c.mesh)
        .intersectsBox(new T.Box3().setFromObject(gate.door)),
    );
    c.group.position.z = saved;
  }
  assert.equal(poses, 3618);
  for (const level of LEVELS.filter((l) => l.biome !== "desert"))
    assert.equal(buildSolarThreshold({ level }, {}, {}), null);
});

test("all threshold surfaces provide exact point support, safe crossing routes and stable older-soil arrivals", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let probes = 0,
    legs = 0;
  for (const gate of g.fieldGates) {
    const r = gate.solarThreshold,
      c = gate.root.position;
    for (const dx of [-5.9, -3.1, -1.4, 0, 0.8, 2.6, 5.9])
      for (const dz of [
        -1.18, -0.95, -0.7, -0.5, -0.2, 0, 0.2, 0.5, 0.7, 0.95, 1.18,
      ]) {
        const x = c.x + dx,
          z = c.z + 6.5 + dz;
        ray.set(new T.Vector3(x, c.y + 2, z), new T.Vector3(0, -1, 0));
        ray.far = 5;
        const hit = ray.intersectObject(r.root, true)[0],
          floor = supportAt(g, x, z, Infinity, 0).height;
        assert(hit);
        assert(
          Math.abs(hit.point.y - floor) < 2e-5,
          `${gate.stage} floor at ${dx}/${dz}`,
        );
        assert(
          g.cameraSurfaces.entry(
            new T.Vector3(x, c.y + 1, z),
            new T.Vector3(x, c.y - 1, z),
            0,
          ) < 1,
        );
        probes++;
      }
    for (const dx of [-3.5, 0, 3.5]) {
      g.player.position.set(
        c.x + dx,
        g.groundHeight(c.x + dx, c.z + 3.8),
        c.z + 3.8,
      );
      g.jumpY = 0;
      g.grounded = true;
      g.velocityY = 0;
      for (const target of [c.z + 9, c.z + 3.8]) {
        let reached = false;
        const wetBank =
          g.groundHeight(g.player.position.x, g.player.position.z) < c.y - 0.45;
        for (let i = 0; i < 300; i++) {
          const distance = target - g.player.position.z;
          if (Math.abs(distance) < 0.025) {
            reached = true;
            break;
          }
          const before = g.player.position.clone();
          advanceCharacter(
            g,
            new T.Vector3(
              0,
              0,
              Math.sign(distance) * Math.min(3, Math.abs(distance) * 60),
            ),
            1 / 60,
            i === 0 && wetBank,
          );
          assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
          assert(Math.abs(g.player.position.x - before.x) < 1e-6);
          assert(Math.abs(g.player.position.z - before.z) <= 0.051);
        }
        assert(
          reached,
          `crossing blocked ${gate.stage} lane ${dx} at ${g.player.position.toArray()} toward ${target}`,
        );
        for (let i = 0; i < 60; i++)
          advanceCharacter(g, new T.Vector3(), 1 / 60);
        legs++;
      }
    }
    g.progress.position = { x: c.x, z: c.z + 6.5, height: 0 };
    g.player.position.set(c.x, g.groundHeight(c.x, c.z + 6.5), c.z + 6.5);
    g.yaw = 0.3;
    g.pitch = 0.12;
    assert(restoreSolarThresholdArrival(g));
    assert(Math.abs(g.jumpY - 0.1) < 1e-6);
    assert.deepEqual(
      [g.player.position.x, g.player.position.z, g.yaw, g.pitch],
      [c.x, c.z + 6.5, 0.3, 0.12],
    );
    g.progress.position.height = 1.5;
    g.player.position.y = g.groundHeight(c.x, c.z + 6.5) + 1.5;
    assert.equal(restoreSolarThresholdArrival(g), false);
  }
  assert.equal(probes, 693);
  assert.equal(legs, 54);
});
