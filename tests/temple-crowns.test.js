import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildTempleArchitecture } from "../src/temple-architecture.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";
import { templeCrownPlan } from "../src/temple-crown-support.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[0],
    map = createMap(level);
  const terrainProfile = createTerrainProfile(map, level);
  const world = new THREE.Group();
  const game = {
    level,
    map,
    world,
    terrainProfile,
    obstacles: [],
    groundHeight: terrainProfile.surfaceHeight,
    cameraSurfaces: new CameraSurfaces(world),
  };
  t.after(() => {
    const geometries = new Set(game.templeCaptureGeometry);
    const materials = new Set(),
      textures = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material, o.customDepthMaterial].flat()) {
        if (!m) continue;
        materials.add(m);
        for (const value of Object.values(m))
          if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
  });
  buildTempleArchitecture(game);
  world.updateMatrixWorld(true);
  return game;
}

test("nine temple profiles have distinct physical silhouettes and independent authored plans", (t) => {
  const game = fixture(t);
  assert.equal(new Set(game.templePatches.map((p) => p.crown.style)).size, 9);
  const signatures = game.templePatches.map((patch) => {
    const c = patch.root.position,
      crown = patch.crown;
    assert(
      crown.bounds.min.x > c.x - 6.03 && crown.bounds.max.x < c.x + 6.03,
      "the complete crown bears within the unchanged central arcade",
    );
    return [-5, -3.75, -2, 0, 2, 3.75, 5]
      .map((dx) => {
        const height = stationSupport(
          crown.solid,
          c.x + dx,
          c.z - 18,
          Infinity,
          0.4,
        );
        assert(height !== null);
        return Math.round((height - crown.roof) * 100);
      })
      .join(",");
  });
  assert.equal(
    new Set(signatures).size,
    9,
    "style labels must correspond to different delivered roof volumes",
  );
  const plan = templeCrownPlan(2),
    original = templeCrownPlan(2);
  plan.towers[0].widths[0] = 100;
  plan.plaque.width = 100;
  assert.deepEqual(templeCrownPlan(2), original);
  assert.throws(() => templeCrownPlan(9), RangeError);
});

test("the lantern retains a real opening and the rain arch has finite walkable slope support", (t) => {
  const game = fixture(t);
  const lantern = game.templePatches[6],
    c = lantern.root.position;
  const x = c.x + 2.2,
    z = c.z - 18,
    solid = lantern.crown.solid;
  const floor = stationSupport(solid, x, z, lantern.crown.roof + 0.8, 0.4);
  assert(
    floor !== null && floor < lantern.crown.roof + 0.5,
    "an overhead beam must not replace the lower landing",
  );
  assert(
    !stationBlocked(solid, x, floor, z),
    "the clerestory opening is not an invisible wall",
  );
  assert(
    stationBlocked(solid, x, lantern.crown.roof + 2.2, z),
    "the lower landing cannot suppress real beam headroom",
  );
  const rain = game.templePatches[3],
    a = rain.root.position;
  for (const dx of [-4, 4]) {
    const height = stationSupport(
      rain.crown.solid,
      a.x + dx,
      a.z - 18,
      Infinity,
      0.4,
    );
    assert(
      height !== null &&
        !stationBlocked(rain.crown.solid, a.x + dx, height, a.z - 18),
      "the authored arch roof provides slope clearance without a false flat cap",
    );
  }
});

test("temple botanical plaques have masonry behind their entire delivered height", (t) => {
  const game = fixture(t);
  let probes = 0;
  for (const patch of game.templePatches) {
    // The final panel is appended after the pier facings in this material batch.
    // Probe the delivered expanded triangles, including their deepest recesses.
    const mesh = patch.detail.children.find(
      (o) => o.isMesh && o.material.map === game.templeMaterial.map,
    );
    assert(mesh);
    const positions = mesh.geometry.attributes.position;
    const start = positions.count - 30 * 64 * 6;
    let deepest = Infinity;
    for (let i = start; i < positions.count; i++)
      deepest = Math.min(deepest, positions.getZ(i));
    for (let i = start; i < positions.count; i += 131) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld);
      // Probe from the delivered deepest recess plane. Relief peaks
      // intentionally stand farther out; they cannot conceal a missing back.
      point.z = deepest + mesh.matrixWorld.elements[14];
      const hit = new THREE.Raycaster(
        point,
        new THREE.Vector3(0, 0, -1),
      ).intersectObject(patch.root, true)[0];
      assert(
        hit && hit.distance < 0.015,
        `unbacked plaque ${patch.root.position.x}/${i - start}: ${hit?.distance}`,
      );
      probes++;
    }
  }
  assert.equal(probes, 9 * Math.ceil((30 * 64 * 6) / 131));
});

test("seated temple crowns preserve the complete preceding arcades and original navigation", (t) => {
  const baseline = JSON.parse(
    readFileSync(
      new URL("./fixtures/temple-crown-baseline.json", import.meta.url),
    ),
  );
  const game = fixture(t);
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  assert.equal(
    hash(JSON.stringify(game.obstacles.filter((o) => !o.templeCrown))),
    baseline.obstacleHash,
  );
  for (const expected of baseline.rooms) {
    const patch = game.templePatches[expected.index];
    const rendered = patch.root.children.find((o) => o.isMesh);
    const geometry = rendered.geometry;
    for (const [name, expectedHash] of Object.entries(expected.attributes)) {
      const a = geometry.attributes[name];
      const length =
        expected.arcadeTriangles * 3 * a.itemSize * a.array.BYTES_PER_ELEMENT;
      assert.equal(
        hash(Buffer.from(a.array.buffer, a.array.byteOffset, length)),
        expectedHash,
        `${expected.index}/${name}`,
      );
    }
    // Limit rendered rays to the verified, unchanged arcade prefix. This
    // independently measures its real cap beneath the replacement crown.
    const c = patch.root.position,
      solid = patch.crown.solid;
    const savedRange = { ...geometry.drawRange };
    try {
      geometry.setDrawRange(0, expected.arcadeTriangles * 3);
      for (const dx of [-4.5, -1, -0.75, 0.75, 1, 4.5])
        for (const dz of [-0.7, 0, 0.7]) {
          const x = c.x + dx,
            z = c.z - 18 + dz;
          const hit = new THREE.Raycaster(
            new THREE.Vector3(x, patch.crown.roof + 1, z),
            new THREE.Vector3(0, -1, 0),
          ).intersectObject(rendered)[0];
          assert(hit, `missing roof ${expected.index}/${dx}/${dz}`);
          const height = hit.point.y;
          const entry = solid.triangles.entry(
            new THREE.Vector3(x, height - 0.4, z),
            new THREE.Vector3(x, height + 0.4, z),
          );
          assert(
            entry !== null && entry < 0.4625,
            `crown lacks 3 cm roof bearing ${expected.index}/${dx}/${dz}`,
          );
        }
    } finally {
      geometry.setDrawRange(savedRange.start, savedRange.count);
    }
  }
});

test("temple crown bodies retain rendered cap support and camera contact after batching", (t) => {
  const game = fixture(t);
  game.cameraSurfaces.rebuild();
  let samples = 0;
  for (const patch of game.templePatches) {
    const c = patch.root.position,
      solid = patch.crown.solid;
    for (const dx of [-4, -1, 0, 1, 4])
      for (const dz of [-0.6, 0, 0.6]) {
        const x = c.x + dx,
          z = c.z - 18 + dz;
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, patch.crown.roof + 9, z),
          new THREE.Vector3(0, -1, 0),
        )
          .intersectObject(patch.root, true)
          .find((h) => h.face.normal.y > 0.65);
        const support = stationSupport(solid, x, z, Infinity, 0.4);
        assert(
          hit && support !== null && Math.abs(hit.point.y - support) < 1e-5,
          `changed crown support ${c.x}/${dx}/${dz}`,
        );
        samples++;
      }
    assert(
      stationBlocked(solid, c.x, patch.crown.roof + 0.4, c.z - 18, 1.05, 0.29),
      "a crouched body cannot occupy overlapping core and facing",
    );
    assert(
      !stationBlocked(solid, c.x, game.groundHeight(c.x, c.z - 18), c.z - 18),
      "the original ground passage remains open",
    );
    assert(
      game.cameraSurfaces.entry(
        new THREE.Vector3(c.x, patch.crown.roof + 0.8, c.z - 13),
        new THREE.Vector3(c.x, patch.crown.roof + 0.8, c.z - 18),
      ) < 1,
      "the seated plaque stops the camera",
    );
    assert.equal(patch.root.children.filter((o) => o.isMesh).length, 1);
  }
  assert.equal(samples, 135);
  assert.equal(game.cameraSurfaces.pending.length, 0);
});
