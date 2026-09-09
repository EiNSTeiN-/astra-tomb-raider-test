import { MathUtils } from "three";

// Median backward sole velocity during contact, measured from the delivered GLB
// at its original playback rate. Gameplay moves the root independently.
const CONTACT_SPEED = { Walk: 1.56, Run: 4.24 };

export function strideScale(game, name, speed) {
  const crouch = game.rig?.crouchBlend ?? Number(!!game.crouching);
  const standing =
    name === "Run"
      ? MathUtils.clamp(1 + (speed - 4.24) * 0.1, 1, 1.3)
      : name === "Walk"
        ? MathUtils.clamp(speed / 1.56, 1, 1.15)
        : 1;
  return MathUtils.lerp(standing, 0.72, crouch);
}

export function strideRate(game, name, speed) {
  return MathUtils.clamp(
    speed / (CONTACT_SPEED[name] * strideScale(game, name, speed)),
    0.15,
    2.8,
  );
}
