import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildCourtDais } from "../src/court-dais.js";
import { buildWindTerrace } from "../src/wind-terraces.js";
import { buildWindCourts } from "../src/wind-courts.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { supportAt, safeArrival } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { mantlePoint } from "../src/mantle-motion.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ fillText() {}, clearRect() {} }),
    }),
  };
  t.after(() => (globalThis.document = old));
  const level = LEVELS[5],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    groundHeight: terrainProfile.height,
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    obstacles: [],
    items: [],
    waterMeshes: [],
    skyBridges: [],
    traversalCourses: [],
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    cameraSurfaces: new CameraSurfaces(world),
    progress: { stage: 1, field: [] },
    yaw: 0,
    jumpY: 0,
    grounded: true,
    velocityY: 0,
    audio: { tone() {} },
  });
  for (const room of map.rooms.filter((r) => r.index > 1))
    buildCourtDais(game, room);
  for (const f of map.features.filter(
    (f) => f.type === "mechanism" && f.stage > 0,
  )) {
    const x = f.x * 7,
      z = f.z * 7,
      y = game.groundHeight(x, z);
    f.yOffset = 2.8 + (f.stage % 3) * 0.3;
    f.group = new THREE.Group();
    f.group.position.set(x, y + f.yOffset, z);
    f.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), game.glowMat);
    f.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), game.glowMat);
    f.group.add(f.marker, f.core);
    world.add(f.group);
    game.items.push(f);
    buildWindTerrace(game, f, x, y, z, f.yOffset);
  }
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        materials.add(o.material);
        for (const value of Object.values(o.material))
          if (value?.isTexture) textures.add(value);
      }
    });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  });
  return game;
}

test("all eight wind-record roofs cover their complete standing footprint, including formerly empty rounded corners", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster();
  let rays = 0;
  assert.equal(game.windTerraces.length, 8);
  for (const terrace of game.windTerraces) {
    const { x, z, top, base } = terrace;
    assert.equal(
      terrace.obstacle.h,
      2.8 + (game.items.find((f) => f.windTerrace === terrace).stage % 3) * 0.3,
    );
    assert(terrace.root.children.length <= 5, "bounded material batches");
    for (let ix = 0; ix <= 20; ix++)
      for (let iz = 0; iz <= 20; iz++) {
        const px = x - 2.999 + (ix * 5.998) / 20,
          pz = z - 2.999 + (iz * 5.998) / 20;
        ray.set(
          new THREE.Vector3(px, top + 1, pz),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObject(terrace.root, true)[0];
        assert(hit, "roof missing at " + [px, pz]);
        assert(
          Math.abs(hit.point.y - top) <= 0.00501,
          "roof differs from standing height",
        );
        assert.equal(supportAt(game, px, pz, top).height, top);
        assert(game.canMove(px, pz, top - game.groundHeight(px, pz)));
        assert(
          terrace.bottom < game.groundHeight(px, pz) - 0.17,
          "foundation reaches below terrain",
        );
        rays++;
      }
    const bounds = new THREE.Box3().setFromObject(terrace.root);
    assert(bounds.min.x >= x - 3.00001 && bounds.max.x <= x + 3.00001);
    assert(bounds.min.z >= z - 3.00001 && bounds.max.z <= z + 3.11101);
    assert(bounds.min.y < base - 0.17 && bounds.max.y <= top + 0.00201);
    for (const mesh of terrace.root.children) {
      assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
      if (mesh.material.userData.windMetal) {
        assert(mesh.geometry.attributes.windCoord);
        assert(mesh.geometry.attributes.windCavity);
      }
    }
  }
  assert.equal(rays, 3528);
});

test("attached ladders block walking below their top without inventing a standing surface, while the actual mantle stays clear", (t) => {
  const game = fixture(t);
  for (const {
    x,
    z,
    base,
    top,
    ladder,
    anchors,
    rungYs,
  } of game.windTerraces) {
    assert.equal(ladder.supportable, false);
    assert.equal(
      game.canMove(x, z + 3.5, 0.315),
      false,
      "body stops before the rungs",
    );
    assert(
      game.canMove(x, z + 4, 0.315),
      "clear approach from the court steps",
    );
    assert.notEqual(supportAt(game, x, z + 3.055, top).surface, ladder);
    assert.equal(anchors.length, 6);
    for (const anchor of anchors) {
      anchor.updateMatrix();
      anchor.geometry.computeBoundingBox();
      const bounds = anchor.geometry.boundingBox
        .clone()
        .applyMatrix4(anchor.matrix);
      assert(
        bounds.min.z < 3 && bounds.max.z > 3.065,
        "anchors join stone to the ladder",
      );
    }
    assert(rungYs.length >= 7 && rungYs.length <= 9);
    for (let i = 1; i < rungYs.length; i++)
      assert(rungYs[i] - rungYs[i - 1] <= 0.361);
    assert(rungYs.at(-1) < top && rungYs[0] > base + 0.315);
    game.player.position.set(x, base + 0.315, z + 4);
    game.climb = null;
    assert(game.tryClimb(0, -1), "native mantle accepts the anchored ladder");
    assert.equal(game.climb.end.y, top);
    assert(
      Math.abs(game.climb.edge.z - (z + 3)) < 1e-8,
      "hands reach the actual roof edge",
    );
    for (let i = 0; i <= 200; i++) {
      const p = mantlePoint(game.climb.start, game.climb.end, i / 200);
      assert(
        !stationBlocked(ladder, p.x, p.y, p.z, 1.9, 0.45),
        "body crosses only after clearing the ladder",
      );
    }
    // Holding Forward reaches the movement boundary before Jump is pressed.
    // A legal standing approach must still accept its mantle, including touch.
    for (const gap of [0.55, 0.58, 0.61]) {
      game.player.position.set(x, base + 0.315, z + 3 + gap);
      game.climb = null;
      assert(game.canMove(x, z + 3 + gap, 0.315));
      assert(game.tryClimb(0, -1), "mantle from a legal close approach");
      for (let i = 0; i <= 200; i++) {
        const p = mantlePoint(game.climb.start, game.climb.end, i / 200);
        assert(!stationBlocked(ladder, p.x, p.y, p.z, 1.9));
      }
    }
    const from = new THREE.Vector3(x, base + 1.2, z + 5),
      to = new THREE.Vector3(x, base + 1.2, z);
    assert(
      game.cameraSurfaces.entry(from, to, 0) < 1,
      "merged masonry retains camera collision",
    );
  }
});

test("old roof saves keep their standing coordinates, while an obsolete pose inside a ladder gets a supported clear arrival", (t) => {
  const game = fixture(t);
  for (const { x, z, height, top, base } of game.windTerraces) {
    for (const [dx, dz] of [
      [0, 0],
      [-2.99, -2.99],
      [2.99, -2.99],
      [-2.99, 2.99],
      [2.99, 2.99],
      [0, 2.99],
    ]) {
      game.progress.position = { x: x + dx, z: z + dz, height };
      game.player.position.set(x + dx, base, z + dz);
      restoreTraversal(game);
      assert.deepEqual(game.player.position.toArray(), [x + dx, top, z + dz]);
    }
    const inside = { x, z: z + 3.055, y: base + 0.315 },
      arrival = safeArrival(game, inside);
    assert(
      arrival &&
        game.canMove(
          arrival.x,
          arrival.z,
          arrival.y - game.groundHeight(arrival.x, arrival.z),
        ),
    );
    assert.equal(
      supportAt(game, arrival.x, arrival.z, arrival.y).height,
      arrival.y,
    );
  }
});

test("terrace inscriptions and the original engine signs reuse one atlas and preserve their original text cells", (t) => {
  const game = fixture(t),
    factory = game.windRecordPlaque,
    map = game.windTerraces[0].label.material.map;
  buildWindCourts(game);
  assert.equal(game.windRecordPlaque, factory);
  assert.equal(game.windSites.length, 8);
  for (const terrace of game.windTerraces) {
    assert.equal(terrace.label.material.map, map);
    assert.equal(terrace.label.userData.windLabel, "WIND ENGINE");
    assert.equal(terrace.label.userData.windLabelCell.width, 768);
    assert.equal(terrace.label.userData.windLabelCell.height, 128);
  }
  for (const site of game.windSites)
    for (const source of site.rendering.labels.sources)
      assert.equal(source.material.map, map);
});
