import * as THREE from "three";
import { monasteryGardenPlan } from "./monastery-garden-layout.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { mergeArchitecture } from "./visuals.js";
import { patinatedBronze } from "./observatory-geometry.js";

export function monasteryGardenAllowed(game, x, z, w, d) {
  const radius = Math.hypot(w, d) / 2,
    box = { x, z, w, d };
  if (
    !yardRouteClear(game.map, box, 1.65) ||
    !yardTraversalClear(game.traversalCourses || [], box) ||
    !natureRockAllowed(game, x, z, radius) ||
    !discoveryFoliageClear(game, x, z, radius)
  )
    return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 10 + w / 2 &&
      Math.abs(z - gate.root.position.z) < 10 + d / 2
    )
      return false;
  for (const [site, width, depth] of [
    [game.map.frozenStair, 18, 18],
    [game.map.bellHoist, 27, 34],
  ])
    if (
      site &&
      Math.abs(x - site.x * 7) < width + w / 2 &&
      Math.abs(z - site.z * 7) < depth + d / 2
    )
      return false;
  return true;
}

function tint(geometry, value) {
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(value),
      3,
    ),
  );
  return geometry;
}

// Flat caps have no standing gaps or chipped edges outside their solid. The
// lower bevel still reads as dressed stone, and a recessed backing seals joints.
function capGeometry(w, h, d, seed) {
  const geometry = stoneBlockGeometry(w, h, d, seed, 0.02),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, Math.max(-w / 2, Math.min(w / 2, p.getX(i))));
    p.setZ(i, Math.max(-d / 2, Math.min(d / 2, p.getZ(i))));
    if (p.getY(i) > 0) p.setY(i, h / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildMonasteryGardens(game) {
  game.monasteryGardens = [];
  if (game.level.biome !== "snow") return;
  const original = game.monasteryMaterials,
    stone = original.stone.clone(),
    mortar = original.stone.clone(),
    snow = original.snow.clone(),
    plaster = original.plaster.clone(),
    wood = original.wood.clone(),
    bronze = patinatedBronze();
  stone.name = "Garden dressed stone";
  mortar.name = "Garden recessed backing";
  mortar.color.multiplyScalar(0.64);
  snow.name = "Garden settled snow";
  plaster.name = "Reliquary whitewash";
  wood.name = "Reliquary painted timber";
  wood.color.setHex(0x6f443c);
  bronze.name = "Reliquary bronze";
  bronze.roughness = 0.61;
  for (const material of [stone, mortar, snow, plaster, wood, bronze])
    material.vertexColors = true;
  let seed = game.level.seed + 78901;
  for (const room of game.map.rooms) {
    const root = new THREE.Group(),
      feature = { id: `monastery-garden-${room.index}` },
      record = {
        root,
        feature,
        room: room.index,
        plans: monasteryGardenPlan(room),
        walls: [],
        shrines: [],
        parts: 0,
        triangles: 0,
      };
    root.name = `Snow garden court ${room.index}`;
    root.position.set(room.x * 7, 0, room.z * 7);
    game.world.add(root);
    const ground = (x, z) =>
        game.groundHeight(root.position.x + x, root.position.z + z),
      add = (geometry, material, x, y, z, physical = true, climb = false) => {
        const mesh = new THREE.Mesh(
          tint(geometry, 0.9 + Math.sin(++seed * 13.17) * 0.06),
          material,
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        record.parts++;
        record.triangles +=
          (geometry.index?.count ?? geometry.attributes.position.count) / 3;
        game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
        if (physical) {
          const solid = stationMeshSolid(game, feature, mesh);
          solid.monasteryGarden = room.index;
          solid.climbable = climb;
        }
        return mesh;
      },
      block = (w, h, d, material, x, y, z, climb = false) =>
        add(new THREE.BoxGeometry(w, h, d), material, x, y, z, true, climb);
    const wall = (p) => {
      const wx = root.position.x + p.x,
        wz = root.position.z + p.z;
      if (!monasteryGardenAllowed(game, wx, wz, p.w, p.d)) return;
      let high = -Infinity;
      for (const dx of [-p.w / 2, 0, p.w / 2])
        for (const dz of [-p.d / 2, 0, p.d / 2])
          high = Math.max(high, ground(p.x + dx, p.z + dz));
      const bottom =
          footprintMinimum(
            (x, z) => game.groundHeight(x, z),
            wx,
            wz,
            p.w,
            p.d,
            game.terrainProfile.step,
          ) - 0.2,
        top = high + p.height,
        rows = Math.ceil((top - 0.22 - bottom) / 0.32),
        rise = (top - 0.22 - bottom) / rows;
      block(
        p.w,
        top - 0.22 - bottom,
        p.d,
        mortar,
        p.x,
        (bottom + top - 0.22) / 2,
        p.z,
      );
      for (let row = 0; row < rows; row++) {
        const longX = p.w > p.d,
          length = longX ? p.w : p.d,
          pieces = Math.ceil(length / 0.85);
        for (let i = 0; i < pieces; i++) {
          const along = -length / 2 + ((i + 0.5) * length) / pieces;
          add(
            stoneBlockGeometry(
              longX ? length / pieces - 0.012 : p.w,
              rise - 0.012,
              longX ? p.d : length / pieces - 0.012,
              ++seed,
              0.014,
            ),
            stone,
            p.x + (longX ? along : 0),
            bottom + (row + 0.5) * rise,
            p.z + (longX ? 0 : along),
            false,
          );
        }
      }
      add(
        capGeometry(p.w, 0.22, p.d, ++seed),
        stone,
        p.x,
        top - 0.11,
        p.z,
        true,
        true,
      );
      block(p.w, 0.07, p.d, snow, p.x, top + 0.035, p.z, true);
      record.walls.push({
        ...p,
        bottom,
        top: top + 0.07,
        worldX: wx,
        worldZ: wz,
      });
    };
    const shrine = (plan) => {
      const { x, z } = plan;
      if (
        !monasteryGardenAllowed(
          game,
          root.position.x + x,
          root.position.z + z,
          3.4,
          3.4,
        )
      )
        return;
      const bottom =
          footprintMinimum(
            (px, pz) => game.groundHeight(px, pz),
            root.position.x + x,
            root.position.z + z,
            3.4,
            3.4,
            game.terrainProfile.step,
          ) - 0.2,
        base =
          Math.max(
            ...[-1.7, 0, 1.7].flatMap((dx) =>
              [-1.7, 0, 1.7].map((dz) => ground(x + dx, z + dz)),
            ),
          ) + 0.14;
      block(3.4, base - bottom, 3.4, mortar, x, (base + bottom) / 2, z);
      for (const [w, y, h] of [
        [3.4, 0.14, 0.28],
        [2.9, 0.46, 0.38],
        [2.35, 0.78, 0.28],
      ]) {
        add(capGeometry(w, h, w, ++seed), stone, x, base + y, z, true, true);
      }
      const body = base + 0.92;
      // A true recessed niche: a closed back, two cheeks and a full lintel.
      block(1.95, 1.55, 0.32, plaster, x, body + 0.775, z - 0.815);
      for (const side of [-1, 1])
        block(0.43, 1.55, 1.95, plaster, x + side * 0.76, body + 0.775, z);
      block(1.95, 0.34, 1.95, plaster, x, body + 1.38, z);
      block(1.09, 0.22, 1.95, stone, x, body + 0.11, z);
      for (const side of [-1, 1])
        block(0.11, 1.38, 0.16, wood, x + side * 0.59, body + 0.79, z + 0.98);
      block(1.34, 0.13, 0.16, wood, x, body + 1.43, z + 0.98);
      add(
        capGeometry(2.65, 0.28, 2.65, ++seed),
        stone,
        x,
        body + 1.69,
        z,
        true,
        true,
      );
      block(2.65, 0.09, 2.65, snow, x, body + 1.875, z, true);
      const crown = add(
        new THREE.LatheGeometry(
          [
            [0, 0],
            [0.34, 0],
            [0.36, 0.06],
            [0.3, 0.1],
            [0.26, 0.2],
            [0.26, 0.26],
            [0.22, 0.28],
            [0.17, 0.4],
            [0.16, 0.42],
            [0.08, 0.58],
            [0.03, 0.7],
            [0, 0.7],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          24,
        ),
        bronze,
        x,
        body + 1.92,
        z,
        false,
      );
      stationMeshSolid(game, feature, crown);
      add(
        new THREE.TorusGeometry(0.27, 0.025, 6, 24),
        bronze,
        x,
        body + 0.7,
        z - 0.63,
        false,
      );
      for (const side of [-1, 1]) {
        add(
          new THREE.BoxGeometry(0.035, 0.29, 0.028).rotateZ(side * 0.48),
          bronze,
          x + side * 0.06,
          body + 0.71,
          z - 0.64,
          false,
        );
      }
      record.shrines.push({
        x: root.position.x + x,
        z: root.position.z + z,
        bottom,
        base,
        top: body + 2.62,
      });
    };
    for (const plan of record.plans) {
      for (const p of plan.walls) wall(p);
      if (["garden", "reliquary"].includes(plan.kind)) shrine(plan);
    }
    mergeArchitecture(root);
    game.monasteryGardens.push(record);
  }
}
