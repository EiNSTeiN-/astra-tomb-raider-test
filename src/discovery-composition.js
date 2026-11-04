// Local metres: +z is the collection approach. Each regional plan leaves that
// arrival open and groups furnishings around a different working/resting edge.
export const DISCOVERY_COMPOSITIONS = Object.freeze({
  jungle: {
    name: "Broken waterkeeper court",
    colors: [0xe3dcc4, 0xb2bea1],
    sites: [
      [-4.5, -1.8],
      [4.1, -0.8],
      [-3.4, -4.6],
    ],
  },
  desert: {
    name: "Survey fan",
    colors: [0xd9c7a6, 0x9f855d],
    sites: [
      [4.5, -2.7],
      [-4.3, -1.1],
      [2.9, -4.9],
    ],
  },
  snow: {
    name: "Pilgrim slate walk",
    colors: [0xc2cbd0, 0x82949f],
    sites: [
      [-3.7, -4.1],
      [-4.6, 0.3],
      [3.9, -2.8],
    ],
  },
  water: {
    name: "Harbor mosaic walk",
    colors: [0xd0d8c9, 0x8ab0a5],
    sites: [
      [4.2, -3.4],
      [4.8, 0.6],
      [-3.7, -2.9],
    ],
  },
  volcano: {
    name: "Split foundry apron",
    colors: [0xb5bbb8, 0xa38c75],
    sites: [
      [-4.9, -1.6],
      [3.8, -3.6],
      [4.6, 0.2],
    ],
  },
  sky: {
    name: "Winged courier landing",
    colors: [0xd0d8cc, 0xa5a37d],
    sites: [
      [-4.2, -3.2],
      [4.7, -1.9],
      [-4.9, 0.6],
    ],
  },
  crystal: {
    name: "Faceted reading court",
    colors: [0xc7c4d1, 0x9896b4],
    sites: [
      [4.2, -2.7],
      [-4.0, -3.1],
      [-4.9, 0.7],
    ],
  },
  eclipse: {
    name: "Interrupted meridian rings",
    colors: [0xcdd2d0, 0xa89e81],
    sites: [
      [-4.6, -2.8],
      [4.8, -0.4],
      [2.8, -4.8],
    ],
  },
});

export function discoveryLayout(biome, variant, index, fixture) {
  const side = index % 2 ? -1 : 1;
  return DISCOVERY_COMPOSITIONS[biome].sites.map(([sx, sz], i) => {
    const x = sx * side * (1 + (variant - 1.5) * 0.045),
      z = sz + (variant === 1 ? 0.45 : variant === 2 ? -0.4 : 0);
    return {
      role: ["backdrop", "fixture", "fragment"][i],
      kind: [variant % 2 ? "rack" : "wall", fixture, "column"][i],
      x,
      z,
      facing: Math.atan2(-x, -z) + (variant - 1.5) * 0.065,
    };
  });
}

// Floor fragments are convex quadrilaterals. They follow the delivered terrain
// triangles, so angled courses and radial stones never bridge a grid diagonal.
export function discoveryPaving(level, member) {
  const index = Number(member.id.split("-")[1]),
    variant = (index + level.seed) % 4,
    theme = DISCOVERY_COMPOSITIONS[level.biome],
    result = [];
  let serial = 0;
  const random = (n) => {
    let x = Math.imul(n + level.seed * 101 + index * 173, 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const add = (points, accent = false, retain = false) => {
    const n = ++serial;
    if (!retain && random(n) < 0.15 + variant * 0.018) return;
    result.push({
      points,
      accent,
      color: theme.colors[accent ? 1 : 0],
      tone: 0.88 + random(n + 701) * 0.18,
    });
  };
  const rectangle = (x, z, w, d, yaw = 0, accent = false, retain = false) => {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    add(
      [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]),
      accent,
      retain,
    );
  };
  const arc = (inner, outer, start, end, count, accent = false) => {
    for (let i = 0; i < count; i++) {
      const a = start + ((end - start) * (i + 0.075)) / count,
        b = start + ((end - start) * (i + 0.925)) / count;
      add(
        [
          [inner, a],
          [outer, a],
          [outer, b],
          [inner, b],
        ].map(([r, t]) => [Math.sin(t) * r, Math.cos(t) * r]),
        accent,
      );
    }
  };
  switch (level.biome) {
    case "jungle":
      // Unequal courses, a broken rear cross-course and paired drainage edges.
      for (let row = -2; row <= 4; row++)
        for (let col = -1; col <= 1; col++)
          rectangle(
            col * 1.06 + (row % 2) * 0.2,
            row * 0.87,
            0.94,
            0.75,
            0,
            row === -2 || col === 0,
          );
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          rectangle(side * 2.05, -1 + i * 1.09, 0.4, 0.95, 0, true);
      for (let i = 0; i < 4; i++) rectangle(-3.3 + i * 1.12, -2.7, 1, 0.64);
      break;
    case "desert":
      for (let row = 0; row < 4; row++)
        arc(
          0.85 + row * 0.9,
          1.65 + row * 0.9,
          -1.36,
          1.36,
          5 + row * 2,
          row === 0 || row === 3,
        );
      for (let i = -2; i <= 2; i++)
        rectangle(i * 0.91, -1.9, 0.79, 0.72, 0, i % 2 === 0);
      break;
    case "snow":
      for (let row = -2; row <= 4; row++)
        for (let col = -1; col <= 1; col++)
          rectangle(
            col * 0.81 + (row % 2) * 0.12,
            row * 1.05,
            0.69,
            0.92,
            0,
            Math.abs(col) === 1,
          );
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
          rectangle(
            -2.4 - col * 0.83,
            -2.3 + row * 0.78,
            0.72,
            0.67,
            0,
            row === 0,
          );
      break;
    case "water":
      // A worn quay meander, with an open gap at the collection approach.
      for (let row = -2; row <= 3; row++)
        for (let col = -2; col <= 2; col++) {
          const border = Math.abs(col) === 2 || row === -2 || row === 3;
          if (!border && (col + row + variant) % 3) continue;
          rectangle(
            col * 0.96 + (row % 2) * 0.12,
            row * 0.91,
            0.83,
            0.78,
            0,
            border,
          );
        }
      for (let i = 0; i < 5; i++)
        rectangle(2.95, -2.2 + i * 1.05, 0.43, 0.91, 0, true);
      for (let i = 0; i < 4; i++)
        rectangle(-1.65 + i * 1.04, 3.75, 0.91, 0.4, 0, true);
      break;
    case "volcano":
      for (const side of [-1, 1])
        for (let i = -2; i <= 4; i++)
          rectangle(side * 1.15, i * 0.9, 0.82, 0.77, 0, i % 3 === 0);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++)
          rectangle(
            -3.15 + col * 1.05,
            -2.9 - row * 0.77,
            0.93,
            0.65,
            0,
            row === 0,
          );
      for (let i = 0; i < 4; i++)
        rectangle(3.1, -1.7 + i * 0.95, 0.54, 0.82, 0, true);
      break;
    case "sky":
      for (let row = 0; row < 6; row++)
        for (const side of [-1, 1])
          rectangle(
            side * (0.67 + row * 0.11),
            -0.9 + row * 0.83,
            1.12,
            0.52,
            -side * 0.48,
            row === 0 || row === 5,
          );
      for (let row = 0; row < 3; row++)
        for (const side of [-1, 1])
          rectangle(
            side * (2.4 + row * 0.68),
            -0.9 - row * 0.37,
            0.88,
            0.53,
            -side * 0.48,
            true,
          );
      for (let i = -2; i <= 2; i++) rectangle(i * 0.9, -2.6, 0.78, 0.65);
      break;
    case "crystal":
      for (let row = 0; row < 3; row++)
        arc(0.9 + row * 1.0, 1.75 + row * 1.0, -Math.PI, Math.PI, 6, row === 1);
      for (let i = 0; i < 4; i++)
        rectangle(0, 2.6 + i * 0.7, 0.48, 0.57, 0, true);
      break;
    case "eclipse":
      for (let row = 0; row < 3; row++) {
        const offset = variant * 0.21 + row * 0.18,
          count = 10 + row * 4;
        arc(
          1 + row * 1.12,
          1.65 + row * 1.12,
          -Math.PI + offset,
          Math.PI - 0.52 + offset,
          count,
          row !== 1,
        );
      }
      break;
  }
  // A light, site-specific skew varies the surviving fragments without moving
  // their owner or the physical collection stance.
  const angle = (variant - 1.5) * 0.045,
    c = Math.cos(angle),
    s = Math.sin(angle),
    side = index % 2 ? -1 : 1;
  for (const tile of result)
    tile.points = tile.points.map(([x, z]) => [
      side * (x * c + z * s),
      -x * s + z * c,
    ]);
  return result;
}
