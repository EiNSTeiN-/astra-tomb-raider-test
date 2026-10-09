import * as THREE from "three";
import { pierCornerGeometry } from "./climbing-pier-geometry.js";

function shutterGeometry(width, height, depth) {
  const cut = 0.14,
    points = [
      [-width / 2 + cut, 0],
      [width / 2 - cut, 0],
      [width / 2, cut],
      [width / 2, height - cut],
      [width / 2 - cut, height],
      [-width / 2 + cut, height],
      [-width / 2, height - cut],
      [-width / 2, cut],
    ],
    shape = new THREE.Shape();
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

// A closed raked heat baffle has a sloping skin and hard folded edges.
function baffleGeometry(width) {
  const geometry = new THREE.BoxGeometry(width, 0.22, 0.16),
    position = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    if (position.getZ(i) > 0) position.setY(i, position.getY(i) - 0.055);
    uv.setXY(i, position.getX(i) / 2, position.getY(i) / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Riveted maintenance shutters and folded heat baffles belong to the forge.
// Closed backs carry the ribs, and fitted basalt carries every masonry joint.
export function buildVolcanicClimbingPier({
  ledge,
  width,
  depth,
  ground,
  wallHeight,
  seed,
  style,
  materials,
  fixed,
  detail,
  mesh,
  facingGeometry,
}) {
  const panelWidth = ledge.index === 4 ? 2 : 1.7,
    panelHeight = Math.min(3.2, wallHeight - 0.85),
    bottom = wallHeight - panelHeight - 0.35,
    top = bottom + panelHeight,
    outer = panelWidth / 2 + 0.3,
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
    rise = wallHeight / rows;
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
        0.88,
      );
      for (let row = 0; row < rows; row++)
        mesh(
          pierCornerGeometry(rise - 0.012, seed++, sx, sz),
          materials.stone,
          x,
          ground + (row + 0.5) * rise,
          z,
          fixed,
          0.96 + (row % 3) * 0.025,
        );
    }
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2,
      half = (face % 2 ? width : depth) / 2,
      along = (face % 2 ? depth : width) / 2 - 0.3,
      add = (
        geometry,
        x,
        y,
        z,
        material = materials.stone,
        tint = 1,
        parent = fixed,
      ) => {
        const object = mesh(
          geometry,
          material,
          ledge.x + Math.cos(angle) * x + Math.sin(angle) * z,
          ground + y,
          ledge.z - Math.sin(angle) * x + Math.cos(angle) * z,
          parent,
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
          rowHeight = h / courses;
        add(
          new THREE.BoxGeometry(w + 0.01, h + 0.02, 0.27),
          (left + right) / 2,
          (low + high) / 2,
          half - 0.21,
          materials.stone,
          0.76,
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
                rowHeight - 0.014,
                0.27,
                seed++,
              ),
              (ends[i] + ends[i - 1]) / 2,
              low + (row + 0.5) * rowHeight,
              half - 0.19,
              materials.stone,
              0.94 + ((row * 7 + i * 3 + face) % 5) * 0.022,
            );
        }
      };
    wall(-along, -outer, 0, wallHeight);
    wall(outer, along, 0, wallHeight);
    wall(-outer, outer, 0, bottom);
    wall(-outer, outer, top + 0.26, wallHeight);
    // Continuous jamb bearings sit behind the dressed rows and stepped lintel.
    for (const side of [-1, 1]) {
      const jamb = panelHeight + 0.08,
        count = Math.ceil(jamb / style.row),
        rowHeight = jamb / count;
      add(
        new THREE.BoxGeometry(0.3, jamb + 0.02, 0.3),
        side * (panelWidth / 2 + 0.15),
        (bottom + top) / 2,
        half - 0.185,
        materials.stone,
        0.78,
      );
      for (let row = 0; row < count; row++)
        add(
          facingGeometry(0.3, rowHeight - 0.012, 0.3, seed++),
          side * (panelWidth / 2 + 0.15),
          bottom - 0.04 + (row + 0.5) * rowHeight,
          half - 0.18,
          materials.stone,
          1.06,
        );
    }
    for (const [y, w, h] of [
      [bottom + 0.01, outer * 2 + 0.12, 0.16],
      [top + 0.09, outer * 2, 0.2],
      [top + 0.23, outer * 2 + 0.14, 0.12],
    ])
      add(
        new THREE.BoxGeometry(w, h, 0.3),
        0,
        y,
        half - 0.18,
        materials.stone,
        1.03,
      );

    const plane = half - 0.3;
    add(
      shutterGeometry(panelWidth + 0.025, panelHeight + 0.025, 0.18),
      0,
      bottom - 0.0125,
      plane,
      materials.shutter,
      0.46,
    );
    // All folded baffles and straps intersect the closed steel back. Their
    // dark intervals are recessed surfaces, with no holes through the pier.
    const baffles = panelHeight > 2.4 ? 5 : 3;
    for (let row = 0; row < baffles; row++)
      add(
        baffleGeometry(panelWidth - 0.34),
        0,
        bottom + panelHeight * (0.25 + (row * 0.5) / (baffles - 1)),
        plane + 0.06,
        materials.shutter,
        1.12 + ((row + face + ledge.index) % 3) * 0.045,
        detail,
      );
    for (const side of [-1, 1]) {
      const x = side * (panelWidth / 2 - 0.08);
      add(
        new THREE.BoxGeometry(0.14, panelHeight - 0.18, 0.12),
        x,
        (bottom + top) / 2,
        plane + 0.045,
        materials.shutter,
        1.04,
        detail,
      );
      for (const y of [bottom + 0.19, top - 0.19])
        add(
          new THREE.CylinderGeometry(0.057, 0.065, 0.045, 6).rotateX(
            Math.PI / 2,
          ),
          x,
          y,
          plane + 0.11,
          materials.shutter,
          1.35,
          detail,
        );
    }
    for (const y of [bottom + 0.12, top - 0.12])
      add(
        new THREE.BoxGeometry(panelWidth - 0.16, 0.1, 0.12),
        0,
        y,
        plane + 0.045,
        materials.shutter,
        1.12,
        detail,
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
