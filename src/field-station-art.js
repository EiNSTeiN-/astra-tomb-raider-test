import * as THREE from "three";
import { stationLatheGeometry } from "./field-station-geometry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { monasteryRoofGeometry } from "./monastery-roof.js";
import { stationSolid } from "./field-station-solids.js";

// The working footprints are deliberately shared with the established controls.
// Construction, reliefs and the carried fittings belong to their region.
export const STATION_STYLES = Object.freeze({
  jungle: {
    name: "Lotus waterworks",
    sides: 12,
    courses: 6,
    motif: "lotus",
    metal: 0xa99263,
  },
  desert: {
    name: "Solar survey house",
    sides: 8,
    courses: 5,
    motif: "sun",
    metal: 0xc0a470,
  },
  snow: {
    name: "Mountain keeper",
    sides: 8,
    courses: 7,
    motif: "mountain",
    metal: 0x9d8d73,
  },
  water: {
    name: "Tidal instrument",
    sides: 16,
    courses: 5,
    motif: "shell",
    metal: 0x93a99b,
  },
  volcano: {
    name: "Foundry regulator",
    sides: 10,
    courses: 8,
    motif: "gear",
    metal: 0x99918a,
  },
  sky: {
    name: "Wind surveyor",
    sides: 12,
    courses: 6,
    motif: "wing",
    metal: 0xaca57b,
  },
  crystal: {
    name: "Harmonic register",
    sides: 6,
    courses: 4,
    motif: "prism",
    metal: 0x9da6b9,
  },
  eclipse: {
    name: "Meridian archive",
    sides: 16,
    courses: 8,
    motif: "orbit",
    metal: 0xb9ac88,
  },
});

const materials = new WeakMap();
function stationMaterials(game, style) {
  if (materials.has(game.stoneMat)) return materials.get(game.stoneMat);
  const stone = game.stoneMat.clone(),
    dark = game.darkMat.clone(),
    metal = patinatedBronze();
  stone.name = `${style.name} ashlar`;
  dark.name = `${style.name} recessed stone`;
  // Share the already credited maps, with independent tint and surface strength.
  stone.normalScale.setScalar(0.32);
  dark.normalScale.setScalar(0.38);
  dark.color.copy(stone.color).multiplyScalar(0.48);
  metal.name = `${style.name} oxidized fittings`;
  metal.color.setHex(style.metal);
  metal.roughness = 0.52;
  for (const m of [stone, dark, metal]) m.vertexColors = true;
  const result = { stone, dark, metal };
  materials.set(game.stoneMat, result);
  return result;
}

export function buildRegionalStation(game, f, group) {
  const style = STATION_STYLES[game.level.biome],
    { stone, dark, metal } = stationMaterials(game, style);
  f.stationStyle = style.name;
  let serial = game.level.seed + f.stage * 37 + f.step * 11;
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = group) => {
    const tone =
      material === stone ? 0.86 + (Math.sin(++serial * 7.37) + 1) * 0.07 : 1;
    const colors = new Float32Array(
      geometry.attributes.position.count * 3,
    ).fill(tone);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    // Small pieces replace larger primitives; capture their actual surfaces
    // before material batching so the camera still sees the complete assembly.
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const block = (w, h, d, m, x, y, z, parent) =>
    add(stoneBlockGeometry(w, h, d, ++serial, 0.028), m, x, y, z, parent);
  const lathe = (
    profile,
    m,
    x = 0,
    y = 0,
    z = 0,
    parent = group,
    sides = style.sides,
  ) => add(stationLatheGeometry(profile, sides, !!m.map), m, x, y, z, parent);
  const ring = (r, tube, m, x, y, z, parent = group) =>
    add(new THREE.TorusGeometry(r, tube, 6, 32), m, x, y, z, parent);
  const rod = (a, b, radius, m = metal, parent = group) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const mesh = add(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 6),
      m,
      ...start.add(end).multiplyScalar(0.5).toArray(),
      parent,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const solid = (size, position, options) =>
    stationSolid(game, f, group, size, position, options);

  // Closed molded courses: the bottom and cap keep their saved support heights.
  lathe(
    [
      [0, 0],
      [1.1, 0],
      [1.1, 0.12],
      [1.02, 0.17],
      [0.92, 0.22],
      [0.88, 0.53],
      [0.99, 0.59],
      [0.99, 0.7],
      [0, 0.7],
    ],
    stone,
  );
  solid([2.2, 0.7, 2.2], [0, 0.35, 0], { radius: 1.1 });
  lathe(
    [
      [0, 0.7],
      [0.94, 0.7],
      [0.94, 0.75],
      [0.9, 0.78],
      [0.9, 0.81],
      [0, 0.81],
    ],
    dark,
  );
  solid([1.88, 0.14, 1.88], [0, 0.74, 0], { radius: 0.94 });
  for (const y of [0.25, 0.51])
    ring(0.895, 0.018, metal, 0, y, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < style.sides; i++) {
    const a = (i * Math.PI * 2) / style.sides;
    const plate = block(
      0.19,
      0.19,
      0.025,
      dark,
      Math.sin(a) * 0.899,
      0.38,
      Math.cos(a) * 0.899,
    );
    plate.rotation.y = a;
    const pin = add(
      new THREE.SphereGeometry(0.026, 6, 4),
      metal,
      Math.sin(a) * 0.916,
      0.38,
      Math.cos(a) * 0.916,
    );
    pin.scale.z = 0.6;
  }
  const core = new THREE.Group();
  core.name = `${style.name} ${f.kind}`;
  group.add(core);
  f.core = core;
  if (["valve", "winch"].includes(f.kind)) {
    block(0.22, 1.2, 0.22, dark, 0, 1.3, 0);
    solid([0.22, 1.2, 0.22], [0, 1.3, 0]);
    block(0.38, 0.13, 0.38, metal, 0, 0.875, 0);
    solid([0.38, 0.13, 0.38], [0, 0.875, 0]);
    // The rotating hub seats on a horizontal axle through the upright bearing.
    lathe(
      [
        [0, -0.17],
        [0.17, -0.17],
        [0.2, -0.12],
        [0.2, 0.08],
        [0.15, 0.17],
        [0, 0.17],
      ],
      dark,
      0,
      1.7,
      -0.035,
    ).rotation.x = Math.PI / 2;
    solid([0.4, 0.4, 0.41], [0, 1.7, -0.035]);
    core.position.y = 1.7;
    ring(0.7, 0.075, metal, 0, 0, 0, core);
    ring(0.605, 0.022, dark, 0, 0, 0, core);
    const spokes = f.kind === "winch" ? 8 : 6;
    for (let i = 0; i < spokes; i++) {
      const a = (i * Math.PI * 2) / spokes;
      rod(
        [Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0],
        [Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0],
        0.037,
        metal,
        core,
      );
      add(
        new THREE.SphereGeometry(0.04, 6, 4),
        dark,
        Math.sin(a) * 0.7,
        Math.cos(a) * 0.7,
        0.058,
        core,
      );
    }
    lathe(
      [
        [0, -0.075],
        [0.19, -0.075],
        [0.19, 0.035],
        [0.13, 0.08],
        [0, 0.08],
      ],
      metal,
      0,
      0,
      0,
      core,
    ).rotation.x = Math.PI / 2;
    solid([1.57, 1.57, 0.17], [0, 1.7, 0]);
    for (const side of [-1, 1]) {
      block(0.27, 1.5, 0.27, dark, side * 1.45, 0.75, 0);
      for (let j = 0; j < 3; j++)
        block(0.33, 0.49, 0.33, stone, side * 1.45, 0.25 + j * 0.5, 0);
      block(0.35, 0.09, 0.35, metal, side * 1.45, 1.455, 0);
      solid([0.35, 1.5, 0.35], [side * 1.45, 0.75, 0]);
    }
  } else if (f.kind === "brazier") {
    // A bowl with an inner wall and fuel bed, rather than a capped cone.
    lathe(
      [
        [0, 0.8],
        [0.28, 0.8],
        [0.3, 0.93],
        [0.48, 1.08],
        [0.67, 1.3],
        [0.7, 1.36],
        [0.68, 1.4],
        [0.62, 1.4],
        [0.6, 1.32],
        [0.42, 1.16],
        [0, 1.16],
      ],
      metal,
    );
    lathe(
      [
        [0, 1.16],
        [0.42, 1.16],
        [0.5, 1.27],
        [0, 1.27],
      ],
      dark,
    );
    solid([1.4, 0.6, 1.4], [0, 1.1, 0], { radius: 0.7 });
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 1.1, 7),
      new THREE.MeshBasicMaterial({ color: 0xffbb6a, toneMapped: false }),
    );
    fire.position.y = 1.95;
    fire.userData.animated = true;
    group.add(fire);
    f.fire = fire;
    game.flames.push(fire);
  } else if (["lift", "delivery", "resonance"].includes(f.kind)) {
    core.position.y = 1.2;
    const done =
      f.stage < game.progress.stage || game.progress.field.includes(f.id);
    if (f.kind === "lift") core.visible = !done;
    if (f.kind === "delivery") core.visible = done;
    // An assembled cartridge with collars and a lifting eye; harmonic stations
    // instead hold a faceted resonator within the same supported envelope.
    if (f.kind !== "resonance")
      lathe(
        [
          [0, -0.39],
          [0.34, -0.39],
          [0.34, -0.27],
          [0.25, -0.22],
          [0.25, 0.22],
          [0.32, 0.27],
          [0.32, 0.34],
          [0, 0.34],
        ],
        metal,
        0,
        0,
        0,
        core,
      );
    if (f.kind === "resonance") {
      for (const y of [-0.31, 0.29])
        lathe(
          [
            [0, y - 0.055],
            [0.34, y - 0.055],
            [0.34, y + 0.055],
            [0, y + 0.055],
          ],
          metal,
          0,
          0,
          0,
          core,
        );
      add(
        new THREE.OctahedronGeometry(0.39),
        game.glowMat || stone,
        0,
        0.04,
        0,
        core,
      );
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        rod(
          [Math.sin(a) * 0.32, -0.28, Math.cos(a) * 0.32],
          [Math.sin(a) * 0.32, 0.28, Math.cos(a) * 0.32],
          0.025,
          metal,
          core,
        );
      }
    } else {
      lathe(
        [
          [0, -0.23],
          [0.275, -0.23],
          [0.275, 0.23],
          [0, 0.23],
        ],
        stone,
        0,
        0,
        0,
        core,
      );
      ring(0.12, 0.035, metal, 0, 0.34, 0, core);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        rod(
          [Math.sin(a) * 0.28, -0.25, Math.cos(a) * 0.28],
          [Math.sin(a) * 0.28, 0.26, Math.cos(a) * 0.28],
          0.024,
          metal,
          core,
        );
      }
    }
    solid([1, 1, 1], [0, 1.2, 0], { node: core });
    // Recessed seat remains below the empty socket's walkable cap.
    ring(0.62, 0.023, metal, 0, 0.783, 0).rotation.x = Math.PI / 2;
  } else {
    const tablet = new THREE.Group();
    group.add(tablet);
    tablet.position.y = 1.3;
    tablet.rotation.x = -0.25;
    block(1.3, 1.05, 0.16, stone, 0, 0, 0, tablet);
    block(1.08, 0.84, 0.026, dark, 0, 0, 0.077, tablet);
    for (const side of [-1, 1]) {
      block(0.036, 0.89, 0.026, metal, side * 0.55, 0, 0.1, tablet);
      block(1.1, 0.032, 0.026, metal, 0, side * 0.44, 0.1, tablet);
      block(0.1, 0.3, 0.16, metal, side * 0.43, -0.42, -0.01, tablet);
    }
    // A route diagram for climbing; a regional instrument face for surveys.
    if (f.kind === "climb") {
      const points = [
        [-0.4, -0.3, 0.104],
        [-0.22, -0.2, 0.104],
        [-0.24, 0.07, 0.104],
        [0.19, 0.08, 0.104],
        [0.37, 0.31, 0.104],
      ];
      for (let i = 1; i < points.length; i++)
        rod(points[i - 1], points[i], 0.013, metal, tablet);
      for (const p of points) ring(0.034, 0.012, metal, ...p, tablet);
    } else {
      emblem(style.motif, 0, 0, 0.109, 0.34, tablet);
      for (let i = 0; i < 5; i++)
        block(
          0.024,
          0.032 + (i % 2) * 0.025,
          0.012,
          metal,
          -0.35 + i * 0.175,
          -0.35,
          0.109,
          tablet,
        );
    }
    mergeArchitecture(tablet);
    solid([1.3, 1.06, 0.43], [0, 1.3, 0]);
  }
  mergeArchitecture(core);
  if (f.yOffset === 8.4) return;

  // Fitted shafts retain the old passage and landing bounds. Jointed courses,
  // inset bronze ties and the regional crest break up the repeated portal.
  for (const side of [-1, 1]) {
    const x = side * 2.7,
      z = -1.5,
      h = 3.4 / style.courses;
    block(0.54, 3.4, 0.59, dark, x, 1.7, z);
    for (let i = 0; i < style.courses; i++) {
      const edge = i === 0 || i === style.courses - 1;
      block(
        edge ? 0.65 : 0.59,
        h - 0.012,
        edge ? 0.7 : 0.64,
        stone,
        x,
        h * (i + 0.5),
        z,
      );
      if (i % 2 === 1) block(0.62, 0.035, 0.675, metal, x, h * i + 0.065, z);
    }
    solid([0.65, 3.4, 0.7], [x, 1.7, z]);
    block(0.82, 0.2, 0.9, stone, x, 3.45, z);
    block(0.7, 0.045, 0.78, metal, x, 3.375, z);
    solid([0.82, 0.2, 0.9], [x, 3.45, z]);
    for (const face of [-1, 1]) {
      block(0.32, 0.9, 0.025, dark, x, 2.1, z + face * 0.319);
      for (let j = 0; j < 3; j++) {
        const detail = block(
          0.16,
          0.16,
          0.027,
          metal,
          x,
          1.82 + j * 0.27,
          z + face * 0.333,
        );
        detail.rotation.z = Math.PI / 4;
      }
    }
  }
  block(6.18, 0.4, 0.73, dark, 0, 3.765, -1.5);
  for (let i = 0; i < 7; i++)
    block(6.2 / 7 - 0.009, 0.45, 0.8, stone, ((i - 3) * 6.2) / 7, 3.765, -1.5);
  // Regional silhouettes have closed, supported profiles. Each crown sits in
  // the lintel instead of hovering above its bevelled top.
  const crown = new THREE.Group();
  group.add(crown);
  crown.position.set(0, 3.96, -1.5);
  const crest = (points, depth, m, x = 0, y = 0, z = 0) => {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    return add(geometry, m, x, y, z, crown);
  };
  const disk = (r, y, m = stone, depth = 0.3) => {
    const mesh = add(
      new THREE.CylinderGeometry(r, r, depth, 32),
      m,
      0,
      y,
      0,
      crown,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  block(2.0, 0.14, 0.68, stone, 0, 0.07, 0, crown);
  if (style.motif === "lotus") {
    for (let i = -2; i <= 2; i++) {
      const x = i * 0.36,
        h = 1.05 - Math.abs(i) * 0.2;
      crest(
        [
          [-0.24, 0],
          [-0.35, h * 0.5],
          [0, h],
          [0.35, h * 0.5],
          [0.24, 0],
        ],
        0.38,
        stone,
        x,
        0.1,
      );
      for (const side of [-1, 1])
        rod(
          [x, 0.15, side * 0.21],
          [x, h + 0.05, side * 0.21],
          0.014,
          metal,
          crown,
        );
    }
  } else if (style.motif === "sun") {
    for (const side of [-1, 1]) {
      crest(
        [
          [side * 0.25, 0.12],
          [side * 2.3, 0.54],
          [side * 2.05, 0.14],
        ],
        0.38,
        stone,
      );
      for (let i = 0; i < 7; i++)
        block(
          0.13,
          0.12,
          0.42,
          metal,
          side * (0.65 + i * 0.2),
          0.18 + i * 0.032,
          0,
          crown,
        );
    }
    disk(0.56, 0.58);
    for (const side of [-1, 1])
      emblem("sun", 0, 0.58, side * 0.17, 0.48, crown);
  } else if (style.motif === "mountain") {
    block(2.7, 0.35, 0.55, dark, 0, 0.17, 0, crown);
    add(
      monasteryRoofGeometry({ width: 3.4, depth: 1.25, rise: 0.58 }),
      metal,
      0,
      0.3,
      0,
      crown,
    );
    block(1.3, 0.17, 0.35, stone, 0, 0.81, 0, crown);
    emblem("mountain", 0, 0.19, 0.285, 0.21, crown);
  } else if (style.motif === "shell") {
    const points = [[-1.08, 0.08]];
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI - (i * Math.PI) / 18;
      points.push([Math.cos(a) * 1.08, 0.08 + Math.sin(a) * 0.99]);
    }
    points.push([1.08, 0.08]);
    crest(points, 0.38, stone);
    for (const side of [-1, 1])
      for (let i = 0; i < 9; i++) {
        const a = 0.15 + (i * (Math.PI - 0.3)) / 8;
        rod(
          [0, 0.12, side * 0.207],
          [Math.cos(a), 0.08 + Math.sin(a) * 0.91, side * 0.207],
          0.019,
          metal,
          crown,
        );
      }
  } else if (style.motif === "gear") {
    // Riveted iron casing, with a stepped pressure crest and a toothed relief.
    for (let i = 0; i < 3; i++)
      block(3.8 - i * 1.1, 0.22, 0.56, metal, 0, 0.11 + i * 0.22, 0, crown);
    disk(0.45, 0.46, dark, 0.59);
    for (const side of [-1, 1]) {
      emblem("gear", 0, 0.46, side * 0.3, 0.4, crown);
      for (const x of [-1.65, -1.25, 1.25, 1.65])
        add(
          new THREE.SphereGeometry(0.045, 6, 4),
          dark,
          x,
          0.12,
          side * 0.29,
          crown,
        );
    }
  } else if (style.motif === "wing") {
    for (const side of [-1, 1]) {
      crest(
        [
          [0, 0.05],
          [side * 0.7, 0.58],
          [side * 1.8, 0.76],
          [side * 1.2, 0.26],
        ],
        0.42,
        stone,
      );
      for (let i = 0; i < 4; i++)
        rod(
          [side * (0.22 + i * 0.28), 0.13 + i * 0.08, 0.23],
          [side * (0.65 + i * 0.28), 0.56 + i * 0.052, 0.23],
          0.021,
          metal,
          crown,
        );
    }
    crest(
      [
        [-0.2, 0],
        [0, 0.94],
        [0.2, 0],
      ],
      0.48,
      metal,
    );
  } else if (style.motif === "prism") {
    for (let i = -2; i <= 2; i++) {
      const h = 1.05 - Math.abs(i) * 0.22;
      crest(
        [
          [-0.19, 0],
          [-0.19, h - 0.2],
          [0, h],
          [0.19, h - 0.2],
          [0.19, 0],
        ],
        0.44,
        stone,
        i * 0.38,
        0.1,
      );
      block(
        0.055,
        h - 0.25,
        0.025,
        metal,
        i * 0.38,
        0.15 + (h - 0.25) / 2,
        0.235,
        crown,
      );
    }
  } else {
    disk(0.74, 0.67);
    for (const side of [-1, 1])
      emblem("orbit", 0, 0.67, side * 0.17, 0.66, crown);
    block(2.6, 0.11, 0.56, metal, 0, 0.12, 0, crown);
  }
  crown.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(crown),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3()).sub(group.position);
  solid(size.toArray(), center.toArray());
  mergeArchitecture(crown);
  solid([6.2, 0.45, 0.8], [0, 3.765, -1.5]);

  function emblem(motif, x, y, z, r, parent) {
    const stroke = (a, b) =>
      rod(
        [x + a[0] * r, y + a[1] * r, z],
        [x + b[0] * r, y + b[1] * r, z],
        r * 0.035,
        metal,
        parent,
      );
    if (["sun", "gear", "orbit"].includes(motif)) {
      ring(r * 0.6, r * 0.035, metal, x, y, z, parent);
      ring(r * 0.2, r * 0.04, metal, x, y, z, parent);
      const count = motif === "gear" ? 10 : motif === "sun" ? 12 : 4;
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count;
        stroke(
          [Math.sin(a) * 0.63, Math.cos(a) * 0.63],
          [Math.sin(a) * 0.94, Math.cos(a) * 0.94],
        );
      }
      if (motif === "orbit")
        ring(r * 0.85, r * 0.025, metal, x, y, z, parent).scale.y = 0.42;
    } else if (motif === "prism" || motif === "mountain" || motif === "wing") {
      const points =
        motif === "prism"
          ? [
              [0, -1],
              [-0.6, 0],
              [0, 1],
              [0.6, 0],
              [0, -1],
              [0, 1],
            ]
          : motif === "mountain"
            ? [
                [-1, -0.4],
                [-0.35, 0.8],
                [0.15, -0.2],
                [0.55, 0.45],
                [1, -0.4],
                [-1, -0.4],
              ]
            : [
                [-1, 0.6],
                [-0.55, -0.15],
                [0, -0.55],
                [0.55, -0.15],
                [1, 0.6],
                [0, 0],
                [-1, 0.6],
              ];
      for (let i = 1; i < points.length; i++) stroke(points[i - 1], points[i]);
    } else {
      // Shell rays open upward; paired lotus leaves close around a central bud.
      const count = motif === "shell" ? 7 : 5;
      for (let i = 0; i < count; i++) {
        const a = -1.1 + (i * 2.2) / (count - 1),
          end = [Math.sin(a) * 0.92, Math.cos(a) * 0.9];
        stroke([0, -0.7], end);
        if (motif === "lotus") stroke(end, [Math.sin(a) * 0.36, -0.2]);
      }
      stroke([-0.7, -0.7], [0.7, -0.7]);
    }
  }
}
