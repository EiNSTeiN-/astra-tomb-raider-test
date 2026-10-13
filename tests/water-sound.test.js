import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildWaterSurfaces } from "../src/water-surface.js";
import { waterSoundAnchor } from "../src/water-sound.js";
import {
  buildSoundLandmarks,
  updateSoundSources,
} from "../src/sound-landmarks.js";

function fixture(t, index) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[index],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level);
  const game = {
    level,
    map,
    terrainProfile,
    groundHeight: terrainProfile.surfaceHeight,
    world: new THREE.Group(),
    waterMeshes: [],
    soundSources: [],
    items: [],
    flames: [],
  };
  buildWaterSurfaces(game);
  t.after(() =>
    game.world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    }),
  );
  return game;
}

// Raycast the delivered sheet independently of the placement helper, then
// reconstruct the bed interpolation used by its fragment shader.
function visibleDepth(water, anchor) {
  water.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
      new THREE.Vector3(anchor.x, anchor.y + 2, anchor.z),
      new THREE.Vector3(0, -1, 0),
    ),
    hit = ray.intersectObject(water)[0];
  assert(hit, "anchor lies on a real delivered water face");
  const p = water.geometry.attributes.position,
    triangle = new THREE.Triangle(
      ...[hit.face.a, hit.face.b, hit.face.c].map((i) =>
        new THREE.Vector3().fromBufferAttribute(p, i),
      ),
    ),
    barycentric = triangle.getBarycoord(
      water.worldToLocal(hit.point.clone()),
      new THREE.Vector3(),
    ),
    bed = water.geometry.attributes.bedHeight;
  return (
    anchor.y -
    (barycentric.x * bed.getX(hit.face.a) +
      barycentric.y * bed.getX(hit.face.b) +
      barycentric.z * bed.getX(hit.face.c))
  );
}

test("actual court-pool emitters clear both exposed floor and delivered water beds across six chapters", (t) => {
  let pools = 0,
    buriedCentres = 0,
    relocated = 0;
  for (const index of [0, 1, 3, 4, 6, 7]) {
    const g = fixture(t, index);
    for (const [i, water] of g.waterMeshes.entries()) {
      const d = water.userData;
      if (d.width > 30 || (d.fall !== undefined && d.stage === undefined))
        continue;
      const before = JSON.stringify(d),
        anchor = waterSoundAnchor(g, water),
        centreDepth =
          water.position.y - g.groundHeight(water.position.x, water.position.z);
      assert(anchor, `${g.level.id}/${d.id} retains an exposed emitter`);
      assert(
        visibleDepth(water, anchor) > 0.06,
        `${d.id} rendered sheet stays wet through wave troughs`,
      );
      assert(
        anchor.y - g.groundHeight(anchor.x, anchor.z) > 0.06,
        `${d.id} actual floor stays below the source`,
      );
      assert.equal(anchor.y, water.position.y);
      if (centreDepth < 0) buriedCentres++;
      if (anchor.x !== water.position.x || anchor.z !== water.position.z)
        relocated++;
      if (centreDepth >= 0.2)
        assert.deepEqual(anchor, {
          x: water.position.x,
          y: water.position.y,
          z: water.position.z,
        });
      const source = { id: `pool-${i}`, waterIndex: i };
      g.soundSources = [source];
      updateSoundSources(g);
      assert.deepEqual(
        [source.x, source.y, source.z, source.activity],
        [anchor.x, anchor.y, anchor.z, 1],
      );
      assert.equal(
        JSON.stringify(d),
        before,
        "placement preserves water metadata",
      );
      pools++;
    }
  }
  assert.equal(pools, 28);
  assert.equal(buriedCentres, 5);
  assert.equal(relocated, 6);
});

test("crystal source construction and repeated updates retain exposed anchors beside protected instrument ground", (t) => {
  const g = fixture(t, 6);
  g.map.rooms = [];
  buildSoundLandmarks(g);
  const original = g.soundSources.map((s) => ({ ...s }));
  for (let frame = 0; frame < 120; frame++) updateSoundSources(g);
  assert.equal(original.length, 4);
  assert.deepEqual(g.soundSources, original);
  for (const source of original) {
    assert.equal(source.kind, "drips");
    assert(visibleDepth(g.waterMeshes[source.waterIndex], source) > 0.06);
    assert(source.y - g.groundHeight(source.x, source.z) > 0.06);
  }
});

test("draining, empty, refilled and cooled surfaces control their pool voice without rescanning unchanged geometry", (t) => {
  const g = fixture(t, 6),
    water = g.waterMeshes[1],
    source = { waterIndex: 1 };
  let reads = 0;
  const floor = g.groundHeight;
  g.groundHeight = (x, z) => {
    reads++;
    return floor(x, z);
  };
  g.soundSources = [source];
  updateSoundSources(g);
  const initial = { ...source },
    afterSurvey = reads;
  assert(afterSurvey > 0);
  for (let frame = 0; frame < 60; frame++) updateSoundSources(g);
  assert.equal(
    reads,
    afterSurvey,
    "steady spatial updates reuse the sheet survey",
  );
  water.position.y -= 0.5;
  water.userData.drain = 0.5;
  updateSoundSources(g);
  assert.equal(source.y, initial.y - 0.5);
  assert.equal(source.x, initial.x);
  assert.equal(source.z, initial.z);
  assert(visibleDepth(water, source) > 0.06);
  assert(source.activity < 1 && source.activity > 0);
  water.position.y -= 2;
  water.userData.drain = 2.5;
  updateSoundSources(g);
  assert.equal(waterSoundAnchor(g, water), null);
  assert.equal(source.activity, 0);
  water.position.y = initial.y;
  water.userData.drain = 0;
  updateSoundSources(g);
  assert.deepEqual(source, initial);
  water.userData.cooled = true;
  updateSoundSources(g);
  assert.equal(source.activity, 0);
  assert.equal(reads, afterSurvey);
});

test("wet-floor coordinates with a buried delivered sheet are rejected and a translated sheet invalidates its survey", (t) => {
  const geometry = new THREE.PlaneGeometry(6, 6, 6, 6),
    p = geometry.attributes.position;
  geometry.setAttribute(
    "bedHeight",
    new THREE.BufferAttribute(
      Float32Array.from({ length: p.count }, (_, i) =>
        Math.abs(p.getX(i)) < 1.1 ? 2 : -1,
      ),
      1,
    ),
  );
  const water = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.set(10, 1, 20);
  const game = { groundHeight: () => -1 };
  const anchor = waterSoundAnchor(game, water);
  assert(Math.abs(anchor.x - water.position.x) > 1);
  assert(
    visibleDepth(water, anchor) > 0.06,
    "use shader-visible water, not only a wet floor query",
  );
  water.position.x += 5;
  const moved = waterSoundAnchor(game, water);
  assert(Math.abs(moved.x - anchor.x - 5) < 1e-8);
  assert(visibleDepth(water, moved) > 0.06);
  t.after(() => {
    geometry.dispose();
    water.material.dispose();
  });
});
