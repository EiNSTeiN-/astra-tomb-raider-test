import * as THREE from "three";

// Guardian armor has rigid skin weights. Partition its original triangles by
// bone once, then reject each small armor bound before testing the exact faces.
// This uses the same delivered geometry as the visible detail tier.
const cache = new WeakMap();
const worldMatrix = new THREE.Matrix4();
const inverse = new THREE.Matrix4();
const localRay = new THREE.Ray();
const partRay = new THREE.Ray();
const a = new THREE.Vector3(),
  b = new THREE.Vector3(),
  c = new THREE.Vector3();
const impact = new THREE.Vector3(),
  worldImpact = new THREE.Vector3();
const boneMatrix = new THREE.Matrix4();
const bounds = new THREE.Sphere();

export function guardianRayParts(geometry) {
  if (cache.has(geometry)) return cache.get(geometry);
  const { position, skinIndex, skinWeight } = geometry.attributes;
  const index = geometry.index,
    grouped = new Map();
  if (!skinIndex || !skinWeight) return null;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const vertices = [0, 1, 2].map((n) => (index ? index.getX(i + n) : i + n));
    const bone = skinIndex.getX(vertices[0]);
    if (
      vertices.some(
        (v) => skinIndex.getX(v) !== bone || skinWeight.getX(v) !== 1,
      )
    ) {
      cache.set(geometry, null);
      return null;
    }
    if (!grouped.has(bone)) grouped.set(bone, []);
    grouped.get(bone).push(...vertices);
  }
  const point = new THREE.Vector3();
  const parts = [...grouped].map(([bone, indices]) => {
    const box = new THREE.Box3();
    for (const i of indices)
      box.expandByPoint(point.fromBufferAttribute(position, i));
    // Expand only the rejection bound for roundoff at a tangent face edge.
    box.expandByScalar(1e-6);
    return { bone, indices, box };
  });
  cache.set(geometry, parts);
  return parts;
}

export function guardianRaycast(mesh, raycaster) {
  if (mesh.boundingSphere) {
    bounds.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
    if (!raycaster.ray.intersectsSphere(bounds)) return null;
  }
  const parts = mesh.isSkinnedMesh && guardianRayParts(mesh.geometry);
  if (!parts) return raycaster.intersectObject(mesh, false)[0] || null;
  let closest = null;
  localRay
    .copy(raycaster.ray)
    .applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
  for (const part of parts) {
    boneMatrix.multiplyMatrices(
      mesh.skeleton.bones[part.bone].matrixWorld,
      mesh.skeleton.boneInverses[part.bone],
    );
    worldMatrix
      .copy(mesh.matrixWorld)
      .multiply(mesh.bindMatrixInverse)
      .multiply(boneMatrix)
      .multiply(mesh.bindMatrix);
    partRay
      .copy(raycaster.ray)
      .applyMatrix4(inverse.copy(worldMatrix).invert());
    if (!partRay.intersectsBox(part.box)) continue;
    // Use the skin's own vertex transform for the surviving faces. Inverting
    // the ray into a bone instead can disagree at shared triangle edges.
    for (let i = 0; i < part.indices.length; i += 3) {
      mesh.getVertexPosition(part.indices[i], a);
      mesh.getVertexPosition(part.indices[i + 1], b);
      mesh.getVertexPosition(part.indices[i + 2], c);
      const hit =
        mesh.material.side === THREE.BackSide
          ? localRay.intersectTriangle(c, b, a, true, impact)
          : localRay.intersectTriangle(
              a,
              b,
              c,
              mesh.material.side !== THREE.DoubleSide,
              impact,
            );
      if (!hit) continue;
      worldImpact.copy(impact).applyMatrix4(mesh.matrixWorld);
      const distance = raycaster.ray.origin.distanceTo(worldImpact);
      if (
        distance < raycaster.near ||
        distance > raycaster.far ||
        (closest && closest.distance <= distance)
      )
        continue;
      closest = { distance, point: worldImpact.clone(), object: mesh };
    }
  }
  return closest;
}
