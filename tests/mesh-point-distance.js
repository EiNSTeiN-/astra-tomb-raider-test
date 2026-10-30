import { Triangle, Vector3 } from "three";

// Read actual static triangles and their world transforms, independently of
// placement bounds. Skinned geometry needs a separate posed-vertex observer.
export function meshPointDistance(root, point) {
  root.updateWorldMatrix(true, true);
  const triangle = new Triangle(),
    closest = new Vector3();
  let distance = Infinity;
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.isSkinnedMesh)
      throw new Error("Inspect posed skinned vertices.");
    const positions = object.geometry.attributes.position,
      index = object.geometry.index,
      count = index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      for (const [j, vertex] of [triangle.a, triangle.b, triangle.c].entries())
        vertex
          .fromBufferAttribute(positions, index ? index.getX(i + j) : i + j)
          .applyMatrix4(object.matrixWorld);
      triangle.closestPointToPoint(point, closest);
      distance = Math.min(distance, closest.distanceTo(point));
    }
  });
  if (!Number.isFinite(distance))
    throw new Error("No static triangle inspected.");
  return distance;
}
