import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { footprintMinimum } from "./masonry-foundations.js";

const BASE = 7.76;
const rectangle = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h],
  [x - w / 2, y + h],
];
const lancet = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h * 0.73],
  [x, y + h],
  [x - w / 2, y + h * 0.73],
];

// The front masonry expresses the tuning discipline at approach distance.
// Coordinates are in the unchanged gate frame; the low edge beds into its
// existing lintel, and the deep shoulders bear on the two side-wall cornices.
export function crystalFacadePlan(stage) {
  const plans = [
    {
      name: "Guide-light loggia",
      top: [
        [-6.45, 9.75],
        [-2.6, 9.75],
        [-2.6, 10.45],
        [2.6, 10.45],
        [2.6, 9.75],
        [6.45, 9.75],
      ],
      windows: [-3.8, 0, 3.8].map((x) => rectangle(x, 8.45, 1.6, 0.88)),
    },
    {
      name: "Descending echo steps",
      top: [
        [-6.45, 9.3],
        [-5.1, 9.3],
        [-5.1, 10.3],
        [-3.7, 10.3],
        [-3.7, 11.3],
        [-2.25, 11.3],
        [-2.25, 12.3],
        [-0.9, 12.3],
        [-0.9, 13.05],
        [0.9, 13.05],
        [0.9, 12.3],
        [2.25, 12.3],
        [2.25, 11.3],
        [3.7, 11.3],
        [3.7, 10.3],
        [5.1, 10.3],
        [5.1, 9.3],
        [6.45, 9.3],
      ],
      windows: [-2.7, 0, 2.7].map((x, i) =>
        lancet(x, 8.7, 0.85, 2.0 - i * 0.38),
      ),
    },
    {
      name: "Mirrored archive towers",
      top: [
        [-6.45, 13.1],
        [-4.65, 13.1],
        [-4.65, 10.15],
        [4.65, 10.15],
        [4.65, 13.1],
        [6.45, 13.1],
      ],
      windows: [
        lancet(-5.55, 10.8, 0.62, 1.55),
        lancet(5.55, 10.8, 0.62, 1.55),
        ...[-2, 2].map((x) => lancet(x, 8.55, 1.1, 1.08)),
      ],
    },
    {
      name: "Ascending register",
      top: [
        [-6.45, 9.2],
        [-4.3, 9.2],
        [-4.3, 10.1],
        [-2.15, 10.1],
        [-2.15, 10.95],
        [0, 10.95],
        [0, 11.8],
        [2.15, 11.8],
        [2.15, 12.65],
        [4.3, 12.65],
        [4.3, 13.45],
        [6.45, 13.45],
      ],
      windows: [-3.15, 0.95, 5.25].map((x, i) =>
        rectangle(x, 8.55 + i * 0.7, 0.95, 0.85 + i * 0.45),
      ),
    },
    {
      name: "Violet fan pediment",
      top: [
        [-6.45, 8.85],
        [-4.7, 10.95],
        [0, 13.5],
        [4.7, 10.95],
        [6.45, 8.85],
      ],
      windows: [35, 62.5, 90, 117.5, 145].map((degrees) => {
        const a = ((degrees - 5) * Math.PI) / 180,
          b = ((degrees + 5) * Math.PI) / 180;
        return [
          [Math.cos(a), 8.65 + Math.sin(a)],
          [Math.cos(a) * 3.7, 8.65 + Math.sin(a) * 3.7],
          [Math.cos(b) * 3.7, 8.65 + Math.sin(b) * 3.7],
          [Math.cos(b), 8.65 + Math.sin(b)],
        ];
      }),
    },
    {
      name: "Broken archive crest",
      top: [
        [-6.45, 10.9],
        [-4.5, 11.8],
        [-2.2, 10.9],
        [-1.7, 9.85],
        [0.2, 9.85],
        [0.5, 10.6],
        [2, 10.6],
        [2.5, 11.8],
        [4, 12.7],
        [6.45, 11.3],
      ],
      windows: [lancet(-4, 8.7, 1.15, 1.6), lancet(3.9, 8.8, 1.15, 2.15)],
    },
    {
      name: "Heart oculus",
      top: Array.from({ length: 17 }, (_, i) => {
        const x = -6.45 + (i * 12.9) / 16;
        return [x, 9.0 + Math.sqrt(Math.max(0, 1 - (x / 6.45) ** 2)) * 4];
      }),
      windows: [
        Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return [Math.cos(a) * 1.25, 11.1 + Math.sin(a) * 1.25];
        }),
      ],
    },
    {
      name: "Prism lantern front",
      top: [
        [-6.45, 10.5],
        [-3.4, 10.5],
        [-2.6, 13.5],
        [-1.8, 14.3],
        [1.8, 14.3],
        [2.6, 13.5],
        [3.4, 10.5],
        [6.45, 10.5],
      ],
      windows: [
        [
          [-1.05, 10.2],
          [0, 9.55],
          [1.05, 10.2],
          [1.05, 12.8],
          [0, 13.45],
          [-1.05, 12.8],
        ],
        ...[-4.8, 4.8].map((x) => rectangle(x, 8.65, 1, 1.05)),
      ],
    },
  ];
  const plan = plans[stage];
  if (!plan) throw new RangeError("Unknown crystal facade");
  return {
    ...plan,
    stage,
    outline: [[-6.45, BASE], [6.45, BASE], ...plan.top.toReversed()],
    base: BASE,
    shoulderBase: 6.88,
    shoulders: [plan.top[0][1], plan.top.at(-1)[1]],
  };
}

function shapeFor(outline, holes = []) {
  const shape = new THREE.Shape(
    outline.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  for (const points of holes)
    shape.holes.push(
      new THREE.Path(points.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  return shape;
}

function extrusion(outline, holes, depth, front) {
  const geometry = new THREE.ExtrudeGeometry(shapeFor(outline, holes), {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, front - depth);
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getY(i) / 2);
  return geometry;
}

function clip(points, axis, value, sign) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      da = (a[axis] - value) * sign,
      db = (b[axis] - value) * sign;
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

// Clip dressed courses against the actual windowed shape, including diagonal
// shoulders. The continuous recessed core closes every mortar joint. Earcut's
// internal triangle boundaries meet without a joint or offset in the dress.
function dressCourses(plan, add, material) {
  const shape = shapeFor(plan.outline, plan.windows).extractPoints(),
    contour = shape.shape,
    holes = shape.holes,
    points = [...contour, ...holes.flat()].map((p) => [p.x, p.y]),
    faces = THREE.ShapeUtils.triangulateShape(contour, holes),
    highest = Math.max(...plan.top.map((p) => p[1]));
  for (let row = 0, y = BASE; y < highest; row++, y += 0.54)
    for (let x = -7.2 - (row % 2) * 0.72; x < 7.2; x += 1.44)
      for (const face of faces) {
        let polygon = face.map((i) => points[i]);
        for (const [axis, edge, sign] of [
          [0, x + 0.009, 1],
          [0, x + 1.431, -1],
          [1, y + 0.009, 1],
          [1, y + 0.531, -1],
        ])
          polygon = clip(polygon, axis, edge, sign);
        const area = Math.abs(
          polygon.reduce((sum, a, i) => {
            const b = polygon[(i + 1) % polygon.length];
            return sum + a[0] * b[1] - a[1] * b[0];
          }, 0),
        );
        if (area < 0.00001) continue;
        add(
          extrusion(polygon, [], 0.12, 7.23),
          material,
          0.95 + ((row * 7 + Math.round(x * 10)) % 5) * 0.014,
          false,
        );
      }
}

// CameraSurfaces uses finite boxes. A box around the complete pierced screen
// would fill every real window. Thin horizontal sections instead follow each
// solid interval; subdividing both axes limits diagonal overreach to 18 cm.
function captureScreen(game, root, plan, depth = 1.14, front = 7.29) {
  if (!game.cameraSurfaces) return;
  const paths = [plan.outline, ...plan.windows],
    edges = [],
    cuts = new Set();
  for (const path of paths)
    for (let i = 0; i < path.length; i++) {
      const a = path[i],
        b = path[(i + 1) % path.length],
        count = Math.max(
          1,
          Math.ceil(
            Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.18,
          ),
        );
      for (let j = 0; j <= count; j++)
        cuts.add(a[1] + ((b[1] - a[1]) * j) / count);
      if (a[1] !== b[1]) edges.push({ a, b });
    }
  const ys = [...cuts].sort((a, b) => a - b),
    xAt = ({ a, b }, y) => a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  let sections = 0;
  for (let i = 1; i < ys.length; i++) {
    const low = ys[i - 1],
      high = ys[i],
      mid = (low + high) / 2;
    if (high - low < 0.00001) continue;
    const crossings = edges
      .filter(
        ({ a, b }) => mid > Math.min(a[1], b[1]) && mid < Math.max(a[1], b[1]),
      )
      .sort((a, b) => xAt(a, mid) - xAt(b, mid));
    for (let j = 1; j < crossings.length; j += 2) {
      const left = crossings[j - 1],
        right = crossings[j],
        min = Math.min(xAt(left, low), xAt(left, high)),
        max = Math.max(xAt(right, low), xAt(right, high));
      if (max - min < 0.00001) continue;
      const geometry = new THREE.BoxGeometry(
          max - min,
          high - low,
          depth,
        ).translate((min + max) / 2, mid, front - depth / 2),
        proxy = new THREE.Mesh(geometry, root.children[0].material);
      root.add(proxy);
      game.cameraSurfaces.capture(proxy, { small: true, thin: true });
      root.remove(proxy);
      geometry.dispose();
      sections++;
    }
  }
  return sections;
}

function buildFootings(game, gate, materials) {
  const root = new THREE.Group(),
    pieces = [...gate.jambMeshes],
    beds = [];
  root.name = "Grounded archive entrance piers";
  gate.root.add(root);
  const add = (w, h, d, x, y, z, material, tone) => {
    const geometry = new THREE.BoxGeometry(w, h, d),
      colors = new Float32Array(geometry.attributes.position.count * 3);
    colors.fill(tone);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    pieces.push(mesh);
  };
  for (const side of [-1, 1]) {
    const x = side * 6.5,
      z = 6.5,
      bottom =
        footprintMinimum(
          (px, pz) =>
            game.groundHeight(
              gate.root.position.x + px,
              gate.root.position.z + pz,
            ) - gate.root.position.y,
          x,
          z,
          1.7,
          1.8,
          game.terrainProfile?.step || 1.75,
        ) - 0.18,
      top = 0.16;
    add(
      1.66,
      top - bottom,
      1.76,
      x,
      (bottom + top) / 2,
      z,
      materials.stone,
      0.94,
    );
    for (let y = bottom, row = 0; y < top; y += 0.42, row++) {
      const end = Math.min(top, y + 0.405);
      add(
        1.7,
        end - y,
        1.8,
        x,
        (end + y) / 2,
        z,
        materials.dress,
        0.94 + (row % 3) * 0.025,
      );
    }
    beds.push({ x, z, bottom, top, width: 1.7, depth: 1.8 });
  }
  const solid = stationAssemblySolid(
    game,
    { id: `crystal-jambs-${gate.stage}` },
    pieces,
    // A body margin beside the pier is not a tread beneath the boots.
    { bodyPadding: 0.6, supportRadius: 0.2 },
  );
  solid.crystalFacade = solid.crystalJamb = true;
  delete gate.jambMeshes;
  mergeArchitecture(root);
  gate.footings = { root, beds, solid };
}

export function buildCrystalFacade(game, gate, materials) {
  const plan = crystalFacadePlan(gate.stage),
    root = new THREE.Group(),
    pieces = [];
  root.name = plan.name;
  gate.root.add(root);
  if (!materials.facade) {
    const stone = materials.wall.clone(),
      dress = materials.trim.clone();
    stone.name = "Recessed archive crown masonry";
    dress.name = "Coursed archive crown limestone";
    stone.color.multiplyScalar(0.87);
    dress.color.multiplyScalar(1.12);
    stone.normalScale.setScalar(0.25);
    dress.normalScale.setScalar(0.25);
    stone.vertexColors = dress.vertexColors = true;
    materials.facade = { stone, dress };
  }
  const { stone, dress } = materials.facade;
  buildFootings(game, gate, materials.facade);
  const add = (geometry, material, tone = 1, capture = true) => {
    if (material.vertexColors) {
      const values = new Float32Array(geometry.attributes.position.count * 3);
      values.fill(tone);
      geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (capture)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    pieces.push(mesh);
    return mesh;
  };
  add(extrusion(plan.outline, plan.windows, 1, 7.15), stone, 1, false);
  dressCourses(plan, add, dress);
  // The left/right returns give the entrance real depth. Their low faces enter
  // the continuous wall below the old cornice joints; no new ground pillar
  // narrows the tuning aisle.
  for (const [i, side] of [-1, 1].entries()) {
    const height = plan.shoulders[i] - plan.shoulderBase;
    add(
      new THREE.BoxGeometry(1.2, height, 3.5).translate(
        side * 6.5,
        plan.shoulderBase + height / 2,
        5.25,
      ),
      stone,
    );
    for (let y = 7.08, row = 0; y < plan.shoulders[i]; y += 0.54, row++) {
      const top = Math.min(y + 0.522, plan.shoulders[i]);
      add(
        new THREE.BoxGeometry(1.28, top - y, 3.52).translate(
          side * 6.5,
          (y + top) / 2,
          5.25,
        ),
        dress,
        0.96 + (row % 3) * 0.025,
      );
    }
  }
  // Closed copings follow every crest and broken edge, with their inner faces
  // embedded in the screen rather than balanced on chipped point contacts.
  let cameraSections = 0;
  for (let i = 1; i < plan.top.length; i++) {
    const a = plan.top[i - 1],
      b = plan.top[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy),
      nx = -dy / length,
      ny = dx / length;
    const outline = [
      [a[0] - nx * 0.045, a[1] - ny * 0.045],
      [b[0] - nx * 0.045, b[1] - ny * 0.045],
      [b[0] + nx * 0.17, b[1] + ny * 0.17],
      [a[0] + nx * 0.17, a[1] + ny * 0.17],
    ];
    add(extrusion(outline, [], 1.18, 7.28), dress, 1.06, false);
    cameraSections += captureScreen(
      game,
      root,
      { outline, windows: [] },
      1.18,
      7.28,
    );
  }
  for (const window of plan.windows) {
    const center = window.reduce(
        (s, p) => [s[0] + p[0] / window.length, s[1] + p[1] / window.length],
        [0, 0],
      ),
      rim = window.map(([x, y]) => {
        const d = Math.hypot(x - center[0], y - center[1]);
        return [
          x + ((x - center[0]) * 0.09) / d,
          y + ((y - center[1]) * 0.09) / d,
        ];
      });
    add(extrusion(rim, [window], 0.2, 7.29), materials.inlay, 1, false);
  }
  cameraSections += captureScreen(game, root, plan);
  const solid = stationAssemblySolid(
    game,
    { id: `crystal-facade-${gate.stage}` },
    pieces,
    { bodyPadding: 0.6, supportRadius: 0.2 },
  );
  solid.crystalFacade = true;
  mergeArchitecture(root);
  gate.facade = { root, plan, solid, cameraSections };
  return gate.facade;
}
