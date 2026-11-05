import * as THREE from "three";
import { boxEntry, convexEntry } from "./camera-collision.js";

// The front and buried back share the same local U/V grid. Each matching
// triangle pair bounds a convex stone cell, including its actual side planes.
export class JungleCragCamera {
  constructor(geometry) {
    this.grid = new Map();
    const p = geometry.attributes.position,
      uv = geometry.attributes.cragGrid,
      back = geometry.attributes.cragBack,
      index = geometry.index,
      key = (i) => `${uv.getX(i).toFixed(7)},${uv.getY(i).toFixed(7)}`,
      point = (i) => new THREE.Vector3().fromBufferAttribute(p, i),
      lower = new Map();
    for (let i = 0; i < p.count; i++)
      if (back.getX(i)) lower.set(key(i), point(i));
    for (let i = 0; i < index.count; i += 3) {
      const ids = [0, 1, 2].map((j) => index.getX(i + j));
      if (ids.some((id) => back.getX(id))) continue;
      const front = ids.map(point),
        rear = ids.map((id) => lower.get(key(id)));
      if (rear.some((p) => !p)) throw Error("Crag camera needs a paired back");
      const center = [...front, ...rear]
          .reduce((s, v) => s.add(v), new THREE.Vector3())
          .multiplyScalar(1 / 6),
        planes = [],
        plane = (a, b, c) => {
          const n = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
          if (n.dot(center.clone().sub(a)) > 0) n.negate();
          planes.push([n.x, n.y, n.z, n.dot(a)]);
        };
      plane(...front);
      plane(...rear);
      for (let j = 0; j < 3; j++) plane(front[j], front[(j + 1) % 3], rear[j]);
      const box = new THREE.Box3().setFromPoints([...front, ...rear]),
        cell = { box, planes };
      for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++)
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
          const k = x + "," + z;
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
        for (const cell of this.grid.get(x + "," + z) || []) cells.add(cell);
    for (const cell of cells) {
      if (boxEntry(from, to, cell.box, radius, true) === null) continue;
      const t = convexEntry(from, to, cell.planes, radius);
      if (t !== null) result = Math.min(result ?? 1, t);
    }
    return result;
  }
}
