import * as THREE from "three";

export function hydraulicPumpMeshes(game) {
  return (game.hydraulicSites || []).flatMap((site) =>
    site.tanks.flatMap((tank) =>
      tank.group.children.filter(
        (mesh) =>
          mesh.isMesh && mesh.material?.name === "Tidal bronze pump castings",
      ),
    ),
  );
}

// Reads the actual submitted casting and plinth buffers in an assembled world.
// It deliberately does not call the casting generator or its profile functions.
export function inspectHydraulicPumps(game) {
  game.world.updateMatrixWorld(true);
  const report = {
    pumps: 0,
    rootProbes: 0,
    missingRoots: 0,
    exposedRoots: 0,
    highestRootGap: -Infinity,
    bodyRays: 0,
    missingBody: 0,
    invalidBody: 0,
    embeddedSources: 0,
    nonfinite: 0,
    minimumSourceBoxClearance: Infinity,
  };
  const ray = new THREE.Raycaster(),
    point = new THREE.Vector3(),
    down = new THREE.Vector3(0, -1, 0),
    start = new THREE.Vector3();
  for (const site of game.hydraulicSites)
    for (const tank of site.tanks) {
      const meshes = tank.group.children.filter(
        (mesh) =>
          mesh.isMesh && mesh.material?.name === "Tidal bronze pump castings",
      );
      if (meshes.length !== 1)
        throw Error("Expected one submitted pump casting");
      const mesh = meshes[0],
        p = mesh.geometry.attributes.position,
        solid = tank.group.children.filter(
          (other) => other.isMesh && other !== mesh && !other.userData.animated,
        ),
        roots = new Set();
      report.pumps++;
      for (const attribute of Object.values(mesh.geometry.attributes))
        for (const value of attribute.array)
          if (!Number.isFinite(value)) report.nonfinite++;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) >= 0.45) continue;
        point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        const key = point.toArray().join(",");
        if (roots.has(key)) continue;
        roots.add(key);
        ray.set(start.copy(point).addScaledVector(down, -2), down);
        const hit = ray.intersectObjects(solid, false)[0];
        report.rootProbes++;
        if (!hit) report.missingRoots++;
        else {
          const gap = point.y - hit.point.y;
          report.highestRootGap = Math.max(report.highestRootGap, gap);
          if (gap > 0.002) report.exposedRoots++;
        }
      }
      for (const y of [0.68, 0.86, 1.17, 1.35])
        for (let n = 0; n < 32; n++) {
          const angle = (n * Math.PI) / 16,
            centre = new THREE.Vector3(
              0,
              y,
              y > 1.1 ? -0.035 : -0.12,
            ).applyMatrix4(mesh.matrixWorld),
            delta = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
          ray.set(
            centre.clone().addScaledVector(delta, 0.5),
            delta.clone().negate(),
          );
          const hit = ray.intersectObject(mesh, false)[0];
          report.bodyRays++;
          if (!hit) report.missingBody++;
          else if (hit.distance < 0.22 || hit.distance > 0.46)
            report.invalidBody++;
        }
      const source = new THREE.Vector3(tank.pump.x, tank.pump.y, tank.pump.z),
        bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.containsPoint(source)) report.embeddedSources++;
      report.minimumSourceBoxClearance = Math.min(
        report.minimumSourceBoxClearance,
        bounds.distanceToPoint(source),
      );
    }
  return report;
}
