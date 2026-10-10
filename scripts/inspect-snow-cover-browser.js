// Geometry inspection on a fully loaded snow chapter. Root rays use the actual
// delivered terrain vertex/index buffers; they do not reuse the seating sampler.
import * as THREE from "three";

export function inspectSnowGroundcover(game) {
  if (!game.snowGroundcover)
    throw Error("Load the snow chapter and its visual assets first");
  const meadow = game.snowGroundcover,
    roots = meadow.specimens.map((specimen) => {
      const unique = new Map();
      for (const geometry of specimen.tiers) {
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++)
          if (p.getY(i) === 0)
            unique.set(
              `${p.getX(i)},${p.getZ(i)}`,
              new THREE.Vector3(p.getX(i), 0, p.getZ(i)),
            );
      }
      return [...unique.values()];
    }),
    chunks = new Map();
  game.world.updateMatrixWorld(true);
  for (const mesh of game.terrainMeshes) {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      params = mesh.geometry.parameters;
    if (!params?.widthSegments)
      throw Error("Expected an indexed snow terrain chunk");
    chunks.set(
      `${Math.floor((b.min.x + 0.001) / 49)},${Math.floor((b.min.z + 0.001) / 49)}`,
      {
        mesh,
        bounds: b,
        nx: params.widthSegments,
        nz: params.heightSegments,
        dx: (b.max.x - b.min.x) / params.widthSegments,
        dz: (b.max.z - b.min.z) / params.heightSegments,
      },
    );
  }
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
    packed = new THREE.Matrix4(),
    point = new THREE.Vector3(),
    hit = new THREE.Vector3(),
    vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let rootProbes = 0,
    highestRootGap = -Infinity,
    mostBuriedFraction = 0;
  const failures = [];
  for (const plant of meadow.plants) {
    const shape = meadow.specimens[plant.variant];
    // InstancedMesh delivers Float32 transforms even when placement used doubles.
    packed.fromArray(new Float32Array(plant.matrix.elements));
    for (const root of roots[plant.variant]) {
      point.copy(root).applyMatrix4(packed);
      const chunk = chunks.get(
        `${Math.floor(point.x / 49)},${Math.floor(point.z / 49)}`,
      );
      if (!chunk) throw Error("Root has no terrain chunk");
      const { mesh, bounds, nx, nz, dx, dz } = chunk,
        ix = Math.min(
          nx - 1,
          Math.max(0, Math.floor((point.x - bounds.min.x) / dx)),
        ),
        iz = Math.min(
          nz - 1,
          Math.max(0, Math.floor((point.z - bounds.min.z) / dz)),
        ),
        offset = (iz * nx + ix) * 6,
        index = mesh.geometry.index;
      ray.origin.set(point.x, point.y + 10, point.z);
      let ground = null;
      for (let t = 0; t < 2; t++) {
        for (let k = 0; k < 3; k++)
          vertices[k]
            .fromBufferAttribute(
              mesh.geometry.attributes.position,
              index.getX(offset + t * 3 + k),
            )
            .applyMatrix4(mesh.matrixWorld);
        if (ray.intersectTriangle(...vertices, false, hit)) {
          ground = hit.y;
          break;
        }
      }
      const gap = ground === null ? Infinity : point.y - ground;
      rootProbes++;
      highestRootGap = Math.max(highestRootGap, gap);
      mostBuriedFraction = Math.max(
        mostBuriedFraction,
        -gap / (shape.height * plant.size),
      );
      if (gap > -0.007 && failures.length < 20)
        failures.push({
          type: "root",
          variant: plant.variant,
          point: point.toArray(),
          ground,
          gap,
        });
    }
    const radius = shape.radius * plant.size;
    for (const o of game.obstacles)
      if (
        Math.abs(plant.x - o.x) < o.w + radius + 0.19 &&
        Math.abs(plant.z - o.z) < o.d + radius + 0.19 &&
        failures.length < 20
      )
        failures.push({
          type: "obstacle",
          plant: [plant.x, plant.z],
          obstacle: [o.x, o.z],
        });
    for (const gate of game.fieldGates)
      if (
        Math.abs(plant.x - gate.root.position.x) < 12.5 + radius &&
        Math.abs(plant.z - gate.root.position.z) < 12.5 + radius &&
        failures.length < 20
      )
        failures.push({ type: "door-envelope", plant: [plant.x, plant.z] });
  }
  const gl = game.renderer.getContext();
  return {
    stats: meadow.stats,
    patches: meadow.patches.length,
    rootProbes,
    highestRootGap,
    mostBuriedFraction,
    failures,
    tiers: meadow.specimens.map((s) =>
      s.tiers.map((g) => g.attributes.position.count / 3),
    ),
    visible: meadow.patches.reduce(
      (sum, p) => sum.map((n, i) => n + (p.counts[i] || 0)),
      [0, 0, 0],
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
