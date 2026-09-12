import * as THREE from "three";
import { constrainCamera } from "./camera-collision.js";

// Only choose an orbit on arrival. Ordinary play keeps the player's look input
// and the existing swept, damped camera response.
export function arrivalCamera(
  target,
  preferred,
  surfaces,
  canOccupy,
  distance = 5.3,
) {
  const candidate = (yaw, pitch, deviation) => {
    const desired = target
      .clone()
      .add(
        new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch) * distance,
          Math.sin(pitch) * distance + 0.2,
          Math.cos(yaw) * Math.cos(pitch) * distance,
        ),
      );
    const position = constrainCamera(target, desired, surfaces, canOccupy),
      length = position.distanceTo(target);
    return {
      yaw,
      pitch,
      position,
      length,
      clear: length >= desired.distanceTo(target) * 0.96,
      score: length - deviation * 0.25,
    };
  };
  let best = candidate(preferred.yaw, preferred.pitch, 0);
  if (best.clear) return best;
  const angles = [0];
  for (let step = 1; step <= 12; step++) {
    angles.push((step * Math.PI) / 12);
    if (step < 12) angles.push((-step * Math.PI) / 12);
  }
  // Try nearby headings at the chosen height first. A second height is useful
  // beneath low ceilings or beside a steep bank when no full orbit is clear.
  const pitches = [
    ...new Set([
      preferred.pitch,
      Math.min(1.05, preferred.pitch + 0.25),
      Math.max(-0.65, preferred.pitch - 0.25),
    ]),
  ];
  for (const pitch of pitches)
    for (const delta of angles) {
      const next = candidate(
        preferred.yaw + delta,
        pitch,
        Math.abs(delta) + Math.abs(pitch - preferred.pitch),
      );
      if (next.clear) return next;
      if (next.score > best.score) best = next;
    }
  return best;
}
