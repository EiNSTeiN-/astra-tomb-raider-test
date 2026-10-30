import * as THREE from "three";
import { FORGE_WORKYARDS, forgeWorkyardArt } from "./forge-workyard-art.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { terrainInlayGeometry } from "./terrain-inlay.js";
import { mergeArchitecture } from "./visuals.js";

const WIDTH = 7.6,
  DEPTH = 1.7,
  BAY_WIDTH = 2.4,
  AISLE = 2.85;

export function forgeWorkyardPlan(game) {
  if (game.level.biome !== "volcano") return [];
  const plans = [];
  for (const room of game.map.rooms) {
    let selected;
    for (const x of [-15, -18, 15, 18, -14, 14, -21, 21, 22, 29]) {
      for (const z of [0, -7, 7, -12, 14, -3.5]) {
        const wx = room.x * 7 + x,
          wz = room.z * 7 + z,
          whole = { x: wx, z: wz, w: 8, d: 7.6 };
        if (
          !natureRockAllowed(game, wx, wz, 5.7) ||
          !discoveryFoliageClear(game, wx, wz, 5.7) ||
          !yardTraversalClear(game.traversalCourses || [], whole)
        )
          continue;
        // Leave the front thermal court and both focused-camera approaches alone.
        if (
          game.map.features.some(
            (f) =>
              f.type === "mechanism" &&
              wx + 4 > f.x * 7 &&
              wx - 4 < f.x * 7 + 27 &&
              wz + 3.8 > f.z * 7 + 8 &&
              wz - 3.8 < f.z * 7 + 69,
          )
        )
          continue;
        const modules = [0, Math.PI / 2]
          .map((angle) =>
            [-AISLE, AISLE].map((dz, row) => ({
              x: wx + Math.sin(angle) * dz,
              z: wz + Math.cos(angle) * dz,
              w: angle ? DEPTH : WIDTH,
              d: angle ? WIDTH : DEPTH,
              angle: angle + (row ? Math.PI : 0),
              row,
              kind: FORGE_WORKYARDS[room.index].kinds[row],
            })),
          )
          .find((parts) =>
            parts.every((box) => yardRouteClear(game.map, box, 1.7)),
          );
        if (!modules) continue;
        let clear = true,
          low = Infinity,
          high = -Infinity;
        for (const dx of [-4, 0, 4])
          for (const dz of [-3.8, 0, 3.8]) {
            const px = wx + dx,
              pz = wz + dz;
            if (!game.canMove(px, pz, 0, 0)) clear = false;
            const y = game.groundHeight(px, pz);
            low = Math.min(low, y);
            high = Math.max(high, y);
          }
        if (!clear || high - low > 2) continue;
        selected = {
          ...FORGE_WORKYARDS[room.index],
          room: room.index,
          x: wx,
          z: wz,
          modules,
        };
        break;
      }
      if (selected) break;
    }
    if (selected) plans.push(selected);
  }
  return plans;
}

export function buildForgeWorkyards(game) {
  game.forgeWorkyards = [];
  if (game.level.biome !== "volcano") return;
  const plans = forgeWorkyardPlan(game);
  if (!plans.length) return;
  const m = {
    stone: game.stoneMat.clone(),
    dark: game.darkMat.clone(),
    metal: game.forgeMetal.clone(),
    clay: game.stoneMat.clone(),
  };
  m.stone.color.multiplyScalar(1.18);
  m.dark.color.setHex(0x30343a);
  m.clay.color.setHex(0xa68768);
  m.metal.color.setHex(0xaab4ad);
  m.metal.metalness = 0.7;
  for (const [name, material] of Object.entries(m)) {
    material.name = "Foundry workyard " + name;
    material.vertexColors = true;
  }
  // Reuse the existing court maps, shader and material instead of allocating a
  // second set of paving textures for the same chapter.
  const paving = game.stationYards
    ?.flatMap((y) => y.root.children)
    .find((o) => o.material?.name === "Worn court paving")?.material;
  for (const plan of plans) {
    const root = new THREE.Group(),
      record = { plan, root, modules: [], materials: m };
    root.name = plan.name;
    game.world.add(root);
    // Separate bay foundations follow the slope without a single tall plinth.
    const bays = plan.modules.flatMap((row) =>
      [-2.5, 0, 2.5].map((offset, bay) => ({
        ...row,
        bay,
        x: row.x + Math.cos(row.angle) * offset,
        z: row.z - Math.sin(row.angle) * offset,
        w:
          Math.abs(Math.cos(row.angle)) * BAY_WIDTH +
          Math.abs(Math.sin(row.angle)) * DEPTH,
        d:
          Math.abs(Math.sin(row.angle)) * BAY_WIDTH +
          Math.abs(Math.cos(row.angle)) * DEPTH,
      })),
    );
    for (const spec of bays) {
      const low = footprintMinimum(
          game.groundHeight.bind(game),
          spec.x,
          spec.z,
          spec.w,
          spec.d,
          game.terrainProfile.step,
        ),
        high = -footprintMinimum(
          (x, z) => -game.groundHeight(x, z),
          spec.x,
          spec.z,
          spec.w,
          spec.d,
          game.terrainProfile.step,
        ),
        top = high + 0.025,
        bottom = low - 0.16,
        assembly = forgeWorkyardArt(
          spec.kind,
          m,
          game.level.seed + plan.room * 73 + spec.row * 13 + spec.bay,
          plan.canopy && spec.row === 0,
        );
      assembly.position.set(spec.x, top, spec.z);
      assembly.rotation.y = spec.angle;
      assembly.updateMatrix();
      const foundation = new THREE.Mesh(
        new THREE.BoxGeometry(BAY_WIDTH, top - bottom, DEPTH),
        m.stone,
      );
      foundation.position.y = (bottom - top) / 2;
      foundation.geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(
            foundation.geometry.attributes.position.count * 3,
          ).fill(0.9),
          3,
        ),
      );
      assembly.add(foundation);
      const parts = [...assembly.children];
      // Flatten tilt and scale before the CPU support kernel sees the parts.
      // World-space vertices let both rows share a small set of render batches.
      for (const mesh of parts) {
        mesh.updateMatrix();
        mesh.geometry.applyMatrix4(mesh.matrix).applyMatrix4(assembly.matrix);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrix();
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        game.cameraSurfaces.capture(mesh, { small: true, thin: true });
      }
      const feature = {
          id: `forge-workyard-${plan.room}-${spec.row}-${spec.bay}`,
        },
        solid = stationAssemblySolid(game, feature, parts, {
          bodyPadding: 0.68,
          supportRadius: 0.68,
          layeredSupport: true,
        });
      record.modules.push({ ...spec, top, bottom, solid, parts: parts.length });
    }
    if (paving) {
      const geometry = terrainInlayGeometry(
        game.terrainProfile,
        { x: plan.x, z: plan.z, w: 8, d: 7.6 },
        new THREE.Vector3(),
        0.65,
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(0.93),
          3,
        ),
      );
      const mesh = new THREE.Mesh(geometry, paving);
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    record.triangles = root.children.reduce(
      (sum, o) =>
        sum +
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
      0,
    );
    mergeArchitecture(root, 1);
    for (const mesh of root.children)
      if (mesh.material === paving) mesh.castShadow = false;
    record.batches = root.children.length;
    game.forgeWorkyards.push(record);
  }
}
