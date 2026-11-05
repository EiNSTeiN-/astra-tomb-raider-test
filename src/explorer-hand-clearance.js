import { Vector3 } from "three";

// Keep delivered skin extrema per hand joint. The samples follow the final
// blended wrist/finger pose instead of treating an anatomical joint as skin.
export function handClearanceProbes(model) {
  const samples = [[], []],
    directions = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1])
        if (x * x + y * y + z * z === 1 || x * x + y * y + z * z === 3)
          directions.push([x, y, z]);
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!skinIndex || !skinWeight) return;
    const handJoints = mesh.skeleton.bones.map((bone) =>
      /^(?:mixamorig)?(?:Left|Right)Hand/.test(bone.name) ? bone.name : null,
    );
    const groups = new Map();
    for (let index = 0; index < position.count; index++) {
      let joint = null,
        weight = 0.25;
      for (let k = 0; k < 4; k++) {
        const jointName = handJoints[skinIndex.getComponent(index, k)];
        if (jointName && skinWeight.getComponent(index, k) > weight) {
          joint = jointName;
          weight = skinWeight.getComponent(index, k);
        }
      }
      if (!joint) continue;
      if (!groups.has(joint)) groups.set(joint, []);
      groups.get(joint).push(index);
    }
    for (const [joint, indices] of groups) {
      const selected = new Set();
      for (const [x, y, z] of directions) {
        let best = -Infinity,
          chosen;
        for (const i of indices) {
          const value =
            position.getX(i) * x + position.getY(i) * y + position.getZ(i) * z;
          if (value > best) {
            best = value;
            chosen = i;
          }
        }
        if (chosen !== undefined) selected.add(chosen);
      }
      for (const index of selected)
        samples[joint.includes("Left") ? 0 : 1].push({ mesh, index });
    }
  });
  return samples;
}

export function handSurfaceOffsets(game, samples) {
  const root = game.player.position,
    surfaces = [
      game.natureRockSolids,
      game.jungleTreeSolids,
      ...(game.obstacles || [])
        .filter(
          (o) =>
            o.triangles &&
            o.bounds &&
            (!o.node || o.node.visible) &&
            root.x + 1 > o.bounds.min.x &&
            root.x - 1 < o.bounds.max.x &&
            root.z + 1 > o.bounds.min.z &&
            root.z - 1 < o.bounds.max.z,
        )
        .map((o) => o.triangles),
    ].filter((s) => s?.pointExit);
  const point = new Vector3();
  return samples.map((hand) => {
    let correction = null;
    for (const { mesh, index } of hand) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      if (typeof game.groundHeight === "function") {
        const lift = game.groundHeight(point.x, point.z) + 0.004 - point.y;
        if (lift > 0 && (!correction || lift > correction.length()))
          correction = new Vector3(0, lift, 0);
      }
      for (const surface of surfaces) {
        const escape = surface.pointExit(point.x, point.y, point.z, 0.2);
        if (!escape) continue;
        escape.addScaledVector(escape.clone().normalize(), 0.003);
        if (!correction || escape.lengthSq() > correction.lengthSq())
          correction = escape;
      }
    }
    return correction?.clampLength(0, 0.04) || null;
  });
}
