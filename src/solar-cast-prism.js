import * as THREE from "three";
import { crownPrism } from "./desert-crowns.js";

// Aligned apertures can leave a long cap edge passing through another cap
// vertex. Split that edge at the existing vertices, preserving the outline,
// bevels and UVs. No internal walls or overlapping triangle prisms are added.
export function solarCastPrism(points, depth, holes = [], bevel = 0.008) {
  const original = crownPrism(points, depth, holes, bevel);
  if (!holes.length) return original;
  const { position: p, normal: n, uv } = original.attributes,
    candidates = new Map(),
    output = { position: [], normal: [], uv: [] };
  const vertex = (i) => ({
    p: new THREE.Vector3().fromBufferAttribute(p, i),
    uv: new THREE.Vector2().fromBufferAttribute(uv, i),
  });
  for (let i = 0; i < p.count; i++)
    if (Math.abs(n.getZ(i)) > 0.999)
      candidates.set([p.getX(i), p.getY(i), p.getZ(i)].join(","), vertex(i));
  const emit = (v, normal) => {
    output.position.push(...v.p.toArray());
    output.normal.push(...normal.toArray());
    output.uv.push(...v.uv.toArray());
  };
  let splits = 0;
  for (let i = 0; i < p.count; i += 3) {
    const q = [0, 1, 2].map((j) => vertex(i + j)),
      normal = new THREE.Vector3().fromBufferAttribute(n, i),
      perimeter = [];
    if (Math.abs(normal.z) > 0.999) {
      for (let j = 0; j < 3; j++) {
        const a = q[j],
          b = q[(j + 1) % 3],
          delta = b.p.clone().sub(a.p),
          lengthSquared = delta.lengthSq(),
          edge = [];
        for (const c of candidates.values()) {
          if (Math.abs(c.p.z - a.p.z) > 1e-6) continue;
          const t = c.p.clone().sub(a.p).dot(delta) / lengthSquared;
          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
          if (a.p.clone().addScaledVector(delta, t).distanceTo(c.p) > 1e-6)
            continue;
          edge.push({ t, vertex: c });
        }
        edge.sort((a, b) => a.t - b.t);
        perimeter.push(a, ...edge.map((e) => e.vertex));
      }
    }
    if (perimeter.length > 3) {
      const center = {
        p: q.reduce((s, v) => s.add(v.p), new THREE.Vector3()).divideScalar(3),
        uv: q
          .reduce((s, v) => s.add(v.uv), new THREE.Vector2())
          .divideScalar(3),
      };
      for (let j = 0; j < perimeter.length; j++) {
        emit(center, normal);
        emit(perimeter[j], normal);
        emit(perimeter[(j + 1) % perimeter.length], normal);
      }
      splits++;
    } else {
      for (let j = 0; j < 3; j++)
        emit(q[j], new THREE.Vector3().fromBufferAttribute(n, i + j));
    }
  }
  if (!splits) return original;
  const geometry = new THREE.BufferGeometry();
  for (const [name, array] of Object.entries(output))
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(array, name === "uv" ? 2 : 3),
    );
  original.dispose();
  return geometry;
}
