import * as THREE from "three";

export function cavernChunks(profile, chunk = 24) {
  const { width, step, heights, air } = profile;
  const geometries = [];
  for (let z = 0; z < width - 1; z += chunk)
    for (let x = 0; x < width - 1; x += chunk) {
      const nx = Math.min(chunk, width - 1 - x),
        nz = Math.min(chunk, width - 1 - z);
      const positions = [],
        normals = [],
        uv = [],
        indices = [];
      for (let iz = 0; iz <= nz; iz++)
        for (let ix = 0; ix <= nx; ix++) {
          const px = (x + ix) * step,
            pz = (z + iz) * step;
          positions.push(px, heights[(z + iz) * width + x + ix], pz);
          uv.push(px / 5, pz / 5);
          const n = new THREE.Vector3(
            profile.height(px + 0.35, pz) - profile.height(px - 0.35, pz),
            -0.7,
            profile.height(px, pz + 0.35) - profile.height(px, pz - 0.35),
          ).normalize();
          normals.push(n.x, n.y, n.z);
          if (ix === nx || iz === nz) continue;
          const grid = (z + iz) * width + x + ix;
          if (
            [
              air[grid],
              air[grid + 1],
              air[grid + width],
              air[grid + width + 1],
            ].every((h) => h <= 0)
          )
            continue;
          const a = iz * (nx + 1) + ix,
            b = a + 1,
            c = a + nx + 1,
            d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      if (!indices.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(indices);
      g.computeBoundingSphere();
      geometries.push(g);
    }
  return geometries;
}

export { quartzGeometry } from "./mineral-art.js";

// Irregular, shallow rock fans grow around each mineral root. The outer ring
// tucks below the sampled ground instead of leaving a raised circular rim.
export function mineralBedGeometry(x, z, ground, seed) {
  const segments = 32,
    rings = 4,
    base = ground(x, z),
    positions = [0, 0.26, 0],
    uv = [0, 0],
    indices = [];
  let bottom = -0.8;
  for (let ring = 1; ring <= rings; ring++)
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2,
        t = ring / rings,
        radius =
          (1 +
            Math.sin(angle * 3 + seed) * 0.12 +
            Math.sin(angle * 7 - seed) * 0.06) *
          t,
        dx = Math.cos(angle) * 2.8 * radius,
        dz = Math.sin(angle) * 2.4 * radius,
        rise =
          (1 - t) * 0.28 +
          (1 - t) * Math.sin(i * 1.7 + seed) * 0.055 -
          0.14 * t * t,
        y = ground(x + dx, z + dz) - base + rise;
      bottom = Math.min(bottom, y - 0.55);
      positions.push(dx, y, dz);
      uv.push(dx / 5, dz / 5);
    }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
    for (let ring = 1; ring < rings; ring++) {
      const a = 1 + (ring - 1) * segments + i,
        b = 1 + (ring - 1) * segments + next,
        c = 1 + ring * segments + i,
        d = 1 + ring * segments + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  const lower = positions.length / 3,
    outer = 1 + (rings - 1) * segments;
  for (let i = 0; i < segments; i++) {
    const k = (outer + i) * 3;
    positions.push(positions[k], bottom, positions[k + 2]);
    uv.push(0, 0);
  }
  const center = positions.length / 3;
  positions.push(0, bottom, 0);
  uv.push(0, 0);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(
      outer + i,
      outer + next,
      lower + i,
      outer + next,
      lower + next,
      lower + i,
      center,
      lower + i,
      lower + next,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function stalactiteGeometry(radius, height, seed) {
  const points = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return new THREE.Vector2(
      (0.035 + radius * t ** 1.65) * (1 + Math.sin(i * 2.3 + seed) * 0.1),
      height * t,
    );
  });
  return new THREE.LatheGeometry(points, 9);
}
