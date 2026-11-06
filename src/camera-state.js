export function diveCameraFrame(game, dt, landDistance = 5.3) {
  const target = game.diving ? 1 : 0,
    previous = game.cameraDiveBlend ?? target;
  let blend = previous + (target - previous) * (1 - Math.exp(-10 * dt));
  if (Math.abs(blend - target) < 1e-4) blend = target;
  game.cameraDiveBlend = blend;
  // Swimming roots describe the torso, including while floating for breath.
  // Keep that focus when surfacing; only walking restores the standing height.
  const swimTarget = game.swimming || game.diving ? 1 : 0,
    previousSwim = game.cameraSwimBlend ?? swimTarget;
  let swimBlend =
    previousSwim + (swimTarget - previousSwim) * (1 - Math.exp(-10 * dt));
  if (Math.abs(swimBlend - swimTarget) < 1e-4) swimBlend = swimTarget;
  game.cameraSwimBlend = swimBlend;
  return {
    blend,
    swimBlend,
    height: 1.3 - swimBlend,
    distance: landDistance + (3.4 - landDistance) * blend,
  };
}

export function normalizeCamera(value) {
  if (!value || !Number.isFinite(value.yaw) || !Number.isFinite(value.pitch))
    return null;
  return {
    yaw:
      Math.abs(value.yaw) <= Math.PI
        ? value.yaw
        : Math.atan2(Math.sin(value.yaw), Math.cos(value.yaw)),
    pitch: Math.max(-0.65, Math.min(1.05, value.pitch)),
  };
}
