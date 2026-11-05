import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { desertNoise as noise } from "./desert-geology.js";
import { fitTerrainNormals } from "./terrain-shading.js";

export function cragPoint(extent, side, along, depth, y) {
  return [
    [along, y, depth],
    [extent - depth, y, along],
    [extent - along, y, extent - depth],
    [depth, y, extent - along],
  ][side];
}

function height(profile, side, along, depth) {
  const [x, , z] = cragPoint(profile.extent, side, along, depth, 0);
  return (profile.surfaceHeight || profile.height)(x, z);
}

// First visible intersection when looking outward from the valley. Sampling
// the real triangle height also resolves the terrain grid's internal diagonal.
export function cragFaceDepth(profile, side, along, y) {
  const step = profile.step / 2;
  let inward = 28;
  if (height(profile, side, along, inward) >= y) return null;
  for (let d = inward - step; d >= 3.5; d -= step) {
    if (height(profile, side, along, d) >= y) {
      let outer = d;
      for (let i = 0; i < 16; i++) {
        const mid = (outer + inward) / 2;
        if (height(profile, side, along, mid) >= y) outer = mid;
        else inward = mid;
      }
      return (outer + inward) / 2;
    }
    inward = d;
  }
  return null;
}

export function jungleCragCandidates(map, level, profile) {
  if (level.biome !== "jungle") return [];
  const result = [];
  for (let side = 0; side < 4; side++)
    for (let along = 15; along < profile.extent - 15; along += 11) {
      const width = 16 + noise(along * 0.17, side * 3, level.seed + 415) * 5;
      let low = -Infinity,
        top = Infinity;
      for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const a = along + u * width;
        low = Math.max(low, height(profile, side, a, 27) + 1);
        let crest = -Infinity;
        for (let d = 4; d <= 24; d += profile.step / 2)
          crest = Math.max(crest, height(profile, side, a, d));
        top = Math.min(top, crest - 1.8);
      }
      if (top - low < 7) continue;
      result.push({
        id: `jungle-crag-${side}-${along}`,
        side,
        along,
        width,
        low,
        top,
        score: top - low + noise(along * 0.07, side, level.seed + 831) * 6,
      });
    }
  return result.sort(
    (a, b) => b.score - a.score || a.side - b.side || a.along - b.along,
  );
}

// Closed lobes intersect the existing hillside at every perimeter edge. Their
// backs remain buried; the front carries irregular ribs and unequal ledges.
export function jungleCragGeometry(profile, level, site, layer, id) {
  const cuts = [0, 0.21, 0.48, 0.75, 1],
    low = site.low + (site.top - site.low) * cuts[layer] + 0.09,
    high = site.low + (site.top - site.low) * cuts[layer + 1] - 0.09,
    rows = [0, 0.08, 0.24, 0.45, 0.69, 0.87, 1],
    cols = Math.ceil(site.width / 1.25),
    stride = cols + 1,
    count = stride * rows.length,
    vertices = [],
    uv = [],
    grid = [],
    backs = [],
    indices = [];
  for (let back = 0; back < 2; back++)
    for (const v of rows)
      for (let col = 0; col <= cols; col++) {
        const u = col / cols,
          envelope = Math.max(
            0,
            Math.min(1, u / 0.22, (1 - u) / 0.18, v / 0.15, (1 - v) / 0.12),
          ),
          taper = 0.83 + 0.17 * Math.sin(v * Math.PI),
          lean = (noise(site.along, layer, level.seed + 991) - 0.5) * 0.22,
          offset = (noise(site.along, layer * 4, level.seed + 297) - 0.5) * 0.2,
          along =
            site.along +
            ((u - 0.5) * taper + lean * (v - 0.5) + offset) * site.width,
          edge =
            -0.02 + noise(u * 3 + site.along, layer, level.seed + 535) * 0.08,
          y =
            low +
            (high - low) * (v + edge * (1 - 2 * v)) +
            (u - 0.5) * (high - low) * 0.35,
          face = cragFaceDepth(profile, site.side, along, y);
        if (face === null || face < 5) return null;
        const rib = noise(along * 0.8, y * 0.27, level.seed + site.side * 71),
          relief = -0.6 + envelope * (1.05 + rib * 0.9),
          d = face + (back ? -3 : relief),
          p = cragPoint(profile.extent, site.side, along, d, y);
        vertices.push(...p);
        uv.push(p[0] / 4, p[2] / 4);
        grid.push(u, v);
        backs.push(back);
      }
  for (let row = 0; row < rows.length - 1; row++)
    for (let col = 0; col < cols; col++) {
      const a = row * stride + col,
        b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
      indices.push(
        count + a,
        count + b,
        count + a + 1,
        count + a + 1,
        count + b,
        count + b + 1,
      );
    }
  const border = [];
  for (let i = 0; i <= cols; i++) border.push(i);
  for (let i = 1; i < rows.length; i++) border.push(i * stride + cols);
  for (let i = cols - 1; i >= 0; i--)
    border.push((rows.length - 1) * stride + i);
  for (let i = rows.length - 2; i > 0; i--) border.push(i * stride);
  // A segment can cross a terrain diagonal or a small erosion hollow even
  // when both anchors are buried. Retreat its perimeter into actual rock.
  const outward = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][site.side];
  for (let pass = 0; pass < 18; pass++) {
    let seated = true;
    for (let i = 0; i < border.length; i++) {
      const a = border[i],
        b = border[(i + 1) % border.length];
      const gap = [0, 0.25, 0.5, 0.75, 1].some((t) => {
        const p = [0, 1, 2].map(
          (axis) =>
            vertices[a * 3 + axis] * (1 - t) + vertices[b * 3 + axis] * t,
        );
        return (
          (profile.surfaceHeight || profile.height)(p[0], p[2]) - p[1] < 0.05
        );
      });
      if (!gap) continue;
      seated = false;
      for (const id of [a, b]) {
        const front = id * 3,
          rear = (count + id) * 3;
        if (
          Math.hypot(
            vertices[front] - vertices[rear],
            vertices[front + 2] - vertices[rear + 2],
          ) < 0.35
        )
          return null;
        vertices[front] += outward[0] * 0.12;
        vertices[front + 2] += outward[1] * 0.12;
      }
    }
    if (seated) break;
    if (pass === 17) return null;
  }
  for (let i = 0; i < border.length; i++) {
    const a = border[i],
      b = border[(i + 1) % border.length];
    indices.push(a, count + a, b, b, count + a, count + b);
  }
  // Back-face interiors must be seated too, not only the anchor or corners.
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    if (ids.some((i) => !backs[i])) continue;
    for (const weights of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1 / 3, 1 / 3, 1 / 3],
      [0.5, 0.5, 0],
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
    ]) {
      const p = [0, 1, 2].map((axis) =>
        ids.reduce((n, id, k) => n + vertices[id * 3 + axis] * weights[k], 0),
      );
      if ((profile.surfaceHeight || profile.height)(p[0], p[2]) - p[1] < 0.05)
        return null;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    "court",
    new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3), 1),
  );
  geometry.setAttribute(
    "trail",
    new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3), 1),
  );
  geometry.setAttribute("cragBack", new THREE.Float32BufferAttribute(backs, 1));
  geometry.setAttribute("cragGrid", new THREE.Float32BufferAttribute(grid, 2));
  geometry.setAttribute(
    "cragPart",
    new THREE.Float32BufferAttribute(
      new Float32Array(backs.length).fill(id),
      1,
    ),
  );
  geometry.setIndex(indices);
  const result = toCreasedNormals(geometry, 0.55);
  geometry.dispose();
  result.setIndex(
    Array.from({ length: result.attributes.position.count }, (_, i) => i),
  );
  fitTerrainNormals(result);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
