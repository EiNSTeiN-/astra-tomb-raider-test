import * as THREE from "three";
import { crownPrism } from "./desert-crowns.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { mergeArchitecture } from "./visuals.js";

const HALF = 6.175;
const arch = (left, right, spring, rise, count = 24) =>
  Array.from({ length: count + 1 }, (_, i) => {
    const a = Math.PI - (i * Math.PI) / count;
    return [
      (left + right) / 2 + (Math.cos(a) * (right - left)) / 2,
      spring + Math.sin(a) * rise,
    ];
  });
const rectangle = (x, y, w, h) => [
  [x - w / 2, y],
  [x + w / 2, y],
  [x + w / 2, y + h],
  [x - w / 2, y + h],
];
const circle = (x, y, r) =>
  Array.from({ length: 32 }, (_, i) => [
    x + Math.cos((i * Math.PI) / 16) * r,
    y + Math.sin((i * Math.PI) / 16) * r,
  ]);

export function solarPortalPlan(stage) {
  let name,
    head,
    windows = [];
  switch (stage) {
    case 0:
      name = "Balance lintel";
      head = [
        [-HALF, 7.4],
        [HALF, 7.4],
      ];
      break;
    case 1:
      name = "Dawn segmental arch";
      head = arch(-HALF, HALF, 6.1, 1.3);
      break;
    case 2:
      name = "Aqueduct arch";
      head = arch(-HALF, HALF, 5, 2.4);
      break;
    case 3:
      name = "Pointed noon portal";
      head = [
        [-HALF, 5.1],
        [0, 7.4],
        [HALF, 5.1],
      ];
      break;
    case 4:
      name = "Twin ephemeris arches";
      head = [
        ...arch(-HALF, 0, 5.8, 1.6, 16),
        ...arch(0, HALF, 5.8, 1.6, 16).slice(1),
      ];
      break;
    case 5:
      name = "Western shadow lintel";
      head = [
        [-HALF, 7.4],
        [-1.8, 7.4],
        [HALF, 5.25],
      ];
      break;
    case 6:
      name = "Light-well pierced shutter";
      head = [
        [-HALF, 7.4],
        [HALF, 7.4],
      ];
      windows = [-3.1, 3.1].map((x) => circle(x, 6.55, 0.52));
      break;
    case 7:
      name = "Relay slotted shutter";
      head = [
        [-HALF, 7.4],
        [HALF, 7.4],
      ];
      windows = [-3.1, 3.1].map((x) => rectangle(x, 6.12, 3.4, 0.9));
      break;
    case 8:
      name = "Corbelled sepulchre";
      head = [
        [-HALF, 4.8],
        [-4.5, 4.8],
        [-4.5, 5.65],
        [-2.7, 5.65],
        [-2.7, 6.5],
        [-1.25, 6.5],
        [-1.25, 7.4],
        [1.25, 7.4],
        [1.25, 6.5],
        [2.7, 6.5],
        [2.7, 5.65],
        [4.5, 5.65],
        [4.5, 4.8],
        [HALF, 4.8],
      ];
      break;
    default:
      throw new RangeError("Unknown solar portal");
  }
  return { stage, name, head, windows };
}

function heightAt(head, x) {
  for (let i = 1; i < head.length; i++) {
    const a = head[i - 1],
      b = head[i];
    if (x <= b[0] + 1e-8 && b[0] - a[0] > 1e-8)
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return head.at(-1)[1];
}
function sliceHead(head, left, right) {
  return [
    [left, heightAt(head, left)],
    ...head.filter(([x]) => x > left + 1e-7 && x < right - 1e-7),
    [right, heightAt(head, right)],
  ];
}
function planes(poly, depth) {
  let p = poly;
  if (THREE.ShapeUtils.area(p.map((v) => new THREE.Vector2(...v))) < 0)
    p = [...p].reverse();
  return [
    ...p.map((a, i) => {
      const b = p[(i + 1) % p.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        n = Math.hypot(dx, dy);
      return [dy / n, -dx / n, 0, (a[0] * dy - a[1] * dx) / n + 1e-6];
    }),
    [0, 0, 1, depth / 2 + 1e-6],
    [0, 0, -1, depth / 2 + 1e-6],
  ];
}
// Separate closed triangular camera prisms preserve curved heads, stepped
// corners and transom openings, including their near-plane clearance.
function captureProfile(
  game,
  parent,
  material,
  polygon,
  depth,
  z = 0,
  holes = [],
) {
  const contour = polygon.map((p) => new THREE.Vector2(...p)),
    rings = holes.map((h) => h.map((p) => new THREE.Vector2(...p))),
    points = [...contour, ...rings.flat()];
  const area = THREE.ShapeUtils.area(contour),
    convex =
      !holes.length &&
      polygon.every((a, i) => {
        const b = polygon[(i + 1) % polygon.length],
          c = polygon[(i + 2) % polygon.length];
        return (
          ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) *
            area >=
          -1e-8
        );
      }),
    cells = convex
      ? [polygon.map((_, i) => i)]
      : THREE.ShapeUtils.triangulateShape(contour, rings);
  for (const face of cells) {
    const p = face.map((i) => points[i].toArray()),
      geometry = crownPrism(p, depth, [], 0),
      proxy = new THREE.Mesh(geometry, material);
    proxy.position.z = z;
    parent.add(proxy);
    game.cameraSurfaces?.capture(proxy, {
      small: true,
      thin: true,
      planes: planes(p, depth),
    });
    parent.remove(proxy);
    geometry.dispose();
  }
}

export function buildSolarPortalFrame(game, gate, m) {
  const plan = solarPortalPlan(gate.stage),
    root = new THREE.Group();
  root.name = plan.name + " masonry";
  root.position.z = 6.5;
  gate.root.add(root);
  const surround = [
      ...plan.head.map(([x, y]) => [x, y + 0.045]),
      [HALF, 7.8],
      [-HALF, 7.8],
    ],
    mesh = new THREE.Mesh(crownPrism(surround, 1.1, [], 0), m.wall);
  mesh.name = "Fitted portal spandrel";
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
  captureProfile(game, root, m.wall, surround, 1.1);
  const feature = { id: `solar-portal-${gate.stage}` };
  const meshes = [mesh];
  // Individually seated facing stones follow the actual lower edge.
  for (let i = 1; i < plan.head.length; i++) {
    const a = plan.head[i - 1],
      b = plan.head[i];
    if (b[0] - a[0] < 1e-7) continue;
    const segments = Math.max(1, Math.ceil((b[0] - a[0]) / 1.15));
    for (let j = 0; j < segments; j++) {
      const t = j / segments,
        u = (j + 1) / segments,
        x = a[0] + (b[0] - a[0]) * t + 0.012,
        xx = a[0] + (b[0] - a[0]) * u - 0.012,
        y = a[1] + (b[1] - a[1]) * t + 0.055,
        yy = a[1] + (b[1] - a[1]) * u + 0.055,
        poly = [
          [x, y],
          [xx, yy],
          [xx, Math.min(7.8, yy + 0.28)],
          [x, Math.min(7.8, y + 0.28)],
        ],
        face = new THREE.Mesh(crownPrism(poly, 1.28, [], 0), m.trim);
      face.name = "Portal facing stone";
      face.castShadow = face.receiveShadow = true;
      root.add(face);
      captureProfile(game, root, m.trim, poly, 1.28);
      meshes.push(face);
    }
  }
  stationAssemblySolid(game, feature, meshes, {
    bodyPadding: 0.4,
    support: false,
  });
  mergeArchitecture(root);
  gate.solarPortal = { plan, root, feature, profile: surround };
  return gate.solarPortal;
}

export function buildSolarPortalLeaf(game, { gate, leaf, side, materials: m }) {
  if (!m.portalPanel) {
    m.portalPanel = patinatedBronze();
    m.portalPanel.name = "Weathered bronze shutter plates";
    m.portalPanel.color.setHex(0x9d865a);
    m.portalPanel.roughness = 0.52;
    m.portalPanel.metalness = 0.72;
  }
  const plan = solarPortalPlan(gate.stage),
    left = side < 0 ? -HALF : 0.025,
    right = side < 0 ? -0.025 : HALF,
    head = sliceHead(plan.head, left, right),
    offset = side * gate.leafWidth,
    poly = [[left, 0], [right, 0], ...head.toReversed()].map(([x, y]) => [
      x - offset,
      y,
    ]),
    holes = plan.windows
      .filter((ring) =>
        side < 0 ? ring.every(([x]) => x < 0) : ring.every(([x]) => x > 0),
      )
      .map((ring) => ring.map(([x, y]) => [x - offset, y])),
    mesh = new THREE.Mesh(crownPrism(poly, 0.48, holes, 0), m.metal);
  mesh.name = plan.name + " shutter";
  mesh.castShadow = mesh.receiveShadow = true;
  leaf.add(mesh);
  captureProfile(game, leaf, m.metal, poly, 0.72, 0.12, holes);
  const count = [2, 5, 3, 2, 3, 4, 3, 4, 3][gate.stage];
  for (let i = 0; i < count; i++) {
    const span = (right - left - 0.88) / count,
      lo = left + 0.44 + i * span + 0.08,
      hi = lo + span - 0.16,
      x = (lo + hi) / 2,
      panelHead = sliceHead(plan.head, lo, hi).map(([xx, y]) => [
        xx - offset,
        Math.min(y - 0.35, gate.stage === 6 || gate.stage === 7 ? 5.7 : 8),
      ]),
      top = heightAt(plan.head, x) - 0.35,
      panel = [
        [lo - offset, 0.75],
        [hi - offset, 0.75],
        ...panelHead.toReversed(),
      ],
      plate = new THREE.Mesh(crownPrism(panel, 0.035, [], 0), m.portalPanel);
    plate.position.z = 0.2425;
    plate.name = "Bonded shutter plate";
    plate.castShadow = plate.receiveShadow = true;
    leaf.add(plate);
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.075,
        (gate.stage === 6 || gate.stage === 7 ? 5.7 : top) - 0.43,
        0.09,
      ),
      m.metal,
    );
    rib.position.set(
      x - offset,
      ((gate.stage === 6 || gate.stage === 7 ? 5.7 : top) + 0.27) / 2,
      0.265,
    );
    rib.castShadow = rib.receiveShadow = true;
    leaf.add(rib);
    game.cameraSurfaces?.capture(rib, { small: true, thin: true });
  }
  for (const y of gate.stage === 0 || gate.stage === 7
    ? [1.25, 2.8, 4.4]
    : [1.25, 4.4]) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(right - left - 0.6, 0.12, 0.1),
      m.metal,
    );
    strap.position.set((left + right) / 2 - offset, y, 0.28);
    strap.name = "Seated bronze bond strap";
    strap.castShadow = strap.receiveShadow = true;
    leaf.add(strap);
    for (let i = 0; i < 6; i++) {
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        m.metal,
      );
      pin.position.set(
        left + 0.5 + (i * (right - left - 1)) / 5 - offset,
        y,
        0.34,
      );
      pin.name = "Strap rivet";
      pin.castShadow = pin.receiveShadow = true;
      leaf.add(pin);
    }
  }
  leaf.userData.solarPortal = { name: plan.name, polygon: poly, holes };
}
