import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  braidedRingGeometry,
  bellRopeMaterial,
  buildBellRopeLoop,
  updateBellRopeDetail,
} from "../src/bell-rope.js";

// Weld the delivered triangle positions independently of their UV seam indices.
test("all rope tiers are closed outward surfaces with finite smooth normals and the original interaction envelope", () => {
  for (const [segments, sides, relief] of [
    [288, 24, 0.07],
    [192, 18, 0.07],
    [144, 12, 0.035],
  ]) {
    const geometry = braidedRingGeometry(segments, sides, relief),
      p = geometry.attributes.position,
      n = geometry.attributes.normal,
      edges = new Map(),
      a = new THREE.Vector3(),
      b = a.clone(),
      c = a.clone(),
      cross = a.clone(),
      average = a.clone();
    const key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e7))
        .join(",");
    let volume = 0;
    for (let i = 0; i < p.count; i++) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(n, i);
      assert(a.toArray().every(Number.isFinite));
      assert(Math.abs(b.length() - 1) < 1e-6);
      assert(Math.hypot(a.x, a.y) <= 0.218401 && Math.abs(a.z) <= 0.038401);
    }
    for (let i = 0; i < geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map((k) => geometry.index.getX(i + k));
      a.fromBufferAttribute(p, ids[0]);
      b.fromBufferAttribute(p, ids[1]);
      c.fromBufferAttribute(p, ids[2]);
      volume += a.dot(cross.crossVectors(b, c)) / 6;
      cross.crossVectors(b.sub(a), c.sub(a));
      assert(cross.lengthSq() > 1e-14, "degenerate triangle");
      average.set(0, 0, 0);
      ids.forEach((id) =>
        average.add(new THREE.Vector3().fromBufferAttribute(n, id)),
      );
      assert(
        cross.dot(average) > 0,
        "inward triangle or flipped shading normal",
      );
      for (let j = 0; j < 3; j++) {
        const edge = [key(ids[j]), key(ids[(j + 1) % 3])].sort().join("|");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
    assert(volume > 0.004 && volume < 0.006);
    assert(
      [...edges.values()].every((count) => count === 2),
      "open or non-manifold seam",
    );
    for (let j = 0; j <= sides; j++) {
      for (const attribute of [p, n])
        for (let k = 0; k < 3; k++)
          assert.equal(
            attribute.array[j * 3 + k],
            attribute.array[(segments * (sides + 1) + j) * 3 + k],
          );
    }
    for (let i = 0; i <= segments; i++) {
      for (const attribute of [p, n])
        for (let k = 0; k < 3; k++)
          assert.equal(
            attribute.array[i * (sides + 1) * 3 + k],
            attribute.array[(i * (sides + 1) + sides) * 3 + k],
          );
    }
    // Actual delivered triangles meet both ends of the unchanged timber bar.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
      ray = new THREE.Raycaster();
    for (const side of [-1, 1]) {
      ray.set(new THREE.Vector3(), new THREE.Vector3(side, 0, 0));
      const hit = ray.intersectObject(mesh)[0];
      assert(
        hit && hit.distance > 0.14 && hit.distance < 0.15,
        "floating timber grip",
      );
    }
    mesh.material.dispose();
    geometry.dispose();
  }
});

test("32 loops share all three tiers, obey quality and distance hysteresis, and expose unused buffers to chapter cleanup", () => {
  const materials = { rope: bellRopeMaterial() },
    scene = new THREE.Group(),
    camera = new THREE.PerspectiveCamera(),
    loops = [];
  for (let i = 0; i < 32; i++) {
    const loop = buildBellRopeLoop(materials);
    scene.add(loop);
    loops.push(loop);
  }
  const geometries = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
  });
  assert.equal(geometries.size, 3);
  for (const loop of loops) {
    for (let i = 0; i < 3; i++)
      assert.equal(loop.children[i].geometry, loops[0].children[i].geometry);
    const check = (distance, quality, expected) => {
      camera.position.z = distance;
      updateBellRopeDetail(loop, camera, quality);
      assert.deepEqual(
        loop.children.map((m) => m.visible),
        [0, 1, 2].map((i) => i === expected),
      );
    };
    check(5, "high", 0);
    check(12.5, "high", 0);
    check(14, "high", 1);
    check(11.5, "high", 1);
    check(10, "high", 0);
    check(5, "medium", 1);
    check(5, "low", 2);
    check(5, "high", 0);
    check(40, "high", 2);
  }
  // All tiers, including unused ones, are discoverable by scene traversal.
  // The browser check exercises their actual disposal during chapter replacement.
  for (const g of geometries) g.dispose();
  materials.rope.dispose();
});
