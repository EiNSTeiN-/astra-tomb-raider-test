import {
  TERRAIN_BODY_OFFSETS,
  TERRAIN_LEG_CLEARANCE,
} from "./terrain-body-clearance.js";

// Follow the delivered mesh edges: cardinal edges and the NE/SW cell diagonal.
// A different diagonal could invent an outlet across a real terrain ridge.
const directions = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
];

export function fillHeightfieldBasins(heights, width, editable) {
  const visited = new Uint8Array(heights.length),
    heap = [],
    before = (a, b) =>
      heights[a] < heights[b] || (heights[a] === heights[b] && a < b),
    push = (id) => {
      let i = heap.length;
      heap.push(id);
      while (i) {
        const p = (i - 1) >> 1;
        if (!before(id, heap[p])) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = id;
    },
    pop = () => {
      const first = heap[0],
        last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && before(heap[child + 1], heap[child]))
            child++;
          if (!before(heap[child], last)) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      return first;
    },
    neighbors = (id, visit) => {
      const x = id % width,
        z = Math.floor(id / width);
      for (const [dx, dz] of directions) {
        const nx = x + dx,
          nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < width && nz < width)
          visit(nz * width + nx);
      }
    };
  for (let i = 0; i < heights.length; i++) {
    const x = i % width,
      z = Math.floor(i / width);
    if (editable[i] && x && z && x < width - 1 && z < width - 1) continue;
    visited[i] = 1;
    let boundary = false;
    neighbors(i, (j) => {
      if (editable[j]) boundary = true;
    });
    if (boundary) push(i);
  }
  let raised = 0,
    maxFill = 0;
  while (heap.length) {
    const id = pop(),
      level = heights[id];
    neighbors(id, (next) => {
      if (visited[next]) return;
      visited[next] = 1;
      if (heights[next] < level) {
        maxFill = Math.max(maxFill, level - heights[next]);
        heights[next] = level;
        raised++;
      }
      push(next);
    });
  }
  return { raised, maxFill };
}

// A point drain can still be too narrow for the body. Deposit material in
// sharp trough bottoms where opposing banks exceed the leg margin. One-sided
// cliff faces keep their heights. Solve against the actual triangle weights.
export function fillBodyPockets(heights, width, step, editable) {
  const original = heights.slice(),
    changed = new Set(),
    pairs = [];
  for (let i = 0; i < TERRAIN_BODY_OFFSETS.length; i++)
    for (let j = i + 1; j < TERRAIN_BODY_OFFSETS.length; j++)
      if (
        Math.hypot(
          TERRAIN_BODY_OFFSETS[i][0] + TERRAIN_BODY_OFFSETS[j][0],
          TERRAIN_BODY_OFFSETS[i][1] + TERRAIN_BODY_OFFSETS[j][1],
        ) < 1e-8
      )
        pairs.push([i, j]);
  const sample = (x, z, center) => {
    const fx = Math.max(0, Math.min(width - 1, x / step)),
      fz = Math.max(0, Math.min(width - 1, z / step)),
      ix = Math.min(width - 2, Math.floor(fx)),
      iz = Math.min(width - 2, Math.floor(fz)),
      u = fx - ix,
      v = fz - iz,
      a = iz * width + ix,
      b = a + 1,
      c = a + width,
      d = c + 1,
      ids = u + v <= 1 ? [a, b, c] : [d, c, b],
      weights = u + v <= 1 ? [1 - u - v, u, v] : [u + v - 1, 1 - u, 1 - v];
    let height = 0,
      weight = 0;
    for (let i = 0; i < 3; i++) {
      height += heights[ids[i]] * weights[i];
      if (ids[i] === center) weight += weights[i];
    }
    return { height, weight };
  };
  let passes = 0;
  for (; passes < 3; passes++) {
    const next = heights.slice();
    let count = 0;
    for (let i = 0; i < heights.length; i++) {
      if (!editable[i]) continue;
      const x = (i % width) * step,
        z = Math.floor(i / width) * step,
        base = heights[i],
        samples = TERRAIN_BODY_OFFSETS.map(([dx, dz]) =>
          sample(x + dx, z + dz, i),
        );
      if (
        !pairs.some(
          ([a, b]) =>
            Math.min(samples[a].height, samples[b].height) >
            base + TERRAIN_LEG_CLEARANCE + 1e-5,
        )
      )
        continue;
      let target = base;
      for (const { height, weight } of samples)
        if (weight < 0.99999)
          target = Math.max(
            target,
            (height - weight * base - (TERRAIN_LEG_CLEARANCE - 0.02)) /
              (1 - weight),
          );
      if (target > base + 0.001) {
        next[i] = target;
        changed.add(i);
        count++;
      }
    }
    heights.set(next);
    if (!count) break;
  }
  let maxFill = 0;
  for (const i of changed)
    maxFill = Math.max(maxFill, heights[i] - original[i]);
  return { raised: changed.size, maxFill, passes };
}

export function drainJungleRim(heights, width, step, map, waters, clearance) {
  const original = heights.slice();
  const editable = new Uint8Array(heights.length),
    extent = map.size * 7;
  for (let z = 0; z < width; z++)
    for (let x = 0; x < width; x++) {
      const px = x * step,
        pz = z * step,
        near = Math.min(px, pz, extent - px, extent - pz);
      if (
        near <= 1.75 ||
        near >= 28 ||
        map.grid[Math.round(pz / 7)]?.[Math.round(px / 7)] ||
        clearance(px, pz) < 3.5
      )
        continue;
      if (
        waters.some(
          (w) =>
            Math.abs(px - w.x) <= (w.bedWidth ?? w.width) / 2 + 3.5 &&
            Math.abs(pz - w.z) <= (w.bedLength ?? w.length) / 2 + 3.5,
        )
      )
        continue;
      editable[z * width + x] = 1;
    }
  const basins = fillHeightfieldBasins(heights, width, editable),
    pockets = fillBodyPockets(heights, width, step, editable),
    finish = fillHeightfieldBasins(heights, width, editable);
  let raised = 0,
    maxFill = 0;
  for (let i = 0; i < heights.length; i++)
    if (heights[i] > original[i]) {
      raised++;
      maxFill = Math.max(maxFill, heights[i] - original[i]);
    }
  return { raised, maxFill, basins, pockets, finish };
}
