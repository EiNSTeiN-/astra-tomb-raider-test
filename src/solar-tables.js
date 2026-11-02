import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import {
  solarInstrumentMaterials,
  solarPlateGeometry,
  solarCastingGeometry,
} from "./solar-instrument-art.js";
import { courtWalkingHeight } from "./court-dais-rules.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { projectStoneUVs } from "./stone-uv.js";
import { createPuzzle } from "./puzzles.js";
import { mergeArchitecture } from "./visuals.js";

const STYLES = [
  "Dawn piers",
  "Aqueduct arcade",
  "Noon drum",
  "Ephemeris courses",
  "Eastern pylons",
  "Light-well trestle",
  "Circuit colonnade",
  "Sepulchral coffer",
];
const TILT = 0.18,
  DECK = 1.12;
const mapPoint = ({ x, y }) =>
  new THREE.Vector3((x - 2.5) * 0.38, 0.14, (y - 2.5) * 0.33);

function materials(game) {
  if (game.solarTableMaterials) return game.solarTableMaterials;
  const m = solarInstrumentMaterials(game);
  m.stone.color.setHex(0xc4ad87);
  m.stone.name = "Optical table sandstone";
  m.bronze.roughness = 0.72;
  m.ink = new THREE.MeshStandardMaterial({
    name: "Optical chart enamel",
    color: 0x263a3c,
    roughness: 0.78,
  });
  m.mirror = new THREE.MeshStandardMaterial({
    name: "Optical chart mirror marks",
    color: 0xe1d4ad,
    metalness: 0.35,
    roughness: 0.58,
  });
  m.light = new THREE.MeshStandardMaterial({
    name: "Optical chart sunlight",
    color: 0xd9b569,
    emissive: 0xb58b37,
    emissiveIntensity: 0.45,
    roughness: 0.65,
  });
  m.glass = new THREE.MeshStandardMaterial({
    name: "Optical chart protective glass",
    color: 0xbcd3d0,
    transparent: true,
    opacity: 0.12,
    roughness: 0.26,
    depthWrite: false,
  });
  return (game.solarTableMaterials = m);
}

// Retain convex camera skins before static batching releases the source mesh.
// Separate legs keep the real open spaces underneath each table.
function cameraPart(game, mesh, opaque) {
  if (!game.cameraSurfaces) return;
  const p = mesh.geometry.attributes.position,
    unique = new Map();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    unique.set(
      v
        .toArray()
        .map((x) => Math.round(x * 1e6))
        .join(","),
      v,
    );
  }
  const hull = new ConvexGeometry([...unique.values()]),
    planes = [],
    seen = new Set();
  for (let i = 0; i < hull.attributes.position.count; i += 3) {
    const n = new THREE.Vector3().fromBufferAttribute(
        hull.attributes.normal,
        i,
      ),
      v = new THREE.Vector3().fromBufferAttribute(hull.attributes.position, i),
      plane = [...n.toArray(), n.dot(v)],
      key = plane.map((x) => Math.round(x * 1e6)).join(",");
    if (!seen.has(key)) {
      seen.add(key);
      planes.push(plane);
    }
  }
  const proxy = new THREE.Mesh(hull, opaque);
  proxy.position.copy(mesh.position);
  proxy.quaternion.copy(mesh.quaternion);
  mesh.parent.add(proxy);
  game.cameraSurfaces.capture(proxy, { small: true, thin: true, planes });
  mesh.parent.remove(proxy);
  hull.dispose();
}

export function buildSolarTable(game, feature, group) {
  if (game.level.biome !== "desert" || feature.stage < 1) return false;
  const stage = feature.stage,
    style = STYLES[stage - 1];
  if (!style) throw new RangeError(`Unknown optical table ${stage}`);
  const m = materials(game),
    root = new THREE.Group(),
    structural = [],
    floor = courtWalkingHeight(game, group.position.x, group.position.z),
    offset = floor - group.position.y;
  root.name = `Optical table: ${style}`;
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
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== m.glass;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (physical && parent !== root) {
      // Support kernels require upright placement matrices. Bake the deck's
      // slope into its geometry; its exact rendered triangles remain physical.
      parent.updateMatrix();
      mesh.updateMatrix();
      geometry.applyMatrix4(parent.matrix.clone().multiply(mesh.matrix));
      mesh.position.set(0, 0, 0);
      root.add(mesh);
    }
    projectStoneUVs(geometry);
    if (physical) {
      structural.push(mesh);
      cameraPart(game, mesh, m.stone);
    }
    return mesh;
  };
  const box = (w, h, d, x, y, z, material = m.stone) =>
    add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const pier = (w, d, x, z, bottom = 0.14) => {
    const geometry = new THREE.BoxGeometry(w, 1, d),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(
        i,
        p.getY(i) < 0
          ? bottom
          : DECK -
              (p.getZ(i) + z) * Math.tan(TILT) -
              0.12 / Math.cos(TILT) +
              0.02,
      );
    geometry.computeVertexNormals();
    return add(geometry, m.stone, x, 0, z);
  };
  // Feet enter the raised paving; the eight supports have different silhouettes.
  const width = stage === 5 ? 3.65 : stage === 8 ? 3.55 : 3.4;
  box(width, 0.24, 2.35, 0, 0.04, 0);
  box(width - 0.12, 0.07, 2.23, 0, 0.195, 0, m.bronze);
  if (stage === 1) for (const x of [-1.12, 1.12]) pier(0.46, 1.65, x, 0);
  else if (stage === 2) {
    for (const x of [-1.18, 0, 1.18]) pier(0.33, 0.9, x, 0);
    box(2.75, 0.16, 0.95, 0, 0.4, 0);
  } else if (stage === 3) {
    const geometry = solarCastingGeometry([
        [0, 0.2],
        [0.85, 0.2],
        [0.85, 0.32],
        [0.66, 0.44],
        [0.59, 0.98],
        [0.75, 1.1],
        [0.75, 1.2],
        [0, 1.2],
      ]),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i),
        shortening = Math.max(0, (y - 0.44) / 0.76) * (1.3 - DECK);
      p.setY(
        i,
        y -
          shortening -
          (y > 0.9
            ? p.getZ(i) * Math.tan(TILT) * Math.min(1, (y - 0.9) / 0.2)
            : 0),
      );
    }
    geometry.computeVertexNormals();
    add(geometry, m.stone);
  } else if (stage === 4) {
    for (let i = 0; i < 3; i++)
      box(2.8 - i * 0.42, 0.22, 1.6 - i * 0.25, 0, 0.32 + i * 0.21, 0);
    pier(1.7, 0.8, 0, 0, 0.65);
  } else if (stage === 5) {
    for (const x of [-1.18, 1.18]) {
      pier(0.6, 1.3, x, 0);
      box(0.65, 0.1, 1.36, x, 0.32, 0, m.bronze);
    }
  } else if (stage === 6) {
    for (const x of [-1.13, 1.13])
      for (const z of [-0.62, 0.62]) pier(0.32, 0.34, x, z);
    for (const x of [-1.13, 1.13]) box(0.35, 0.12, 1.6, x, 0.49, 0, m.bronze);
  } else if (stage === 7) {
    for (const x of [-1.1, 0, 1.1]) {
      pier(0.37, 1.15, x, 0);
      box(0.45, 0.1, 1.2, x, 0.31, 0, m.bronze);
    }
  } else {
    pier(2.75, 1.65, 0, 0);
    box(2.85, 0.12, 1.75, 0, 0.39, 0);
    for (const x of [-0.96, 0, 0.96])
      box(0.45, 0.26, 0.035, x, 0.72, 0.842, m.bronze);
  }
  // The sloping deck and glass enclose every moving miniature and light strip.
  const board = new THREE.Group();
  board.position.y = DECK;
  board.rotation.x = TILT;
  root.add(board);
  add(
    solarPlateGeometry(width + 0.12, 2.8, 0.24).rotateX(Math.PI / 2),
    m.stone,
    0,
    0,
    0,
    true,
    board,
  );
  // A fitted front frieze carries the city's sun mark below the chart.
  add(
    new THREE.BoxGeometry(3.15, 0.22, 0.12),
    m.stone,
    0,
    -0.16,
    1.29,
    true,
    board,
  );
  add(
    new THREE.CylinderGeometry(0.065, 0.065, 0.016, 24).rotateX(Math.PI / 2),
    m.bronze,
    0,
    -0.16,
    1.354,
    true,
    board,
  );
  for (let i = 0; i < stage + 5; i++) {
    const a = (i * Math.PI * 2) / (stage + 5);
    add(
      new THREE.BoxGeometry(0.014, 0.04, 0.012).rotateZ(-a),
      m.bronze,
      Math.sin(a) * 0.091,
      -0.16 + Math.cos(a) * 0.091,
      1.354,
      true,
      board,
    );
  }
  for (const x of [-0.91, 0.91])
    add(
      new THREE.BoxGeometry(1.15, 0.012, 0.012),
      m.bronze,
      x,
      -0.16,
      1.354,
      true,
      board,
    );
  add(new THREE.BoxGeometry(3.02, 0.025, 2.4), m.ink, 0, 0.132, 0, true, board);
  for (const x of [-1.54, 1.54])
    add(
      new THREE.BoxGeometry(0.09, 0.09, 2.55),
      m.bronze,
      x,
      0.164,
      0,
      true,
      board,
    );
  for (const z of [-1.23, 1.23])
    add(
      new THREE.BoxGeometry(3.17, 0.09, 0.09),
      m.bronze,
      0,
      0.164,
      z,
      true,
      board,
    );
  // Engraved coordinate strokes and mirror mounts are sealed inside the cover.
  for (let i = 0; i < 6; i++) {
    add(
      new THREE.BoxGeometry(0.003, 0.003, 1.65),
      m.bronze,
      (i - 2.5) * 0.38,
      0.147,
      0,
      false,
      board,
    );
    add(
      new THREE.BoxGeometry(1.9, 0.003, 0.003),
      m.bronze,
      0,
      0.147,
      (i - 2.5) * 0.33,
      false,
      board,
    );
  }
  for (let x = 0; x < 6; x++)
    for (let y = 0; y < 6; y++) {
      const p = mapPoint({ x, y });
      add(
        new THREE.BoxGeometry(0.035, 0.004, 0.035),
        m.bronze,
        p.x,
        0.148,
        p.z,
        false,
        board,
      );
    }
  const state = createPuzzle(game.level, stage),
    mirrors = [];
  for (const cell of state.mirrors) {
    const p = mapPoint(cell),
      pivot = new THREE.Group();
    pivot.position.set(p.x, 0.165, p.z);
    pivot.userData.animated = true;
    board.add(pivot);
    add(
      new THREE.BoxGeometry(0.18, 0.025, 0.025),
      m.mirror,
      0,
      0,
      0,
      false,
      pivot,
    );
    mirrors.push(pivot);
    add(
      new THREE.CylinderGeometry(0.052, 0.052, 0.012, 12),
      m.bronze,
      p.x,
      0.154,
      p.z,
      false,
      board,
    );
  }
  for (const cell of [state.start, state.end]) {
    const p = mapPoint(cell);
    add(
      new THREE.CylinderGeometry(0.07, 0.07, 0.018, 16),
      m.bronze,
      p.x,
      0.16,
      p.z,
      false,
      board,
    );
  }
  const light = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.008, 1),
    m.light,
    48,
  );
  light.name = "Current optical trace";
  light.userData.animated = true;
  light.count = 0;
  // An inactive chart starts with zero instances; its later illuminated route
  // must not inherit an empty, cached instancing bound.
  light.frustumCulled = false;
  light.castShadow = false;
  board.add(light);
  add(
    new THREE.BoxGeometry(3.02, 0.024, 2.4),
    m.glass,
    0,
    0.202,
    0,
    true,
    board,
  );
  const physical = stationAssemblySolid(game, feature, structural, {
    bodyPadding: 0.55,
    // A continuous sloping deck must support the full movement footprint,
    // including its uphill rim, until the trailing body clears an edge.
    supportRadius: 0.55,
    descentEscapeRadius: 2.55,
  });
  physical.solarTable = stage;
  feature.fixedCore = true;
  feature.core = new THREE.Group();
  group.add(feature.core);
  feature.markerHeight = offset + 2.65;
  // Keep the mechanical hum outside the stone and the glass enclosure.
  feature.soundAnchor = new THREE.Vector3(
    group.position.x,
    floor + 0.9,
    group.position.z + 1.8,
  );
  const table = {
    stage,
    root,
    board,
    mirrors,
    light,
    feature,
    physical,
    floor,
    style,
    structuralParts: structural.length,
    initial: [...state.values],
    target: [...state.target],
    signature: null,
  };
  (game.solarTables ||= []).push(table);
  mergeArchitecture(root);
  mergeArchitecture(board);
  updateSolarTables(game);
  return true;
}

export function updateSolarTables(game) {
  if (!game.solarTables?.length) return;
  const dummy = new THREE.Object3D();
  for (const table of game.solarTables) {
    const completed =
        game.progress.completed || game.progress.stage > table.stage,
      values = completed
        ? table.target
        : game.progress.solar?.[table.stage]?.values || table.initial,
      site = game.solarSites?.find((s) => s.feature === table.feature),
      angles = site
        ? site.mirrors.map((m) => m.pivot.rotation.y)
        : values.map((v) => (v ? -Math.PI / 4 : Math.PI / 4)),
      signature =
        values.join("") +
        ":" +
        (site?.signature || "") +
        ":" +
        angles.map((a) => a.toFixed(5)).join(",");
    if (table.signature === signature) continue;
    table.signature = signature;
    table.displayValues = [...values];
    table.mirrors.forEach((m, i) => (m.rotation.y = angles[i]));
    const segments = site?.active ? site.segments : [],
      mini = (p) =>
        new THREE.Vector3(
          (p.x * 0.38) / 3.2,
          0.183,
          ((p.z - 8.8 - 2.5 * 2.35) * 0.33) / 2.35,
        );
    table.light.count = Math.min(segments.length, 48);
    for (let i = 0; i < table.light.count; i++) {
      const a = mini(segments[i][0]),
        b = mini(segments[i][1]),
        d = b.clone().sub(a);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.position.y = 0.183;
      dummy.rotation.set(0, Math.atan2(-d.z, d.x), 0);
      dummy.scale.set(d.length(), 1, 0.012);
      dummy.updateMatrix();
      table.light.setMatrixAt(i, dummy.matrix);
    }
    table.light.instanceMatrix.needsUpdate = true;
    table.traceHit = site?.aligned || false;
  }
}
