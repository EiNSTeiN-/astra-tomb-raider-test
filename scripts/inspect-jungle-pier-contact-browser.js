// Read the delivered batched masonry and independent terrain triangles.
// Sample the inner 88% of each base width; its outer moulding projects beyond
// the footing. The optional lift supplies a deliberately detached control.
// This observer does not call the foundation planner or use its height bounds
// to decide whether the rendered stone connects to the terrain.
import * as T from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";
export function inspectJunglePierContacts(game, lift = 0) {
  const g = game,
    ground = terrainTriangleReader(g.terrainMeshes),
    results = [],
    material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    ray = new T.Raycaster();
  g.world.updateMatrixWorld(true);
  for (const [index, patch] of g.templePatches.entries())
    for (const [pierIndex, pier] of patch.plan.piers.entries()) {
      const x = patch.root.position.x + pier.x,
        z = patch.root.position.z + pier.z,
        half = (pier.width + 0.25) / 2,
        center = g.groundHeight(x, z) + lift,
        vertices = [];
      patch.root.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position,
          ix = o.geometry.index,
          n = ix?.count ?? p.count;
        for (let i = 0; i < n; i += 3) {
          const v = [0, 1, 2].map((j) =>
            new T.Vector3()
              .fromBufferAttribute(p, ix ? ix.getX(i + j) : i + j)
              .applyMatrix4(o.matrixWorld)
              .add(new T.Vector3(0, lift, 0)),
          );
          if (
            Math.max(...v.map((p) => p.x)) >= x - half - 0.1 &&
            Math.min(...v.map((p) => p.x)) <= x + half + 0.1 &&
            Math.max(...v.map((p) => p.z)) >= z - half - 0.1 &&
            Math.min(...v.map((p) => p.z)) <= z + half + 0.1
          )
            vertices.push(...v.flatMap((p) => p.toArray()));
        }
      });
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(vertices, 3),
      );
      geometry.computeBoundingBox();
      const mesh = new T.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const row = {
        index,
        pierIndex,
        x,
        z,
        center,
        half,
        faces: vertices.length / 9,
        minimumBottomGap: Infinity,
        maximumBottomGap: -Infinity,
        maxOpenGap: 0,
        open: 0,
        missing: 0,
        queries: 0,
        witness: null,
        foundations: patch.foundations.filter(
          (f) => f.x === pier.x && f.z === pier.z,
        ),
      };
      for (let u = 0; u < 9; u++)
        for (let v = 0; v < 9; v++) {
          const px = x + half * 0.88 * (u / 4 - 1) + 0.0013,
            pz = z + half * 0.88 * (v / 4 - 1) - 0.0017,
            floor = ground(px, pz),
            target = center + 0.06;
          ray.set(
            new T.Vector3(px, geometry.boundingBox.min.y - 1, pz),
            new T.Vector3(0, 1, 0),
          );
          const events = ray
            .intersectObject(mesh, false)
            .filter((h) => Math.abs(h.face.normal.y) > 1e-6);
          let depth = 0,
            start = null;
          const intervals = [];
          for (const h of events) {
            if (h.face.normal.y < 0) {
              if (depth === 0) start = h.point.y;
              depth++;
            } else {
              depth--;
              if (depth === 0 && start !== null) {
                intervals.push([start, h.point.y]);
                start = null;
              }
            }
          }
          row.queries++;
          if (!Number.isFinite(floor) || !intervals.length || depth !== 0) {
            row.missing++;
            continue;
          }
          const bottomGap = intervals[0][0] - floor;
          row.minimumBottomGap = Math.min(row.minimumBottomGap, bottomGap);
          row.maximumBottomGap = Math.max(row.maximumBottomGap, bottomGap);
          let cursor = floor,
            maxGap = 0;
          for (const [a, b] of intervals) {
            if (b < cursor) continue;
            if (a > cursor && cursor < target)
              maxGap = Math.max(maxGap, Math.min(a, target) - cursor);
            cursor = Math.max(cursor, b);
            if (cursor >= target) break;
          }
          if (cursor < target) maxGap = Math.max(maxGap, target - cursor);
          if (maxGap > row.maxOpenGap) {
            row.maxOpenGap = maxGap;
            row.witness = {
              point: [px, pz],
              floor,
              target,
              intervals,
              bottomGap,
              maxGap,
            };
          }
          if (maxGap > 0.003) row.open++;
        }
      geometry.dispose();
      results.push(row);
    }
  material.dispose();
  return results;
}
