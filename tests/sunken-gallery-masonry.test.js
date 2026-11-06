import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildSunkenGallery } from "../src/sunken-gallery.js";
import { galleryClear } from "../src/sunken-gallery-layout.js";

function fixture(t) {
  const level = LEVELS[3],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    g = {
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
  g.groundHeight = terrainProfile.height;
  g.waterMeshes = terrainProfile.waters.map((site) => {
    const m = new T.Mesh();
    m.position.set(site.x, site.baseY, site.z);
    Object.assign(m.userData, site);
    return m;
  });
  buildSunkenGallery(g);
  g.world.updateMatrixWorld(true);
  t.after(() => {
    const geos = new Set(),
      mats = new Set([g.stoneMat, g.darkMat]);
    g.world.traverse((m) => {
      if (m.geometry) geos.add(m.geometry);
      if (m.material) mats.add(m.material);
    });
    for (const x of geos) x.dispose();
    for (const x of mats) x.dispose();
  });
  return g;
}

function stones(root) {
  const parts = new Map();
  root.traverse((mesh) => {
    const g = mesh.geometry,
      ids = g?.attributes.galleryStone;
    if (!ids) return;
    const p = g.attributes.position,
      n = g.attributes.normal,
      uv = g.attributes.uv;
    for (let at = 0; at < (g.index?.count ?? p.count); at += 3) {
      const indices = [0, 1, 2].map((j) =>
          g.index ? g.index.getX(at + j) : at + j,
        ),
        id = ids.getX(indices[0]);
      assert(indices.every((i) => ids.getX(i) === id));
      if (!parts.has(id))
        parts.set(id, { triangles: [], bounds: new T.Box3() });
      const part = parts.get(id),
        vertices = indices.map((i) =>
          new T.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld),
        ),
        triangle = new T.Triangle(...vertices),
        face = triangle.getNormal(new T.Vector3());
      assert(triangle.getArea() > 1e-10);
      for (const i of indices) {
        const normal = new T.Vector3()
          .fromBufferAttribute(n, i)
          .transformDirection(mesh.matrixWorld);
        assert(normal.dot(face) > 0.999);
      }
      const tex = indices.map((i) =>
        new T.Vector2().fromBufferAttribute(uv, i),
      );
      assert(Math.abs(tex[1].sub(tex[0]).cross(tex[2].sub(tex[0]))) > 1e-12);
      for (const v of vertices) {
        assert(v.toArray().every(Number.isFinite));
        part.bounds.expandByPoint(v);
      }
      part.triangles.push(vertices);
    }
  });
  return [...parts.values()];
}

function overlaps(parts) {
  const hits = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = 0; j < i; j++) {
      const a = parts[i].bounds,
        b = parts[j].bounds;
      if (
        ["x", "y", "z"].every(
          (k) =>
            Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 1e-5,
        )
      )
        hits.push([i, j]);
    }
  return hits;
}

test("delivered gallery courses are closed, embedded stone pieces with separated corner beds", (t) => {
  const g = fixture(t),
    parts = stones(g.sunkenGallery.root),
    ray = new T.Raycaster(),
    backing = [];
  g.sunkenGallery.root.traverse((m) => {
    if (m.isMesh && m.material === g.darkMat) backing.push(m);
  });
  assert.equal(parts.length, g.sunkenGallery.masonry.pieces);
  assert(parts.length > 400 && parts.length < 2000);
  assert(g.sunkenGallery.masonry.corners.length > 10);
  for (const part of parts) {
    const edges = new Map(),
      center = part.bounds.getCenter(new T.Vector3());
    let volume = 0;
    for (const v of part.triangles) {
      volume +=
        v[0]
          .clone()
          .sub(center)
          .dot(v[1].clone().sub(center).cross(v[2].clone().sub(center))) / 6;
      for (let i = 0; i < 3; i++) {
        const a = v[i].toArray().join(","),
          b = v[(i + 1) % 3].toArray().join(","),
          key = [a, b].sort().join("/");
        const e = edges.get(key) || { count: 0, balance: 0 };
        e.count++;
        e.balance += a < b ? 1 : -1;
        edges.set(key, e);
      }
    }
    assert(volume > 1e-5);
    assert([...edges.values()].every((e) => e.count === 2 && e.balance === 0));
    let embedded = false;
    for (const direction of [
      new T.Vector3(1, 0, 0),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 0, 1),
      new T.Vector3(0, 0, -1),
    ]) {
      // Chipping can shift a corner's centroid just past both finite backing
      // edges. Probe inside its actual width, then require the backing plane
      // to lie between delivered stone faces with substantial depth each side.
      const tangent = new T.Vector3(-direction.z, 0, direction.x);
      for (const shift of [-0.04, 0, 0.04]) {
        ray.set(
          center
            .clone()
            .addScaledVector(direction, 0.35)
            .addScaledVector(tangent, shift),
          direction.clone().negate(),
        );
        ray.far = 0.7;
        const distances = part.triangles.flatMap((v) => {
          const p = ray.ray.intersectTriangle(...v, false, new T.Vector3());
          return p ? [p.distanceTo(ray.ray.origin)] : [];
        });
        if (distances.length < 2) continue;
        if (
          ray
            .intersectObjects(backing)
            .some(
              (h) =>
                Math.abs(h.face.normal.y) < 0.1 &&
                h.distance - Math.min(...distances) > 0.06 &&
                Math.max(...distances) - h.distance > 0.06,
            )
        )
          embedded = true;
      }
    }
    assert(
      embedded,
      "each stone engages the retained wall rather than floating in the passage: " +
        JSON.stringify({
          center: center.toArray(),
          min: part.bounds.min.toArray(),
          max: part.bounds.max.toArray(),
        }),
    );
  }
  assert.deepEqual(overlaps(parts), []);
  const displaced = parts[1].bounds.clone();
  parts[1].bounds.copy(parts[0].bounds);
  assert(
    overlaps(parts).length > 0,
    "interpenetrating course control must be detected",
  );
  parts[1].bounds.copy(displaced);
  t.diagnostic(
    `${parts.length} closed stones; ${g.sunkenGallery.masonry.runs.length} wall runs; ${g.sunkenGallery.masonry.corners.length} bonded corners`,
  );
});

test("each delivered bell anchor connects its actual floor and cap and reserves collision for its visible parts", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster(),
    anchors = g.sunkenGallery.bellAnchors;
  assert.equal(anchors.length, 4);
  for (const a of anchors) {
    for (let y = a.floor + 0.02; y < a.ceiling + 0.02; y += 0.09) {
      ray.set(new T.Vector3(a.x + 0.4, y, a.z), new T.Vector3(-1, 0, 0));
      ray.far = 0.8;
      assert(
        ray
          .intersectObject(a.group, true)
          .some((h) => Math.abs(h.point.x - a.x) < 0.24),
        "the tie has no unsupported vertical break",
      );
    }
    const foot = new T.Box3().setFromObject(a.group);
    assert(foot.min.y < a.floor - 0.04 && foot.max.y > a.ceiling + 0.03);
    const backing = [];
    g.sunkenGallery.root.traverse((m) => {
      if (
        m.isMesh &&
        (m.material === g.darkMat ||
          g.sunkenGallery.lining.meshes.includes(m) ||
          m.material.name === "Patinated air-bell bronze") &&
        !m.geometry.attributes.galleryAnchorPart
      )
        backing.push(m);
    });
    ray.set(new T.Vector3(a.x, a.floor + 0.001, a.z), new T.Vector3(0, -1, 0));
    ray.far = a.floor - foot.min.y;
    assert(
      ray
        .intersectObjects(backing)
        .some(
          (h) => h.point.y <= a.floor + 2e-5 && h.point.y > foot.min.y + 0.015,
        ),
      "shoe is founded on the delivered floor",
    );
    ray.set(new T.Vector3(a.x, a.ceiling - 0.1, a.z), new T.Vector3(0, 1, 0));
    ray.far = 0.2;
    assert(
      ray
        .intersectObjects(backing)
        .some((h) => Math.abs(h.point.y - a.ceiling) < 2e-5),
      "flange engages the actual air-bell cap",
    );
    assert.equal(a.boxes.length, 6);
    assert(a.boxes.every((b) => g.sunkenGallery.solids.includes(b)));
    const bodyBox = a.boxes[2];
    assert(
      bodyBox.max.x - bodyBox.min.x < 0.14,
      "the narrow rod must not become a shoe-width invisible column",
    );
    assert(!galleryClear(g, a.x, (a.floor + a.ceiling) / 2, a.z, 0.1, 0.02));
    const rod = [];
    a.group.traverse((m) => {
      if (m.geometry?.attributes.galleryAnchorPart) {
        const id = m.geometry.attributes.galleryAnchorPart;
        if (Array.from(id.array).every((v) => v === 3)) rod.push(m);
      }
    });
    assert.equal(rod.length, 1);
    rod[0].visible = false;
    // Raycaster itself ignores visibility; omit the actual rod mesh from the
    // queried draw set for the missing-shaft control.
    const others = [];
    a.group.traverse((m) => {
      if (m.isMesh && !rod.includes(m)) others.push(m);
    });
    ray.set(
      new T.Vector3(a.x + 0.4, a.floor + 0.8, a.z),
      new T.Vector3(-1, 0, 0),
    );
    ray.far = 0.8;
    assert.equal(
      ray.intersectObjects(others).length,
      0,
      "missing shaft must expose a break",
    );
    rod[0].visible = true;
  }
});
