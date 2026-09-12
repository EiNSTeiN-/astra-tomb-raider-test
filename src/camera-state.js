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
