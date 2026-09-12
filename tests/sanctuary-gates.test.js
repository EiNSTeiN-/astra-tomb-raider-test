import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { SaveStore } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { Adventure } from "../src/game.js";
import { buildFieldGates } from "../src/field-world.js";
import {
  buildSanctuaryGate,
  gateMaterials,
  updateSanctuaryGate,
} from "../src/sanctuary-gates.js";
import { GATE_DESIGNS, gateLeafBounds } from "../src/gate-designs.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import {
  skyGateWallGeometry,
  hingeStrapGeometry,
  hingeBarrelGeometry,
} from "../src/sky-gate-art.js";

function fixture(t, index, saved = null, all = false) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[index],
    map = createMap(level),
    terrain = createTerrainProfile(map, level);
  const memory = new Map(),
    storage = {
      getItem: (k) => memory.get(k),
      setItem: (k, v) => memory.set(k, v),
    };
  const store = new SaveStore(storage),
    world = new THREE.Group(),
    hits = [];
  const progress = store.level(level.id);
  if (saved) Object.assign(progress, saved);
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    store,
    progress,
    terrainProfile: terrain,
    player: new THREE.Group(),
    obstacles: [],
    elapsed: 0,
    items: map.features.filter((f) => f.type === "mechanism"),
    cameraSurfaces: new CameraSurfaces(world),
    audio: { noiseHit: (...args) => hits.push(args) },
  });
  if (all) buildFieldGates(game);
  else
    game.fieldGates = [
      buildSanctuaryGate(game, game.items[0], gateMaterials(level)),
    ];
  game.soundSources = game.fieldGates.flatMap((g) =>
    g.sources.map((s) => ({ ...s })),
  );
  game.cameraSurfaces.rebuild();
  t.after(() => world.traverse((o) => o.geometry?.dispose()));
  return { game, gate: game.fieldGates[0], hits, storage };
}
function open(game, gate) {
  game.progress.field = [0, 1, 2].map((i) => `field-${gate.stage}-${i}`);
  for (let i = 0; i < 200; i++) {
    game.elapsed += 1 / 30;
    updateSanctuaryGate(game, gate, 1 / 30);
  }
}

test("all 69 chapter gates have regional construction, finite batches, retained camera surfaces, and a clear restored threshold", (t) => {
  assert.equal(
    new Set(Object.values(GATE_DESIGNS).map((d) => d.panel)).size,
    8,
  );
  assert.equal(
    Object.values(GATE_DESIGNS).filter((d) => d.motion === "hinge").length,
    4,
  );
  let total = 0;
  for (let index = 0; index < 8; index++) {
    const { game } = fixture(t, index, null, true);
    assert.equal(game.gateSources.length, game.fieldGates.length * 2);
    assert.equal(game.cameraSurfaces.pending.length, 0);
    assert.equal(
      game.cameraSurfaces.dynamic.length,
      game.fieldGates.length * 2,
    );
    game.world.traverse((o) => {
      if (!o.geometry) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.array.length; i++)
        assert.ok(Number.isFinite(p.array[i]), o.name);
      if (o.isMesh) {
        assert.ok(o.geometry.attributes.normal);
        assert.ok(o.geometry.attributes.uv);
      }
    });
    for (const gate of game.fieldGates) {
      total++;
      for (const leaf of gate.leaves) {
        const bounds = new THREE.Box3().setFromObject(leaf.group);
        assert.ok(
          bounds.max.y < gate.root.position.y + 7.5,
          `${game.level.id}: relief stays inside its leaf`,
        );
      }
      const c = gate.root.position;
      assert.equal(
        game.canMove(c.x, c.z + 6.5, 0),
        false,
        `${game.level.id} ${gate.stage} locked`,
      );
      assert.equal(gate.design, GATE_DESIGNS[game.level.biome]);
      game.progress.field.push(
        ...[0, 1, 2].map((i) => `field-${gate.stage}-${i}`),
      );
      updateSanctuaryGate(game, gate, 100);
      for (const dx of [-3, 0, 3])
        for (const dz of [5.8, 6.5, 7.2])
          assert.equal(
            game.canMove(c.x + dx, c.z + dz, 0),
            true,
            `${game.level.id} ${gate.stage} threshold ${dx},${dz}`,
          );
    }
  }
  assert.equal(total, 69);
});

test("coastal sluice footings meet the terrain across their full width and protect submerged camera approaches", (t) => {
  const { game } = fixture(t, 3, null, true),
    ray = new THREE.Raycaster();
  game.world.updateMatrixWorld(true);
  let rays = 0,
    immersed = 0;
  for (const gate of game.fieldGates) {
    assert.equal(gate.foundations.length, 5);
    const origin = gate.root.position;
    for (const footing of gate.foundations) {
      for (const u of [-0.45, -0.22, 0, 0.22, 0.45])
        for (const v of [-0.45, -0.22, 0, 0.22, 0.45]) {
          const x = origin.x + footing.x + u * footing.width,
            z = origin.z + footing.z + v * footing.depth,
            ground = game.groundHeight(x, z);
          ray.set(
            new THREE.Vector3(x, origin.y - 30, z),
            new THREE.Vector3(0, 1, 0),
          );
          const hit = ray.intersectObject(gate.root, true)[0];
          assert.ok(hit, `foundation exists at ${gate.stage}/${x}/${z}`);
          assert.ok(
            hit.point.y <= ground + 0.025,
            `foundation meets bank at ${gate.stage}/${x}/${z}`,
          );
          rays++;
        }
      // Approach the wider jamb from its exposed well side. Its new submerged
      // stone must stop both the camera and the diver, as the dry post does.
      if (footing.width !== 1.7) continue;
      const x = origin.x + footing.x,
        z = origin.z + footing.z + footing.depth / 2 - 0.15,
        ground = game.groundHeight(x, z),
        y = (ground + origin.y) / 2;
      if (origin.y - ground < 0.7) continue;
      assert.equal(game.canMove(x, z, y - ground, 0.8), false);
      assert.ok(
        game.cameraSurfaces.entry(
          new THREE.Vector3(x, y, z + 2),
          new THREE.Vector3(x, y, z),
        ) < 1,
      );
      immersed++;
    }
  }
  assert.equal(rays, 1125);
  assert.ok(immersed >= 5, "all five sounding wells exercise a submerged jamb");
});

test("all 105 regional chamber walls have sealed deep recesses and buried full-width footings", (t) => {
  const ray = new THREE.Raycaster();
  let walls = 0,
    niches = 0,
    feet = 0;
  for (const index of [3, 4, 6, 7]) {
    const { game } = fixture(t, index, null, true);
    game.world.updateMatrixWorld(true);
    for (const gate of game.fieldGates) {
      assert.equal(gate.walls.length, 3);
      for (const wall of gate.walls) {
        walls++;
        const matrix = new THREE.Matrix4().makeRotationY(wall.angle);
        matrix.setPosition(
          new THREE.Vector3(...wall.position).add(gate.root.position),
        );
        const point = (x, y, z) =>
          new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        const direction = new THREE.Vector3(0, 0, -1).transformDirection(
          matrix,
        );
        for (const cx of wall.bays) {
          let deepest = 0,
            cameraDepth = 0;
          for (const dx of [-0.32, 0.12, 0.42])
            for (const t of [0.24, 0.46, 0.68]) {
              const y = wall.bottom + (wall.top - wall.bottom) * t;
              const start = point(cx + wall.radius * dx, y, 2);
              ray.set(start, direction);
              const hit = ray.intersectObject(gate.root, true)[0];
              assert.ok(
                hit && hit.distance < 2.5,
                `${index}/${gate.stage}/${wall.side}: sealed inset`,
              );
              deepest = Math.max(deepest, hit.distance);
              cameraDepth = Math.max(
                cameraDepth,
                3 *
                  game.cameraSurfaces.entry(
                    start,
                    point(cx + wall.radius * dx, y, -1),
                    0,
                  ),
              );
            }
          assert.ok(
            deepest > 1.9,
            `${index}/${gate.stage}/${wall.side}: actual masonry recess`,
          );
          assert.ok(
            cameraDepth > 1.9 && cameraDepth < 2.5,
            "camera retains recess and closed backing after batching",
          );
          niches++;
        }
        for (const t of [-0.47, -0.22, 0, 0.22, 0.47])
          for (const d of [-0.7, 0, 0.7]) {
            const sample = point(wall.length * t, -30, d);
            ray.set(sample, new THREE.Vector3(0, 1, 0));
            const hit = ray.intersectObject(gate.root, true)[0];
            assert.ok(hit, "support exists below full moulding footprint");
            assert.ok(
              hit.point.y < game.groundHeight(sample.x, sample.z) - 0.06,
              `${index}/${gate.stage}/${wall.side}: footing below terrain`,
            );
            feet++;
          }
      }
    }
  }
  assert.equal(walls, 105);
  assert.ok(niches > 300);
  assert.equal(feet, 1575);
});

test("hinged collision bounds contain the transformed door corners throughout the inward swing", () => {
  for (const side of [-1, 1])
    for (let i = 0; i <= 20; i++) {
      const b = gateLeafBounds(side, i / 20),
        matrix = new THREE.Matrix4().makeRotationY(b.angle);
      for (const x of [0, -side * 6.2])
        for (const z of [-0.3, 0.3]) {
          const p = new THREE.Vector3(x, 0, z)
            .applyMatrix4(matrix)
            .add(new THREE.Vector3(side * 6.2, 0, 6.5));
          assert.ok(Math.abs(p.x - b.x) <= b.w + 1e-9);
          assert.ok(Math.abs(p.z - b.z) <= b.d + 1e-9);
        }
      if (i === 20) {
        assert.ok(Math.abs(b.x) - b.w >= 5.65);
        assert.ok(b.z + b.d <= 6.8);
      }
    }
});

test("open bronze leaves never show through the exterior side-wall recesses", (t) => {
  const ray = new THREE.Raycaster();
  let rays = 0;
  for (const index of [3, 7]) {
    const { game } = fixture(t, index, null, true);
    for (const gate of game.fieldGates) {
      for (const amount of [0, 0.5, 1]) {
        gate.amount = amount;
        updateSanctuaryGate(game, gate, 0);
        game.world.updateMatrixWorld(true);
        for (const wall of gate.walls.filter((w) => w.side !== 0)) {
          const matrix = new THREE.Matrix4().makeRotationY(wall.angle);
          matrix.setPosition(
            new THREE.Vector3(...wall.position).add(gate.root.position),
          );
          const direction = new THREE.Vector3(0, 0, -1).transformDirection(
            matrix,
          );
          for (const cx of wall.bays)
            for (const dx of [-0.4, 0, 0.4])
              for (const t of [0.25, 0.5, 0.75]) {
                const origin = new THREE.Vector3(
                  cx + wall.radius * dx,
                  wall.bottom + (wall.top - wall.bottom) * t,
                  2,
                ).applyMatrix4(matrix);
                ray.set(origin, direction);
                const hit = ray.intersectObject(gate.root, true)[0];
                assert.ok(hit && hit.distance < 2.1);
                for (let parent = hit.object; parent; parent = parent.parent)
                  assert.notEqual(
                    parent,
                    gate.door,
                    `${index}/${gate.stage}/${wall.side}/${amount}: door exposed through masonry`,
                  );
                rays++;
              }
        }
      }
    }
  }
  assert.ok(rays > 2700);
});

test("both door motions carry camera collision and hardware through opening without stale closed bounds", (t) => {
  for (const index of [0, 2, 5]) {
    const { game, gate, hits } = fixture(t, index),
      c = gate.root.position;
    const a = c.clone().add(new THREE.Vector3(0, 2, 4)),
      b = c.clone().add(new THREE.Vector3(0, 2, 10));
    assert.ok(game.cameraSurfaces.entry(a, b) < 1);
    game.progress.field = ["field-0-0", "field-0-1", "field-0-2"];
    updateSanctuaryGate(game, gate, 0.2);
    assert.ok(gate.amount > 0 && gate.amount < 1);
    assert.ok(gate.wheels[0].rotation.z > 0);
    if (gate.design.motion === "sink") {
      assert.ok(gate.door.position.y < 0);
      assert.ok(gate.weights[0].position.y > 1.2);
      const top =
        game.groundHeight(gate.obstacle.x, gate.obstacle.z) + gate.obstacle.h;
      assert.ok(Math.abs(top - (c.y + 7.4 + gate.door.position.y)) < 1e-9);
    } else
      assert.ok(gate.leaves.every((l) => Math.abs(l.group.rotation.y) > 0));
    const amount = gate.amount;
    updateSanctuaryGate(game, gate, 0);
    assert.equal(gate.amount, amount);
    open(game, gate);
    assert.equal(gate.amount, 1);
    assert.equal(game.cameraSurfaces.entry(a, b), 1);
    assert.equal(game.canMove(c.x, c.z + 6.5, 0), true);
    assert.equal(hits.length, 1);
    assert.ok(
      hits[0][3].distanceTo(c.clone().add(new THREE.Vector3(0, 1.2, 7.8))) <
        1e-9,
    );
    const end = gate.wheels[0].rotation.z;
    updateSanctuaryGate(game, gate, 1);
    assert.equal(gate.wheels[0].rotation.z, end);
    assert.equal(hits.length, 1);
  }
});

test("three field seals display partial restoration and the moving drive is silent at either resting state", (t) => {
  const { game, gate } = fixture(t, 2),
    color = new THREE.Color();
  updateSoundSources(game);
  assert.ok(game.soundSources.every((s) => s.activity === 0));
  game.progress.field = ["field-0-0", "field-0-1"];
  updateSanctuaryGate(game, gate, 0.1);
  for (let i = 0; i < 3; i++) {
    gate.seals.getColorAt(i, color);
    assert.equal(color.r > 1, i < 2);
  }
  assert.equal(gate.amount, 0);
  game.player.position.copy(gate.root.position);
  game.progress.field.push("field-0-2");
  updateSanctuaryGate(game, gate, 0.1);
  updateSoundSources(game);
  assert.ok(
    game.soundSources.every(
      (s) =>
        s.activity > 0 && s.activity <= 1 && s.near === 2 && s.range === 34,
    ),
  );
  assert.equal(gate.dust.visible, true);
  assert.equal(gate.dust.material.transparent, true);
  open(game, gate);
  updateSanctuaryGate(game, gate, 0.1);
  updateSoundSources(game);
  assert.ok(game.soundSources.every((s) => s.activity === 0));
  assert.equal(gate.dust.visible, false);
});

test("existing field saves restore finished doors silently and preserve unfinished field work without a new save schema", (t) => {
  for (const index of [0, 2, 5])
    for (const saved of [
      { field: ["field-0-0"] },
      { field: ["field-0-0", "field-0-1", "field-0-2"] },
      { stage: 1 },
      { completed: true },
    ]) {
      const { game, gate, hits, storage } = fixture(t, index, saved);
      game.store.save();
      const restored = new SaveStore(storage).level(game.level.id);
      assert.deepEqual(restored.field, game.progress.field);
      const expected = saved.field?.length === 1 ? 0 : 1;
      assert.equal(gate.amount, expected);
      updateSanctuaryGate(game, gate, 0);
      updateSoundSources(game);
      assert.equal(hits.length, 0);
      assert.ok(game.soundSources.every((s) => s.activity === 0));
      assert.equal(
        game.canMove(gate.root.position.x, gate.root.position.z + 6.5, 0),
        !!expected,
      );
    }
});

test("small drive gears retain a continuous rim between every pair of teeth", (t) => {
  const { game, gate } = fixture(t, 0),
    wheel = gate.wheels[0];
  game.world.updateMatrixWorld(true);
  const center = wheel.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  for (let i = 0; i < 14; i++) {
    const a = ((i + 0.875) * Math.PI * 2) / 14;
    ray.set(
      center
        .clone()
        .add(new THREE.Vector3(Math.cos(a) * 0.49, Math.sin(a) * 0.49, 0.5)),
      new THREE.Vector3(0, 0, -1),
    );
    assert.ok(
      ray.intersectObject(wheel, true).length,
      `rim gap between teeth ${i} and ${(i + 1) % 14}`,
    );
  }
});

test("fitted gate walls remain solid across niche heads and retain deep stone backs", () => {
  const geometry = skyGateWallGeometry(13.8, -0.8, 4219),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(geometry, material),
    ray = new THREE.Raycaster();
  for (let x = -6.65; x < 6.7; x += 0.43)
    for (const y of [-0.6, 0.5, 1.6, 2.9, 4.7, 4.8, 6.8]) {
      ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
      assert.ok(
        ray.intersectObject(mesh)[0]?.distance < 4,
        `solid backing at ${x}/${y}`,
      );
    }
  for (const x of geometry.userData.niches) {
    ray.set(new THREE.Vector3(x, 3, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(
      hit.distance > 3.1 && hit.distance < 3.5,
      "niches have deep reveals",
    );
  }
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
  geometry.dispose();
  material.dispose();
});

test("sky hinges retain a clear pin bore and outward mirrored straps, and batched materials follow their leaves", (t) => {
  const barrel = hingeBarrelGeometry(),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(barrel, material),
    ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(
    ray.intersectObject(mesh).length,
    0,
    "the hinge pin hole remains open",
  );
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ray.set(
      new THREE.Vector3(Math.cos(a) * 0.14, 1, Math.sin(a) * 0.14),
      new THREE.Vector3(0, -1, 0),
    );
    assert.ok(ray.intersectObject(mesh).length, "continuous bearing ring");
  }
  barrel.dispose();
  material.dispose();
  for (const side of [-1, 1]) {
    const geometry = hingeStrapGeometry(side),
      p = geometry.attributes.position;
    let volume = 0;
    for (let i = 0; i < p.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) =>
        new THREE.Vector3().fromBufferAttribute(p, i + k),
      );
      volume += a.dot(b.cross(c)) / 6;
    }
    assert.ok(volume > 0, "mirroring the strap retains outward faces");
    assert.ok(p.array.every(Number.isFinite));
    geometry.dispose();
  }
  const { game, gate } = fixture(t, 5);
  game.world.traverse((o) => {
    if (!o.geometry || !o.material) return;
    const count = o.geometry.attributes.position.count;
    if (o.material.userData.windMetal) {
      assert.equal(o.geometry.attributes.windCoord.count, count);
      assert.equal(o.geometry.attributes.windCavity.count, count);
    }
    if (o.material.userData.skyGateTimber)
      assert.equal(o.geometry.attributes.gateTimberCoord.count, count);
  });
  for (const leaf of gate.leaves) {
    assert.ok(
      leaf.group.children.some((o) => !!o.geometry?.attributes.gateTimberCoord),
    );
    assert.ok(leaf.detail.children.some((o) => o.material?.userData.windMetal));
    const timber = [];
    leaf.group.traverse((o) => {
      if (o.isMesh && o.material.userData.skyGateTimber) timber.push(o);
    });
    game.world.updateMatrixWorld(true);
    for (const yy of [1, 3.4, 6.8])
      for (const along of [0.48, 1.25, 2.4, 3.6, 4.85]) {
        const bolt = leaf.group.localToWorld(
          new THREE.Vector3(-leaf.side * (along + 0.23), yy, 0.37),
        );
        ray.set(bolt, new THREE.Vector3(0, 0, -1));
        assert.ok(
          ray.intersectObjects(timber, false)[0]?.distance < 0.18,
          "each strap bolt seats in a timber rail",
        );
      }
  }
  open(game, gate);
  game.world.updateMatrixWorld(true);
  for (const leaf of gate.leaves) {
    const bounds = new THREE.Box3().setFromObject(leaf.group);
    assert.ok(
      Math.max(
        Math.abs(bounds.min.x - gate.root.position.x),
        Math.abs(bounds.max.x - gate.root.position.x),
      ) < 7.35,
      "open fittings remain within side-wall footprint",
    );
  }
});
