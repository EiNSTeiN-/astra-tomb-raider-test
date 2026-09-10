import * as THREE from "three";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { CLEFT_NODES, CLEFT_TERRACES, normalizeCleft } from "./cleft-rules.js";
import { buildCleftMasonry } from "./cleft-masonry.js";

export function buildSurveyorsCleft(game) {
  game.cleft = null;
  if (!game.map.cleft) return;
  const site = game.map.cleft,
    x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z);
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "The Surveyor’s Cleft";
  game.world.add(root);
  const c = (game.cleft = {
    x,
    y,
    z,
    root,
    saved: normalizeCleft(game.progress.cleft),
    nodes: [],
    decks: [],
    solids: [],
    sources: [],
    anchor: 0,
  });
  game.progress.cleft = c.saved;
  const stone = game.stoneMat.clone(),
    dark = (game.darkMat || game.stoneMat).clone();
  for (const [material, source, name] of [
    [stone, game.stoneMat, "Survey house sandstone"],
    [dark, game.darkMat || game.stoneMat, "Survey house exposed core"],
  ]) {
    material.name = name;
    material.vertexColors = true;
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
  }
  dark.color.set(0xa7acae);
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xb8a16a,
    metalness: 0.72,
    roughness: 0.58,
  });
  const patina = new THREE.MeshStandardMaterial({
    color: 0x52675e,
    metalness: 0.5,
    roughness: 0.83,
  });
  const rope = new THREE.MeshStandardMaterial({
    color: 0x99836a,
    roughness: 1,
  });
  let serial = 9100;
  function add(g, m, px, py, pz, camera = false) {
    if (!g.attributes.color)
      g.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Array(g.attributes.position.count * 3).fill(0.92),
          3,
        ),
      );
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  }
  function block(w, h, d, px, py, pz, m = stone, camera = false) {
    return add(stoneBlockGeometry(w, h, d, serial++), m, px, py, pz, camera);
  }
  function solid(px, py, pz, w, h, d) {
    c.solids.push({
      x: x + px,
      z: z + pz,
      w: w / 2,
      d: d / 2,
      bottom: y + py - h / 2,
      top: y + py + h / 2,
    });
  }
  function bar(a, b, r = 0.019, m = bronze) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const mesh = add(
      new THREE.CylinderGeometry(r, r, delta.length(), 10),
      m,
      ...start.add(end).multiplyScalar(0.5).toArray(),
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }
  c.masonry = buildCleftMasonry(game, c, stone, dark);
  // Chiseled measuring bands and blind niches below the climb.
  for (const px of [-6, 0, 6, 12]) {
    solid(px, 1.55, 0.15, 2.65, 3.1, 0.7);
    block(2.1, 2.2, 0.13, px, 1.5, 0.11, dark);
    add(
      carvedPanelGeometry(1.8, 1.85, serial++ % 4, [18, 28]),
      stone,
      px,
      0.575,
      0.2,
    );
    for (const side of [-1, 1])
      block(0.18, 2.65, 0.35, px + side * 1.2, 1.55, 0.22);
    block(2.65, 0.24, 0.5, px, 2.95, 0.2);
  }
  for (const [i, t] of CLEFT_TERRACES.entries()) {
    const d = {
      x: x + t.x,
      y: y + t.y,
      z: z + 2.05,
      w: t.w,
      d: 1.95,
      cleftTerrace: i,
    };
    c.decks.push(d);
    block(t.w * 2, 0.38, 3.9, t.x, t.y - 0.19, 2.05, stone, true);
    solid(t.x, t.y - 0.19, 2.05, t.w * 2, 0.38, 3.9);
    if (i) {
      for (const side of [-1, 1]) {
        block(
          0.65,
          1.35,
          2.5,
          t.x + side * (t.w - 0.4),
          t.y - 0.95,
          1.4,
          dark,
          true,
        );
        block(
          0.35,
          1.05,
          0.5,
          t.x + side * (t.w - 0.2),
          t.y + 0.525,
          3.8,
          stone,
          true,
        );
        solid(t.x + side * (t.w - 0.2), t.y + 0.525, 3.8, 0.35, 1.05, 0.5);
      }
      block(t.w * 2, 0.15, 0.32, t.x, t.y + 1.04, 3.8, bronze, true);
      solid(t.x, t.y + 1.04, 3.8, t.w * 2, 0.15, 0.32);
    }
    // Each terrace has a visible bronze belay anchor, clear of the approach.
    const ring = add(
      new THREE.TorusGeometry(0.16, 0.032, 8, 20),
      bronze,
      t.x - 1.5,
      t.y + 0.75,
      0.25,
    );
    block(0.28, 0.38, 0.1, t.x - 1.5, t.y + 0.75, 0.1, patina);
    c.decks[i].anchor = ring.position.clone().add(root.position);
  }
  for (const n of CLEFT_NODES) {
    const grip = new THREE.Vector3(x + n.x, y + n.y, z + 0.32);
    bar([n.x - 0.48, n.y, 0.32], [n.x + 0.48, n.y, 0.32]);
    for (const side of [-1, 1]) {
      bar(
        [n.x + side * 0.45, n.y, 0.32],
        [n.x + side * 0.45, n.y, -0.02],
        0.027,
        patina,
      );
      block(0.14, 0.22, 0.12, n.x + side * 0.45, n.y, 0.07, bronze);
      // Dressed footholds immediately below each pair of handholds.
      block(0.32, 0.16, 0.33, n.x + side * 0.2, n.y - 1.4, 0.18, dark);
    }
    c.nodes.push({ ...n, grip });
  }
  // Summit writing desk and original survey instrument.
  block(1.2, 0.8, 0.85, 7.9, 18.4, 2.6, stone, true);
  solid(7.9, 18.4, 2.6, 1.2, 0.8, 0.85);
  c.record = block(0.68, 0.07, 0.48, 7.9, 18.86, 2.6, bronze);
  c.record.userData.animated = true;
  c.record.visible = !c.saved.recovered;
  const disk = add(
    new THREE.TorusGeometry(0.44, 0.035, 10, 40),
    bronze,
    9.1,
    19.15,
    1.8,
  );
  disk.rotation.x = Math.PI / 2;
  bar([9.1, 18.05, 1.8], [9.1, 19.15, 1.8], 0.06);
  bar([8.7, 19.15, 1.8], [9.5, 19.15, 1.8], 0.02);
  c.recordPoint = new THREE.Vector3(x + 7.9, y + 18, z + 2.6);
  // Return line runs outside the terraces, from the upper balcony to the sand.
  block(4.2, 0.38, 2.4, 11.8, 17.81, 2.7, stone, true);
  solid(11.8, 17.81, 2.7, 4.2, 0.38, 2.4);
  c.decks.push({ x: x + 11.8, y: y + 18, z: z + 2.7, w: 2.1, d: 1.2 });
  c.returnLineStart = new THREE.Vector3(x + 13, y + 19.9, z + 2.7);
  c.returnLineEnd = new THREE.Vector3(x + 13, y + 0.25, z + 6.5);
  bar([13, 19.9, 2.7], [13, 0.25, 6.5], 0.019, rope);
  bar([13, 18.5, 1.8], [13, 20.1, 1.8], 0.085, bronze);
  bar([13, 20.1, 1.8], [13, 20.1, 2.7], 0.085, bronze);
  bar([13, 18.9, 1.8], [13, 20.1, 2.7], 0.045, patina);
  add(
    new THREE.TorusGeometry(0.17, 0.035, 8, 20),
    bronze,
    13,
    19.94,
    2.7,
  ).rotation.y = Math.PI / 2;
  block(0.55, 0.7, 0.55, 13, 18.35, 1.8, stone, true);
  c.returnStart = new THREE.Vector3(x + 13, y + 18, z + 2.87);
  c.returnEnd = new THREE.Vector3(x + 13, y + 0.18, z + 6.315);
  c.tether = bar([0, 0, 0], [0, 1, 0], 0.012, rope);
  c.tether.userData.animated = true;
  c.tether.visible = false;
  // An entrance cairn leads from the western survey path to the first grip.
  for (let i = 0; i < 3; i++)
    block(
      1.5 - i * 0.35,
      0.32,
      1.15 - i * 0.22,
      -11,
      0.16 + i * 0.32,
      11,
      stone,
      true,
    );
  c.guidePoint = new THREE.Vector3(x - 11, y, z + 11);
  c.sources.push({
    id: "cleft-draft",
    kind: "wind",
    x: x + 0.7,
    y: y + 11.5,
    z: z + 0.2,
    near: 2,
    range: 27,
    gain: 0.1,
    activity: 0.35,
  });
  c.sources.push({
    id: "cleft-line",
    kind: "rope",
    x: x + 13,
    y: y + 19.9,
    z: z + 2.7,
    near: 1.5,
    range: 23,
    gain: 0.06,
    activity: 0,
    rate: 0.7,
  });
  mergeArchitecture(root);
}

export function updateCleftArt(game) {
  const c = game.cleft;
  if (!c) return;
  const g = game.wallGrip;
  c.tether.visible = !!g;
  c.sources[1].activity = !game.paused && g?.kind === "rappel" ? 0.6 : 0;
  if (!g) return;
  const start = g.kind.startsWith("rappel")
    ? new THREE.Vector3(c.x + 13, c.y + 19.9, c.z + 2.7)
    : c.decks[c.anchor].anchor;
  const end = game.player.position.clone().add(new THREE.Vector3(0, 1.05, 0));
  const delta = end.clone().sub(start);
  c.tether.position
    .copy(start)
    .add(end)
    .multiplyScalar(0.5)
    .sub(c.root.position);
  c.tether.scale.y = Math.max(0.001, delta.length());
  c.tether.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
}
