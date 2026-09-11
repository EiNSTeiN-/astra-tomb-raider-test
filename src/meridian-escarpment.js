import * as THREE from "three";
import { desertNoise as noise } from "./desert-geology.js";
import { meridianRockMaterial } from "./meridian-rock-material.js";

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Eroded shelves encircle the observatory basin. Cartesian fault and gully
// samples cross the radial mesh rather than repeating with its spokes.
export function meridianHeight(angle, across, extent) {
  const radius = extent * 0.75 + across * 250,
    x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius;
  const wx = x + (noise(x * 0.008, z * 0.008, 317) - 0.5) * 70,
    wz = z + (noise(x * 0.009, z * 0.009, 739) - 0.5) * 60;
  const crown =
      0.3 + noise(Math.cos(angle) * 4, Math.sin(angle) * 4, 283) * 0.15,
    u = across / crown,
    inner =
      0.27 * smooth(0, 0.48, u) +
      0.63 * smooth(0.43, 0.8, u) +
      0.1 * smooth(0.78, 1, u),
    flank = inner * (1 - smooth(0.67, 1, across));
  const highland = noise(wx * 0.007, wz * 0.007, 113),
    fault = noise(wx * 0.019, wz * 0.019, 881),
    peak = 58 + highland * 70 + smooth(0.33, 0.68, fault) * 28;
  const ridge = 1 - Math.abs(noise(wx * 0.042, wz * 0.042, 523) * 2 - 1),
    gully = (1 - ridge) ** 2 * 48,
    chips = (noise(wx * 0.13, wz * 0.13, 109) - 0.5) * 5;
  const bedHeight = flank * (peak - gully + chips),
    bed = bedHeight / 14,
    fraction = bed - Math.floor(bed),
    shelf = (Math.floor(bed) + smooth(0.32, 0.68, fraction)) * 14;
  return -18 + bedHeight * 0.4 + shelf * 0.6;
}

export function meridianGeometry(extent) {
  const segments = 640,
    rings = 64,
    positions = [],
    uv = [],
    indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings,
      radius = extent * 0.75 + t * 250;
    for (let i = 0; i <= segments; i++) {
      const angle = ((i % segments) / segments) * Math.PI * 2;
      positions.push(
        extent / 2 + Math.cos(angle) * radius,
        meridianHeight(angle, t, extent),
        extent / 2 + Math.sin(angle) * radius,
      );
      uv.push(i / segments, t);
      if (ring < rings && i < segments) {
        const a = ring * (segments + 1) + i;
        indices.push(
          a,
          a + 1,
          a + segments + 1,
          a + 1,
          a + segments + 2,
          a + segments + 1,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  for (let ring = 0; ring <= rings; ring++) {
    const a = ring * (segments + 1),
      b = a + segments;
    const n = new THREE.Vector3()
      .fromBufferAttribute(normal, a)
      .add(new THREE.Vector3().fromBufferAttribute(normal, b))
      .normalize();
    normal.setXYZ(a, n.x, n.y, n.z);
    normal.setXYZ(b, n.x, n.y, n.z);
  }
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius: extent * 0.75, depth: 250 };
  return geometry;
}

export function buildMeridianEscarpment(game) {
  const mesh = new THREE.Mesh(
    meridianGeometry(game.map.size * 7),
    meridianRockMaterial(game.darkMat, game.scene.fog.color),
  );
  mesh.name = "Meridian escarpment";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.excludeContact = true;
  // Resolve overlapping distant slopes before clearing their depth for the
  // playable world. The sky is drawn first, in the same background interval.
  mesh.onAfterRender = (renderer) => renderer.clearDepth();
  game.world.add(mesh);
}
