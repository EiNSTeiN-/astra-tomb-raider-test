import * as THREE from "three";
import { fittedWallGeometry, fittedStoneGeometry } from "./sky-masonry.js";
import { skyWindReliefGeometry } from "./sky-chamber-walls.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

// Backed polygonal granite belongs to the same city as the citadels. The bays
// stay inside the existing solid pier, below its complete standing roof.
export function buildSkyClimbingPier({
  ledge,
  width,
  depth,
  ground,
  wallHeight,
  seed,
  materials,
  fixed,
  detail,
  mesh,
}) {
  const bays = wallHeight > 3.1 ? (ledge.index % 2 ? [-0.95, 0.95] : [0]) : [],
    bottom = wallHeight - 3.1,
    top = wallHeight - 0.7,
    records = [];
  // The crowned face stones taper behind their outside plane at the foot.
  // A buried full bed carries those thin edges as well as the central core.
  // Its top remains 2 cm below the minimum terrain used to fit this pier.
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.7,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.7, wallHeight + 0.02, depth - 0.7),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.7,
  );
  // Dressed quoins bond the four fitted faces at their outside corners.
  // Their complete envelopes remain inside the original climbing solid.
  const rows = Math.ceil(wallHeight / 0.62),
    rowHeight = wallHeight / rows;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      mesh(
        new THREE.BoxGeometry(0.3, wallHeight + 0.02, 0.3),
        materials.stone,
        ledge.x + sx * (width / 2 - 0.165),
        ground + wallHeight / 2,
        ledge.z + sz * (depth / 2 - 0.165),
        fixed,
        0.87,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          stoneBlockGeometry(0.31, rowHeight - 0.012, 0.31, seed++),
          materials.stone,
          ledge.x + sx * (width / 2 - 0.165),
          ground + (row + 0.5) * rowHeight,
          ledge.z + sz * (depth / 2 - 0.165),
          fixed,
          0.91 + (row % 3) * 0.035,
        );
    }
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2,
      half = (face % 2 ? width : depth) / 2,
      along = (face % 2 ? depth : width) / 2 - 0.3,
      add = (geometry, x, y, z, material = materials.stone, parent = fixed) => {
        const m = mesh(
          geometry,
          material,
          ledge.x + Math.cos(angle) * x + Math.sin(angle) * z,
          ground + y,
          ledge.z - Math.sin(angle) * x + Math.cos(angle) * z,
          parent,
        );
        m.rotation.y = angle;
        return m;
      },
      panel = (polygon) => {
        const g = fittedWallGeometry(polygon, 0.4, seed++, 1.12),
          attributes = Object.entries(g.attributes),
          values = attributes.map(() => []),
          normal = g.attributes.normal;
        // The packed core carries the hidden rear faces. Keep front crowns,
        // bevels and reveal sides while avoiding duplicate buried triangles.
        for (let i = 0; i < normal.count; i += 3) {
          if (normal.getZ(i) < -0.1) continue;
          for (let a = 0; a < attributes.length; a++) {
            const attribute = attributes[a][1];
            for (let j = 0; j < 3; j++)
              for (let k = 0; k < attribute.itemSize; k++)
                values[a].push(
                  attribute.array[(i + j) * attribute.itemSize + k],
                );
          }
        }
        for (let a = 0; a < attributes.length; a++)
          g.setAttribute(
            attributes[a][0],
            new THREE.Float32BufferAttribute(
              values[a],
              attributes[a][1].itemSize,
            ),
          );
        add(g, 0, 0, half - 0.218);
      };
    if (!bays.length) {
      panel([
        [-along, 0],
        [along, 0],
        [along, wallHeight],
        [-along, wallHeight],
      ]);
      continue;
    }
    panel([
      [-along, 0],
      [along, 0],
      [along, bottom],
      [-along, bottom],
    ]);
    panel([
      [-along, top],
      [along, top],
      [along, wallHeight],
      [-along, wallHeight],
    ]);
    let leftBottom = -along,
      leftTop = -along;
    for (const x of bays) {
      const radius = bays.length === 1 ? 0.68 : 0.43,
        head = radius * 0.7,
        opening = [
          [x - radius, bottom],
          [x + radius, bottom],
          [x + head, top],
          [x - head, top],
        ];
      panel([
        [leftBottom, bottom],
        [x - radius, bottom],
        [x - head, top],
        [leftTop, top],
      ]);
      // The thin closed tablet intersects the core and seals the bay. Its
      // relief is seated in this stone, rather than hanging in the recess.
      add(fittedStoneGeometry(opening, 0.045, seed++), 0, 0, half - 0.3725);
      const center = (bottom + top) / 2,
        relief = skyWindReliefGeometry((ledge.index + face) % 3, head * 1.48);
      add(relief, x, center + 0.08, half - 0.358, materials.metal, detail);
      records.push({
        face,
        x,
        bottom: ground + bottom,
        top: ground + top,
        radius,
        head,
      });
      leftBottom = x + radius;
      leftTop = x + head;
    }
    panel([
      [leftBottom, bottom],
      [along, bottom],
      [along, top],
      [leftTop, top],
    ]);
  }
  return { bays: records };
}
