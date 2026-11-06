import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { gallerySection } from "./sunken-gallery-layout.js";
import { random } from "./campaign.js";
import { mergeArchitecture } from "./visuals.js";

// Merge the shell's actual half-metre wall edges, including internal floor and
// ceiling steps. The entrance aperture is omitted by the shell itself.
export function galleryWallRuns(edges) {
  const groups = new Map();
  for (const e of edges) {
    const key = [e.axis, e.fixed, e.low, e.high, e.inward]
      .map((v) => v.toFixed(6))
      .join("/");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const runs = [];
  for (const pieces of groups.values()) {
    pieces.sort((a, b) => a.start - b.start);
    let run;
    for (const e of pieces) {
      if (run && Math.abs(run.end - e.start) < 1e-6) run.end = e.end;
      else {
        run = { ...e };
        runs.push(run);
      }
    }
  }
  return runs.filter((r) => r.high - r.low > 0.22 && r.end - r.start > 0.6);
}

export function buildGalleryMasonry(game, edges) {
  const gallery = game.sunkenGallery,
    material = game.stoneMat.clone(),
    runs = galleryWallRuns(edges),
    rng = random(game.level.seed + 3187);
  material.name = "Drowned gallery coursed limestone";
  material.vertexColors = true;
  material.normalScale.setScalar(0.25);
  material.roughness = 0.95;
  const detail = (gallery.masonry = { runs: [], corners: [], pieces: 0 }),
    ends = new Map(),
    endpoint = (r, along) =>
      r.axis === 0 ? [r.fixed, along] : [along, r.fixed],
    pointKey = ([x, z]) => `${x.toFixed(6)}/${z.toFixed(6)}`;
  for (const r of runs)
    for (const along of [r.start, r.end]) {
      const point = endpoint(r, along),
        key = pointKey(point);
      if (!ends.has(key)) ends.set(key, { point, axes: new Set(), bands: [] });
      ends.get(key).axes.add(r.axis);
      ends.get(key).bands.push([r.low, r.high]);
    }
  const corners = new Set(
    [...ends].filter(([, p]) => p.axes.size > 1).map(([k]) => k),
  );
  const stone = (size, position) => {
    const id = ++detail.pieces,
      geometry = stoneBlockGeometry(...size, id + game.level.seed, 0.024),
      shade = 0.79 + rng() * 0.18,
      count = geometry.attributes.position.count,
      colors = new Float32Array(count * 3),
      uv = geometry.attributes.uv,
      du = rng() * 5,
      dv = rng() * 5;
    // Chipped quad corners can make the two delivered triangles non-coplanar.
    // These nonindexed faces retain hard normals fitted to their actual planes.
    geometry.computeVertexNormals();
    for (let v = 0; v < count; v++) {
      colors.set([shade, shade * 1.015, shade * 0.98], v * 3);
      uv.setXY(v, uv.getX(v) + du, uv.getY(v) + dv);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute(
      "galleryStone",
      new THREE.Float32BufferAttribute(new Float32Array(count).fill(id), 1),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Gallery wall course";
    mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true;
    gallery.root.add(mesh);
    geometry.computeBoundingBox();
    return geometry.boundingBox.clone().translate(mesh.position);
  };
  for (const [index, r] of runs.entries()) {
    // A single bonded corner closes perpendicular courses without overlapping
    // their horizontal beds. Free ends keep only a narrow mortar joint.
    const start =
        r.start + (corners.has(pointKey(endpoint(r, r.start))) ? 0.16 : 0.009),
      end = r.end - (corners.has(pointKey(endpoint(r, r.end))) ? 0.16 : 0.009),
      rows = Math.max(1, Math.round((r.high - r.low) / 0.74)),
      course = (r.high - r.low) / rows,
      depth = 0.28,
      bounds = new THREE.Box3();
    let count = 0;
    for (let row = 0; row < rows; row++) {
      const joints = [start];
      let at = start + 0.8 + ((row + index) % 2) * 0.9 + rng() * 0.3;
      while (at < end - 0.35) {
        joints.push(at);
        at += 1.45 + rng() * 0.65;
      }
      joints.push(end);
      for (let i = 1; i < joints.length; i++) {
        const length = joints[i] - joints[i - 1] - 0.018,
          height = course - 0.018,
          along = (joints[i] + joints[i - 1]) / 2,
          bound = stone(
            [
              r.axis === 0 ? depth : length,
              height,
              r.axis === 0 ? length : depth,
            ],
            [
              r.axis === 0 ? r.fixed : along,
              r.low + (row + 0.5) * course,
              r.axis === 0 ? along : r.fixed,
            ],
          );
        bounds.union(bound);
        count++;
      }
    }
    // The body radius spans the narrow mortar joints. One conservative bound
    // per continuous wall keeps collision work independent of the block count.
    const box = { min: bounds.min.clone(), max: bounds.max.clone() };
    gallery.solids.push(box);
    detail.runs.push({ ...r, pieces: count, box });
  }
  for (const key of corners) {
    const {
        point: [x, z],
        bands,
      } = ends.get(key),
      merged = [];
    bands.sort((a, b) => a[0] - b[0]);
    for (const [low, high] of bands) {
      const last = merged.at(-1);
      if (last && low <= last[1] + 1e-6) last[1] = Math.max(last[1], high);
      else merged.push([low, high]);
    }
    for (const [low, high] of merged) {
      const rows = Math.max(1, Math.round((high - low) / 0.74)),
        height = (high - low) / rows,
        bounds = new THREE.Box3();
      for (let row = 0; row < rows; row++)
        bounds.union(
          stone(
            [0.28, height - 0.018, 0.28],
            [x, low + (row + 0.5) * height, z],
          ),
        );
      const box = { min: bounds.min.clone(), max: bounds.max.clone() };
      gallery.solids.push(box);
      detail.corners.push({ x, z, low, high, pieces: rows, box });
    }
  }
  return detail;
}

// The old unattached bronze blocks under each bell become floor-to-cap ties.
// Grounded shoes, continuous rods and embedded cap flanges visibly carry the
// bell's buoyant load. The center of each bell remains clear for breathing.
export function buildBellAnchors(game, bell, { add, block, bronze, trim }) {
  const gallery = game.sunkenGallery;
  gallery.bellAnchors ??= [];
  for (const side of [-1, 1]) {
    const x = bell.x + side * 2.1,
      // Keep both principal swim axes and the emergency-wheel approach open.
      z = bell.z + 1.6,
      floor = gallerySection(gallery.profile, x, z).floor,
      bottom = floor + 0.12,
      top = bell.ceiling + 0.02;
    const group = new THREE.Group();
    group.name = `${bell.id} ${side < 0 ? "west" : "east"} anchor`;
    gallery.root.add(group);
    const parts = [];
    parts.push(
      block(x, floor + 0.06, z, 0.44, 0.24, 0.44, game.stoneMat, false, group),
    );
    parts.push(block(x, floor + 0.19, z, 0.24, 0.09, 0.24, trim, false, group));
    parts.push(
      add(
        new THREE.CylinderGeometry(0.065, 0.065, top - bottom, 12),
        bronze,
        x,
        (bottom + top) / 2,
        z,
        group,
      ),
    );
    parts.push(
      add(
        new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20),
        trim,
        x,
        bell.ceiling,
        z,
        group,
      ),
    );
    for (const y of [bottom + 0.18, bell.rim - 0.18])
      parts.push(
        add(new THREE.TorusGeometry(0.071, 0.018, 6, 16), trim, x, y, z, group),
      );
    // TorusGeometry starts in XY; these collars surround the vertical rod.
    for (const p of parts.slice(4)) p.rotation.x = Math.PI / 2;
    for (const [i, p] of parts.entries())
      p.geometry.setAttribute(
        "galleryAnchorPart",
        new THREE.Float32BufferAttribute(
          new Float32Array(p.geometry.attributes.position.count).fill(i + 1),
          1,
        ),
      );
    group.updateMatrixWorld(true);
    const boxes = parts.map((part) => {
      const b = new THREE.Box3().setFromObject(part);
      return { min: b.min.clone(), max: b.max.clone() };
    });
    gallery.solids.push(...boxes);
    mergeArchitecture(group, 2);
    gallery.bellAnchors.push({
      bell: bell.id,
      x,
      z,
      floor,
      ceiling: bell.ceiling,
      group,
      boxes,
    });
  }
}
