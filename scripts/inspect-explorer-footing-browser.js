import * as THREE from "three";
import { terrainTriangleReader } from "./inspect-desert-groundcover-browser.js";

// Read upward faces from delivered draw coordinates, independently of the
// support kernels and ankle targets used by the pose implementation.
function stoneReader(meshes) {
  const cells = new Map();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld),
      );
      if (!points.every((p) => [p.x, p.y, p.z].every(Number.isFinite)))
        throw Error("Footing inspection has invalid support geometry");
      if (new THREE.Triangle(...points).getNormal(new THREE.Vector3()).y < 0.55)
        continue;
      const box = new THREE.Box3().setFromPoints(points);
      for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++)
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(points);
        }
    }
  }
  return (x, z, maxY) => {
    let height = null;
    for (const [a, b, c] of cells.get(`${Math.floor(x)},${Math.floor(z)}`) ||
      []) {
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-12) continue;
      const u =
          ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator,
        w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-8) continue;
      const y = u * a.y + v * b.y + w * c.y;
      // A roof above the boots must not masquerade as a floor below them.
      // Pair this observation with the closed-volume body inspector.
      if (y <= maxY + 0.02) height = Math.max(height ?? -Infinity, y);
    }
    return height;
  };
}

export function footingReader(terrainMeshes, solidMeshes = []) {
  const terrain = terrainTriangleReader(terrainMeshes),
    stone = stoneReader(solidMeshes);
  return (point) => {
    const ground = terrain(point.x, point.z),
      cap = stone(point.x, point.z, point.y);
    if (ground === null && cap === null) return null;
    return Math.max(ground ?? -Infinity, cap ?? -Infinity);
  };
}

// Inspect every low outsole record in the delivered skin, without consulting
// the runtime's reduced sole samples, declared contacts or planted-foot state.
export function inspectExplorerFooting(game, read) {
  const model = game.rig.model,
    shoe = model.getObjectByName("shoes04");
  if (!shoe?.isSkinnedMesh)
    throw Error("Footing inspection needs delivered footwear");
  game.avatar.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const { position, skinIndex, skinWeight } = shoe.geometry.attributes,
    point = new THREE.Vector3(),
    root = game.player.getWorldPosition(new THREE.Vector3()),
    rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion()).invert(),
    report = { samples: 0, soleSamples: 0, invalid: 0, missing: 0, feet: [] };
  for (const side of ["Left", "Right"]) {
    const foot = {
        side,
        samples: 0,
        soleSamples: 0,
        invalid: 0,
        missing: 0,
        minimumGap: null,
        minimumSoleGap: null,
        maximumGap: null,
        contacts: [],
      },
      bone = model.getObjectByName(`mixamorig${side}Foot`);
    if (!bone) throw Error("Footing inspection lacks an ankle");
    for (let i = 0; i < position.count; i++) {
      // A tilted boot can bear on the low bevel instead of its flat outsole.
      // Retain the separate sole count/gap so this coverage is explicit.
      if (position.getY(i) > 0.035) continue;
      const sole = position.getY(i) <= 0.025;
      let dominant = 0;
      for (let k = 1; k < 4; k++)
        if (
          skinWeight.getComponent(i, k) > skinWeight.getComponent(i, dominant)
        )
          dominant = k;
      if (
        !shoe.skeleton.bones[skinIndex.getComponent(i, dominant)].name.includes(
          side,
        )
      )
        continue;
      foot.samples++;
      if (sole) foot.soleSamples++;
      shoe.getVertexPosition(i, point).applyMatrix4(shoe.matrixWorld);
      if (![point.x, point.y, point.z].every(Number.isFinite)) {
        foot.invalid++;
        continue;
      }
      const floor = read(point);
      if (floor === null) {
        foot.missing++;
        continue;
      }
      if (!Number.isFinite(floor)) {
        foot.invalid++;
        continue;
      }
      const gap = point.y - floor;
      foot.minimumGap = Math.min(foot.minimumGap ?? Infinity, gap);
      if (sole)
        foot.minimumSoleGap = Math.min(foot.minimumSoleGap ?? Infinity, gap);
      foot.maximumGap = Math.max(foot.maximumGap ?? -Infinity, gap);
      if (gap >= -0.015 && gap <= 0.02)
        foot.contacts.push({
          vertex: i,
          point: point.toArray(),
          gap,
          region: sole ? "sole" : "bevel",
        });
    }
    if (!foot.soleSamples) throw Error("Footing inspection has an empty sole");
    const ankle = bone.getWorldPosition(new THREE.Vector3());
    foot.ankle = ankle.toArray();
    foot.localAnkle = ankle
      .clone()
      .sub(root)
      .applyQuaternion(rotation)
      .toArray();
    report.samples += foot.samples;
    report.soleSamples += foot.soleSamples;
    report.invalid += foot.invalid;
    report.missing += foot.missing;
    report.feet.push(foot);
  }
  return report;
}
