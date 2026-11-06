import { stationBlocked } from "./field-station-solids.js";
import { waterAt } from "./hydrology.js";

// A previous save may occupy a newly solid float. Depenetrate only that float;
// other scenery and water limits still constrain the complete swim footprint.
export function recoverArchiveFloat(game, fits) {
  const p = game.player.position;
  for (const site of game.tideArchive || []) {
    if (!site.floatSolids?.some((s) => stationBlocked(s, p.x, p.y, p.z, 0.8)))
      continue;
    const dx = p.x - site.buoy.position.x,
      dz = p.z - site.buoy.position.z,
      heading =
        Math.hypot(dx, dz) > 0.001
          ? Math.atan2(dx, dz)
          : game.avatar.rotation.y + Math.PI;
    for (let ring = 1; ring <= 25; ring++)
      for (const offset of [
        0,
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI,
        Math.PI / 4,
        -Math.PI / 4,
        (3 * Math.PI) / 4,
        (-3 * Math.PI) / 4,
      ]) {
        const x = p.x + Math.sin(heading + offset) * ring * 0.1,
          z = p.z + Math.cos(heading + offset) * ring * 0.1;
        if ((waterAt(game, x, z, p.y)?.depth || 0) < 1.1 || !fits(x, p.y, z))
          continue;
        let clear = true;
        const visible = site.buoy.visible;
        site.buoy.visible = false;
        try {
          for (let step = 0; step <= ring; step++)
            if (
              !fits(
                p.x + ((x - p.x) * step) / ring,
                p.y,
                p.z + ((z - p.z) * step) / ring,
              )
            ) {
              clear = false;
              break;
            }
        } finally {
          site.buoy.visible = visible;
        }
        if (!clear) continue;
        p.x = x;
        p.z = z;
        game.jumpY = Math.max(0, p.y - game.groundHeight(x, z));
        return true;
      }
  }
  return false;
}
