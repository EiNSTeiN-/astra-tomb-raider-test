import * as THREE from "three";
import { random } from "./campaign.js";
import { brazierMaterials } from "./brazier-materials.js";
import { brazierGeometry } from "./brazier-geometry.js";
import { campEffectsMaterials, campParticles } from "./camp-effects.js";
import { createLodPatch, updateLodPatch } from "./instance-lod.js";

export const BRAZIER_RANGES = {
  high: [22, 140],
  medium: [16, 119],
  low: [10, 91],
};

export function buildBrazier(game, x, z, id) {
  if (!game.brazierKit) {
    const materials = brazierMaterials(game);
    game.brazierTime = { value: 0 };
    game.brazierKit = {
      materials,
      tiers: [
        brazierGeometry(game.level.biome, materials, true),
        brazierGeometry(game.level.biome, materials, false),
      ],
      effects: campEffectsMaterials(game.brazierTime),
    };
    game.braziers = [];
  }
  const group = new THREE.Group();
  group.name = "Courtyard brazier " + id;
  group.position.set(x, game.groundHeight(x, z), z);
  game.world.add(group);
  const fx = game.brazierKit.effects;
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.4), fx.fire);
  fire.name = "Courtyard brazier flame";
  fire.position.y = 3.1;
  fire.userData.brazierFire = true;
  group.add(fire);
  game.flames.push(fire);
  const rng = random(game.level.seed + x * 17 + z * 29),
    smoke = campParticles(fx.smoke, rng, true),
    sparks = campParticles(fx.sparks, rng, false);
  smoke.position.y = sparks.position.y = 2.4;
  group.add(smoke, sparks);
  const obstacle = { x, z, w: 0.64, d: 0.64, h: 2.87, brazier: id };
  game.obstacles.push(obstacle);
  // Camera bounds survive material instancing without adding a hidden render mesh.
  if (game.cameraSurfaces) {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.93, 1.5),
      game.brazierKit.materials.stone,
    );
    proxy.position.y = 1.405;
    group.add(proxy);
    game.cameraSurfaces.capture(proxy);
    group.remove(proxy);
    proxy.geometry.dispose();
  }
  const brazier = { id, group, fire, smoke, sparks, obstacle };
  game.braziers.push(brazier);
  return brazier;
}

export function finishBraziers(game) {
  if (!game.brazierKit) return;
  const positions = game.braziers.map((b) => b.group.position.clone());
  const matrices = positions.map((p) =>
    new THREE.Matrix4().makeTranslation(p.x, p.y, p.z),
  );
  game.brazierPatch = createLodPatch(
    game.world,
    game.brazierKit.tiers,
    matrices,
    positions,
  );
  game.brazierStats = game.brazierKit.tiers.map((parts) => ({
    calls: parts.length,
    triangles: parts.reduce(
      (n, p) =>
        n +
        (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3,
      0,
    ),
  }));
}

export function updateBraziers(game, dt = 0) {
  if (!game.brazierPatch) return;
  if (!game.paused) game.brazierTime.value = game.elapsed;
  const quality = game.store.data.settings.quality,
    ranges = BRAZIER_RANGES[quality];
  updateLodPatch(game.brazierPatch, game.player.position, ranges, dt, 2);
  game.brazierKit.effects.pixelScale.value =
    (game.renderer?.domElement.height || 800) *
    game.camera.projectionMatrix.elements[5] *
    0.5;
  for (const b of game.braziers) {
    const distance = b.group.position.distanceTo(game.player.position);
    b.fire.visible = distance < ranges[1] + 2;
    b.smoke.visible = distance < (quality === "low" ? 18 : 30);
    b.sparks.visible = distance < (quality === "low" ? 22 : 36);
  }
}
