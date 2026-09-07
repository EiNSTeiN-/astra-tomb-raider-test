import { galleryAt } from "./sunken-gallery-layout.js";

const EPSILON = 1e-7;

// The gallery has one opening to the exterior. Its ceilings and outer walls are
// solid; a sight line to the outside must pass through this footprint aperture.
// Ignore internal floor changes, gates and bell skirts so the test errs toward
// retaining exterior geometry, including views through the turning passages.
export function galleryFootprint(profile) {
  const entrance = profile.volumes.find((volume) => volume.id === "entrance");
  if (!entrance) return null;
  const portal = {
    x: entrance.max.x,
    min: entrance.min.z,
    max: entrance.max.z,
  };
  const coordinates = (axis) =>
    [
      ...new Set(
        profile.volumes.flatMap((volume) => [
          volume.min[axis],
          volume.max[axis],
        ]),
      ),
    ].sort((a, b) => a - b);
  const xs = coordinates("x"),
    zs = coordinates("z"),
    cells = new Set();
  for (let x = 0; x < xs.length - 1; x++)
    for (let z = 0; z < zs.length - 1; z++) {
      const px = (xs[x] + xs[x + 1]) / 2,
        pz = (zs[z] + zs[z + 1]) / 2;
      if (
        profile.volumes.some(
          (v) => px > v.min.x && px < v.max.x && pz > v.min.z && pz < v.max.z,
        )
      )
        cells.add(`${x},${z}`);
    }
  const vertical = new Map(),
    horizontal = new Map();
  const edge = (lines, fixed, min, max) => {
    if (
      lines === vertical &&
      fixed === portal.x &&
      min >= portal.min &&
      max <= portal.max
    )
      return;
    if (!lines.has(fixed)) lines.set(fixed, []);
    lines.get(fixed).push([min, max]);
  };
  for (const cell of cells) {
    const [x, z] = cell.split(",").map(Number);
    if (!cells.has(`${x - 1},${z}`)) edge(vertical, xs[x], zs[z], zs[z + 1]);
    if (!cells.has(`${x + 1},${z}`))
      edge(vertical, xs[x + 1], zs[z], zs[z + 1]);
    if (!cells.has(`${x},${z - 1}`)) edge(horizontal, zs[z], xs[x], xs[x + 1]);
    if (!cells.has(`${x},${z + 1}`))
      edge(horizontal, zs[z + 1], xs[x], xs[x + 1]);
  }
  const walls = [];
  for (const lines of [vertical, horizontal])
    for (const [fixed, edges] of lines) {
      edges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const edge of edges) {
        const previous = merged.at(-1);
        if (previous && Math.abs(previous[1] - edge[0]) < EPSILON)
          previous[1] = edge[1];
        else merged.push([...edge]);
      }
      for (const [min, max] of merged)
        walls.push(
          lines === vertical
            ? { ax: fixed, az: min, bx: fixed, bz: max }
            : { ax: min, az: fixed, bx: max, bz: fixed },
        );
    }
  return { portal, walls };
}

// Visibility changes only when a ray crosses a wall endpoint. Project those
// endpoints onto the aperture, then test every resulting open interval. This
// retains narrow views around a corner instead of relying on a few
// sampled rays or a hard-coded distance from the entrance.
export function galleryPortalVisible(footprint, camera) {
  if (!footprint) return true;
  const { portal, walls } = footprint,
    dx = portal.x - camera.x;
  if (Math.abs(dx) < EPSILON) return true;
  const breaks = [portal.min, portal.max];
  for (const wall of walls)
    for (const [x, z] of [
      [wall.ax, wall.az],
      [wall.bx, wall.bz],
    ]) {
      const t = dx / (x - camera.x);
      if (t < 1 - EPSILON || !Number.isFinite(t)) continue;
      const projected = camera.z + (z - camera.z) * t;
      if (projected > portal.min && projected < portal.max)
        breaks.push(projected);
    }
  breaks.sort((a, b) => a - b);
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] === breaks[i - 1]) continue;
    const z = (breaks[i] + breaks[i - 1]) / 2,
      dz = z - camera.z;
    const blocked = walls.some((wall) => {
      const vertical = wall.ax === wall.bx;
      const t = vertical
        ? (wall.ax - camera.x) / dx
        : (wall.az - camera.z) / dz;
      if (!Number.isFinite(t) || t < EPSILON || t > 1 - EPSILON) return false;
      const crossing = vertical ? camera.z + dz * t : camera.x + dx * t;
      return (
        crossing > (vertical ? wall.az : wall.ax) - EPSILON &&
        crossing < (vertical ? wall.bz : wall.bx) + EPSILON
      );
    });
    if (!blocked) return true;
  }
  return false;
}

export function galleryExteriorVisible(footprint, camera) {
  // A small guard around the lens retains contact-shading and antialiasing at
  // nearly closed corners. The center ray partition still supplies the exact
  // aperture test; extra origins can only retain more of the exterior.
  for (const dx of [-0.35, 0, 0.35])
    for (const dz of [-0.35, 0, 0.35])
      if (
        galleryPortalVisible(footprint, { x: camera.x + dx, z: camera.z + dz })
      )
        return true;
  return false;
}

export class GalleryVisibility {
  constructor(game) {
    this.game = game;
    this.footprint = galleryFootprint(game.sunkenGallery.profile);
    this.enabled = true;
    this.culled = false;
  }

  render(draw) {
    const game = this.game,
      camera = game.camera.position;
    this.culled =
      this.enabled &&
      !!galleryAt(game, camera.x, camera.y, camera.z) &&
      !galleryExteriorVisible(this.footprint, camera);
    if (!this.culled) return draw();
    const hidden = [],
      preserve = new Set([
        game.sunkenGallery.root,
        game.player,
        game.particles,
        // Keep the clipped ocean at its subpixel joins with the gallery walls.
        // Its reflection capture is unnecessary once the aperture is hidden.
        ...(game.waterMeshes || []).filter((water) => water.userData.sea),
      ]);
    // Rebuild from the live graph: late assets, removed objects and changing
    // effect visibility must not be overwritten by a cached chapter snapshot.
    const collect = (object) => {
      if (!object.visible) return false;
      if (preserve.has(object) || object.isLight) return true;
      const children = object.children.map((child) => [child, collect(child)]);
      if (!children.some(([, kept]) => kept)) return false;
      for (const [child, kept] of children)
        if (!kept && child.visible) hidden.push(child);
      return true;
    };
    collect(game.scene);
    const shadowMap = game.renderer.shadowMap,
      renderShadows = shadowMap.render;
    const visibility = (visible) => {
      for (const object of hidden) object.visible = visible;
    };
    visibility(false);
    // Three builds the camera render list before its shadow pass. Restore the
    // complete caster set only for that pass, then use the culled color/depth
    // lists. This preserves sunlight through the palace and entrance exactly.
    shadowMap.render = function (...args) {
      const updates = this.enabled && (this.autoUpdate || this.needsUpdate);
      if (updates) visibility(true);
      try {
        return renderShadows.apply(this, args);
      } finally {
        if (updates) visibility(false);
      }
    };
    try {
      return draw();
    } finally {
      shadowMap.render = renderShadows;
      visibility(true);
    }
  }
}
