import * as T from "three";

// Settle a stored assembly by its bearing pieces, moving fitted lids and bands
// together. Measurements use the actual shelf triangles and rendered vertices.
export function seatRackCargo(root, shelf, rests, parts, kind, ceiling) {
  root.updateMatrixWorld(true);
  const points = [],
    point = new T.Vector3();
  let bottom = Infinity;
  for (const mesh of rests) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      bottom = Math.min(bottom, point.y);
      points.push(point.clone());
    }
  }
  const ray = new T.Raycaster(),
    down = new T.Vector3(0, -1, 0);
  let gap = Infinity;
  for (const point of points) {
    if (point.y > bottom + 0.008) continue;
    ray.set(new T.Vector3(point.x, point.y + 0.5, point.z), down);
    const hit = ray.intersectObject(shelf)[0];
    if (hit) gap = Math.min(gap, point.y - hit.point.y);
  }
  if (!Number.isFinite(gap)) throw Error("No shelf below stored cargo");
  for (const mesh of parts) mesh.position.y -= gap + 0.002;
  (root.userData.rackSeats ||= []).push({ shelf, rests, parts, kind, ceiling });
}
