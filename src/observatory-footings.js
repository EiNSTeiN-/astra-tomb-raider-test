import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Meridian graduations are bronze inlays, rather than raised walking bars.
// Each shared corner follows the actual terrain; most of the metal thickness
// stays beneath the paving while its top remains a few millimetres visible.
export function seatMeridianMark(geometry, x, z, groundHeight) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, p.getY(i) + groundHeight(x + p.getX(i), z + p.getZ(i)) - 0.016);
  geometry.computeVertexNormals();
  return geometry;
}

export function pedestalStoneUV(geometry, yOffset = 0) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    else uv.setXY(i, uv.getX(i) * 12, (p.getY(i) + yOffset) / 2);
  }
  return geometry;
}

// A continuous stone drum backs the shallow course joints. The 32-sided rim
// matches the existing pedestal so its lower edge has support on every face.
export function pedestalFootingGeometry(bottom, top) {
  const count = Math.max(1, Math.ceil((top - bottom) / 0.44)),
    height = (top - bottom) / count,
    profile = [
      [3.96, bottom],
      [4, bottom + 0.035],
    ];
  for (let i = 1; i < count; i++) {
    const y = bottom + height * i;
    profile.push([4, y - 0.018], [3.97, y], [4, y + 0.018]);
  }
  profile.push([4, top]);
  const side = pedestalStoneUV(
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        32,
      ),
    ),
    parts = [side];
  // Separate cap vertices keep their vertical normals and planar texture
  // coordinates from smearing across the upper and lower side courses.
  for (const [radius, y, angle] of [
    [3.96, bottom, Math.PI / 2],
    [4, top, -Math.PI / 2],
  ]) {
    const cap = new THREE.CircleGeometry(radius, 32);
    cap.rotateX(angle).translate(0, y, 0);
    pedestalStoneUV(cap);
    parts.push(cap);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}
