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
import { pavingMaterial } from "./station-yards.js";
import { terrainInlayGeometry } from "./terrain-inlay.js";

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
    paving = pavingMaterial(biome);
  stone.name = "Discovery setting dressed stone";
  stone.normalScale.setScalar(0.42);
  dark.name = "Discovery setting recessed stone";
  dark.color.copy(stone.color).multiplyScalar(0.5);
  stone.vertexColors = dark.vertexColors = bronze.vertexColors = true;
  paving.name = "Discovery fragment paving";
  // Inlays carry UVs and wear coordinates, but no vertex color attribute.
  paving.vertexColors = false;
  paving.color.setHex(biome === "volcano" ? 0xa6aaab : 0xd2d1be);
  batch.name = "Regional discovery settings";
  floors.name = "Broken discovery floors";
  game.world.add(batch, floors);
  game.discoverySettings = [];
  for (const members of discoveryClusters(game.items)) {
    const plan = discoverySettingPlan(game.level, members),
      setting = {
        id: `discovery-setting-${plan.id}`,
        name: plan.style.name,
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
    // Interrupted floor courses lead into each stand without repeating a large
    // paving square. Clip against the rendered terrain's actual triangles.
    for (const f of members) {
      const p = f.discovery,
        sin = Math.sin(p.stance.yaw),
        cos = Math.cos(p.stance.yaw);
      for (let iz = -2; iz <= 2; iz++)
        for (let ix = -2; ix <= 2; ix++) {
          if (Math.abs(ix) === 2 && (ix + iz + plan.variant) % 3 === 0)
            continue;
          if (iz === -2 && (ix + plan.variant) % 2 === 0) continue;
          const x = ix * 1.02,
            z = iz * 1.06,
            box = {
              x: p.x + x * cos + z * sin,
              z: p.z - x * sin + z * cos,
              w: 0.92,
              d: 0.94,
            };
          if (!game.canMove(box.x, box.z, 0) && Math.hypot(x, z) > 1.4)
            continue;
          if (
            game.terrainProfile.waters.some(
              (w) =>
                Math.abs(box.x - w.x) < box.w / 2 + w.width / 2 + 0.1 &&
                Math.abs(box.z - w.z) < box.d / 2 + w.length / 2 + 0.1,
            )
          )
            continue;
          const mesh = new THREE.Mesh(
            terrainInlayGeometry(
              game.terrainProfile,
              box,
              { x: 0, y: 0, z: 0 },
              0.09 + ((ix + iz + 10) % 4) * 0.035,
            ),
            paving,
          );
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          floors.add(mesh);
          setting.paving.push(box);
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
