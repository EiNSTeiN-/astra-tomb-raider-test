const oval = (x, y, rx, ry = rx, count = 48) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * Math.PI * 2) / count;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
  });
const panel = (x, y, w, h) => [
  [x - w / 2 + 0.06, y],
  [x + w / 2 - 0.06, y],
  [x + w / 2, y + 0.06],
  [x + w / 2, y + h - 0.06],
  [x + w / 2 - 0.06, y + h],
  [x - w / 2 + 0.06, y + h],
  [x - w / 2, y + h - 0.06],
  [x - w / 2, y + 0.06],
];
const star = (x, y, radius, points = 8) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = (i * Math.PI) / points,
      r = radius * (i % 2 ? 0.45 : 1);
    return [x + Math.sin(a) * r, y + Math.cos(a) * r];
  });
const arch = (radius, thickness, y, stretch = 1) => {
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i * Math.PI) / 24;
    points.push([Math.cos(a) * radius, y + Math.sin(a) * radius * stretch]);
  }
  for (let i = 24; i >= 0; i--) {
    const a = (i * Math.PI) / 24;
    points.push([
      Math.cos(a) * (radius - thickness),
      y + Math.sin(a) * (radius - thickness) * stretch,
    ]);
  }
  return points;
};

// Architectural records complement the real coupled-ring mechanisms. Their
// motifs never encode another combination or change saved puzzle state.
export function meridianDoorPlan(stage, side) {
  const pockets = [],
    stones = [],
    pins = [],
    stone = (points, raised = false) => stones.push({ points, raised });
  let name;
  switch (stage) {
    case 0:
      name = "Meridian portal";
      for (const x of [-1.65, 0, 1.65]) {
        const h = x === 0 ? 5 : 4;
        pockets.push([
          [x - 0.57, 1.25],
          [x + 0.57, 1.25],
          [x + 0.57, 1.25 + h - 0.65],
          [x, 1.25 + h],
          [x - 0.57, 1.25 + h - 0.65],
        ]);
        stone(panel(x, 2.05, 0.24, h - 1.5));
      }
      break;
    case 1:
      name = "Earth-axis registers";
      pockets.push(panel(-1.35, 1.2, 1.7, 5), panel(1.35, 1.2, 1.7, 5));
      stone(panel(0, 1.1, 0.28, 5.25), true);
      for (const y of [2.05, 3.7, 5.35]) {
        stone(panel(-1.35, y, 1.28, 0.17));
        stone(panel(1.35, y, 1.28, 0.17));
        pins.push([0, y, 0.2]);
      }
      break;
    case 2: {
      name = "Lunar crescent";
      pockets.push(oval(0, 3.7, 2.35, 2.7));
      const crescent = [];
      for (let i = 0; i <= 32; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 32;
        crescent.push([-side * Math.cos(a) * 1.8, 3.7 + Math.sin(a) * 2.12]);
      }
      for (let i = 31; i > 0; i--) {
        const a = -Math.PI / 2 + (i * Math.PI) / 32;
        crescent.push([-side * Math.cos(a) * 0.55, 3.7 + Math.sin(a) * 2.12]);
      }
      stone(crescent);
      for (const y of [2.4, 3.7, 5]) pins.push([side * 1.14, y, 0.13]);
      break;
    }
    case 3:
      name = "Sevenfold archive";
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 0.71,
          h = 4.55 - Math.abs(i - 3) * 0.42;
        pockets.push(panel(x, 1.35, 0.4, h));
        pins.push([x, 6.12, 0.1]);
      }
      stone(panel(0, 0.93, 4.7, 0.16), true);
      break;
    case 4:
      name = "Solar fan";
      for (let i = 0; i < 9; i++) {
        const a = ((12 + i * 18) * Math.PI) / 180,
          b = a + (11 * Math.PI) / 180;
        pockets.push([
          [Math.cos(a) * 0.83, 2.45 + Math.sin(a) * 0.83 * 1.5],
          [Math.cos(a) * 2.45, 2.45 + Math.sin(a) * 3.7],
          [Math.cos(b) * 2.45, 2.45 + Math.sin(b) * 3.7],
          [Math.cos(b) * 0.83, 2.45 + Math.sin(b) * 0.83 * 1.5],
        ]);
      }
      stone(oval(0, 2.4, 0.67), true);
      stone(panel(0, 1.13, 4.6, 0.18), true);
      break;
    case 5:
      name = "Western horizon";
      for (let i = 0; i < 5; i++) {
        const y = 1.35 + i * 0.96,
          slope = side * 0.3;
        pockets.push([
          [-2.38, y + slope],
          [0, y + 0.28],
          [2.38, y - slope],
          [2.38, y + 0.34 - slope],
          [0, y + 0.62],
          [-2.38, y + 0.34 + slope],
        ]);
      }
      stone(oval(-side * 1.6, 6.28, 0.3), true);
      break;
    case 6:
      name = "Astral chart";
      pockets.push(star(0, 3.7, 2.5));
      stone(star(0, 3.7, 1.48));
      for (const x of [-1.95, 1.95])
        for (const y of [1.35, 6.05]) pins.push([x, y, 0.14]);
      break;
    case 7:
      name = "Celestial circuit";
      pockets.push([
        [-2.35, 1.15],
        [2.35, 1.15],
        [2.35, 6.25],
        [1.79, 6.25],
        [1.79, 1.71],
        [-1.79, 1.71],
        [-1.79, 5.63],
        [0.73, 5.63],
        [0.73, 2.84],
        [0.17, 2.84],
        [0.17, 5.07],
        [-1.23, 5.07],
        [-1.23, 2.27],
        [1.23, 2.27],
        [1.23, 6.19],
        [-2.35, 6.19],
      ]);
      for (const [x, y] of [
        [-2.07, 1.43],
        [2.07, 3.7],
        [-1.51, 5.35],
        [0.45, 3.7],
      ])
        pins.push([x, y, 0.13]);
      break;
    case 8:
      name = "Hollow-earth strata";
      for (const r of [2.42, 1.67, 0.92])
        pockets.push(arch(r, 0.4, 2.25, 1.52));
      stone(panel(0, 1.25, 4.75, 0.22), true);
      for (const x of [-1.7, 0, 1.7]) pins.push([x, 1.36, 0.12]);
      break;
    case 9:
      name = "Atlas meridian";
      pockets.push(oval(0, 4.35, 2.35, 1.8));
      stone(star(0, 4.35, 1.55, 4));
      for (const x of [-1.48, 0, 1.48])
        pockets.push(panel(x, 1.1, 0.4, x === 0 ? 1.1 : 0.7));
      break;
    default:
      throw new RangeError("Unknown Meridian door");
  }
  return { name, stage, pockets, stones, pins };
}
