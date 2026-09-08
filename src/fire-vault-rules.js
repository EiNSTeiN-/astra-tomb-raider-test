// The Rainkeeper's causeway: six turning crossings in a flooded side tomb.
// Directions are north, east, south, west. Rotation is clockwise in quarter turns.
export const VAULT_START = [3, 0, 1, 3, 2, 1];
export const VAULT_PORTS = [
  [0, 1, 2],
  [0, 1],
  [0, 1, 2],
  [0, 1, 2],
  [0, 1, 2],
  [0, 1],
];
export const VAULT_FIRES = [1, 3, 5];
export const VAULT_CELLS = [
  [-8, -16],
  [8, -16],
  [-8, 0],
  [8, 0],
  [-8, 16],
  [8, 16],
];
export const VAULT_RECORD = {
  title: "The lamps were for everyone",
  text: "The last keeper did not seal this room to protect a treasure. She left the crossings movable so that the people waiting on either bank could reach one another. Three lamps meant the passage was ready: one for the travelers, one for the children, and one for those who would arrive after dark.",
  note: "Elara's annotation: Their sanctuary was a promise of shelter. Someone later mistook its locks for a warning.",
};
export function normalizeFireVault(value) {
  const turns = Array.isArray(value?.turns) ? value.turns : [];
  const lit = [
    ...new Set(
      Array.isArray(value?.lit)
        ? value.lit.filter((i) => VAULT_FIRES.includes(i))
        : [],
    ),
  ].sort();
  return {
    turns: VAULT_START.map((start, i) =>
      Number.isInteger(turns[i]) && turns[i] >= 0 && turns[i] < 4
        ? turns[i]
        : start,
    ),
    lit,
    visited: value?.visited === true,
    recovered: value?.recovered === true && lit.length === 3,
  };
}
export function vaultPorts(turns, index) {
  return VAULT_PORTS[index].map((d) => (d + turns[index]) % 4);
}
export function vaultLinks(turns) {
  const links = [];
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++) {
      const [ax, az] = VAULT_CELLS[a],
        [bx, bz] = VAULT_CELLS[b];
      const dx = bx - ax,
        dz = bz - az;
      if (Math.abs(dx) + Math.abs(dz) !== 16) continue;
      const d = dx > 0 ? 1 : dz > 0 ? 2 : dx < 0 ? 3 : 0;
      if (
        vaultPorts(turns, a).includes(d) &&
        vaultPorts(turns, b).includes((d + 2) % 4)
      )
        links.push([a, b]);
    }
  return links;
}
export function vaultReachable(turns) {
  const reached = new Set();
  if (!vaultPorts(turns, 0).includes(0)) return reached;
  reached.add(0);
  const links = vaultLinks(turns);
  for (let pass = 0; pass < 6; pass++)
    for (const [a, b] of links) {
      if (reached.has(a)) reached.add(b);
      if (reached.has(b)) reached.add(a);
    }
  return reached;
}
export function addFireVault(map, level) {
  if (level.id !== "verdant") return map;
  // Added after the original seeded features: existing IDs, answers and positions
  // remain stable for old saves. The side path begins south of the entrance camp.
  const site = { x: 8, z: 17, r: 4.8, fireVault: true };
  map.fireVault = site;
  for (let z = site.z - 5; z <= site.z + 5; z++)
    for (let x = site.x - 4; x <= site.x + 4; x++) map.grid[z][x] = 1;
  const path = [];
  for (let z = map.rooms[0].z; z <= site.z - 4; z++) {
    map.grid[z][site.x] = 1;
    path.push({ x: site.x, z });
  }
  map.paths.push(path);
  return map;
}

export function vaultDeckAt(game, x, z, maxY = Infinity) {
  const v = game.fireVault;
  if (!v || v.y + 1.92 > maxY + 0.2) return null;
  const localX = x - v.x,
    localZ = z - v.z;
  for (const edge of v.edges || []) {
    if (!edge.open) continue;
    const { a, b } = edge,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const along = ((localX - a[0]) * dx + (localZ - a[1]) * dz) / length;
    const across = ((localX - a[0]) * dz - (localZ - a[1]) * dx) / length;
    if (along >= 0 && along <= length && Math.abs(across) <= 1.12)
      return { height: v.y + 1.92, surface: { vault: true } };
  }
  return null;
}

export function vaultBridgeBlocked(game, x, z, y) {
  const v = game.fireVault;
  if (!v) return false;
  const px = x - v.x,
    pz = z - v.z;
  return v.edges.some((e) => {
    if (e.open) return false;
    const dx = e.b[0] - e.a[0],
      dz = e.b[1] - e.a[1],
      length = Math.hypot(dx, dz);
    const along = ((px - e.a[0]) * dx + (pz - e.a[1]) * dz) / length;
    const across = ((px - e.a[0]) * dz - (pz - e.a[1]) * dx) / length;
    const fromHinge = Math.min(along, length - along) - 1.7;
    const angle = (1 - e.amount) * Math.PI * 0.47;
    if (
      Math.abs(across) > 1.3 ||
      fromHinge < 0 ||
      fromHinge > (length / 2 - 1.7) * Math.cos(angle)
    )
      return false;
    const height = v.y + 1.92 + fromHinge * Math.tan(angle);
    return y < height + 0.22 && y + 1.8 > height - 0.22;
  });
}
