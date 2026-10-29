import * as THREE from "three";
import { vaultStoneGeometry } from "./palace-geometry.js";
import { stationAssemblySolid } from "./field-station-solids.js";
// Authored upper profiles retain the existing columns and open arch intrados.
const PROFILES = [
  ["Quay parapet", "low", 0.45],
  ["Exchange counting attic", "stepped", 0.8],
  ["Harbor pediment", "gable", 0.7],
  ["Workshop sawtooth", "gable", 0.5],
  ["Return gallery", "wave", 0.6],
  ["Intake service parapet", "low", 0.38],
  ["Counterflow crown", "wave", 0.65],
  ["Queen's processional attic", "stepped", 1.2],
  ["Reserve cloister", "low", 0.55],
  ["Basilica stepped crown", "stepped", 1.5],
];
export function palaceArcadePlan(room, side, bay, length, spring) {
  const [name, kind, rise] = PROFILES[room],
    outer = length / 2 + 0.2;
  const crown = (u) => {
    const t = Math.abs(u / outer);
    if (kind === "gable") return rise * Math.max(0, 1 - t);
    if (kind === "wave")
      return (
        rise *
        (0.5 + 0.5 * Math.cos((u / outer) * Math.PI * 2 + (bay % 2) * Math.PI))
      );
    if (kind === "stepped")
      return rise * (t < 0.3 ? 1 : t < 0.65 ? 0.55 : 0.15);
    return rise * (bay % 2 ? 0.35 : 0.1);
  };
  return {
    name,
    room,
    side,
    bay,
    length,
    spring,
    inner: length / 2 - 1.05,
    outer,
    depth: 1.13,
    top: (u) => spring + outer + 0.45 + crown(u),
    bottom: (u) => spring + Math.sqrt(Math.max(0, (outer - 0.24) ** 2 - u * u)),
  };
}

// Closed fill and coping cells preserve the opening below the old arch.
export function closedArcadeCell(x0, x1, b0, b1, t0, t1, depth) {
  const p = [],
    n = [],
    uv = [],
    z = depth / 2,
    a = [x0, b0, -z],
    b = [x1, b1, -z],
    c = [x1, t1, -z],
    d = [x0, t0, -z],
    e = [x0, b0, z],
    f = [x1, b1, z],
    g = [x1, t1, z],
    h = [x0, t0, z];
  function face(points, outward) {
    const normal = new THREE.Vector3()
      .subVectors(
        new THREE.Vector3(...points[1]),
        new THREE.Vector3(...points[0]),
      )
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...points[2]),
          new THREE.Vector3(...points[0]),
        ),
      )
      .normalize();
    if (normal.dot(new THREE.Vector3(...outward)) < 0) {
      points.reverse();
      normal.negate();
    }
    for (let i = 1; i < points.length - 1; i++)
      for (const v of [points[0], points[i], points[i + 1]]) {
        p.push(...v);
        n.push(...normal.toArray());
        uv.push(
          (Math.abs(normal.x) > 0.7 ? v[2] : v[0]) / 2,
          (Math.abs(normal.y) > 0.7 ? v[2] : v[1]) / 2,
        );
      }
  }
  face([a, b, c, d], [0, 0, -1]);
  face([e, f, g, h], [0, 0, 1]);
  face([a, e, h, d], [-1, 0, 0]);
  face([b, f, g, c], [1, 0, 0]);
  face([a, b, f, e], [0, -1, 0]);
  face([d, c, g, h], [0, 1, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

// Extrude a closed outline without the internal faces between masonry cells.
function profileSolid(bottom, top, depth) {
  const points = [...bottom, ...top.slice().reverse()];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < points.length && points.length > 3; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      if (
        Math.abs(
          (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
        ) < 1e-8
      ) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const p of points.slice(1)) shape.lineTo(...p);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export function arcadeUpperCells(room, side, bay, length, spring) {
  const plan = palaceArcadePlan(room, side, bay, length, spring),
    stepped = [1, 7, 9].includes(room),
    xs = Array.from(
      { length: 9 },
      (_, i) => -plan.outer * Math.cos((i / 8) * Math.PI),
    ),
    cuts = [
      ...new Set(
        [...xs, ...[-0.65, -0.3, 0.3, 0.65].map((t) => t * plan.outer)].map(
          (x) => Math.round(x * 1e8) / 1e8,
        ),
      ),
    ].sort((a, b) => a - b),
    cells = [],
    top = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1],
      b = cuts[i],
      mid = (a + b) / 2,
      t0 = plan.top(stepped ? mid : a),
      t1 = plan.top(stepped ? mid : b);
    cells.push({
      a,
      b,
      bottom0: plan.bottom(a),
      bottom1: plan.bottom(b),
      t0,
      t1,
    });
    top.push([a, t0], [b, t1]);
  }
  const uniqueTop = top.filter(
      (p, i) => !i || p[0] !== top[i - 1][0] || p[1] !== top[i - 1][1],
    ),
    bottom = xs.map((u) => [u, plan.bottom(u)]),
    low = Math.min(...uniqueTop.map((p) => p[1])) - 0.025;
  return {
    plan,
    cells,
    fill: profileSolid(bottom, uniqueTop, plan.depth),
    cap: profileSolid(
      [
        [-plan.outer, low],
        [plan.outer, low],
      ],
      uniqueTop.map(([u, y]) => [u, y + 0.2]),
      1.45,
    ),
  };
}

export function buildPalaceArcadeHead(
  game,
  root,
  materials,
  spec,
  dressed,
  tone,
) {
  const { room, side, bay, az, bz, spring } = spec,
    length = bz - az,
    { plan, cells, fill, cap } = arcadeUpperCells(
      room,
      side,
      bay,
      length,
      spring,
    ),
    parts = [...dressed],
    fills = [],
    caps = [],
    feature = { id: `palace-arcade-${room}-${side}-${bay}` };
  let serial = game.level.seed + room * 10007 + (side + 1) * 1009 + bay * 137;
  const add = (geometry, material, offsetY = 0, offsetDepth = 0) => {
    tone(geometry, ++serial);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(side * 19 - offsetDepth, offsetY, (az + bz) / 2);
    mesh.rotation.y = -Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  add(
    vaultStoneGeometry(
      plan.inner + 0.1,
      plan.outer - 0.015,
      0,
      Math.PI,
      plan.depth,
      8,
    ),
    materials.dark,
    spring,
  );
  add(fill, materials.stone);
  add(cap, materials.stone);
  for (const cell of cells) {
    fills.push({
      geometry: closedArcadeCell(
        cell.a,
        cell.b,
        cell.bottom0,
        cell.bottom1,
        cell.t0,
        cell.t1,
        plan.depth,
      ),
    });
    caps.push({
      geometry: closedArcadeCell(
        cell.a,
        cell.b,
        Math.min(...cells.map((c) => Math.min(c.t0, c.t1))) - 0.025,
        Math.min(...cells.map((c) => Math.min(c.t0, c.t1))) - 0.025,
        cell.t0 + 0.2,
        cell.t1 + 0.2,
        1.45,
      ),
    });
  }
  for (const face of [-1, 1])
    add(
      new THREE.BoxGeometry(length - 2.2, 0.14, 0.035),
      materials.plaster,
      spring + plan.outer + 0.2,
      face * (plan.depth / 2 - 0.0025),
    );
  const solid = stationAssemblySolid(game, feature, parts, {
    bodyPadding: 0.5,
    supportRadius: 0.4,
  });
  // Short bounds follow the curved fill and each coping level. The old arch
  // runs already contain the recessed core; separate cell boxes would multiply
  // camera work without changing the available opening below the stone.
  let cameraRuns = 0;
  for (const meshes of [fills, caps])
    for (let i = 0; i < meshes.length; i += 4) {
      const bounds = new THREE.Box3();
      for (const mesh of meshes.slice(i, i + 4)) {
        mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox);
      }
      const size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3()),
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z),
        mesh = new THREE.Mesh(geometry, materials.stone);
      mesh.rotation.y = -Math.PI / 2;
      mesh.position.set(
        side * 19 - center.z,
        center.y,
        (az + bz) / 2 + center.x,
      );
      root.add(mesh);
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
      root.remove(mesh);
      geometry.dispose();
      cameraRuns++;
    }
  for (const cell of [...fills, ...caps]) cell.geometry.dispose();
  return {
    ...spec,
    name: plan.name,
    plan,
    solid,
    cells: cells.map(({ a, b, bottom0, bottom1, t0, t1 }) => ({
      a,
      b,
      bottom0,
      bottom1,
      t0,
      t1,
    })),
    parts: parts.length,
    cameraRuns,
  };
}
