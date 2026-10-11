import * as THREE from "three";

// Index actual world-space render triangles in the plane perpendicular to an
// oblique inspection ray. Closed, outward-wound meshes are required; decorative
// open faces must be omitted by the caller. No movement kernel is consulted.
export function closedMeshReader(meshes, cell = 0.75) {
  const direction = new THREE.Vector3(0.314159, 0.913271, 0.259387).normalize(),
    u = new THREE.Vector3()
      .crossVectors(direction, new THREE.Vector3(0, 1, 0))
      .normalize(),
    v = new THREE.Vector3().crossVectors(direction, u).normalize(),
    cells = new Map(),
    triangles = [];
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index,
      count = index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map((k) =>
          new THREE.Vector3()
            .fromBufferAttribute(position, index ? index.getX(i + k) : i + k)
            .applyMatrix4(mesh.matrixWorld),
        ),
        triangle = new THREE.Triangle(...points),
        normal = triangle.getNormal(new THREE.Vector3());
      if (triangle.getArea() < 1e-12) continue;
      const sign = Math.sign(normal.dot(direction));
      if (!sign) continue;
      const xs = points.map((p) => p.dot(u) / cell),
        ys = points.map((p) => p.dot(v) / cell),
        id = triangles.length;
      triangles.push({ triangle, sign });
      for (
        let y = Math.floor(Math.min(...ys));
        y <= Math.floor(Math.max(...ys));
        y++
      )
        for (
          let x = Math.floor(Math.min(...xs));
          x <= Math.floor(Math.max(...xs));
          x++
        ) {
          const key = `${x},${y}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(id);
        }
    }
  }
  const ray = new THREE.Ray(new THREE.Vector3(), direction),
    intersection = new THREE.Vector3(),
    nearest = new THREE.Vector3();
  return (point) => {
    const x = Math.floor(point.dot(u) / cell),
      y = Math.floor(point.dot(v) / cell),
      bucket = cells.get(`${x},${y}`) || [];
    let winding = 0;
    ray.origin.copy(point);
    for (const id of bucket) {
      const { triangle: t, sign } = triangles[id];
      if (
        ray.intersectTriangle(t.a, t.b, t.c, false, intersection) &&
        intersection.distanceToSquared(point) > 1e-14
      )
        winding += sign;
    }
    if (winding <= 0) return null;
    let distance = Infinity;
    const visited = new Set();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const id of cells.get(`${x + dx},${y + dy}`) || []) {
          if (visited.has(id)) continue;
          visited.add(id);
          triangles[id].triangle.closestPointToPoint(point, nearest);
          distance = Math.min(distance, point.distanceTo(nearest));
        }
    return distance;
  };
}

export function inspectExplorerSolids(game, reader, tolerance = 0.015) {
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  const point = new THREE.Vector3(),
    cache = new Map(),
    report = { samples: 0, embedded: 0, invalid: 0, deepest: 0, witnesses: [] };
  game.avatar.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (let parent = mesh; parent; parent = parent.parent)
      if (!parent.visible) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      report.samples++;
      if (![point.x, point.y, point.z].every(Number.isFinite)) {
        report.invalid++;
        continue;
      }
      const key = `${point.x},${point.y},${point.z}`;
      let depth;
      if (cache.has(key)) depth = cache.get(key);
      else {
        depth = reader(point);
        cache.set(key, depth);
      }
      if (depth === null) continue;
      if (!Number.isFinite(depth)) {
        report.invalid++;
        continue;
      }
      report.deepest = Math.max(report.deepest, depth);
      if (depth > tolerance) {
        report.embedded++;
        if (report.witnesses.length < 12)
          report.witnesses.push({
            mesh: mesh.name,
            vertex: i,
            point: point.toArray(),
            depth,
          });
      }
    }
  });
  return report;
}
