import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { forgeInteriorPlan } from "../src/forge-interior-art.js";
import { buildForgeInteriors } from "../src/forge-interiors.js";
import { updateForgeArchitecture } from "../src/forge-architecture.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { courtWalkingHeight } from "../src/court-dais-rules.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";

test("eight furnished halls retain front approaches and fit their stepped floors and roofs", (t) => {
  const world = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  const g = {
    world,
    level: { biome: "volcano", seed: 71 },
    obstacles: [],
    stoneMat: material,
    darkMat: material,
    forgeMetal: material,
    groundHeight: (x) => x * 0.002,
    fieldGates: Array.from({ length: 8 }, (_, stage) => {
      const root = new THREE.Group();
      root.position.set(stage * 40, stage * 0.08, 0);
      world.add(root);
      return { stage, root };
    }),
    courtDaises: Array.from({ length: 8 }, (_, stage) => ({
      steps: Array.from({ length: 3 }, (_, i) => ({
        x: stage * 40,
        z: 0,
        w: 4.5 - i * 0.7,
        d: 4.5 - i * 0.7,
        top: stage * 0.08 + 0.115 + i * 0.2,
      })),
    })),
    cameraSurfaces: new CameraSurfaces(world),
  };
  buildForgeInteriors(g);
  world.updateMatrixWorld(true);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set([material]);
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat()) if (m) materials.add(m);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  });
  assert.equal(g.forgeInteriors.length, 8);
  assert.equal(
    new Set(
      g.forgeInteriors.map((h) =>
        forgeInteriorPlan(h.stage)
          .map((p) => p.kind)
          .join("/"),
      ),
    ).size,
    8,
  );
  const ray = new THREE.Raycaster();
  let triangles = 0;
  for (const hall of g.forgeInteriors) {
    assert.equal(hall.root.children.length, 4, "bounded material batches");
    assert.equal(hall.lamps.length, 2);
    triangles += hall.triangles;
    for (const mesh of hall.root.children)
      for (const value of mesh.geometry.attributes.position.array)
        assert(Number.isFinite(value));
    const c = hall.root.position;
    // A 1.3-metre-wide approach remains clear to the original central altar.
    for (let z = 7.5; z >= 2.5; z -= 0.1)
      for (const dx of [-0.65, 0, 0.65]) {
        const x = c.x + dx,
          y = courtWalkingHeight(g, x, z);
        assert(
          !hall.assemblies.some((a) => stationBlocked(a.solid, x, y, z, 2.25)),
          `approach ${hall.stage}`,
        );
      }
    for (const a of hall.assemblies) {
      const b = a.solid.bounds;
      assert(
        b.min.x >= c.x - 5.75 &&
          b.max.x <= c.x + 5.75 &&
          b.min.z >= -5.35 &&
          b.max.z <= 5.35,
        "pieces stay inside the chamber",
      );
      assert(b.max.y < c.y + 5, "overhead roof and shutter remain clear");
      if (!a.spec) continue;
      const s = a.spec,
        x = c.x + s.x,
        z = s.z;
      for (const dx of [-s.w / 2, 0, s.w / 2])
        for (const dz of [-s.d / 2, 0, s.d / 2]) {
          const y = courtWalkingHeight(g, x + dx, z + dz);
          assert(
            a.low < y && a.high + 0.18 > y,
            "the buried foundation and plinth bridge the real dais treads",
          );
        }
      assert(
        stationBlocked(a.solid, x, a.high, z, 1.9),
        "furnishing blocks a body at its base",
      );
      ray.set(new THREE.Vector3(x, c.y + 10, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(hall.root, true)[0];
      assert(hit);
      const cap = stationSupport(a.solid, x, z);
      assert(
        cap !== null && Math.abs(cap - hit.point.y) < 0.02,
        "rendered cap and CPU support agree",
      );
      assert(
        !stationBlocked(a.solid, x, b.max.y + 0.03, z, 1.9),
        "finite bounds above the furnishing",
      );
      if (["baffle", "casting", "fins", "trough", "cradle"].includes(s.kind)) {
        const alongX = Math.abs(s.x) > Math.abs(s.z),
          px = x + (alongX ? -Math.sign(s.x) * (s.w / 2 + 0.79) : 0),
          pz = z + (alongX ? 0 : -Math.sign(s.z) * (s.d / 2 + 0.79)),
          floor = courtWalkingHeight(g, px, pz),
          nearby = stationSupport(a.solid, px, pz, floor + 0.05, 0.55);
        assert(
          nearby === null || nearby <= floor,
          "a nearby plinth must not replace the higher dais as walking support",
        );
      }
    }
  }
  assert(triangles < 90000, "bounded new geometry");
  g.forgeTime = { value: 0 };
  g.elapsed = 2;
  g.forgePatches = [];
  g.forgeLights = [new THREE.PointLight(), new THREE.PointLight()];
  g.player = { position: new THREE.Vector3(80, 1, 0) };
  updateForgeArchitecture(g, 0);
  assert.equal(g.forgeLights.length, 2);
  for (const light of g.forgeLights) {
    assert(light.intensity > 0);
    assert(g.forgeInteriors[2].lamps.some((p) => p.equals(light.position)));
  }
  g.player.position.set(999, 0, 999);
  updateForgeArchitecture(g, 0);
  assert(
    g.forgeLights.every((l) => l.intensity === 0),
    "unused slots turn off",
  );
  g.level.biome = "jungle";
  buildForgeInteriors(g);
  assert.deepEqual(g.forgeInteriors, [], "chapter switch releases references");
});
