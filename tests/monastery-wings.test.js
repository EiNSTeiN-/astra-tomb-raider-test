import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile, buildTerrainSurface } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { terrainTriangleReader } from "../scripts/inspect-desert-groundcover-browser.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { batchMonasteryBuildings } from "../src/monastery-architecture.js";
import { roofBattenGeometry } from "../src/roof-timber.js";
import { RoofCamera } from "../src/roof-camera.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import {
  buildMonasteryWing,
  verandaSlab,
  verandaDeckMaterial,
  connectMonasteryGallery,
} from "../src/monastery-wings.js";
import {
  monasteryWingPlan,
  monasteryGalleryRoofPlan,
} from "../src/monastery-wing-plan.js";
import {
  roofFaceHeight,
  geometryFromFaces,
  extrude,
  opening,
} from "../src/fitted-facades.js";
import {
  stationMeshSolid,
  stationAssemblySolid,
  stationBlocked,
} from "../src/field-station-solids.js";
import {
  advanceCharacter,
  supportAt,
  safeArrival,
} from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { footstepSurface } from "../src/stealth.js";

const level = LEVELS[2],
  map = createMap(level),
  terrain = createTerrainProfile(map, level);
function fixture(index, side) {
  const room = map.rooms[index],
    world = new T.Group(),
    root = new T.Group();
  root.position.set(
    room.x * 7,
    terrain.height(room.x * 7, room.z * 7),
    room.z * 7,
  );
  world.add(root);
  const materials = Object.fromEntries(
      ["wood", "red", "stone", "plaster"].map((name) => [
        name,
        new T.MeshStandardMaterial({ name, vertexColors: true }),
      ]),
    ),
    deck = verandaDeckMaterial(materials.wood),
    damage =
      side < 0 ? [0, 1, 0, 2, 2, 0, 1, 2, 0][index] : index === 5 ? 1 : 0,
    roof = new T.Mesh(
      monasteryRoofGeometry({
        width: 14.7,
        depth: 8.3,
        rise: 2.15,
        damage,
        seed: index,
      }),
      materials.wood,
    );
  roof.position.set(side * 13.35, 10.15, -19.5);
  root.add(roof);
  const g = {
    world,
    level,
    map,
    groundHeight: (x, z) => terrain.height(x, z),
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    player: new T.Group(),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    audio: { tone() {} },
  };
  const cap = stationMeshSolid(g, { id: "test-wing-roof" }, roof, {
    bodyPadding: 0.55,
    supportRadius: 0,
    groundingSlope: true,
  });
  cap.ceiling = true;
  g.cameraSurfaces.capture(roof, { kernel: new RoofCamera(roof.geometry) });
  g.canMove = (x, z, h = 0, clearance = 1.8) =>
    !g.obstacles.some((o) =>
      stationBlocked(o, x, g.groundHeight(x, z) + h, z, clearance),
    );
  const wing = buildMonasteryWing(g, root, index, side, roof, materials, deck);
  if (wing.plan.gallery) {
    const plan = monasteryGalleryRoofPlan(-17, -5),
      meshes = [];
    for (const snow of [false, true]) {
      const mesh = new T.Mesh(
        monasteryRoofGeometry({
          width: plan.width,
          depth: plan.depth,
          rise: plan.rise,
          snow,
          seed: index,
        }),
        materials.wood,
      );
      mesh.position.set(side * 19, plan.y, plan.z);
      mesh.rotation.y = plan.angle;
      root.add(mesh);
      meshes.push(mesh);
      g.cameraSurfaces.capture(mesh, { kernel: new RoofCamera(mesh.geometry) });
    }
    const cap = stationAssemblySolid(g, { id: "adjoining-gallery" }, meshes, {
      bodyPadding: 0.55,
      supportRadius: 0,
    });
    cap.groundingSlope = true;
    connectMonasteryGallery(wing, meshes);
  }
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  return { g, world, root, wing, roof, materials, deck };
}
function cleanup(f) {
  f.world.traverse((m) => m.geometry?.dispose());
  for (const m of Object.values(f.materials)) m.dispose();
  f.deck.dispose();
}
function geometryChecks(g) {
  const p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv,
    index = g.index,
    edges = new Map();
  let volume = 0,
    collapsed = 0;
  const key = (v) =>
    v
      .toArray()
      .map((n) => Math.round(n * 1e5))
      .join(",");
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
      v = ids.map((i) => new T.Vector3().fromBufferAttribute(p, i));
    assert(new T.Triangle(...v).getArea() > 1e-9);
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    const [a, b, c] = ids.map((i) =>
      new T.Vector2().fromBufferAttribute(uv, i),
    );
    collapsed +=
      Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) < 1e-12 ? 1 : 0;
    for (let j = 0; j < 3; j++) {
      const a = key(v[j]),
        b = key(v[(j + 1) % 3]),
        k = [a, b].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + (a < b ? 1 : -1));
    }
  }
  assert(
    p.array.every(Number.isFinite) &&
      n.array.every(Number.isFinite) &&
      uv.array.every(Number.isFinite),
  );
  assert(volume > 0);
  assert([...edges.values()].every((n) => n === 0));
  return { collapsed, triangles: (index?.count ?? p.count) / 3 };
}

test("closed veranda slabs retain noncollapsed texture coordinates on every incline, end and fascia", () => {
  for (const [a, b] of [
    [0, 0],
    [-3, 6.58],
    [6.58, -3],
  ]) {
    const g = verandaSlab(-6, 5, -0.85, 0.85, a, b, 0.2);
    assert.equal(geometryChecks(g).collapsed, 0);
    g.dispose();
  }
  const g = extrude(
    [
      [-2, 0],
      [2, 0],
      [2, 3],
      [-2, 3],
    ],
    [opening(0, 1.5, 1.4, 1.4, "circle")],
    0.23,
  );
  assert.equal(geometryChecks(g).collapsed, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < 3; i++) uv.setXY(i, 0, 0);
  assert(
    geometryChecks(g).collapsed > 0,
    "a deliberately collapsed texture triangle is rejected",
  );
  g.dispose();
});

test("eighteen distinct wings keep true circulation openings, closed pieces and finite camera shapes after batching", (t) => {
  const plans = new Set();
  let triangles = 0,
    windows = 0;
  for (let index = 0; index < 9; index++)
    for (const side of [-1, 1]) {
      const f = fixture(index, side),
        { g, wing, root } = f;
      plans.add(JSON.stringify(wing.plan));
      assert(wing.root.children.length <= 5);
      assert.equal(g.cameraSurfaces.count, wing.plan.gallery ? 4 : 2);
      for (const mesh of wing.root.children) {
        const check = geometryChecks(mesh.geometry);
        assert.equal(
          check.collapsed,
          0,
          `${index}/${side}/${mesh.material.name}`,
        );
        triangles += check.triangles;
      }
      assert(wing.ramp.slope < 1.1);
      windows += wing.windows.length;
      const center = wing.root.getWorldPosition(new T.Vector3()),
        x = center.x,
        z = center.z,
        floor = supportAt(g, x, z, center.y + 8).height;
      assert(
        floor < center.y + 6,
        "the opening reports its inclined boards, not an invisible loft floor",
      );
      const roofReader = roofFaceHeight(f.roof, false, { allowMissing: true });
      assert.equal(roofReader(100, 100), null);
      assert.throws(() => roofFaceHeight(f.roof)(100, 100));
      assert(
        !g.canMove(x, z + 2, center.y + 5 - g.groundHeight(x, z + 2)),
        "a low body still meets the loft ceiling",
      );
      assert(
        !g.canMove(x, z + 0.8, center.y + 5 - g.groundHeight(x, z + 0.8)),
        "jumping beside the opening cannot ignore its ceiling edge",
      );
      const a = new T.Vector3(x, center.y + 5.5, z),
        b = new T.Vector3(x, center.y + 9, z);
      assert.equal(
        g.cameraSurfaces.entry(a, b, 0.05),
        1,
        "the floor opening remains free above the low central ramp",
      );
      cleanup(f);
    }
  assert.equal(plans.size, 18);
  assert(windows > 50);
  t.diagnostic(`${windows} windows; ${triangles} veranda triangles`);
});

test("the controller ascends every ramp, circles both loft passages and returns to terrain without entering a solid", (t) => {
  let frames = 0;
  for (let index = 0; index < 9; index++)
    for (const side of [-1, 1]) {
      const f = fixture(index, side),
        { g, wing } = f,
        c = wing.root.getWorldPosition(new T.Vector3()),
        start = new T.Vector3(c.x + wing.ramp.lead[0] - side * 0.45, 0, c.z);
      start.y = g.groundHeight(start.x, start.z);
      g.player.position.copy(start);
      g.jumpY = 0;
      g.fallPeak = start.y;
      const walk = (x, z) => {
        for (let i = 0; i < 1500; i++) {
          const p = g.player.position,
            dx = x - p.x,
            dz = z - p.z,
            length = Math.hypot(dx, dz);
          if (length < 0.025) return;
          const speed = Math.min(3, length * 60);
          advanceCharacter(
            g,
            { x: (dx / length) * speed, z: (dz / length) * speed },
            1 / 60,
          );
          frames++;
          assert(
            g.canMove(p.x, p.z, p.y - g.groundHeight(p.x, p.z)),
            `${index}/${side}: clear body at ${p.toArray()}`,
          );
          assert(g.grounded, `${index}/${side}: grounded at ${p.toArray()}`);
        }
        assert.fail(
          `${index}/${side}: route stalled at ${g.player.position.toArray()} toward ${x},${z}`,
        );
      };
      walk(c.x + side * 5.65, c.z);
      assert(Math.abs(g.player.position.y - c.y - wing.plan.floor) < 1e-4);
      for (const [x, z] of wing.plan.loop) walk(c.x + x, c.z + z);
      if (wing.plan.gallery) {
        const x = c.x + wing.plan.gallery.x;
        walk(c.x + side * 5.65, c.z + 2);
        walk(x, c.z + 2);
        walk(x, c.z + 6);
        walk(x, c.z + 2);
        walk(c.x + side * 5.65, c.z + 2);
        walk(c.x + side * 5.65, c.z);
      }
      const saved = {
        x: g.player.position.x,
        y: g.player.position.y,
        z: g.player.position.z,
      };
      assert.deepEqual(safeArrival(g, saved), saved);
      walk(start.x, start.z);
      assert(Math.abs(g.player.position.y - start.y) < 0.08);
      cleanup(f);
    }
  t.diagnostic(
    `${frames} real controller frames across all eighteen ascent/loop/return routes`,
  );
});

test("veranda support selects wood footsteps while preserving chapter terrain and existing timber routes", () => {
  const g = { level: { biome: "snow" } };
  assert.equal(footstepSurface(g, { woodenDeck: true }), "wood");
  assert.equal(footstepSurface(g, { skyBridge: true }), "wood");
  assert.equal(footstepSurface(g, { courier: true }), "wood");
  assert.equal(footstepSurface(g, null), "snow");
  g.level.biome = "desert";
  assert.equal(footstepSurface(g, {}), "desert");
});

test("material batching preserves delivered building geometry and captured camera frames", () => {
  const f = fixture(0, 1),
    c = f.wing.root.getWorldPosition(new T.Vector3()),
    before = new Map();
  f.wing.root.updateMatrix();
  for (const mesh of f.wing.root.children) {
    const g = mesh.geometry.clone().applyMatrix4(f.wing.root.matrix);
    before.set(
      mesh.material.name,
      Object.fromEntries(
        ["position", "normal", "uv"].map((k) => [
          k,
          Array.from(g.attributes[k].array),
        ]),
      ),
    );
    g.dispose();
  }
  const a = c.clone().add(new T.Vector3(0, 7.8, 0)),
    b = c.clone().add(new T.Vector3(0, 7.8, 4)),
    entry = f.g.cameraSurfaces.entry(a, b, 0.28),
    result = batchMonasteryBuildings(f.root, [f.wing]);
  assert.equal(result.children.length, before.size);
  assert.equal(f.wing.root.children.length, 0);
  assert.equal(f.wing.renderRoot, result);
  assert.equal(f.g.cameraSurfaces.entry(a, b, 0.28), entry);
  for (const mesh of result.children) {
    const old = before.get(mesh.material.name);
    for (const k of ["position", "normal", "uv"]) {
      const values = mesh.geometry.attributes[k].array;
      assert.equal(values.length, old[k].length);
      assert(
        values.every(
          (n, i) => Math.abs(n - old[k][i]) < (k === "position" ? 2e-5 : 1e-6),
        ),
        `${mesh.material.name}/${k}`,
      );
    }
    assert(
      mesh.geometry.attributes.monasteryBuilding.array.every((n) => n === 0),
    );
  }
  cleanup(f);
});

test("an older save on a retired gallery skirt settles safely without losing progress", () => {
  const f = fixture(0, 1),
    c = f.root.position,
    oldRoof = new T.Mesh(
      monasteryRoofGeometry({
        width: 13.6,
        depth: 5,
        rise: 1.2,
        snow: true,
        seed: 0,
      }),
      f.materials.wood,
    );
  oldRoof.position.set(c.x + 19, c.y + 5.95, c.z - 11);
  oldRoof.rotation.y = Math.PI / 2;
  oldRoof.updateMatrixWorld(true);
  const x = c.x + 20.8,
    z = c.z - 17.5,
    ray = new T.Raycaster(
      new T.Vector3(x, c.y + 20, z),
      new T.Vector3(0, -1, 0),
    );
  const hit = ray.intersectObject(oldRoof)[0];
  assert(hit);
  const ground = f.g.groundHeight(x, z);
  const saved = {
    position: { x, z, height: hit.point.y - ground },
    stage: 4,
    found: ["old-scripture"],
    field: ["field-3-0"],
  };
  f.g.progress = structuredClone(saved);
  f.g.traversalCourses = [];
  f.g.player.position.set(x, ground, z);
  f.g.health = 100;
  restoreTraversal(f.g);
  assert.equal(f.g.player.position.y, ground);
  assert.equal(f.g.jumpY, 0);
  assert.equal(f.g.health, 100);
  assert.deepEqual(f.g.progress, saved);
  assert(f.g.canMove(x, z, 0));
  oldRoof.geometry.dispose();
  cleanup(f);
});

test("delivered eave and ridge bearers meet the real roof battens, and a displaced member fails contact", (t) => {
  let contacts = 0,
    negative = false;
  for (let index = 0; index < 9; index++)
    for (const side of [-1, 1]) {
      const f = fixture(index, side),
        batten = new T.Mesh(
          roofBattenGeometry(f.roof.geometry),
          f.materials.wood,
        );
      batten.position.copy(f.roof.position);
      f.root.add(batten);
      f.world.updateMatrixWorld(true);
      const center = f.wing.root.getWorldPosition(new T.Vector3()),
        wood = f.wing.root.children.find(
          (m) => m.material === f.materials.wood,
        ),
        ray = new T.Raycaster();
      for (const z of [-2.8, 0, 2.8])
        for (let k = -5; k <= 5; k++) {
          const x = center.x + k * 1.2,
            wz = center.z + z;
          ray.set(new T.Vector3(x, center.y + 8.5, wz), new T.Vector3(0, 1, 0));
          ray.far = 6;
          const roof = ray.intersectObject(f.roof)[0];
          if (!roof) continue;
          ray.set(
            new T.Vector3(x, roof.point.y - 0.2, wz),
            new T.Vector3(0, 1, 0),
          );
          ray.far = 0.3;
          const bearing = ray.intersectObject(batten)[0];
          assert(bearing, "a real batten below the delivered roof");
          ray.set(
            new T.Vector3(x, roof.point.y + 0.08, wz),
            new T.Vector3(0, -1, 0),
          );
          ray.far = 0.7;
          const support = ray.intersectObject(wood)[0];
          assert(support, "a rendered timber beneath the batten");
          assert(
            bearing.point.y - support.point.y < 0.003,
            `${index}/${side}/${k}/${z}: no bearing gap`,
          );
          contacts++;
          if (!negative && z === 0 && k === 0) {
            const broken = new T.Mesh(
              wood.geometry.clone().translate(0, -0.2, 0),
              wood.material,
            );
            broken.applyMatrix4(wood.matrixWorld);
            broken.updateMatrixWorld(true);
            const low = ray.intersectObject(broken)[0];
            assert(
              low && bearing.point.y - low.point.y > 0.1,
              "a displaced member is rejected",
            );
            broken.geometry.dispose();
            negative = true;
          }
        }
      cleanup(f);
    }
  assert(contacts > 500 && negative);
  t.diagnostic(`${contacts} delivered roof-batten bearings`);
});

test("veranda stone feet seat beneath the delivered terrain, and lifted feet fail the observer", async (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", (url, onLoad) => {
    const texture = new T.Texture();
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  });
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: terrain,
    world: new T.Group(),
    waterMeshes: [],
  });
  buildTerrainSurface(game);
  await game.terrainTexturesReady;
  const delivered = terrainTriangleReader(game.terrainMeshes);
  let samples = 0,
    exposed = 0;
  try {
    for (let index = 0; index < 9; index++)
      for (const side of [-1, 1]) {
        const f = fixture(index, side);
        try {
          const stone = f.wing.root.children.find(
              (m) => m.material === f.materials.stone,
            ),
            p = stone.geometry.attributes.position,
            ids = stone.geometry.index;
          stone.updateWorldMatrix(true, false);
          for (let i = 0; i < (ids?.count ?? p.count); i += 3) {
            const v = [0, 1, 2].map((j) =>
              new T.Vector3()
                .fromBufferAttribute(p, ids ? ids.getX(i + j) : i + j)
                .applyMatrix4(stone.matrixWorld),
            );
            if (new T.Triangle(...v).getNormal(new T.Vector3()).y > -0.65)
              continue;
            const center = v
              .reduce((a, b) => a.add(b), new T.Vector3())
              .multiplyScalar(1 / 3);
            for (const point of [...v, center]) {
              const ground = delivered(point.x, point.z);
              assert(ground !== null);
              assert(
                point.y <= ground + 0.002,
                `${index}/${side}: footing floats at ${point.toArray()}`,
              );
              samples++;
              if (point.y + 20 > ground + 0.002) exposed++;
            }
          }
        } finally {
          cleanup(f);
        }
      }
    assert(samples > 500);
    assert.equal(exposed, samples, "deliberately lifted feet are detected");
    t.diagnostic(`${samples} delivered underside/terrain probes`);
  } finally {
    const materials = new Set(),
      textures = new Set();
    game.world.traverse((m) => {
      m.geometry?.dispose();
      if (m.material) materials.add(m.material);
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      m.dispose();
    }
    for (const texture of textures) texture.dispose();
  }
});
