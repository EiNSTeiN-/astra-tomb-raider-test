import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";

// A closed, stepped corbel with a continuous sloping soffit. The wide heel is
// bedded into the wall cap, below even its chipped corners. Unequal surviving
// lengths leave the water hall open to the canopy.
export function rainkeeperCorbelGeometry(side, tiers) {
  const base = 6.12,
    rise = 0.46,
    step = 2.25,
    end = (tiers - 1) * step + 3.7,
    points = [
      [0, base],
      [0, base + 0.68],
    ];
  for (let tier = 0; tier < tiers; tier++) {
    const u = tier === tiers - 1 ? end : (tier + 1) * step,
      top = base + 0.68 + tier * rise;
    points.push([u, top]);
    if (tier < tiers - 1) points.push([u, top + rise]);
  }
  points.push([end - 0.14, base + (tiers - 1) * rise - 0.08], [1.15, base]);
  const shape = new THREE.Shape(
      points.map(([u, y]) => new THREE.Vector2(side * (22 - u), y)),
    ),
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.4,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 1,
    });
  geometry.translate(0, 0, -0.7);
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv,
    color = [];
  for (let i = 0; i < p.count; i++) {
    // Match the existing blocks' two-metre texture scale on every face.
    const axis =
      Math.abs(n.getX(i)) > 0.7 ? 0 : Math.abs(n.getY(i)) > 0.7 ? 1 : 2;
    uv.setXY(
      i,
      (axis === 0 ? p.getZ(i) : p.getX(i)) / 2,
      (axis === 1 ? p.getZ(i) : p.getY(i)) / 2,
    );
    const shade = 0.86 + 0.035 * Math.sin(p.getX(i) * 1.3 + p.getY(i) * 3);
    color.push(shade, shade, shade);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

// The botanical face has real depth and a closed back. Its edge and backing
// enter the masonry, so the recessed carving does not expose a floating plane.
export function rainkeeperReliefGeometry(width, height, variant) {
  const front = carvedPanelGeometry(width, height, variant, [24, 48], {
      carvingSpread: 1.35,
    }),
    positions = [...front.attributes.position.array],
    uv = [...front.attributes.uv.array],
    colors = [...front.attributes.color.array],
    indices = [...front.index.array],
    back = -0.36;
  for (let i = 2; i < positions.length; i += 3) positions[i] *= 1.8;
  const triangle = (a, b, c) => {
    const start = positions.length / 3;
    for (const point of [a, b, c]) {
      positions.push(...point);
      uv.push(point[0] / 2, point[1] / 2);
      colors.push(0.78, 0.78, 0.78);
    }
    indices.push(start, start + 1, start + 2);
  };
  // Clockwise boundary when viewed from the front; side faces point outward.
  const edge = [];
  for (let iy = 0; iy <= 48; iy++) edge.push(iy * 25);
  for (let ix = 1; ix <= 24; ix++) edge.push(48 * 25 + ix);
  for (let iy = 47; iy >= 0; iy--) edge.push(iy * 25 + 24);
  for (let ix = 23; ix > 0; ix--) edge.push(ix);
  const read = (index) => positions.slice(index * 3, index * 3 + 3);
  for (let i = 0; i < edge.length; i++) {
    const a = read(edge[i]),
      b = read(edge[(i + 1) % edge.length]),
      ab = [a[0], a[1], back],
      bb = [b[0], b[1], back];
    triangle(a, b, ab);
    triangle(b, bb, ab);
  }
  const a = [-width / 2, 0, back],
    b = [width / 2, 0, back],
    c = [width / 2, height, back],
    d = [-width / 2, height, back];
  triangle(a, d, b);
  triangle(b, d, c);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  front.dispose();
  return geometry;
}

export function buildRainkeeperMasonry(game, vault, material) {
  const { root } = vault,
    feature = { id: "rainkeeper-masonry" },
    masonry = { corbels: [], piers: [], reliefs: [], solids: feature };
  let seed = 7300;
  const mesh = (geometry, x, y, z, angle = 0) => {
    if (!geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Array(geometry.attributes.position.count * 3).fill(0.9),
          3,
        ),
      );
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.y = angle;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    game.cameraSurfaces?.capture(m);
    return m;
  };
  const block = (w, h, d, x, y, z) =>
    mesh(stoneBlockGeometry(w, h, d, seed++), x, y, z);
  const solid = (parts) => stationAssemblySolid(game, feature, parts);
  const pier = (x, z, width, depth) => {
    const bottom =
        footprintMinimum(
          game.groundHeight.bind(game),
          vault.x + x,
          vault.z + z,
          width + 0.5,
          depth + 0.4,
        ) -
        vault.y -
        0.18,
      top = 6.18,
      count = Math.ceil((top - bottom) / 0.66),
      height = (top - bottom) / count,
      parts = [];
    for (let i = 0; i < count; i++)
      parts.push(
        block(width, height + 0.025, depth, x, bottom + (i + 0.5) * height, z),
      );
    // Overlapping plinth, belt and capital pieces keep the courses tied to
    // both the terrain and the roof, including on the sloping exterior.
    parts.push(
      block(
        width + 0.34,
        0.48 - bottom,
        depth + 0.24,
        x,
        (bottom + 0.48) / 2,
        z,
      ),
    );
    for (const y of [0.62, 4.9, 5.9])
      parts.push(block(width + 0.28, 0.26, depth + 0.18, x, y, z));
    masonry.piers.push({ x, z, bottom, width, depth });
    return parts;
  };
  for (const [row, z] of [-23, -7, 9, 25].entries())
    for (const side of [-1, 1]) {
      const tiers = (side < 0 ? [4, 3, 2, 4] : [3, 4, 4, 2])[row],
        parts = pier(side * 21.5, z, 1.45, 2.25),
        rib = mesh(rainkeeperCorbelGeometry(side, tiers), 0, 0, z),
        relief = mesh(
          rainkeeperReliefGeometry(1.65, 3.65, row + (side > 0 ? 2 : 0)),
          side * 22.43,
          1.02,
          z,
          (side * Math.PI) / 2,
        );
      parts.push(rib, relief);
      solid(parts);
      masonry.corbels.push({ side, z, tiers });
      masonry.reliefs.push({
        x: side * 22.43,
        z,
        facing: (side * Math.PI) / 2,
      });
    }
  // A framed, asymmetric entrance facade identifies the hall from the jungle.
  // All ornament stays outside the five-metre stair opening and title plaque.
  for (const x of [-20, -12, -4, 4, 12, 20]) solid(pier(x, -28.32, 0.9, 1.55));
  for (const [i, x] of [-16, 0, 8, 16].entries()) {
    const relief = mesh(
      rainkeeperReliefGeometry(3.15, 3.9, i + 4),
      x,
      1.02,
      -28.86,
      Math.PI,
    );
    const frame = [relief];
    for (const side of [-1, 1])
      frame.push(block(0.22, 4.12, 0.44, x + side * 1.69, 2.97, -28.68));
    frame.push(block(3.72, 0.25, 0.54, x, 0.97, -28.68));
    frame.push(block(3.82, 0.3, 0.62, x, 5.02, -28.68));
    frame.push(block(3.45, 0.2, 0.5, x, 5.24, -28.68));
    solid(frame);
    masonry.reliefs.push({ x, z: -28.86, facing: Math.PI });
  }
  const crown = [];
  for (const [tier, width] of [9.2, 7.7, 6.0, 4.4, 2.9].entries())
    crown.push(block(width, 0.62, 1.65, -8, 6.51 + tier * 0.55, -28.18));
  solid(crown);
  vault.masonry = masonry;
}
