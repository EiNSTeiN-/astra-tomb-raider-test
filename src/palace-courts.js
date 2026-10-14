import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { mergeArchitecture } from "./visuals.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { palaceRoofCells, palaceRoofHeight } from "./palace-court-plan.js";
import { HYDRAULIC_TRIALS } from "./hydraulic-rules.js";

function heightPrism(cell, bottom, top) {
  const { x0, x1, z0, z1 } = cell,
    corners = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    low = corners.map(([x, z]) => [x, bottom(x, z), z]),
    high = corners.map(([x, z]) => [x, top(x, z), z]),
    positions = [],
    uv = [];
  const quad = (a, b, c, d) => {
    const normal = new THREE.Vector3(...b)
        .sub(new THREE.Vector3(...a))
        .cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a))),
      axes =
        Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))
          ? [0, 2]
          : Math.abs(normal.x) > Math.abs(normal.z)
            ? [2, 1]
            : [0, 1];
    for (const p of [a, b, c, a, c, d]) {
      positions.push(...p);
      uv.push(p[axes[0]] / 2, p[axes[1]] / 2);
    }
  };
  quad(high[0], high[3], high[2], high[1]);
  quad(low[0], low[1], low[2], low[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(low[i], high[i], high[j], low[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function palaceRoofCellGeometry(roof, spring, cell, skin = false) {
  const inset = skin
      ? Math.min(0.006, (cell.x1 - cell.x0) * 0.12, (cell.z1 - cell.z0) * 0.12)
      : 0,
    box = {
      x0: cell.x0 + inset,
      x1: cell.x1 - inset,
      z0: cell.z0 + inset,
      z1: cell.z1 - inset,
    };
  const coreTop = (x, z) => {
    const alongX = roof.axis === "x",
      t = alongX
        ? (x - cell.x0) / (cell.x1 - cell.x0)
        : (z - cell.z0) / (cell.z1 - cell.z0),
      a = palaceRoofHeight(roof, spring, cell.x0, cell.z0, true),
      b = palaceRoofHeight(
        roof,
        spring,
        alongX ? cell.x1 : cell.x0,
        alongX ? cell.z0 : cell.z1,
        true,
      );
    return a + (b - a) * t;
  };
  return heightPrism(
    box,
    (x, z) =>
      skin ? coreTop(x, z) - 0.025 : palaceRoofHeight(roof, spring, x, z),
    (x, z) =>
      skin ? coreTop(x, z) + 0.1 : palaceRoofHeight(roof, spring, x, z, true),
  );
}

// The roof is constant along its other axis. Coalesce only contiguous solid
// runs on that axis; a light opening must never receive a camera box.
export function palaceRoofCameraRuns(roof, cells) {
  const alongX = roof.axis === "x",
    groups = new Map(),
    runs = [];
  for (const cell of cells) {
    const key = alongX ? `${cell.x0}/${cell.x1}` : `${cell.z0}/${cell.z1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (alongX ? a.z0 - b.z0 : a.x0 - b.x0));
    let run;
    for (const c of group) {
      if (
        run &&
        (alongX ? Math.abs(run.z1 - c.z0) : Math.abs(run.x1 - c.x0)) < 1e-7
      ) {
        if (alongX) run.z1 = c.z1;
        else run.x1 = c.x1;
      } else {
        run = { ...c };
        runs.push(run);
      }
    }
  }
  return runs;
}

export function buildPalaceCourt(game, root, materials, plan, spring, tint) {
  const assembly = new THREE.Group();
  root.add(assembly);
  let serial = game.level.seed + 204107 + plan.index * 1709;
  const add = (geometry, material, x = 0, y = 0, z = 0, angle = 0) => {
    if (geometry.attributes.color) geometry.deleteAttribute("color");
    if (material.vertexColors) tint(geometry, ++serial);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    mesh.castShadow = mesh.receiveShadow = true;
    assembly.add(mesh);
    return mesh;
  };
  const block = (w, h, d, material, x, y, z, angle = 0) =>
    add(stoneBlockGeometry(w, h, d, ++serial, 0.018), material, x, y, z, angle);
  let cameraRuns = 0;
  const capture = (geometry, x = 0, y = 0, z = 0, angle = 0) => {
    const mesh = new THREE.Mesh(geometry, materials.stone);
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    root.add(mesh);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    root.remove(mesh);
    geometry.dispose();
    cameraRuns++;
  };
  const roofs = [];
  for (const roof of plan.roofs) {
    const cells = palaceRoofCells(roof),
      runs = palaceRoofCameraRuns(roof, cells);
    for (const cell of runs)
      add(palaceRoofCellGeometry(roof, spring, cell), materials.plaster);
    for (const cell of cells) {
      // The continuous perimeter cornice fully occupies these narrow skins.
      // Keep their closed bed, without rendering a second hidden stone layer.
      if (
        cell.x1 <= roof.minX + 0.3 ||
        cell.x0 >= roof.maxX - 0.3 ||
        cell.z1 <= roof.minZ + 0.3 ||
        cell.z0 >= roof.maxZ - 0.3
      )
        continue;
      add(palaceRoofCellGeometry(roof, spring, cell, true), materials.stone);
    }
    for (const cell of runs)
      capture(
        heightPrism(
          cell,
          (x, z) => palaceRoofHeight(roof, spring, x, z),
          (x, z) => palaceRoofHeight(roof, spring, x, z, true) + 0.1,
        ),
      );
    // Dressed perimeter bands fit the same grid and sit on the column heads.
    const edges = [
      { x0: roof.minX, x1: roof.minX + 0.3, z0: roof.minZ, z1: roof.maxZ },
      { x0: roof.maxX - 0.3, x1: roof.maxX, z0: roof.minZ, z1: roof.maxZ },
      { x0: roof.minX, x1: roof.maxX, z0: roof.minZ, z1: roof.minZ + 0.3 },
      { x0: roof.minX, x1: roof.maxX, z0: roof.maxZ - 0.3, z1: roof.maxZ },
      ...roof.holes.flatMap(([a, b, c, d]) => [
        { x0: a - 0.12, x1: a + 0.12, z0: c - 0.12, z1: d + 0.12 },
        { x0: b - 0.12, x1: b + 0.12, z0: c - 0.12, z1: d + 0.12 },
        { x0: a, x1: b, z0: c - 0.12, z1: c + 0.12 },
        { x0: a, x1: b, z0: d - 0.12, z1: d + 0.12 },
      ]),
    ];
    const unique = (values) =>
      [...new Map(values.map((v) => [Math.round(v * 1e6), v])).values()].sort(
        (a, b) => a - b,
      );
    for (const edge of edges) {
      const xs = unique([
          edge.x0,
          edge.x1,
          ...(roof.axis === "x"
            ? cells
                .flatMap((c) => [c.x0, c.x1])
                .filter((x) => x > edge.x0 && x < edge.x1)
            : []),
        ]),
        zs = unique([
          edge.z0,
          edge.z1,
          ...(roof.axis === "z"
            ? cells
                .flatMap((c) => [c.z0, c.z1])
                .filter((z) => z > edge.z0 && z < edge.z1)
            : []),
        ]);
      for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++) {
          const cell = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
          add(
            heightPrism(
              cell,
              (x, z) => palaceRoofHeight(roof, spring, x, z, true) - 0.03,
              (x, z) => palaceRoofHeight(roof, spring, x, z, true) + 0.2,
            ),
            materials.dark,
          );
        }
    }
    roofs.push({ ...roof, cells, cameraRuns: runs.length });
  }
  const walls = [];
  for (const wall of plan.walls) {
    const c = Math.cos(wall.angle),
      s = Math.sin(wall.angle),
      point = (u, depth = 0) => ({
        x: wall.x + u * c + depth * s,
        z: wall.z - u * s + depth * c,
      }),
      minimum =
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          root.position.x + wall.x,
          root.position.z + wall.z,
          Math.abs(c) * wall.length + Math.abs(s) * 1.06,
          Math.abs(s) * wall.length + Math.abs(c) * 1.06,
          game.terrainProfile?.step || 1.75,
        ) -
        root.position.y -
        0.18,
      lo = -wall.length / 2,
      hi = wall.length / 2,
      a = wall.door - wall.doorWidth / 2,
      b = wall.door + wall.doorWidth / 2,
      head = 3.9,
      spans = [
        [lo, a, minimum, wall.height],
        [b, hi, minimum, wall.height],
      ];
    if (wall.height > head) spans.push([a, b, head, wall.height]);
    for (const [start, end, bottom, top] of spans) {
      const p = point((start + end) / 2);
      add(
        new THREE.BoxGeometry(end - start, top - bottom, 0.9),
        materials.stone,
        p.x,
        (top + bottom) / 2,
        p.z,
        wall.angle,
      );
      capture(
        new THREE.BoxGeometry(end - start, top - bottom, 1.16),
        p.x,
        (top + bottom) / 2,
        p.z,
        wall.angle,
      );
      for (let y = bottom; y < top; y += 0.88)
        for (let x = start; x < end; x += 2.1) {
          const x1 = Math.min(end, x + 2.1),
            y1 = Math.min(top, y + 0.88),
            q = point((x + x1) / 2);
          if (x1 - x < 0.03 || y1 - y < 0.03) continue;
          block(
            x1 - x - 0.018,
            y1 - y - 0.014,
            1.0,
            materials.stone,
            q.x,
            (y + y1) / 2,
            q.z,
            wall.angle,
          );
        }
      if (end - start > 2.3 && wall.height > 3.2 && bottom < 1) {
        for (const facing of [-1, 1]) {
          const q = point((start + end) / 2, facing * 0.5);
          block(
            Math.min(2.3, end - start - 0.7),
            1.6,
            0.08,
            materials.plaster,
            q.x,
            2.4,
            q.z,
            wall.angle,
          );
          const measures = HYDRAULIC_TRIALS[plan.index - 1]?.capacity ?? [
              8, 5, 3,
            ],
            center = (start + end) / 2;
          for (const [i, value] of measures.entries()) {
            const height = 0.22 + (0.76 * value) / measures[0],
              mark = point(center + facing * (i - 1) * 0.58, facing * 0.555);
            add(
              new THREE.BoxGeometry(0.065, height, 0.04),
              materials.stone,
              mark.x,
              1.96 + height / 2,
              mark.z,
              wall.angle,
            );
          }
          for (const y of [1.9, 3.04]) {
            const mark = point(center, facing * 0.555);
            add(
              new THREE.BoxGeometry(1.76, 0.065, 0.04),
              materials.stone,
              mark.x,
              y,
              mark.z,
              wall.angle,
            );
          }
        }
      }
    }
    if (wall.kind === "window") {
      const p = point(wall.door),
        sill = 1.1;
      add(
        new THREE.BoxGeometry(wall.doorWidth, sill - minimum, 0.9),
        materials.stone,
        p.x,
        (sill + minimum) / 2,
        p.z,
        wall.angle,
      );
      capture(
        new THREE.BoxGeometry(wall.doorWidth, sill - minimum, 1.16),
        p.x,
        (sill + minimum) / 2,
        p.z,
        wall.angle,
      );
      add(
        new THREE.BoxGeometry(wall.doorWidth + 0.06, 0.15, 1.04),
        materials.dark,
        p.x,
        sill - 0.045,
        p.z,
        wall.angle,
      );
      for (const offset of [-1.05, 0, 1.05]) {
        const q = point(wall.door + offset);
        add(
          new THREE.BoxGeometry(0.16, head - sill, 0.98),
          materials.stone,
          q.x,
          (head + sill) / 2,
          q.z,
          wall.angle,
        );
        capture(
          new THREE.BoxGeometry(0.16, head - sill, 1.16),
          q.x,
          (head + sill) / 2,
          q.z,
          wall.angle,
        );
      }
    }
    walls.push({ ...wall, minimum, head, spans });
  }
  assembly.updateWorldMatrix(true, true);
  const triangles = assembly.children.reduce(
    (n, m) =>
      n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3,
    0,
  );
  mergeArchitecture(assembly);
  const feature = { id: `palace-court-${plan.index}` },
    solids = assembly.children.map((mesh) =>
      stationMeshSolid(game, feature, mesh, { bodyPadding: 0.65 }),
    );
  // The movement kernel has copied the closed construction. Fold its render
  // batches into the column assembly so the court still uses three materials.
  for (const mesh of [...assembly.children]) root.add(mesh);
  root.remove(assembly);
  return { name: plan.name, roofs, walls, solids, triangles, cameraRuns };
}
