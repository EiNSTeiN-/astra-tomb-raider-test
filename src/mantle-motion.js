import * as THREE from "three";

// Lift outside the wall before crossing its edge. Interpolating straight into
// a tall platform embeds the legs in stone while the hands reach its roof.
export function mantleProgress(time) {
  const t = THREE.MathUtils.clamp(time, 0, 1);
  return {
    rise: THREE.MathUtils.smoothstep(t, 0, 0.52),
    cross: THREE.MathUtils.smoothstep(t, 0.5, 1),
    lift: Math.sin(t * Math.PI) * 0.22,
  };
}

export function mantlePoint(start, end, time, target = new THREE.Vector3()) {
  if (time <= 0) return target.copy(start);
  if (time >= 1) return target.copy(end);
  const { rise, cross, lift } = mantleProgress(time);
  target.lerpVectors(start, end, cross);
  target.y = start.y + (end.y - start.y) * rise + lift;
  return target;
}

// Find the actual first roof edge on the accepted segment, rather than placing
// the hand targets a fixed distance ahead of every approach.
export function mantleEdge(start, end, platform) {
  let enter = 0;
  for (const [axis, half] of [
    ["x", platform.w],
    ["z", platform.d],
  ]) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-8) continue;
    const a = (platform[axis] - half - start[axis]) / delta,
      b = (platform[axis] + half - start[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
  }
  const edge = start.clone().lerp(end, THREE.MathUtils.clamp(enter, 0, 1));
  edge.y = end.y + 0.045;
  return edge;
}
