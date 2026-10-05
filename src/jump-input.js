// A press can start and end between two controller updates. Retain its edge
// until one update sees it, without turning a released press into a held key.
export function queueJumpPress(game) {
  if (!game?.active || game.paused) return false;
  game.jumpPressed = true;
  game.keys.add("Space");
  return true;
}

export function advanceWithJumpPress(game, update) {
  const queued = !!game.jumpPressed,
    held = game.keys.has("Space");
  game.jumpPressed = false;
  if (queued) game.keys.add("Space");
  try {
    return update();
  } finally {
    // Diving and vehicle controls use Space continuously and may return before
    // walking consumes it. A tap must not leave those controls permanently on.
    if (queued && !held) game.keys.delete("Space");
  }
}

export function clearJumpPress(game) {
  game.jumpPressed = false;
  game.keys?.delete("Space");
}
