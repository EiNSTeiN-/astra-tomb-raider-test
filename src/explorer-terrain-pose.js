import { Vector3 } from "three";

// Small, delivered-skin samples around the thighs and knees. Separate bone
// groups and height bands retain the trouser edges when a bent joint deforms
// them differently. References belong to the current character, like sole probes.
function lowerBodyProbes(model) {
  const samples = [];
  const directions = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    ...[-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])),
    ),
  ];
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinWeight, skinIndex } = mesh.geometry.attributes;
    if (!skinWeight || !skinIndex) return;
    const groups = new Map();
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < 0.08 || y > 0.98) continue;
      let dominant = 0;
      for (let j = 1; j < 4; j++)
        if (
          skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)
        )
          dominant = j;
      const bone = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)];
      if (!/(?:UpLeg|Leg|Hips)$/.test(bone?.name || "")) continue;
      const key = `${bone.name}:${Math.floor((y - 0.08) / 0.3)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const selected = new Set();
    for (const indices of groups.values())
      for (const [x, y, z] of directions) {
        let score = -Infinity,
          chosen;
        for (const i of indices) {
          const value =
            position.getX(i) * x + position.getY(i) * y + position.getZ(i) * z;
          if (value > score) {
            score = value;
            chosen = i;
          }
        }
        if (chosen !== undefined) selected.add(chosen);
      }
    for (const index of selected) samples.push({ mesh, index });
  });
  return samples;
}

// Uneven ground can put an uphill ankle above a deeply crouched hip. Retain
// ankle targets and raise the visual pelvis only enough for the clothed knees
// to clear. The caller bounds this below the ordinary standing origin, so the
// player's existing standing movement envelope still contains the entire pose.
export function fitCrouchTerrain(game, pelvis, maximum, applyPelvis) {
  const rig = game.rig;
  if ((rig.crouchBlend || 0) < 0.05 || maximum <= pelvis) return pelvis;
  if (rig.terrainCrouch?.model !== rig.model)
    rig.terrainCrouch = {
      model: rig.model,
      probes: lowerBodyProbes(rig.model),
    };
  const probes = rig.terrainCrouch.probes;
  if (!probes.length) return pelvis;
  const point = new Vector3();
  const clear = () => {
    for (const { mesh, index } of probes) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      if (point.y - game.groundHeight(point.x, point.z) < 0.03) return false;
    }
    return true;
  };
  if (clear()) return pelvis;
  let lo = pelvis,
    hi = maximum;
  applyPelvis(hi);
  if (!clear()) return hi;
  for (let i = 0; i < 7; i++) {
    const middle = (lo + hi) / 2;
    applyPelvis(middle);
    if (clear()) hi = middle;
    else lo = middle;
  }
  applyPelvis(hi);
  return hi;
}
