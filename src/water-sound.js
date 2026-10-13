// The rectangular water sheet includes buried margins and protected dry pads.
// Place its ambient voice over water that survives both the floor and the
// delivered sheet's interpolated bed test, rather than its old mesh centre.
const anchors = new WeakMap();
const wetMargin = 0.06; // Beyond the wave harmonics' combined 0.051 m amplitude.

function poolAnchors(game, water) {
  const geometry = water.geometry,
    positions = geometry.attributes.position,
    beds = geometry.attributes.bedHeight,
    indices = geometry.index,
    count = indices?.count ?? positions.count,
    centre = {
      dx: 0,
      dz: 0,
      bottom: game.groundHeight(water.position.x, water.position.z),
    };
  let deepest = null;
  const pontoon = water.userData.arcade && game.arcadeLock?.pontoonDeck;
  const covered = (dx, dz) =>
    pontoon &&
    Math.abs(water.position.x + dx - pontoon.x) <= pontoon.w + 0.12 &&
    Math.abs(water.position.z + dz - pontoon.z) <= pontoon.d + 0.12;
  // The sealed moving deck rides 0.3 m above this pool. Its centre remains
  // wet beneath the platform, but its ambient voice belongs in the open water.
  if (covered(0, 0)) centre.bottom = Infinity;
  const vertex = (i) => (indices ? indices.getX(i) : i);
  for (let i = 0; i < count; i += 3) {
    const a = vertex(i),
      b = vertex(i + 1),
      c = vertex(i + 2),
      ax = positions.getX(a),
      az = -positions.getY(a),
      bx = positions.getX(b),
      bz = -positions.getY(b),
      cx = positions.getX(c),
      cz = -positions.getY(c),
      dx = (ax + bx + cx) / 3,
      dz = (az + bz + cz) / 3,
      bottom = Math.max(
        (beds.getX(a) + beds.getX(b) + beds.getX(c)) / 3,
        game.groundHeight(water.position.x + dx, water.position.z + dz),
      );
    if (
      !covered(dx, dz) &&
      (!deepest ||
        bottom < deepest.bottom - 1e-6 ||
        (Math.abs(bottom - deepest.bottom) <= 1e-6 &&
          dx * dx + dz * dz <
            deepest.dx * deepest.dx + deepest.dz * deepest.dz))
    )
      deepest = { dx, dz, bottom };
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(determinant) < 1e-12) continue;
    const u = ((bz - cz) * -cx + (cx - bx) * -cz) / determinant,
      v = ((cz - az) * -cx + (ax - cx) * -cz) / determinant;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
      centre.bottom = Math.max(
        centre.bottom,
        u * beds.getX(a) + v * beds.getX(b) + (1 - u - v) * beds.getX(c),
      );
  }
  return {
    geometry,
    x: water.position.x,
    z: water.position.z,
    centre,
    deepest,
  };
}

export function waterSoundAnchor(game, water) {
  // Legacy lightweight callers have no rendered sheet to survey.
  if (!game.groundHeight || !water.geometry?.attributes.bedHeight)
    return water.position;
  let points = anchors.get(water);
  if (
    !points ||
    points.geometry !== water.geometry ||
    points.x !== water.position.x ||
    points.z !== water.position.z
  ) {
    points = poolAnchors(game, water);
    anchors.set(water, points);
  }
  const { y } = water.position;
  const point =
    y - points.centre.bottom >= 0.2 ? points.centre : points.deepest;
  if (!point || y - point.bottom <= wetMargin) return null;
  return { x: water.position.x + point.dx, y, z: water.position.z + point.dz };
}
