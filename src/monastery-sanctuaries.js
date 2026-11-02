import * as THREE from "three";
import { timberGeometry } from "./monastery-architecture.js";
import {
  monasteryRoofGeometry,
  monasteryRoofHeight,
} from "./monastery-roof.js";
import {
  monasteryMuralMaterial,
  muralCoordinates,
} from "./monastery-murals.js";
import { projectStoneUVs } from "./stone-uv.js";
import { mergeArchitecture } from "./visuals.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { RoofCamera } from "./roof-camera.js";

function flatBox(width, height, depth) {
  const source = new THREE.BoxGeometry(width, height, depth),
    geometry = source.toNonIndexed();
  source.dispose();
  return geometry;
}

export const MONASTERY_SANCTUARIES = [
  { name: "The pilgrim hall", roof: "open crossbeams", bays: [3, 3] },
  { name: "The valley echo", roof: "rear hip canopy", bays: [3, 2] },
  { name: "The listening gallery", roof: "paired sky strips", bays: [5, 4] },
  { name: "The stair of voices", roof: "split roofs", bays: [5, 3] },
  { name: "The memory court", roof: "broken western canopy", bays: [1, 2] },
  { name: "The woven wind", roof: "timber light screen", bays: [4, 5] },
  { name: "The summit vigil", roof: "high northern canopy", bays: [3, 2] },
  { name: "The archive hall", roof: "clerestory lantern", bays: [4, 4] },
];

export function monasteryInteriorPlan(stage, length, side) {
  const style = MONASTERY_SANCTUARIES[stage],
    count = style.bays[side === 0 ? 0 : 1],
    step = (length - 0.8) / count,
    niches = [];
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * step;
    let bottom = 1.25,
      top = 6.1;
    if (stage === 3)
      top = 4.65 + (count / 2 - Math.abs(i - (count - 1) / 2)) * 0.5;
    if (stage === 6 && i === (count - 1) / 2) top = 6.45;
    if (stage === 7) {
      for (const y of [1.3, 3.85])
        niches.push({ x, width: step * 0.75, bottom: y, top: y + 2.05 });
    } else
      niches.push({
        x,
        width: step * (stage === 4 ? 0.78 : 0.73),
        bottom,
        top,
      });
  }
  return { name: style.name, length, side, niches };
}

function record(gate) {
  if (gate.monasterySanctuary) return gate.monasterySanctuary;
  const root = new THREE.Group();
  root.name = MONASTERY_SANCTUARIES[gate.stage].name;
  gate.root.add(root);
  return (gate.monasterySanctuary = {
    root,
    style: MONASTERY_SANCTUARIES[gate.stage],
    parts: [],
    meshes: [],
    walls: [],
    roofs: [],
    carriers: new Map(),
    feature: { id: `monastery-sanctuary-${gate.stage}` },
  });
}

function builder(game, gate, m) {
  const r = record(gate),
    identity = new THREE.Matrix4();
  m.monasteryOxide ??= m.wood.clone();
  m.monasteryOxide.color.set(0x794a3b);
  m.monasteryOxide.name = "Monastery painted joinery";
  m.monasteryMural ??= monasteryMuralMaterial(m.wall);
  const add = (
    geometry,
    material,
    kind,
    frame = identity,
    category = "wall",
  ) => {
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.deleteAttribute("color");
    geometry.applyMatrix4(frame);
    const id = r.parts.length;
    geometry.setAttribute(
      "monasteryPart",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(id),
        1,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    r.root.add(mesh);
    r.parts.push({ id, kind, category });
    r.meshes.push(mesh);
    game.cameraSurfaces?.capture(mesh, {
      small: true,
      thin: true,
      kernel: category === "roof" ? new RoofCamera(geometry) : null,
    });
    return mesh;
  };
  const box = (
    w,
    h,
    d,
    x,
    y,
    z,
    material,
    kind,
    frame = identity,
    category = "wall",
  ) => {
    const geometry =
      material === m.wood || material === m.monasteryOxide
        ? timberGeometry(
            w,
            h,
            d,
            game.level.seed + gate.stage * 337 + r.parts.length,
          )
        : projectStoneUVs(flatBox(w, h, d));
    geometry.translate(x, y, z);
    return add(geometry, material, kind, frame, category);
  };
  return { r, add, box };
}

// Every projection stays behind the old -0.41 m inner skin. Rectangular bays
// remove real plaster from that skin; their backs keep the exterior sealed.
export function buildMonasteryInnerWall(
  game,
  gate,
  m,
  { length, side, frame, insetOffset = 0 },
) {
  const { r, box, add } = builder(game, gate, m),
    plan = monasteryInteriorPlan(gate.stage, length, side),
    holes = plan.niches.map((n) => ({
      left: n.x - n.width / 2,
      right: n.x + n.width / 2,
      bottom: n.bottom,
      top: n.top,
    }));
  box(
    length,
    7,
    0.1 + insetOffset,
    0,
    3.5,
    -0.18 + insetOffset / 2,
    m.wall,
    "sealed plaster backing",
    frame,
  );
  const xs = [
      ...new Set([
        -length / 2,
        length / 2,
        ...holes.flatMap((n) => [n.left, n.right]),
      ]),
    ].sort((a, b) => a - b),
    ys = [...new Set([0, 7, ...holes.flatMap((n) => [n.bottom, n.top])])].sort(
      (a, b) => a - b,
    );
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2,
        y = (ys[j] + ys[j + 1]) / 2;
      if (
        holes.some(
          (n) => x > n.left && x < n.right && y > n.bottom && y < n.top,
        )
      )
        continue;
      box(
        xs[i + 1] - xs[i],
        ys[j + 1] - ys[j],
        0.14,
        x,
        y,
        -0.3,
        m.wall,
        "recessed plaster face",
        frame,
      );
    }
  for (const n of plan.niches) {
    const h = n.top - n.bottom,
      y = (n.top + n.bottom) / 2;
    const paint = muralCoordinates(flatBox(n.width - 0.08, h - 0.08, 0.036), {
      stage: gate.stage,
      x: n.x,
      y,
      length,
    });
    projectStoneUVs(paint);
    paint.translate(n.x, y, -0.234);
    add(paint, m.monasteryMural, "painted lesson record", frame);
    for (const sign of [-1, 1]) {
      box(
        0.16,
        h + 0.2,
        0.075,
        n.x + (sign * n.width) / 2,
        y,
        -0.365,
        m.monasteryOxide,
        "recess jamb",
        frame,
      );
      box(
        n.width + 0.16,
        0.16,
        0.075,
        n.x,
        sign < 0 ? n.bottom : n.top,
        -0.365,
        m.monasteryOxide,
        "recess lintel",
        frame,
      );
    }
    // Small attached timber dividers make the archive a set of record shelves.
    if (gate.stage === 7)
      for (const sign of [-1, 1])
        box(
          0.055,
          h - 0.08,
          0.025,
          n.x + sign * n.width * 0.22,
          y,
          -0.261,
          m.wood,
          "archive record divider",
          frame,
        );
  }
  for (const [y, h] of [
    [0.46, 0.56],
    [6.64, 0.22],
  ])
    box(
      length,
      h,
      0.065,
      0,
      y,
      -0.373,
      m.monasteryOxide,
      "painted wall rail",
      frame,
    );
  for (const sign of [-1, 1])
    box(
      0.24,
      6.9,
      0.065,
      sign * (length / 2 - 0.14),
      3.45,
      -0.373,
      m.wood,
      "corner stile",
      frame,
    );
  r.walls.push({ ...plan, frame: frame.toArray() });
  return plan;
}

export function finishMonasterySanctuary(game, gate, m) {
  const { r, box, add } = builder(game, gate, m),
    stage = gate.stage;
  const carrier = (z) => {
    const key = z.toFixed(4);
    if (r.carriers.has(key)) return;
    r.carriers.set(key, true);
    for (const sign of [-1, 1]) {
      box(
        0.56,
        1.8,
        0.78,
        sign * 6.8,
        8.06,
        z,
        m.wood,
        "roof bearing",
        undefined,
        "structure",
      );
      box(
        1.04,
        0.22,
        1.02,
        sign * 6.8,
        8.8,
        z,
        m.monasteryOxide,
        "bearing capital",
        undefined,
        "structure",
      );
    }
    box(
      13.85,
      0.38,
      0.65,
      0,
      8.95,
      z,
      m.wood,
      "transverse carrier",
      undefined,
      "structure",
    );
  };
  const canopy = (width, depth, rise, cx, cz, base = 9.35, damage = 0) => {
    const options = { width, depth, rise, seed: stage, damage },
      ids = [];
    for (const snow of [false, true]) {
      const geometry = monasteryRoofGeometry({ ...options, snow });
      geometry.translate(cx, base, cz);
      ids.push(r.parts.length);
      add(
        geometry,
        snow ? m.snow : m.roof,
        snow ? "roof snow" : "slate roof",
        undefined,
        "roof",
      );
    }
    const rows = [cz - depth * 0.23, cz + depth * 0.23];
    rows.forEach(carrier);
    for (const sign of [-1, 1]) {
      const x = cx + sign * width * 0.2;
      box(
        0.3,
        0.22,
        depth * 0.6,
        x,
        9.2,
        cz,
        m.monasteryOxide,
        "longitudinal purlin",
        undefined,
        "structure",
      );
      for (const z of rows) {
        const top =
          base + monasteryRoofHeight(x - cx, z - cz, width, depth, rise) - 0.15;
        box(
          0.27,
          top - 9.24,
          0.3,
          x,
          (top + 9.24) / 2,
          z,
          m.wood,
          "fitted roof strut",
          undefined,
          "structure",
        );
      }
    }
    r.roofs.push({ ids, options, position: [cx, base, cz] });
  };
  switch (stage) {
    case 0:
      [-4.9, 1.7].forEach(carrier);
      for (const sign of [-1, 1])
        box(
          0.36,
          0.27,
          8.1,
          sign * 3.4,
          9.21,
          -1.6,
          m.monasteryOxide,
          "pilgrim open rail",
          undefined,
          "structure",
        );
      break;
    case 1:
      canopy(14.8, 5.3, 1.4, 0, -3.6);
      break;
    case 2:
      for (const sign of [-1, 1]) canopy(5.3, 11.6, 0.85, sign * 4.4, -0.3);
      break;
    case 3:
      canopy(14.8, 4.6, 1.7, 0, -4.1);
      canopy(14.8, 3.8, 0.85, 0, 2.4);
      break;
    case 4:
      canopy(7.6, 10.4, 1.4, -3.4, -0.5, 9.35, 2);
      break;
    case 5:
      [-5.7, 0, 5.7].forEach(carrier);
      for (const x of [-4.5, 0, 4.5])
        box(
          0.35,
          0.26,
          12.4,
          x,
          9.2,
          0,
          m.wood,
          "wind screen rail",
          undefined,
          "structure",
        );
      for (let i = 0; i < 12; i++) {
        const z = -5.5 + i;
        box(
          13.7,
          0.17,
          0.22,
          0,
          9.4,
          z,
          m.monasteryOxide,
          "wind screen slat",
          undefined,
          "structure",
        );
        if (i % 3 === 0)
          box(
            13.5,
            0.07,
            0.18,
            0,
            9.49,
            z,
            m.snow,
            "slat snow",
            undefined,
            "structure",
          );
      }
      // A real service walk gives both boots a bearing surface above the
      // light screen. Its crosspieces enter the three transverse carriers.
      for (const z of [-5.7, 0, 5.7])
        box(
          1.6,
          0.24,
          0.54,
          0,
          9.22,
          z,
          m.wood,
          "service-walk crosspiece",
          undefined,
          "structure",
        );
      for (let i = 0; i < 5; i++)
        box(
          0.27,
          0.26,
          12.4,
          (i - 2) * 0.26,
          9.42,
          0,
          m.wood,
          "service-walk plank",
          undefined,
          "structure",
        );
      break;
    case 6:
      canopy(14.8, 6.9, 2.0, 0, -2.8, 10.05);
      break;
    case 7:
      canopy(14.8, 11.8, 1.1, 0, -0.5);
      box(
        5.4,
        1.8,
        5.2,
        0,
        11.02,
        -0.5,
        m.wall,
        "lantern body",
        undefined,
        "structure",
      );
      for (const sign of [-1, 1]) {
        for (const x of [-2.53, 2.53])
          box(
            0.28,
            2.0,
            0.3,
            x,
            11.05,
            -0.5 + sign * 2.55,
            m.monasteryOxide,
            "lantern corner",
            undefined,
            "structure",
          );
        box(
          4.5,
          1.15,
          0.045,
          0,
          11.1,
          -0.5 + sign * 2.62,
          m.dark,
          "closed vent backing",
          undefined,
          "structure",
        );
        for (let i = 0; i < 10; i++)
          box(
            0.11,
            1.3,
            0.11,
            (i - 4.5) * 0.44,
            11.1,
            -0.5 + sign * 2.67,
            m.wood,
            "vent grille",
            undefined,
            "structure",
          );
        for (const y of [10.45, 11.75])
          box(
            5.55,
            0.16,
            0.28,
            0,
            y,
            -0.5 + sign * 2.61,
            m.monasteryOxide,
            "vent rail",
            undefined,
            "structure",
          );
      }
      for (const snow of [false, true]) {
        const geometry = monasteryRoofGeometry({
          width: 7.4,
          depth: 7.2,
          rise: 1.35,
          seed: stage,
          snow,
        });
        geometry.translate(0, 11.8, -0.5);
        const id = r.parts.length;
        add(
          geometry,
          snow ? m.snow : m.roof,
          snow ? "lantern snow" : "lantern roof",
          undefined,
          "roof",
        );
        if (!snow)
          r.roofs.push({
            ids: [id, id + 1],
            options: { width: 7.4, depth: 7.2, rise: 1.35, seed: stage },
            position: [0, 11.8, -0.5],
          });
      }
      break;
  }
  const structures = r.meshes.filter(
    (mesh) =>
      r.parts[mesh.geometry.attributes.monasteryPart.getX(0)].category ===
      "structure",
  );
  r.solids = [
    stationAssemblySolid(game, r.feature, structures, {
      bodyPadding: 0.65,
      // Light-screen gaps remain empty for body support as well as boot rays.
      supportRadius: 0,
    }),
  ];
  r.solids[0].groundingSlope = true;
  for (const roof of r.roofs) {
    const meshes = roof.ids.map((id) => r.meshes[id]),
      solid = stationAssemblySolid(game, r.feature, meshes, {
        bodyPadding: 0.65,
        supportRadius: 0,
      });
    solid.groundingSlope = true;
    r.solids.push(solid);
  }
  r.solids.forEach((s) => {
    s.monasterySanctuary = true;
  });
  mergeArchitecture(r.root, 2);
  delete r.meshes;
  delete r.carriers;
  return r;
}
