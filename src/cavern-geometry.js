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

// Six-sided prism with an offset termination; separate faces retain hard facets.
export function quartzGeometry(radius, height, phase = 0) {
  const vertices = [],
    uv = [];
  const point = (i, y, r) => [
    Math.cos((i * Math.PI) / 3 + phase) * r,
    y,
    Math.sin((i * Math.PI) / 3 + phase) * r,
  ];
  const tip = [radius * 0.2, height, -radius * 0.13];
  const push = (...points) => {
    for (const p of points) {
      vertices.push(...p);
      uv.push(p[0], p[1] / height);
    }
  };
  for (let i = 0; i < 6; i++) {
    const a = point(i, 0, radius),
      b = point(i + 1, 0, radius);
    const c = point(i, height * 0.77, radius * 0.88),
      d = point(i + 1, height * 0.77, radius * 0.88);
    push(a, c, b, b, c, d, c, tip, d, [0, 0, 0], a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
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
