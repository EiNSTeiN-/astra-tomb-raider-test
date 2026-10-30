import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";
import { desertRouteDistance } from "./desert-geology.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { volcanicBoulderMaterial } from "./volcanic-material.js";
import { stationAssemblySolid } from "./field-station-solids.js";

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));

function clip(polygon, a, b, c) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length];
    const u = a * p[0] + b * p[1] - c,
      v = a * q[0] + b * q[1] - c;
    if (u <= 0) out.push(p);
    if ((u < 0 && v > 0) || (u > 0 && v < 0)) {
      const t = u / (u - v);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// Neighboring cooling columns share a clipped cell boundary. Shrinking each
// cell leaves a narrow joint without intersecting or independently floating slabs.
export function basaltCells(seed, length, width) {
  const rng = random(seed),
    seeds = [];
  const spacing = 1.65;
  for (let row = -3; row <= 3; row++)
    for (let col = -9; col <= 9; col++) {
      const x =
        (col + (Math.abs(row) % 2) * 0.5) * spacing + (rng() - 0.5) * 0.45;
      const z = row * spacing * 0.866 + (rng() - 0.5) * 0.4;
      if ((x / length) ** 2 + (z / width) ** 2 < 1) seeds.push([x, z]);
    }
  const boundary = Array.from({ length: 16 }, (_, i) => [
    Math.cos((i * TAU) / 16) * length,
    Math.sin((i * TAU) / 16) * width,
  ]);
  return seeds
    .map((p, i) => {
      let polygon = boundary.map((v) => [...v]);
      for (let j = 0; j < seeds.length && polygon.length; j++) {
        if (i === j) continue;
        const q = seeds[j];
        polygon = clip(
          polygon,
          q[0] - p[0],
          q[1] - p[1],
          (q[0] ** 2 + q[1] ** 2 - p[0] ** 2 - p[1] ** 2) / 2,
        );
      }
      const center = [0, 1].map(
        (axis) => polygon.reduce((sum, v) => sum + v[axis], 0) / polygon.length,
      );
      return {
        center,
        polygon: polygon.map((v) => [
          center[0] + (v[0] - center[0]) * 0.973,
          center[1] + (v[1] - center[1]) * 0.973,
        ]),
        height: 0.6 + rng() * 0.4,
        tone: 0.77 + rng() * 0.23,
        phase: rng(),
      };
    })
    .filter((c) => c.polygon.length >= 3);
}

function focusClear(map, x, z, radius) {
  return !map.features.some(
    (f) =>
      f.type === "mechanism" &&
      x > f.x * 7 - radius &&
      x < f.x * 7 + 27 + radius &&
      z > f.z * 7 + 9 - radius &&
      z < f.z * 7 + 69 + radius,
  );
}

export function volcanicOutcropPlan(game) {
  if (game.level.biome !== "volcano") return [];
  const { map, level } = game,
    plans = [];
  for (const room of map.rooms) {
    const rng = random(level.seed + room.index * 997 + 90317);
    const long = 7.5 + rng() * 3,
      wide = 3.4 + rng() * 1.1;
    const seed = level.seed + room.index * 137 + 87131;
    const desired = (room.index % 2 ? -1 : 1) * (1.2 + rng() * 0.7);
    const peak = 10 + rng() * 6;
    let selected;
    for (const scale of [1, 0.65]) {
      const length = long * scale,
        width = wide * scale,
        cells = basaltCells(seed, length, width);
      for (const radius of [36, 43, 50, 58]) {
        for (const offset of [
          0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.4,
        ]) {
          const angle = desired + offset,
            yaw = angle + Math.PI / 2;
          const x = room.x * 7 + Math.sin(angle) * radius,
            z = room.z * 7 + Math.cos(angle) * radius;
          if (
            plans.some(
              (p) => Math.hypot(x - p.x, z - p.z) < length + p.length + 10,
            )
          )
            continue;
          if (
            !natureRockAllowed(game, x, z, length + 1) ||
            !focusClear(map, x, z, length)
          )
            continue;
          const transform = ([a, b]) => [
            x + a * Math.cos(yaw) - b * Math.sin(yaw),
            z + a * Math.sin(yaw) + b * Math.cos(yaw),
          ];
          const footprint = cells.flatMap((c) => c.polygon.map(transform));
          if (footprint.some(([a, b]) => desertRouteDistance(map, a, b) < 7.2))
            continue;
          selected = {
            room: room.index,
            x,
            z,
            yaw,
            length,
            width,
            seed,
            peak: peak * scale,
            cells: cells.map((c) => ({
              ...c,
              center: transform(c.center),
              polygon: c.polygon.map(transform),
            })),
          };
          break;
        }
        if (selected) break;
      }
      if (selected) break;
    }
    if (selected) plans.push(selected);
  }
  return plans;
}

export function basaltColumnGeometry(cell, plan, profile) {
  const [cx, cz] = cell.center,
    vertices = cell.polygon;
  // The minimum over every lattice vertex in the surrounding rectangle bounds
  // the complete piecewise planar ground beneath this convex footprint.
  const xs = vertices.map((p) => p[0]),
    zs = vertices.map((p) => p[1]),
    step = profile.step;
  let bottom = Infinity,
    ground = -Infinity;
  for (
    let z = Math.floor(Math.min(...zs) / step) * step;
    z <= Math.ceil(Math.max(...zs) / step) * step;
    z += step
  )
    for (
      let x = Math.floor(Math.min(...xs) / step) * step;
      x <= Math.ceil(Math.max(...xs) / step) * step;
      x += step
    ) {
      const h = profile.surfaceHeight(x, z);
      bottom = Math.min(bottom, h);
      ground = Math.max(ground, h);
    }
  bottom -= 0.4;
  const dx = cx - plan.x,
    dz = cz - plan.z,
    along = (dx * Math.cos(plan.yaw) + dz * Math.sin(plan.yaw)) / plan.length;
  const across =
    (-dx * Math.sin(plan.yaw) + dz * Math.cos(plan.yaw)) / plan.width;
  const shoulder =
    Math.pow(clamp(1 - along * along), 0.6) *
    (0.35 + 0.65 * clamp(1 - Math.abs(across + 0.18) * 0.7));
  const top = ground + 2.2 + plan.peak * shoulder * cell.height;
  const span = top - bottom;
  const rings = [
    [0, 0.96],
    [0.015, 1],
  ];
  for (const t of [
    0.28 + cell.phase * 0.06,
    0.58 + cell.phase * 0.06,
    0.82 + cell.phase * 0.04,
  ])
    rings.push([t - 0.004, 1], [t, 0.976], [t + 0.004, 1]);
  rings.push([0.986, 1], [1, 0.91]);
  const positions = [],
    uv = [],
    colors = [];
  const point = (i, ring) => {
    const p = vertices[i],
      t = ring[0],
      scale = ring[1];
    return [
      cx + (p[0] - cx) * scale,
      bottom + span * t + (p[0] - cx) * 0.12 * t + (p[1] - cz) * 0.08 * t,
      cz + (p[1] - cz) * scale,
    ];
  };
  const emit = (a, b, c, cap = false) => {
    const normal = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...c),
          new THREE.Vector3(...a),
        ),
      );
    const axes = cap
      ? [0, 2]
      : Math.abs(normal.x) > Math.abs(normal.z)
        ? [2, 1]
        : [0, 1];
    for (const p of [a, b, c]) {
      positions.push(...p);
      uv.push(p[axes[0]] * 0.4, p[axes[1]] * 0.4);
      const tone = cell.tone * (cap ? 1.12 : 1);
      colors.push(tone, tone, tone);
    }
  };
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length,
        a = point(i, rings[r]),
        b = point(j, rings[r]),
        c = point(j, rings[r + 1]),
        d = point(i, rings[r + 1]);
      emit(a, c, b);
      emit(a, d, c);
    }
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    emit([cx, bottom, cz], point(i, rings[0]), point(j, rings[0]), true);
    emit([cx, top, cz], point(j, rings.at(-1)), point(i, rings.at(-1)), true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { bottom, top, ground };
  return geometry;
}

export function buildVolcanicOutcrops(game) {
  game.volcanicOutcrops = null;
  if (game.level.biome !== "volcano") return;
  const plans = volcanicOutcropPlan(game),
    material = volcanicBoulderMaterial(game.darkMat);
  material.name = "Fractured basalt columns";
  material.vertexColors = true;
  const clusters = [];
  for (const plan of plans) {
    const root = new THREE.Group();
    root.name = `Basalt escarpment ${plan.room}`;
    game.world.add(root);
    const parts = plan.cells.map((cell) => {
      const mesh = new THREE.Mesh(
        basaltColumnGeometry(cell, plan, game.terrainProfile),
        material,
      );
      root.add(mesh);
      game.cameraSurfaces.capture(mesh, { small: true, thin: true });
      return mesh;
    });
    root.updateWorldMatrix(true, true);
    const solid = stationAssemblySolid(
      game,
      { id: `basalt-escarpment-${plan.room}` },
      parts,
      { bodyPadding: 0.65 },
    );
    const geometry = mergeGeometries(
      parts.map((p) => p.geometry),
      false,
    );
    for (const part of parts) {
      root.remove(part);
      part.geometry.dispose();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    clusters.push({ plan, root, mesh, solid });
  }
  game.volcanicOutcrops = { clusters, material };
}
