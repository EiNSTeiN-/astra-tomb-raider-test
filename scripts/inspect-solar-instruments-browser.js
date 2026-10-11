// Inspect a loaded desert chapter using actual delivered mesh and terrain
// buffers. Camera/UI effects and additive light are excluded from solid rays.
import * as THREE from "three";

export function inspectSolarInstruments(game) {
  if (game.solarSites?.length !== 9)
    throw Error("Load the desert's nine solar chambers first");
  game.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(),
    terrainRay = new THREE.Raycaster(),
    terrain = game.terrainMeshes.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return {
        mesh,
        bounds: mesh.geometry.boundingBox
          .clone()
          .applyMatrix4(mesh.matrixWorld),
      };
    }),
    report = {
      foundations: 0,
      footingProbes: 0,
      highestFootingGap: -Infinity,
      mirrors: 0,
      apertureProbes: 0,
      controls: 0,
      controlProbes: 0,
      failures: [],
    };
  for (const site of game.solarSites) {
    for (const footing of site.foundations) {
      report.foundations++;
      for (const fraction of [0, 0.33, 0.66, 0.97])
        for (let i = 0; i < (fraction ? 24 : 1); i++) {
          const angle = (i * Math.PI) / 12,
            x = footing.x + Math.cos(angle) * footing.radius * fraction,
            z = footing.z + Math.sin(angle) * footing.radius * fraction;
          terrainRay.set(
            new THREE.Vector3(x, 300, z),
            new THREE.Vector3(0, -1, 0),
          );
          const meshes = terrain
            .filter(
              ({ bounds: b }) =>
                x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z,
            )
            .map(({ mesh }) => mesh);
          const floor = terrainRay.intersectObjects(meshes, false)[0]?.point.y;
          ray.set(
            new THREE.Vector3(x, footing.bottom - 1, z),
            new THREE.Vector3(0, 1, 0),
          );
          ray.far =
            game.groundHeight(footing.x, footing.z) - footing.bottom + 3;
          const bottom = ray.intersectObject(site.root, true)[0]?.point.y,
            gap = bottom - floor;
          report.footingProbes++;
          report.highestFootingGap = Math.max(report.highestFootingGap, gap);
          if (!Number.isFinite(gap) || gap > -0.15)
            report.failures.push({
              stage: site.stage,
              kind: footing.kind,
              query: "footing",
              x,
              z,
              floor,
              bottom,
              gap,
            });
        }
    }
    for (const mirror of site.mirrors) {
      report.mirrors++;
      const original = mirror.pivot.rotation.y;
      try {
        for (const angle of [
          -Math.PI / 4,
          -Math.PI / 8,
          0,
          Math.PI / 8,
          Math.PI / 4,
        ]) {
          mirror.pivot.rotation.y = angle;
          site.root.updateMatrixWorld(true);
          for (const x of [-0.68, -0.3, 0, 0.3, 0.68])
            for (const y of [-0.65, -0.35, 0.35, 0.65]) {
              const from = new THREE.Vector3(x, y, 0.65).applyMatrix4(
                  mirror.pivot.matrixWorld,
                ),
                direction = new THREE.Vector3(0, 0, -1).transformDirection(
                  mirror.pivot.matrixWorld,
                );
              ray.set(from, direction);
              ray.far = 1.3;
              const hit = ray
                .intersectObject(site.root, true)
                .find(
                  (h) =>
                    h.object.isMesh &&
                    !h.object.material.isMeshBasicMaterial &&
                    !h.object.material.transparent,
                );
              report.apertureProbes++;
              if (hit?.object.material.name !== "Silvered solar reflectors")
                report.failures.push({
                  stage: site.stage,
                  index: mirror.feature.index,
                  query: "aperture",
                  angle,
                  x,
                  y,
                  material: hit?.object.material.name,
                });
            }
        }
      } finally {
        mirror.pivot.rotation.y = original;
        site.root.updateMatrixWorld(true);
      }
    }
    for (const f of [...site.mirrors.map((m) => m.feature), site.receiver]) {
      report.controls++;
      for (const dx of [-0.18, 0, 0.18])
        for (const dz of [-0.18, 0, 0.18]) {
          report.controlProbes++;
          if (!game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0))
            report.failures.push({ id: f.id, query: "control", dx, dz });
        }
    }
  }
  return report;
}
