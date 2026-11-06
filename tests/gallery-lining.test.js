import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildSunkenGallery } from "../src/sunken-gallery.js";
import { gallerySection } from "../src/sunken-gallery-layout.js";

function fixture(t) {
  const level = LEVELS[3],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    game = {
      level,
      map,
      terrainProfile,
      world: new T.Group(),
      player: new T.Group(),
      stoneMat: new T.MeshStandardMaterial(),
      darkMat: new T.MeshStandardMaterial(),
      soundSources: [],
      obstacles: [],
      progress: { gallery: null },
      elapsed: 0,
      paused: true,
    };
  game.groundHeight = terrainProfile.height;
  game.waterMeshes = terrainProfile.waters.map((site) => {
    const mesh = new T.Mesh();
    mesh.position.set(site.x, site.baseY, site.z);
    Object.assign(mesh.userData, site);
    return mesh;
  });
  buildSunkenGallery(game);
  game.world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set([game.stoneMat, game.darkMat]);
    game.world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  });
  return game;
}

function triangles(mesh) {
  const g = mesh.geometry,
    p = g.attributes.position,
    result = [];
  for (let at = 0; at < (g.index?.count ?? p.count); at += 3) {
    const indices = [0, 1, 2].map((i) =>
        g.index ? g.index.getX(at + i) : at + i,
      ),
      points = indices.map((i) =>
        new T.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld),
      );
    result.push({ triangle: new T.Triangle(...points), indices, geometry: g });
  }
  return result;
}

// A spatial index of delivered triangles keeps the independent vertical probes
// bounded. It knows nothing about the generator's tile/rectangle subdivision.
function verticalIndex(meshes) {
  const bins = new Map(),
    scale = 2;
  for (const mesh of meshes)
    for (const { triangle } of triangles(mesh)) {
      const vertices = [triangle.a, triangle.b, triangle.c],
        minX = Math.floor(Math.min(...vertices.map((v) => v.x)) * scale),
        maxX = Math.floor(Math.max(...vertices.map((v) => v.x)) * scale),
        minZ = Math.floor(Math.min(...vertices.map((v) => v.z)) * scale),
        maxZ = Math.floor(Math.max(...vertices.map((v) => v.z)) * scale);
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x}/${z}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(triangle);
        }
    }
  const ray = new T.Ray(),
    hit = new T.Vector3();
  return (x, y, z, sign, distance = 0.4) => {
    ray.origin.set(x, y, z);
    ray.direction.set(0, sign, 0);
    const heights = [];
    for (const triangle of bins.get(
      `${Math.floor(x * scale)}/${Math.floor(z * scale)}`,
    ) || [])
      if (
        ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit) &&
        Math.abs(hit.y - y) <= distance
      )
        heights.push(hit.y);
    return heights.sort((a, b) => sign * (a - b));
  };
}

test("delivered gallery slabs are closed, separated and wholly outside the existing swim space", (t) => {
  const g = fixture(t),
    lining = g.sunkenGallery.lining,
    parts = new Map(),
    records = new Map(lining.pieces.map((p) => [p.id, p]));
  assert.equal(lining.meshes.length, 2);
  assert(lining.pieces.length > 1000 && lining.pieces.length < 6000);
  const memorial = g.sunkenGallery.profile.volumes.find(
    (room) => room.id === "memorial",
  );
  for (const piece of lining.pieces.filter((p) => p.kind === "ceiling"))
    assert(
      Math.min(piece.rect.x1, memorial.max.x) -
        Math.max(piece.rect.x0, memorial.min.x) <=
        0.000001 ||
        Math.min(piece.rect.z1, memorial.max.z) -
          Math.max(piece.rect.z0, memorial.min.z) <=
          0.000001,
      "the existing memorial vault needs no hidden coffer geometry",
    );
  for (const mesh of lining.meshes)
    for (const { triangle, indices, geometry } of triangles(mesh)) {
      const ids = geometry.attributes.galleryLining,
        id = ids.getX(indices[0]),
        record = records.get(id),
        normal = triangle.getNormal(new T.Vector3());
      assert(record && indices.every((i) => ids.getX(i) === id));
      assert(triangle.getArea() > 1e-11);
      if (!parts.has(id))
        parts.set(id, {
          edges: new Map(),
          bounds: new T.Box3(),
          triangles: [],
        });
      const part = parts.get(id),
        points = [triangle.a, triangle.b, triangle.c];
      for (let i = 0; i < 3; i++) {
        const v = points[i],
          section = gallerySection(
            g.sunkenGallery.profile,
            (record.rect.x0 + record.rect.x1) / 2,
            (record.rect.z0 + record.rect.z1) / 2,
          ),
          n = new T.Vector3().fromBufferAttribute(
            geometry.attributes.normal,
            indices[i],
          );
        assert(v.toArray().every(Number.isFinite));
        assert(n.dot(normal) > 0.999);
        assert.equal(
          record.plane,
          record.kind === "floor" ? section.floor : section.ceiling,
        );
        if (record.kind === "floor") assert(v.y <= section.floor + 0.000002);
        else assert(v.y >= section.ceiling - 0.000002);
        part.bounds.expandByPoint(v);
        const a = v.toArray().join(","),
          b = points[(i + 1) % 3].toArray().join(","),
          key = [a, b].sort().join("/"),
          edge = part.edges.get(key) || { count: 0, balance: 0 };
        edge.count++;
        edge.balance += a < b ? 1 : -1;
        part.edges.set(key, edge);
      }
      const uv = indices.map((i) =>
        new T.Vector2().fromBufferAttribute(geometry.attributes.uv, i),
      );
      assert(Math.abs(uv[1].sub(uv[0]).cross(uv[2].sub(uv[0]))) > 1e-12);
      part.triangles.push(triangle);
    }
  assert.equal(parts.size, records.size);
  for (const part of parts.values()) {
    assert(
      [...part.edges.values()].every((e) => e.count === 2 && e.balance === 0),
    );
    const center = part.bounds.getCenter(new T.Vector3());
    const volume = part.triangles.reduce(
      (total, triangle) =>
        total +
        triangle.a
          .clone()
          .sub(center)
          .dot(
            triangle.b
              .clone()
              .sub(center)
              .cross(triangle.c.clone().sub(center)),
          ) /
          6,
      0,
    );
    assert(volume > 1e-10);
  }
  const bins = new Map();
  for (const [id, { bounds }] of parts) {
    for (let x = Math.floor(bounds.min.x); x <= Math.floor(bounds.max.x); x++)
      for (
        let z = Math.floor(bounds.min.z);
        z <= Math.floor(bounds.max.z);
        z++
      ) {
        const key = `${x}/${z}`;
        if (!bins.has(key)) bins.set(key, []);
        for (const [, other] of bins.get(key))
          assert(
            !["x", "y", "z"].every(
              (axis) =>
                Math.min(bounds.max[axis], other.max[axis]) -
                  Math.max(bounds.min[axis], other.min[axis]) >
                0.00003,
            ),
            `overlapping slab ${id}`,
          );
        bins.get(key).push([id, bounds]);
      }
  }
});

test("actual paving and coffers cover all nine rooms without raising floors or lowering ceilings", (t) => {
  const g = fixture(t),
    gallery = g.sunkenGallery,
    hits = verticalIndex([...gallery.lining.meshes, gallery.lining.backing]),
    rooms = new Set();
  let probes = 0;
  // Avoid querying exactly on a discontinuous level step: its Float32 mesh
  // coordinate and the double-precision profile can differ by a few microns.
  for (let x = -35.873223; x < 0; x += 0.37)
    for (let z = -2.371319; z < 53; z += 0.37) {
      const wx = gallery.profile.origin.x + x,
        wz = gallery.profile.origin.z + z,
        section = gallerySection(gallery.profile, wx, wz);
      if (!section) continue;
      rooms.add(section.id);
      probes++;
      const floor = hits(wx, section.floor + 0.2, wz, -1)[0],
        ceiling = hits(wx, section.ceiling - 0.2, wz, 1)[0];
      assert(
        Number.isFinite(floor) && Number.isFinite(ceiling),
        `uncovered surface at ${x},${z}`,
      );
      assert(
        floor <= section.floor + 0.000002 && floor >= section.floor - 0.033,
      );
      assert(
        ceiling >= section.ceiling - 0.000002 &&
          ceiling <= section.ceiling + 0.121,
      );
    }
  assert(probes > 5000);
  assert.equal(rooms.size, 9);
});

test("the bronze survey strips reach the paving and retain a shallow visible top", (t) => {
  const g = fixture(t),
    gallery = g.sunkenGallery,
    meshes = [];
  gallery.surveyLine.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const guideHits = verticalIndex(meshes),
    floorHits = verticalIndex([
      gallery.lining.meshes[0],
      gallery.lining.backing,
    ]);
  for (const [x, z, alongX] of [
    [-16, 0, true],
    [-29, 6, false],
    [-29, 25, false],
    [-19, 34, true],
    [-8, 44, false],
  ]) {
    const wx = gallery.profile.origin.x + x,
      wz = gallery.profile.origin.z + z,
      floor = gallerySection(gallery.profile, wx, wz).floor,
      guide = guideHits(wx, floor + 0.2, wz, -1);
    assert(guide.length >= 2);
    assert(guide[0] > floor + 0.025 && guide[0] < floor + 0.04);
    const bottom = guide.at(-1);
    let support = -Infinity;
    for (const offset of [-0.1, -0.05, 0, 0.05, 0.1])
      for (const across of [-0.04, 0, 0.04])
        support = Math.max(
          support,
          floorHits(
            wx + (alongX ? offset : across),
            floor + 0.1,
            wz + (alongX ? across : offset),
            -1,
          )[0] ?? -Infinity,
        );
    assert(
      bottom <= support && bottom > floor - 0.01,
      `${x},${z}: guide bottom ${bottom}, bearing ${support}, floor ${floor}`,
    );
  }
});
