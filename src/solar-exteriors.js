import * as THREE from "three";
import {
  solarExteriorPlan,
  SOLAR_EXTERIOR_STYLES,
} from "./solar-exterior-plan.js";
import { insetStonePolygon } from "./sky-masonry.js";
import { projectStoneUVs } from "./stone-uv.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

const area = (poly) =>
  THREE.ShapeUtils.area(poly.map((p) => new THREE.Vector2(...p)));
const interpolate = (a, b, t) =>
  a.map((p, i) => p.map((v, j) => THREE.MathUtils.lerp(v, b[i][j], t)));
const center = (p) =>
  p.reduce((s, v) => [s[0] + v[0] / p.length, s[1] + v[1] / p.length], [0, 0]);

// Each ring has corresponding convex vertices. One closed skin joins the raked
// body to its cornice; there is no hidden internal cap underneath the roof.
export function solarExteriorGeometry(authored) {
  const rings = authored.map((r) => ({
    y: r.y,
    points: r.points.map((p) => [...p]),
  }));
  if (area(rings[0].points) < 0) for (const r of rings) r.points.reverse();
  const positions = [];
  const tri = (a, b, c, want) => {
    const va = new THREE.Vector3(...a),
      vb = new THREE.Vector3(...b),
      vc = new THREE.Vector3(...c),
      n = vb.clone().sub(va).cross(vc.clone().sub(va));
    if (n.dot(want) < 0) [b, c] = [c, b];
    positions.push(...a, ...b, ...c);
  };
  const vertex = (r, i) => [r.points[i][0], r.y, r.points[i][1]];
  for (const [r, normal] of [
    [rings[0], new THREE.Vector3(0, -1, 0)],
    [rings.at(-1), new THREE.Vector3(0, 1, 0)],
  ])
    for (let i = 1; i < r.points.length - 1; i++)
      tri(vertex(r, 0), vertex(r, i), vertex(r, i + 1), normal);
  for (let k = 1; k < rings.length; k++) {
    const low = rings[k - 1],
      high = rings[k];
    for (let i = 0; i < low.points.length; i++) {
      const j = (i + 1) % low.points.length,
        a = low.points[i],
        b = low.points[j],
        outward = new THREE.Vector3(b[1] - a[1], 0, a[0] - b[0]);
      tri(vertex(low, i), vertex(low, j), vertex(high, j), outward);
      tri(vertex(low, i), vertex(high, j), vertex(high, i), outward);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      new Float32Array((positions.length / 3) * 2),
      2,
    ),
  );
  geometry.computeVertexNormals();
  projectStoneUVs(geometry);
  return geometry;
}

function convexPlanes(geometry) {
  const p = geometry.attributes.position,
    planes = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2),
      n = b.sub(a).cross(c.sub(a)).normalize(),
      v = [...n.toArray(), n.dot(a) + 0.00001];
    planes.set(v.map((n) => Math.round(n * 1e5)).join(","), v);
  }
  return [...planes.values()];
}

function facingGeometry(low, high, bottom, top) {
  const bevel = Math.min(0.012, (top - bottom) * 0.12),
    lo = area(low) < 0 ? low.toReversed() : low,
    hi = area(high) < 0 ? high.toReversed() : high,
    insetLow = insetStonePolygon(lo, bevel),
    insetHigh = insetStonePolygon(hi, bevel);
  if (insetLow.length !== lo.length || insetHigh.length !== hi.length)
    throw new Error("Exterior facing bevel lost a corner");
  return solarExteriorGeometry([
    { points: insetLow, y: bottom },
    { points: lo, y: bottom + bevel },
    { points: hi, y: top - bevel },
    { points: insetHigh, y: top },
  ]);
}

export function buildSolarExterior(game, gate, m) {
  const root = new THREE.Group(),
    meshes = [],
    parts = [],
    masses = [],
    feature = { id: `solar-exterior-${gate.stage}` };
  root.name = SOLAR_EXTERIOR_STYLES[gate.stage];
  gate.root.add(root);
  let triangles = 0,
    cameraCells = 0;
  const add = (geometry, material, kind, mass) => {
    const id = parts.length;
    geometry.setAttribute(
      "solarExteriorPart",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(id),
        1,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
    parts.push({ id, kind, mass });
    triangles += geometry.attributes.position.count / 3;
    return mesh;
  };
  for (const plan of solarExteriorPlan(gate.stage)) {
    const xs = plan.footprint.map((p) => p[0]),
      zs = plan.footprint.map((p) => p[1]),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs),
      bottom =
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          gate.root.position.x + (minX + maxX) / 2,
          gate.root.position.z + (minZ + maxZ) / 2,
          maxX - minX,
          maxZ - minZ,
          game.terrainProfile?.step || 1.75,
        ) -
        gate.root.position.y -
        0.28,
      shoulder = plan.height - 0.24,
      c = center(plan.upper),
      cornice = plan.upper.map(([x, z]) => [
        c[0] + (x - c[0]) * 1.025,
        c[1] + (z - c[1]) * 1.025,
      ]),
      rings = [
        { points: plan.footprint, y: bottom },
        { points: plan.upper, y: shoulder },
        { points: cornice, y: plan.height - 0.08 },
        { points: cornice, y: plan.height + 0.12 },
      ],
      geometry = solarExteriorGeometry(rings);
    add(geometry, m.trim, "continuous mass", plan.id);
    // Convex cells follow each raked band rather than a box over its empty
    // shoulder. Camera padding includes the 4.5 cm facing projection.
    for (let i = 1; i < rings.length; i++) {
      const g = solarExteriorGeometry([rings[i - 1], rings[i]]),
        proxy = new THREE.Mesh(g, m.wall);
      root.add(proxy);
      game.cameraSurfaces?.capture(proxy, {
        small: true,
        thin: true,
        planes: convexPlanes(g),
      });
      root.remove(proxy);
      g.dispose();
      cameraCells++;
    }
    const rows = Math.ceil((shoulder - bottom) / 0.65),
      rise = (shoulder - bottom) / rows;
    for (let row = 0; row < rows; row++) {
      const y0 = bottom + row * rise + 0.008,
        y1 = bottom + (row + 1) * rise - 0.008,
        lo = interpolate(
          plan.footprint,
          plan.upper,
          (y0 - bottom) / (shoulder - bottom),
        ),
        hi = interpolate(
          plan.footprint,
          plan.upper,
          (y1 - bottom) / (shoulder - bottom),
        );
      for (let face = 0; face < lo.length; face++) {
        const next = (face + 1) % lo.length,
          a = lo[face],
          b = lo[next],
          aa = hi[face],
          bb = hi[next],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          length = Math.hypot(dx, dz),
          n = [dz / length, -dx / length];
        // The bonded return stays inside existing wall stone, without a second
        // facing laid directly over the original room's exterior surface.
        if (
          (Math.abs(Math.abs(a[0]) - 6.9) < 1e-6 &&
            Math.abs(a[0] - b[0]) < 1e-6) ||
          (Math.abs(a[1] + 6.65) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6)
        )
          continue;
        const count = Math.max(1, Math.round(length / 1.3)),
          step = 1 / count,
          cuts = [0];
        for (let j = 1; j <= count; j++) {
          const t = (j - (row % 2 ? 0.5 : 0)) * step;
          if (t < 1 - 0.01) cuts.push(t);
        }
        cuts.push(1);
        const section = (a, b, left, right) => {
          const p = (t) => [
              THREE.MathUtils.lerp(a[0], b[0], t),
              THREE.MathUtils.lerp(a[1], b[1], t),
            ],
            l = p(left),
            r = p(right);
          return [
            [l[0] + n[0] * 0.045, l[1] + n[1] * 0.045],
            [r[0] + n[0] * 0.045, r[1] + n[1] * 0.045],
            [r[0] - n[0] * 0.115, r[1] - n[1] * 0.115],
            [l[0] - n[0] * 0.115, l[1] - n[1] * 0.115],
          ];
        };
        for (let j = 1; j < cuts.length; j++) {
          const left = cuts[j - 1] + 0.007 / length,
            right = cuts[j] - 0.007 / length;
          add(
            facingGeometry(
              section(a, b, left, right),
              section(aa, bb, left, right),
              y0,
              y1,
            ),
            m.trim,
            "facing stone",
            plan.id,
          );
        }
      }
    }
    masses.push({ ...plan, bottom, rings });
  }
  if (gate.stage === 6) {
    // Enclose the retained rear coping completely. Merely raising the apse
    // roof leaves the old coping's joint ends poking through its inner face.
    // This architrave bonds the apse to the existing transverse roof beam.
    const lower = [
        [-6.9, -7.1],
        [6.9, -7.1],
        [6.9, -5.9],
        [-6.9, -5.9],
      ],
      upper = [
        [-7, -7.16],
        [7, -7.16],
        [7, -5.82],
        [-7, -5.82],
      ],
      rings = [
        { points: lower, y: 6.95 },
        { points: lower, y: 7.2 },
        { points: upper, y: 7.32 },
        { points: upper, y: 7.45 },
      ];
    add(solarExteriorGeometry(rings), m.trim, "apse coping surround", 0);
    for (let i = 1; i < rings.length; i++) {
      const geometry = solarExteriorGeometry([rings[i - 1], rings[i]]),
        proxy = new THREE.Mesh(geometry, m.wall);
      root.add(proxy);
      game.cameraSurfaces?.capture(proxy, {
        small: true,
        thin: true,
        planes: convexPlanes(geometry),
      });
      root.remove(proxy);
      geometry.dispose();
      cameraCells++;
    }
  }
  const solid = stationAssemblySolid(game, feature, meshes, {
    bodyPadding: 0.72,
    supportRadius: 0.035,
    descentEscapeRadius: 0.72,
  });
  solid.solarExterior = true;
  mergeArchitecture(root);
  const record = {
    root,
    feature,
    solid,
    parts,
    masses,
    triangles,
    cameraCells,
    style: SOLAR_EXTERIOR_STYLES[gate.stage],
  };
  gate.solarExterior = record;
  return record;
}
