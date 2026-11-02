import * as THREE from "three";
import { boxEntry, convexEntry } from "./camera-collision.js";

// Closed height-field shells have matching upper/lower XZ vertices. Keep each
// delivered top triangle and its actual lower face as a convex camera cell.
// An XZ index avoids testing every roof triangle during a nearby camera orbit.
export class RoofCamera {
  constructor(geometry) {
    this.grid = new Map();
    const p = geometry.attributes.position,
      index = geometry.index,
      lower = new Map(),
      key = (v) => `${v.x.toFixed(5)},${v.z.toFixed(5)}`,
      vertex = (i) =>
        new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i) : i);
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i),
        k = key(v);
      lower.set(k, Math.min(lower.get(k) ?? Infinity, v.y));
    }
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const top = [0, 1, 2].map((j) => vertex(i + j)),
        normal = new THREE.Triangle(...top).getNormal(new THREE.Vector3());
      if (normal.y < 1e-6) continue;
      const bottom = top.map(
        (v) => new THREE.Vector3(v.x, lower.get(key(v)), v.z),
      );
      if (top.some((v, i) => v.y - bottom[i].y < 0.001))
        throw Error("Roof camera needs a closed height-field shell");
      const planes = [
          [normal.x, normal.y, normal.z, normal.dot(top[0]) + 1e-6],
        ],
        below = new THREE.Triangle(...bottom)
          .getNormal(new THREE.Vector3())
          .negate(),
        center = top
          .reduce((c, v) => c.add(v), new THREE.Vector3())
          .multiplyScalar(1 / 3);
      planes.push([below.x, below.y, below.z, below.dot(bottom[0]) + 1e-6]);
      for (let j = 0; j < 3; j++) {
        const a = top[j],
          b = top[(j + 1) % 3],
          n = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize();
        if (n.dot(center) - n.dot(a) > 0) n.negate();
        planes.push([n.x, 0, n.z, n.dot(a) + 1e-6]);
      }
      const box = new THREE.Box3().setFromPoints([...top, ...bottom]),
        cell = { box, planes };
      for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++)
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
          const k = `${x},${z}`;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(cell);
        }
    }
  }
  entry(from, to, radius = 0) {
    const cells = new Set();
    let result = null;
    for (
      let z = Math.floor(Math.min(from.z, to.z) - radius);
      z <= Math.floor(Math.max(from.z, to.z) + radius);
      z++
    )
      for (
        let x = Math.floor(Math.min(from.x, to.x) - radius);
        x <= Math.floor(Math.max(from.x, to.x) + radius);
        x++
      )
        for (const cell of this.grid.get(`${x},${z}`) || []) cells.add(cell);
    for (const cell of cells) {
      if (boxEntry(from, to, cell.box, radius, true) === null) continue;
      const t = convexEntry(from, to, cell.planes, radius);
      if (t !== null) result = Math.min(result ?? 1, t);
    }
    return result;
  }
}
