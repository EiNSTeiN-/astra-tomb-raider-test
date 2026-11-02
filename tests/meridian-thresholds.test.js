import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { buildCourtDais } from "../src/court-dais.js";
import {
  advanceCharacter,
  safeArrival,
  supportAt,
} from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { restoreMeridianThresholdArrival } from "../src/meridian-thresholds.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[7],
    map = createMap(level),
    world = new THREE.Group(),
    store = new SaveStore({ getItem: () => null, setItem() {} }),
    stoneMat = new THREE.MeshStandardMaterial(),
    darkMat = new THREE.MeshStandardMaterial();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    store,
    progress: store.level(level.id),
    terrainProfile: createTerrainProfile(map, level),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    obstacles: [],
    items: map.features.filter((f) => f.type === "mechanism"),
    elapsed: 0,
    jumpY: 0,
    velocityY: 0,
    grounded: true,
    stamina: 100,
    health: 100,
    traversalCourses: [],
    courtDaises: [],
    courtDaisMaterials: null,
    stoneMat,
    darkMat,
    audio: { tone() {}, noiseHit() {} },
    cameraSurfaces: new CameraSurfaces(world),
  });
  for (const room of map.rooms) if (room.index > 1) buildCourtDais(g, room);
  buildFieldGates(g);
  world.updateMatrixWorld(true);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat().filter(Boolean)) {
        materials.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      }
    });
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    stoneMat.dispose();
    darkMat.dispose();
  });
  return g;
}
function open(g, stage) {
  g.progress.stage = stage;
  g.progress.field = [0, 1, 2].map((i) => `field-${stage}-${i}`);
  for (const gate of g.fieldGates) updateSanctuaryGate(g, gate, 100);
  g.world.updateMatrixWorld(true);
}
function place(g, x, z) {
  const y = supportAt(g, x, z).height;
  g.player.position.set(x, y, z);
  g.jumpY = y - g.groundHeight(x, z);
  g.velocityY = 0;
  g.grounded = true;
  g.fallPeak = y;
}

test("the five raised Meridian gates have buried closed thresholds with usable stone projection", (t) => {
  const g = fixture(t),
    gates = g.fieldGates.filter((p) => p.threshold);
  assert.deepEqual(
    gates.map((p) => p.stage),
    [0, 2, 4, 6, 8],
  );
  for (const gate of gates) {
    const f = gate.threshold,
      geo = f.mesh.geometry,
      p = geo.attributes.position,
      uv = geo.attributes.uv,
      edges = new Map();
    let volume = 0;
    assert(geo.attributes.normal.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, i + j),
        ),
        keys = v.map((a) =>
          a
            .toArray()
            .map((n) => Math.round(n * 1e6))
            .join(","),
        );
      volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
      const area =
        (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) -
        (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i));
      assert(Math.abs(area) > 1e-8, "no collapsed depth-face mapping");
      for (let j = 0; j < 3; j++) {
        const key = [keys[j], keys[(j + 1) % 3]].sort().join("|");
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert(volume > 0);
    assert([...edges.values()].every((n) => n === 2));
    const box = new THREE.Box3().setFromObject(f.mesh);
    assert(box.max.y <= gate.root.position.y + 1e-5);
    assert(box.min.y <= f.bottom + 1e-5);
    for (let iz = 0; iz <= 24; iz++)
      for (let ix = 0; ix <= 32; ix++) {
        const x = THREE.MathUtils.lerp(box.min.x, box.max.x, ix / 32),
          z = THREE.MathUtils.lerp(box.min.z, box.max.z, iz / 24);
        assert(f.bottom < g.groundHeight(x, z) - 0.18);
      }
    assert.equal(f.solid.supportRadius, 0);
    assert(f.solid.groundingSlope);
    assert(g.cameraSurfaces.count > 0);
  }
});

test("all repaired leaf bottoms meet real rendered stone through the door opening", (t) => {
  const g = fixture(t),
    ray = new THREE.Raycaster();
  let points = 0;
  for (const gate of g.fieldGates.filter((p) => p.threshold))
    for (let i = -23; i <= 23; i++)
      for (const dz of [-0.2, 0, 0.2]) {
        const x = gate.root.position.x + i * 0.25,
          z = gate.root.position.z + 6.5 + dz;
        ray.set(
          new THREE.Vector3(x, gate.root.position.y + 8, z),
          new THREE.Vector3(0, -1, 0),
        );
        ray.far = 12;
        const floor = ray.intersectObject(gate.threshold.root, true)[0];
        assert(floor);
        assert(Math.abs(floor.point.y - gate.root.position.y) < 1e-5);
        ray.set(
          new THREE.Vector3(x, gate.root.position.y - 2, z),
          new THREE.Vector3(0, 1, 0),
        );
        const leaf = ray.intersectObject(gate.door, true)[0];
        if (!leaf) continue;
        assert(leaf.point.y - floor.point.y < 0.015);
        points++;
      }
  assert(points > 600);
});

test("closed gates stop walking while each open threshold permits continuous crossings and returns", (t) => {
  const g = fixture(t);
  let ticks = 0;
  for (const gate of g.fieldGates.filter((p) => p.threshold)) {
    g.progress.stage = gate.stage;
    g.progress.field = [];
    updateSanctuaryGate(g, gate, 100);
    const x = gate.root.position.x - 3.5,
      z = gate.root.position.z;
    place(g, x, z + 12);
    for (let i = 0; i < 420; i++) advanceCharacter(g, { x: 0, z: -2 }, 1 / 60);
    assert(
      g.player.position.z > z + 6.5,
      "a raised threshold cannot bypass the closed leaf",
    );
    open(g, gate.stage);
    for (const dx of [-3.5, 0, 3.5]) {
      place(g, gate.root.position.x + dx, z + 12);
      for (const direction of [-1, 1]) {
        for (let i = 0; i < 420; i++) {
          advanceCharacter(g, { x: 0, z: direction * 2 }, 1 / 60);
          assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
          ticks++;
        }
        assert(
          Math.abs(g.player.position.z - (direction < 0 ? z - 2 : z + 12)) <
            0.1,
        );
      }
      assert.equal(g.health, 100);
    }
  }
  assert.equal(ticks, 12600);
});

test("older soil saves rise onto a clear threshold and earned threshold saves retain their elevation", (t) => {
  const g = fixture(t);
  for (const gate of g.fieldGates.filter((p) => p.threshold)) {
    open(g, gate.stage);
    const x = gate.root.position.x - 3.5,
      z = gate.root.position.z + 6.5,
      ground = g.groundHeight(x, z),
      solid = gate.threshold.solid,
      index = g.obstacles.indexOf(solid);
    g.obstacles.splice(index, 1);
    assert(
      g.canMove(x, z, 0),
      "reproduce a valid pre-threshold open-door save",
    );
    g.obstacles.splice(index, 0, solid);
    g.progress.position = { x, z, height: 0 };
    g.progress.camera = { yaw: 0.3, pitch: -0.2 };
    const before = structuredClone(g.progress);
    g.player.position.set(x, ground, z);
    g.jumpY = 0;
    assert(restoreMeridianThresholdArrival(g));
    restoreTraversal(g);
    const arrival = safeArrival(g, g.player.position);
    assert(arrival);
    g.player.position.set(arrival.x, arrival.y, arrival.z);
    assert.equal(g.player.position.x, x);
    assert.equal(g.player.position.z, z);
    assert(Math.abs(g.player.position.y - gate.root.position.y) < 1e-5);
    assert(g.canMove(x, z, g.jumpY));
    before.position.height = g.jumpY;
    assert.deepEqual(g.progress, before);
    assert.equal(restoreMeridianThresholdArrival(g), false);
    const height = g.jumpY;
    g.progress.position.height = height;
    g.player.position.y = ground;
    assert.equal(restoreMeridianThresholdArrival(g), false);
    restoreTraversal(g);
    assert(Math.abs(g.player.position.y - (ground + height)) < 1e-5);
    assert.equal(restoreMeridianThresholdArrival(g), false);
    // A recorded height above this floor belongs to another arrival path.
    g.progress.position.height = height + 2;
    g.player.position.y = ground;
    assert.equal(restoreMeridianThresholdArrival(g), false);
    assert.equal(g.progress.position.height, height + 2);
  }
});
