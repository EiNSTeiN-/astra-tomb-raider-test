import * as THREE from "three";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";

function slab(points, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth);
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, position.getX(i) / 2, position.getY(i) / 2);
  return geometry;
}

// Tapered solar surrounds belong to the desert's pylon architecture. Their
// complete backing and carved faces remain inside the existing pier solid.
export function buildDesertClimbingPier({
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
  const panelWidth = ledge.index === 4 ? 1.9 : 1.6,
    panelHeight = Math.min(2.6, wallHeight - 0.85),
    bottom = wallHeight - panelHeight - 0.5,
    top = bottom + panelHeight,
    innerLow = panelWidth / 2,
    innerTop = innerLow * 0.78,
    outerLow = innerLow + 0.14,
    outerTop = outerLow * 0.78,
    opening = (y) =>
      outerLow -
      (outerLow - outerTop) *
        THREE.MathUtils.clamp((y - bottom) / panelHeight, 0, 1),
    panels = [];
  mesh(
    new THREE.BoxGeometry(width - 0.02, 0.19, depth - 0.02),
    materials.stone,
    ledge.x,
    ground + 0.065,
    ledge.z,
    fixed,
    0.75,
  );
  mesh(
    new THREE.BoxGeometry(width - 0.64, wallHeight + 0.02, depth - 0.64),
    materials.stone,
    ledge.x,
    ground + wallHeight / 2,
    ledge.z,
    fixed,
    0.75,
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
        0.92,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          pierCornerGeometry(rowHeight - 0.012, seed++, sx, sz),
          materials.stone,
          x,
          ground + (row + 0.5) * rowHeight,
          z,
          fixed,
          0.94 + (row % 3) * 0.025,
        );
    }
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2,
      half = (face % 2 ? width : depth) / 2,
      along = (face % 2 ? depth : width) / 2 - 0.3,
      add = (geometry, x, y, z, tint = 1, material = materials.stone) => {
        const object = mesh(
          geometry,
          material,
          ledge.x + Math.cos(angle) * x + Math.sin(angle) * z,
          ground + y,
          ledge.z - Math.sin(angle) * x + Math.cos(angle) * z,
          fixed,
          tint,
        );
        object.rotation.y = angle;
        return object;
      },
      facing = (left, right, low, high, row) => {
        const mid = (low + high) / 2,
          columns = Math.ceil((right(mid) - left(mid)) / style.block),
          ends =
            row % 2
              ? [
                  0,
                  ...Array.from(
                    { length: columns },
                    (_, i) => (i + 0.5) / columns,
                  ),
                  1,
                ]
              : Array.from({ length: columns + 1 }, (_, i) => i / columns);
        for (let i = 1; i < ends.length; i++) {
          const start = ends[i - 1],
            end = ends[i],
            widthAt = (y) => (right(y) - left(y)) * (end - start) - 0.014,
            centerAt = (y) =>
              left(y) + ((right(y) - left(y)) * (start + end)) / 2,
            w = widthAt(mid),
            center = centerAt(mid),
            geometry = facingGeometry(w, high - low - 0.014, 0.27, seed++),
            position = geometry.attributes.position;
          for (let v = 0; v < position.count; v++) {
            const y = mid + position.getY(v);
            position.setX(
              v,
              centerAt(y) - center + (position.getX(v) * widthAt(y)) / w,
            );
          }
          geometry.computeVertexNormals();
          add(
            geometry,
            center,
            mid,
            half - 0.19,
            0.91 + ((row * 5 + i + face) % 5) * 0.022,
          );
        }
      };
    for (const side of [-1, 1]) {
      const points = [
        [side * along, 0],
        [side * outerLow, 0],
        [side * outerLow, bottom],
        [side * outerTop, top],
        [side * outerTop, wallHeight],
        [side * along, wallHeight],
      ];
      add(
        slab(side > 0 ? points.toReversed() : points, 0.27),
        0,
        0,
        half - 0.075,
        0.78,
      );
      const boundaries = [
        ...new Set([
          ...Array.from({ length: rows + 1 }, (_, i) => i * rowHeight),
          bottom,
          top,
        ]),
      ].sort((a, b) => a - b);
      for (let row = 1; row < boundaries.length; row++)
        facing(
          side < 0 ? () => -along : opening,
          side < 0 ? (y) => -opening(y) : () => along,
          boundaries[row - 1],
          boundaries[row],
          row,
        );
      add(
        slab(
          [
            [side * outerLow, bottom],
            [side * innerLow, bottom],
            [side * innerTop, top],
            [side * outerTop, top],
          ],
          0.31,
        ),
        0,
        0,
        half - 0.04,
        1.04,
      );
    }
    for (const [low, high, span] of [
      [0, bottom, outerLow],
      [top, wallHeight, outerTop],
    ]) {
      add(
        new THREE.BoxGeometry(span * 2 + 0.01, high - low + 0.02, 0.27),
        0,
        (low + high) / 2,
        half - 0.21,
        0.78,
      );
      facing(
        () => -span,
        () => span,
        low,
        high,
        0,
      );
    }
    const plane = half - 0.25,
      center = panelHeight * 0.52,
      radius = Math.min(innerTop * 0.85, panelHeight * 0.3),
      rays = 12 + ((ledge.index + face) % 3) * 2;
    add(
      slab(
        [
          [-innerLow, 0],
          [innerLow, 0],
          [innerTop, panelHeight],
          [-innerTop, panelHeight],
        ],
        0.16,
      ),
      0,
      bottom,
      plane,
      0.75,
    );
    // Every ring, ray and boss intersects the closed tablet or its disk. The
    // geometric rim stays crisp while the regional material carries erosion.
    add(
      new THREE.CylinderGeometry(
        radius * 0.84,
        radius * 0.84,
        0.03,
        36,
      ).rotateX(Math.PI / 2),
      0,
      bottom + center,
      plane + 0.014,
      0.92,
    );
    add(
      new THREE.TorusGeometry(radius * 0.73, radius * 0.035, 6, 48),
      0,
      bottom + center,
      plane + 0.027,
      1.05,
    );
    add(
      new THREE.TorusGeometry(radius * 0.23, radius * 0.03, 6, 32),
      0,
      bottom + center,
      plane + 0.027,
      1.01,
    );
    add(
      new THREE.CylinderGeometry(
        radius * 0.15,
        radius * 0.18,
        0.06,
        24,
      ).rotateX(Math.PI / 2),
      0,
      bottom + center,
      plane + 0.025,
      1.04,
    );
    for (let ray = 0; ray < rays; ray++) {
      const a = ((ray + (ledge.index % 2) * 0.5) * Math.PI * 2) / rays,
        point = (r, delta) => [
          Math.cos(a + delta) * radius * r,
          Math.sin(a + delta) * radius * r,
        ];
      add(
        slab(
          [
            point(0.32, -0.095),
            point(0.65, -0.06),
            point(0.65, 0.06),
            point(0.32, 0.095),
          ],
          0.055,
        ),
        0,
        bottom + center,
        plane + 0.05,
        1.01,
      );
    }
    for (let mark = -2; mark <= 2; mark++)
      add(
        new THREE.BoxGeometry(
          0.032,
          0.15 + ((face + ledge.index + mark + 2) % 3) * 0.035,
          0.014,
        ),
        mark * 0.16,
        top + 0.25,
        half - 0.054,
        0.77,
        materials.metal,
      );
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
