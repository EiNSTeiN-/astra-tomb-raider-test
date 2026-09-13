// Development-only geometry inspection on disposable progress. These rays
// inspect built foundations and roots against the visible terrain triangles.
import * as THREE from "three";

export function inspectBankSupports(game) {
  game.world.updateMatrixWorld(true);
  const terrain = game.terrainMeshes.map((mesh) => {
    mesh.geometry.computeBoundingBox();
    return { mesh, bounds: mesh.geometry.boundingBox };
  });
  const ray = new THREE.Raycaster(),
    records = [];
  const measure = (points) => {
    let maximum = -Infinity,
      minimum = Infinity,
      missing = 0;
    for (const [x, y, z] of points) {
      ray.set(new THREE.Vector3(x, y + 100, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(
        terrain
          .filter(
            ({ bounds: b }) =>
              x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z,
          )
          .map((t) => t.mesh),
        false,
      )[0];
      if (!hit) {
        missing++;
        continue;
      }
      maximum = Math.max(maximum, y - hit.point.y);
      minimum = Math.min(minimum, y - hit.point.y);
    }
    return { samples: points.length, maximum, minimum, missing };
  };
  for (const key of ["templePatches", "monasteryPatches", "observatories"])
    for (const [court, patch] of (game[key] || []).entries())
      for (const f of patch.foundations || []) {
        const points = [],
          x = patch.root.position.x + f.x,
          z = patch.root.position.z + f.z;
        if (f.radius) {
          for (let ring = 0; ring <= 4; ring++)
            for (let i = 0; i < 128; i++) {
              const a = (Math.floor(i / 4) * Math.PI) / 16,
                b = a + Math.PI / 16,
                t = (i % 4) / 4,
                r = (ring * f.radius) / 4;
              points.push([
                x + ((1 - t) * Math.sin(a) + t * Math.sin(b)) * r,
                f.bottom,
                z + ((1 - t) * Math.cos(a) + t * Math.cos(b)) * r,
              ]);
            }
        } else {
          for (let ix = 0; ix <= 10; ix++)
            for (let iz = 0; iz <= 10; iz++)
              points.push([
                x + (ix / 10 - 0.5) * f.width,
                f.bottom,
                z + (iz / 10 - 0.5) * f.depth,
              ]);
        }
        records.push({ kind: key, court, x, z, ...measure(points) });
      }
  for (const [court, patch] of (game.growthPatches || []).entries())
    for (const root of patch.roots || [])
      records.push({ kind: "ruinRoot", court, ...measure(root.ring) });
  for (const water of game.waterMeshes.filter((w) => w.userData.shore)) {
    const w = water.userData,
      points = [];
    for (let i = 0; i <= 100; i++)
      for (const [x, z] of [
        [w.x - w.width / 2, w.z + w.length * (i / 100 - 0.5)],
        [w.x + w.width / 2, w.z + w.length * (i / 100 - 0.5)],
        [w.x + w.width * (i / 100 - 0.5), w.z - w.length / 2],
        [w.x + w.width * (i / 100 - 0.5), w.z + w.length / 2],
      ])
        points.push([x, water.position.y, z]);
    records.push({ kind: "poolBorder", id: w.id, ...measure(points) });
  }
  return records;
}
