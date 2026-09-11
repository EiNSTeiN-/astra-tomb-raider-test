import { snowBoulderMaterial } from "./snow-terrain-material.js";
import { meridianBoulderMaterial } from "./meridian-terrain-material.js";
import { buildVolcanicScree } from "./volcanic-scree.js";
import { volcanicBoulderMaterial } from "./volcanic-material.js";
import { inWindCourt } from "./wind-rules.js";
import { inCipherCourt } from "./cipher-rules.js";
import { inHydraulicCourt } from "./hydraulic-rules.js";
import { inResonanceCourt } from "./resonance-rules.js";
import { inThermalCourt } from "./thermal-rules.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";
import { inSolarCourt } from "./solar-rules.js";
import {
  woodlandLayout,
  understoryLayout,
  coastalPlantAllowed,
} from "./habitat.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";
import { skyGroundSupported } from "./sky-geology.js";
import { buildDesertScatter } from "./desert-scatter.js";
import { stoneFootprint } from "./stone-grounding.js";
import { placeNatureRock } from "./nature-rocks.js";
import { FRINGE_RANGES } from "./jungle-fringe.js";
import { bakeLeafClusters } from "./leaf-atlas.js";

function meshSources(scene) {
  scene.updateMatrixWorld(true);
  const sources = [];
  scene.traverse((object) => {
    if (object.isMesh) sources.push(object);
  });
  return sources;
}

function forestWind(material, uniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.forestTime = uniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float forestTime;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat bend=pow(max(0.0,position.y)/15.0,1.5); transformed.x+=sin(forestTime*0.65+position.y*0.8+instanceMatrix[3].x*0.13)*bend*0.18; transformed.z+=sin(forestTime*0.43+position.y*1.2)*bend*0.11;",
      );
  };
  material.customProgramCacheKey = () => "vesper-canopy-wind-1";
}

export async function loadForest(game) {
  const loader = new GLTFLoader(game.assetBatch?.manager);
  game.woodland = [];
  game.leafAtlases = null;
  if (!["jungle", "snow"].includes(game.level.biome)) return;
  const names =
    game.level.biome === "snow"
      ? ["fir_tree_01"]
      : ["island_tree_01", "island_tree_02"];
  const world = game.world;
  const layout = woodlandLayout(game.map, game.level, (x, z) =>
    game.groundHeight(x, z),
  );
  game.woodland = layout;
  const [bundles, leafMask] = await Promise.all([
    Promise.all(
      names.map((name) =>
        Promise.all(
          ["near", "optimized", "distant"].map((tier) =>
            loader.loadAsync(`/assets/models/${name}/${tier}.glb`),
          ),
        ),
      ),
    ),
    game.level.biome === "jungle"
      ? new THREE.TextureLoader(game.assetBatch?.manager).loadAsync(
          "/assets/textures/island-tree-leaves-alpha.png",
        )
      : Promise.resolve(null),
  ]);
  if (world !== game.world) {
    leafMask?.dispose();
    return;
  }
  if (leafMask) {
    // Match glTF UV orientation. The PNG is linear coverage, not color.
    leafMask.flipY = false;
    leafMask.colorSpace = THREE.NoColorSpace;
    leafMask.wrapS = leafMask.wrapT = THREE.RepeatWrapping;
    leafMask.anisotropy = 8;
  }
  game.forestWind = { value: 0 };
  const canopyDepth = (material) => forestWind(material, game.forestWind);
  if (leafMask) {
    const specimen = meshSources(bundles[0][0].scene).find((m) =>
      /leaves/.test(m.material.name),
    );
    game.leafAtlases = bakeLeafClusters(
      game.renderer,
      specimen.material,
      leafMask,
      specimen.geometry.getAttribute("_leaf_bounds"),
    );
  }
  for (let variant = 0; variant < bundles.length; variant++) {
    const assets = bundles[variant];
    assets[0].scene.updateMatrixWorld(true);
    const reference = assets[0].scene.userData.vesperTreeBounds;
    const bounds = reference
      ? new THREE.Box3(
          new THREE.Vector3().fromArray(reference.min),
          new THREE.Vector3().fromArray(reference.max),
        )
      : new THREE.Box3().setFromObject(assets[0].scene);
    const center = bounds.getCenter(new THREE.Vector3()),
      height = bounds.max.y - bounds.min.y;
    const tiers = assets.map((asset, tier) => {
      const groups = new Map();
      for (const source of meshSources(asset.scene)) {
        let geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        if (geometry.index) {
          const expanded = geometry.toNonIndexed();
          geometry.dispose();
          geometry = expanded;
        }
        const key =
          source.material.uuid +
          Object.keys(geometry.attributes).sort().join(",");
        if (!groups.has(key))
          groups.set(key, { material: source.material, parts: [] });
        groups.get(key).parts.push(geometry);
      }
      return [...groups.values()].map(({ material, parts }) => {
        const geometry = mergeGeometries(parts, false);
        parts.forEach((part) => part.dispose());
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        geometry.scale(15 / height, 15 / height, 15 / height);
        const leaf = /leaves|twig/.test(material.name);
        material.side = leaf ? THREE.DoubleSide : THREE.FrontSide;
        material.transparent = false;
        material.depthWrite = true;
        material.alphaTest = leaf ? 0.35 : 0;
        material.roughness = 0.95;
        if (leaf) {
          if (game.level.biome === "jungle") {
            material.color.multiply(new THREE.Color(0xc9e6ba));
            material.userData.leafTiles = [1, 2, 4][tier];
            if (tier) {
              const maps = game.leafAtlases.tiers[material.userData.leafTiles];
              Object.assign(material, maps);
              material.metalnessMap = maps.roughnessMap;
              material.alphaMap = null;
            } else material.alphaMap = leafMask;
          }
          forestWind(material, game.forestWind);
        }
        return { geometry, material };
      });
    });
    const chunks = new Map(),
      dummy = new THREE.Object3D();
    for (const tree of layout.filter((tree) => tree.variant === variant)) {
      const key = `${Math.floor(tree.x / 32)},${Math.floor(tree.z / 32)}`;
      if (!chunks.has(key)) chunks.set(key, { matrices: [], positions: [] });
      dummy.position.set(tree.x, tree.y, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      chunks.get(key).matrices.push(dummy.matrix.clone());
      chunks.get(key).positions.push(dummy.position.clone());
    }
    for (const chunk of chunks.values())
      game.forestPatches.push(
        createLodPatch(world, tiers, chunk.matrices, chunk.positions, {
          wind: canopyDepth,
        }),
      );
    const fringeChunks = new Map();
    for (const tree of game.jungleFringe?.trees || []) {
      if (tree.variant !== variant) continue;
      const key = `${Math.floor(tree.x / 48)},${Math.floor(tree.z / 48)}`;
      if (!fringeChunks.has(key))
        fringeChunks.set(key, { matrices: [], positions: [] });
      dummy.position.set(tree.x, tree.y, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      fringeChunks.get(key).matrices.push(dummy.matrix.clone());
      fringeChunks.get(key).positions.push(dummy.position.clone());
    }
    for (const chunk of fringeChunks.values()) {
      const patch = createLodPatch(
        world,
        tiers.slice(1),
        chunk.matrices,
        chunk.positions,
        {
          castShadow: false,
          wind: canopyDepth,
        },
      );
      for (const mesh of patch.tiers.flat()) {
        mesh.name = "Outer jungle tree";
        mesh.userData.excludeContact = true;
      }
      game.jungleFringe.patches.push(patch);
    }
  }
  updateForest(game);
  game.renderOnce = true;
}

export const FOREST_RANGES = {
  high: [20, 60, 175],
  medium: [12, 44, 155],
  low: [0, 28, 115],
};
export function updateForest(game, dt = 0) {
  if (game.forestWind) game.forestWind.value = game.elapsed;
  for (const patch of game.forestPatches || [])
    updateLodPatch(
      patch,
      game.player.position,
      FOREST_RANGES[game.store.data.settings.quality],
      dt,
      3,
    );
  for (const patch of game.jungleFringe?.patches || [])
    updateLodPatch(
      patch,
      game.player.position,
      FRINGE_RANGES[game.store.data.settings.quality],
      dt,
      3,
    );
}

export async function loadNature(game) {
  const loader = new GLTFLoader(game.assetBatch?.manager);
  const world = game.world,
    biome = game.level.biome,
    rng = random(game.level.seed + 777);
  const jobs = ["rock_moss_set_01"];
  if (["jungle", "sky"].includes(biome)) jobs.push("fern_02", "shrub_01");
  if (biome === "water") jobs.push("shrub_01");
  const assets = await Promise.all(
    jobs.map(async (name) => ({
      name,
      tiers: await Promise.all(
        (name === "shrub_01"
          ? ["optimized", "middle", "distant"]
          : name === "fern_02"
            ? ["optimized", "distant"]
            : ["optimized"]
        ).map((tier) =>
          loader
            .loadAsync(
              biome === "desert"
                ? "/assets/models/desert-stones.glb"
                : `/assets/models/${name}/${tier}.glb`,
            )
            .then((gltf) => meshSources(gltf.scene)),
        ),
      ),
    })),
  );
  if (game.world !== world) return;
  game.desertScatter = null;
  game.volcanicScree = null;
  game.rockGrounding = {
    candidates: 0,
    placed: 0,
    reserved: 0,
    unsupported: 0,
  };
  if (biome === "desert") {
    buildDesertScatter(game, assets[0].tiers[0]);
    updateNature(game);
    game.renderOnce = true;
    return;
  }
  const planted = understoryLayout(
    game.map,
    game.level,
    game.terrainProfile,
    game.woodland || [],
  );
  const dummy = new THREE.Object3D(),
    locations = [];
  for (const room of [
    ...game.map.rooms,
    ...game.map.sideRooms,
    ...(game.map.fieldSites || []),
  ])
    for (let i = 0; i < 32; i++) {
      const angle = rng() * Math.PI * 2,
        radius = 9 + rng() * 13;
      locations.push({
        x: room.x * 7 + Math.cos(angle) * radius,
        z: room.z * 7 + Math.sin(angle) * radius,
      });
    }
  for (let z = 1; z < game.map.size - 1; z++)
    for (let x = 1; x < game.map.size - 1; x++)
      if (game.map.grid[z][x]) {
        const edges = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dz]) => !game.map.grid[z + dz][x + dx]);
        for (const edge of edges)
          for (let i = 0; i < 3; i++) {
            const offset = 2.8 + rng() * 2.5,
              lateral = (rng() - 0.5) * 6;
            locations.push({
              x: x * 7 + edge[0] * offset + edge[1] * lateral,
              z: z * 7 + edge[1] * offset + edge[0] * lateral,
            });
          }
      }
  for (let i = locations.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [locations[i], locations[j]] = [locations[j], locations[i]];
  }
  for (const asset of assets) {
    const rock = asset.name.startsWith("rock"),
      fern = asset.name.startsWith("fern");
    const scattered = locations
      .filter(
        (p) => biome !== "jungle" || !inCipherCourt(game.map, p.x, p.z, 1),
      )
      .filter(
        (p) =>
          biome !== "sky" ||
          (!inWindCourt(game.map, p.x, p.z) &&
            skyGroundSupported(game.terrainProfile, p.x, p.z, rock)),
      )
      .filter((p) => biome !== "desert" || !inSolarCourt(game.map, p.x, p.z))
      .filter((p) => biome !== "water" || !inHydraulicCourt(game.map, p.x, p.z))
      .filter((p) => biome !== "volcano" || !inThermalCourt(game.map, p.x, p.z))
      .filter(
        (p) => biome !== "crystal" || !inResonanceCourt(game.map, p.x, p.z),
      )
      .filter(
        (p) =>
          biome !== "water" ||
          coastalPlantAllowed(game.map, game.terrainProfile, p.x, p.z, rock),
      )
      .filter((_, i) => i % (rock ? 3 : fern ? 1 : 4) === 0)
      .slice(0, rock ? 350 : fern ? 2600 : 620);
    const spots =
      biome === "jungle" && !rock
        ? planted
            .filter((p) => p.kind === (fern ? "fern" : "shrub"))
            .concat(scattered)
        : scattered;
    const sources = asset.tiers[0];
    for (let s = 0; s < sources.length; s++) {
      const reference = sources[s].geometry
        .clone()
        .applyMatrix4(sources[s].matrixWorld);
      const bounds = new THREE.Box3().setFromBufferAttribute(
        reference.attributes.position,
      );
      const center = bounds.getCenter(new THREE.Vector3()),
        size = bounds.getSize(new THREE.Vector3());
      const scale =
        (rock ? 2.6 : fern ? (biome === "jungle" ? 2 : 1.6) : 2.4) /
        Math.max(size.x, size.y, size.z);
      reference.dispose();
      const regionalRockMaterial =
        rock && biome === "volcano"
          ? volcanicBoulderMaterial(sources[s].material)
          : rock && biome === "eclipse"
            ? meridianBoulderMaterial(sources[s].material)
            : rock && biome === "snow"
              ? snowBoulderMaterial(sources[s].material)
              : null;
      const tiers = asset.tiers.map((tier) => {
        const source = tier.find((node) => node.name === sources[s].name);
        if (!source)
          throw new Error(
            `Missing vegetation variant: ${asset.name}/${sources[s].name}`,
          );
        const geometry = source.geometry
          .clone()
          .applyMatrix4(source.matrixWorld);
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        geometry.scale(scale, scale, scale);
        const material = regionalRockMaterial || source.material;
        material.side = THREE.DoubleSide;
        if (!rock) {
          material.alphaTest = 0.4;
          material.transparent = false;
          material.depthWrite = true;
        }
        return [{ geometry, material }];
      });
      const chunks = new Map();
      const footprint = rock ? stoneFootprint(tiers[0][0].geometry) : null;
      for (let i = s; i < spots.length; i += sources.length) {
        const p = spots[i],
          key = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`;
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push(p);
      }
      for (const chunk of chunks.values()) {
        const matrices = [],
          positions = [];
        for (const p of chunk) {
          dummy.position.set(p.x, game.groundHeight(p.x, p.z) - 0.12, p.z);
          dummy.rotation.set(0, rng() * Math.PI * 2, 0);
          dummy.scale.setScalar(p.scale || 0.6 + rng() * 0.8);
          if (rock) {
            game.rockGrounding.candidates++;
            const placed = placeNatureRock(game, footprint, {
              x: p.x,
              z: p.z,
              size: dummy.scale.x,
              yaw: dummy.rotation.y,
            });
            if (placed.reason) {
              game.rockGrounding[placed.reason]++;
              continue;
            }
            game.rockGrounding.placed++;
            matrices.push(placed.matrix);
            positions.push(placed.position);
            continue;
          }
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());
          positions.push(dummy.position.clone());
        }
        if (!matrices.length) continue;
        const patch = createLodPatch(world, tiers, matrices, positions, {
          castShadow: rock,
        });
        patch.kind = rock ? "rock" : fern ? "fern" : "shrub";
        game.naturePatches.push(patch);
      }
    }
  }
  buildVolcanicScree(game);
  updateNature(game);
  game.renderOnce = true;
}

const NATURE_RANGES = {
  high: { rock: [140], gravel: [48], fern: [18, 60], shrub: [10, 25, 70] },
  medium: { rock: [119], gravel: [38], fern: [14, 50], shrub: [8, 21, 60] },
  low: { rock: [91], gravel: [28], fern: [10, 40], shrub: [5, 16, 48] },
};
export function updateNature(game, dt = 0) {
  for (const patch of game.naturePatches || [])
    updateLodPatch(
      patch,
      game.player.position,
      NATURE_RANGES[game.store.data.settings.quality][patch.kind],
      dt,
      1.5,
    );
}
