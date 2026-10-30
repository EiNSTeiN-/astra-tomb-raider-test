// Development-only observer of the actual merged column meshes and rendered
// terrain. Samples unique underside vertices and face centroids. These samples
// do not certify every point of the footprint or body contact.
import * as T from "three";

export function inspectBasaltFoundations(g) {
  if (!g.terrainMeshes?.length || !g.volcanicOutcrops?.clusters.length)
    throw new Error(
      "Load volcanic terrain and column meshes before inspection.",
    );
  g.world.updateMatrixWorld(true);
  const ray = new T.Raycaster(),
    terrain = g.terrainMeshes.map((mesh) => ({
      mesh,
      box: new T.Box3().setFromObject(mesh),
    })),
    rows = [];
  const down = new T.Vector3(0, -1, 0),
    ground = (p) => {
      const chunks = terrain
        .filter(
          (c) =>
            p.x >= c.box.min.x - 0.001 &&
            p.x <= c.box.max.x + 0.001 &&
            p.z >= c.box.min.z - 0.001 &&
            p.z <= c.box.max.z + 0.001,
        )
        .map((c) => c.mesh);
      ray.set(new T.Vector3(p.x, 1000, p.z), down);
      return ray.intersectObjects(chunks, false)[0]?.point.y;
    };
  for (const c of g.volcanicOutcrops.clusters) {
    if (c.mesh.geometry.index)
      throw new Error("Expected the delivered nonindexed merged column mesh.");
    const pos = c.mesh.geometry.attributes.position,
      points = new Map();
    let triangles = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const v = [0, 1, 2].map((j) =>
        new T.Vector3()
          .fromBufferAttribute(pos, i + j)
          .applyMatrix4(c.mesh.matrixWorld),
      );
      if (new T.Triangle(...v).getNormal(new T.Vector3()).y > -0.95) continue;
      triangles++;
      const center = v[0]
        .clone()
        .add(v[1])
        .add(v[2])
        .multiplyScalar(1 / 3);
      for (const p of [...v, center])
        points.set(
          p
            .toArray()
            .map((n) => n.toFixed(5))
            .join(","),
          p,
        );
    }
    if (!points.size)
      throw new Error("No merged column underside was inspected.");
    let min = Infinity,
      max = -Infinity,
      missing = 0,
      exposed = 0;
    for (const p of points.values()) {
      const y = ground(p);
      if (y == null) {
        missing++;
        continue;
      }
      const cover = y - p.y;
      min = Math.min(min, cover);
      max = Math.max(max, cover);
      exposed += cover < -0.015;
    }
    rows.push({
      room: c.plan.room,
      bottomTriangles: triangles,
      points: points.size,
      minCover: min,
      maxCover: max,
      missing,
      exposed,
    });
  }
  return rows;
}
