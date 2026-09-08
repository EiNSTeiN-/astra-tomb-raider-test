import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  createTerrainProfile,
  buildTerrainSurface,
  buildHorizon,
} from "../src/terrain.js";
import { desertRouteDistance } from "../src/desert-geology.js";
import {
  desertHorizonGeometry,
  desertHorizonHeight,
} from "../src/desert-horizon.js";

test("desert erosion retains every walking-cell boundary, feature foundation, reservoir and climbing pad", () => {
  const map = createMap(LEVELS[1]),
    profile = createTerrainProfile(map, LEVELS[1]),
    old = profile.desert.originalHeight;
  let samples = 0,
    changed = 0,
    maximum = 0;
  for (let gz = 0; gz < map.size; gz++)
    for (let gx = 0; gx < map.size; gx++)
      if (map.grid[gz][gx]) {
        for (const dx of [-3.5, -2, 0, 2, 3.5])
          for (const dz of [-3.5, -2, 0, 2, 3.5]) {
            const x = gx * 7 + dx,
              z = gz * 7 + dz;
            assert.equal(
              profile.height(x, z),
              old(x, z),
              `${gx}/${gz}/${dx}/${dz}`,
            );
            samples++;
          }
      }
  assert(samples > 20000);
  for (const f of map.features)
    assert.equal(profile.height(f.x * 7, f.z * 7), old(f.x * 7, f.z * 7));
  for (const w of profile.waters)
    for (let x = w.x - w.width / 2; x <= w.x + w.width / 2; x += 0.5)
      for (let z = w.z - w.length / 2; z <= w.z + w.length / 2; z += 0.5)
        assert.equal(profile.height(x, z), old(x, z));
  for (let z = 0; z < profile.width; z++)
    for (let x = 0; x < profile.width; x++) {
      const wx = x * profile.step,
        wz = z * profile.step,
        delta = Math.abs(profile.height(wx, wz) - old(wx, wz));
      if (delta > 0.001) {
        changed++;
        maximum = Math.max(maximum, delta);
        assert(desertRouteDistance(map, wx, wz) > 3.5);
      }
    }
  assert(changed > 2000);
  assert(maximum > 1 && maximum < 6);
});
test("desert strata are deterministic, continuous, bounded and isolated from the seven other biomes", () => {
  const map = createMap(LEVELS[1]),
    a = createTerrainProfile(map, LEVELS[1]),
    b = createTerrainProfile(map, LEVELS[1]);
  assert.deepEqual(a.heights, b.heights);
  assert(a.heights.every(Number.isFinite));
  assert(a.desert.exposure.every((v) => v >= 0 && v <= 1));
  for (let i = 1; i < a.width - 2; i += 3) {
    const x = i * a.step,
      z = (a.width - i - 1) * a.step;
    assert(Math.abs(a.height(x - 0.0001, z) - a.height(x + 0.0001, z)) < 0.01);
  }
  for (const l of LEVELS.filter((l) => l.id !== "sands"))
    assert.equal(createTerrainProfile(createMap(l), l).desert, undefined);
});
test("dune and escarpment meshes have upward winding, seamless normals and remain outside the playable square", () => {
  const geometries = [];
  for (const layer of [0, 1]) {
    const g = desertHorizonGeometry(427, layer);
    geometries.push(g);
    const { segments, rings, radius } = g.userData,
      p = g.attributes.position,
      n = g.attributes.normal;
    assert(radius > Math.hypot(427 / 2, 427 / 2) + 5);
    assert(p.array.every(Number.isFinite));
    assert(n.array.every(Number.isFinite));
    assert.equal(g.index.count / 3, 49152);
    for (let ring = 0; ring <= rings; ring++) {
      const a = ring * (segments + 1),
        b = a + segments;
      assert(
        new THREE.Vector3()
          .fromBufferAttribute(p, a)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(p, b)) < 1e-4,
      );
      assert(
        new THREE.Vector3()
          .fromBufferAttribute(n, a)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(n, b)) < 1e-7,
      );
    }
    for (let i = 0; i < g.index.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i)),
        b = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i + 1)),
        c = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i + 2));
      assert(b.sub(a).cross(c.sub(a)).y > 0);
    }
    for (let t = 0; t <= 1; t += 0.03)
      assert(
        Math.abs(
          desertHorizonHeight(0, t, layer) -
            desertHorizonHeight(Math.PI * 2, t, layer),
        ) < 1e-8,
      );
  }
  assert.notDeepEqual(
    geometries[0].attributes.position.array,
    geometries[1].attributes.position.array,
  );
});
test("built desert terrain provides its exposure attribute and reuses existing textures for two horizon draws", async (t) => {
  const requests = [];
  t.mock.method(THREE.TextureLoader.prototype, "load", (_url, onLoad) => {
    requests.push(_url);
    const texture = new THREE.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const map = createMap(LEVELS[1]),
    g = {
      level: LEVELS[1],
      map,
      world: new THREE.Group(),
      terrainProfile: createTerrainProfile(map, LEVELS[1]),
    };
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  buildHorizon(g);
  assert.equal(g.desertHorizon.length, 2);
  assert.equal(g.terrainMeshes[0].material.defines.TERRAIN_DESERT, 1);
  for (const m of g.terrainMeshes) {
    assert.equal(
      m.geometry.attributes.desertRock.count,
      m.geometry.attributes.position.count,
    );
    assert(
      m.geometry.attributes.desertRock.array.every((v) => v >= 0 && v <= 1),
    );
  }
  const material = g.terrainMeshes[0].material;
  assert.deepEqual(requests.slice(0, 3), [
    "/assets/textures/desert-sand-color.jpg",
    "/assets/textures/desert-sand-normal.jpg",
    "/assets/textures/desert-sand-roughness.jpg",
  ]);
  assert.equal(requests.length, 9);
  assert.equal(material.userData.additionalTextures.length, 6);
  for (const m of g.desertHorizon) {
    assert.equal(m.material.fog, false);
    assert.equal(m.castShadow, false);
    assert.equal(m.receiveShadow, false);
  }
});

test("all three bundled desert ripple maps decode at 2K and match their CC0 provenance", async () => {
  const sources = JSON.parse(
    readFileSync(
      new URL("../asset-sources/desert-sand/sources.json", import.meta.url),
    ),
  );
  assert.equal(sources.length, 3);
  let bytes = 0;
  for (const source of sources) {
    const file = readFileSync(new URL(`../${source.file}`, import.meta.url));
    assert.equal(file.length, source.bytes);
    assert.equal(
      createHash("sha256").update(file).digest("hex"),
      source.sha256,
    );
    assert.equal(source.license, "CC0-1.0");
    assert.equal(source.author, "Rob Tuytel");
    const info = await sharp(file).metadata();
    assert.equal(info.format, "jpeg");
    assert.equal(info.width, 2048);
    assert.equal(info.height, 2048);
    const { data } = await sharp(file)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert(
      data.some((v) => v !== data[0]),
      "map has image detail",
    );
    bytes += file.length;
  }
  assert.equal(bytes, 1826595);
});
