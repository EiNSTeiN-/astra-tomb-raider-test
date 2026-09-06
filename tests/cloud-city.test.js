import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildHorizon } from "../src/terrain.js";
import { updateAtmosphere } from "../src/atmosphere.js";
import {
  andeanGeometry,
  andeanHeight,
  cloudCitySky,
  CLOUD_BANK_FLOOR,
  CLOUD_BANK_RISE,
} from "../src/cloud-city.js";

test("Andean ranges close their seams with finite upward normals outside the entire playable map", () => {
  const extent = 427;
  const silhouettes = [];
  for (let layer = 0; layer < 3; layer++) {
    const g = andeanGeometry(extent, layer),
      p = g.attributes.position,
      n = g.attributes.normal,
      { segments, rings, radius } = g.userData;
    assert.ok(
      radius > extent / Math.SQRT2,
      "background starts outside every map corner",
    );
    for (let i = 0; i < p.count; i++) {
      for (const a of [p, n])
        for (const value of [a.getX(i), a.getY(i), a.getZ(i)])
          assert.ok(Number.isFinite(value));
      assert.ok(n.getY(i) >= 0, "height-field surfaces face upward");
      assert.ok(
        Math.hypot(p.getX(i) - extent / 2, p.getZ(i) - extent / 2) >=
          radius - 0.001,
      );
    }
    for (let r = 0; r <= rings; r++) {
      const a = r * (segments + 1),
        b = a + segments;
      for (const attr of [p, n]) {
        const av = new THREE.Vector3().fromBufferAttribute(attr, a),
          bv = new THREE.Vector3().fromBufferAttribute(attr, b);
        assert.ok(
          av.distanceTo(bv) < 0.00001,
          "closed position and lighting seam",
        );
      }
    }
    silhouettes.push(
      Array.from({ length: 24 }, (_, i) =>
        andeanHeight((i / 24) * Math.PI * 2, 0.4, layer),
      ),
    );
    g.dispose();
  }
  assert.notDeepEqual(silhouettes[0], silhouettes[1]);
  assert.notDeepEqual(silhouettes[1], silhouettes[2]);
});

function fixture(t) {
  const level = LEVELS[5],
    map = createMap(level),
    profile = createTerrainProfile(map, level);
  const waterMeshes = profile.waters.map((s) => ({
    position: new THREE.Vector3(s.x, s.baseY, s.z),
    userData: { ...s },
    visible: true,
  }));
  waterMeshes.push({ userData: { sea: true }, visible: true });
  const g = {
    level,
    map,
    terrainProfile: profile,
    world: new THREE.Group(),
    waterMeshes,
    obstacles: [],
    darkMat: new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
    sun: new THREE.DirectionalLight(),
    sunOffset: new THREE.Vector3(-80, 88, -65),
    elapsed: 0,
  };
  t.after(() => {
    g.world.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    g.darkMat.map.dispose();
    g.darkMat.dispose();
    g.daylightSky?.geometry.dispose();
    g.daylightSky?.material.dispose();
  });
  return g;
}

test("valley clouds stay below crossing and objective heights without changing terrain, routes or local water", (t) => {
  const g = fixture(t),
    mapBefore = JSON.stringify(g.map),
    heights = g.terrainProfile.heights.slice(),
    waters = g.waterMeshes.slice(0, -1).map((w) => w.position.clone());
  buildHorizon(g);
  assert.equal(g.cloudCity.group.children.length, 4);
  assert.equal(
    g.cloudCity.bank.material.uniforms.cloudRise.value,
    CLOUD_BANK_RISE,
  );
  const top = CLOUD_BANK_FLOOR + CLOUD_BANK_RISE;
  for (const b of g.terrainProfile.bridges)
    assert.ok(
      Math.min(b.ay, b.by) - top > 10,
      "clouds leave crossing surfaces clear",
    );
  for (const f of g.map.features)
    assert.ok(
      g.terrainProfile.height(f.x * 7, f.z * 7) - top > 8,
      "clouds leave objective approaches clear",
    );
  assert.equal(JSON.stringify(g.map), mapBefore);
  assert.deepEqual(g.terrainProfile.heights, heights);
  assert.equal(g.obstacles.length, 0);
  g.waterMeshes.slice(0, -1).forEach((w, i) => {
    assert.equal(w.visible, true);
    assert.deepEqual(w.position, waters[i]);
  });
  assert.equal(g.waterMeshes.at(-1).visible, false);
  g.cloudCity.group.traverse((o) => {
    if (o.isMesh) {
      assert.equal(o.castShadow, false);
      assert.equal(o.userData.excludeContact, true);
    }
  });
});

test("moving the listener preserves mountain parallax while advancing cloud time and matching the sun", (t) => {
  const g = fixture(t);
  buildHorizon(g);
  g.daylightSky = cloudCitySky(g.sunOffset);
  const before =
      g.cloudCity.group.children[0].geometry.attributes.position.array.slice(),
    target = new THREE.Vector3(329, 27, 240);
  g.elapsed = 90;
  updateAtmosphere(g, target);
  assert.equal(g.cloudCity.time.value, 90);
  assert.equal(g.daylightSky.material.uniforms.time.value, 90);
  assert.deepEqual(g.daylightSky.position, target);
  assert.ok(
    g.sun.position
      .clone()
      .sub(target)
      .normalize()
      .distanceTo(g.daylightSky.material.uniforms.sunPosition.value) < 1e-9,
  );
  assert.deepEqual(g.cloudCity.group.position, new THREE.Vector3());
  assert.deepEqual(
    g.cloudCity.group.children[0].geometry.attributes.position.array,
    before,
  );
  g.level = LEVELS[0];
  buildHorizon(g);
  assert.equal(
    g.cloudCity,
    null,
    "other chapters retire the cloud-city update state",
  );
});
