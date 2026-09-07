// A separate interior beneath the western harbor court. Coordinates are relative
// to its sounding well; the surface terrain remains the support for the palace.
export function createSunkenGallery(terrain, biome) {
  if (biome !== "water") return null;
  const well = terrain.waters.find((site) => site.id === "reservoir-1");
  if (!well) return null;
  const origin = { x: well.x, y: well.baseY, z: well.z };
  const room = (id, x, z, width, length, floor, ceiling) => ({
    id,
    min: {
      x: origin.x + x - width / 2,
      y: origin.y + floor,
      z: origin.z + z - length / 2,
    },
    max: {
      x: origin.x + x + width / 2,
      y: origin.y + ceiling,
      z: origin.z + z + length / 2,
    },
  });
  const volumes = [
    room("entrance", -16, 0, 28, 5, -6, -2),
    room("turning-passage", -29, 6, 5, 14, -6, -2),
    room("first-bell-room", -29, 12, 12, 10, -6, -1),
    room("colonnade", -29, 25, 7, 24, -7.5, -2.5),
    room("cross-gallery", -19, 34, 27, 5, -7.5, -2.5),
    room("second-bell-room", -8, 34, 12, 10, -7.5, -1),
    room("archive-neck", -8, 41, 5, 12, -8.5, -3),
    room("memorial", -8, 48, 14, 10, -8.5, -2.5),
    room("return-passage", -7, 19, 4, 40, -6, -2),
  ];
  const point = (x, y, z) => ({
    x: origin.x + x,
    y: origin.y + y,
    z: origin.z + z,
  });
  return {
    origin,
    volumes,
    entrance: point(-3, -3.5, 0),
    bells: [
      {
        id: "bell-a",
        ...point(-29, -2.8, 12),
        radius: 3.25,
        rim: origin.y - 4.3,
        ceiling: origin.y - 1,
      },
      {
        id: "bell-b",
        ...point(-8, -2.8, 34),
        radius: 3.25,
        rim: origin.y - 4.3,
        ceiling: origin.y - 1,
      },
    ],
    gates: [
      { id: "archive", ...point(-8, -8.5, 41), width: 5, height: 5.5 },
      { id: "return", ...point(-7, -6, 6), width: 4, height: 4 },
    ],
    wheel: point(-4.5, -5.8, 35),
    record: point(-8, -7.2, 50),
  };
}

export function gallerySection(profile, x, z) {
  if (!profile) return null;
  let floor = Infinity,
    ceiling = -Infinity,
    id;
  for (const volume of profile.volumes) {
    if (
      x < volume.min.x ||
      x > volume.max.x ||
      z < volume.min.z ||
      z > volume.max.z
    )
      continue;
    floor = Math.min(floor, volume.min.y);
    ceiling = Math.max(ceiling, volume.max.y);
    id = volume.id;
  }
  return Number.isFinite(floor) ? { floor, ceiling, id } : null;
}

export function galleryAt(game, x, y, z) {
  const section = gallerySection(game.terrainProfile?.gallery, x, z);
  return section && y >= section.floor - 0.15 && y < section.ceiling
    ? section
    : null;
}

export function galleryFloor(game, x, z, y) {
  return galleryAt(game, x, y, z)?.floor ?? game.groundHeight(x, z);
}

export function galleryBellAt(game, x, z) {
  return (
    game.terrainProfile?.gallery?.bells.find(
      (bell) => Math.hypot(x - bell.x, z - bell.z) < bell.radius - 0.12,
    ) || null
  );
}

export function galleryWaterAt(game, x, z, y) {
  const section = galleryAt(game, x, y, z);
  if (!section) return null;
  const profile = game.terrainProfile.gallery;
  const bell = galleryBellAt(game, x, z);
  const surface =
    bell?.y ?? game.sunkenGallery?.well?.position.y ?? profile.origin.y;
  return {
    water:
      game.sunkenGallery?.waterById?.get(bell?.id) || game.sunkenGallery?.well,
    y: surface,
    depth: surface - section.floor,
  };
}

export function galleryClear(game, x, y, z, clearance = 0.8, radius = 0.45) {
  const profile = game.terrainProfile?.gallery;
  if (!profile) return false;
  for (const dx of [-radius, 0, radius])
    for (const dz of [-radius, 0, radius]) {
      const section = gallerySection(profile, x + dx, z + dz);
      if (!section) {
        if (
          y - 0.35 < game.groundHeight(x + dx, z + dz) ||
          (game.walkable && !game.walkable(x + dx, z + dz))
        )
          return false;
      } else if (y - 0.35 < section.floor || y + clearance > section.ceiling)
        return false;
    }
  for (const bell of profile.bells) {
    const distance = Math.hypot(x - bell.x, z - bell.z);
    if (
      Math.abs(distance - bell.radius) < radius + 0.12 &&
      y + clearance > bell.rim
    )
      return false;
  }
  for (const box of game.sunkenGallery?.solids || []) {
    if (
      x + radius > box.min.x &&
      x - radius < box.max.x &&
      z + radius > box.min.z &&
      z - radius < box.max.z &&
      y + clearance > box.min.y &&
      y - 0.35 < box.max.y
    )
      return false;
  }
  return true;
}
