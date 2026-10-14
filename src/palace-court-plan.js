const ROOMS = [
  {
    name: "Arrival quay",
    roofs: [
      ["round", 3.7],
      ["round", 4.9],
      ["gable", 3.1],
    ],
    openings: [[[0.2, 0.62, 0.42, 0.92]], [], [[0.45, 0.57, 0.12, 0.78]]],
    rear: [2.7, 1.9],
    shore: [false, true],
    outer: [2.4, 0],
  },
  {
    name: "Counterweight exchange",
    roofs: [
      ["flat", 3.2],
      ["gable", 5.2],
      ["flat", 2.8],
    ],
    openings: [[], [[0.44, 0.56, 0.16, 0.84]], []],
    rear: [5.8, 5.8],
    shore: [true, false],
    outer: [5.8, 0],
  },
  {
    name: "Harbor counting house",
    roofs: [
      ["round", 3.5],
      ["broad", 6.0],
      ["round", 4.5],
    ],
    openings: [[[0.32, 0.64, 0.5, 0.88]], [[0.4, 0.6, 0.34, 0.66]], []],
    rear: [3.2, 6.2],
    outer: [0, 6.2],
  },
  {
    name: "Coral pump workshops",
    roofs: [
      ["gable", 3.8],
      ["gable", 4.7],
      ["gable", 3.1],
    ],
    openings: [[], [[0.43, 0.57, 0.1, 0.9]], [[0.28, 0.61, 0.45, 0.88]]],
    rear: [4.5, 5.9],
    shore: [true, true],
    outer: [4.5, 5.9],
  },
  {
    name: "Tidekeeper return gallery",
    roofs: [
      ["round", 4.2, "z"],
      ["wave", 5.4],
      ["flat", 2.6],
    ],
    openings: [[], [[0.25, 0.43, 0.2, 0.83]], [[0.5, 0.81, 0.45, 0.9]]],
    rear: [6.2, 2.8],
    outer: [6.2, 0],
  },
  {
    name: "Isolated intake court",
    roofs: [
      ["flat", 2.7],
      ["round", 5.6],
      ["gable", 2.9],
    ],
    openings: [
      [[0.16, 0.54, 0.42, 0.9]],
      [[0.45, 0.55, 0.22, 0.77]],
      [[0.25, 0.75, 0.2, 0.8]],
    ],
    rear: [4.3, 1.9],
    shore: [true, false],
    outer: [4.3, 0],
  },
  {
    name: "Counterflow crossing",
    roofs: [
      ["gable", 3.3],
      ["round", 5.9, "z"],
      ["gable", 4.1],
    ],
    openings: [[], [[0.35, 0.65, 0.35, 0.65]], []],
    rear: [5.5, 6.1],
    outer: [6.1, 6.1],
  },
  {
    name: "Queen's circulation hall",
    roofs: [
      ["flat", 3.1],
      ["broad", 7.1],
      ["flat", 3.1],
    ],
    openings: [
      [[0.36, 0.55, 0.14, 0.85]],
      [[0.43, 0.57, 0.27, 0.73]],
      [[0.45, 0.64, 0.14, 0.85]],
    ],
    rear: [6.2, 6.2],
    outer: [6.2, 6.2],
    shore: [true, false],
    doorZ: [-19.5, -16.5],
  },
  {
    name: "Pressure reserve cloisters",
    roofs: [
      ["gable", 3.5, "z"],
      ["flat", 3.5],
      ["gable", 3.5, "z"],
    ],
    openings: [[], [[0.18, 0.82, 0.36, 0.64]], []],
    rear: [6.2, 6.2],
    outer: [3.4, 6.2],
    shore: [false, true],
  },
  {
    name: "Abyssal lock basilica",
    roofs: [
      ["round", 4.2],
      ["broad", 7.6],
      ["wave", 4.9],
    ],
    openings: [[], [[0.38, 0.62, 0.43, 0.8]], [[0.2, 0.4, 0.15, 0.75]]],
    rear: [6.8, 6.8],
    outer: [6.8, 6.8],
  },
];

export function palaceCourtPlan(index) {
  const r = ROOMS[index];
  if (!r) throw new RangeError(`Unknown palace court ${index}`);
  const stops = [-19, -6.5, 6.5, 19];
  const roofs = r.roofs.map(([section, rise, axis = "x"], bay) => {
    const minX = stops[bay] - 0.15,
      maxX = stops[bay + 1] + 0.15,
      minZ = -24.15,
      maxZ = -11.85;
    return {
      bay,
      section,
      rise,
      axis,
      minX,
      maxX,
      minZ,
      maxZ,
      holes: r.openings[bay].map(([a, b, c, d]) => [
        minX + (maxX - minX) * a,
        minX + (maxX - minX) * b,
        minZ + (maxZ - minZ) * c,
        minZ + (maxZ - minZ) * d,
      ]),
    };
  });
  const walls = [];
  for (const [i, side] of [-1, 1].entries()) {
    if (r.rear[i])
      walls.push({
        id: `rear-${side}`,
        x: side * 12.75,
        z: -24,
        length: 12.5,
        angle: 0,
        height: r.shore?.[i] ? Math.max(4.5, r.rear[i]) : r.rear[i],
        kind: r.shore?.[i] ? "window" : "door",
        door: 0,
        doorWidth: 4.2,
      });
    if (r.outer[i])
      walls.push({
        id: `outer-${side}`,
        x: side * 19,
        z: -18,
        length: 12,
        angle: Math.PI / 2,
        height: r.outer[i],
        kind: "door",
        door: -((r.doorZ?.[i] ?? -18) + 18),
        doorWidth: 4.2,
      });
  }
  return { name: r.name, index, roofs, walls };
}

function sectionHeight(kind, u) {
  const q = Math.max(0, 1 - u * u);
  if (kind === "gable") return Math.max(0, 1 - Math.abs(u));
  if (kind === "flat") return Math.min(0.74, q) / 0.74;
  if (kind === "broad") return Math.pow(q, 0.55);
  if (kind === "wave") return Math.sqrt(q) * (1 + 0.34 * u);
  return Math.sqrt(q);
}

export function palaceRoofHeight(roof, spring, x, z, top = false) {
  const lo = roof.axis === "x" ? roof.minX : roof.minZ,
    hi = roof.axis === "x" ? roof.maxX : roof.maxZ,
    value = roof.axis === "x" ? x : z,
    half = (hi - lo) / 2 - (top ? 0 : 1.2),
    u = Math.max(-1, Math.min(1, (value - (lo + hi) / 2) / half));
  return (
    spring +
    (top ? 0.05 : -0.08) +
    (roof.rise + (top ? 0.85 : 0)) * sectionHeight(roof.section, u)
  );
}

export function palaceRoofCells(roof) {
  const unique = (values) =>
    [...new Map(values.map((v) => [Math.round(v * 1e6), v])).values()].sort(
      (a, b) => a - b,
    );
  const axis = (lo, hi, angular, cuts) =>
    unique([
      ...Array.from({ length: angular ? 33 : 7 }, (_, i) =>
        angular
          ? (lo + hi) / 2 - ((hi - lo) / 2) * Math.cos((Math.PI * i) / 32)
          : lo + ((hi - lo) * i) / 6,
      ),
      ...cuts.filter((v) => v > lo && v < hi),
    ]);
  const xs = axis(roof.minX, roof.maxX, roof.axis === "x", [
      ...(roof.axis === "x" ? [roof.minX + 1.2, roof.maxX - 1.2] : []),
      ...roof.holes.flatMap((h) => h.slice(0, 2)),
    ]),
    zs = axis(roof.minZ, roof.maxZ, roof.axis === "z", [
      ...(roof.axis === "z" ? [roof.minZ + 1.2, roof.maxZ - 1.2] : []),
      ...roof.holes.flatMap((h) => h.slice(2)),
    ]);
  const cells = [];
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i],
        x1 = xs[i + 1],
        z0 = zs[j],
        z1 = zs[j + 1],
        x = (x0 + x1) / 2,
        z = (z0 + z1) / 2;
      if (roof.holes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d))
        continue;
      cells.push({ x0, x1, z0, z1, row: j, column: i });
    }
  return cells;
}
