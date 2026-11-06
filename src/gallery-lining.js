import * as THREE from "three";
import { random } from "./campaign.js";
import { gallerySection } from "./sunken-gallery-layout.js";

export const GALLERY_FLOOR_BED = 0.032;
export const GALLERY_CEILING_BED = 0.12;

// Use the shell's union of rooms, including every overlap and change of level.
// The rectangles are disjoint; clipping a course to them cannot bridge a shaft
// or carry a slab through a wall at a different floor/ceiling height.
export function galleryLiningPlan(profile, panels) {
  const groups = new Map(),
    memorial = profile.volumes.find((room) => room.id === "memorial");
  for (const panel of panels) {
    if (panel.axis !== 1) continue;
    const section = gallerySection(
        profile,
        (panel.u0 + panel.u1) / 2,
        (panel.v0 + panel.v1) / 2,
      ),
      floor = Math.abs(section.floor - panel.plane) < 1e-6,
      key = `${floor ? "floor" : "ceiling"}/${panel.plane}`;
    if (!groups.has(key))
      groups.set(key, {
        kind: floor ? "floor" : "ceiling",
        plane: panel.plane,
        rectangles: [],
      });
    const rect = {
      x0: panel.u0,
      x1: panel.u1,
      z0: panel.v0,
      z1: panel.v1,
    };
    // The memorial's existing voussoirs already form its visible vault. Leave
    // their upper cavity as backing rather than building hidden coffers there.
    if (!floor && memorial) {
      const cut = intersection(rect, {
        x0: memorial.min.x,
        x1: memorial.max.x,
        z0: memorial.min.z,
        z1: memorial.max.z,
      });
      if (cut) {
        groups.get(key).rectangles.push(
          ...[
            { ...rect, x1: cut.x0 },
            { ...rect, x0: cut.x1 },
            { x0: cut.x0, x1: cut.x1, z0: rect.z0, z1: cut.z0 },
            { x0: cut.x0, x1: cut.x1, z0: cut.z1, z1: rect.z1 },
          ].filter((r) => r.x1 - r.x0 > 0.001 && r.z1 - r.z0 > 0.001),
        );
        continue;
      }
    }
    groups.get(key).rectangles.push(rect);
  }
  return [...groups.values()].filter((group) => group.rectangles.length);
}

function intersection(a, b) {
  const r = {
    x0: Math.max(a.x0, b.x0),
    x1: Math.min(a.x1, b.x1),
    z0: Math.max(a.z0, b.z0),
    z1: Math.min(a.z1, b.z1),
  };
  return r.x1 - r.x0 > 0.001 && r.z1 - r.z0 > 0.001 ? r : null;
}

function courseTiles(group, origin, seed) {
  const floor = group.kind === "floor",
    rowSize = floor ? 1.05 : 2,
    width = floor ? 1.7 : 2.4,
    bounds = group.rectangles.reduce(
      (b, r) => ({
        x0: Math.min(b.x0, r.x0),
        x1: Math.max(b.x1, r.x1),
        z0: Math.min(b.z0, r.z0),
        z1: Math.max(b.z1, r.z1),
      }),
      { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
    ),
    tiles = [];
  for (
    let row = Math.floor((bounds.z0 - origin.z) / rowSize);
    row < Math.ceil((bounds.z1 - origin.z) / rowSize);
    row++
  ) {
    const rng = random(seed + row * 197 + Math.round(group.plane * 1000)),
      z0 = origin.z + row * rowSize;
    let x =
      origin.x +
      Math.floor((bounds.x0 - origin.x) / width) * width -
      width * 2 +
      (floor && row % 2 ? width / 2 : 0);
    while (x < bounds.x1) {
      const length = width * (floor ? 0.8 + rng() * 0.4 : 1),
        gap = floor ? 0.018 : 0.014;
      const tile = {
        x0: x + gap / 2,
        x1: x + length - gap / 2,
        z0: z0 + gap / 2,
        z1: z0 + rowSize - gap / 2,
      };
      if (tile.x1 > bounds.x0) tiles.push(tile);
      x += length;
    }
  }
  return tiles;
}

// Each delivered piece is a closed slab with a flat interior face. Its bevel
// recedes into the stone; nothing projects into the existing swim clearance.
function slab(buffer, rect, outline, front, depth, sign, color, phase, id) {
  const bevel = Math.min(
      0.009,
      (rect.x1 - rect.x0) / 5,
      (rect.z1 - rect.z0) / 5,
    ),
    inset = (key) => (Math.abs(rect[key] - outline[key]) < 1e-6 ? bevel : 0),
    a = {
      x0: rect.x0 + inset("x0"),
      x1: rect.x1 - inset("x1"),
      z0: rect.z0 + inset("z0"),
      z1: rect.z1 - inset("z1"),
    },
    rings = [
      [a, front],
      [rect, front - sign * bevel],
      [rect, front - sign * depth],
    ].map(([r, y]) => [
      [r.x0, y, r.z0],
      [r.x1, y, r.z0],
      [r.x1, y, r.z1],
      [r.x0, y, r.z1],
    ]),
    face = (points, outward) => {
      const ab = new THREE.Vector3()
          .fromArray(points[1])
          .sub(new THREE.Vector3().fromArray(points[0])),
        ac = new THREE.Vector3()
          .fromArray(points[2])
          .sub(new THREE.Vector3().fromArray(points[0])),
        n = ab.cross(ac).normalize();
      if (n.dot(new THREE.Vector3(...outward)) < 0) points.reverse();
      for (let i = 1; i < points.length - 1; i++) {
        const triangle = new THREE.Triangle(
          ...[points[0], points[i], points[i + 1]].map(
            (p) => new THREE.Vector3(...p),
          ),
        );
        if (triangle.getArea() < 1e-12) continue;
        const normal = triangle.getNormal(new THREE.Vector3()),
          axis =
            Math.abs(normal.y) >= Math.abs(normal.x) &&
            Math.abs(normal.y) >= Math.abs(normal.z)
              ? 1
              : Math.abs(normal.x) >= Math.abs(normal.z)
                ? 0
                : 2;
        for (const point of [points[0], points[i], points[i + 1]]) {
          let u = (axis === 0 ? point[2] : point[0]) / 2,
            v = (axis === 1 ? point[2] : point[1]) / 2;
          if (phase.turn) [u, v] = [v, -u];
          buffer.position.push(...point);
          buffer.normal.push(...normal.toArray());
          buffer.uv.push(u + phase.u, v + phase.v);
          buffer.color.push(...color);
          buffer.galleryLining.push(id);
        }
      }
    };
  face([...rings[0]], [0, sign, 0]);
  face([...rings[2]], [0, -sign, 0]);
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4,
        outward = [
          [0, 0, -1],
          [1, 0, 0],
          [0, 0, 1],
          [-1, 0, 0],
        ][i];
      if (!layer) outward[1] = sign;
      face(
        [
          rings[layer][i],
          rings[layer][j],
          rings[layer + 1][j],
          rings[layer + 1][i],
        ],
        outward,
      );
    }
}

export function buildGalleryLining(game, panels, backing) {
  const gallery = game.sunkenGallery,
    root = new THREE.Group(),
    plan = galleryLiningPlan(gallery.profile, panels),
    detail = (gallery.lining = { root, backing, plan, pieces: [], meshes: [] }),
    rng = random(game.level.seed + 14519);
  root.name = "Gallery paving and recessed stone coffers";
  gallery.root.add(root);
  root.add(backing);
  for (const kind of ["floor", "ceiling"]) {
    const material = game.stoneMat.clone(),
      buffer = {
        position: [],
        normal: [],
        uv: [],
        color: [],
        galleryLining: [],
      };
    material.name =
      kind === "floor"
        ? "Drowned gallery limestone paving"
        : "Drowned gallery coffered limestone";
    material.color.set(kind === "floor" ? 0xb4b8a4 : 0xc4c3ac);
    material.vertexColors = true;
    material.roughness = kind === "floor" ? 0.91 : 0.94;
    material.normalScale.setScalar(kind === "floor" ? 0.17 : 0.2);
    for (const group of plan.filter((p) => p.kind === kind)) {
      const sign = kind === "floor" ? 1 : -1;
      for (const tile of courseTiles(
        group,
        gallery.profile.origin,
        game.level.seed,
      )) {
        const shade = 0.76 + rng() * 0.22,
          color = [
            shade,
            shade * (kind === "floor" ? 1.015 : 1),
            shade * 0.965,
          ],
          phase = { u: rng() * 7, v: rng() * 7, turn: rng() > 0.5 },
          pieces =
            kind === "floor"
              ? [{ rect: tile, recess: 0, depth: 0.14 }]
              : [
                  {
                    rect: { ...tile, z1: tile.z0 + 0.13 },
                    recess: 0,
                    depth: 0.18,
                  },
                  {
                    rect: { ...tile, z0: tile.z1 - 0.13 },
                    recess: 0,
                    depth: 0.18,
                  },
                  {
                    rect: {
                      ...tile,
                      x1: tile.x0 + 0.13,
                      z0: tile.z0 + 0.13,
                      z1: tile.z1 - 0.13,
                    },
                    recess: 0,
                    depth: 0.18,
                  },
                  {
                    rect: {
                      ...tile,
                      x0: tile.x1 - 0.13,
                      z0: tile.z0 + 0.13,
                      z1: tile.z1 - 0.13,
                    },
                    recess: 0,
                    depth: 0.18,
                  },
                  {
                    rect: {
                      x0: tile.x0 + 0.145,
                      x1: tile.x1 - 0.145,
                      z0: tile.z0 + 0.145,
                      z1: tile.z1 - 0.145,
                    },
                    recess: 0.075,
                    depth: 0.14,
                  },
                ];
        for (const piece of pieces)
          for (const region of group.rectangles) {
            const rect = intersection(piece.rect, region);
            if (!rect) continue;
            const id = detail.pieces.length + 1,
              front = group.plane - sign * piece.recess;
            slab(
              buffer,
              rect,
              piece.rect,
              front,
              piece.depth,
              sign,
              color,
              phase,
              id,
            );
            detail.pieces.push({
              id,
              kind,
              plane: group.plane,
              rect,
              front,
              depth: piece.depth,
            });
          }
      }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(buffer))
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(
          values,
          name === "uv" ? 2 : name === "galleryLining" ? 1 : 3,
        ),
      );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name =
      kind === "floor"
        ? "Fitted gallery paving"
        : "Recessed gallery ceiling coffers";
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    detail.meshes.push(mesh);
  }
  return detail;
}
