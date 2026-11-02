import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import { roofBattenGeometry, dressMonasteryRoof } from "../src/roof-timber.js";
import { RoofCamera } from "../src/roof-camera.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  stationSupport,
  stationAssemblySolid,
} from "../src/field-station-solids.js";

function closed(geometry, skip = 0) {
  const p = geometry.attributes.position,
    edges = new Map();
  let volume = 0;
  for (let i = skip; i < p.count; i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(p, i + j),
    );
    assert(new T.Triangle(...v).getArea() > 1e-10);
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const key = (v) =>
          v
            .toArray()
            .map((n) => Math.round(n * 1e5))
            .join(","),
        a = key(v[j]),
        b = key(v[(j + 1) % 3]),
        k = [a, b].sort().join("|");
      edges.set(k, (edges.get(k) || 0) + (a < b ? 1 : -1));
    }
  }
  return volume > 0 && [...edges.values()].every((n) => n === 0);
}

test("ceiling battens are closed fitted timbers, follow every delivered hip and stop at damaged corners", (t) => {
  const material = new T.MeshBasicMaterial(),
    ray = new T.Raycaster(),
    intact = roofBattenGeometry(
      monasteryRoofGeometry({ width: 14.7, depth: 8.3, rise: 2.15 }),
    );
  let contacts = 0;
  for (const damage of [0, 1, 2]) {
    const roof = monasteryRoofGeometry({
        width: 14.7,
        depth: 8.3,
        rise: 2.15,
        damage,
      }),
      rafters = roofBattenGeometry(roof),
      mesh = new T.Mesh(roof, material),
      p = rafters.attributes.position;
    assert(closed(rafters));
    assert(!closed(rafters, 3), "a missing cap triangle is rejected");
    assert(p.array.every(Number.isFinite));
    assert(rafters.attributes.normal.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((j) =>
        new T.Vector3().fromBufferAttribute(p, i + j),
      );
      if (new T.Triangle(...v).getNormal(new T.Vector3()).y <= 1e-6) continue;
      const c = v
        .reduce((sum, v) => sum.add(v), new T.Vector3())
        .multiplyScalar(1 / 3);
      ray.set(
        c.clone().add(new T.Vector3(0, -0.03, 0)),
        new T.Vector3(0, 1, 0),
      );
      ray.far = 0.1;
      assert(
        Math.abs(ray.intersectObject(mesh)[0]?.distance - 0.03) < 3e-5,
        `fitted contact ${damage}/${i}`,
      );
      contacts++;
    }
    if (damage) {
      const origin = new T.Vector3(
        damage === 1 ? -6 : 6,
        20,
        damage === 1 ? 3.1 : -3.1,
      );
      ray.set(origin, new T.Vector3(0, -1, 0));
      ray.far = 40;
      assert.equal(
        ray.intersectObject(new T.Mesh(rafters, material)).length,
        0,
      );
      assert(
        ray.intersectObject(new T.Mesh(intact, material)).length > 0,
        "the same strip exists on an intact corner",
      );
    }
    roof.dispose();
    rafters.dispose();
  }
  assert(contacts > 2000);
  t.diagnostic(`${contacts} delivered underside contacts`);
  intact.dispose();
  material.dispose();
});

test("camera and physical support use real strips and preserve the spaces between them", () => {
  const roof = monasteryRoofGeometry({ width: 10, depth: 8, rise: 2 }),
    g = roofBattenGeometry(roof),
    kernel = new RoofCamera(g),
    material = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(g, material),
    ray = new T.Raycaster(new T.Vector3(0, 10, 0), new T.Vector3(0, -1, 0));
  const hit = ray.intersectObject(mesh)[0];
  assert(hit);
  const a = hit.point.clone().add(new T.Vector3(0, 1, 0)),
    b = hit.point.clone().add(new T.Vector3(0, -1, 0));
  assert(Math.abs(kernel.entry(a, b, 0) - 0.5) < 2e-5);
  a.x = b.x = 0.6;
  assert.equal(
    kernel.entry(a, b, 0),
    null,
    "the gap between strips stays open",
  );
  const bounds = new T.Box3().setFromBufferAttribute(g.attributes.position);
  assert(
    bounds.containsPoint(new T.Vector3(0.6, hit.point.y - 0.05, 0)),
    "a roof-wide box would fill this gap",
  );
  const game = { obstacles: [], groundHeight: () => -10 },
    solid = stationAssemblySolid(game, { id: "strips" }, [mesh], {
      supportRadius: 0,
    });
  assert(Math.abs(stationSupport(solid, 0, 0, 10, 0) - hit.point.y) < 2e-5);
  assert.equal(
    stationSupport(solid, 0.6, 0, 10, 0),
    null,
    "physical support leaves the same strip gap open",
  );
  roof.dispose();
  g.dispose();
  material.dispose();
});

test("roof lining preserves the delivered shell and resolves captured camera bounds after parent transforms", () => {
  const world = new T.Group(),
    parent = new T.Group();
  world.add(parent);
  parent.position.set(80, 12, 60);
  parent.rotation.y = 0.63;
  const options = { width: 10, depth: 8, rise: 2 },
    geometry = monasteryRoofGeometry(options),
    snowGeometry = monasteryRoofGeometry({ ...options, snow: true }),
    roof = new T.MeshStandardMaterial({
      map: new T.Texture(),
      normalMap: new T.Texture(),
      roughnessMap: new T.Texture(),
    }),
    wood = new T.MeshStandardMaterial({
      map: new T.Texture(),
      normalMap: new T.Texture(),
      roughnessMap: new T.Texture(),
    }),
    deck = new T.Mesh(geometry, roof),
    snow = new T.Mesh(snowGeometry, new T.MeshStandardMaterial());
  parent.add(deck, snow);
  const originals = Object.fromEntries(
      ["position", "normal", "uv"].map((k) => [
        k,
        geometry.attributes[k].array.slice(),
      ]),
    ),
    indices = geometry.index.array.slice(),
    game = {
      world,
      obstacles: [],
      groundHeight: () => 0,
      cameraSurfaces: new CameraSurfaces(world),
    };
  game.cameraSurfaces.capture(deck);
  const battens = dressMonasteryRoof(game, deck, snow, wood);
  game.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  for (const [k, v] of Object.entries(originals))
    assert.deepEqual(geometry.attributes[k].array, v);
  assert.deepEqual(geometry.index.array, indices);
  const mask = geometry.attributes.roofLining,
    n = geometry.attributes.normal;
  for (let i = 0; i < n.count; i++)
    assert.equal(mask.getX(i), n.getY(i) <= 0 ? 1 : 0);
  const from = new T.Vector3(0, 5, 0).applyMatrix4(parent.matrixWorld),
    to = new T.Vector3(0, -1, 0).applyMatrix4(parent.matrixWorld),
    ray = new T.Raycaster(from, to.clone().sub(from).normalize(), 0, 6),
    hit = ray.intersectObjects([deck, snow, battens])[0];
  assert(hit);
  assert(
    Math.abs(game.cameraSurfaces.entry(from, to, 0) * 6 - hit.distance) < 3e-5,
  );
  const clearFrom = new T.Vector3(4.3, 1.25, -0.4).applyMatrix4(
      parent.matrixWorld,
    ),
    clearTo = new T.Vector3(4.3, 1.25, 0.4).applyMatrix4(parent.matrixWorld);
  ray.set(clearFrom, clearTo.clone().sub(clearFrom).normalize());
  ray.far = 0.8;
  assert.equal(ray.intersectObjects([deck, snow, battens]).length, 0);
  assert.equal(
    game.cameraSurfaces.entry(clearFrom, clearTo, 0),
    1,
    "the captured kernel leaves air above the low hip open; the old roof box filled it",
  );
  assert(
    Math.abs(stationSupport(game.obstacles[0], 80, 60, 30, 0) - hit.point.y) <
      3e-5,
  );
  assert.deepEqual(
    new Set(Object.values(roof).filter((v) => v?.isTexture)),
    new Set([
      roof.map,
      roof.normalMap,
      roof.roughnessMap,
      wood.map,
      wood.normalMap,
      wood.roughnessMap,
    ]),
  );
  const clone = roof.clone();
  assert(
    !clone.roofTimberMap,
    "cloning does not serialize uniform textures into userData",
  );
  const resources = new Set([
    roof,
    wood,
    clone,
    snow.material,
    geometry,
    snowGeometry,
    battens.geometry,
    ...Object.values(roof).filter((v) => v?.isTexture),
  ]);
  resources.forEach((r) => r.dispose());
});
