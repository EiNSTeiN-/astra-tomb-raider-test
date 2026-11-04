import * as THREE from "three";

const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const ellipse = (x, y, rx, ry, angle = 0, ring = 0) => ({
  x,
  y,
  rx,
  ry,
  angle,
  ring,
});
const path = (points, radius = 0.08) => ({ points, radius });
const arc = (x, y, rx, ry, a = 0, b = Math.PI * 2, radius = 0.08) =>
  path(
    Array.from({ length: 41 }, (_, i) => {
      const t = a + ((b - a) * i) / 40;
      return [x + Math.cos(t) * rx, y + Math.sin(t) * ry];
    }),
    radius,
  );

// Pictorial records of the existing trials, not another code to memorize.
// Coordinates are metres on one leaf; its partner mirrors the composition.
export function jungleShutterPlan(stage) {
  const forms = [],
    add = (...f) => forms.push(...f);
  let name;
  switch (stage) {
    case 0:
      name = "Dawn over the sanctuary";
      add(ellipse(0, 3.55, 0.73, 0.73), ellipse(0, 3.55, 1.05, 1.05, 0, 0.07));
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        add(
          ellipse(Math.cos(a) * 1.5, 3.55 + Math.sin(a) * 1.5, 0.42, 0.12, a),
        );
      }
      for (const [y, w] of [
        [0.7, 3.55],
        [1.03, 2.7],
        [1.36, 1.8],
      ])
        add(
          path(
            [
              [-w / 2, y],
              [w / 2, y],
            ],
            0.12,
          ),
        );
      break;
    case 1:
      name = "Roots holding the old gate";
      add(
        path(
          [
            [0, 0.55],
            [-0.2, 1.6],
            [0.15, 2.5],
            [-0.08, 3.45],
            [0.3, 4.9],
          ],
          0.2,
        ),
      );
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = 2.8 + i * 0.6;
          add(
            path(
              [
                [0, y],
                [s * 0.65, y + 0.18],
                [s * 1.45, y + 0.8],
              ],
              0.11,
            ),
          );
          add(ellipse(s * 1.37, y + 0.82, 0.53, 0.2, s * 0.55));
          add(
            path(
              [
                [0, 1.45],
                [s * (0.6 + i * 0.25), 0.9],
                [s * (1 + i * 0.4), 0.5 + i * 0.12],
              ],
              0.11,
            ),
          );
        }
      }
      break;
    case 2:
      name = "Rain feeding the channels";
      add(
        arc(-0.9, 4.3, 0.65, 0.42, 0, Math.PI),
        arc(0.1, 4.3, 0.7, 0.68, 0, Math.PI),
        arc(1.1, 4.3, 0.63, 0.4, 0, Math.PI),
      );
      add(
        path(
          [
            [-1.58, 4.3],
            [1.73, 4.3],
          ],
          0.1,
        ),
      );
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.66;
        add(ellipse(x, 3.3 - (i % 2) * 0.4, 0.105, 0.37, -0.22));
      }
      for (let i = 0; i < 3; i++)
        add(
          path(
            Array.from({ length: 31 }, (_, k) => {
              const x = (k / 30 - 0.5) * 3.65;
              return [x, 0.8 + i * 0.46 + Math.cos(x * 3) * 0.13];
            }),
            0.09,
          ),
        );
      break;
    case 3:
      name = "The keeper's lunar dial";
      add(
        ellipse(0, 3.1, 1.65, 1.65, 0, 0.075),
        ellipse(0, 3.1, 1.32, 1.32, 0, 0.055),
      );
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        add(
          path(
            [
              [Math.cos(a) * 1.4, 3.1 + Math.sin(a) * 1.4],
              [Math.cos(a) * 1.57, 3.1 + Math.sin(a) * 1.57],
            ],
            0.055,
          ),
        );
      }
      add(arc(0.15, 3.3, 0.73, 0.84, Math.PI * 0.38, Math.PI * 1.62, 0.19));
      add(
        path(
          [
            [0, 0.58],
            [0, 1.1],
            [0.48, 1.4],
          ],
          0.09,
        ),
        ellipse(0, 0.65, 0.3, 0.3),
      );
      break;
    case 4:
      name = "Offering at the eastern altar";
      for (const [y, w] of [
        [0.65, 3.6],
        [0.98, 2.85],
        [1.31, 1.85],
      ])
        add(
          path(
            [
              [-w / 2, y],
              [w / 2, y],
            ],
            0.12,
          ),
        );
      add(
        arc(0, 3.35, 1.45, 1.22, Math.PI, Math.PI * 2, 0.16),
        path(
          [
            [-1.5, 3.35],
            [1.5, 3.35],
          ],
          0.12,
        ),
        path(
          [
            [0, 1.5],
            [0, 2.05],
          ],
          0.18,
        ),
      );
      for (let i = -2; i <= 2; i++)
        add(
          ellipse(
            i * 0.39,
            3.68 + (2 - Math.abs(i)) * 0.17,
            0.21,
            0.66,
            -i * 0.29,
          ),
        );
      add(ellipse(0, 4.92, 0.24, 0.24));
      break;
    case 5:
      name = "The sun bridge over water";
      add(
        arc(0, 1.57, 1.72, 1.38, 0, Math.PI, 0.2),
        path(
          [
            [-1.85, 3.22],
            [1.85, 3.22],
          ],
          0.13,
        ),
      );
      for (const x of [-1.6, -0.8, 0, 0.8, 1.6])
        add(
          path(
            [
              [x, 3.22],
              [x, 3.66],
            ],
            0.07,
          ),
        );
      add(
        ellipse(0, 4.48, 0.44, 0.44),
        arc(0, 4.48, 0.7, 0.7, 0.05, Math.PI - 0.05, 0.065),
      );
      for (const y of [0.64, 1.07])
        add(
          path(
            [
              [-1.8, y],
              [-0.9, y + 0.1],
              [0, y],
              [0.9, y - 0.1],
              [1.8, y],
            ],
            0.075,
          ),
        );
      break;
    case 6:
      name = "Light in the inner sanctum";
      add(
        path(
          [
            [-1.52, 0.63],
            [1.52, 0.63],
          ],
          0.13,
        ),
        path(
          [
            [-1.1, 0.95],
            [1.1, 0.95],
          ],
          0.13,
        ),
      );
      for (const x of [-0.8, 0.8])
        add(
          path(
            [
              [x, 1.2],
              [x, 2.98],
            ],
            0.14,
          ),
        );
      for (const [y, w] of [
        [3.0, 2.4],
        [3.34, 1.8],
        [3.66, 1.15],
      ])
        add(
          path(
            [
              [-w / 2, y],
              [0, y + 0.18],
              [w / 2, y],
            ],
            0.12,
          ),
        );
      add(ellipse(0, 2.22, 0.24, 0.58), ellipse(0, 4.42, 0.26, 0.26));
      for (let i = 0; i < 7; i++) {
        const a = ((i + 0.5) * Math.PI) / 7;
        add(
          path(
            [
              [Math.cos(a) * 0.57, 4.42 + Math.sin(a) * 0.57],
              [Math.cos(a) * 1.4, 4.42 + Math.sin(a) * 0.83],
            ],
            0.065,
          ),
        );
      }
      break;
    case 7:
      name = "Heart of the living temple";
      add(
        ellipse(0, 2.95, 1.68, 2.0, 0, 0.09),
        path(
          [
            [0, 0.58],
            [0, 2.16],
          ],
          0.17,
        ),
      );
      for (const s of [-1, 1]) {
        add(
          path(
            [
              [0, 1.27],
              [s * 0.75, 0.85],
              [s * 1.45, 0.6],
            ],
            0.11,
          ),
        );
        for (let i = 0; i < 3; i++)
          add(
            ellipse(
              s * (0.7 + i * 0.23),
              2.0 + i * 0.74,
              0.59,
              0.22,
              s * (0.4 + i * 0.38),
            ),
          );
      }
      add(
        ellipse(0, 3.16, 0.35, 0.85),
        ellipse(-0.35, 3.05, 0.27, 0.63, 0.6),
        ellipse(0.35, 3.05, 0.27, 0.63, -0.6),
      );
      break;
    default:
      throw new RangeError("Unknown jungle shutter");
  }
  return { stage, name, forms };
}

function distance(form, x, y) {
  if (form.points) {
    let d = Infinity;
    for (let i = 1; i < form.points.length; i++) {
      const [ax, ay] = form.points[i - 1],
        [bx, by] = form.points[i],
        dx = bx - ax,
        dy = by - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return d - form.radius;
  }
  const c = Math.cos(form.angle),
    s = Math.sin(form.angle),
    xx = x - form.x,
    yy = y - form.y;
  const d =
    (Math.hypot((xx * c + yy * s) / form.rx, (-xx * s + yy * c) / form.ry) -
      1) *
    Math.min(form.rx, form.ry);
  return form.ring ? Math.abs(d) - form.ring : d;
}

// A closed relief slab with a smooth carved face and hard edge returns. The
// rear is embedded 80 mm into the existing leaf, rather than hovering in front.
export function jungleShutterGeometry(stage, side, segments = [64, 80]) {
  const plan = jungleShutterPlan(stage),
    [nx, ny] = segments,
    w = 4.75,
    h = 5.6;
  const positions = [],
    uv = [],
    indices = [],
    vertex = (x, y, z) => {
      const i = positions.length / 3;
      positions.push(x, y, z);
      uv.push(x / 2, y / 2);
      return i;
    };
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * w,
        y = (j / ny) * h;
      let d = Infinity;
      for (const form of plan.forms)
        d = Math.min(d, distance(form, x * side, y));
      const edge = Math.min(w / 2 - Math.abs(x), y, h - y),
        rim = Math.exp(-(((edge - 0.13) / 0.065) ** 2));
      const carving = smooth(0.5 - d / 0.13) * smooth((edge - 0.25) / 0.2);
      const weather =
        Math.sin(x * 17 + Math.sin(y * 5)) * Math.sin(y * 21 - x * 3) * 0.003;
      vertex(x, y, 0.27 + 0.2 * carving + 0.09 * rim + weather);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1;
      indices.push(a, b, c, b, c + 1, c);
    }
  const outline = [];
  for (let i = 0; i < nx; i++) outline.push(i);
  for (let j = 0; j < ny; j++) outline.push(j * (nx + 1) + nx);
  for (let i = nx; i > 0; i--) outline.push(ny * (nx + 1) + i);
  for (let j = ny; j > 0; j--) outline.push(j * (nx + 1));
  const center = vertex(0, h / 2, 0.16),
    back = outline.map((a) =>
      vertex(positions[a * 3], positions[a * 3 + 1], 0.16),
    );
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length,
      a = outline[i],
      b = outline[next];
    indices.push(center, back[next], back[i]);
    const fa = vertex(...positions.slice(a * 3, a * 3 + 3)),
      ba = vertex(positions[a * 3], positions[a * 3 + 1], 0.16);
    const bb = vertex(positions[b * 3], positions[b * 3 + 1], 0.16),
      fb = vertex(...positions.slice(b * 3, b * 3 + 3));
    indices.push(fa, ba, bb, fa, bb, fb);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData = {
    stage,
    name: plan.name,
    side,
    width: w,
    height: h,
    rear: 0.16,
  };
  return geometry;
}
