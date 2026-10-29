import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { weatherPalaceStone } from "./palace-material.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import {
  palaceFurnishingArt,
  palaceFurnishingPlan,
} from "./palace-furnishing-art.js";

function materials(game) {
  const stone = game.stoneMat.clone(),
    dark = game.darkMat.clone();
  for (const m of [stone, dark]) weatherPalaceStone(m);
  const result = {
    stone,
    dark,
    blue: pbrMaterial("palace-plaster", 0x498184),
    ceramic: pbrMaterial("palace-plaster", 0xb07b53),
    metal: pbrMaterial("forge-metal", 0x87968a),
    wood: pbrMaterial("monastery-wood", 0xa79174),
    rope: new THREE.MeshStandardMaterial({ color: 0x8f8060, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.95 }),
  };
  result.metal.metalness = 0.65;
  result.metal.roughness = 0.7;
  for (const [name, m] of Object.entries(result)) {
    m.name = "Palace furnishing " + name;
    m.vertexColors = true;
  }
  return result;
}

// Flatten each part's tilt and scale into its render geometry. Physical
// triangle placements then retain only the setting's upright yaw/translation.
export function bakeFurnishingParts(root) {
  for (const mesh of root.children) {
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
  }
}

export function buildPalaceFurnishings(game) {
  game.palaceFurnishings = [];
  if (game.level.biome !== "water") return;
  const m = materials(game),
    step = game.terrainProfile?.step || 1.75;
  for (const room of game.map.rooms) {
    const plan = palaceFurnishingPlan(room.index),
      hall = new THREE.Group(),
      settings = [];
    hall.name = plan.name;
    hall.position.set(room.x * 7, 0, room.z * 7);
    game.world.add(hall);
    for (const spec of plan.settings) {
      const x = hall.position.x + spec.x,
        z = hall.position.z + spec.z,
        c = Math.abs(Math.cos(spec.angle)),
        s = Math.abs(Math.sin(spec.angle)),
        width = spec.width * c + spec.depth * s,
        depth = spec.width * s + spec.depth * c,
        low = footprintMinimum(
          (px, pz) => game.groundHeight(px, pz),
          x,
          z,
          width,
          depth,
          step,
        ),
        high = -footprintMinimum(
          (px, pz) => -game.groundHeight(px, pz),
          x,
          z,
          width,
          depth,
          step,
        ),
        top = high + 0.025,
        bottom = low - 0.12,
        root = palaceFurnishingArt(
          spec.kind,
          m,
          game.level.seed + room.index * 73,
        ),
        base = new THREE.Mesh(
          new THREE.BoxGeometry(spec.width, top - bottom, spec.depth),
          m.dark,
        );
      base.position.y = (bottom - top) / 2;
      base.castShadow = base.receiveShadow = true;
      base.userData.furnishingSolid = true;
      base.geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(base.geometry.attributes.position.count * 3).fill(
            0.92,
          ),
          3,
        ),
      );
      root.add(base);
      root.position.set(spec.x, top, spec.z);
      root.rotation.y = spec.angle;
      hall.add(root);
      bakeFurnishingParts(root);
      const parts = root.children.filter(
          (mesh) => mesh.userData.furnishingSolid,
        ),
        feature = { id: spec.id },
        solid = stationAssemblySolid(game, feature, parts, {
          bodyPadding: 0.65,
          // Match the landing footprint to the side collision margin.
          // The visible resting foot plants on a real tread within reach.
          supportRadius: 0.65,
          layeredSupport: true,
        });
      for (const mesh of parts)
        game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
      const triangles = root.children.reduce(
        (n, mesh) =>
          n +
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) /
            3,
        0,
      );
      mergeArchitecture(root);
      settings.push({
        ...spec,
        root,
        solid,
        triangles,
        top,
        bottom,
        footprint: { x, z, width, depth },
        parts: parts.length,
      });
    }
    game.palaceFurnishings.push({
      room: room.index,
      name: plan.name,
      root: hall,
      settings,
    });
  }
}
