import * as THREE from "three";
import { carvedPlaque } from "./chamber-walls.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

function cornerGeometry(height, seed, sx, sz) {
  const geometry = stoneBlockGeometry(0.31, height, 0.31, seed),
    attributes = Object.entries(geometry.attributes),
    values = attributes.map(() => []),
    normal = geometry.attributes.normal;
  // The continuous corner bearing carries the hidden faces. Preserve both
  // outward dressed faces and their bevels, rather than submitting the buried
  // back, inner sides and horizontal joints as another complete solid.
  for (let i = 0; i < normal.count; i += 3) {
    if (normal.getX(i) * sx <= 0.1 && normal.getZ(i) * sz <= 0.1) continue;
    for (let a = 0; a < attributes.length; a++) {
      const attribute = attributes[a][1];
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < attribute.itemSize; k++)
          values[a].push(attribute.array[(i + j) * attribute.itemSize + k]);
    }
  }
  for (let a = 0; a < attributes.length; a++)
    geometry.setAttribute(
      attributes[a][0],
      new THREE.Float32BufferAttribute(values[a], attributes[a][1].itemSize),
    );
  return geometry;
}

// Sanctuary reliefs have closed sides and a back embedded in the pier. All
// facing and bearing stay inside the original climbing and camera solid.
export function buildJungleClimbingPier({
  ledge,
  width,
  depth,
  ground,
  wallHeight,
  seed,
  style,
  materials,
  fixed,
  mesh,
  facingGeometry,
}) {
  const panelWidth = ledge.index === 4 ? 1.75 : 1.4,
    panelHeight = Math.min(3, wallHeight - 0.55),
    bottom = wallHeight - panelHeight - 0.22,
    top = bottom + panelHeight,
    halfOpening = panelWidth / 2 + 0.1,
    panels = [];
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.72,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.6, wallHeight + 0.02, depth - 0.6),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.72,
  );
  const rows = Math.ceil(wallHeight / style.row),
    rowHeight = wallHeight / rows;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = ledge.x + sx * (width / 2 - 0.165),
        z = ledge.z + sz * (depth / 2 - 0.165);
      mesh(
        new THREE.BoxGeometry(0.3, wallHeight + 0.02, 0.3),
        materials.stone,
        x,
        ground + wallHeight / 2,
        z,
        fixed,
        0.87,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          cornerGeometry(rowHeight - 0.012, seed++, sx, sz),
          materials.stone,
          x,
          ground + (row + 0.5) * rowHeight,
          z,
          fixed,
          0.88 + (row % 4) * 0.025,
        );
    }
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2,
      half = (face % 2 ? width : depth) / 2,
      along = (face % 2 ? depth : width) / 2 - 0.3,
      add = (geometry, x, y, z, tint = 1) => {
        const object = mesh(
          geometry,
          materials.stone,
          ledge.x + Math.cos(angle) * x + Math.sin(angle) * z,
          ground + y,
          ledge.z - Math.sin(angle) * x + Math.cos(angle) * z,
          fixed,
          tint,
        );
        object.rotation.y = angle;
        return object;
      },
      wall = (left, right, low, high) => {
        const w = right - left,
          h = high - low,
          columns = Math.ceil(w / style.block),
          courses = Math.ceil(h / style.row),
          step = w / columns,
          rise = h / courses;
        add(
          new THREE.BoxGeometry(w + 0.01, h + 0.02, 0.24),
          (left + right) / 2,
          (low + high) / 2,
          half - 0.2,
          0.72,
        );
        for (let row = 0; row < courses; row++) {
          const ends =
            row % 2
              ? [
                  left,
                  ...Array.from(
                    { length: columns },
                    (_, i) => left + (i + 0.5) * step,
                  ),
                  right,
                ]
              : Array.from({ length: columns + 1 }, (_, i) => left + i * step);
          for (let i = 1; i < ends.length; i++)
            add(
              facingGeometry(
                ends[i] - ends[i - 1] - 0.014,
                rise - 0.014,
                0.27,
                seed++,
              ),
              (ends[i] + ends[i - 1]) / 2,
              low + (row + 0.5) * rise,
              half - 0.18,
              0.86 + ((row * 7 + i * 3 + face) % 6) * 0.025,
            );
        }
      };
    wall(-along, -halfOpening, 0, wallHeight);
    wall(halfOpening, along, 0, wallHeight);
    wall(-halfOpening, halfOpening, 0, bottom);
    wall(-halfOpening, halfOpening, top, wallHeight);
    const plaque = carvedPlaque(
      panelWidth,
      panelHeight,
      ledge.index + face,
      [18, 24],
      { vertexColors: true, depthScale: 0.9, carvingSpread: 1.65 },
    );
    // Recesses retain a dark stone patina while the raised botanical ridges
    // reveal cleaner stone. Keep that contrast legible in the canopy shade.
    const color = plaque.attributes.color;
    for (let i = 0; i < color.count; i++) {
      const value = 0.43 + (color.getX(i) - 0.68) * 2.28;
      color.setXYZ(i, value, value, value);
    }
    plaque.computeBoundingBox();
    const plane = half - 0.11 - plaque.boundingBox.max.z;
    add(plaque, 0, bottom, plane, 0.96);
    panels.push({
      face,
      width: panelWidth,
      height: panelHeight,
      bottom: ground + bottom,
      top: ground + top,
      plane,
    });
  }
  return { panels };
}
