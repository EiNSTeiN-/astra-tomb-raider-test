import * as T from "three";
import { updateHydraulicCourts } from "../src/hydraulic-courts.js";

// Observe a paused, uncompleted hydraulic world with no transfer in flight.
// Queries use delivered buffers; no gauge or bowl generator is called here.
export function inspectCisternGauges(game) {
  if (
    game.hydraulicSites.some((s) => s.flow) ||
    game.progress.completed ||
    game.progress.stage !== 0
  )
    throw Error("Inspect an uncompleted hydraulic world at rest");
  const report = {
      gauges: 0,
      glassRays: 0,
      missingGlass: 0,
      minimumStoneClearance: Infinity,
      embeddedGlass: 0,
      bracketEnds: 0,
      unsupportedEnds: 0,
      levelChecks: 0,
      maximumLevelError: 0,
      floatRays: 0,
      missingInnerGlass: 0,
      minimumFloatClearance: Infinity,
      intersectingFloats: 0,
      nonfinite: 0,
      lampSockets: 0,
      missingSockets: 0,
    },
    ray = new T.Raycaster(),
    material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    original = game.hydraulicSites.map((s) => [...s.display]),
    gauges = [];
  game.world.updateMatrixWorld(true);
  try {
    for (const site of game.hydraulicSites)
      for (const tank of site.tanks) {
        const gauge = tank.levelGauge,
          bowls = tank.group.children.filter((m) => {
            if (!m.isMesh) return false;
            m.geometry.computeBoundingBox();
            const b = m.geometry.boundingBox;
            return (
              Math.abs(b.min.y - 0.25) < 0.001 &&
              Math.abs(b.max.y - 3.05) < 0.001
            );
          });
        if (bowls.length !== 1)
          throw Error("Expected one delivered cistern bowl");
        const bowl = new T.Mesh(bowls[0].geometry, material);
        bowl.matrixAutoUpdate = false;
        bowl.matrixWorld.copy(bowls[0].matrixWorld);
        const centre = tank.group.getWorldPosition(new T.Vector3()),
          axis = gauge.glass.getWorldPosition(new T.Vector3());
        gauges.push({ tank, gauge, axis });
        report.gauges++;
        for (const mesh of gauge.root.children)
          for (const attribute of Object.values(mesh.geometry.attributes))
            for (const value of attribute.array)
              if (!Number.isFinite(value)) report.nonfinite++;
        gauge.glass.geometry.computeBoundingBox();
        const glassBounds = gauge.glass.geometry.boundingBox;
        // Stay inside the delivered Float32 end rings when casting across a
        // sidewall; nominal decimal endpoints can round just above the last ring.
        for (const y of [
          glassBounds.min.y + 1e-5,
          0.7,
          1,
          1.7,
          2.8,
          glassBounds.max.y - 1e-5,
        ])
          for (let n = 0; n < 16; n++) {
            const direction = new T.Vector3(
                Math.sin((n * Math.PI) / 8),
                0,
                Math.cos((n * Math.PI) / 8),
              ),
              middle = new T.Vector3(axis.x, centre.y + y, axis.z);
            ray.set(
              middle.clone().addScaledVector(direction, 0.4),
              direction.clone().negate(),
            );
            const glass = ray.intersectObject(gauge.glass, false)[0];
            report.glassRays++;
            if (!glass) {
              report.missingGlass++;
              continue;
            }
            const outward = new T.Vector3(
              glass.point.x - centre.x,
              0,
              glass.point.z - centre.z,
            ).normalize();
            ray.set(
              centre
                .clone()
                .addScaledVector(outward, tank.radius + 1)
                .setY(glass.point.y),
              outward.clone().negate(),
            );
            const stone = ray.intersectObject(bowl, false)[0];
            if (!stone) {
              report.embeddedGlass++;
              continue;
            }
            const gap =
              Math.hypot(glass.point.x - centre.x, glass.point.z - centre.z) -
              Math.hypot(stone.point.x - centre.x, stone.point.z - centre.z);
            report.minimumStoneClearance = Math.min(
              report.minimumStoneClearance,
              gap,
            );
            if (gap < 0.014) report.embeddedGlass++;
          }
        const p = gauge.frame.geometry.attributes.position,
          ends = new Map();
        for (let i = 0; i < p.count; i++)
          if (p.getZ(i) < -0.31999 && Math.abs(p.getX(i)) < 0.031) {
            const point = new T.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(gauge.frame.matrixWorld);
            ends.set(
              point
                .toArray()
                .map((v) => Math.round(v * 1e6))
                .join(","),
              point,
            );
          }
        for (const point of ends.values()) {
          const direction = new T.Vector3(
              point.x - centre.x,
              0,
              point.z - centre.z,
            ).normalize(),
            start = centre
              .clone()
              .addScaledVector(direction, tank.radius + 1)
              .setY(point.y),
            distance = start.distanceTo(point);
          ray.set(start, direction.clone().negate());
          const hits = [
            ...new Set(
              ray
                .intersectObject(bowl, false)
                .map((h) => Math.round(h.distance * 1e5) / 1e5),
            ),
          ];
          report.bracketEnds++;
          if (hits.filter((d) => d < distance).length % 2 !== 1)
            report.unsupportedEnds++;
        }
        // The merged bronze still carries the actual socket after construction.
        const bronze = tank.group.children.filter(
            (m) =>
              m.isMesh && m.material?.name === "Engraved observatory bronze",
          ),
          light = tank.lamp.getWorldPosition(new T.Vector3());
        ray.set(light, new T.Vector3(0, -1, 0));
        const socket = ray.intersectObjects(bronze, false)[0];
        report.lampSockets++;
        if (!socket || socket.distance > 0.11 || socket.distance < 0.05)
          report.missingSockets++;
      }
    for (let sample = 0; sample <= 8; sample++) {
      for (const site of game.hydraulicSites)
        site.display = site.state.capacity.map((c) => (c * sample) / 8);
      updateHydraulicCourts(game, 0);
      game.world.updateMatrixWorld(true);
      for (const { tank, gauge, axis } of gauges) {
        const water = tank.surface.getWorldPosition(new T.Vector3()).y,
          float = gauge.float.getWorldPosition(new T.Vector3()),
          p = gauge.liquid.geometry.attributes.position;
        let top = -Infinity;
        for (let i = 0; i < p.count; i++)
          top = Math.max(
            top,
            new T.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(gauge.liquid.matrixWorld).y,
          );
        const error = Math.max(
          Math.abs(top - water),
          Math.abs(float.y - water),
        );
        report.levelChecks++;
        report.maximumLevelError = Math.max(report.maximumLevelError, error);
        const sphere = gauge.float.geometry.attributes.position;
        for (let i = 0; i < sphere.count; i++) {
          const point = new T.Vector3()
              .fromBufferAttribute(sphere, i)
              .applyMatrix4(gauge.float.matrixWorld),
            delta = new T.Vector3(point.x - axis.x, 0, point.z - axis.z),
            radius = delta.length();
          if (radius < 1e-6) continue;
          ray.set(new T.Vector3(axis.x, point.y, axis.z), delta.normalize());
          const glass = ray.intersectObject(gauge.glass, false)[0];
          report.floatRays++;
          if (!glass) {
            report.missingInnerGlass++;
            continue;
          }
          const gap = glass.distance - radius;
          report.minimumFloatClearance = Math.min(
            report.minimumFloatClearance,
            gap,
          );
          if (gap < 0.025) report.intersectingFloats++;
        }
      }
    }
  } finally {
    game.hydraulicSites.forEach((s, i) => (s.display = original[i]));
    updateHydraulicCourts(game, 0);
    game.world.updateMatrixWorld(true);
    material.dispose();
  }
  return report;
}
