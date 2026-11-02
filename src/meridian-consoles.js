import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { orreryPedestalGeometry } from "./orrery-pedestals.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { projectStoneUVs } from "./stone-uv.js";
import { courtWalkingHeight } from "./court-dais-rules.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { observatoryState, normalizeAlignments } from "./observatory-state.js";
import { mergeArchitecture, pbrMaterial } from "./visuals.js";

const PROFILES = [
  [
    "Earth-axis register",
    [
      [-1.5, 0.88],
      [1.5, 0.88],
      [1.5, 2.15],
      [1.1, 2.65],
      [-1.1, 2.65],
      [-1.5, 2.15],
    ],
  ],
  [
    "Lunar shoulders",
    [
      [-1.35, 0.88],
      [1.35, 0.88],
      [1.65, 2.05],
      [1.1, 2.55],
      [-1.1, 2.55],
      [-1.65, 2.05],
    ],
  ],
  [
    "Sevenfold archive",
    [
      [-1.65, 0.88],
      [1.65, 0.88],
      [1.65, 2.42],
      [-1.65, 2.42],
    ],
  ],
  [
    "Solar meridian",
    [
      [-1.35, 0.88],
      [1.35, 0.88],
      [1.7, 2.1],
      [1.2, 2.55],
      [-1.2, 2.55],
      [-1.7, 2.1],
    ],
  ],
  [
    "Western horizon",
    [
      [-1.85, 0.88],
      [1.85, 0.88],
      [1.85, 2.32],
      [-1.85, 2.32],
    ],
  ],
  [
    "Astral register",
    [
      [-1.55, 0.88],
      [1.55, 0.88],
      [1.65, 2.05],
      [0.8, 2.75],
      [0.18, 3.15],
      [-0.18, 3.15],
      [-0.8, 2.75],
      [-1.65, 2.05],
    ],
  ],
  [
    "Celestial circuit",
    [
      [-1.4, 0.88],
      [1.4, 0.88],
      [1.6, 2.25],
      [1.3, 2.65],
      [-1.3, 2.65],
      [-1.6, 2.25],
    ],
  ],
  [
    "Hollow-earth strata",
    [
      [-1.6, 0.88],
      [1.6, 0.88],
      [1.6, 2.45],
      [-1.6, 2.45],
    ],
  ],
  [
    "Final meridian",
    [
      [-1.7, 0.88],
      [1.7, 0.88],
      [1.7, 2.5],
      [-1.7, 2.5],
    ],
  ],
];

function projected(geometry) {
  if (geometry.index) {
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    geometry = expanded;
  }
  projectStoneUVs(geometry);
  return geometry;
}
function panel(points, depth = 0.65) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  shape.closePath();
  return projected(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelThickness: Math.min(0.025, depth / 4),
      bevelSize: Math.min(0.025, depth / 4),
      curveSegments: 16,
    }).translate(0, 0, -depth / 2),
  );
}
function materials(game) {
  if (game.meridianConsoleMaterials) return game.meridianConsoleMaterials;
  const stone = game.observatoryMaterials?.dark
      ? game.observatoryMaterials.dark.clone()
      : pbrMaterial("palace-stone", 0xabaea6),
    bronze = patinatedBronze(),
    ink = new THREE.MeshStandardMaterial({ color: 0x283236, roughness: 0.88 }),
    hands = new THREE.MeshStandardMaterial({
      color: 0xd2c29a,
      emissive: 0x938258,
      emissiveIntensity: 0.16,
      roughness: 0.66,
      metalness: 0.2,
    }),
    glass = new THREE.MeshStandardMaterial({
      color: 0xa8c2c1,
      roughness: 0.24,
      metalness: 0.05,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
  stone.name = "Meridian console dressed stone";
  stone.color.setHex(0xabaea6);
  stone.vertexColors = true;
  stone.normalScale.setScalar(0.18);
  bronze.name = "Meridian console worn bronze";
  bronze.color.multiplyScalar(0.83);
  bronze.roughness = 0.87;
  hands.name = "Meridian console engraved ivory hands";
  ink.name = "Meridian console recessed dial";
  glass.name = "Meridian console protective glass";
  return (game.meridianConsoleMaterials = { stone, bronze, ink, glass, hands });
}

// A convex envelope follows each closed structural part. Concave mouldings in
// the small foot use their outer hull; the physical support keeps every face.
function captureCamera(game, mesh, material) {
  if (!game.cameraSurfaces) return;
  const p = mesh.geometry.attributes.position,
    points = [],
    seen = new Set();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i),
      key = v
        .toArray()
        .map((x) => Math.round(x * 1e6))
        .join(",");
    if (!seen.has(key)) {
      seen.add(key);
      points.push(v);
    }
  }
  const hull = new ConvexGeometry(points),
    normal = hull.attributes.normal,
    position = hull.attributes.position,
    planes = [],
    keys = new Set();
  for (let i = 0; i < position.count; i += 3) {
    const n = new THREE.Vector3().fromBufferAttribute(normal, i).normalize(),
      v = new THREE.Vector3().fromBufferAttribute(position, i),
      plane = [...n.toArray(), n.dot(v)],
      key = plane.map((x) => Math.round(x * 1e6)).join(",");
    if (!keys.has(key)) {
      keys.add(key);
      planes.push(plane);
    }
  }
  const proxy = new THREE.Mesh(hull, material);
  proxy.position.copy(mesh.position);
  mesh.parent.add(proxy);
  game.cameraSurfaces.capture(proxy, { small: true, thin: true, planes });
  mesh.parent.remove(proxy);
  hull.dispose();
}

export function buildMeridianConsole(game, feature, group) {
  if (game.level.biome !== "eclipse" || feature.stage < 1) return false;
  const stage = feature.stage,
    profile = PROFILES[stage - 1];
  if (!profile) throw new RangeError(`Unknown Meridian console ${stage}`);
  const m = materials(game),
    root = new THREE.Group(),
    solids = [],
    needles = [],
    floor = courtWalkingHeight(game, group.position.x, group.position.z),
    offset = floor - group.position.y;
  root.name = profile[0];
  root.position.y = offset;
  group.add(root);
  const add = (
    geometry,
    material,
    x = 0,
    y = 0,
    z = 0,
    physical = true,
    parent = root,
  ) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== m.glass;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (physical) {
      solids.push(mesh);
      captureCamera(game, mesh, m.stone);
    }
    return mesh;
  };
  const block = (w, h, d, x, y, z, material = m.stone) =>
    add(projected(new THREE.BoxGeometry(w, h, d)), material, x, y, z);
  const foot = orreryPedestalGeometry(stage + 1, -0.08, 1).scale(0.5, 1, 0.5);
  projectStoneUVs(foot);
  add(foot, m.stone);
  add(
    panel(
      profile[1].map(([x, y]) => [x * 1.025, 1.8 + (y - 1.8) * 1.035]),
      0.56,
    ),
    m.bronze,
  );
  add(panel(profile[1]), m.stone);
  // Individual celestial crowns distinguish the instruments from their bases.
  if (stage === 1) {
    for (const x of [-0.65, 0, 0.65])
      block(0.17, 0.48, 0.24, x, 2.65, 0, m.bronze);
  } else if (stage === 2) {
    for (const side of [-1, 1])
      add(
        panel(
          [
            [side * 0.85, 2.42],
            [side * 1.4, 2.28],
            [side * 1.55, 3.08],
            [side * 1.18, 2.8],
          ],
          0.35,
        ),
        m.stone,
      );
  } else if (stage === 3) {
    for (let i = 0; i < 7; i++)
      block(
        0.3,
        0.3 + (0.35 - Math.abs(i - 3) * 0.07),
        0.4,
        (i - 3) * 0.44,
        2.55,
        0,
      );
  } else if (stage === 4) {
    add(
      projected(
        new THREE.CylinderGeometry(0.42, 0.42, 0.16, 32).rotateX(Math.PI / 2),
      ),
      m.bronze,
      0,
      2.65,
      0,
    );
    for (let i = 0; i < 8; i++)
      add(
        projected(
          new THREE.BoxGeometry(0.11, 0.24, 0.14)
            .translate(0, 0.52, 0)
            .rotateZ((i * Math.PI) / 4),
        ),
        m.bronze,
        0,
        2.65,
        0,
      );
  } else if (stage === 5) {
    block(3.8, 0.16, 0.78, 0, 2.39, 0);
    for (const x of [-1.5, 1.5]) block(0.3, 0.35, 0.4, x, 2.62, 0);
  } else if (stage === 6) {
    const star = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8,
        r = i % 2 ? 0.12 : 0.27;
      return [Math.sin(a) * r, Math.cos(a) * r + 2.67];
    });
    add(panel(star, 0.05), m.bronze, 0, 0, 0.36);
  } else if (stage === 7) {
    for (const x of [-0.85, 0, 0.85])
      block(0.055, 0.42, 0.045, x, 2.34, 0.37, m.bronze);
    block(1.75, 0.055, 0.045, 0, 2.53, 0.37, m.bronze);
  } else if (stage === 8) {
    for (let i = 0; i < 3; i++)
      block(3.45 - i * 0.28, 0.17, 0.78, 0, 2.5 + i * 0.17, 0);
  } else {
    for (const x of [-0.85, 0, 0.85]) {
      block(0.32, 0.63, 0.44, x, 2.71, 0);
      block(0.045, 0.55, 0.04, x, 2.72, 0.245, m.bronze);
    }
  }
  const state = observatoryState(game.level, game.progress, stage + 1);
  for (let dial = 0; dial < 3; dial++) {
    const x = (dial - 1) * 0.85,
      y = 1.82;
    add(
      projected(
        new THREE.CylinderGeometry(0.33, 0.33, 0.045, 32).rotateX(Math.PI / 2),
      ),
      m.ink,
      x,
      y,
      0.355,
    );
    add(
      projected(new THREE.TorusGeometry(0.345, 0.055, 8, 32)),
      m.bronze,
      x,
      y,
      0.435,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add(
        projected(new THREE.BoxGeometry(0.018, 0.05, 0.012).rotateZ(-a)),
        m.hands,
        x + Math.sin(a) * 0.267,
        y + Math.cos(a) * 0.267,
        0.392,
        false,
      );
    }
    const needle = new THREE.Group();
    needle.position.set(x, y, 0.415);
    needle.userData.animated = true;
    root.add(needle);
    add(
      projected(
        new THREE.BoxGeometry(0.035, 0.23, 0.018).translate(0, 0.095, 0),
      ),
      m.hands,
      0,
      0,
      0,
      false,
      needle,
    );
    needles.push(needle);
    const a = (state.target[dial] * Math.PI) / 4;
    add(
      projected(new THREE.SphereGeometry(0.027, 8, 6)),
      m.hands,
      x + Math.sin(a) * 0.27,
      y + Math.cos(a) * 0.27,
      0.41,
      false,
    );
    // Needles and reference pins are sealed behind the physical glass cover.
    add(
      projected(
        new THREE.CylinderGeometry(0.315, 0.315, 0.025, 32).rotateX(
          Math.PI / 2,
        ),
      ),
      m.glass,
      x,
      y,
      0.46,
    );
  }
  const physical = stationAssemblySolid(game, feature, solids, {
    bodyPadding: 0.55,
    supportRadius: 0.14,
    descentEscapeRadius: 2.55,
  });
  physical.meridianConsole = stage;
  feature.fixedCore = true;
  feature.core = new THREE.Group();
  feature.core.position.set(0, offset + 1.7, 0);
  group.add(feature.core);
  feature.markerHeight = offset + 3.8;
  feature.soundAnchor = new THREE.Vector3(
    group.position.x,
    floor + 1.82,
    group.position.z + 1.15,
  );
  const console = {
    stage,
    root,
    feature,
    needles,
    physical,
    floor,
    profile: profile[0],
    structuralParts: solids.length,
    target: [...state.target],
  };
  (game.meridianConsoles ||= []).push(console);
  mergeArchitecture(root);
  updateMeridianConsoles(game);
  return true;
}

export function updateMeridianConsoles(game) {
  const records = normalizeAlignments(game.progress.alignments);
  for (const console of game.meridianConsoles || []) {
    const values =
      game.progress.completed || game.progress.stage > console.stage
        ? console.target
        : records[console.stage]?.values || [0, 0, 0];
    if (console.displayValues?.every((v, i) => v === values[i])) continue;
    for (let i = 0; i < 3; i++)
      console.needles[i].rotation.z = (-values[i] * Math.PI) / 4;
    console.displayValues = [...values];
  }
}
