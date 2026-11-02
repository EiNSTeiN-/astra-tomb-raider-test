import * as THREE from "three";
import { footprintMinimum } from "./masonry-foundations.js";
import {
  stationMeshSolid,
  stationSolid,
  stationSupport,
} from "./field-station-solids.js";
import { projectStoneUVs } from "./stone-uv.js";
import { mergeArchitecture } from "./visuals.js";

const WIDTH = 12.45,
  // Binary-exact halves keep the two rendered inner edges on their support seam.
  DEPTH = 0.65625,
  STROKE = 0.625;
const smooth = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

// The shutter is completely below the crossing before its two covers enter.
// Reversing the same sequence opens the covers before the shutter can rise.
export function solarThresholdPose(amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  return { door: smooth(t / 0.84), cover: smooth((t - 0.84) / 0.16) };
}

// One closed slab has flush sandstone panels inside a continuous bronze frame.
// Sorting triangles into two material groups retains one draw per material.
export function solarCoverGeometry(panels) {
  const xs = [-WIDTH / 2, -WIDTH / 2 + 0.06],
    intervals = [],
    span = (WIDTH - 0.12 - (panels - 1) * 0.04) / panels;
  for (let i = 0; i < panels; i++) {
    const low = xs.at(-1),
      high = low + span;
    intervals.push([low, high]);
    xs.push(high);
    if (i < panels - 1) xs.push(high + 0.04);
  }
  xs.push(WIDTH / 2);
  const source = new THREE.BoxGeometry(WIDTH, 0.06, DEPTH, xs.length - 1, 1, 3),
    p = source.attributes.position,
    zs = [-DEPTH / 2, -DEPTH / 2 + 0.055, DEPTH / 2 - 0.055, DEPTH / 2];
  for (let i = 0; i < p.count; i++) {
    p.setX(i, xs[Math.round((p.getX(i) / WIDTH + 0.5) * (xs.length - 1))]);
    p.setZ(i, zs[Math.round((p.getZ(i) / DEPTH + 0.5) * 3)]);
  }
  const flat = source.toNonIndexed();
  source.dispose();
  projectStoneUVs(flat);
  const buckets = [[], []],
    pos = flat.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
      z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
      top = [i, i + 1, i + 2].every((j) => pos.getY(j) > 0.029),
      stone =
        top &&
        Math.abs(z) < DEPTH / 2 - 0.055 &&
        intervals.some(([lo, hi]) => x > lo && x < hi);
    buckets[Number(stone)].push(i, i + 1, i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = flat.attributes[name],
      data = [];
    for (const index of buckets.flat())
      for (let j = 0; j < a.itemSize; j++)
        data.push(a.array[index * a.itemSize + j]);
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(data, a.itemSize),
    );
  }
  geometry.addGroup(0, buckets[0].length, 0);
  geometry.addGroup(buckets[0].length, buckets[1].length, 1);
  geometry.computeBoundingBox();
  flat.dispose();
  return geometry;
}

export function buildSolarThreshold(game, gate, materials) {
  if (game.level.biome !== "desert") return null;
  const root = new THREE.Group(),
    feature = { id: `solar-threshold-${gate.stage}` },
    solids = [],
    covers = [],
    c = gate.root.position,
    bottom =
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        c.x,
        c.z + 6.5,
        12.8,
        2.65,
        game.terrainProfile?.step,
      ) -
      c.y -
      0.18;
  root.name = `Sliding solar threshold ${gate.stage + 1}`;
  gate.root.add(root);
  const fixed = (w, h, d, x, y, z, material = materials.trim) => {
    const source = new THREE.BoxGeometry(w, h, d),
      geometry = source.toNonIndexed();
    source.dispose();
    projectStoneUVs(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    const solid = stationMeshSolid(game, feature, mesh, {
      bodyPadding: 0.55,
      supportRadius: 0.55,
    });
    solid.solarThreshold = true;
    solids.push(solid);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return mesh;
  };
  fixed(12.8, 0.02 - bottom, 2.65, 0, (0.02 + bottom) / 2, 6.5, materials.wall);
  for (const side of [-1, 1]) {
    // The storage pocket stays open below the coping; its outer wall bears
    // the stone cap while the cover slides underneath without intersecting it.
    fixed(12.8, 0.11, 0.035, 0, 0.075, 6.5 + side * 1.3075);
    fixed(12.8, 0.045, 0.7, 0, 0.1525, 6.5 + side * 0.975);
    for (let i = 0; i < 7; i++)
      fixed(
        0.035,
        0.025,
        0.67,
        (i - 3) * 1.97,
        0.1175,
        6.5 + side * 0.975,
        materials.metal,
      );
    const group = new THREE.Group();
    group.position.set(0, 0, 6.5 + side * (DEPTH / 2 + STROKE));
    group.userData.cameraDynamic = true;
    root.add(group);
    const geometry = solarCoverGeometry(6 + (gate.stage % 3)),
      mesh = new THREE.Mesh(geometry, [materials.metal, materials.trim]);
    mesh.position.y = 0.07;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    const solid = stationSolid(
      game,
      feature,
      { position: group.getWorldPosition(new THREE.Vector3()) },
      [WIDTH, 0.06, DEPTH],
      [0, 0.07, 0],
      { bodyPadding: 0.55, supportRadius: 0.55 },
    );
    solid.solarThreshold = true;
    solids.push(solid);
    const proxy = new THREE.Mesh(geometry, materials.trim);
    proxy.position.copy(mesh.position);
    group.add(proxy);
    game.cameraSurfaces?.capture(proxy, { small: true, thin: true });
    group.remove(proxy);
    covers.push({ side, group, mesh, solid });
  }
  mergeArchitecture(root);
  gate.solarThreshold = { root, feature, bottom: bottom + c.y, solids, covers };
  updateSolarThreshold(game, gate);
  return gate.solarThreshold;
}

export function updateSolarThreshold(game, gate) {
  const record = gate.solarThreshold;
  if (!record) return;
  const cover = solarThresholdPose(gate.amount).cover;
  for (const part of record.covers) {
    const z = 6.5 + part.side * (DEPTH / 2 + STROKE * (1 - cover)),
      delta = z - part.group.position.z;
    if (Math.abs(delta) < 1e-12) continue;
    part.group.position.z = z;
    part.solid.z += delta;
    part.solid.bounds.min.z += delta;
    part.solid.bounds.max.z += delta;
    part.solid.h =
      part.solid.bounds.max.y - game.groundHeight(part.solid.x, part.solid.z);
  }
  record.coverAmount = cover;
}

// Keep older soil arrivals at their recorded horizontal position when a new
// shallow crossing occupies it; elevated saves keep their earned height.
export function restoreSolarThresholdArrival(game) {
  const saved = game.progress.position,
    p = game.player.position;
  if (!saved || Math.hypot(saved.x - p.x, saved.z - p.z) > 1e-6) return false;
  const ground = game.groundHeight(p.x, p.z),
    before = Math.max(p.y, ground + (saved.height || 0));
  let height = before;
  for (const gate of game.fieldGates || [])
    for (const solid of gate.solarThreshold?.solids || []) {
      const top = stationSupport(solid, p.x, p.z, Infinity, 0);
      if (top !== null && top > height && top - before <= 0.25) height = top;
    }
  if (height <= before + 0.015 || !game.canMove(p.x, p.z, height - ground))
    return false;
  p.y = height;
  game.jumpY = height - ground;
  saved.height = game.jumpY;
  game.velocityY = 0;
  game.grounded = true;
  game.fallPeak = height;
  return true;
}
