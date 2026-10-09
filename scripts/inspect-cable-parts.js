import * as THREE from "three";

// Observe material batching without keeping primitive meshes in the game.
// The returned pieces use the final render buffers, not camera collision boxes.
export async function captureCableParts(build) {
  const removed = new Map(),
    original = THREE.Object3D.prototype.remove;
  THREE.Object3D.prototype.remove = function (...objects) {
    for (const mesh of objects) {
      if (!mesh.isMesh || mesh.parent !== this) continue;
      mesh.updateMatrix();
      if (!removed.has(this)) removed.set(this, []);
      removed.get(this).push({
        geometry: mesh.geometry,
        material: mesh.material,
        local: mesh.matrix.clone(),
      });
    }
    return original.apply(this, objects);
  };
  let value;
  try {
    value = await build();
  } finally {
    THREE.Object3D.prototype.remove = original;
  }
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    owned = [];
  const part = (geometry, parent, local) => {
    const mesh = new THREE.Mesh(geometry, material);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const record = { mesh, parent, local, bounds: new THREE.Box3() };
    owned.push(record);
    return record;
  };
  function partsFor(rig) {
    const result = [],
      roots = [rig.fixed, rig.winchRoot, ...rig.ornaments.map((o) => o.group)],
      seen = new Set(),
      vertex = new THREE.Vector3();
    for (const root of roots)
      root.traverse((parent) => {
        if (seen.has(parent)) return;
        seen.add(parent);
        const batches = new Map();
        for (const record of removed.get(parent) || []) {
          if (!batches.has(record.material)) batches.set(record.material, []);
          batches.get(record.material).push(record);
        }
        for (const [sourceMaterial, sources] of batches) {
          const batch = parent.children.find(
            (o) =>
              o.isMesh && o.material === sourceMaterial && !o.userData.animated,
          );
          if (!batch || batch.geometry.index)
            throw new Error("Missing expanded cable batch");
          const positions = batch.geometry.attributes.position;
          let offset = 0;
          for (const source of sources) {
            const p = source.geometry.attributes.position,
              index = source.geometry.index,
              count = index?.count ?? p.count;
            for (let i = 0; i < count; i++) {
              vertex
                .fromBufferAttribute(p, index ? index.getX(i) : i)
                .applyMatrix4(source.local);
              if (
                Math.fround(vertex.x) !== positions.getX(offset + i) ||
                Math.fround(vertex.y) !== positions.getY(offset + i) ||
                Math.fround(vertex.z) !== positions.getZ(offset + i)
              )
                throw new Error(
                  "Cable primitive does not match its delivered batch",
                );
            }
            const geometry = new THREE.BufferGeometry().setAttribute(
              "position",
              new THREE.BufferAttribute(
                positions.array.slice(offset * 3, (offset + count) * 3),
                3,
              ),
            );
            result.push(part(geometry, parent, batch.matrix.clone()));
            offset += count;
          }
          if (offset !== positions.count)
            throw new Error("Unobserved vertices in cable batch");
        }
        for (const child of parent.children) {
          if (
            !child.isMesh ||
            (batches.has(child.material) && !child.userData.animated)
          )
            continue;
          const geometry = new THREE.BufferGeometry().setAttribute(
            "position",
            child.geometry.attributes.position.clone(),
          );
          if (child.geometry.index)
            geometry.setIndex(child.geometry.index.clone());
          child.updateMatrix();
          result.push(part(geometry, parent, child.matrix.clone()));
        }
      });
    if (!result.length)
      throw new Error("No delivered cable construction observed");
    return result;
  }
  function update(parts) {
    for (const p of parts) {
      p.mesh.matrixWorld.multiplyMatrices(p.parent.matrixWorld, p.local);
      p.bounds
        .copy(p.mesh.geometry.boundingBox)
        .applyMatrix4(p.mesh.matrixWorld);
    }
  }
  return {
    value,
    partsFor,
    update,
    dispose() {
      for (const p of owned) p.mesh.geometry.dispose();
      owned.length = 0;
      removed.clear();
      material.dispose();
    },
  };
}

// Bounds only reject distant pieces. Triangle crossings belong to each
// original primitive; touching/overlapping backing cannot cancel its parity.
export function cablePartContains(part, point, ray = new THREE.Raycaster()) {
  if (!part.bounds.containsPoint(point)) return false;
  ray.set(point, new THREE.Vector3(0.314, 0.913, 0.259).normalize());
  ray.near = 1e-7;
  ray.far = 100;
  const hits = ray.intersectObject(part.mesh, false),
    unique = hits.filter(
      (hit, i) => !i || hit.distance - hits[i - 1].distance > 1e-6,
    );
  return unique.length % 2 === 1;
}

export function cablePartClosed(part) {
  const p = part.mesh.geometry.attributes.position,
    index = part.mesh.geometry.index,
    edges = new Map(),
    key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => (Math.abs(v) < 5e-7 ? "0.000000" : v.toFixed(6)))
        .join(",");
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map((j) => key(index ? index.getX(i + j) : i + j));
    if (new Set(ids).size < 3) continue;
    for (let j = 0; j < 3; j++) {
      const edge = [ids[j], ids[(j + 1) % 3]].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  return edges.size > 0 && [...edges.values()].every((owners) => owners === 2);
}
