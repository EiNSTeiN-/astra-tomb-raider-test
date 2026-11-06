import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import {
  snowMountainGeometry,
  buildSnowMountains,
} from "../src/snow-mountains.js";
import {
  alpineForelandGeometry,
  alpineForelandMaterial,
} from "../src/alpine-foreland.js";
import { alpineMaterial } from "../src/alpine-material.js";
import { alpineColorLayer } from "../src/alpine-shader.js";
import { winterScourDeclarations } from "../src/winter-scour.js";

async function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new T.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    g = {
      level,
      map,
      terrainProfile: profile,
      world: new T.Group(),
      waterMeshes: [],
      scene: { fog: { color: new T.Color(level.fog) } },
      darkMat: new T.MeshStandardMaterial({
        map: new T.Texture(),
        normalMap: new T.Texture(),
      }),
      obstacles: [],
      cameraSurfaces: { count: 0 },
      soundSources: [],
    };
  buildTerrainSurface(g);
  await g.terrainTexturesReady;
  t.after(() => {
    const materials = new Set([g.darkMat]),
      textures = new Set();
    g.world.traverse((m) => {
      m.geometry?.dispose();
      if (m.material) materials.add(m.material);
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      for (const v of m.userData.additionalTextures || []) textures.add(v);
      m.dispose();
    }
    for (const texture of textures) texture.dispose();
  });
  return g;
}
const fingerprint = (g) =>
  createHash("sha256")
    .update(Buffer.from(g.attributes.position.array.buffer))
    .update(Buffer.from(g.attributes.normal.array.buffer))
    .update(Buffer.from(g.index.array.buffer))
    .digest("hex");

// Output reference from published 9c095b1 and the locked Three.js shader library.
// Keep the original projection, sampling, detail and haze reference outside the
// intentionally revised colour/deposition layer and shared wind declarations.
test("surface revisions retain the published range projection, sampling and haze", () => {
  const source = new T.MeshStandardMaterial(),
    material = alpineMaterial(source, new T.Color(0)),
    shader = {
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
  material.onBeforeCompile(shader);
  assert.equal(
    createHash("sha256")
      .update(
        shader.vertexShader
          .replace(
            " attribute float snowDeposit; varying float vAlpineDeposit;",
            "",
          )
          .replace(" vAlpineDeposit=snowDeposit;", ""),
      )
      .digest("hex"),
    "9d2ffda98a1c056657cdc0f55a50128afead3904889a967752a56d144f4823a9",
  );
  const windCover =
    "\n        float rangeWindScour=winterWindScour(vAlpinePosition,alpineN,broad,broken);\n        snow*=1.-rangeWindScour*.9;";
  assert(shader.fragmentShader.includes(winterScourDeclarations));
  assert(shader.fragmentShader.includes(windCover));
  const retained = shader.fragmentShader
    .replace("\n        " + winterScourDeclarations, "")
    .replace("\n        varying float vAlpineDeposit;", "")
    .replace(alpineColorLayer, "");
  assert.equal(
    createHash("sha256").update(retained).digest("hex"),
    "5f8d035e58b3fbe330c85715b28eb0d55c2026e4c5f8e4a534affbe1e4d669a4",
  );
  source.dispose();
  material.dispose();
});

function meshAudit(g) {
  const p = g.attributes.position,
    uv = g.attributes.uv,
    ids = g.index,
    edges = new Map(),
    key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].join(",");
  let area = 0,
    minimum = Infinity;
  for (let i = 0; i < ids.count; i += 3) {
    const q = [0, 1, 2].map((j) => ids.getX(i + j)),
      v = q.map((k) => new T.Vector3().fromBufferAttribute(p, k)),
      tri = new T.Triangle(...v),
      n = tri.getNormal(new T.Vector3());
    assert(tri.getArea() > 1e-7);
    assert(n.y > 0);
    minimum = Math.min(minimum, tri.getArea());
    area += tri.getArea() * n.y;
    const a = q.map((k) => new T.Vector2().fromBufferAttribute(uv, k));
    assert(Math.abs(a[1].sub(a[0]).cross(a[2].sub(a[0]))) > 1e-9);
    const center = tri.getMidpoint(new T.Vector3());
    assert(
      center.x <= 0 || center.z <= 0 || center.x >= 427 || center.z >= 427,
      "no added surface inside the playable square",
    );
    for (let j = 0; j < 3; j++) {
      const a = key(q[j]),
        b = key(q[(j + 1) % 3]),
        k = [a, b].sort().join("|");
      const e = edges.get(k) || { count: 0, balance: 0 };
      e.count++;
      e.balance += a < b ? 1 : -1;
      edges.set(k, e);
    }
  }
  const boundary = [...edges].filter(([k, e]) => e.count === 1).map(([k]) => k);
  assert(
    [...edges.values()].every(
      (e) => e.count === 1 || (e.count === 2 && e.balance === 0),
    ),
    "manifold interior without duplicate faces",
  );
  return { area, minimum, boundary };
}

test("the foreland joins every delivered terrain and range edge without holes, inversions or playable overlap", async (t) => {
  const g = await fixture(t),
    old = g.terrainMeshes.map((m) => fingerprint(m.geometry)),
    range = snowMountainGeometry(g.terrainProfile.extent),
    geometry = alpineForelandGeometry(g.terrainProfile, g.terrainMeshes, range),
    p = geometry.attributes.position,
    n = geometry.attributes.normal,
    { innerCount, outerStart, outerCount, segments, rings } = geometry.userData,
    edge = new Map();
  try {
    for (const m of g.terrainMeshes) {
      const a = m.geometry.attributes;
      for (let i = 0; i < a.position.count; i++) {
        const x = a.position.getX(i),
          z = a.position.getZ(i);
        if (x === 0 || z === 0 || x === 427 || z === 427)
          edge.set(`${x},${z}`, [
            a.position.getY(i),
            a.normal.getX(i),
            a.normal.getY(i),
            a.normal.getZ(i),
          ]);
      }
    }
    assert.equal(innerCount, edge.size + 1);
    for (let i = 0; i < innerCount; i++) {
      const actual = edge.get(`${p.getX(i)},${p.getZ(i)}`);
      assert(actual);
      assert.deepEqual([p.getY(i), n.getX(i), n.getY(i), n.getZ(i)], actual);
    }
    const rp = range.attributes.position,
      rn = range.attributes.normal;
    for (let i = 0; i < outerCount; i++)
      for (const axis of ["X", "Y", "Z"]) {
        assert.equal(p[`get${axis}`](outerStart + i), rp[`get${axis}`](i));
        assert.equal(n[`get${axis}`](outerStart + i), rn[`get${axis}`](i));
      }
    for (let r = 1; r < rings; r++) {
      const start = innerCount + (r - 1) * (segments + 1),
        end = start + segments;
      for (const a of [p, n])
        for (const axis of ["X", "Y", "Z"])
          assert.equal(a[`get${axis}`](start), a[`get${axis}`](end));
    }
    for (const a of Object.values(geometry.attributes))
      assert(a.array.every(Number.isFinite));
    assert(geometry.index.count / 3 < 115000);
    const audit = meshAudit(geometry),
      expectedEdges = [];
    const edgeKey = (a, b) => [a, b].sort().join("|");
    for (const [start, count] of [
      [0, innerCount],
      [outerStart, outerCount],
    ])
      for (let i = 0; i < count - 1; i++) {
        const key = (k) => [p.getX(k), p.getY(k), p.getZ(k)].join(",");
        expectedEdges.push(edgeKey(key(start + i), key(start + i + 1)));
      }
    assert.deepEqual(audit.boundary.sort(), expectedEdges.sort());
    let polygon = 0;
    for (let i = 0; i < outerCount - 1; i++)
      polygon += rp.getX(i) * rp.getZ(i + 1) - rp.getX(i + 1) * rp.getZ(i);
    assert(
      Math.abs(audit.area - (polygon / 2 - 427 ** 2)) < 0.01,
      "projected triangles cover exactly the region between the two boundaries",
    );
    // A removed delivered triangle creates an extra edge and loses area.
    const broken = geometry.clone();
    broken.setIndex(Array.from(geometry.index.array).slice(3));
    const bad = meshAudit(broken);
    assert.notDeepEqual(bad.boundary.sort(), expectedEdges.sort());
    assert(bad.area < audit.area);
    broken.dispose();
    assert.deepEqual(
      g.terrainMeshes.map((m) => fingerprint(m.geometry)),
      old,
    );
    t.diagnostic(
      `${p.count} vertices, ${geometry.index.count / 3} triangles, ${edge.size} exact terrain-edge joints`,
    );
  } finally {
    geometry.dispose();
    range.dispose();
  }
});

test("the recorded white-patch rays now meet delivered ground and removing the foreland restores the misses", async (t) => {
  const g = await fixture(t);
  buildSnowMountains(g);
  g.world.updateMatrixWorld(true);
  const land = g.world.getObjectByName("Alpine foreland"),
    ranges = [0, 1].map((i) => g.world.getObjectByName(`Alpine range ${i}`)),
    room = g.map.rooms[0],
    center = new T.Vector3(
      room.x * 7,
      g.terrainProfile.surfaceHeight(room.x * 7, room.z * 7),
      room.z * 7,
    ),
    camera = new T.PerspectiveCamera(65, 1280 / 800, 0.1, 450);
  camera.position.copy(center).add(new T.Vector3(34, 18, 28));
  camera.lookAt(center.clone().add(new T.Vector3(0, 6, -10)));
  camera.updateMatrixWorld(true);
  const ray = new T.Raycaster(),
    before = [],
    after = [];
  for (const [x, y] of [
    [0.83, 0.51],
    [0.89, 0.515],
    [0.91, 0.515],
  ]) {
    ray.setFromCamera(new T.Vector2(x * 2 - 1, 1 - y * 2), camera);
    before.push(
      ray.intersectObjects([...g.terrainMeshes, ...ranges], false)[0] || null,
    );
    after.push(
      ray.intersectObjects([...g.terrainMeshes, ...ranges, land], false)[0] ||
        null,
    );
  }
  assert.equal(before[0], null);
  assert.equal(before[1], null);
  assert(after.every(Boolean));
  assert.equal(after[0].object, land);
  assert.equal(after[1].object, land);
  assert.equal(land.renderOrder, -11);
  assert(land.userData.excludeContact && land.userData.animated);
  assert(!land.castShadow && land.receiveShadow);
  assert.deepEqual(g.obstacles, []);
  assert.equal(g.cameraSurfaces.count, 0);
  assert.deepEqual(g.soundSources, []);
  // A background renderer clears depth only after all three surfaces.
  let clears = 0;
  for (const m of [land, ...ranges])
    m.onAfterRender({
      clearDepth() {
        clears++;
      },
    });
  assert.equal(clears, 1);
});

test("foreland shading follows independent rendered-height gradients across the shoulder", async (t) => {
  const g = await fixture(t),
    range = snowMountainGeometry(g.terrainProfile.extent),
    geometry = alpineForelandGeometry(g.terrainProfile, g.terrainMeshes, range),
    material = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(geometry, material),
    p = geometry.attributes.position,
    n = geometry.attributes.normal,
    ray = new T.Raycaster();
  const height = (x, z) => {
    ray.set(new T.Vector3(x, 500, z), new T.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    assert(hit, "the independent gradient probe must meet a rendered face");
    return hit.point.y;
  };
  try {
    const errors = [];
    for (const r of [8, 16, 24])
      for (const k of [83, 303, 497, 683, 877, 1087, 1289, 1511]) {
        const i =
            geometry.userData.innerCount +
            (r - 1) * (geometry.userData.segments + 1) +
            k,
          x = p.getX(i),
          z = p.getZ(i),
          d = 1.5,
          dx = (height(x + d, z) - height(x - d, z)) / (2 * d),
          dz = (height(x, z + d) - height(x, z - d)) / (2 * d),
          expected = new T.Vector3(-dx, 1, -dz).normalize(),
          actual = new T.Vector3().fromBufferAttribute(n, i);
        errors.push(actual.distanceTo(expected));
        assert(actual.distanceTo(expected) < 0.06);
        assert(
          new T.Vector3(1, 0, 0).distanceTo(expected) > 0.06,
          "the observer must reject an incorrect lighting normal",
        );
      }
    t.diagnostic(
      `24 actual-mesh gradients; maximum normal error ${Math.max(...errors)}`,
    );
  } finally {
    geometry.dispose();
    range.dispose();
    material.dispose();
  }
});

test("the foreland reuses texture handles, keeps snow shading, and omits ice samplers only when all patches stay inside the terrain", async (t) => {
  const g = await fixture(t),
    base = g.terrainMeshes[0].material;
  for (const texture of [
    base.map,
    base.normalMap,
    ...base.userData.additionalTextures,
  ])
    t.mock.method(texture, "toJSON", () =>
      assert.fail("copying the material must not serialize its shared images"),
    );
  const material = alpineForelandMaterial(
      base,
      g.darkMat,
      g.scene.fog.color,
      g.terrainProfile.extent,
    ),
    shader = {
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
  try {
    assert.equal(material.map, base.map);
    assert.equal(material.normalMap, base.normalMap);
    assert.equal(material.roughnessMap, base.roughnessMap);
    assert.equal(material.defines.TERRAIN_SNOW, 1);
    assert.equal(material.defines.FROZEN_PATCH_COUNT, undefined);
    assert(base.defines.FROZEN_PATCH_COUNT > 0);
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.forelandRockMap.value, g.darkMat.map);
    assert.equal(shader.uniforms.forelandRockNormal.value, g.darkMat.normalMap);
    assert(
      shader.vertexShader.includes("vForelandClip=gl_Position.z+gl_Position.w"),
    );
    assert(shader.fragmentShader.includes("vec3 forelandBaseNormal=normal"));
    assert(shader.fragmentShader.includes("air*forelandBlend"));
    assert(shader.fragmentShader.includes("fogFactor*(1.-forelandBlend)"));
    // Preserve the source's property and shared texture identity; serializing
    // a Texture here would allocate a needless image export in the browser.
    assert.equal(
      material.userData.terrainUniforms,
      base.userData.terrainUniforms,
    );
    const center = base.userData.terrainUniforms.frozenCenters.value[0],
      old = center.x;
    center.x = 0;
    const boundary = alpineForelandMaterial(
      base,
      g.darkMat,
      g.scene.fog.color,
      g.terrainProfile.extent,
    );
    assert.equal(
      boundary.defines.FROZEN_PATCH_COUNT,
      base.defines.FROZEN_PATCH_COUNT,
    );
    boundary.dispose();
    center.x = old;
  } finally {
    material.dispose();
  }
});
