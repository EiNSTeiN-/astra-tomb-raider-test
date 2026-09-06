// Bounded local A*: uses the same collision predicate as character movement.
// Every edge is swept, so a coarse grid cannot skip a narrow wall or gate.
export function clearSegment(canStand, a, b, spacing = 0.3) {
  const count = Math.max(
    1,
    Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing),
  );
  for (let i = 1; i <= count; i++) {
    const x = a.x + ((b.x - a.x) * i) / count,
      z = a.z + ((b.z - a.z) * i) / count;
    if (!canStand(x, z)) return false;
    // Give corners a little clearance. Sweeping only the center can miss a
    // glancing intersection between samples, leaving an actor caught on it.
    for (const [dx, dz] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ])
      if (!canStand(x + dx, z + dz)) return false;
  }
  return true;
}

class MinHeap {
  data = [];
  push(node) {
    const a = this.data;
    a.push(node);
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p].f <= node.f) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = node;
  }
  pop() {
    const a = this.data,
      first = a[0],
      last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1;
        if (j + 1 < a.length && a[j + 1].f < a[j].f) j++;
        if (a[j].f >= last.f) break;
        a[i] = a[j];
        i = j;
      }
      a[i] = last;
    }
    return first;
  }
  get length() {
    return this.data.length;
  }
}

export function* searchRoute(
  canStand,
  start,
  target,
  { cell = 1.75, margin = 12, maxVisited = 2200, maxDistance = 70 } = {},
) {
  if (!Number.isFinite(start.x + start.z + target.x + target.z))
    return { status: "unreachable", points: [], visited: 0 };
  if (Math.hypot(target.x - start.x, target.z - start.z) > maxDistance)
    return { status: "unreachable", points: [], visited: 0 };
  if (clearSegment(canStand, start, target))
    return {
      status: "complete",
      points: [{ x: target.x, z: target.z }],
      visited: 0,
    };
  const minX = Math.floor((Math.min(start.x, target.x) - margin) / cell),
    maxX = Math.ceil((Math.max(start.x, target.x) + margin) / cell);
  const minZ = Math.floor((Math.min(start.z, target.z) - margin) / cell),
    maxZ = Math.ceil((Math.max(start.z, target.z) + margin) / cell);
  const width = maxX - minX + 1,
    key = (x, z) => (z - minZ) * width + x - minX,
    position = (node) => ({ x: node.x * cell, z: node.z * cell });
  const occupancy = new Map(),
    stand = (x, z) => {
      if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
      const id = key(x, z);
      if (!occupancy.has(id)) occupancy.set(id, canStand(x * cell, z * cell));
      return occupancy.get(id);
    };
  const starts = [];
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(start.x / cell) + dx,
        z = Math.round(start.z / cell) + dz,
        p = { x: x * cell, z: z * cell };
      if (stand(x, z) && clearSegment(canStand, start, p))
        starts.push({ x, z, d: Math.hypot(p.x - start.x, p.z - start.z) });
    }
  starts.sort((a, b) => a.d - b.d);
  if (!starts.length) return { status: "unreachable", points: [], visited: 0 };
  const first = starts[0],
    heuristic = (x, z) => Math.hypot(x * cell - target.x, z * cell - target.z),
    open = new MinHeap(),
    nodes = new Map();
  const node = {
    ...first,
    g: first.d,
    f: first.d + heuristic(first.x, first.z),
    parent: null,
  };
  nodes.set(key(node.x, node.z), node);
  open.push(node);
  let closest = node,
    bestDistance = heuristic(node.x, node.z),
    visited = 0,
    complete = false;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (open.length && visited < maxVisited) {
    const current = open.pop();
    if (current.closed || nodes.get(key(current.x, current.z)) !== current)
      continue;
    current.closed = true;
    visited++;
    if (visited % 32 === 0) yield { visited };
    const distance = heuristic(current.x, current.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = current;
    }
    if (
      distance < cell * 1.5 &&
      clearSegment(canStand, position(current), target)
    ) {
      closest = current;
      complete = true;
      break;
    }
    for (const [dx, dz] of directions) {
      const x = current.x + dx,
        z = current.z + dz;
      if (
        !stand(x, z) ||
        (dx &&
          dz &&
          (!stand(current.x + dx, current.z) ||
            !stand(current.x, current.z + dz)))
      )
        continue;
      const id = key(x, z),
        previous = nodes.get(id),
        g = current.g + Math.hypot(dx, dz) * cell;
      if (previous && (previous.closed || previous.g <= g)) continue;
      if (
        !clearSegment(canStand, position(current), { x: x * cell, z: z * cell })
      )
        continue;
      const next = { x, z, g, f: g + heuristic(x, z), parent: current };
      nodes.set(id, next);
      open.push(next);
    }
  }
  const raw = [];
  for (let n = closest; n; n = n.parent) raw.push(position(n));
  raw.reverse();
  if (complete) raw.push({ x: target.x, z: target.z });
  // Shorten only collision-free segments; retain actual corners of the route.
  const points = [];
  let anchor = start,
    index = 0;
  while (index < raw.length) {
    let far = index;
    while (far + 1 < raw.length && clearSegment(canStand, anchor, raw[far + 1]))
      far++;
    if (Math.hypot(raw[far].x - anchor.x, raw[far].z - anchor.z) > 0.05)
      points.push(raw[far]);
    anchor = raw[far];
    index = far + 1;
  }
  const useful =
    bestDistance < Math.hypot(target.x - start.x, target.z - start.z) - 0.5;
  return {
    status: complete
      ? "complete"
      : visited >= maxVisited
        ? "budget"
        : useful
          ? "partial"
          : "unreachable",
    points: complete || useful ? points : [],
    visited,
  };
}

// Offline validation runs to completion. Runtime guardians advance the same
// search in small slices so an obstructed goal cannot stall a frame.
export function findRoute(...args) {
  const search = searchRoute(...args);
  let step;
  do {
    step = search.next();
  } while (!step.done);
  return step.value;
}
