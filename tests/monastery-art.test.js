import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import {
  monasteryPlan,
  buildMonasteryArchitecture,
  updateMonasteryArchitecture,
} from "../src/monastery-architecture.js";
import { buildBannerLine, clothDisplacement } from "../src/monastery-cloth.js";
import { snowMountainGeometry } from "../src/snow-mountains.js";

test("intact and broken roof decks and snow caps are sealed outward-facing solids", () => {
  for (const damage of [0, 1, 2])
    for (const snow of [false, true]) {
      const geometry = monasteryRoofGeometry({
        width: 14.7,
        depth: 8.3,
        rise: 2.15,
        damage,
        snow,
        seed: 4,
      });
      const p = geometry.attributes.position,
        indices = geometry.index.array;
      assert.ok(p.array.every(Number.isFinite));
      assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
      const edges = new Map();
      let volume = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const ids = [...indices.slice(i, i + 3)];
        const [a, b, c] = ids.map((index) =>
          new THREE.Vector3().fromBufferAttribute(p, index),
        );
        volume += a.dot(b.cross(c)) / 6;
        for (let j = 0; j < 3; j++) {
          const edge = [ids[j], ids[(j + 1) % 3]]
            .sort((x, y) => x - y)
            .join(",");
          edges.set(edge, (edges.get(edge) || 0) + 1);
        }
      }
      assert.ok(
        volume > 9,
        `damage=${damage}, snow=${snow}: positive enclosed volume`,
      );
      assert.ok([...edges.values()].every((count) => count === 2));
      geometry.dispose();
    }
});

test("roof damage removes both slate and snow while the center remains supported", () => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  const material = new THREE.MeshBasicMaterial();
  for (const damage of [1, 2])
    for (const snow of [false, true]) {
      const g = monasteryRoofGeometry({
        width: 14.7,
        depth: 8.3,
        rise: 2.15,
        damage,
        snow,
      });
      const mesh = new THREE.Mesh(g, material);
      ray.ray.origin.set(
        damage === 1 ? -6.4 : 6.4,
        10,
        damage === 1 ? 3.1 : -3.1,
      );
      assert.equal(
        ray.intersectObject(mesh).length,
        0,
        "broken corner is open through both shells",
      );
      ray.ray.origin.set(0, 10, 0);
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit?.point.y > 2);
      g.dispose();
    }
  material.dispose();
});

test("nine monastery plans leave both court axes and all nearby objective approaches clear", () => {
  const map = createMap(LEVELS[2]),
    plans = new Set();
  for (const room of map.rooms) {
    const plan = monasteryPlan(room);
    plans.add(JSON.stringify(plan));
    for (const post of plan.posts) {
      assert.ok(Math.abs(post.x) - (post.width + 0.22) / 2 > 3);
      assert.ok(Math.abs(post.z) - (post.width + 0.22) / 2 > 3);
      for (const f of map.features) {
        const dx = Math.abs(f.x * 7 - room.x * 7 - post.x),
          dz = Math.abs(f.z * 7 - room.z * 7 - post.z);
        assert.ok(
          dx > (post.width + 0.22) / 2 + 2 || dz > (post.width + 0.22) / 2 + 2,
          `court ${room.index}, ${f.id}: two-metre approach`,
        );
      }
    }
  }
  assert.equal(plans.size, 9);
});

test("built monastery grounds its supports, preserves routes under upper rooms and retains animated objects after batching", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    groundHeight: (x, z) => profile.height(x, z),
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    elapsed: 13,
    player: { position: new THREE.Vector3() },
    store: { data: { settings: { quality: "high" } } },
  });
  assert.equal(buildMonasteryArchitecture(game), true);
  game.cameraSurfaces.rebuild();
  assert.equal(game.monasteryPatches.length, 9);
  assert.ok(game.cameraSurfaces.count < 700);
  for (const [i, patch] of game.monasteryPatches.entries()) {
    const room = map.rooms[i],
      x = room.x * 7,
      z = room.z * 7,
      y = game.groundHeight(x, z);
    assert.ok(
      patch.root.children.length < 15,
      "static structure batches per material",
    );
    assert.equal(patch.flags.mesh.parent, patch.root);
    assert.equal(patch.flags.cord.parent, patch.root);
    for (const [dx, dz] of [
      [0, 0],
      [0, -18],
      [-14, -21],
      [-14, -14],
      [14, -21],
      [19, 0],
      [-19, 0],
    ]) {
      assert.equal(
        game.canMove(x + dx, z + dz, 0),
        true,
        `court ${i}: ${dx},${dz}`,
      );
    }
    for (const px of [0, -14, 14]) {
      const feet = game.groundHeight(x + px, z - 18);
      assert.equal(
        game.cameraSurfaces.entry(
          new THREE.Vector3(x + px, feet + 2, z - 14),
          new THREE.Vector3(x + px, feet + 2, z - 24),
        ),
        1,
        "camera passes beneath halls",
      );
    }
    assert.ok(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x - 14, y + 8, z - 14),
        new THREE.Vector3(x - 14, y + 8, z - 24),
      ) < 1,
      "camera stops at elevated plaster wall",
    );
    for (const post of patch.plan.posts) {
      const px = x + post.x,
        pz = z + post.z;
      assert.equal(game.canMove(px, pz, 0), false);
      const o = game.obstacles.find((o) => o.x === px && o.z === pz);
      assert.ok(
        Math.abs(game.groundHeight(px, pz) + o.h - (y + post.top)) < 0.00001,
      );
    }
    const wind = game.monasteryWindSources[i];
    assert.ok(Math.abs(wind.z - (z + patch.flags.a.z)) < 0.001);
    assert.ok(wind.y > y + 4 && wind.y < y + 7);
  }
  game.player.position.copy(game.monasteryPatches[0].center);
  updateMonasteryArchitecture(game);
  assert.equal(game.monasteryTime.value, 13);
  assert.equal(game.monasteryPatches[0].detail.visible, true);
  game.player.position.set(-500, 0, -500);
  updateMonasteryArchitecture(game);
  const first = game.monasteryPatches[0];
  assert.equal(first.flags.mesh.visible, false);
  assert.equal(first.flags.cord.visible, false);
  assert.equal(first.detail.visible, false);
  assert.equal(first.root.visible, true);
  world.traverse((o) => {
    o.geometry?.dispose();
    o.customDepthMaterial?.dispose();
  });
  game.level = LEVELS[1];
  assert.equal(buildMonasteryArchitecture(game), false);
  assert.equal(game.monasteryTime, null);
  assert.deepEqual(game.monasteryWindSources, {});
  assert.deepEqual(game.monasteryPatches, []);
});

test("cloth stays attached along the top and all displaced vertices remain within its culling bounds", () => {
  const root = new THREE.Group(),
    time = { value: 0 };
  const flags = buildBannerLine(
    root,
    new THREE.Vector3(-19, 6.25, -17),
    new THREE.Vector3(19, 6.25, -17),
    time,
  );
  const g = flags.mesh.geometry,
    p = g.attributes.position,
    uv = g.attributes.uv;
  const point = new THREE.Vector3();
  let anchored = 0,
    moving = 0;
  for (let i = 0; i < p.count; i++) {
    for (const t of [0, 1.7, 5.3, 37, 123]) {
      const d = clothDisplacement(p.getX(i), uv.getX(i), uv.getY(i), t);
      if (uv.getY(i) === 1) {
        assert.equal(Math.abs(d.y) + Math.abs(d.z), 0);
        anchored++;
      } else if (Math.abs(d.z) > 0.1) moving++;
      point.set(p.getX(i), p.getY(i) + d.y, p.getZ(i) + d.z);
      assert.ok(g.boundingBox.containsPoint(point));
      assert.ok(g.boundingSphere.containsPoint(point));
    }
  }
  assert.equal(anchored, 25 * 9 * 5);
  assert.ok(moving > 1000);
  const visible = { ...THREE.ShaderLib.standard, uniforms: {} },
    depth = { ...THREE.ShaderLib.depth, uniforms: {} };
  flags.mesh.material.onBeforeCompile(visible);
  flags.mesh.customDepthMaterial.onBeforeCompile(depth);
  assert.equal(visible.uniforms.monasteryTime, time);
  assert.equal(depth.uniforms.monasteryTime, time);
  for (const shader of [visible, depth]) {
    assert.ok(shader.vertexShader.includes("float freeCloth"));
    assert.ok(shader.fragmentShader.includes("if(vFlagUv.y<tornHem)discard;"));
  }
  root.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
    o.customDepthMaterial?.dispose();
  });
});

test("alpine ranges close at the seam, face upward, and stay outside the playable map", () => {
  for (const layer of [0, 1]) {
    const g = snowMountainGeometry(420, layer),
      p = g.attributes.position,
      n = g.attributes.normal;
    const { segments, rings, radius } = g.userData;
    assert.ok(p.array.every(Number.isFinite));
    assert.ok(n.array.every(Number.isFinite));
    assert.ok(g.index.count / 3 <= 65536);
    assert.ok(radius > Math.hypot(210, 210));
    let maxY = -Infinity;
    for (let i = 0; i < p.count; i++) {
      assert.ok(n.getY(i) > 0, "range faces upward for snow deposition");
      maxY = Math.max(maxY, p.getY(i));
    }
    assert.ok(maxY > 240);
    for (let r = 0; r <= rings; r++) {
      const a = r * (segments + 1),
        b = a + segments;
      for (const axis of ["X", "Y", "Z"]) {
        assert.ok(Math.abs(p[`get${axis}`](a) - p[`get${axis}`](b)) < 0.001);
        assert.equal(n[`get${axis}`](a), n[`get${axis}`](b));
      }
    }
    g.dispose();
  }
});

test("all nine delivered monastery maps match the archived source hashes", () => {
  const sources = JSON.parse(
    readFileSync(
      new URL(
        "../asset-sources/monastery-materials/sources.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(sources.length, 9);
  for (const source of sources) {
    const file = readFileSync(new URL(`../${source.file}`, import.meta.url));
    assert.equal(file.length, source.bytes);
    assert.equal(
      createHash("sha256").update(file).digest("hex"),
      source.sha256,
    );
    assert.equal(source.license, "CC0");
  }
});
