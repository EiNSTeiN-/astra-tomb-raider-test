import * as THREE from "three";
import { birdGeometry, birdMaterials } from "./bird-geometry.js";

// Perch records historically mixed body and surface heights. Keep established
// cloud-city body anchors and seat the other birds above their masonry surfaces.
export function birdPerch(game, index, x, y, z) {
  const biome = game.level.biome;
  if (biome === "sky") return game.skyBirdPerches?.[index] || { x, y, z };
  const record = (
    biome === "desert" ? game.desertBirdPerches : game.palaceBirdPerches
  )?.[index];
  if (record) return { ...record, surfaceY: record.y, y: record.y + 0.18 };
  const patch = game.templePatches?.[index];
  if (patch) {
    const meshes = [];
    const collect = (object) => {
      if (object === patch.detail) return;
      if (object.isMesh) meshes.push(object);
      for (const child of object.children) collect(child);
    };
    patch.root.updateWorldMatrix(true, true);
    collect(patch.root);
    const top = new THREE.Box3().setFromObject(patch.root).max.y;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, top + 1, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) return { x, y: hit.point.y + 0.18, z, surfaceY: hit.point.y };
  }
  return { x, y, z, surfaceY: y - 0.18 };
}

export function buildBird(game, index, perch) {
  game.birdKit ||= {
    materials: birdMaterials(),
    tiers: [
      birdGeometry(game.level.biome),
      birdGeometry(game.level.biome, false),
    ],
  };
  const bird = new THREE.Group(),
    torso = new THREE.Group(),
    head = new THREE.Group(),
    tail = new THREE.Group();
  bird.name = "Perched bird " + index;
  bird.position.set(perch.x, perch.y, perch.z);
  bird.add(torso);
  torso.add(head, tail);
  head.position.set(0, 0.15, 0.115);
  tail.position.set(0, 0.035, -0.17);
  const wings = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.101, 0.05, 0);
    torso.add(g);
    return g;
  });
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.014, 0.098);
  head.add(jaw);
  const eyes = new THREE.Group();
  eyes.position.y = 0.05;
  head.add(eyes);
  const parents = {
    body: torso,
    feet: bird,
    head,
    eyes,
    tail,
    jaw,
    "wing-1": wings[0],
    wing1: wings[1],
  };
  const meshes = [];
  for (const [name, geometry] of Object.entries(game.birdKit.tiers[0])) {
    const mesh = new THREE.Mesh(
      geometry,
      name === "eyes"
        ? game.birdKit.materials.eyes
        : game.birdKit.materials.feathers,
    );
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = "Bird " + name;
    parents[name].add(mesh);
    meshes.push({ name, mesh });
  }
  game.world.add(bird);
  const entry = {
    bird,
    torso,
    head,
    wings,
    tail,
    jaw,
    eyes,
    meshes,
    phase: index * 2,
    time: 0,
    tier: 0,
    perch,
  };
  game.birds.push(entry);
  return entry;
}

const pulse = (t, begin, duration) =>
  t < begin || t > begin + duration
    ? 0
    : Math.sin(((t - begin) / duration) * Math.PI) ** 2;

export function updateBirds(game) {
  if (!game.birdKit) return;
  const low = game.store?.data.settings.quality === "low";
  for (const b of game.birds) {
    if (!game.paused) b.time = game.elapsed;
    const t = b.time + b.phase * 3.17;
    const stretch = pulse(t % 31, 22, 3.6),
      preen = pulse(t % 23, 13, 3.4);
    // Feet and body bearing remain fixed: upper-body motion cannot skate toes.
    b.bird.rotation.y = b.phase;
    b.torso.position.y = Math.sin(t * 2.3) * 0.002;
    b.head.rotation.set(
      -preen * 0.7 + Math.sin(t * 0.7) * 0.07,
      Math.sin(t * 0.53) * 0.4 + preen * 0.9,
      Math.sin(t * 0.81) * 0.055,
    );
    b.eyes.scale.y = 1 - pulse(t % 6.7, 5.7, 0.16) * 0.94;
    b.jaw.rotation.x = pulse(t % 9.2, 3, 0.55) * 0.13;
    b.tail.rotation.set(
      Math.sin(t * 1.4) * 0.025 + pulse(t % 8.1, 6, 0.5) * 0.14,
      0,
      0,
    );
    for (const [i, wing] of b.wings.entries()) {
      const side = i ? 1 : -1;
      wing.rotation.set(
        -stretch * 0.3,
        -side * stretch * 0.65,
        side * (stretch * 0.9 + preen * 0.08),
      );
    }
    const distance = b.bird.position.distanceTo(game.camera.position);
    // The small birds use shared geometry. Switch below a few pixels of detail;
    // retain audible birds and their anchors even when visually out of range.
    const near = low ? 12 : 20;
    const tier = distance > near + 2 ? 1 : distance < near - 2 ? 0 : b.tier;
    b.bird.visible = distance < (low ? 60 : 85);
    if (tier !== b.tier) {
      b.tier = tier;
      for (const { name, mesh } of b.meshes)
        mesh.geometry = game.birdKit.tiers[tier][name];
    }
  }
}

// Unselected shared detail geometries are not in the scene traversal at unload.
export function disposeBirdTemplates(game, geometries) {
  for (const tier of game.birdKit?.tiers || [])
    for (const geometry of Object.values(tier)) geometries.add(geometry);
}
