import * as THREE from "three";

// Segment/slab intersection, including a camera's near-plane clearance.
// A target already inside a prop must be allowed to look outward from it.
export function boxEntry(a, b, box, padding = 0, allowInside = false) {
  let near = 0,
    far = 1,
    inside = true;
  for (const axis of ["x", "y", "z"]) {
    const lo = box.min[axis] - padding,
      hi = box.max[axis] + padding;
    inside &&= a[axis] >= lo && a[axis] <= hi;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < lo || a[axis] > hi) return null;
    } else {
      let enter = (lo - a[axis]) / delta,
        leave = (hi - a[axis]) / delta;
      if (enter > leave) [enter, leave] = [leave, enter];
      near = Math.max(near, enter);
      far = Math.min(far, leave);
      if (near > far) return null;
    }
  }
  return (inside && !allowInside) || near < 0 || near > 1 ? null : near;
}

// Capture primitive bounds before architecture is merged for rendering. Static
// surfaces use a spatial index; the few moving gate parts retain parent transforms.
export class CameraSurfaces {
  constructor(world) {
    this.world = world;
    this.pending = [];
    this.cells = new Map();
    this.dynamic = [];
    this.dynamicGroups = new Map();
    this.cellSize = 16;
    this.capturing = true;
    this.count = 0;
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }
  capture(mesh, { small = false, thin = false } = {}) {
    if (
      !this.capturing ||
      !mesh.material.isMeshStandardMaterial ||
      mesh.material.transparent
    )
      return;
    for (let p = mesh.parent; p; p = p.parent) if (p.userData.actor) return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone(),
      size = box.getSize(new THREE.Vector3());
    if (
      (!small && Math.max(size.x, size.y, size.z) < 2) ||
      (!thin && Math.min(size.x, size.y, size.z) < 0.12)
    )
      return;
    this.pending.push({ mesh, parent: mesh.parent, box });
  }
  rebuild() {
    this.world.updateMatrixWorld(true);
    this.cells.clear();
    this.dynamic = [];
    this.dynamicGroups.clear();
    this.count = this.pending.length;
    for (const entry of this.pending) {
      entry.mesh.updateMatrix();
      const surface = {
        parent: entry.parent,
        local: entry.mesh.matrix.clone(),
        box: entry.box,
        matrix: new THREE.Matrix4(),
        inverse: new THREE.Matrix4(),
        bounds: new THREE.Box3(),
      };
      this.updateSurface(surface);
      let moving = false;
      for (let p = entry.parent; p; p = p.parent)
        moving ||= !!p.userData.cameraDynamic;
      if (moving) {
        this.dynamic.push(surface);
        if (!this.dynamicGroups.has(surface.parent))
          this.dynamicGroups.set(surface.parent, {
            matrix: surface.parent.matrixWorld.clone(),
            surfaces: [],
            bounds: new THREE.Box3(),
          });
        const group = this.dynamicGroups.get(surface.parent);
        group.surfaces.push(surface);
        group.bounds.union(surface.bounds);
      } else
        this.eachCell(surface.bounds.min, surface.bounds.max, (key) => {
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(surface);
        });
    }
    // Release the original meshes and disposed geometries after batching.
    this.pending = [];
    this.capturing = false;
  }
  updateSurface(surface) {
    surface.matrix.multiplyMatrices(surface.parent.matrixWorld, surface.local);
    surface.inverse.copy(surface.matrix).invert();
    surface.bounds.copy(surface.box).applyMatrix4(surface.matrix);
    const elements = surface.matrix.elements;
    surface.scale = Math.min(
      Math.hypot(...elements.slice(0, 3)),
      Math.hypot(...elements.slice(4, 7)),
      Math.hypot(...elements.slice(8, 11)),
    );
  }
  eachCell(min, max, visit) {
    for (
      let z = Math.floor(min.z / this.cellSize);
      z <= Math.floor(max.z / this.cellSize);
      z++
    )
      for (
        let x = Math.floor(min.x / this.cellSize);
        x <= Math.floor(max.x / this.cellSize);
        x++
      )
        visit(`${x},${z}`);
  }
  entry(start, end, radius = 0.28) {
    const candidates = new Set();
    this.eachCell(
      {
        x: Math.min(start.x, end.x) - radius,
        z: Math.min(start.z, end.z) - radius,
      },
      {
        x: Math.max(start.x, end.x) + radius,
        z: Math.max(start.z, end.z) + radius,
      },
      (key) => {
        for (const surface of this.cells.get(key) || [])
          candidates.add(surface);
      },
    );
    for (const [parent, group] of this.dynamicGroups) {
      parent.updateWorldMatrix(true, false);
      if (!parent.matrixWorld.equals(group.matrix)) {
        group.bounds.makeEmpty();
        for (const surface of group.surfaces) {
          this.updateSurface(surface);
          group.bounds.union(surface.bounds);
        }
        group.matrix.copy(parent.matrixWorld);
      }
      if (boxEntry(start, end, group.bounds, radius, true) !== null)
        for (const surface of group.surfaces) candidates.add(surface);
    }
    let result = 1;
    this.lastCandidates = candidates.size;
    for (const surface of candidates) {
      let visible = true;
      for (let p = surface.parent; p; p = p.parent)
        if (!p.visible) {
          visible = false;
          break;
        }
      if (
        !visible ||
        boxEntry(start, end, surface.bounds, radius, true) === null
      )
        continue;
      this.a.copy(start).applyMatrix4(surface.inverse);
      this.b.copy(end).applyMatrix4(surface.inverse);
      const t = boxEntry(
        this.a,
        this.b,
        surface.box,
        radius / Math.max(0.001, surface.scale),
      );
      if (t !== null) result = Math.min(result, t);
    }
    return result;
  }
}

export function constrainCamera(start, end, surfaces, canOccupy) {
  const distance = start.distanceTo(end);
  let t = surfaces?.entry(start, end) ?? 1;
  // Terrain and map edges share the swept arm, including steep ground slopes.
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 1; i <= steps && i / steps <= t; i++) {
    const p = start.clone().lerp(end, i / steps);
    if (!canOccupy(p)) {
      t = Math.max(0, (i - 1) / steps);
      break;
    }
  }
  return start
    .clone()
    .lerp(end, Math.max(0, t - (t < 1 ? 0.03 / Math.max(distance, 0.001) : 0)));
}

export function followCamera(
  current,
  target,
  desired,
  dt,
  surfaces,
  canOccupy,
) {
  const safe = constrainCamera(target, desired, surfaces, canOccupy);
  const smoothed = current.clone().lerp(safe, 1 - Math.exp(-8 * dt));
  // Resolve again after smoothing: an orbit around a corner must never interpolate
  // through the wall. Inward correction is immediate; outward recovery is gentle.
  return constrainCamera(target, smoothed, surfaces, canOccupy);
}
