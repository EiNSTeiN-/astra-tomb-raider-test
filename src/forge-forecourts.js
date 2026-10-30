import * as THREE from "three";
import {
  forgeForecourtPlan,
  forgeForecourtWalls,
} from "./forge-forecourt-plan.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { terrainInlayGeometry } from "./terrain-inlay.js";
import { mergeArchitecture } from "./visuals.js";

export function forgeForecourtAllowed(game, x, z, w, d) {
  const box = { x, z, w, d };
  if (
    !yardRouteClear(game.map, box, 2.1) ||
    !yardTraversalClear(game.traversalCourses || [], box)
  )
    return false;
  // Cover the fitted rectangle with overlapping probes. Its circumscribed
  // circle would reject long beds beside otherwise clear neighboring yards.
  const nx = Math.ceil(w),
    nz = Math.ceil(d);
  for (let iz = 0; iz <= nz; iz++)
    for (let ix = 0; ix <= nx; ix++) {
      const px = x - w / 2 + (w * ix) / nx,
        pz = z - d / 2 + (d * iz) / nz;
      if (
        !natureRockAllowed(game, px, pz, 0.8) ||
        !discoveryFoliageClear(game, px, pz, 0.8)
      )
        return false;
    }
  // Keep the entire thermal approach, including its focused camera, open.
  for (const f of game.map.features.filter((f) => f.type === "mechanism"))
    if (
      x + w / 2 + 1.5 > f.x * 7 &&
      x - w / 2 - 1.5 < f.x * 7 + 27 &&
      z + d / 2 + 1.5 > f.z * 7 + 9 &&
      z - d / 2 - 1.5 < f.z * 7 + 69
    )
      return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 12 + w / 2 &&
      Math.abs(z - gate.root.position.z) < 12 + d / 2
    )
      return false;
  return true;
}

function tint(geometry, shade) {
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(shade),
      3,
    ),
  );
  return geometry;
}

export function buildForgeForecourts(game) {
  game.forgeForecourts = [];
  if (game.level.biome !== "volcano") return;
  const stone = game.stoneMat.clone(),
    dark = game.darkMat.clone(),
    iron = game.forgeMetal.clone();
  stone.name = "Forecourt layered basalt";
  stone.color.multiplyScalar(1.35);
  dark.name = "Forecourt recessed joints";
  dark.color.setHex(0x36302c);
  iron.name = "Forecourt oxidized coping";
  iron.color.setHex(0xb09b7c);
  iron.roughness = 0.78;
  for (const m of [stone, dark, iron]) m.vertexColors = true;
  const originalPaving = game.stationYards
    ?.flatMap((y) => y.root.children)
    .find((o) => o.material?.name === "Worn court paving")?.material;
  const paving = originalPaving?.clone();
  if (paving) {
    paving.name = "Foundry worn aprons";
    paving.color.setHex(0xd6c7ad);
    paving.onBeforeCompile = originalPaving.onBeforeCompile;
    paving.customProgramCacheKey = originalPaving.customProgramCacheKey;
  }
  // Reserve against existing world objects, not a preceding piece of this same
  // joined enclosure. This keeps matching walls, caps and bearings together.
  const reservations = Object.create(game);
  const paved = game.stationYards?.flatMap((y) => y.paving || []) || [];
  let seed = game.level.seed + 192083;
  for (const room of game.map.rooms) {
    // Joined pieces within one enclosure may meet. Neighboring courts must
    // reserve their completed geometry before this court is fitted.
    reservations.obstacles = game.obstacles.slice();
    const root = new THREE.Group();
    root.name = `Foundry forecourts ${room.index}`;
    root.position.set(room.x * 7, 0, room.z * 7);
    game.world.add(root);
    const record = {
      room: room.index,
      root,
      plans: forgeForecourtPlan(room),
      walls: [],
      assemblies: [],
      paving: [],
      rejected: [],
      triangles: 0,
      materials: { stone, dark, iron, paving },
    };
    game.forgeForecourts.push(record);
    const extent = (x, z, w, d) => {
      const args = [
        root.position.x + x,
        root.position.z + z,
        w,
        d,
        game.terrainProfile.step,
      ];
      return {
        bottom: footprintMinimum(game.groundHeight.bind(game), ...args) - 0.18,
        high: -footprintMinimum((x, z) => -game.groundHeight(x, z), ...args),
      };
    };
    const allowed = (x, z, w, d) =>
      forgeForecourtAllowed(
        reservations,
        root.position.x + x,
        root.position.z + z,
        w,
        d,
      );
    const add = (w, h, d, x, y, z, material, parts) => {
      const mesh = new THREE.Mesh(
        tint(
          stoneBlockGeometry(w, h, d, ++seed, 0.015),
          0.87 + 0.09 * Math.sin(seed * 1.63),
        ),
        material,
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      parts.push(mesh);
      return mesh;
    };
    const retain = (parts, role, ceiling = false) => {
      if (!parts.length) return;
      for (const mesh of parts)
        game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
      const solid = stationAssemblySolid(
        game,
        { id: `forge-forecourt-${room.index}-${record.assemblies.length}` },
        parts,
        { bodyPadding: 0.72, supportRadius: 0.55, layeredSupport: true },
      );
      if (ceiling) solid.ceiling = true;
      solid.forgeForecourt = room.index;
      record.assemblies.push({ role, solid, parts: parts.length });
    };
    const wall = (p) => {
      const alongX = p.w > p.d,
        length = alongX ? p.w : p.d,
        count = Math.ceil(length / 3.1);
      for (let segment = 0; segment < count; segment++) {
        const span = length / count,
          offset = -length / 2 + (segment + 0.5) * span;
        const x = p.x + (alongX ? offset : 0),
          z = p.z + (alongX ? 0 : offset),
          w = alongX ? span : p.w,
          d = alongX ? p.d : span;
        if (!allowed(x, z, w + 0.15, d + 0.15)) {
          record.rejected.push({ x, z, w, d, role: "wall" });
          continue;
        }
        const { bottom, high } = extent(x, z, w, d),
          top = high + p.height,
          parts = [];
        add(
          w - 0.035,
          top - 0.16 - bottom,
          d - 0.035,
          x,
          (top - 0.16 + bottom) / 2,
          z,
          dark,
          parts,
        );
        const rows = Math.max(1, Math.ceil((top - 0.18 - bottom) / 0.42)),
          rise = (top - 0.18 - bottom) / rows;
        for (let row = 0; row < rows; row++) {
          const n = Math.ceil(span / 1.25),
            piece = span / n;
          for (let i = 0; i < n; i++) {
            const t = -span / 2 + (i + 0.5) * piece;
            add(
              alongX ? piece - 0.012 : w,
              rise - 0.012,
              alongX ? d : piece - 0.012,
              x + (alongX ? t : 0),
              bottom + (row + 0.5) * rise,
              z + (alongX ? 0 : t),
              stone,
              parts,
            );
          }
        }
        add(w + 0.1, 0.18, d + 0.1, x, top - 0.09, z, iron, parts);
        retain(parts, "wall");
        record.walls.push({ x, z, w, d, bottom, top, plan: p.plan });
      }
    };
    const channel = (plan, dx, width, depth, height) => {
      let x = plan.x + dx,
        z = plan.z;
      const candidate = [
        [0, 0],
        [-3, 0],
        [3, 0],
        [-6, 0],
        [6, 0],
        [0, -3],
        [0, 3],
      ].find(
        ([sx, sz]) =>
          Math.abs(dx + sx) + width / 2 < plan.width / 2 - 0.6 &&
          Math.abs(sz) + depth / 2 < plan.depth / 2 - 0.6 &&
          allowed(x + sx, z + sz, width + 0.25, depth + 0.25),
      );
      if (!candidate) {
        record.rejected.push({ x, z, w: width, d: depth, role: "channel" });
        return;
      }
      x += candidate[0];
      z += candidate[1];
      // A dry stone casting bed: open at its front, with a complete buried base.
      const { bottom, high } = extent(x, z, width, depth),
        base = high + 0.06,
        parts = [];
      add(width, base - bottom, depth, x, (base + bottom) / 2, z, dark, parts);
      for (const side of [-1, 1])
        add(
          0.34,
          height,
          depth,
          x + (side * (width - 0.34)) / 2,
          base + height / 2,
          z,
          stone,
          parts,
        );
      add(
        width,
        height,
        0.34,
        x,
        base + height / 2,
        z - depth / 2 + 0.17,
        stone,
        parts,
      );
      for (let j = 0; j < Math.floor(depth / 1.25); j++)
        add(
          width - 0.7,
          0.055,
          0.75,
          x,
          base + 0.0275,
          z - depth / 2 + 0.8 + j * 1.25,
          iron,
          parts,
        );
      retain(parts, "casting bed");
    };
    const gallery = (plan) => {
      let x = plan.x + plan.side * (plan.width / 2 - 3),
        z = plan.z;
      const w = 4.6,
        // The air court has two parallel approach paths, fourteen metres
        // apart. Its shorter shelter fits between them.
        d = room.index === 1 ? 7 : plan.depth - 7;
      const fit = [0, 2, 4, 6, 8, 10]
        .flatMap((inward) =>
          [0, -2, 2].map((dz) => [x - plan.side * inward, z + dz]),
        )
        .find(
          ([px, pz]) =>
            Math.abs(px - plan.x) + w / 2 + 0.2 < plan.width / 2 - 0.4 &&
            Math.abs(pz - plan.z) + d / 2 + 0.2 < plan.depth / 2 - 0.4 &&
            [-1, 1].every((sx) =>
              [-1, 1].every((sz) =>
                allowed(
                  px + sx * (w / 2 - 0.35),
                  pz + sz * (d / 2 - 0.35),
                  0.9,
                  0.9,
                ),
              ),
            ) &&
            yardTraversalClear(game.traversalCourses || [], {
              x: root.position.x + px,
              z: root.position.z + pz,
              w: w + 0.4,
              d: d + 0.4,
            }),
        );
      if (!fit) {
        record.rejected.push({ x, z, w, d, role: "gallery" });
        return;
      }
      [x, z] = fit;
      const { high } = extent(x, z, w, d),
        roof = high + 3.65,
        parts = [],
        overhead = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const px = x + sx * (w / 2 - 0.35),
            pz = z + sz * (d / 2 - 0.35),
            { bottom } = extent(px, pz, 0.7, 0.7);
          add(
            0.7,
            roof - bottom,
            0.7,
            px,
            (roof + bottom) / 2,
            pz,
            stone,
            parts,
          );
          for (const y of [roof - 1.25, roof - 0.28])
            add(0.77, 0.12, 0.77, px, y, pz, iron, parts);
        }
      for (let i = 0; i < Math.ceil(d / 0.9); i++) {
        const span = d / Math.ceil(d / 0.9),
          pz = z - d / 2 + (i + 0.5) * span;
        add(w + 0.4, 0.16, span - 0.008, x, roof + 0.08, pz, iron, overhead);
      }
      for (const sx of [-1, 1])
        add(
          0.22,
          0.32,
          d + 0.4,
          x + sx * (w / 2 - 0.2),
          roof - 0.16,
          z,
          iron,
          overhead,
        );
      retain(parts, "gallery piers");
      retain(overhead, "gallery roof", true);
    };
    const portal = (plan) => {
      const x = plan.x,
        z = plan.z + plan.depth / 2 - 4,
        w = 7.5;
      if (
        ![-1, 1].every((side) =>
          allowed(x + side * (w / 2 - 0.5), z, 1.2, 1.5),
        ) ||
        !yardTraversalClear(game.traversalCourses || [], {
          x: root.position.x + x,
          z: root.position.z + z,
          w: w,
          d: 1.5,
        })
      ) {
        record.rejected.push({ x, z, w, d: 1.5, role: "portal" });
        return;
      }
      const { high } = extent(x, z, w, 1.3),
        top = high + 4.3,
        parts = [],
        overhead = [];
      for (const side of [-1, 1]) {
        const px = x + side * (w / 2 - 0.5),
          { bottom } = extent(px, z, 1, 1.3);
        add(1, top - bottom, 1.3, px, (top + bottom) / 2, z, stone, parts);
        add(1.2, 0.22, 1.5, px, top - 0.11, z, iron, parts);
      }
      add(w, 0.4, 1.4, x, top + 0.2, z, stone, overhead);
      for (const side of [-1, 1])
        add(
          w * 0.44,
          0.24,
          1.5,
          x + side * w * 0.23,
          top + 0.52,
          z,
          iron,
          overhead,
        );
      retain(parts, "engine apron piers");
      retain(overhead, "engine apron lintel", true);
    };
    const pave = (x, z, w, d) => {
      if (!paving) return;
      const box = { x: root.position.x + x, z: root.position.z + z, w, d };
      if (
        paved.some(
          (p) =>
            Math.abs(box.x - p.x) < (w + p.w) / 2 + 0.01 &&
            Math.abs(box.z - p.z) < (d + p.d) / 2 + 0.01,
        )
      ) {
        record.rejected.push({ x, z, w, d, role: "paving" });
        return;
      }
      const geometry = terrainInlayGeometry(
        game.terrainProfile,
        box,
        root.position,
        Math.min(w, d) * 0.18,
      );
      tint(geometry, 0.96);
      const mesh = new THREE.Mesh(geometry, paving);
      mesh.receiveShadow = true;
      root.add(mesh);
      record.paving.push({ x, z, w, d });
      paved.push(box);
    };
    for (const plan of record.plans) {
      for (const p of forgeForecourtWalls(plan))
        wall({ ...p, plan: plan.index });
      if (plan.kind === "gallery") gallery(plan);
      if (plan.kind === "portal") portal(plan);
      if (plan.kind === "channels")
        for (const side of [-1, 1])
          channel(plan, side * plan.width * 0.25, 2.8, plan.depth - 9, 0.48);
      if (plan.kind === "casting")
        channel(plan, plan.side * plan.width * 0.22, 4.4, plan.depth - 8, 0.38);
      if (plan.kind === "basin")
        channel(plan, plan.side * plan.width * 0.18, 5.2, 6.4, 0.85);
      // Continuous aprons follow the real terrain instead of a separate flat
      // slab. Their shader wears the boundary back into the surrounding ash.
      pave(plan.x, plan.z, plan.width - 2, plan.depth - 2);
    }
    if (room.index === 0) pave(2, 17, 32, 10);
    else pave(5, 17, 38, 10);
    for (const mesh of root.children)
      record.triangles +=
        (mesh.geometry.index?.count ??
          mesh.geometry.attributes.position.count) / 3;
    mergeArchitecture(root, 1);
    for (const mesh of root.children)
      if (mesh.material === paving) mesh.castShadow = false;
  }
}
