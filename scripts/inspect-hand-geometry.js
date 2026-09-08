import * as THREE from "three";

// Measure the delivered skinned surface independently of the finger solver.
// A negative clearance is inside the visible grip's finite cylinder.
export function handGeometry(
  game,
  { handles: suppliedHandles, halfLength = 0.095 } = {},
) {
  const cable = game.zipRide?.course.zipRig;
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  cable?.hanger.updateWorldMatrix(true, true);
  const handles = suppliedHandles || [...cable.handles].reverse();
  for (const handle of handles) handle.updateWorldMatrix(true, true);
  return ["Left", "Right"].map((side, index) => {
    const handle = handles[index];
    const center = handle.getWorldPosition(new THREE.Vector3());
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(
      handle.getWorldQuaternion(new THREE.Quaternion()),
    );
    const fingers = Object.fromEntries(
      ["Palm", "Index", "Middle", "Ring", "Pinky", "Thumb"].map((name) => [
        name,
        [],
      ]),
    );
    const vertices = [];
    game.rig.model.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const labels = mesh.skeleton.bones.map((b) => {
        const match = b.name.match(
          new RegExp(side + "Hand(Index|Middle|Ring|Pinky|Thumb)?\\d?$"),
        );
        return match ? match[1] || "Palm" : null;
      });
      for (let i = 0; i < position.count; i++) {
        const weights = {};
        for (let j = 0; j < 4; j++) {
          const label = labels[skinIndex.getComponent(i, j)];
          if (label)
            weights[label] =
              (weights[label] || 0) + skinWeight.getComponent(i, j);
        }
        const label = Object.keys(weights).sort(
          (a, b) => weights[b] - weights[a],
        )[0];
        if (
          !label ||
          Object.values(weights).reduce((sum, w) => sum + w, 0) < 0.5
        )
          continue;
        const point = mesh
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(mesh.matrixWorld);
        const offset = point.clone().sub(center),
          along = offset.dot(axis);
        const radial = Math.sqrt(
          Math.max(0, offset.lengthSq() - along * along),
        );
        const qx = radial - 0.019,
          qy = Math.abs(along) - halfLength;
        const clearance =
          Math.min(Math.max(qx, qy), 0) +
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
        fingers[label].push(clearance);
        vertices.push({ point, clearance, label });
      }
    });
    return {
      side,
      fingers: Object.fromEntries(
        Object.entries(fingers).map(([name, values]) => {
          values.sort((a, b) => a - b);
          return [
            name,
            {
              vertices: values.length,
              minimum: values[0],
              fifthPercentile: values[Math.floor(values.length * 0.05)],
              median: values[Math.floor(values.length * 0.5)],
              penetrations: values.filter((v) => v < -0.002).length,
            },
          ];
        }),
      ),
      vertices,
    };
  });
}
