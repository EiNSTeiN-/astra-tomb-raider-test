import * as THREE from "three";
import {
  discoveryClusters,
  discoverySettingPlan,
  discoverySettingAllowed,
} from "./discovery-setting-plan.js";
import { discoverySettingModule } from "./discovery-setting-art.js";
import { DISCOVERY_STYLES } from "./discovery-props.js";
import { campMaterials } from "./camp-materials.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationSolid } from "./field-station-solids.js";
import { propSupportHeight } from "./prop-support.js";
import { mergeArchitecture } from "./visuals.js";
import {
  DISCOVERY_COMPOSITIONS,
  discoveryPaving,
} from "./discovery-composition.js";
import {
  discoveryInlayGeometry,
  discoveryPavingAllowed,
  discoveryPavingMaterial,
  pavingSeparated,
} from "./discovery-paving.js";

export function buildDiscoverySettings(game) {
  const biome = game.level.biome,
    camp = (game.campMaterials ??= campMaterials(biome)),
    stone = game.stoneMat.clone(),
    dark = game.darkMat.clone(),
    bronze = patinatedBronze(),
    trim = new THREE.MeshStandardMaterial({
      color: DISCOVERY_STYLES[biome].trim,
      roughness: 0.86,
      vertexColors: true,
    }),
    m = { ...camp, stone, dark, bronze, trim },
    batch = new THREE.Group(),
    floors = new THREE.Group(),
    paving = discoveryPavingMaterial(biome, game.map);
  stone.name = "Discovery setting dressed stone";
  stone.normalScale.setScalar(0.42);
  dark.name = "Discovery setting recessed stone";
  dark.color.copy(stone.color).multiplyScalar(0.5);
  stone.vertexColors = dark.vertexColors = bronze.vertexColors = true;
  batch.name = "Regional discovery settings";
  floors.name = "Broken discovery floors";
  game.world.add(batch, floors);
  game.discoverySettings = [];
  game.discoveryRackSeats = [];
  let rackPart = 1,
    pavingTile = 1;
  const pavedCells = new Map();
  const reservePaving = (points, existing = false) => {
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]),
      keys = [],
      near = new Set();
    for (
      let z = Math.floor(Math.min(...zs) / 7);
      z <= Math.floor(Math.max(...zs) / 7);
      z++
    )
      for (
        let x = Math.floor(Math.min(...xs) / 7);
        x <= Math.floor(Math.max(...xs) / 7);
        x++
      ) {
        const key = x + "," + z;
        keys.push(key);
        for (const p of pavedCells.get(key) || []) near.add(p);
      }
    if (!existing && [...near].some((p) => !pavingSeparated(p, points)))
      return false;
    for (const key of keys) {
      if (!pavedCells.has(key)) pavedCells.set(key, []);
      pavedCells.get(key).push(points);
    }
    return true;
  };
  // The existing station courses keep their whole bounds, including chipped
  // corners, so newly expanded discovery floors cannot overlap those inlays.
  for (const yard of game.stationYards || [])
    for (const p of yard.paving)
      reservePaving(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, z]) => [p.x + (x * p.w) / 2, p.z + (z * p.d) / 2]),
        true,
      );
  for (const members of discoveryClusters(game.items)) {
    const plan = discoverySettingPlan(game.level, members),
      setting = {
        id: `discovery-setting-${plan.id}`,
        name: plan.style.name,
        composition: DISCOVERY_COMPOSITIONS[biome].name,
        variant: plan.variant,
        members: members.map((f) => f.id),
        modules: [],
        paving: [],
      },
      roles = new Set();
    game.discoverySettings.push(setting);
    for (const p of plan.candidates) {
      const key = `${p.owner}/${p.role}`;
      if (roles.has(key) || !discoverySettingAllowed(game, p)) continue;
      // Shared settings get one backdrop and one fragment. Their individual
      // working fixtures can still sit near both separated stands.
      if (
        p.role !== "fixture" &&
        setting.modules.some((o) => o.role === p.role)
      )
        continue;
      const y = game.groundHeight(p.x, p.z),
        bottom =
          footprintMinimum(
            game.groundHeight.bind(game),
            p.x,
            p.z,
            p.w,
            p.d,
            game.terrainProfile.step,
          ) -
          y -
          0.15,
        root = discoverySettingModule(biome, p, m, bottom);
      // Part identities survive material batching. The contact observer reads
      // delivered triangles rather than repeating the placement calculation.
      const joints = root.userData.rackSeats || [],
        tracked = new Set(
          joints.flatMap((j) => [j.shelf, j.ceiling, ...j.parts]),
        ),
        ids = new Map();
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const id = tracked.has(mesh) ? rackPart++ : 0;
        if (id) ids.set(mesh, id);
        mesh.geometry.setAttribute(
          "discoveryRackPart",
          new THREE.Float32BufferAttribute(
            new Float32Array(mesh.geometry.attributes.position.count).fill(id),
            1,
          ),
        );
      });
      for (const joint of joints)
        game.discoveryRackSeats.push({
          setting: setting.id,
          kind: joint.kind,
          shelf: ids.get(joint.shelf),
          ceiling: ids.get(joint.ceiling) || 0,
          rests: joint.rests.map((mesh) => ids.get(mesh)),
          parts: joint.parts.map((mesh) => ids.get(mesh)),
        });
      delete root.userData.rackSeats;
      root.position.set(p.x, y, p.z);
      root.rotation.y = p.yaw;
      game.world.add(root);
      root.updateMatrixWorld(true);
      root.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.userData.settingSolid) return;
        const bounds = new THREE.Box3().setFromObject(mesh),
          size = bounds.getSize(new THREE.Vector3()),
          centre = bounds.getCenter(new THREE.Vector3());
        const o = stationSolid(
          game,
          setting,
          { position: new THREE.Vector3() },
          size.toArray(),
          centre.toArray(),
          { surfaceHeight: propSupportHeight(mesh) },
        );
        o.discoverySetting = setting.id;
        game.cameraSurfaces.capture(mesh, { small: true, thin: true });
      });
      while (root.children.length) batch.attach(root.children[0]);
      game.world.remove(root);
      setting.modules.push({ ...p, y, bottom });
      roles.add(key);
    }
    // Regional fragments share one material and follow the collection heading.
    // Clip every angled edge against the terrain's actual triangle diagonal.
    for (const f of members) {
      const p = f.discovery,
        sin = Math.sin(p.stance.yaw),
        cos = Math.cos(p.stance.yaw);
      for (const tile of discoveryPaving(game.level, f)) {
        const points = tile.points.map(([x, z]) => [
          p.x + x * cos + z * sin,
          p.z - x * sin + z * cos,
        ]);
        if (!discoveryPavingAllowed(game, points) || !reservePaving(points))
          continue;
        const geometry = discoveryInlayGeometry(game.terrainProfile, points),
          count = geometry.attributes.position.count;
        if (!count) {
          geometry.dispose();
          continue;
        }
        const id = pavingTile++,
          color = new THREE.Color(tile.color)
            .lerp(new THREE.Color(0xffffff), 0.72)
            .multiplyScalar(Math.min(1, tile.tone)),
          colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
        geometry.setAttribute(
          "discoveryPavingTile",
          new THREE.Float32BufferAttribute(new Float32Array(count).fill(id), 1),
        );
        const mesh = new THREE.Mesh(geometry, paving);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        floors.add(mesh);
        const xs = points.map((p) => p[0]),
          zs = points.map((p) => p[1]),
          minX = Math.min(...xs),
          maxX = Math.max(...xs),
          minZ = Math.min(...zs),
          maxZ = Math.max(...zs);
        setting.paving.push({
          id,
          owner: f.id,
          points,
          accent: tile.accent,
          x: (minX + maxX) / 2,
          z: (minZ + maxZ) / 2,
          w: maxX - minX,
          d: maxZ - minZ,
        });
      }
    }
  }
  // Chapter-wide batches keep added material draw calls bounded regardless of
  // pickup count. Support queries and camera triangles were copied beforehand.
  mergeArchitecture(batch);
  mergeArchitecture(floors);
  floors.children.forEach((mesh) => {
    mesh.castShadow = false;
  });
  game.discoverySettingBatches = { batch, floors };
}
