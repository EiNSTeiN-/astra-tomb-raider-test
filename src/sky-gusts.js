import { bridgeDeckY, spanCoordinates } from "./sky-bridge-rules.js";

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A warning precedes every pulse, including a reversal. The opening spans are
// gentle; later crossings change rhythm and direction, without mandatory waits.
export function bridgeGust(bridge, time) {
  const stage = bridge.stage || 0,
    kind = stage < 3 ? "steady" : stage < 6 ? "reversing" : "broken",
    period = kind === "steady" ? 13 : kind === "reversing" ? 17 : 12,
    t = (Math.max(0, time) + (bridge.section || 0) * 0.27) % period,
    side = (stage + (bridge.section || 0)) % 2 ? -1 : 1,
    peak = stage === 0 ? 0.65 : Math.min(2.3, 1.1 + stage * 0.17),
    pulses =
      kind === "steady"
        ? [[4, 1.1, 2.3, 1.1, side]]
        : kind === "reversing"
          ? [
              [3, 0.9, 1.8, 1, side],
              [10, 0.9, 1.8, 1, -side],
            ]
          : [
              [3, 0.7, 0.9, 0.8, side],
              [7.3, 0.7, 0.9, 0.8, -side],
            ];
  let force = 0,
    warning = 0,
    direction = side;
  for (const [start, rise, hold, fall, sign] of pulses) {
    if (t >= start - 1.8 && t <= start + rise + hold + fall) direction = sign;
    warning = Math.max(warning, t < start ? smooth(start - 1.8, start, t) : 0);
    force +=
      sign *
      peak *
      smooth(start, start + rise, t) *
      (1 - smooth(start + rise + hold, start + rise + hold + fall, t));
  }
  const strength = Math.abs(force) / peak;
  return {
    kind,
    period,
    force,
    strength,
    warning,
    direction,
    peak,
    activity: 0.12 + 0.88 * Math.max(strength, warning * 0.45),
  };
}

export function updateSkyGusts(game) {
  if (game.paused) return;
  for (const bridge of game.skyBridges || [])
    bridge.gust = bridgeGust(bridge, game.elapsed || 0);
}

export function skyWindAt(game) {
  const position = game.player?.position;
  if (!position || game.swimming || game.climb || game.ropeRide || game.zipRide)
    return null;
  for (const bridge of game.skyBridges || []) {
    if (bridge.open < 0.995) continue;
    const p = spanCoordinates(bridge, position.x, position.z),
      y = bridgeDeckY(bridge, p.along);
    if (
      p.along < 0 ||
      p.along > p.length ||
      Math.abs(p.across) > bridge.width / 2 + 0.7 ||
      position.y < y - 0.3 ||
      position.y > y + 3
    )
      continue;
    const gust = bridge.gust || bridgeGust(bridge, 0),
      shelter =
        smooth(0, 4, p.along) * (1 - smooth(p.length - 4, p.length, p.along)),
      force = gust.force * shelter,
      braced = !!game.crouching && !!game.grounded,
      scale = braced ? 0.035 : !game.grounded ? 1.15 : game.carrying ? 1.12 : 1;
    return {
      bridge,
      gust,
      braced,
      force,
      x: p.uz * force * scale,
      z: -p.ux * force * scale,
    };
  }
  return null;
}

// Add to the ordinary collision controller, so wind cannot move a body through
// solid cover or supply a foothold above missing boards.
export function skyWindVelocity(game, velocity) {
  const wind = skyWindAt(game);
  game.skyWind = wind;
  if (!wind || game.paused || game.blockGrip || game.dodge || game.diving)
    return velocity;
  return { x: velocity.x + wind.x, z: velocity.z + wind.z };
}
