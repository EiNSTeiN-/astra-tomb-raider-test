import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { crownPrism } from "./desert-crowns.js";
import { insetStonePolygon } from "./sky-masonry.js";
import { projectStoneUVs } from "./stone-uv.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

const rect = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h],
  [x - w / 2, y + h],
];
const circle = (x, y, r, n = 24) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  });

export const SOLAR_SANCTUARIES = [
  {
    name: "The balance hall",
    roof: "paired beams",
    niches: [3, 2],
    head: "tapered",
  },
  {
    name: "The dawn colonnade",
    roof: "sun screen",
    niches: [3, 3],
    head: "tapered",
  },
  { name: "The aqueduct vault", roof: "arcade", niches: [2, 2], head: "round" },
  {
    name: "The noon cleft",
    roof: "split gable",
    niches: [1, 2],
    head: "pointed",
  },
  {
    name: "The ephemeris hall",
    roof: "ascending ribs",
    niches: [5, 3],
    head: "stepped",
  },
  {
    name: "The eastern shadow",
    roof: "western canopy",
    niches: [2, 3],
    head: "pointed",
  },
  {
    name: "The open light well",
    roof: "square well",
    niches: [3, 2],
    head: "round",
  },
  {
    name: "The relay gallery",
    roof: "crossed grid",
    niches: [4, 3],
    head: "rectangular",
  },
  {
    name: "The cool sepulchre",
    roof: "corbelled slit",
    niches: [1, 2],
    head: "stepped",
  },
];

function nicheContour({ x, radius: r, bottom: b, top: t, head }) {
  if (head === "tapered")
    return [
      [x - r, b],
      [x + r, b],
      [x + r * 0.76, t],
      [x - r * 0.76, t],
    ];
  if (head === "pointed")
    return [
      [x - r, b],
      [x + r, b],
      [x + r, t - 1.4],
      [x, t],
      [x - r, t - 1.4],
    ];
  if (head === "round")
    return [
      [x - r, b],
      [x + r, b],
      ...Array.from({ length: 17 }, (_, i) => {
        const a = (i * Math.PI) / 16;
        return [x + Math.cos(a) * r, t - r + Math.sin(a) * r];
      }),
    ];
  if (head === "stepped") {
    const half = [
      [r, b],
      [r, t - 1.3],
      [r * 0.72, t - 1.3],
      [r * 0.72, t - 0.8],
      [r * 0.4, t - 0.8],
      [r * 0.4, t - 0.35],
      [0, t - 0.35],
    ];
    return [
      ...half,
      ...half
        .slice(0, -1)
        .toReversed()
        .map(([a, y]) => [-a, y]),
    ].map(([a, y]) => [x + a, y]);
  }
  return rect(x, b, r * 2, t - b);
}

export function solarInteriorPlan(stage, length, side) {
  const style = SOLAR_SANCTUARIES[stage],
    count = style.niches[side === 0 ? 0 : 1],
    step = length / count;
  const niches = Array.from({ length: count }, (_, i) => {
    const top =
      stage === 4
        ? [4.2, 5.0, 6.05, 5.0, 4.2][side === 0 ? i : i + 1]
        : stage === 3
          ? 6.05
          : stage === 8
            ? 5.9
            : 5.7;
    const niche = {
      x: (i + 0.5) * step - length / 2,
      radius: Math.min(step * 0.33, side === 0 && count === 1 ? 4.6 : 2.15),
      bottom: 1.18,
      top,
      head: style.head,
    };
    niche.contour = nicheContour(niche);
    return niche;
  });
  return { name: style.name, length, side, niches };
}

function recordFor(gate) {
  if (gate.solarSanctuary) return gate.solarSanctuary;
  const root = new THREE.Group();
  root.name = SOLAR_SANCTUARIES[gate.stage].name;
  gate.root.add(root);
  return (gate.solarSanctuary = {
    root,
    style: SOLAR_SANCTUARIES[gate.stage],
    parts: [],
    meshes: [],
    walls: [],
    feature: { id: `solar-sanctuary-${gate.stage}` },
  });
}

// Convex partitions use the same contour triangulation as the visible prism.
// Hollow walls and roof apertures retain real empty camera space after batching.
function prismPlanes(poly, depth, z) {
  if (THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(...p))) < 0)
    poly = poly.toReversed();
  return [
    ...poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        n = Math.hypot(dx, dy);
      return [dy / n, -dx / n, 0, (a[0] * dy - a[1] * dx) / n];
    }),
    [0, 0, 1, z + depth / 2],
    [0, 0, -1, -z + depth / 2],
  ];
}

// Dressed convex stones keep their complete outer footprint, with a small
// chamfer catching the light. Camera planes come from those actual faces.
function dressedPrism(points, depth) {
  let poly = points.map((p) => [...p]);
  if (THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(...p))) < 0)
    poly.reverse();
  const bevel = Math.min(0.018, depth * 0.12);
  const geometry = crownPrism(insetStonePolygon(poly, bevel), depth, [], bevel);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    for (const axis of ["X", "Y", "Z"])
      if (Math.abs(p[`get${axis}`](i)) < 1e-7) p[`set${axis}`](i, 0);
  return geometry;
}

function convexPlanes(geometry) {
  const p = geometry.attributes.position,
    planes = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, i + j),
      ),
      normal = new THREE.Triangle(...v).getNormal(new THREE.Vector3());
    if (normal.lengthSq() < 0.5) continue;
    const plane = [...normal.toArray(), normal.dot(v[0]) + 0.000001],
      key = plane.map((n) => Math.round(n * 1e5)).join(",");
    planes.set(key, plane);
  }
  return [...planes.values()];
}

function builder(game, gate, m) {
  const r = recordFor(gate),
    identity = new THREE.Matrix4();
  const add = (
    geometry,
    material,
    kind,
    frame = identity,
    capture = true,
    planes = null,
  ) => {
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.deleteAttribute("color");
    projectStoneUVs(geometry);
    const id = r.parts.length;
    geometry.setAttribute(
      "solarSanctuaryPart",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(id),
        1,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    frame.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = mesh.receiveShadow = true;
    r.root.add(mesh);
    r.parts.push({ id, kind });
    r.meshes.push(mesh);
    if (capture)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true, planes });
    return mesh;
  };
  const prism = (
    poly,
    depth,
    material,
    kind,
    z = 0,
    frame = identity,
    holes = [],
  ) => {
    const area = THREE.ShapeUtils.area(
      poly.map((p) => new THREE.Vector2(...p)),
    );
    const convex =
      !holes.length &&
      poly.every((a, i) => {
        const b = poly[(i + 1) % poly.length],
          c = poly[(i + 2) % poly.length];
        const turn =
          (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        return turn * area >= -1e-8;
      });
    if (convex) {
      const geometry = dressedPrism(poly, depth);
      geometry.translate(0, 0, z);
      return add(geometry, material, kind, frame, true, convexPlanes(geometry));
    }
    const contour = poly.map((p) => new THREE.Vector2(...p)),
      rings = holes.map((h) => h.map((p) => new THREE.Vector2(...p))),
      faces = THREE.ShapeUtils.triangulateShape(contour, rings),
      points = [...contour, ...rings.flat()];
    // Closed triangular prisms seal the cap bridges where niche bottoms align.
    const cells = faces.map((f) => {
      const cell = crownPrism(
        f.map((i) => points[i].toArray()),
        depth,
        [],
        0,
      );
      cell.translate(0, 0, z);
      return cell;
    });
    const geometry = mergeGeometries(cells, false);
    for (const cell of cells) cell.dispose();
    const mesh = add(geometry, material, kind, frame, false);
    if (game.cameraSurfaces) {
      for (const f of faces) {
        const p = f.map((i) => points[i].toArray()),
          xs = p.map((v) => v[0]),
          ys = p.map((v) => v[1]),
          lowX = Math.min(...xs),
          highX = Math.max(...xs),
          lowY = Math.min(...ys),
          highY = Math.max(...ys);
        const g = new THREE.BoxGeometry(
          highX - lowX + 0.00001,
          highY - lowY + 0.00001,
          depth + 0.00001,
        );
        g.translate((lowX + highX) / 2, (lowY + highY) / 2, z);
        const proxy = new THREE.Mesh(g, material);
        frame.decompose(proxy.position, proxy.quaternion, proxy.scale);
        r.root.add(proxy);
        game.cameraSurfaces.capture(proxy, {
          small: true,
          thin: true,
          // Include float32 render vertices at shared faces and polar seams.
          planes: prismPlanes(p, depth, z).map(([x, y, z, d]) => [
            x,
            y,
            z,
            d + 0.000001,
          ]),
        });
        r.root.remove(proxy);
        g.dispose();
      }
    }
    return mesh;
  };
  const box = (
    w,
    h,
    d,
    x,
    y,
    z,
    material = m.trim,
    kind = "dressed stone",
    frame = identity,
  ) => {
    let g;
    if (material === m.metal) {
      const source = new THREE.BoxGeometry(w, h, d);
      g = source.toNonIndexed();
      source.dispose();
    } else g = dressedPrism(rect(0, -h / 2, w, h), d);
    g.translate(x, y, z);
    return add(g, material, kind, frame, true, convexPlanes(g));
  };
  return { r, add, prism, box };
}

// Recesses are cut through the entire inner skin, with a continuous sealed back.
// The 0.585 m maximum projection retains the existing chamber's walking margin.
export function buildSolarInnerWall(game, gate, m, { length, side, frame }) {
  const { r, prism, box } = builder(game, gate, m),
    plan = solarInteriorPlan(gate.stage, length, side),
    holes = plan.niches.map((n) => n.contour);
  prism(
    rect(0, 0, length, 7),
    0.12,
    m.wall,
    "sealed inner backing",
    -0.19,
    frame,
  );
  prism(
    rect(0, 0, length, 7),
    0.29,
    m.wall,
    "recessed inner masonry",
    -0.395,
    frame,
    holes,
  );
  for (const n of plan.niches) {
    const center = (n.bottom + n.top) / 2,
      outer = n.contour.map(([x, y]) => [
        n.x + (x - n.x) * 1.085,
        center + (y - center) * 1.035,
      ]);
    prism(outer, 0.12, m.trim, "niche surround", -0.525, frame, [n.contour]);
    prism(n.contour, 0.015, m.chamberInset, "recess back", -0.2525, frame);
    box(
      n.radius * 1.74,
      0.13,
      0.16,
      n.x,
      n.bottom - 0.065,
      -0.5,
      m.trim,
      "niche sill",
      frame,
    );
    // Joined bronze records echo each objective without adding false controls.
    for (let k = 0; k < 3 + (gate.stage % 3); k++) {
      const px = n.x + (k - (2 + (gate.stage % 3)) / 2) * n.radius * 0.34;
      box(
        0.055,
        0.32 + (k % 2) * 0.16,
        0.02,
        px,
        2.12,
        -0.265,
        m.metal,
        "inset witness mark",
        frame,
      );
    }
    const top = n.top + 0.2;
    box(
      n.radius * 1.96,
      0.14,
      0.15,
      n.x,
      top,
      -0.505,
      m.trim,
      "niche lintel",
      frame,
    );
  }
  for (const [y, h] of [
    [0.35, 0.18],
    [6.48, 0.18],
    [6.85, 0.12],
  ])
    box(length, h, 0.15, 0, y, -0.495, m.trim, "inner string course", frame);
  const step = length / plan.niches.length;
  for (let i = 0; i <= plan.niches.length; i++) {
    const x = Math.max(
      -length / 2 + 0.17,
      Math.min(length / 2 - 0.17, -length / 2 + i * step),
    );
    box(0.3, 6.42, 0.15, x, 3.31, -0.505, m.trim, "bonded pilaster", frame);
    for (const y of [0.7, 1.02, 5.95, 6.22])
      box(0.4, 0.12, 0.16, x, y, -0.505, m.trim, "pilaster capital", frame);
  }
  r.walls.push({ ...plan, frame: frame.toArray() });
  return plan;
}

export function finishSolarSanctuary(game, gate, m) {
  const { r, prism, box } = builder(game, gate, m),
    stage = gate.stage;
  const beam = (z, y = 7.25, d = 0.72) => {
    if (y > 7.25)
      for (const side of [-1, 1])
        box(
          0.92,
          y - 7.25,
          0.9,
          side * 6.5,
          (y + 7.25) / 2,
          z,
          m.trim,
          "roof bearing",
        );
    return box(13.9, 0.42, d, 0, y + 0.21, z, m.trim, "transverse roof beam");
  };
  const arch = (z, rise = 2.4) => {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 16,
        b = ((i + 1) * Math.PI) / 16;
      prism(
        [
          [Math.cos(a) * 6.1, 7.25 + Math.sin(a) * rise],
          [Math.cos(a) * 6.8, 7.25 + Math.sin(a) * (rise + 0.55)],
          [Math.cos(b) * 6.8, 7.25 + Math.sin(b) * (rise + 0.55)],
          [Math.cos(b) * 6.1, 7.25 + Math.sin(b) * rise],
        ],
        0.62,
        m.trim,
        "vault voussoir",
        z,
      );
    }
    // Bond both dressed half-arches at the apex with one continuous key.
    box(0.9, 0.65, 0.76, 0, 7.25 + rise + 0.275, z, m.trim, "vault keystone");
  };
  switch (stage) {
    case 0:
      beam(-3.4);
      beam(2.4);
      break;
    case 1:
      beam(-5.9);
      beam(-1.9);
      for (const x of [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8])
        box(0.72, 0.24, 4.5, x, 7.79, -3.9, m.trim, "dawn screen rib");
      break;
    case 2:
      for (const z of [-4.8, 0, 4.8]) arch(z);
      break;
    case 3:
      for (const side of [-1, 1]) {
        box(
          1.0,
          0.37,
          12.1,
          side * 6.5,
          7.435,
          -0.15,
          m.trim,
          "gable kneewall",
        );
        prism(
          [
            [side * 6.9, 7.25],
            [side * 2.2, 9.05],
            [side * 2.2, 9.48],
            [side * 6.9, 7.68],
          ],
          12.1,
          m.trim,
          "split gable roof",
          -0.15,
        );
      }
      break;
    case 4:
      for (const [i, z] of [-4.8, -0.4, 4.0].entries())
        beam(z, 7.25 + i * 0.48, 0.85);
      break;
    case 5:
      for (let i = 0; i < 3; i++)
        box(
          1.3,
          0.34,
          12.0,
          -6.4 + i * 0.95,
          7.42 + i * 0.31,
          -0.2,
          m.trim,
          "western canopy corbel",
        );
      beam(-5.8);
      beam(5.45);
      break;
    case 6:
      for (const z of [-5.7, 5.3]) beam(z);
      for (const side of [-1, 1])
        box(
          1.3,
          0.42,
          11.8,
          side * 6.25,
          7.46,
          -0.2,
          m.trim,
          "light-well side bearing",
        );
      break;
    case 7:
      for (const z of [-4.8, -0.6, 3.6]) beam(z);
      for (const x of [-3.2, 3.2])
        box(0.8, 0.3, 12.1, x, 7.82, -0.2, m.trim, "relay roof rail");
      break;
    case 8:
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          box(
            1.2 + i * 0.94,
            0.4,
            12.1,
            side * (6.35 - i * 0.47),
            7.45 + i * 0.37,
            -0.2,
            m.trim,
            "sepulchre corbel course",
          );
      break;
  }
  // One continuous girder seats on both existing jamb caps at 8.50 m.
  box(14.0, 0.5, 1.65, 0, 8.75, 6.5, m.trim, "entrance bearing");
  const field = (points, holes = []) =>
    prism(points, 1.05, m.wall, "entrance crown", 6.5, undefined, holes);
  switch (stage) {
    case 0:
      for (const side of [-1, 1])
        field([
          [side * 7, 9],
          [side * 4.1, 9],
          [side * 4.45, 11.4],
          [side * 6.55, 11.4],
        ]);
      field(rect(0, 9, 8.4, 0.6));
      break;
    case 1:
      field(rect(0, 9, 13.6, 1.15));
      break;
    case 2:
      field(
        rect(0, 9, 13.6, 2.1),
        [-4.5, 0, 4.5].map((x) =>
          nicheContour({
            x,
            radius: 1.35,
            bottom: 9.28,
            top: 10.83,
            head: "round",
          }),
        ),
      );
      break;
    case 3:
      field([
        [-6.8, 9],
        [6.8, 9],
        [0, 11.8],
      ]);
      break;
    case 4:
      for (let i = 0; i < 5; i++)
        field(rect((i - 2) * 2.65, 9, 1.85, 1.0 + (2 - Math.abs(i - 2)) * 0.8));
      break;
    case 5:
      for (let i = 0; i < 3; i++)
        field([
          [-6.8 + i * 4.5, 9],
          [-2.3 + i * 4.5, 9],
          [-2.3 + i * 4.5, 11.3],
          [-6.8 + i * 4.5, 9.9],
        ]);
      break;
    case 6:
      field(
        rect(0, 9, 13.6, 2.1),
        [-4.2, 0, 4.2].map((x) => circle(x, 10.05, 0.65)),
      );
      break;
    case 7:
      field(
        rect(0, 9, 13.6, 1.9),
        [-4.8, -1.6, 1.6, 4.8].map((x) => rect(x, 9.35, 2.0, 1.0)),
      );
      break;
    case 8:
      field([
        [-6.8, 9],
        [6.8, 9],
        [6.8, 9.55],
        [5, 9.55],
        [5, 10.25],
        [3.6, 10.25],
        [3.6, 10.9],
        [-3.6, 10.9],
        [-3.6, 10.25],
        [-5, 10.25],
        [-5, 9.55],
        [-6.8, 9.55],
      ]);
      break;
  }
  // A fitted bronze record sits against the stone girder, on both faces.
  for (const sign of [-1, 1])
    for (let i = 0; i < 9; i++)
      box(
        0.055,
        0.23,
        0.035,
        (i - 4) * 1.25,
        8.76,
        6.5 + sign * 0.8275,
        m.metal,
        "entrance witness mark",
      );
  const sloping = r.meshes.filter(
    (mesh) =>
      r.parts[mesh.geometry.attributes.solarSanctuaryPart.getX(0)].kind ===
      "split gable roof",
  );
  r.solid = stationAssemblySolid(
    game,
    r.feature,
    r.meshes.filter((mesh) => !sloping.includes(mesh)),
    {
      bodyPadding: 0.65,
      // Uphill roof stone must carry the same disk reserved by body collision.
      // Keep that support until the trailing body clears a roof edge.
      supportRadius: 0.65,
    },
  );
  r.solid.solarSanctuary = true;
  r.solids = [r.solid];
  if (sloping.length) {
    const roof = stationAssemblySolid(game, r.feature, sloping, {
      bodyPadding: 0.65,
      supportRadius: 0,
    });
    // This continuous ramp fits the feet to its real plane. Keep it separate
    // so the exemption cannot ignore a neighboring crown or masonry overhead.
    roof.groundingSlope = true;
    roof.solarSanctuary = true;
    r.solids.push(roof);
  }
  mergeArchitecture(r.root);
  delete r.meshes;
  return r;
}
