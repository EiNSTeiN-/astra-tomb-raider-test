import * as THREE from "three";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { inResonanceCourt } from "./resonance-rules.js";
import { random } from "./campaign.js";
import { waterAt } from "./hydrology.js";
import { mergeArchitecture } from "./visuals.js";
import { createCavernProfile, crystalRestoration } from "./cavern-profile.js";
import {
  cavernChunks,
  quartzGeometry,
  stalactiteGeometry,
} from "./cavern-geometry.js";
import { cavernRock, mineralMaterial } from "./cavern-material.js";

export function buildCaverns(game) {
  game.cavernProfile = null;
  game.cavernMeshes = [];
  game.cavernPatches = [];
  game.cavernSources = [];
  game.cavernLights = [];
  game.cavernDrips = null;
  if (game.level.biome !== "crystal") return false;
  const profile = (game.cavernProfile = createCavernProfile(
    game.map,
    game.terrainProfile,
  ));
  const rock = cavernRock(),
    rng = random(game.level.seed + 732);
  for (const geometry of cavernChunks(profile)) {
    const mesh = new THREE.Mesh(geometry, rock);
    mesh.name = "Continuous cavern inner vault";
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.animated = true; // Retain spatial chunks through architecture batching.
    game.world.add(mesh);
    game.cavernMeshes.push(mesh);
  }
  const drips = [];
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7;
    const restoration = {
      value: crystalRestoration(game.progress, room.index),
    };
    const color = new THREE.Color(
      [0x779cd8, 0x9179c9, 0x69b8b1, 0x9271b5][room.index % 4],
    );
    const material = mineralMaterial(color, restoration),
      root = new THREE.Group();
    root.name = `Mineral chamber ${room.index}`;
    game.world.add(root);
    const centers = [];
    const candidates = [
      [14, -12],
      [-17, -11],
      [17, 13],
      [-17, 14],
      [0, 20],
      [21, 0],
      [-21, 0],
    ];
    for (const [dx, dz] of candidates) {
      const px = x + dx,
        pz = z + dz,
        py = game.groundHeight(px, pz);
      if (
        game.map.features.some(
          (f) => Math.hypot(f.x * 7 - px, f.z * 7 - pz) < 7,
        ) ||
        game.map.enemies?.some(
          (enemy) => Math.hypot(enemy.x * 7 - px, enemy.z * 7 - pz) < 5.2,
        )
      )
        continue;
      if (profile.height(px, pz) - py < 12) continue;
      if (inEchoGallery(game.map, px, pz, 4)) continue;
      if (inResonanceCourt(game.map, px, pz, 3)) continue;
      if (centers.length === 4) break;
      const center = new THREE.Vector3(px, py, pz);
      centers.push(center);
      const bed = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), rock);
      bed.position.set(px, py + 0.22, pz);
      bed.scale.set(2.8, 0.65, 2.4);
      root.add(bed);
      game.cameraSurfaces?.capture(bed);
      game.obstacles.push({
        x: px,
        z: pz,
        w: 2.2,
        d: 2.1,
        h: 5.8,
        cavernMineral: true,
      });
      for (let j = 0; j < 9; j++) {
        const angle = j * 2.399 + room.index;
        const radius = j ? 0.65 + rng() * 1.2 : 0;
        const cx = px + Math.cos(angle) * radius,
          cz = pz + Math.sin(angle) * radius;
        const h = j ? 1.2 + rng() * 3.6 : 5.5 + (room.index % 3) * 0.7;
        const crystal = new THREE.Mesh(
          quartzGeometry(j ? 0.22 + rng() * 0.35 : 0.75, h, rng()),
          material,
        );
        crystal.position.set(cx, game.groundHeight(cx, cz) - 0.12, cz);
        crystal.rotation.set(
          Math.cos(angle) * (j ? 0.27 : 0.08),
          rng(),
          Math.sin(angle) * (j ? 0.27 : 0.08),
        );
        root.add(crystal);
        game.cameraSurfaces?.capture(crystal);
      }
    }
    const primary = centers[0];
    for (const [cluster, center] of centers.entries()) {
      // Place the audible face toward the chamber, beyond the solid mineral bed.
      const faceX =
        Math.abs(center.x - x) > Math.abs(center.z - z)
          ? Math.sign(x - center.x)
          : 0;
      const faceZ = faceX ? 0 : Math.sign(z - center.z);
      game.cavernSources.push({
        id: `crystal-${room.index}${cluster ? `-${cluster}` : ""}`,
        kind: "crystal",
        x: center.x + faceX * 2.45,
        y: center.y + 3,
        z: center.z + faceZ * 2.35,
        faceX,
        faceZ,
        rate: 0.9 + (room.index % 5) * 0.075,
        gain: cluster ? 0.22 : 0.32,
        near: 3,
        range: 34,
        cavernRoom: room.index,
        cavernCluster: cluster,
        activity: 0.4 + restoration.value * 0.6,
      });
    }
    // Dripping tips and impact rings share exact horizontal coordinates.
    const dx = x - 10,
      dz = z + 8;
    const roof = profile.height(dx, dz),
      floor =
        Math.max(
          game.groundHeight(dx, dz),
          waterAt(game, dx, dz)?.y ?? -Infinity,
        ) + 0.06;
    const tip = Math.max(floor + 12, roof - 3.2);
    const stalactite = new THREE.Mesh(
      stalactiteGeometry(0.9, roof - tip + 0.3, room.index),
      rock,
    );
    stalactite.position.set(dx, tip, dz);
    root.add(stalactite);
    game.cameraSurfaces?.capture(stalactite);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.54, 40),
      new THREE.MeshBasicMaterial({
        color: 0x91a8b4,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(dx, floor, dz);
    game.world.add(ring);
    drips.push({
      id: `drips-${room.index}`,
      x: dx,
      z: dz,
      top: tip,
      floor,
      ring,
      phase: room.index * 0.713,
    });
    game.cavernSources.push({
      id: `drips-${room.index}`,
      kind: "drips",
      x: dx,
      y: floor + 0.3,
      z: dz,
      gain: 0.5,
      near: 2,
      range: 28,
    });
    // Smaller formations break the vault silhouette without lowering route clearance.
    for (let j = 0; j < 13; j++) {
      const sx = x + (rng() - 0.5) * 45,
        sz = z + (rng() - 0.5) * 40;
      const sy = profile.height(sx, sz),
        clearance = sy - game.groundHeight(sx, sz);
      if (clearance < 17) continue;
      const h = 1.3 + rng() * 3.5;
      const m = new THREE.Mesh(
        stalactiteGeometry(0.45 + rng() * 0.9, h, rng() * 10),
        rock,
      );
      m.position.set(sx, sy - h + 0.25, sz);
      root.add(m);
      game.cameraSurfaces?.capture(m);
    }
    mergeArchitecture(root);
    game.cavernPatches.push({
      root,
      index: room.index,
      centers,
      primary,
      color,
      restoration,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(drips.length * 3 * 6), 3),
  );
  const drops = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x98bccc,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  drops.frustumCulled = false;
  game.world.add(drops);
  game.cavernDrips = { drops, sites: drips };
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 32, 2);
    game.world.add(light);
    game.cavernLights.push(light);
  }
  return true;
}

export function updateCaverns(game, dt) {
  if (!game.cavernProfile) return;
  const candidates = [];
  for (const patch of game.cavernPatches) {
    patch.restoration.value = THREE.MathUtils.damp(
      patch.restoration.value,
      crystalRestoration(game.progress, patch.index),
      2,
      dt,
    );
    for (const center of patch.centers)
      candidates.push({
        center,
        patch,
        distance: center.distanceTo(game.player.position),
      });
  }
  for (const site of game.resonanceSites || [])
    for (const node of site.nodes)
      candidates.push({
        center: node.center,
        patch: { color: node.color, restoration: node.level },
        distance: node.center.distanceTo(game.player.position),
      });
  candidates.sort((a, b) => a.distance - b.distance);
  game.cavernLights.forEach((light, index) => {
    const candidate = candidates[index];
    light.visible = !!candidate && candidate.distance < 45;
    if (!light.visible) {
      light.intensity = 0;
      return;
    }
    light.position.copy(candidate.center).y += 4;
    light.color.copy(candidate.patch.color);
    light.intensity =
      (85 + candidate.patch.restoration.value * 55) *
      THREE.MathUtils.smoothstep(45 - candidate.distance, 0, 12);
  });
  const { drops, sites } = game.cavernDrips,
    positions = drops.geometry.attributes.position;
  for (const [i, site] of sites.entries()) {
    site.floor =
      Math.max(
        game.groundHeight(site.x, site.z),
        waterAt(game, site.x, site.z)?.y ?? -Infinity,
      ) + 0.06;
    site.ring.position.y = site.floor;
    const phase = (game.elapsed * 0.62 + site.phase) % 1;
    site.ring.scale.setScalar(0.2 + phase * 1.8);
    site.ring.material.opacity = (1 - phase) * 0.28;
    for (let j = 0; j < 3; j++) {
      const t = (phase + j / 3) % 1,
        y = site.top - (site.top - site.floor) * t * t;
      const index = (i * 3 + j) * 2;
      positions.setXYZ(index, site.x, y, site.z);
      positions.setXYZ(index + 1, site.x, Math.min(site.top, y + 0.23), site.z);
    }
  }
  positions.needsUpdate = true;
}
