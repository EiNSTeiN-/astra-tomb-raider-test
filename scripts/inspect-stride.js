import * as THREE from "three";

// Track actual material points on both delivered outsoles, independently of the
// runtime's small support-probe set. Keep vertex identity across adjacent frames.
export function strideSoles(model) {
  const shoe = model.getObjectByName("shoes04");
  const { position, skinIndex, skinWeight } = shoe.geometry.attributes;
  return ["Left", "Right"].map((side) => {
    const indices = [];
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > 0.025) continue;
      let strongest = 0;
      for (let k = 1; k < 4; k++)
        if (
          skinWeight.getComponent(i, k) > skinWeight.getComponent(i, strongest)
        )
          strongest = k;
      if (
        shoe.skeleton.bones[skinIndex.getComponent(i, strongest)].name.includes(
          side,
        )
      )
        indices.push(i);
    }
    return { shoe, indices, side };
  });
}

export function sampleStrideSoles(feet) {
  return feet.map((f) =>
    f.indices.map((i) =>
      f.shoe
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(f.shoe.matrixWorld),
    ),
  );
}

export function soleSlip(previous, current, dt, ground = () => 0) {
  if (!previous || dt <= 0) return [];
  return current.flatMap((foot, f) =>
    foot.flatMap((p, v) => {
      const last = previous[f][v];
      return p.y - ground(p.x, p.z) < 0.03 &&
        last.y - ground(last.x, last.z) < 0.03
        ? [Math.hypot(p.x - last.x, p.z - last.z) / dt]
        : [];
    }),
  );
}
