import * as THREE from "three";
import { crownPrism } from "./desert-crowns.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { insetStonePolygon } from "./sky-masonry.js";

const STYLES = [
  ["Processional ruins", "lintel", "pointed"],
  ["Balance colonnades", "lintel", "lintel"],
  ["Dawn portico", "round", "lintel"],
  ["Aqueduct arcades", "round", "round"],
  ["Broken noon court", "pointed", "lintel"],
  ["Ascending ephemeris", "lintel", "pointed"],
  ["Western shade", "pointed", "lintel"],
  ["Open light court", "round", "round"],
  ["Relay colonnade", "lintel", "lintel"],
  ["Corbelled precinct", "corbel", "corbel"],
];
export function arcadeCourtStyle(index) {
  const [name, rear, wing] = STYLES[index % 10];
  return { name, rear, wing };
}
export function arcadeSpanStyle(index, span, i) {
  const style = arcadeCourtStyle(index),
    rear = span.a.z === span.b.z;
  return {
    family: rear
      ? style.rear
      : index === 6 && span.a.x < 0
        ? "round"
        : style.wing,
    raise:
      index === 5 && rear
        ? i * 0.3
        : index === 6 && !rear
          ? span.a.x < 0
            ? 0.4
            : -0.6
          : 0,
    broken:
      span.broken ||
      ([0, 4, 7].includes(index) && rear && (i === 0 || i === 4)),
  };
}
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    cross = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (seq) => {
    const out = [];
    for (const v of seq) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), v) <= 1e-9)
        out.pop();
      out.push(v);
    }
    return out;
  };
  return [...half(p).slice(0, -1), ...half([...p].reverse()).slice(0, -1)];
}
function cameraPlanes(geometry) {
  geometry.computeBoundingBox();
  const a = geometry.attributes.position,
    points = Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i)]),
    p = hull(points),
    planes = [];
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length],
      dx = b[0] - p[i][0],
      dy = b[1] - p[i][1],
      n = Math.hypot(dx, dy),
      x = dy / n,
      y = -dx / n;
    planes.push([
      x,
      y,
      0,
      Math.max(...points.map((v) => x * v[0] + y * v[1])) + 1e-6,
    ]);
  }
  planes.push(
    [0, 0, 1, geometry.boundingBox.max.z + 1e-6],
    [0, 0, -1, -geometry.boundingBox.min.z + 1e-6],
  );
  return planes;
}
function clipY(poly, y, above) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = (a[1] - y) * (above ? 1 : -1),
      db = (b[1] - y) * (above ? 1 : -1);
    if (da >= 0) out.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out.filter(
    (p, i) =>
      Math.hypot(
        p[0] - out[(i + 1) % out.length][0],
        p[1] - out[(i + 1) % out.length][1],
      ) > 1e-7,
  );
}
function prism(poly, depth) {
  if (THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(...p))) < 0)
    poly = [...poly].reverse();
  const inset = insetStonePolygon(poly, 0.012);
  return crownPrism(
    inset.length >= 3 ? inset : poly,
    depth,
    [],
    inset.length >= 3 ? 0.012 : 0,
  );
}
export function makeArcadeHead(
  family,
  length,
  broken,
  pointedGeometry,
  seed = 1,
  parapet = true,
) {
  const pieces = [],
    cameraCells = [],
    half = length / 2 - 1.25,
    thickness = 0.62,
    depth = 2.35;
  const add = (
    geometry,
    x = 0,
    y = 0,
    role = "head",
    side = 0,
    foot = false,
  ) => {
    geometry.userData.arcadePlanes = cameraPlanes(geometry);
    pieces.push({
      geometry,
      x,
      y,
      role,
      side,
      foot,
      capture: role !== "spandrel course" && !role.includes("coping"),
    });
    return geometry;
  };
  const block = (w, h, d, x, y, role = "head", side = 0, foot = false) =>
    add(stoneBlockGeometry(w, h, d, ++seed), x, y, role, side, foot);
  const camera = (geometry, x = 0, y = 0) => {
    geometry.userData.arcadePlanes = cameraPlanes(geometry);
    cameraCells.push({ geometry, x, y });
  };
  let capBase;
  if (family === "lintel") {
    if (broken) {
      for (const side of [-1, 1]) {
        const w = side < 0 ? 2.8 : 2.1;
        block(
          w,
          0.9,
          2.7,
          side * (length / 2 - w / 2 + 0.35),
          0.45,
          "broken lintel",
          side,
          true,
        );
      }
    } else {
      block(length + 0.4, 0.9, 2.7, 0, 0.45, "monolithic lintel", 0, true);
      capBase = 0.9;
    }
  } else if (family === "corbel") {
    const steps = Math.ceil((half - 0.5) / 0.65),
      advance = (half - 0.5) / steps;
    for (const side of [-1, 1])
      for (let i = 0; i < steps; i++) {
        if (broken && i > (side < 0 ? 2 : 1)) continue;
        const outer = length / 2 + 0.25,
          inner = half - (i + 1) * advance,
          w = outer - inner;
        block(
          w,
          0.55,
          2.55,
          (side * (outer + inner)) / 2,
          i * 0.55 + 0.275,
          "corbel course",
          side,
          i === 0,
        );
      }
    if (!broken) {
      block(1.8, 0.57, 2.55, 0, steps * 0.55 + 0.265, "bridging stone");
      capBase = (steps + 1) * 0.55;
    }
  } else {
    const rise = half * 0.82;
    for (const side of [-1, 1])
      for (let i = 0; i < 12; i++) {
        if (broken && i > (side < 0 ? 6 : 3)) continue;
        const f = i / 12 + 0.002,
          t = (i + 1) / 12 - 0.002;
        let geometry;
        if (family === "pointed")
          geometry = pointedGeometry(half, thickness, depth, side, f, t);
        else {
          const edge = (outer, u) => {
            const a = (u * Math.PI) / 2;
            return [
              side * (half + (outer ? thickness : 0)) * Math.cos(a),
              (rise + (outer ? thickness : 0)) * Math.sin(a),
            ];
          };
          geometry = prism(
            [edge(false, f), edge(true, f), edge(true, t), edge(false, t)],
            depth,
          );
        }
        add(geometry, 0, 0, "spring voussoir", side, i === 0);
      }
    if (!broken) {
      const outer = half + thickness,
        curve = (x) =>
          Math.abs(x) >= outer
            ? 0
            : family === "pointed"
              ? outer *
                Math.sqrt(Math.max(0, 2.56 - (0.6 + Math.abs(x) / outer) ** 2))
              : (rise + thickness) *
                Math.sqrt(Math.max(0, 1 - (x / outer) ** 2)),
        top = curve(0) + 0.65,
        columns = Math.ceil(length / 1.3),
        width = length / columns;
      for (let col = 0; col < columns; col++) {
        const x = -length / 2 + col * width + 0.009,
          xx = x + width - 0.018,
          base = [
            [x, curve(x) - 0.025],
            [xx, curve(xx) - 0.025],
            [xx, top],
            [x, top],
          ];
        camera(crownPrism(base, 2.25, [], 0));
        for (let row = 0; row < Math.ceil(top / 0.57); row++) {
          const poly = clipY(
            clipY(base, row * 0.57 + 0.009, true),
            Math.min(top, (row + 1) * 0.57 - 0.009),
            false,
          );
          if (
            poly.length >= 3 &&
            Math.abs(
              THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(...p))),
            ) > 0.005
          )
            add(prism(poly, 2.25), 0, 0, "spandrel course");
        }
      }
      capBase = top;
    }
  }
  if (capBase !== undefined) {
    camera(new THREE.BoxGeometry(length, 0.555, 3.15), 0, capBase + 0.2475);
    const n = Math.ceil(length / 1.4),
      parity = seed % 2;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * length) / n - length / 2;
      block(length / n - 0.018, 0.3, 2.9, x, capBase + 0.12, "lower coping");
      block(length / n - 0.018, 0.25, 3.15, x, capBase + 0.4, "upper coping");
      if (
        parapet &&
        (family === "pointed" || family === "round") &&
        i % 2 === parity
      )
        block(0.8, 0.88, 2.55, x, capBase + 0.95, "merlon");
    }
  }
  const foot = Math.min(
    ...pieces
      .filter((p) => p.foot)
      .map((p) => {
        p.geometry.computeBoundingBox();
        return p.y + p.geometry.boundingBox.min.y;
      }),
  );
  return {
    family,
    pieces,
    cameraCells,
    foot,
    cap: capBase === undefined ? null : capBase + 0.525,
    top: Math.max(
      ...pieces.map((p) => {
        p.geometry.computeBoundingBox();
        return p.y + p.geometry.boundingBox.max.y;
      }),
    ),
  };
}
