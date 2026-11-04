import * as T from "three";
import { monasteryGalleryRoofPlan } from "./monastery-wing-plan.js";
import { connectMonasteryGallery } from "./monastery-wings.js";
import { roofBattenGeometry } from "./roof-timber.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { RoofCamera } from "./roof-camera.js";
import { PavilionCamera, projectTimberUVs } from "./fitted-facades.js";

// The first bay remains the established lodge-door route. Outer bays vary in
// actual volume, with open ruin bays retaining their posts and longitudinal beam.
const COMPOSITIONS = [
  ["Pilgrim cloisters", ["hip", 1.2], ["hip", 1.2]],
  ["Echo gables", ["gable", 2.25], ["gable", 2.25]],
  ["Listening pavilions", ["pavilion", 1.85], ["pavilion", 1.85]],
  ["Stair of roofs", ["gable", 1.7], ["pavilion", 2.7]],
  ["Broken memory walk", ["hip", 0.75], null],
  ["Woven sky", ["gable", 1.7], ["pavilion", 2.2]],
  ["Summit shelter", ["hip", 0.75], ["gable", 2.6]],
  ["Archive cloister", ["gable", 1.5], ["hip", 0.8]],
  ["Bell procession", ["pavilion", 2.1], ["gable", 2.9]],
];

export function monasteryGalleryPlan(index, side) {
  const [name, middle, end] = COMPOSITIONS[index % 9];
  return {
    name,
    side,
    bays: [
      [-17, -5],
      [-5, 7],
      [7, 18],
    ].map(([za, zb], bay) => {
      const shape = bay === 0 ? ["hip", 1.2] : bay === 1 ? middle : end;
      const open = !shape || (index % 9 === 5 && side < 0 && bay === 1);
      const original = monasteryGalleryRoofPlan(za, zb);
      // Separate outer caps by an intentional 12 cm drainage joint. There are
      // no overlapping hip shells at the post lines. Keep the door bay intact.
      const start = bay === 1 ? -4.08 : 7.06,
        finish = bay === 1 ? 6.94 : 18.8;
      return {
        bay,
        za,
        zb,
        open,
        roof:
          bay === 0
            ? { ...original, profile: "hip" }
            : {
                ...original,
                width: finish - start,
                z: (start + finish) / 2,
                rise: shape?.[1] ?? 0,
                profile: shape?.[0] ?? "hip",
              },
      };
    }),
  };
}

// Intersect actual underside triangles with a frame plane. Every source edge
// crossing becomes a break in the fitted rafter, including diagonal grid edges.
function undersideTriangles(mesh) {
  mesh.updateMatrix();
  const p = mesh.geometry.attributes.position,
    ids = mesh.geometry.index,
    faces = [];
  for (let i = 0; i < ids.count; i += 3) {
    const v = [0, 1, 2].map((j) =>
      new T.Vector3()
        .fromBufferAttribute(p, ids.getX(i + j))
        .applyMatrix4(mesh.matrix),
    );
    if (new T.Triangle(...v).getNormal(new T.Vector3()).y < -0.000001)
      faces.push(v);
  }
  return faces;
}
function slice(faces, z, x0, x1) {
  const values = [];
  for (const face of faces)
    for (let i = 0; i < 3; i++) {
      const a = face[i],
        b = face[(i + 1) % 3];
      if (Math.abs(a.z - b.z) < 1e-9) continue;
      const t = (z - a.z) / (b.z - a.z);
      if (t < -1e-7 || t > 1 + 1e-7) continue;
      const x = T.MathUtils.lerp(a.x, b.x, t),
        y = T.MathUtils.lerp(a.y, b.y, t);
      if (x >= x0 - 1e-6 && x <= x1 + 1e-6)
        values.push([Math.max(x0, Math.min(x1, x)), y - 0.13]);
    }
  // Add the clipped endpoints through a real triangle, not a roof formula.
  for (const x of [x0, x1])
    for (const face of faces) {
      const [a, b, c] = face,
        d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
        u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
        values.push([x, u * a.y + v * b.y + (1 - u - v) * c.y - 0.13]);
        break;
      }
    }
  values.sort((a, b) => a[0] - b[0]);
  return values.filter((v, i) => !i || v[0] - values[i - 1][0] > 1e-5);
}

export function buildMonasteryGalleries(
  game,
  parent,
  index,
  sides,
  wings,
  roofAt,
  wood,
  red,
) {
  const root = new T.Group(),
    records = [];
  root.name = `Fitted cloister galleries ${index}`;
  parent.add(root);
  let tag = 0;
  for (const side of sides) {
    const plan = monasteryGalleryPlan(index, side);
    for (const bay of plan.bays) {
      const first = root.children.length,
        id = tag++,
        parts = [],
        eaves = [],
        bearings = [];
      const { za, zb, roof: r } = bay,
        x = side * 19;
      const frameBox = (w, h, d, material, px, py, pz) => {
        const mesh = new T.Mesh(
          projectTimberUVs(new T.BoxGeometry(w, h, d)),
          material,
        );
        mesh.position.set(px, py, pz);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        parts.push(mesh);
        return mesh;
      };
      const beamStart = za - (bay.bay === 0 ? 0.4 : 0),
        beamEnd = zb + (bay.bay === 2 ? 0.4 : 0);
      frameBox(
        0.5,
        0.45,
        beamEnd - beamStart,
        wood,
        x,
        5.58,
        (beamStart + beamEnd) / 2,
      );
      if (!bay.open) {
        const deck = roofAt(
          r.width,
          r.depth,
          r.rise,
          x,
          r.y,
          r.z,
          r.angle,
          index % 3 === 1 && za === 7 ? 1 : 0,
          (meshes) => {
            eaves.push(meshes[3]);
            if (bay.bay === 0)
              connectMonasteryGallery(
                wings.find((w) => w.plan.side === side),
                meshes,
              );
          },
          r.profile,
          root,
        );
        const faces = undersideTriangles(deck),
          reach = Math.floor((r.width / 2 - 0.9) / 1.2) * 1.2;
        const lowered = deck.geometry.clone().translate(0, -0.13, 0),
          rafters = roofBattenGeometry(lowered, {
            spacing: reach,
            width: 0.1,
            depth: 0.22,
          });
        lowered.dispose();
        rafters.applyMatrix4(deck.matrix);
        const rafterMesh = new T.Mesh(rafters, wood);
        rafterMesh.name = "Roof-fitted cloister rafters";
        rafterMesh.castShadow = rafterMesh.receiveShadow = true;
        root.add(rafterMesh);
        parts.push(rafterMesh);
        for (const z of [r.z - reach, r.z, r.z + reach]) {
          const points = slice(faces, z, x - 2, x + 2);
          if (
            points.length < 2 ||
            points[0][0] > x - 1.99 ||
            points.at(-1)[0] < x + 1.99
          )
            continue;
          frameBox(4.35, 0.22, 0.28, red, x, 5.91, z);
          const center =
            points.reduce(
              (best, p) =>
                Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best,
              points[0],
            )[1] - 0.22;
          if (center > 6.005) {
            frameBox(
              0.18,
              center - 5.995,
              0.18,
              wood,
              x,
              (center + 5.995) / 2,
              z,
            );
          }
          bearings.push(
            ...points.map(([px, y]) => ({ x: px, y, z, kind: "rafter" })),
            { x, y: 5.8, z, kind: "tie" },
          );
        }
      }
      if (parts.length) {
        const assembly = [...parts, ...eaves],
          cameraParts = assembly.map((m) => {
            m.updateMatrix();
            m.geometry.computeBoundingBox();
            return {
              box: m.geometry.boundingBox.clone(),
              inverse: m.matrix.clone().invert(),
              kernel: new RoofCamera(m.geometry),
            };
          }),
          bounds = new T.Box3();
        assembly.forEach((m) =>
          bounds.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)),
        );
        const size = bounds.getSize(new T.Vector3()),
          center = bounds.getCenter(new T.Vector3()),
          proxy = new T.Mesh(
            new T.BoxGeometry(size.x, size.y, size.z).translate(
              center.x,
              center.y,
              center.z,
            ),
            wood,
          );
        root.add(proxy);
        game.cameraSurfaces?.capture(proxy, {
          kernel: new PavilionCamera(cameraParts),
          small: true,
          thin: true,
        });
        root.remove(proxy);
        proxy.geometry.dispose();
        const solid = stationAssemblySolid(
          game,
          { id: `cloister-frame-${index}-${side}-${bay.bay}` },
          assembly,
          { bodyPadding: 0.55, supportRadius: 0 },
        );
        solid.monasteryGallery = index;
        solid.groundingSlope = true;
      }
      for (const mesh of root.children.slice(first))
        if (mesh.isMesh) {
          const count = mesh.geometry.attributes.position.count;
          mesh.geometry.setAttribute(
            "monasteryGallery",
            new T.Float32BufferAttribute(
              new Float32Array(count).fill(
                id +
                  (eaves.includes(mesh)
                    ? 0.5
                    : parts.includes(mesh)
                      ? 0.25
                      : 0),
              ),
              1,
            ),
          );
          if (!mesh.geometry.attributes.color)
            mesh.geometry.setAttribute(
              "color",
              new T.Float32BufferAttribute(
                new Float32Array(count * 3).fill(1),
                3,
              ),
            );
        }
      records.push({ id, side, name: plan.name, ...bay, bearings });
    }
  }
  // This frame is identity relative to the court. Join its geometry into the
  // court's existing material batches and keep camera entries in that frame.
  for (const entry of game.cameraSurfaces?.pending || [])
    if (entry.parent === root) entry.parent = parent;
  for (const mesh of [...root.children]) parent.add(mesh);
  parent.remove(root);
  return { root: parent, records };
}
