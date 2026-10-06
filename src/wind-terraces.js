import * as THREE from "three";
import {
  fittedWallGeometry,
  fittedStoneCells,
  insetStonePolygon,
  fittedStoneGeometry,
} from "./sky-masonry.js";
import { skyWindReliefGeometry } from "./sky-chamber-walls.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { windMetal, windSurface } from "./wind-art.js";
import { windPlaqueFactory } from "./wind-rendering.js";
import { stationSolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

function colored(g, tone = 1) {
  if (!g.attributes.color) {
    const values = new Float32Array(g.attributes.position.count * 3);
    values.fill(tone);
    g.setAttribute("color", new THREE.BufferAttribute(values, 3));
  }
  return g;
}

function materials(game) {
  if (game.windTerraceMaterials) return game.windTerraceMaterials;
  const stone = game.skyMasonry || game.stoneMat,
    mortar = game.darkMat.clone(),
    bronze = windMetal("worn"),
    iron = windMetal("iron");
  mortar.name = "Wind terrace recessed joints";
  mortar.color.setHex(0x555d57);
  mortar.normalScale.setScalar(0.18);
  for (const m of [stone, mortar, bronze, iron]) m.vertexColors = true;
  return (game.windTerraceMaterials = { stone, mortar, bronze, iron });
}

// The original rounded boxes left their standing corners in empty space.
// Flags cover a flat bed that reaches the complete 6 m support footprint.
function roofFlag(polygon, seed) {
  const g = fittedStoneGeometry(polygon, 0.18, seed),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setZ(i, 0.09);
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  return g;
}

function wall(width, height, depth, bottom, seed) {
  const g = fittedWallGeometry(
      [
        [-width / 2, bottom],
        [width / 2, bottom],
        [width / 2, height],
        [-width / 2, height],
      ],
      depth,
      seed,
      1.05,
    ),
    p = g.attributes.position;
  // Keep the face inside its real volume, including the fitted stone bulges.
  for (let i = 0; i < p.count; i++)
    p.setZ(i, THREE.MathUtils.clamp(p.getZ(i), -depth / 2, depth / 2));
  g.computeVertexNormals();
  return g;
}

// A horizontal inlay with upward-facing triangles and metric texture coordinates.
function inlay(points) {
  const g = new THREE.ShapeGeometry(
    new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z))),
  );
  g.rotateX(-Math.PI / 2);
  return colored(g, 0.84);
}

export function buildWindTerrace(game, feature, x, y, z, height) {
  const m = materials(game),
    root = new THREE.Group(),
    bottom =
      footprintMinimum(
        (px, pz) => game.groundHeight(px, pz),
        x,
        z,
        6,
        6,
        game.terrainProfile?.step,
      ) -
      y -
      0.18,
    courseTop = height - 0.2;
  root.name = `Wind-engine record terrace ${feature.stage + 1}`;
  root.position.set(x, y, z);
  game.world.add(root);
  let seed = game.level.seed + feature.stage * 229 + 1790,
    parts = 0,
    triangles = 0;
  const add = (
    g,
    material,
    px = 0,
    py = 0,
    pz = 0,
    turn = 0,
    capture = true,
  ) => {
    colored(g);
    if (material.userData.windMetal) windSurface(g);
    parts++;
    triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = turn;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (capture)
      game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  const box = (w, h, d, material, px, py, pz, capture = true) =>
    add(new THREE.BoxGeometry(w, h, d), material, px, py, pz, 0, capture);
  // The packed core backs every joint; separate side widths join the front and
  // rear faces without putting two exposed stone faces on the same plane.
  box(5.72, courseTop - bottom, 5.72, m.mortar, 0, (courseTop + bottom) / 2, 0);
  for (const sign of [-1, 1]) {
    add(
      wall(6, courseTop, 0.14, bottom, ++seed),
      m.stone,
      0,
      0,
      sign * 2.93,
      sign < 0 ? Math.PI : 0,
    );
    add(
      wall(5.72, courseTop, 0.14, bottom, ++seed),
      m.stone,
      sign * 2.93,
      0,
      0,
      (sign * Math.PI) / 2,
    );
  }
  box(6, 0.195, 6, m.mortar, 0, height - 0.1025, 0);
  const cells = fittedStoneCells(
    [
      [-3, -3],
      [3, -3],
      [3, 3],
      [-3, 3],
    ],
    ++seed,
    [1.05, 1.2, 1.35][feature.stage % 3],
  );
  for (const [i, polygon] of cells.entries()) {
    const inset = insetStonePolygon(polygon, 0.009);
    if (inset.length >= 3)
      add(roofFlag(inset, seed + i * 17), m.stone, 0, height - 0.09, 0);
  }
  // Subtle compass points describe bearings rather than the puzzle solution.
  // North stays toward -Z, matching the engine's existing channel directions.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      radius = i % 2 ? 0.75 : 1.18,
      point = (r, angle) => [Math.sin(angle) * r, -Math.cos(angle) * r];
    add(
      inlay([point(0.2, a - 0.35), point(radius, a), point(0.2, a + 0.35)]),
      m.bronze,
      0,
      height + 0.001,
      0,
      0,
      false,
    );
  }
  // The record inscription lies flush with the paving, preserving all existing
  // standing positions and the native interaction at the terrace's centre.
  box(2.72, 0.002, 0.56, m.iron, 0, height, -1.95, false);
  const makePlaque = (game.windRecordPlaque ||= windPlaqueFactory()),
    label = makePlaque("WIND ENGINE", 2.45);
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, height + 0.002, -1.95);
  root.add(label);
  // Shallow cast feathers remain within the masonry face. Their forms and
  // stage-dependent paving reuse the cloud-city's existing architectural art.
  for (const sign of [-1, 1])
    for (const side of [false, true])
      for (const offset of [-1.7, 1.7]) {
        const g = skyWindReliefGeometry(feature.stage % 3, 1.25);
        g.scale(1, 1, 0.14);
        g.translate(0, 0, -0.012);
        add(
          g,
          m.bronze,
          side ? sign * 2.993 : offset,
          height - 0.68,
          side ? offset : sign * 2.993,
          side ? (sign * Math.PI) / 2 : sign < 0 ? Math.PI : 0,
          false,
        );
      }
  // Seated bronze stiles and iron anchors carry individual cylindrical rungs.
  // The lower end meets the new shallow court steps; the highest grip stops
  // below the roof, so a landing and an older occupied roof stay clear.
  const lower = 0.39,
    upper = height - 0.08,
    rungYs = [],
    anchors = [];
  for (const px of [-0.55, 0.55]) {
    box(0.075, upper - lower, 0.09, m.bronze, px, (upper + lower) / 2, 3.065);
    for (const py of [lower + 0.13, (lower + upper) / 2, upper - 0.13]) {
      box(0.14, 0.12, 0.06, m.iron, px, py, 2.985);
      const anchor = add(
        new THREE.CylinderGeometry(0.027, 0.027, 0.14, 12).rotateX(Math.PI / 2),
        m.iron,
        px,
        py,
        3.03,
      );
      anchors.push(anchor);
    }
  }
  const count = Math.ceil((upper - lower - 0.12) / 0.36) + 1;
  for (let i = 0; i < count; i++) {
    const py =
      lower + 0.06 + (i * (upper - lower - 0.12)) / Math.max(1, count - 1);
    add(
      new THREE.CylinderGeometry(0.029, 0.029, 1.18, 16).rotateZ(Math.PI / 2),
      m.bronze,
      0,
      py,
      3.065,
    );
    rungYs.push(y + py);
  }
  const obstacle = {
    x,
    z,
    w: 3,
    d: 3,
    h: height,
    climbable: true,
    windTerrace: feature.id,
  };
  game.obstacles.push(obstacle);
  const ladder = stationSolid(
    game,
    feature,
    root,
    [1.24, upper - lower + 0.08, 0.18],
    [0, (lower + upper) / 2, 3.055],
    { support: false },
  );
  mergeArchitecture(root, 2);
  const record = {
    root,
    x,
    z,
    base: y,
    height,
    top: y + height,
    bottom: y + bottom,
    obstacle,
    ladder,
    rungYs,
    anchors,
    parts,
    triangles,
    cells: cells.length,
    label,
  };
  feature.windTerrace = record;
  (game.windTerraces ||= []).push(record);
  return record;
}
