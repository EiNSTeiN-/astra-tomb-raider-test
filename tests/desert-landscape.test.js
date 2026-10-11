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

test("desert terrace grading retains the published main and field working floors", () => {
  const map = createMap(LEVELS[1]),
    profile = createTerrainProfile(map, LEVELS[1]),
    floors = [];
  // These 8,437 work-floor vertices were recorded at 76631e0 before the
  // approach joins were graded. Main optical floors retain a 21 m core;
  // field controls retain their 7 m work squares. Approaches deliberately change.
  for (const room of [...map.rooms, ...map.fieldSites]) {
    const radius = map.rooms.includes(room) ? 21 : 7;
    for (let z = -radius; z <= radius; z += profile.step)
      for (let x = -radius; x <= radius; x += profile.step)
        floors.push(profile.height(room.x * 7 + x, room.z * 7 + z));
  }
  assert.equal(floors.length, 8437);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(new Float32Array(floors).buffer))
      .digest("hex"),
    "febee252edb244c90dadeee010f49b01b69f04c7dd4a4648dc325f3cb9be65e5",
  );
});

test("the desert maintenance approach descends on a gradual ramp between the two terrace floors", () => {
  const map = createMap(LEVELS[1]),
    profile = createTerrainProfile(map, LEVELS[1]);
  let samples = 0;
  for (let z = 65; z < 85; z += 0.1) {
    const slope =
      Math.abs(
        profile.surfaceHeight(373, z + 0.1) - profile.surfaceHeight(373, z),
      ) / 0.1;
    // The published slope reached 1.46876 m/m and let a normal descent
    // put the trailing boot 80.5 cm inside the actual terrain.
    assert(slope < 0.25, `Abrupt approach at ${z}: ${slope}`);
    samples++;
  }
  assert(samples >= 200);
});

test("desert banks ease out of route floors before rising into their shoulders", () => {
  const map = createMap(LEVELS[1]),
    profile = createTerrainProfile(map, LEVELS[1]),
    { step, width } = profile,
    slopes = [],
    toes = [];
  for (let iz = 1; iz < width - 1; iz++)
    for (let ix = 1; ix < width - 1; ix++) {
      const x = ix * step,
        z = iz * step,
        distance = desertRouteDistance(map, x, z);
      if (distance <= 0 || distance > 3.5) continue;
      const dx =
          (profile.height(x + step, z) - profile.height(x - step, z)) /
          (2 * step),
        dz =
          (profile.height(x, z + step) - profile.height(x, z - step)) /
          (2 * step);
      slopes.push((Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI);
      if (Math.abs(distance - step) < 1e-6)
        for (const [dx, dz] of [
          [step, 0],
          [-step, 0],
          [0, step],
          [0, -step],
        ])
          if (desertRouteDistance(map, x + dx, z + dz) === 0)
            toes.push(profile.height(x, z) - profile.height(x + dx, z + dz));
    }
  slopes.sort((a, b) => a - b);
  assert(
    slopes.length > 7500,
    "Sample the full network of desert route shoulders.",
  );
  // b02fd56 measured 38.80 / 52.90 degrees here, with first-interval rises
  // reaching 4.50 m. Check the actual sampled terrain, including terrace and
  // erosion contributions, so a soft crest cannot conceal another steep toe.
  assert(slopes[Math.floor(slopes.length * 0.5)] < 22);
  assert(slopes[Math.floor(slopes.length * 0.9)] < 35);
  toes.sort((a, b) => a - b);
  assert(toes.length > 4000);
  assert(toes[Math.floor(toes.length * 0.9)] < 0.9);
  assert(toes.at(-1) < 1.5);
});

test("desert shaping retains every walking-cell boundary, feature foundation, reservoir and climbing pad", () => {
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
        assert(desertRouteDistance(map, wx, wz) > 0);
      }
    }
  assert(changed > 2000);
  assert(maximum > 1 && maximum < 6);
});

test("narrow desert banks retain rounded meeting crests without steepening their route toes", () => {
  const map = createMap(LEVELS[1]),
    profile = createTerrainProfile(map, LEVELS[1]),
    { width, step, heights } = profile,
    turns = [];
  for (let z = 1; z < width - 1; z++)
    for (let x = 1; x < width - 1; x++) {
      const px = x * step,
        pz = z * step,
        d = desertRouteDistance(map, px, pz);
      if (d <= 0 || d >= 7) continue;
      if (
        profile.waters.some(
          (w) =>
            Math.hypot(px - w.x, pz - w.z) <=
            Math.hypot(w.bedWidth ?? w.width, w.bedLength ?? w.length) / 2 + 12,
        )
      )
        continue;
      const i = z * width + x,
        ax = Math.atan((heights[i + 1] - heights[i]) / step),
        bx = Math.atan((heights[i] - heights[i - 1]) / step),
        az = Math.atan((heights[i + width] - heights[i]) / step),
        bz = Math.atan((heights[i] - heights[i - width]) / step);
      turns.push(
        (Math.max(Math.abs(ax - bx), Math.abs(az - bz)) * 180) / Math.PI,
      );
    }
  turns.sort((a, b) => a - b);
  assert(turns.length > 10000);
  // The published 1c4f9e9 crests turn sharply between adjacent delivered
  // intervals. Measure the final field, rather than the smoothing mask, so
  // narrow ridge meetings cannot be excluded from the check.
  assert(turns[Math.floor(turns.length * 0.9)] < 13);
  assert(turns[Math.floor(turns.length * 0.99)] < 22);
  assert(turns.at(-1) < 35);
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
    assert(g.index.count / 3 > 49000 && g.index.count / 3 <= 85000);
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
test("horizon normals follow independent Cartesian slope probes and both aprons stay buried", () => {
  const extent = 427;
  for (const layer of [0, 1]) {
    const geometry = desertHorizonGeometry(extent, layer),
      { radius, depth, segments, rings } = geometry.userData,
      normals = geometry.attributes.normal;
    const height = (x, z) =>
      desertHorizonHeight(
        Math.atan2(z, x),
        (Math.hypot(x, z) - radius) / depth,
        layer,
        extent,
      );
    for (let ring = 5; ring < rings - 5; ring += 7)
      for (let i = 3; i < segments; i += 13) {
        const angle = (i / segments) * Math.PI * 2,
          r = radius + (ring / rings) * depth,
          x = Math.cos(angle) * r,
          z = Math.sin(angle) * r,
          dx = (height(x + 0.1, z) - height(x - 0.1, z)) / 0.2,
          dz = (height(x, z + 0.1) - height(x, z - 0.1)) / 0.2,
          expected = new THREE.Vector3(-dx, 1, -dz).normalize(),
          actual = new THREE.Vector3().fromBufferAttribute(
            normals,
            ring * (segments + 1) + i,
          );
        assert(Math.abs(actual.length() - 1) < 1e-6);
        assert(actual.dot(expected) > 0.999);
      }
    for (let i = 0; i < segments; i += 17) {
      const angle = (i / segments) * Math.PI * 2;
      assert.equal(
        desertHorizonHeight(angle, 0, layer, extent),
        layer ? -18 : -14,
      );
      assert.equal(
        desertHorizonHeight(angle, 1, layer, extent),
        layer ? -18 : -14,
      );
    }
    geometry.dispose();
  }
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
