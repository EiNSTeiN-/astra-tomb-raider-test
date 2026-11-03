import * as T from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { RoofCamera } from "./roof-camera.js";
import {
  roofFaceHeight,
  FacadeCamera,
  PavilionCamera,
  geometryFromFaces,
  opening,
  extrude,
  projectTimberUVs,
} from "./fitted-facades.js";
export { roofFaceHeight, FacadeCamera } from "./fitted-facades.js";
import { stationAssemblySolid } from "./field-station-solids.js";

// Fictional buildings, with different window rhythms on every side. Court 4
// deliberately keeps its open bell pavilion instead of an upper house.
const profiles = {
  0: ["Pilgrim lodge", 6.8, 4.7, 0.45, "shutters"],
  1: ["Echo lantern", 6.3, 4.5, 0.8, "arches"],
  2: ["Listening gallery", 6.8, 4.5, 0.25, "transoms"],
  3: ["Stair house", 6.1, 4.7, 0.7, "paired"],
  5: ["House of woven wind", 6.8, 4.7, 0.65, "lattice"],
  6: ["Summit watch", 6, 4.4, 0.35, "slits"],
  7: ["Scripture archive", 6.7, 4.6, 0.4, "stacked"],
  8: ["Bell observatory", 6.5, 4.7, 1.05, "sunwheel"],
};

export function upperRoomPlan(index) {
  if (!profiles[index]) return null;
  const [name, width, depth, corner, windows] = profiles[index];
  const x = width / 2,
    z = depth / 2,
    c = corner;
  return {
    name,
    width,
    depth,
    windows,
    // Clockwise: a facade's local positive Z points out of the building.
    footprint: [
      [-x + c, -z],
      [x - c, -z],
      [x, -z + c],
      [x, z - c],
      [x - c, z],
      [-x + c, z],
      [-x, z - c],
      [-x, -z + c],
    ].reverse(),
  };
}

function clip(polygon, a, b) {
  const result = [],
    distance = (p) =>
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      d = distance(p),
      e = distance(q);
    if (d <= 1e-9) result.push(p);
    if ((d < 0 && e > 0) || (d > 0 && e < 0)) {
      const t = d / (d - e);
      result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return result;
}

// Closed, recessed backing. A small XZ grid fits both roof profiles, including
// the central ridge; no invisible rectangular floor bridges the cut corners.
function fittedCore(footprint, bottom, top) {
  const faces = [],
    edges = new Map(),
    key = (p) => p.map((n) => Math.round(n * 1e6)).join(","),
    xs = footprint.map((p) => p[0]),
    zs = footprint.map((p) => p[1]),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z0 = Math.min(...zs),
    z1 = Math.max(...zs),
    nx = Math.ceil((x1 - x0) / 0.3),
    nz = Math.ceil((z1 - z0) / 0.3);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      let poly = [
        [x0 + (x * (x1 - x0)) / nx, z0 + (z * (z1 - z0)) / nz],
        [x0 + (x * (x1 - x0)) / nx, z0 + ((z + 1) * (z1 - z0)) / nz],
        [x0 + ((x + 1) * (x1 - x0)) / nx, z0 + ((z + 1) * (z1 - z0)) / nz],
        [x0 + ((x + 1) * (x1 - x0)) / nx, z0 + (z * (z1 - z0)) / nz],
      ];
      for (let j = 0; j < footprint.length && poly.length; j++)
        poly = clip(poly, footprint[j], footprint[(j + 1) % footprint.length]);
      if (poly.length < 3) continue;
      poly = poly.filter((p, i) => key(p) !== key(poly[(i + 1) % poly.length]));
      if (poly.length < 3) continue;
      const hi = poly.map(([x, z]) => new T.Vector3(x, top(x, z), z)),
        lo = poly.map(([x, z]) => new T.Vector3(x, bottom(x, z), z));
      faces.push(hi, [...lo].reverse());
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j],
          b = poly[(j + 1) % poly.length],
          k = [key(a), key(b)].sort().join("|");
        if (edges.has(k)) edges.delete(k);
        else
          edges.set(k, [
            lo[j],
            lo[(j + 1) % poly.length],
            hi[(j + 1) % poly.length],
            hi[j],
          ]);
      }
    }
  faces.push(...edges.values());
  return geometryFromFaces(faces);
}

function windowLayout(style, length, side) {
  const long = length > 4.5,
    rows = [];
  const add = (x, y, w, h, kind) =>
    rows.push({ x, y, w, h, kind: kind || "rectangle" });
  if (length < 1.5) return rows;
  if (style === "sunwheel") {
    if (long) {
      add(0, 16.1, 1.55, 1.55, "circle");
      for (const x of [-1.7, 1.7]) add(x, 16.05, 0.48, 1.6);
    } else add(0, 16.15, 1.12, 1.12, "circle");
  } else if (style === "arches") {
    if (long)
      for (const x of [-1.55, 0, 1.55]) add(x, 16.05, 1.05, 2.15, "arch");
    else add(0, 16, 1.15, 2, "arch");
  } else if (style === "stacked") {
    for (const y of [15.45, 16.75])
      for (const x of long ? [-1.6, 0, 1.6] : [-0.75, 0.75])
        add(x, y, 0.9, 0.88);
  } else if (style === "slits") {
    for (const x of long ? [-1.7, -0.55, 0.55, 1.7] : [-0.65, 0.65])
      add(x, 16.15, 0.4, 1.8);
  } else if (style === "transoms") {
    for (const x of long ? [-1.55, 0, 1.55] : [-0.65, 0.65])
      add(x, 16.25, long ? 1.18 : 0.86, 1.2);
  } else if (style === "paired") {
    for (const x of long ? [-1.25, 1.25] : [0])
      add(x, side % 2 ? 16.05 : 16.3, 0.84, 1.75, "arch");
  } else {
    for (const x of long ? [-1.65, 0, 1.65] : [-0.7, 0.7])
      add(x, 16.05, long ? 1.05 : 0.82, 1.8);
  }
  return rows.filter((r) => Math.abs(r.x) + r.w / 2 + 0.14 < length / 2);
}

export function upperRoomMaterials(base) {
  return Object.fromEntries(
    Object.entries(base).map(([name, m]) => {
      const copy = m.clone();
      copy.name = `Upper pavilion ${name}`;
      copy.vertexColors = true;
      return [name, copy];
    }),
  );
}

export function buildPavilionHouse(
  game,
  parent,
  index,
  mainDeck,
  upperDeck,
  materials,
) {
  const root = new T.Group();
  root.name = `Fitted pavilion frame ${index}`;
  parent.add(root);
  const plan = upperRoomPlan(index),
    bottom = roofFaceHeight(mainDeck),
    ceiling = roofFaceHeight(mainDeck, false),
    upper = upperDeck ? roofFaceHeight(upperDeck, false) : null,
    raw = [],
    windows = [],
    joints = [],
    cameraParts = [],
    cameraBounds = new T.Box3();
  const capture = (mesh, kernel = null) => {
    mesh.updateMatrix();
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone();
    cameraParts.push({ box, inverse: mesh.matrix.clone().invert(), kernel });
    cameraBounds.union(box.clone().applyMatrix4(mesh.matrix));
  };
  let seed = game.level.seed + index * 7919;
  const emit = (g, mat, tag, matrix = null, camera = null) => {
    if (matrix) g.applyMatrix4(matrix);
    const p = g.attributes.position,
      colors = [];
    for (let i = 0; i < p.count; i++) {
      const shade =
        0.94 +
        0.06 * Math.sin(p.getX(i) * 0.83 + p.getY(i) * 0.29 + p.getZ(i) * 0.53);
      colors.push(shade, shade, shade);
    }
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    const mesh = new T.Mesh(g, mat);
    mesh.name = tag;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    raw.push(mesh);
    if (camera) capture(mesh, camera);
    return mesh;
  };
  const beam = (
    a,
    b,
    width,
    depth,
    mat = materials.wood,
    tag = "Jointed timber",
  ) => {
    a = new T.Vector3(...a);
    b = new T.Vector3(...b);
    const length = a.distanceTo(b),
      g = stoneBlockGeometry(width, length, depth, ++seed, 0.025);
    projectTimberUVs(g);
    const matrix = new T.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      ),
      new T.Vector3(1, 1, 1),
    );
    const mesh = emit(g, mat, tag, matrix);
    // Large beams retain their own oriented box before rendering is batched.
    // The small bevel is inside that envelope, as with existing court beams.
    if (length > 2) {
      const proxy = new T.Mesh(new T.BoxGeometry(width, length, depth), mat);
      proxy.applyMatrix4(matrix);
      root.add(proxy);
      capture(proxy);
      root.remove(proxy);
      proxy.geometry.dispose();
    }
    return mesh;
  };
  // Two trusses transfer the new ceiling battens into the existing red plates.
  for (const z of [-21, -15]) {
    const y = Math.min(...[-5.6, 0, 5.6].map((x) => ceiling(x, z))) - 0.09;
    beam(
      [-5.8, y - 0.19, z],
      [5.8, y - 0.19, z],
      0.36,
      0.44,
      materials.wood,
      "Purlin on truss",
    );
    for (const x of [-5.5, 0, 5.5]) {
      beam(
        [x, 10.84, z],
        [x, y - 0.07, z],
        0.33,
        0.38,
        materials.red,
        "Truss king post",
      );
      joints.push({ kind: "plate bearing", x, y: 10.89, z });
    }
    for (const side of [-1, 1])
      beam(
        [side * 5.5, 10.88, z],
        [side * 0.3, y - 0.2, z],
        0.22,
        0.28,
        materials.wood,
        "Truss diagonal",
      );
  }
  if (plan) {
    const footprint = plan.footprint.map(([x, z]) => [x, z - 18]),
      inset = footprint.map(([x, z]) => [x * 0.947, (z + 18) * 0.925 - 18]),
      low = (x, z) => bottom(x, z) - 0.08,
      high = (x, z) => upper(x, z) + 0.05,
      core = fittedCore(inset, low, high);
    emit(
      core,
      materials.plaster,
      "Closed fitted backing",
      null,
      new RoofCamera(core),
    );
    for (let side = 0; side < footprint.length; side++) {
      const a = footprint[side],
        b = footprint[(side + 1) % footprint.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        ex = dx / length,
        ez = dz / length,
        cx = (a[0] + b[0]) / 2,
        cz = (a[1] + b[1]) / 2,
        angle = Math.atan2(-ez, ex),
        matrix = new T.Matrix4().makeRotationY(angle).setPosition(cx, 0, cz),
        at = (s, y, d = 0) => [cx + ex * s - ez * d, y, cz + ez * s + ex * d],
        contour = [],
        steps = Math.ceil(length / 0.18),
        layout = windowLayout(plan.windows, length, side);
      for (let j = 0; j <= steps; j++) {
        const s = -length / 2 + (j * length) / steps,
          [x, , z] = at(s, 0);
        contour.push([s, low(x, z)]);
      }
      for (let j = steps; j >= 0; j--) {
        const s = -length / 2 + (j * length) / steps,
          [x, , z] = at(s, 0);
        contour.push([s, high(x, z)]);
      }
      const holes = layout.map((r) => opening(r.x, r.y, r.w, r.h, r.kind)),
        skin = extrude(contour, holes, 0.19),
        camera = new FacadeCamera(skin);
      // Capture in facade coordinates; the kernel uses the same orientation.
      const mesh = emit(skin, materials.plaster, "Revealed plaster facade");
      mesh.applyMatrix4(matrix);
      capture(mesh, camera);
      for (const r of layout) {
        const hole = opening(r.x, r.y, r.w, r.h, r.kind),
          outer = opening(r.x, r.y, r.w + 0.2, r.h + 0.2, r.kind),
          frame = extrude(outer, [hole], 0.1).translate(0, 0, 0.045),
          backing = extrude(hole, [], 0.045).translate(0, 0, -0.13);
        emit(frame, materials.red, "Window carved surround", matrix);
        emit(backing, materials.shadow, "Recessed shutter backing", matrix);
        // All grilles sit inside the real reveal, with their ends in its frame.
        const facadeBeam = (s1, y1, s2, y2, w = 0.055, d = 0.055) =>
          beam(
            at(s1, y1, -0.045),
            at(s2, y2, -0.045),
            w,
            d,
            materials.wood,
            "Window joinery",
          );
        if (r.kind === "circle") {
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4;
            facadeBeam(
              r.x,
              r.y,
              r.x + Math.cos(a) * r.w * 0.52,
              r.y + Math.sin(a) * r.h * 0.52,
              0.055,
            );
          }
        } else {
          const arch = r.kind === "arch" ? r.w / 2 : 0;
          for (let k = 1; k <= 3; k++) {
            const s = r.x - r.w / 2 + (k * r.w) / 4;
            const top =
              r.y +
              r.h / 2 -
              arch +
              (arch ? Math.sqrt(Math.max(0, arch * arch - (s - r.x) ** 2)) : 0);
            facadeBeam(s, r.y - r.h / 2 - 0.035, s, top + 0.035);
          }
          facadeBeam(r.x - r.w / 2 - 0.025, r.y, r.x + r.w / 2 + 0.025, r.y);
          if (plan.windows === "lattice") {
            facadeBeam(
              r.x - r.w * 0.47,
              r.y - r.h * 0.47,
              r.x + r.w * 0.47,
              r.y + r.h * 0.47,
            );
            facadeBeam(
              r.x + r.w * 0.47,
              r.y - r.h * 0.47,
              r.x - r.w * 0.47,
              r.y + r.h * 0.47,
            );
          }
          if (plan.windows === "transoms")
            for (const offset of [-0.32, 0.32])
              facadeBeam(
                r.x - r.w / 2,
                r.y + offset,
                r.x + r.w / 2,
                r.y + offset,
                0.065,
                0.09,
              );
        }
        windows.push({
          side,
          ...r,
          center: at(r.x, r.y),
          outward: [-ez, 0, ex],
          along: [ex, 0, ez],
          recess: 0.13,
        });
      }
      // Continuous sill and cornice follow the actual roof joints instead of
      // leaving the old unsupported rectangular cap beneath a curved roof.
      for (const [height, offset, thickness, depth, mat, tag] of [
        [high, -0.15, 0.19, 0.25, materials.red, "Fitted cornice"],
        [
          low,
          0.2,
          0.2,
          0.24,
          plan.windows === "slits" ? materials.stone : materials.wood,
          "Roof-seated sill",
        ],
      ]) {
        const edge = [];
        for (let j = 0; j <= steps; j++) {
          const s = -length / 2 + (j * length) / steps,
            [x, , z] = at(s, 0);
          edge.push([s, height(x, z) + offset]);
        }
        const outline = [
            ...edge.map(([s, y]) => [s, y - thickness / 2]),
            ...[...edge].reverse().map(([s, y]) => [s, y + thickness / 2]),
          ],
          g = extrude(outline, [], depth).translate(0, 0, 0.02 + depth / 2),
          camera = new FacadeCamera(g),
          mesh = emit(g, mat, tag);
        mesh.applyMatrix4(matrix);
        capture(mesh, camera);
      }
      for (const s of [-length / 2 + 0.05, length / 2 - 0.05]) {
        const [x, , z] = at(s, 0);
        beam(
          at(s, low(x, z) + 0.04, 0.015),
          at(s, high(x, z) - 0.05, 0.015),
          0.18,
          0.23,
          materials.red,
          "Corner stile",
        );
      }
      // Exterior bands break the tall plaster panels, also on rear elevations.
      if (length > 1.5) {
        const band = plan.windows === "stacked" ? 16.1 : 14.75;
        beam(
          at(-length / 2, band, 0.025),
          at(length / 2, band, 0.025),
          0.14,
          0.19,
          materials.red,
          "Storey rail",
        );
      }
    }
  }
  if (game.cameraSurfaces) {
    const size = cameraBounds.getSize(new T.Vector3()),
      center = cameraBounds.getCenter(new T.Vector3()),
      proxy = new T.Mesh(
        new T.BoxGeometry(size.x, size.y, size.z).translate(
          center.x,
          center.y,
          center.z,
        ),
        materials.wood,
      );
    root.add(proxy);
    game.cameraSurfaces.capture(proxy, {
      kernel: new PavilionCamera(cameraParts),
      small: true,
      thin: true,
    });
    root.remove(proxy);
    proxy.geometry.dispose();
  }
  const record = { id: `pavilion-house-${index}`, root, plan, windows, joints };
  stationAssemblySolid(game, record, raw, {
    bodyPadding: 0.55,
    support: false,
  });
  mergeArchitecture(root, 2);
  return record;
}
