import * as THREE from "three";
import { quartzGeometry } from "./mineral-art.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";

const STYLES = [
  "crown",
  "twin spires",
  "fan",
  "ridge",
  "needle spray",
  "low druse",
];

// Consume the established cluster random sequence so that ceiling formations
// and later chambers retain their authored placements when the minerals change.
export function mineralClusterPlan(room, cluster, rng) {
  const style = (room * 3 + cluster) % STYLES.length,
    bearing = room * 0.72 + cluster * 0.44,
    pieces = [];
  for (let j = 0; j < 9; j++) {
    const angle = j * 2.399 + room,
      spread = j ? 0.65 + rng() * 1.2 : 0,
      originalHeight = j ? 1.2 + rng() * 3.6 : 5.5 + (room % 3) * 0.7,
      originalRadius = j ? 0.22 + rng() * 0.35 : 0.75,
      phase = rng(),
      yaw = rng(),
      variation = j ? (originalHeight - 1.2) / 3.6 : phase;
    let x = Math.cos(angle) * spread,
      z = Math.sin(angle) * spread,
      height = originalHeight,
      radius = originalRadius,
      tiltX = Math.cos(angle) * 0.16,
      tiltZ = Math.sin(angle) * 0.16;
    if (style === 1) {
      if (j < 2) {
        x = j ? 0.68 : -0.68;
        z = j ? 0.18 : -0.18;
        height = j ? 4.8 : 5.6;
        radius = 0.67;
      } else height = 1.1 + variation * 2.1;
    } else if (style === 2) {
      x = (j - 4) * 0.21;
      z = Math.sin(j * 0.7) * 0.25;
      height = 2.9 + Math.sin((j / 8) * Math.PI) * 1.4 + variation * 0.35;
      radius = 0.25 + phase * 0.14;
      tiltX = 0.1;
      tiltZ = -(j - 4) * 0.075;
    } else if (style === 3) {
      x = (j - 4) * 0.38;
      z = Math.sin(j * 0.7) * 0.35;
      height = 1.9 + variation + Math.sin((j / 8) * Math.PI) * 0.7;
      radius = 0.36 + phase * 0.18;
      tiltX = 0.06;
      tiltZ *= 0.65;
    } else if (style === 4) {
      height = j ? 2.7 + variation * 1.7 : 6.6;
      radius = j ? 0.2 + phase * 0.12 : 0.43;
      x *= 0.8;
      z *= 0.8;
      tiltX *= 0.6;
      tiltZ *= 0.6;
    } else if (style === 5) {
      height = 1.15 + variation * 1.25;
      radius = 0.43 + phase * 0.2;
      x *= 0.85;
      z *= 0.85;
    }
    const c = Math.cos(bearing),
      s = Math.sin(bearing);
    pieces.push({
      x: x * c + z * s,
      z: z * c - x * s,
      height,
      radius,
      phase,
      rotation: [tiltX, yaw + bearing, tiltZ],
    });
  }
  // Younger crystals knit the large silhouettes into their rock bed. Their
  // variation derives from the core plan and does not advance the roof RNG.
  for (let i = 0; i < 12; i++) {
    const core = pieces[(i * 5) % 9],
      phase = (core.phase + (i + 1) * 0.61803398875) % 1,
      angle = i * 2.399 + bearing,
      spread = 0.9 + phase * 1.3;
    pieces.push({
      x: Math.cos(angle) * spread,
      z: Math.sin(angle) * spread,
      radius: 0.13 + phase * 0.12,
      height: 0.42 + (1 - core.phase) * 0.75,
      phase,
      rotation: [Math.cos(angle) * 0.2, angle, Math.sin(angle) * 0.2],
    });
  }
  return { style: STYLES[style], pieces };
}

export function buildMineralCluster(
  game,
  root,
  bed,
  center,
  room,
  cluster,
  rng,
  material,
) {
  const plan = mineralClusterPlan(room, cluster, rng),
    meshes = [bed],
    pieces = [],
    bounds = new THREE.Box3();
  for (const piece of plan.pieces) {
    const geometry = quartzGeometry(piece.radius, piece.height, piece.phase),
      rotation = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(...piece.rotation),
      );
    // Bake the lean into the geometry. Triangle kernels require upright object
    // transforms; optical coordinates continue to belong to the unrotated shard.
    geometry.applyMatrix4(rotation);
    const p = geometry.attributes.position,
      q = geometry.attributes.mineralCoord,
      heel = new THREE.Box3(),
      point = new THREE.Vector3();
    for (let i = 0; i < p.count; i++)
      if (q.getY(i) <= piece.height * 0.035 + 1e-6)
        heel.expandByPoint(point.fromBufferAttribute(p, i));
    const x = center.x + piece.x,
      z = center.z + piece.z,
      bottom = footprintMinimum(
        game.groundHeight.bind(game),
        x + (heel.min.x + heel.max.x) / 2,
        z + (heel.min.z + heel.max.z) / 2,
        heel.max.x - heel.min.x,
        heel.max.z - heel.min.z,
      ),
      y = bottom - heel.max.y - 0.055,
      mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    mesh.updateWorldMatrix(true, false);
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    game.cameraSurfaces?.capture(mesh);
    meshes.push(mesh);
    pieces.push({
      ...piece,
      phase: Math.fround(piece.phase),
      position: [x, y, z],
    });
  }
  const feature = { id: `mineral-${room}-${cluster}` },
    solid = stationAssemblySolid(game, feature, meshes, { bodyPadding: 0.5 });
  solid.cavernMineral = true;
  return { style: plan.style, pieces, bounds, solid, meshes };
}
