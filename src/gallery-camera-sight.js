import { boxEntry } from "./camera-collision.js";

// The gallery is below the outdoor terrain and uses its own physical volumes.
// Body sight must include those volumes too: a clear central arm can pass over
// the wheel stand while the stand still covers the explorer's torso and hands.
export function galleryCameraSight(game, start, end, wheelContact = false) {
  const gallery = game?.sunkenGallery;
  if (!gallery) return true;
  // The wheel may naturally cover a gripping/releasing hand. Its conservative
  // rotating envelope must not make the camera chase that contact. The stand,
  // walls and all other scene checks still apply to those same hand samples.
  if (gallery.wheelSight && !wheelContact) {
    // A reaching hand can start within this conservative envelope. It may
    // look out toward the wheel's working side, rather than through its hub.
    if (
      start.x >= gallery.wheelSight.min.x &&
      start.x <= gallery.wheelSight.max.x &&
      start.y >= gallery.wheelSight.min.y &&
      start.y <= gallery.wheelSight.max.y &&
      start.z >= gallery.wheelSight.min.z &&
      start.z <= gallery.wheelSight.max.z &&
      end.z >= gallery.wheelSight.min.z - 0.02
    )
      return false;
    const t = boxEntry(start, end, gallery.wheelSight, 0.02);
    if (t !== null && t < 0.999999) return false;
  }
  for (const box of gallery.solids) {
    const t = boxEntry(start, end, box, 0.02);
    if (t !== null && t < 0.999999) return false;
  }
  // The bells are hollow. Testing a filled cylinder would hide every swimmer
  // inside it; inspect crossings of the actual skirt and cap instead.
  for (const bell of gallery.profile.bells) {
    const dx = end.x - start.x,
      dy = end.y - start.y,
      dz = end.z - start.z,
      x = start.x - bell.x,
      z = start.z - bell.z,
      a = dx * dx + dz * dz,
      b = 2 * (x * dx + z * dz),
      c = x * x + z * z - bell.radius ** 2,
      discriminant = b * b - 4 * a * c;
    if (a > 1e-12 && discriminant >= 0)
      for (const t of [
        (-b - Math.sqrt(discriminant)) / (2 * a),
        (-b + Math.sqrt(discriminant)) / (2 * a),
      ]) {
        if (t <= 1e-5 || t >= 0.999999) continue;
        const y = start.y + dy * t;
        if (y > bell.rim - 0.02 && y < bell.ceiling + 0.02) return false;
      }
    if (Math.abs(dy) > 1e-12) {
      const t = (bell.ceiling - start.y) / dy;
      if (
        t > 1e-5 &&
        t < 0.999999 &&
        Math.hypot(x + dx * t, z + dz * t) < bell.radius + 0.08
      )
        return false;
    }
  }
  return true;
}
