import * as THREE from "three";
import { buildSnowMountains } from "./snow-mountains.js";
import { buildForgeCaldera } from "./forge-caldera.js";
import { buildCloudCity } from "./cloud-city.js";
import { bridgeCut, bridgeDeckY, bridgeGaps } from "./sky-bridge-rules.js";
import { waterSites, basinDepression, protectedGround } from "./hydrology.js";
import { terrainMaterial } from "./terrain-material.js";
import { trailSampler } from "./habitat.js";
import { coastalLayout } from "./coastal-layout.js";
import { refineSkyTerrain } from "./sky-geology.js";
import { createSunkenGallery } from "./sunken-gallery-layout.js";
import { cutTerrainGeometry } from "./terrain-cut.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wave = (x, z) =>
  Math.sin(x * 0.016) * 2.4 +
  Math.cos(z * 0.021) * 2 +
  Math.sin((x + z) * 0.039) * 0.55;

export function createTerrainProfile(map, level) {
  const extent = map.size * 7,
    step = 1.75,
    width = Math.ceil(extent / step) + 1;
  const heights = new Float32Array(width * width),
    courts = new Float32Array(width * width);
  const biome = level.biome;
  const upperHeights = biome === "sky" ? new Float32Array(width * width) : null;
  const coastal = biome === "water" ? coastalLayout(map) : null;
  const trail = ["jungle", "sky"].includes(biome) ? trailSampler(map) : () => 0;
  const raw = (x, z) => {
    const radius = Math.hypot(x - extent / 2, z - extent / 2);
    switch (biome) {
      case "snow":
        return z * 0.145 + wave(x, z) * 1.8;
      case "sky":
        return z * 0.11 + wave(x, z) * 1.5;
      case "volcano":
        return radius * 0.095 + wave(x, z) * 0.8;
      case "crystal":
        return (extent - z) * 0.06 + wave(x, z) * 1.6;
      case "desert":
        return wave(x, z) * 1.5;
      case "water":
        return wave(x, z) * 0.35 + 0.6;
      case "eclipse":
        return radius * 0.045 + wave(x, z) * 0.5;
      default:
        return wave(x, z) * 1.4 + 4 * Math.sin(x * 0.008 + z * 0.012);
    }
  };
  const terraces = [
    ...map.rooms,
    ...map.sideRooms,
    ...(map.fieldSites || []),
    ...(map.fireVault ? [map.fireVault] : []),
  ].map((r) => ({
    x: r.x * 7,
    z: r.z * 7,
    radius: r.r * 7,
    y: raw(r.x * 7, r.z * 7),
    main: map.rooms.includes(r),
    flat: !!r.fireVault,
  }));
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step,
        gx = Math.round(x / 7),
        gz = Math.round(z / 7);
      const base = raw(x, z);
      let height = base,
        strongest = 0,
        paving = 0;
      for (const terrace of terraces) {
        const distance = Math.max(
          Math.abs(x - terrace.x),
          Math.abs(z - terrace.z),
        );
        const weight =
          1 -
          smooth(
            terrace.radius * (terrace.flat ? 1 : 0.9),
            terrace.radius + 6,
            distance,
          );
        if (weight > strongest) {
          height = base * (1 - weight) + terrace.y * weight;
          strongest = weight;
        }
        const inner = terrace.main ? 8.5 : 3;
        const organicEdge =
          Math.sin(x * 0.63 + z * 0.39) * 1.5 + Math.sin(z * 0.86) * 0.75;
        paving = Math.max(
          paving,
          1 - smooth(inner, inner + 8, distance + organicEdge),
        );
      }
      if (upperHeights) upperHeights[iz * width + ix] = height;
      if (!map.grid[gz]?.[gx]) {
        let distance = 36;
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++) {
            if (!map.grid[gz + dz]?.[gx + dx]) continue;
            distance = Math.min(
              distance,
              Math.hypot(
                Math.max(0, Math.abs(x - (gx + dx) * 7) - 3.5),
                Math.max(0, Math.abs(z - (gz + dz) * 7) - 3.5),
              ),
            );
          }
        const rise = 1 - Math.exp(-distance * 0.72);
        if (biome === "sky") height -= rise * (24 + Math.min(40, distance * 2));
        else if (biome === "water") height -= rise * 7;
        else
          height +=
            rise *
              (5.5 +
                Math.sin(x * 0.087 + z * 0.071) * 1.6 +
                Math.sin(x * 0.22 - z * 0.16) * 0.5) +
            Math.max(0, distance - 5) * 0.35;
      }
      heights[iz * width + ix] = height;
      courts[iz * width + ix] = Math.max(paving, coastal?.coverage(x, z) || 0);
    }
  const sample = (data, x, z) => {
    const fx = Math.max(0, Math.min(width - 1.001, x / step)),
      fz = Math.max(0, Math.min(width - 1.001, z / step));
    const ix = Math.floor(fx),
      iz = Math.floor(fz),
      tx = fx - ix,
      tz = fz - iz;
    return (
      (data[iz * width + ix] * (1 - tx) + data[iz * width + ix + 1] * tx) *
        (1 - tz) +
      (data[(iz + 1) * width + ix] * (1 - tx) +
        data[(iz + 1) * width + ix + 1] * tx) *
        tz
    );
  };
  const foundationHeights = heights.slice();
  const bridges = (map.bridges || []).map((bridge) => ({
    ...bridge,
    ay: sample(foundationHeights, bridge.ax, bridge.az),
    by: sample(foundationHeights, bridge.bx, bridge.bz),
    gaps: bridgeGaps(bridge),
  }));
  const waters = waterSites(map, level);
  for (const site of waters)
    site.baseY =
      sample(heights, site.room.x * 7, site.room.z * 7) +
      (site.baseOffset ??
        (site.kind === "ice" ? 0.025 : biome === "sky" ? -0.08 : 0.12));
  // Excavate after terrace sampling. Preserve every field-station working pad and
  // nearby discoveries so their authored foundations retain the same heights.
  for (let iz = 0; iz < width; iz++)
    for (let ix = 0; ix < width; ix++) {
      const x = ix * step,
        z = iz * step;
      let depression = 0;
      for (const site of waters)
        depression = Math.max(depression, basinDepression(site, x, z));
      if (depression > 0)
        heights[iz * width + ix] -=
          depression * (1 - protectedGround(map, x, z, biome));
      for (const bridge of bridges) {
        const cut = bridgeCut(bridge, x, z);
        if (cut <= 0) continue;
        const dx = bridge.bx - bridge.ax,
          dz = bridge.bz - bridge.az,
          length = Math.hypot(dx, dz);
        const along = ((x - bridge.ax) * dx + (z - bridge.az) * dz) / length;
        heights[iz * width + ix] = Math.min(
          heights[iz * width + ix],
          bridgeDeckY(bridge, along) - cut,
        );
      }
    }
  const profile = {
    extent,
    waters,
    bridges,
    foundationHeight: (x, z) => sample(foundationHeights, x, z),
    step,
    width,
    heights,
    courts,
    trail,
    coastal,
    geology: null,
    height: (x, z) => sample(heights, x, z),
    court: (x, z) => sample(courts, x, z),
  };
  profile.gallery = createSunkenGallery(profile, biome);
  return upperHeights
    ? refineSkyTerrain(
        profile,
        (x, z) => sample(upperHeights, x, z),
        level.seed,
      )
    : profile;
}

export function buildTerrainSurface(game) {
  const profile = game.terrainProfile,
    material = terrainMaterial(game),
    chunkCells = Math.round(49 / profile.step);
  game.terrainMeshes = [];
  for (let z = 0; z < profile.width - 1; z += chunkCells)
    for (let x = 0; x < profile.width - 1; x += chunkCells) {
      const nx = Math.min(chunkCells, profile.width - 1 - x),
        nz = Math.min(chunkCells, profile.width - 1 - z);
      const geometry = new THREE.PlaneGeometry(
        nx * profile.step,
        nz * profile.step,
        nx,
        nz,
      );
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(
        (x + nx / 2) * profile.step,
        0,
        (z + nz / 2) * profile.step,
      );
      const position = geometry.attributes.position,
        uv = geometry.attributes.uv,
        court = new Float32Array(position.count),
        trail = new Float32Array(position.count),
        skyDepth = profile.geology ? new Float32Array(position.count) : null,
        coast = profile.coastal ? new Float32Array(position.count * 3) : null;
      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i),
          pz = position.getZ(i);
        position.setY(i, profile.height(px, pz));
        uv.setXY(i, px / 4, pz / 4);
        court[i] = profile.court(px, pz);
        trail[i] = profile.trail(px, pz);
        if (skyDepth) skyDepth[i] = profile.geology.depth(px, pz);
        if (coast) {
          const room = profile.coastal.nearest(px, pz);
          coast.set([px - room.x, pz - room.z, room.index], i * 3);
        }
      }
      geometry.setAttribute("court", new THREE.BufferAttribute(court, 1));
      geometry.setAttribute("trail", new THREE.BufferAttribute(trail, 1));
      if (skyDepth)
        geometry.setAttribute(
          "skyDepth",
          new THREE.BufferAttribute(skyDepth, 1),
        );
      if (coast)
        geometry.setAttribute("coast", new THREE.BufferAttribute(coast, 3));
      geometry.computeVertexNormals();
      const normals = geometry.attributes.normal,
        n = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i),
          pz = position.getZ(i),
          epsilon = 0.35;
        n.set(
          profile.height(px - epsilon, pz) - profile.height(px + epsilon, pz),
          2 * epsilon,
          profile.height(px, pz - epsilon) - profile.height(px, pz + epsilon),
        ).normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
      }
      geometry.computeBoundingSphere();
      const cut = cutTerrainGeometry(geometry, profile.gallery?.volumes);
      if (cut !== geometry) geometry.dispose();
      const mesh = new THREE.Mesh(cut, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.animated = true;
      game.world.add(mesh);
      game.terrainMeshes.push(mesh);
    }
}

export function buildHorizon(game) {
  game.cloudCity = null;
  if (game.level.biome === "sky") {
    buildCloudCity(game);
    return;
  }
  if (["jungle", "water", "crystal"].includes(game.level.biome)) return;
  if (game.level.biome === "snow") {
    buildSnowMountains(game);
    return;
  }
  if (game.level.biome === "volcano") {
    buildForgeCaldera(game);
    return;
  }
  const extent = game.map.size * 7,
    center = extent / 2;
  for (let layer = 0; layer < 2; layer++) {
    const segments = 160,
      rings = 10,
      vertices = [],
      indices = [];
    const radius = extent * (0.72 + layer * 0.2);
    for (let r = 0; r <= rings; r++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2,
          distance = radius + r * 18;
        const ridge = Math.pow(
          Math.abs(Math.sin(a * 3 + layer) * Math.cos(a * 5 + 0.7)),
          0.7,
        );
        const peak = 40 + ridge * 105 + Math.sin(a * 23) * 5;
        const h =
          -22 +
          Math.sin((r / rings) * Math.PI) * peak +
          (["snow", "sky"].includes(game.level.biome) ? 28 : 0);
        vertices.push(
          center + Math.cos(a) * distance,
          h,
          center + Math.sin(a) * distance,
        );
        if (r < rings && i < segments) {
          const n = r * (segments + 1) + i;
          indices.push(
            n,
            n + segments + 1,
            n + 1,
            n + 1,
            n + segments + 1,
            n + segments + 2,
          );
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(game.level.fog).multiplyScalar(
        layer ? 0.85 : 0.66,
      ),
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const mountain = new THREE.Mesh(geometry, material);
    game.world.add(mountain);
  }
}
