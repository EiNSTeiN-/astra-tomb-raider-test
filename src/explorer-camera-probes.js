// Joint margins do not cover every edge of a prone stroke or a reaching hand.
// Keep extremal delivered arm and hand vertices, then read their
// animated positions during gallery framing. The references leave with the rig.
export function explorerCameraProbes(model) {
  const samples = [],
    directions = [
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
      let dominant = 0;
      for (let j = 1; j < 4; j++)
        if (
          skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)
        )
          dominant = j;
      const name =
        mesh.skeleton.bones[skinIndex.getComponent(i, dominant)]?.name;
      if (!/(?:Arm|ForeArm|Hand.*)$/.test(name || "")) continue;
      // Fingers share a hand silhouette; retaining separate extrema for every
      // finger bone duplicates most rays without enlarging that silhouette.
      const bone = name.replace(/Hand.*/, "Hand");
      if (!groups.has(bone)) groups.set(bone, []);
      groups.get(bone).push(i);
    }
    const selected = new Set();
    for (const indices of groups.values())
      for (const [x, y, z] of directions) {
        let score = -Infinity,
          chosen;
        for (const index of indices) {
          const value =
            position.getX(index) * x +
            position.getY(index) * y +
            position.getZ(index) * z;
          if (value > score) {
            score = value;
            chosen = index;
          }
        }
        if (chosen !== undefined) selected.add(chosen);
      }
    for (const index of selected) samples.push({ mesh, index });
  });
  return samples;
}
