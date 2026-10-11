import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

export const DESERT_CROWN_STYLES = [
  "sun stair",
  "twin pylons",
  "pierced rosette",
  "broken twins",
  "solar niche",
  "high stele",
  "stepped portal",
  "three pinnacles",
  "split gable",
  "sun fan",
];

// Complete front, back and reveal faces. Openings are real holes in the stone.
export function crownPrism(points, depth, holes = [], bevel = 0.025) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  for (const ring of holes)
    shape.holes.push(new THREE.Path(ring.map((p) => new THREE.Vector2(...p))));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: !!bevel,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const axis =
      Math.abs(n.getX(i)) > 0.7 ? "x" : Math.abs(n.getY(i)) > 0.7 ? "y" : "z";
    uv.setXY(
      i,
      (axis === "x" ? p.getZ(i) : p.getX(i)) / 2,
      (axis === "y" ? p.getZ(i) : p.getY(i)) / 2,
    );
  }
  return geometry;
}
const circle = (radius, from = 0, to = Math.PI * 2, pieces = 48) =>
  Array.from({ length: pieces + (to - from < Math.PI * 2 ? 1 : 0) }, (_, i) => {
    const a = from + ((to - from) * i) / pieces;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
function annularPiece(inner, outer, from, to, depth) {
  return crownPrism(
    [...circle(outer, from, to, 3), ...circle(inner, from, to, 3).reverse()],
    depth,
    [],
    0.018,
  );
}

export function buildDesertCrown(
  game,
  { room, x, y, z, stone, carved, bronze, panelGeometry },
) {
  const root = new THREE.Group(),
    detail = new THREE.Group(),
    parts = [],
    style = DESERT_CROWN_STYLES[room.index % 10],
    feature = { id: `desert-crown-${room.index}` };
  root.name = `Solar crown ${room.index}: ${style}`;
  detail.name = root.name + " carving";
  root.position.set(x, y, z);
  detail.position.copy(root.position);
  game.world.add(root, detail);
  let seed = game.level.seed + room.index * 313 + 81003;
  const add = (
    geometry,
    px,
    py,
    pz,
    {
      material = stone,
      fine = false,
      closed = true,
      camera = true,
      angle = 0,
      name = "masonry",
      tint = 1,
    } = {},
  ) => {
    const id = parts.length,
      count = geometry.attributes.position.count,
      colors =
        geometry.attributes.color?.array.slice() ||
        new Float32Array(count * 3).fill(1),
      shade = (0.91 + Math.sin(++seed * 17.1) * 0.045) * tint;
    for (let i = 0; i < colors.length; i++)
      colors[i] *= shade * (i % 3 === 2 ? 0.96 : i % 3 === 1 ? 0.985 : 1);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute(
      "crownPart",
      new THREE.Float32BufferAttribute(new Float32Array(count).fill(id), 1),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.rotation.z = angle;
    mesh.castShadow = mesh.receiveShadow = true;
    (fine ? detail : root).add(mesh);
    parts.push({ id, name, closed, fine });
    if (camera && !fine)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const box = (w, h, d, px, py, pz = 0, options = {}) =>
    add(stoneBlockGeometry(w, h, d, ++seed, 0.025), px, py, pz, options);
  const shaft = (cx, low, height, width, upper = width * 0.72, depth = 2.1) => {
    add(
      crownPrism(
        [
          [-width / 2, 0],
          [width / 2, 0],
          [upper / 2, height],
          [-upper / 2, height],
        ],
        depth,
      ),
      cx,
      low,
      0,
      { name: "tapered shaft", tint: 0.88 },
    );
    // Facing courses embed in the complete shaft; their seams never leave
    // unsupported individual stones or cracks through the backing.
    const rows = Math.ceil(height / 0.65),
      step = height / rows;
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows,
        w = THREE.MathUtils.lerp(width, upper, t);
      box(
        w - 0.11,
        step - 0.025,
        0.22,
        cx,
        low + (i + 0.5) * step,
        depth / 2 - 0.05,
        { name: "facing course", tint: i % 3 === 0 ? 0.92 : 1 },
      );
    }
  };
  const panel = (w, h, px, py, pz) =>
    add(panelGeometry(w, h, room.index), px, py, pz, {
      material: carved,
      fine: true,
      closed: false,
      camera: false,
      name: "solar carving",
    });
  const disk = (radius, px, py, pz, material = bronze) => {
    add(
      new THREE.CylinderGeometry(radius, radius, 0.16, 40).rotateX(Math.PI / 2),
      px,
      py,
      pz,
      { material, name: "solar disk", fine: material === bronze },
    );
    add(
      new THREE.TorusGeometry(radius * 0.78, radius * 0.06, 6, 48),
      px,
      py,
      pz + 0.09,
      { material: bronze, fine: true, name: "disk rim" },
    );
  };
  const ring = (inner, outer, cx, cy, from = 0, to = Math.PI * 2) => {
    // A continuous recessed annulus joins the front voussoirs. Separate
    // sector bounds retain the actual open centre in the camera index.
    const full = to - from >= Math.PI * 2 - 0.001,
      points = full
        ? circle(outer - 0.06)
        : [
            ...circle(outer - 0.06, from, to),
            ...circle(inner + 0.015, from, to).reverse(),
          ],
      holes = full ? [circle(inner + 0.015).reverse()] : [];
    add(crownPrism(points, 0.9, holes, 0), cx, cy, -0.2, {
      camera: false,
      name: "continuous ring backing",
      tint: 0.78,
    });
    const count = Math.ceil(((to - from) * outer) / 0.55);
    for (let i = 0; i < count; i++) {
      const a = from + ((to - from) * i) / count,
        b = from + ((to - from) * (i + 1)) / count;
      // The same gapless backing sectors are captured then immediately freed.
      if (game.cameraSurfaces) {
        const g = annularPiece(inner, outer, a, b, 1.5),
          proxy = new THREE.Mesh(g, stone);
        proxy.position.set(cx, cy, 0);
        root.add(proxy);
        game.cameraSurfaces.capture(proxy, { small: true, thin: true });
        root.remove(proxy);
        g.dispose();
      }
      add(
        annularPiece(inner, outer, a + 0.003, b - 0.003, 1.24),
        cx,
        cy,
        0.11,
        { camera: false, name: "ring voussoir", tint: i % 3 === 0 ? 0.9 : 1 },
      );
    }
  };
  // The skirt overlaps the existing cornice by four centimetres; its complete
  // bearing face remains inside the ten-metre central span.
  const baseWidths = [7.4, 8.0, 7.6, 7.8, 7.6, 6.8, 8.6, 8.8, 8.2, 8.8],
    baseWidth = baseWidths[room.index % 10];
  box(baseWidth, 0.5, 2.65, 0, 0.25, 0, { name: "bearing skirt", tint: 0.86 });
  box(baseWidth + 0.18, 0.18, 2.78, 0, 0.54, 0, { name: "base moulding" });
  switch (room.index % 10) {
    case 0: {
      let low = 0.6;
      for (const [w, h, d] of [
        [6.6, 0.65, 2.3],
        [5.6, 0.7, 2.2],
        [4.4, 0.85, 2.1],
        [3.1, 0.8, 1.95],
        [1.8, 0.9, 1.8],
      ]) {
        box(w, h + 0.035, d, 0, low + h / 2, 0, { name: "stepped crest" });
        low += h;
      }
      add(
        crownPrism(
          [
            [-0.85, 0],
            [0.85, 0],
            [0, 1.0],
          ],
          1.65,
        ),
        0,
        low - 0.03,
        0,
        { name: "pyramid tip" },
      );
      panel(5.8, 0.45, 0, 0.7, 1.18);
      break;
    }
    case 1:
      shaft(-2.45, 0.59, 4.2, 2.35, 1.55);
      shaft(2.45, 0.59, 4.2, 2.35, 1.55);
      box(2.0, 0.28, 2.4, -2.45, 4.78);
      box(2.0, 0.28, 2.4, 2.45, 4.78);
      box(6.7, 0.48, 1.75, 0, 4.22, 0, { name: "connecting lintel" });
      box(0.18, 1.2, 0.3, 0, 3.53, 0.78, {
        material: bronze,
        fine: true,
        name: "medallion suspension",
      });
      disk(0.88, 0, 2.9, 0.78);
      break;
    case 2:
      box(1.2, 1.3, 1.8, 0, 1.23, 0, { name: "rosette stem" });
      ring(1.82, 2.5, 0, 3.38);
      add(
        new THREE.CylinderGeometry(0.55, 0.55, 1.2, 32).rotateX(Math.PI / 2),
        0,
        3.38,
        0.11,
        { name: "rosette hub" },
      );
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          r = 1.2;
        box(0.17, 1.58, 0.9, Math.cos(a) * r, 3.38 + Math.sin(a) * r, 0.11, {
          angle: a - Math.PI / 2,
          name: "radial stone spoke",
        });
      }
      disk(0.32, 0, 3.38, 0.74);
      break;
    case 3:
      shaft(-2.4, 0.59, 5.4, 2.15, 1.4);
      shaft(2.4, 0.59, 3.1, 2.1, 1.55);
      box(1.85, 0.25, 2.35, -2.4, 6.0);
      box(2.1, 0.3, 2.25, 2.4, 3.67);
      add(
        crownPrism(
          [
            [-1.1, 0],
            [1.1, 0],
            [1.1, 0.35],
            [0.4, 0.25],
            [-0.1, 0.65],
            [-1.1, 0.78],
          ],
          1.8,
        ),
        -1.9,
        6.06,
        0,
        { name: "fractured lintel" },
      );
      panel(1.38, 2.6, -2.4, 1.15, 1.06);
      panel(1.25, 1.7, 2.4, 0.95, 1.06);
      break;
    case 4:
      shaft(-2.6, 0.59, 2.75, 1.1, 1.1, 2.3);
      shaft(2.6, 0.59, 2.75, 1.1, 1.1, 2.3);
      ring(2.1, 2.95, 0, 3.0, 0, Math.PI);
      box(4.0, 3.8, 0.32, 0, 2.5, -0.85, { name: "niche back", tint: 0.75 });
      disk(0.9, 0, 2.55, -0.65);
      break;
    case 5:
      shaft(0, 0.59, 5.5, 3.3, 2.25, 2.25);
      box(2.65, 0.25, 2.6, 0, 6.08);
      add(
        crownPrism(
          [
            [-1.25, 0],
            [1.25, 0],
            [0, 1.4],
          ],
          2.3,
        ),
        0,
        6.16,
        0,
        { name: "stele apex" },
      );
      box(0.7, 2.7, 2.0, -2.3, 1.94);
      box(0.7, 2.7, 2.0, 2.3, 1.94);
      panel(1.95, 3.7, 0, 1.28, 1.15);
      break;
    case 6:
      shaft(-3.0, 0.59, 3.55, 1.6, 1.6, 2.35);
      shaft(3.0, 0.59, 3.55, 1.6, 1.6, 2.35);
      for (const [w, h, cy, d] of [
        [7.5, 0.65, 4.34, 2.35],
        [6.1, 0.65, 4.96, 2.2],
        [4.7, 0.6, 5.54, 2.0],
      ])
        box(w, h, d, 0, cy, 0, { name: "portal lintel step" });
      panel(3.65, 0.47, 0, 5.29, 1.055);
      break;
    case 7:
      for (const [cx, h, w] of [
        [-2.95, 3.3, 1.6],
        [0, 5.0, 2.5],
        [2.95, 4.0, 1.6],
      ]) {
        shaft(cx, 0.59, h, w, w * 0.7, 2.15);
        add(
          crownPrism(
            [
              [-w * 0.4, 0],
              [w * 0.4, 0],
              [0, 1.0],
            ],
            2.15,
          ),
          cx,
          h + 0.55,
          0,
          { name: "pinnacle tip" },
        );
      }
      panel(1.68, 2.7, 0, 1.1, 1.1);
      break;
    case 8:
      shaft(-2.7, 0.59, 2.7, 1.7, 1.7);
      shaft(2.7, 0.59, 2.7, 1.7, 1.7);
      for (const side of [-1, 1]) {
        const points = [
          [-3.55, 2.95],
          [-0.48, 5.35],
          [-0.48, 4.48],
          [-2.1, 2.95],
        ].map(([x, y]) => [x * side, y]);
        add(crownPrism(points, 2.12), 0, 0, 0, { name: "broken gable arm" });
      }
      panel(1.26, 1.8, -2.7, 0.92, 1.07);
      panel(1.26, 1.8, 2.7, 0.92, 1.07);
      break;
    case 9:
      box(1.2, 1.6, 1.9, 0, 1.36, 0, { name: "fan pedestal" });
      shaft(-3.0, 0.59, 2.65, 1.3, 1.3);
      shaft(3.0, 0.59, 2.65, 1.3, 1.3);
      ring(2.55, 3.45, 0, 3.0, 0, Math.PI);
      add(
        new THREE.CylinderGeometry(1.3, 1.3, 1.35, 48).rotateX(Math.PI / 2),
        0,
        3.0,
        0,
        { name: "fan sun" },
      );
      for (let i = 0; i < 11; i++) {
        const a = (Math.PI * i) / 10,
          r = 2.04;
        box(0.23, 1.72, 1.0, Math.cos(a) * r, 3.0 + Math.sin(a) * r, 0, {
          angle: a - Math.PI / 2,
          name: "fan ray",
        });
      }
      disk(0.9, 0, 3.0, 0.73);
      break;
  }
  mergeArchitecture(root);
  mergeArchitecture(detail);
  const physicalGeometries = root.children
    .filter((o) => o.isMesh)
    .map((o) => {
      const g = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      o.updateMatrix();
      return g.applyMatrix4(o.matrix);
    });
  const physicalGeometry = mergeGeometries(physicalGeometries, false),
    proxy = new THREE.Mesh(physicalGeometry, stone);
  physicalGeometries.forEach((g) => g.dispose());
  root.add(proxy);
  const solid = stationMeshSolid(game, feature, proxy, {
    bodyPadding: 0.72,
    supportRadius: 0,
    layeredSupport: true,
  });
  root.remove(proxy);
  physicalGeometry.dispose();
  return {
    roomIndex: room.index,
    root,
    detail,
    parts,
    style,
    feature,
    solid,
    baseWidth,
    detailBounds: new THREE.Box3()
      .setFromObject(detail)
      .getBoundingSphere(new THREE.Sphere()),
  };
}
