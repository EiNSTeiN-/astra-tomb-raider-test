const oval = (x, y, rx, ry = rx, n = 36) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
  });
const rect = (x, y, w, h) => [
  [x - w / 2, y - h / 2],
  [x + w / 2, y - h / 2],
  [x + w / 2, y + h / 2],
  [x - w / 2, y + h / 2],
];
function ribbon(path, width) {
  const left = [],
    right = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)],
      b = path[Math.min(path.length - 1, i + 1)],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy),
      nx = ((-dy / l) * width) / 2,
      ny = ((dx / l) * width) / 2;
    left.push([path[i][0] + nx, path[i][1] + ny]);
    right.push([path[i][0] - nx, path[i][1] - ny]);
  }
  return [...left, ...right.reverse()];
}
function arc(x, y, rx, ry, a, b, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a + ((b - a) * i) / n;
    return [x + Math.cos(t) * rx, y + Math.sin(t) * ry];
  });
}
const NAMES = [
  "The balanced sun",
  "The returning dawn",
  "Water for the city",
  "The tempered noon",
  "The astronomer’s watch",
  "The lifting of the shadow",
  "The open light well",
  "The passage of light",
  "The sun’s last voyage",
];
// Original cast scenes accompany the court stories. They depict no extra
// combination or sequence, and have no interaction or saved-state role.
export function solarShutterScene(stage, side) {
  if (!NAMES[stage] || ![-1, 1].includes(side))
    throw new RangeError("Unknown solar shutter scene");
  const shapes = [],
    add = (points, tier = 1, holes = []) =>
      shapes.push({ points, tier, holes }),
    line = (path, w = 0.1, tier = 1) => {
      add(ribbon(path, w), tier);
      if (tier < 2) shapes.at(-1).stroke = { path, width: w };
    },
    disc = (x, y, r, tier = 1) => add(oval(x, y, r), tier),
    ring = (x, y, r, w = 0.13, tier = 1) =>
      add(oval(x, y, r), tier, [oval(x, y, r - w)]),
    box = (x, y, w, h, tier = 1) => add(rect(x, y, w, h), tier),
    wave = (y, offset = 0) =>
      line(
        Array.from({ length: 25 }, (_, i) => {
          const x = -1.85 + (i * 3.7) / 24;
          return [x, y + Math.sin(x * 3 + offset) * 0.12];
        }),
        0.09,
        0,
      ),
    rays = (x, y, r, count = 9, start = 0, end = Math.PI * 2) => {
      for (let i = 0; i < count; i++) {
        const a = start + ((end - start) * i) / count;
        line(
          [
            [x + Math.cos(a) * r, y + Math.sin(a) * r],
            [x + Math.cos(a) * (r + 0.32), y + Math.sin(a) * (r + 0.32)],
          ],
          0.075,
          0,
        );
      }
    },
    lotus = (x, y, s = 1) => {
      for (const d of [-1, 0, 1])
        add(
          [
            [x, y],
            [x + (d - 0.52) * s, y + 0.4 * s],
            [x + d * 0.75 * s, y + 1.28 * s],
            [x + (d + 0.52) * s, y + 0.4 * s],
          ],
          1,
        );
      line(
        [
          [x - 1.15 * s, y + 0.12 * s],
          [x, y - 0.2 * s],
          [x + 1.15 * s, y + 0.12 * s],
        ],
        0.13,
      );
      line(
        [
          [x, y - 0.2 * s],
          [x, y - 0.8 * s],
        ],
        0.1,
      );
    },
    bird = (x, y, s = 1, flip = 1) => {
      const p = [
          [-1.75, 0.3],
          [-1.25, 0.8],
          [-0.65, 0.98],
          [-0.12, 0.6],
          [0.18, 0.48],
          [0.6, 1.17],
          [0.9, 1.28],
          [1.1, 1.16],
          [1.46, 1.2],
          [1.18, 0.96],
          [1.02, 0.68],
          [0.83, 0.25],
          [0.4, -0.12],
          [-0.05, -0.28],
          [-0.65, -0.96],
          [-0.82, -0.85],
          [-0.55, -0.24],
          [-1.02, -0.06],
          [-1.55, 0.01],
          [-1.05, 0.24],
        ],
        map = (p) => [x + p[0] * s * flip, y + p[1] * s];
      add(p.map(map), 1, [oval(x + 0.94 * s * flip, y + 1.06 * s, 0.055 * s)]);
      for (let i = 0; i < 5; i++)
        line(
          [
            map([-1.35 + i * 0.23, 0.42 + i * 0.07]),
            map([-0.4 + i * 0.11, 0.32]),
          ],
          0.038 * s,
          2,
        );
      line([map([0.03, 0.18]), map([0.65, 0.34])], 0.055 * s, 2);
    };
  switch (stage) {
    case 0:
      if (side < 0) {
        add([
          [-0.92, -1.65],
          [0.92, -1.65],
          [0.42, -1.28],
          [-0.42, -1.28],
        ]);
        box(0, -0.12, 0.2, 2.52);
        disc(0, 1.4, 0.32);
        line(
          [
            [-1.65, 0.85],
            [1.65, 1.03],
          ],
          0.17,
        );
        for (const [x, y] of [
          [-1.3, 0.87],
          [1.3, 1.02],
        ]) {
          line(
            [
              [x - 0.38, y - 0.06],
              [x - 0.38, -0.3],
            ],
            0.055,
            0,
          );
          line(
            [
              [x + 0.38, y - 0.06],
              [x + 0.38, -0.3],
            ],
            0.055,
            0,
          );
          add([
            [x - 0.6, -0.27],
            [x + 0.6, -0.27],
            [x + 0.47, -0.59],
            [x, -0.76],
            [x - 0.47, -0.59],
          ]);
          box(x, -0.16, 0.24, 0.22, 2);
        }
      } else {
        for (let i = 0; i < 4; i++)
          box(0, -1.6 + i * 0.28, 3.7 - i * 0.55, 0.22);
        ring(0, 0.72, 0.93, 0.17);
        disc(0, 0.72, 0.36);
        rays(0, 0.72, 1.18, 11, 0, Math.PI * 2);
        add(
          [
            [-1.05, -0.34],
            [-0.93, 0.43],
            [-0.52, 0.07],
            [-0.45, 0.72],
            [0, 0.4],
            [0.45, 0.72],
            [0.52, 0.07],
            [0.93, 0.43],
            [1.05, -0.34],
          ],
          2,
        );
      }
      break;
    case 1:
      if (side < 0) {
        wave(-1.55);
        lotus(0, -0.48, 1.03);
        disc(0, 1.21, 0.44);
        rays(0, 1.21, 0.63, 7, 0, Math.PI);
      } else {
        bird(-0.02, -0.2, 1.02);
        ring(-1.1, 1.27, 0.43, 0.12);
        line(
          [
            [-1.9, -1.4],
            [-0.8, -1.4],
            [0.2, -1.16],
            [1.8, -1.16],
          ],
          0.1,
          0,
        );
      }
      break;
    case 2:
      if (side < 0) {
        const holes = [-1.17, 0, 1.17].map((x) => [
          [x - 0.4, -0.85],
          [x + 0.4, -0.85],
          [x + 0.4, -0.12],
          ...arc(x, -0.12, 0.4, 0.55, 0, Math.PI, 14).slice(1),
        ]);
        for (const y of [0.73, 0.96]) holes.push(rect(0, y, 3.4, 0.035));
        for (const x of [-1.15, 0, 1.15])
          holes.push(rect(x, 0.845, 0.035, 0.17));
        add(rect(0, 0.05, 3.8, 2.35), 1, holes);
        box(0, 1.3, 4, 0.18, 2);
        for (const x of [-1.76, -0.58, 0.58, 1.76])
          box(x, -0.12, 0.13, 2.05, 2);
        wave(-1.53);
        wave(-1.85, 0.9);
      } else {
        add(
          [
            [-0.5, 1.7],
            [0.5, 1.7],
            [0.65, 1.42],
            [0.36, 1.08],
            [0.63, 0.73],
            [0.7, 0.18],
            [0.36, -0.25],
            [-0.36, -0.25],
            [-0.7, 0.18],
            [-0.63, 0.73],
            [-0.36, 1.08],
            [-0.65, 1.42],
          ],
          1,
          [rect(0, 0.64, 0.78, 0.04), rect(0, 0.05, 0.9, 0.04)],
        );
        line(
          [
            [0.5, 1.4],
            [1.22, 1.23],
            [1.49, 0.65],
            [1.23, 0.36],
            [0.65, 0.68],
          ],
          0.1,
          2,
        );
        line(
          [
            [0.63, 0.88],
            [1.48, 0.84],
            [1.69, 0.3],
            [1.69, -0.9],
            [1.3, -1.25],
          ],
          0.16,
          0,
        );
        wave(-1.58);
        wave(-1.84, 1);
        box(0, 0.33, 1, 0.11, 2);
      }
      break;
    case 3:
      if (side < 0) {
        add(
          [
            [-1.94, -1.4],
            [-0.93, 0.12],
            [-0.42, -0.34],
            [0.62, 1.22],
            [1.97, -1.4],
          ],
          0,
        );
        line(
          [
            [-0.93, 0.12],
            [-0.55, -0.12],
            [-0.24, -0.12],
            [0.62, 1.22],
          ],
          0.1,
          2,
        );
        disc(-1.2, 1.24, 0.42);
        for (const y of [-0.65, -0.23, 0.2])
          line(
            [
              [-0.78, 1],
              [0.25, y],
            ],
            0.075,
          );
        add(
          [
            [0.32, -0.68],
            [0.92, -0.05],
            [1.5, -0.68],
            [0.92, -1.3],
          ],
          1,
        );
        line(
          [
            [0.91, -0.13],
            [0.91, -1.16],
          ],
          0.06,
          2,
        );
      } else {
        rays(0, 0.15, 1.59, 12);
        ring(0, 0.15, 1.42, 0.16);
        for (let i = 0; i < 5; i++) {
          const y = -0.85 + i * 0.5,
            w = Math.sqrt(1.2 ** 2 - (y - 0.15) ** 2) * 2;
          box(0, y, w, 0.17, 2);
        }
        box(0, -1.65, 3.7, 0.14);
      }
      break;
    case 4:
      if (side < 0) {
        disc(-0.8, 0.64, 0.28);
        add([
          [-1.09, 0.33],
          [-0.55, 0.33],
          [-0.29, -0.65],
          [-1.35, -0.65],
        ]);
        line(
          [
            [-1.04, -0.59],
            [-1.35, -1.6],
          ],
          0.2,
        );
        line(
          [
            [-0.56, -0.59],
            [-0.18, -1.6],
          ],
          0.2,
        );
        line(
          [
            [-0.6, 0.23],
            [0.01, 0.67],
            [0.39, 1.12],
          ],
          0.16,
        );
        line(
          [
            [-0.92, 0.2],
            [-1.37, -0.18],
            [-1.66, 0.4],
          ],
          0.15,
        );
        line(
          [
            [0.4, -1.6],
            [0.45, 1.6],
          ],
          0.09,
          0,
        );
        line(
          [
            [0.45, 1.6],
            [1.55, 1.2],
          ],
          0.08,
        );
        ring(1.48, 1.21, 0.29, 0.09);
        disc(0.42, 1.6, 0.12, 2);
        box(-0.65, -1.76, 2.8, 0.14);
      } else {
        add(oval(0, 0, 1.75, 1.08), 1, [oval(0, 0, 1.6, 0.93)]);
        add(oval(0, 0, 0.92, 1.74), 0, [oval(0, 0, 0.8, 1.6)]);
        disc(0, 0, 0.4, 2);
        for (const [x, y, r] of [
          [-1.56, 0.47, 0.15],
          [0.37, 1.5, 0.18],
          [1.64, -0.31, 0.13],
          [-0.45, -1.3, 0.11],
        ]) {
          disc(x, y, r);
          rays(x, y, r + 0.09, 4, Math.PI / 4, Math.PI * 2);
        }
      }
      break;
    case 5:
      if (side < 0) {
        for (const [x, h] of [
          [-1.23, 2.7],
          [0, 2.1],
          [1.23, 1.5],
        ]) {
          add(
            [
              [x - 0.28, -1.55],
              [x + 0.28, -1.55],
              [x + 0.2, -1.55 + h],
              [x, -1.28 + h],
              [x - 0.2, -1.55 + h],
            ],
            1,
          );
          box(x, -1.62, 0.78, 0.16, 2);
        }
        add(
          [
            ...arc(0.6, 0.72, 0.85, 0.85, 0, Math.PI, 24),
            [-0.25, 0.61],
            [1.45, 0.61],
          ],
          0,
        );
        line(
          [
            [-1.88, -1.8],
            [1.88, -1.8],
          ],
          0.1,
        );
      } else {
        add(
          [
            [-1.7, -0.45],
            [0.27, 0.04],
            [0.92, 1.51],
            [-1.05, 1.03],
          ],
          0,
        );
        line(
          [
            [-1.65, -0.42],
            [0.23, 0.08],
            [0.87, 1.46],
            [-1.02, 1.02],
            [-1.65, -0.42],
          ],
          0.14,
        );
        line(
          [
            [-0.7, -0.15],
            [-0.7, -1.65],
            [0.29, -1.65],
            [0.29, 0.02],
          ],
          0.17,
        );
        ring(1.27, 1.37, 0.35, 0.1);
        line(
          [
            [0.85, 1.37],
            [1.65, 1.37],
            [1.65, -0.52],
          ],
          0.075,
          0,
        );
        box(1.65, -0.8, 0.55, 0.65);
        box(-0.7, -1.8, 1.9, 0.13);
      }
      break;
    case 6:
      if (side < 0) {
        lotus(0, -0.72, 1.3);
        ring(0, 1.21, 0.43, 0.12);
        rays(0, 1.21, 0.62, 7, 0, Math.PI);
        wave(-1.74);
      } else {
        add(
          [
            [-1.45, -0.23],
            [-1.21, -1.42],
            [-0.66, -1.7],
            [0.66, -1.7],
            [1.21, -1.42],
            [1.45, -0.23],
          ],
          1,
        );
        add(oval(0, -0.2, 1.61, 0.3), 2, [oval(0, -0.2, 1.35, 0.15)]);
        bird(-0.79, 0.46, 0.51, 1);
        bird(0.8, 0.43, 0.51, -1);
        line(
          [
            [-0.8, -0.64],
            [0.8, -0.64],
          ],
          0.1,
          2,
        );
        line(
          [
            [-0.6, -1.13],
            [0.6, -1.13],
          ],
          0.1,
          2,
        );
      }
      break;
    case 7:
      if (side < 0) {
        const points = [];
        for (let i = 0; i < 3; i++) {
          const x = -1.3 + i * 1.3,
            h = 0.85 + i * 0.8;
          box(x, -1.65 + h / 2, 0.64, h);
          box(x, -1.65 + h, 0.9, 0.16, 2);
          disc(x, -1.32 + h, 0.22, 2);
          points.push([x, -1.32 + h]);
        }
        line(points, 0.12, 0);
        box(0, -1.83, 3.8, 0.11);
      } else {
        for (const x of [-1.55, 1.55]) {
          box(x, 0, 0.17, 3.4);
          lotus(x, 1.05, 0.24);
        }
        for (let i = 0; i < 3; i++) {
          const y = -1.15 + i * 0.95;
          line(arc(0, y, 1.55, 0.54, 0, Math.PI, 24), 0.115, 1);
          line(arc(0, y + 0.18, 1.55, 0.54, Math.PI, Math.PI * 2, 24), 0.09, 0);
          ring(0, y + 0.1, 0.19, 0.07, 2);
        }
      }
      break;
    case 8:
      if (side < 0) {
        add(
          [
            [-1.95, -0.65],
            [-1.45, -1.37],
            [-0.65, -1.57],
            [0.86, -1.57],
            [1.6, -1.15],
            [1.95, -0.5],
            [1.56, -0.87],
            [0.78, -1.04],
            [-0.8, -1.04],
            [-1.45, -0.91],
          ],
          1,
        );
        box(0, -0.39, 1.26, 1.24, 0);
        box(0, 0.27, 1.62, 0.14, 2);
        ring(0, 1.08, 0.51, 0.13);
        rays(0, 1.08, 0.72, 7, 0, Math.PI);
        for (const x of [-1.1, 1.12]) {
          disc(x, -0.31, 0.13, 2);
          line(
            [
              [x, -0.44],
              [x + 0.15, -0.88],
            ],
            0.1,
          );
        }
        wave(-1.85);
      } else {
        add(oval(0, -0.13, 0.48, 0.89), 1);
        disc(0, 0.86, 0.34);
        line(
          [
            [0, -0.9],
            [0, 0.52],
          ],
          0.065,
          2,
        );
        for (const s of [-1, 1]) {
          add(
            [
              [s * 0.35, 0.36],
              [s * 1.04, 1.1],
              [s * 1.91, 0.9],
              [s * 1.58, 0.16],
              [s * 0.8, -0.42],
              [s * 0.38, -0.56],
            ],
            0,
          );
          for (let i = 0; i < 6; i++) {
            const x = 0.57 + i * 0.18;
            line(
              [
                [s * 0.39, 0.17 - i * 0.055],
                [s * x, 0.77 - i * 0.17],
              ],
              0.11,
              1,
            );
          }
          line(
            [
              [s * 0.36, -0.29],
              [s * 0.89, -0.78],
              [s * 0.92, -1.25],
            ],
            0.09,
            1,
          );
        }
        ring(0, 1.58, 0.31, 0.09);
        box(0, -1.68, 2.2, 0.11);
      }
      break;
  }
  return { name: NAMES[stage], stage, side, shapes };
}
