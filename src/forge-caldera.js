import * as THREE from "three";
import { desertNoise as rockNoise } from "./desert-geology.js";
import { calderaMaterial } from "./caldera-material.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A broad inner escarpment and its outer apron share a continuous heightfield.
// Noise is sampled in Cartesian space, so gullies branch across the slope
// instead of repeating as radial stripes or identical triangular peaks.
export function calderaHeight(angle, across, extent) {
  const radius = extent * 0.745 + across * 230,
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius;
  const crest =
    0.34 + rockNoise(Math.cos(angle) * 3, Math.sin(angle) * 3, 913) * 0.16;
  const crownX = Math.cos(angle) * 420,
    crownZ = Math.sin(angle) * 420;
  const peak =
    87 +
    rockNoise(crownX * 0.009, crownZ * 0.009, 173) * 62 +
    rockNoise(crownX * 0.027, crownZ * 0.027, 379) * 22;
  const u = Math.min(1, across / crest),
    inward =
      0.55 * Math.pow(Math.sin(u * Math.PI * 0.5), 1.7) +
      0.45 * smooth(0.53, 0.75, u),
    outward = 1 - smooth(crest, 1, across),
    flank = inward * outward;
  const wx = x + (rockNoise(x * 0.014, z * 0.014, 557) - 0.5) * 34,
    wz = z + (rockNoise(x * 0.013, z * 0.013, 811) - 0.5) * 34;
  const ridge = 1 - Math.abs(rockNoise(wx * 0.033, wz * 0.033, 229) * 2 - 1),
    fine = rockNoise(wx * 0.11, wz * 0.11, 701),
    eroded = flank * (peak - (1 - ridge) ** 2 * 32 + (fine - 0.5) * 7);
  const beds = Math.tanh(
    Math.sin(eroded * 0.26 + rockNoise(wx * 0.028, wz * 0.028, 991) * 2) * 2,
  );
  return -16 + eroded + beds * 1.6 * Math.sin(across * Math.PI);
}

export function calderaGeometry(extent) {
  const segments = 512,
    rings = 64,
    vertices = [],
    uv = [],
    indices = [];
  for (let ring = 0; ring <= rings; ring++)
    for (let i = 0; i <= segments; i++) {
      const a = ((i % segments) / segments) * Math.PI * 2,
        t = ring / rings;
      const radius = extent * 0.745 + 230 * t;
      vertices.push(
        extent / 2 + Math.cos(a) * radius,
        calderaHeight(a, t, extent),
        extent / 2 + Math.sin(a) * radius,
      );
      uv.push(i / segments, t);
      if (ring < rings && i < segments) {
        const n = ring * (segments + 1) + i;
        indices.push(
          n,
          n + 1,
          n + segments + 1,
          n + 1,
          n + segments + 2,
          n + segments + 1,
        );
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let ring = 0; ring <= rings; ring++) {
    const a = ring * (segments + 1),
      b = a + segments;
    const n = new THREE.Vector3()
      .fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b))
      .normalize();
    normals.setXYZ(a, ...n.toArray());
    normals.setXYZ(b, ...n.toArray());
  }
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius: extent * 0.745, depth: 230 };
  return geometry;
}

export function buildForgeCaldera(game) {
  const material = calderaMaterial(game.darkMat, game.scene.fog.color);
  const mesh = new THREE.Mesh(calderaGeometry(game.map.size * 7), material);
  mesh.name = "Eroded caldera rim";
  // Like the cloud-city ranges, this distant background gets a full-precision
  // depth interval of its own. Clear it before rendering the playable world,
  // retaining the ridge color and its correctly ordered overlapping slopes.
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.excludeContact = true;
  mesh.onAfterRender = (renderer) => renderer.clearDepth();
  game.world.add(mesh);
}
