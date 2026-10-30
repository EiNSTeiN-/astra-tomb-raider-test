import * as THREE from "three";

// Every row describes a different fabricated hood above the existing firebox.
// Dimensions are full widths/depths; offsets are local to that firebox.
const hoods = [
  {
    name: "Foundry shoulders",
    cut: 0.09,
    rings: [
      [0, 8, 7],
      [0.5, 8, 7],
      [2.6, 4.7, 4.5],
      [3.1, 3.2, 3.2],
    ],
  },
  {
    name: "Cold-air recuperator",
    cut: 0.13,
    rings: [
      [0, 8, 7],
      [0.5, 8, 7],
      [1.4, 7.7, 5.9],
      [2.3, 5.8, 4.2],
      [2.8, 3.5, 3],
    ],
  },
  {
    name: "Ignition tower",
    cut: 0.292893,
    rings: [
      [0, 8, 7],
      [1.1, 8, 7],
      [4.5, 2.9, 2.9],
    ],
  },
  {
    name: "Pressure drum",
    cut: 0.292893,
    rings: [
      [0, 8, 7],
      [0.55, 8, 7],
      [0.9, 6.4, 5.6],
      [3, 6.4, 5.6],
      [3.7, 3.6, 3.6],
    ],
  },
  {
    name: "Offset gear exhaust",
    cut: 0.09,
    rings: [
      [0, 8, 7],
      [0.5, 8, 7],
      [3.8, 4, 3.3, 1.1, -0.5],
    ],
  },
  {
    name: "Smelting steps",
    cut: 0.06,
    rings: [
      [0, 8, 7],
      [1.2, 8, 7],
      [1.2, 6, 5.4],
      [2.4, 6, 5.4],
      [2.4, 4.4, 4],
      [3.7, 3.2, 3.2],
    ],
  },
  {
    name: "Pilot lantern",
    cut: 0.292893,
    rings: [
      [0, 8, 7],
      [1.8, 4.8, 4.8],
      [3, 4.8, 4.8],
      [3.65, 2.8, 2.8],
    ],
  },
  {
    name: "Tempering bell",
    cut: 0.2,
    rings: [
      [0, 8, 7],
      [0.8, 8, 7],
      [1.2, 7, 6.4],
      [1.8, 5.2, 4.6],
      [2.5, 3.6, 3.6],
    ],
  },
  {
    name: "Heart-engine mantle",
    cut: 0.292893,
    rings: [
      [0, 8, 7],
      [1.4, 8, 7],
      [4.2, 4.4, 4.4],
      [5.1, 3.9, 3.9],
    ],
  },
];

export function furnaceCrownPlan(index, side, height) {
  const design = hoods[index];
  if (!design || ![0, 1].includes(side))
    throw new RangeError("Unknown furnace crown");
  const rings = design.rings.map(([y, w, d, x = 0, z = 0]) => ({
    y,
    w,
    d,
    x: x * (side ? 1 : -1),
    z,
    cut: design.cut,
  }));
  const neck = rings.at(-1);
  if (!Number.isFinite(height))
    throw new RangeError("A furnace stack needs a finite height");
  height = Math.max(height, neck.y + 2.5);
  const length = height - neck.y;
  const profile = [
    [
      [0.12, 1],
      [0.86, 1],
      [0.9, 1.16],
      [1, 1.16],
    ],
    [
      [0.12, 1],
      [0.2, 0.8],
      [0.82, 0.8],
      [0.9, 1.22],
      [1, 1.22],
    ],
    [
      [0.1, 1],
      [0.86, 0.69],
      [0.9, 0.93],
      [1, 0.93],
    ],
    [
      [0.12, 1],
      [0.18, 0.75],
      [0.75, 0.75],
      [0.84, 1.08],
      [1, 1.08],
    ],
    [
      [0.12, 1],
      [0.25, 0.7],
      [0.91, 0.7],
      [1, 0.94],
    ],
    [
      [0.18, 1],
      [0.18, 0.83],
      [0.82, 0.83],
      [0.82, 1.12],
      [1, 1.12],
    ],
    [
      [0.12, 1],
      [0.6, 0.86],
      [0.86, 1.4],
      [1, 1.4],
    ],
    [
      [0.1, 1],
      [0.22, 0.76],
      [0.9, 0.76],
      [1, 1],
    ],
    [
      [0.12, 1],
      [0.23, 0.85],
      [0.78, 0.85],
      [0.85, 1.2],
      [1, 1.2],
    ],
  ][index];
  for (const [fraction, scale] of profile)
    rings.push({
      ...neck,
      y: neck.y + fraction * length,
      w: neck.w * scale,
      d: neck.d * scale,
    });
  return {
    name: design.name,
    index,
    side,
    rings,
    hoodHeight: neck.y,
    height,
    outlet: [neck.x, height, neck.z],
  };
}

export function furnaceRingPoints(ring, inset = 0) {
  const w = ring.w - inset * 2,
    d = ring.d - inset * 2;
  if (w <= 0 || d <= 0)
    throw new RangeError("Furnace skin exceeds its opening");
  const x = w / 2,
    z = d / 2,
    cx = w * ring.cut,
    cz = d * ring.cut;
  return [
    [-x + cx, -z],
    [x - cx, -z],
    [x, -z + cz],
    [x, z - cz],
    [x - cx, z],
    [-x + cx, z],
    [-x, z - cz],
    [-x, -z + cz],
  ].map(([px, pz]) => new THREE.Vector3(px + ring.x, ring.y, pz + ring.z));
}

// A closed sheet-metal solid, with an open air passage through both ends.
// Joining the outer and inner lofts at their rims avoids a hidden chimney cap.
export function furnaceShellGeometry(rings, thickness = 0.16) {
  const positions = [],
    uv = [];
  const quad = (a, b, c, d) => {
    const coords = [
      [0, 0],
      [0, a.distanceTo(b) / 2],
      [b.distanceTo(c) / 2, a.distanceTo(b) / 2],
      [a.distanceTo(d) / 2, 0],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...[a, b, c, d][i].toArray());
      uv.push(...coords[i]);
    }
  };
  const outer = rings.map((r) => furnaceRingPoints(r)),
    inner = rings.map((r) => furnaceRingPoints(r, thickness));
  // A horizontal shoulder needs vertical thickness as well as inset sides.
  // Otherwise its outer and inner ledges coincide and flicker when viewed.
  for (let row = 0; row < rings.length - 1; row++)
    if (rings[row].y === rings[row + 1].y) {
      const shift =
        Math.sign(
          rings[row + 1].w * rings[row + 1].d - rings[row].w * rings[row].d,
        ) * thickness;
      for (const points of [inner[row], inner[row + 1]])
        for (const point of points) point.y += shift;
    }
  for (let row = 0; row < rings.length - 1; row++)
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      quad(
        outer[row][i],
        outer[row + 1][i],
        outer[row + 1][next],
        outer[row][next],
      );
      quad(
        inner[row][i],
        inner[row][next],
        inner[row + 1][next],
        inner[row + 1][i],
      );
    }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    quad(outer[0][i], outer[0][j], inner[0][j], inner[0][i]);
    quad(outer.at(-1)[i], inner.at(-1)[i], inner.at(-1)[j], outer.at(-1)[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function furnaceSection(plan, y) {
  const rings = plan.rings;
  for (let i = rings.length - 2; i >= 0; i--) {
    const a = rings[i],
      b = rings[i + 1];
    if (y < a.y || b.y === a.y) continue;
    const f = Math.min(1, (y - a.y) / (b.y - a.y));
    return Object.fromEntries(
      ["x", "y", "z", "w", "d", "cut"].map((k) => [
        k,
        a[k] + (b[k] - a[k]) * f,
      ]),
    );
  }
  return { ...rings[0], y };
}

export function buildFurnaceCrown(plan, metal, place) {
  const meshes = [];
  const add = (geometry, name) => {
    const mesh = place(geometry, metal, 0, 0, 0);
    mesh.name = plan.name + ": " + name;
    meshes.push(mesh);
    return mesh;
  };
  add(furnaceShellGeometry(plan.rings), "hollow hood and stack");
  // Bands follow both ends of the actual loft interval, including offset hoods.
  const bands = [0.24, plan.hoodHeight, plan.height - 0.18];
  for (let y = plan.hoodHeight + 1.4; y < plan.height - 0.8; y += 1.8)
    bands.push(y);
  for (const y of bands) {
    const rings = [y - 0.08, y + 0.08].map((h) => {
      const r = furnaceSection(plan, h);
      return { ...r, w: r.w + 0.18, d: r.d + 0.18 };
    });
    add(furnaceShellGeometry(rings, 0.17), "fitted band");
  }
  // Raised seams articulate the hood's panels without crossing its open throat.
  for (let row = 0; row < plan.rings.length - 1; row++) {
    const a = plan.rings[row],
      b = plan.rings[row + 1];
    if (a.y >= plan.hoodHeight || b.y === a.y) continue;
    const low = furnaceRingPoints(a),
      high = furnaceRingPoints(b);
    for (const i of [0, 2, 4, 6]) {
      const delta = high[i].clone().sub(low[i]);
      const mesh = add(
        new THREE.CylinderGeometry(0.045, 0.045, delta.length(), 6),
        "hood seam",
      );
      mesh.position.copy(low[i]).add(high[i]).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      // The physical triangle kernel accepts upright placements. Bake this
      // seam's tilt into the delivered vertices before registering its solid.
      mesh.updateMatrix();
      mesh.geometry.applyMatrix4(mesh.matrix);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.updateMatrix();
    }
  }
  return meshes;
}

// A connected drain branch places the pressure vent beyond the widest hood.
// Its annular rim and inner wall remain visible when the steam is inactive.
export function furnaceCoolantPlan(side) {
  const sign = side ? 1 : -1;
  return {
    branch: [
      [-sign * 4.2, 2, 0],
      [-sign * 5.2, 1.7, 0.5],
      [-sign * 5.2, 0.35, 0.85],
      [-sign * 4.8, 0.35, 1.1],
    ],
    tip: [-sign * 4.8, 1.3, 1.1],
  };
}

export function buildFurnaceCoolant(side, metal, place) {
  const plan = furnaceCoolantPlan(side),
    meshes = [],
    add = (geometry, name) => {
      const mesh = place(geometry, metal, 0, 0, 0);
      mesh.name = name;
      meshes.push(mesh);
      return mesh;
    };
  const curve = new THREE.CatmullRomCurve3(
    plan.branch.map((p) => new THREE.Vector3(...p)),
  );
  // Both ends insert into adjoining pipes, leaving no exposed cut surface.
  add(new THREE.TubeGeometry(curve, 18, 0.16, 10, false), "coolant branch");
  const [x, top, z] = plan.tip;
  add(
    furnaceShellGeometry(
      [top - 1, top].map((y) => ({
        x,
        y,
        z,
        w: 0.6,
        d: 0.6,
        cut: 0.292893,
      })),
      0.06,
    ),
    "open pressure vent",
  );
  return { ...plan, meshes };
}

export function forgeGantryPlan(index, crown) {
  const half = 5.8,
    base = 8.8;
  const shapes = [
    [
      [-half, base],
      [-3.8, crown],
      [3.8, crown],
      [half, base],
    ],
    Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI - (i * Math.PI) / 8;
      return [Math.cos(a) * half, base + Math.sin(a) * (crown - base)];
    }),
    [
      [-half, base],
      [-2.7, crown],
      [half, base],
    ],
    [
      [-half, base],
      [-half, crown],
      [half, crown],
      [half, base],
    ],
    [
      [-half, base],
      [-3.4, crown],
      [0, crown - 1.2],
      [3.4, crown],
      [half, base],
    ],
    [
      [-half, base],
      [-4.4, crown],
      [-1.8, crown],
      [0, crown - 1.4],
      [1.8, crown],
      [4.4, crown],
      [half, base],
    ],
    [
      [-half, base],
      [-3, crown - 1.5],
      [0, crown],
      [3, crown - 1.5],
      [half, base],
    ],
    [
      [-half, base],
      [-4.8, crown],
      [4.8, crown],
      [half, base],
    ],
    Array.from({ length: 13 }, (_, i) => {
      const a = Math.PI - (i * Math.PI) / 12;
      return [Math.cos(a) * half, base + Math.sin(a) * (crown - base)];
    }),
  ];
  const points = shapes[index];
  if (!points) throw new RangeError("Unknown forge gantry");
  let bearing;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    if (a[0] <= 0 && b[0] >= 0 && b[0] !== a[0])
      bearing = a[1] + ((b[1] - a[1]) * -a[0]) / (b[0] - a[0]);
  }
  return { points, bearing };
}

// Offset the complete centerline before joining faces. Independently rotated
// boxes leave open wedges on the outside of every bend in a segmented arch.
export function forgeGantryGeometry(plan, width = 1.2, depth = 3.3) {
  const points = plan.points.map((p) => new THREE.Vector2(...p));
  const normals = points.slice(1).map((p, i) => {
    const d = p.clone().sub(points[i]).normalize();
    return new THREE.Vector2(-d.y, d.x);
  });
  const sections = points.map((p, i) => {
    const before = normals[Math.max(0, i - 1)],
      after = normals[Math.min(i, normals.length - 1)],
      miter = before.clone().add(after).normalize();
    miter.multiplyScalar(width / 2 / miter.dot(after));
    const outer = p.clone().add(miter),
      inner = p.clone().sub(miter);
    return [
      new THREE.Vector3(outer.x, outer.y, -depth / 2),
      new THREE.Vector3(outer.x, outer.y, depth / 2),
      new THREE.Vector3(inner.x, inner.y, depth / 2),
      new THREE.Vector3(inner.x, inner.y, -depth / 2),
    ];
  });
  const positions = [],
    uv = [];
  const quad = (a, b, c, d) => {
    const corners = [a, b, c, d],
      coords = [
        [0, 0],
        [a.distanceTo(b) / 2, 0],
        [d.distanceTo(c) / 2, b.distanceTo(c) / 2],
        [0, a.distanceTo(d) / 2],
      ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[i].toArray());
      uv.push(...coords[i]);
    }
  };
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4;
      quad(
        sections[i][j],
        sections[i][k],
        sections[i + 1][k],
        sections[i + 1][j],
      );
    }
  quad(...sections[0].toReversed());
  quad(...sections.at(-1));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
