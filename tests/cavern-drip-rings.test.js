import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildCaverns, updateCaverns } from "../src/caverns.js";

// Construct local patches from the delivered grid and PlaneGeometry indices,
// independently of the floor sampler used by the ripple fitter.
function terrainPatch(profile, x, z) {
  const { step, width, heights } = profile,
    ix = Math.floor(x / step) - 2,
    iz = Math.floor(z / step) - 2,
    geometry = new T.PlaneGeometry(step * 5, step * 5, 5, 5);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((ix + 2.5) * step, 0, (iz + 2.5) * step);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(
      i,
      heights[
        Math.round(p.getZ(i) / step) * width + Math.round(p.getX(i) / step)
      ],
    );
  return geometry;
}

test("all expanding drip rings clear independently delivered terrain through dry, flooded and drained states", (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[6],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      terrainProfile: profile,
      world: new T.Group(),
      obstacles: [],
      progress: { stage: 0, field: [] },
      jumpY: 0,
      elapsed: 0,
      player: { position: new T.Vector3(56, 26, 56) },
      waterMeshes: [],
    }),
    material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ray = new T.Raycaster(),
    down = new T.Vector3(0, -1, 0),
    published = new T.RingGeometry(0.48, 0.54, 40).rotateX(-Math.PI / 2),
    resources = new Set([material, published]),
    patches = [];
  let probes = 0,
    controlBuried = 0,
    maxGroundGap = 0;
  try {
    buildCaverns(g);
    for (const site of g.cavernDrips.sites) {
      site.phase = 0;
      const geometry = terrainPatch(profile, site.x, site.z);
      resources.add(geometry);
      patches.push(new T.Mesh(geometry, material));
    }
    for (const state of ["dry", "flooded", "drained"]) {
      g.waterMeshes =
        state === "dry"
          ? []
          : g.cavernDrips.sites.map((s) => ({
              position: {
                x: s.x,
                y: g.groundHeight(s.x, s.z) + (state === "flooded" ? 3 : -3),
                z: s.z,
              },
              userData: { kind: "water", width: 8, length: 8 },
            }));
      for (const phase of [0, 0.5, 0.99]) {
        g.elapsed = phase / 0.62;
        updateCaverns(g, 0);
        g.world.updateMatrixWorld(true);
        for (const [index, site] of g.cavernDrips.sites.entries()) {
          const ring = site.ring,
            p = ring.geometry.attributes.position,
            ids = ring.geometry.index,
            patch = patches[index],
            scale = ring.scale.x;
          assert(p.array.every(Number.isFinite));
          assert.equal(
            ring.geometry.attributes.position.usage,
            T.DynamicDrawUsage,
          );
          for (let i = 0; i < ids.count; i += 3) {
            const vertices = [0, 1, 2].map((k) =>
              new T.Vector3()
                .fromBufferAttribute(p, ids.getX(i + k))
                .applyMatrix4(ring.matrixWorld),
            );
            for (const [a, b, c] of [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
              [0.5, 0.5, 0],
              [0, 0.5, 0.5],
              [0.5, 0, 0.5],
              [1 / 3, 1 / 3, 1 / 3],
            ]) {
              const point = vertices[0]
                .clone()
                .multiplyScalar(a)
                .addScaledVector(vertices[1], b)
                .addScaledVector(vertices[2], c);
              ray.set(new T.Vector3(point.x, site.floor + 10, point.z), down);
              const hit = ray.intersectObject(patch)[0];
              assert(hit, "independent floor patch covers the ripple");
              const receiver =
                  state === "flooded"
                    ? Math.max(hit.point.y, g.waterMeshes[index].position.y)
                    : hit.point.y,
                gap = point.y - receiver;
              assert(
                gap >= 0.005,
                `buried ${state} ring ${index}/${phase}: ${gap}`,
              );
              assert(
                gap < 0.085,
                `detached ${state} ring ${index}/${phase}: ${gap}`,
              );
              if (state !== "flooded")
                maxGroundGap = Math.max(maxGroundGap, gap);
              probes++;
            }
          }
          if (state === "dry")
            for (let i = 0; i < published.attributes.position.count; i++) {
              const q = published.attributes.position,
                x = site.x + q.getX(i) * scale,
                z = site.z + q.getZ(i) * scale;
              ray.set(new T.Vector3(x, site.floor + 10, z), down);
              const hit = ray.intersectObject(patch)[0];
              if (g.groundHeight(site.x, site.z) + 0.06 < hit.point.y - 0.001)
                controlBuried++;
            }
          assert(
            ring.geometry.boundingSphere.containsPoint(
              new T.Vector3().fromBufferAttribute(p, 0),
            ),
          );
        }
      }
    }
    assert.equal(g.cavernDrips.sites.length, 9);
    assert(
      controlBuried > 20,
      "published centre-height rings reproduce buried vertices",
    );
    t.diagnostic(
      `${probes} independent ring samples; ${controlBuried} buried published-flat controls; maximum dry/drained gap ${maxGroundGap} m`,
    );
  } finally {
    g.world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    for (const r of resources) r.dispose();
  }
});
