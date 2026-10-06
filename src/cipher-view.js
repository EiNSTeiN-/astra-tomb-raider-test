import { MathUtils, Vector2, Vector3 } from "three";

// Keep the whole delivered court, including intermediate drum rotations,
// inside the free canvas area beside or above the native inspection panel.
export function frameCipherCourt(game, site) {
  const camera = game.camera,
    canvas = game.renderer.domElement,
    width = canvas.clientWidth,
    height = canvas.clientHeight,
    compact = width <= 600 || (width <= 900 && height >= width),
    bounds = site.inspectionBounds,
    center = bounds.getCenter(new Vector3()),
    { side = 0, lift = 3, forward = 8 } = site.trial.inspection || {};
  camera.clearViewOffset();
  // Authored side views stay below the foreground canopy and separate the
  // inscription from the rear drums. All eyes remain outside the court bounds.
  camera.position.set(
    center.x + side,
    bounds.max.y + lift,
    bounds.max.z + forward,
  );
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const panel = canvas.ownerDocument
      ?.querySelector(".cipher-focus .modal")
      ?.getBoundingClientRect(),
    inset = 16,
    right = compact
      ? width - inset
      : (panel?.left ?? width - (height <= 560 ? 352 : 458)) - inset,
    bottom = compact
      ? (panel?.top ?? height * 0.45 - 12) - inset
      : height - inset,
    min = new Vector2(Infinity, Infinity),
    max = new Vector2(-Infinity, -Infinity),
    point = new Vector3();
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        const slope = new Vector2(point.x / -point.z, point.y / -point.z);
        min.min(slope);
        max.max(slope);
      }
  const scale = Math.min(
      Math.max(1, right - inset) / (max.x - min.x),
      Math.max(1, bottom - inset) / (max.y - min.y),
    ),
    offsetX = width / 2 + ((min.x + max.x) * scale) / 2 - (inset + right) / 2,
    offsetY = height / 2 - ((min.y + max.y) * scale) / 2 - (inset + bottom) / 2;
  camera.fov = MathUtils.radToDeg(2 * Math.atan(height / (2 * scale)));
  camera.filmOffset = 0;
  camera.setViewOffset(width, height, offsetX, offsetY, width, height);
  return true;
}
