import * as THREE from "three";
import { stationEntry, stationSupport } from "../src/field-station-solids.js";

// Read the delivered, batched masonry and the retained triangle kernel. A broad
// room bound must neither close a window nor become a floor over empty space.
export function inspectDesertCourtWalls(game) {
  game.world.updateMatrixWorld(true);
  const report = {
      walls: 0,
      windows: 0,
      faces: 0,
      supports: 0,
      rims: 0,
      triangles: 0,
      failures: [],
    },
    ray = new THREE.Raycaster(),
    fail = (room, span, kind, data = {}) =>
      report.failures.push({ room, span, kind, ...data });
  for (const patch of game.desertPatches || []) {
    const room = patch.masonryFeature.id,
      solid = patch.masonryFeature.stationSolids[0],
      offset = patch.root.position,
      point = (x, y, z) =>
        new THREE.Vector3(x + offset.x, y + offset.y, z + offset.z),
      hit = (from, to) => {
        const length = from.distanceTo(to);
        ray.set(from, to.clone().sub(from).normalize());
        ray.near = 0;
        ray.far = length;
        return ray.intersectObject(patch.root, true)[0]?.distance / length;
      };
    for (const wall of patch.walls || []) {
      report.walls++;
      report.triangles += wall.triangles;
      const { span } = wall;
      for (const window of wall.openings) {
        const x = wall.x + (window.left + window.right) / 2,
          y = (window.bottom + window.top) / 2,
          a = point(x, y, wall.z - 2),
          b = point(x, y, wall.z + 2),
          rendered = hit(a, b),
          physical = stationEntry(solid, a, b),
          camera = game.cameraSurfaces.entry(a, b);
        report.windows++;
        if (Number.isFinite(rendered) || physical !== null || camera !== 1)
          fail(room, span, "filled window", { rendered, physical, camera });
      }
      for (const rectangle of wall.rectangles) {
        const x = wall.x + (rectangle.left + rectangle.right) / 2,
          y = (rectangle.bottom + rectangle.top) / 2,
          a = point(x, y, wall.z - 2),
          b = point(x, y, wall.z + 2),
          rendered = hit(a, b),
          physical = stationEntry(solid, a, b),
          camera = game.cameraSurfaces.entry(a, b);
        report.faces++;
        if (
          !Number.isFinite(rendered) ||
          physical === null ||
          Math.abs(rendered - physical) > 0.0001 ||
          camera > rendered
        )
          fail(room, span, "face query", { rendered, physical, camera });
        for (const z of [-0.2, 0.2]) {
          const p = point(x, rectangle.top, wall.z + z),
            support = stationSupport(solid, p.x, p.z, p.y + 0.02);
          report.supports++;
          if (support === null || Math.abs(support - p.y) > 0.002)
            fail(room, span, "cap support", { p: p.toArray(), support });
        }
      }
      for (let i = 0; i <= 40; i++)
        for (const sign of [-1, 1]) {
          const p = point(
              wall.x - wall.width / 2 + (wall.width * i) / 40,
              wall.bottom,
              wall.z + (sign * wall.depth) / 2,
            ),
            ground = game.groundHeight(p.x, p.z);
          report.rims++;
          if (p.y > ground - 0.1)
            fail(room, span, "exposed lower rim", { p: p.toArray(), ground });
        }
    }
  }
  return report;
}
