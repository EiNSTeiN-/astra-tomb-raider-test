import { MathUtils } from "three";

// The working pad faces each wheel along +Z. The shaft ends 24.5 cm before
// that pad, inside the camera's 28 cm safety margin when an upper peg rotates
// past chest height. Keep the look point on the clear side of that margin.
// This moves the view, never the controller, and fades out away from the pad.
export function windCameraStandoff(game) {
  if (!game.windSites?.length || game.swimming || game.diving) return 0;
  const p = game.player.position;
  let offset = 0;
  for (const site of game.windSites)
    for (const node of site.nodes) {
      const pad = node.control?.group.position;
      if (!pad) continue;
      const x = Math.abs(p.x - pad.x),
        z = Math.abs(p.z - pad.z),
        height = Math.abs(p.y - pad.y);
      if (x >= 1.3 || z >= 1.2 || height >= 1.4) continue;
      const influence =
        (1 - MathUtils.smoothstep(x, 0.65, 1.3)) *
        (1 - MathUtils.smoothstep(z, 0.65, 1.2)) *
        (1 - MathUtils.smoothstep(height, 0.8, 1.4));
      offset = Math.max(offset, Math.max(0, pad.z + 0.14 - p.z) * influence);
    }
  return offset;
}

// A clear ray to a shifted look point can pass beside a casting while the
// explorer's chest remains behind it. Preserve that body sight line too.
export function windCameraSpace(game, point, chest, offset) {
  return (
    game.cameraSpace(point) &&
    (!offset || game.cameraSurfaces.entry(chest, point, 0) >= 0.999)
  );
}
