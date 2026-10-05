# Jump presses between controller frames

The [native eagle-route inspection](sky-eagle-route.md) found that an
instantaneous touch Jump tap could miss a rope release in Low quality. The
pointer-down handler added Space, but pointer-up removed it before the next
controller update. A longer press worked. Keyboard input had the same potential
gap between key-down and key-up.

Both handlers now retain a transient press until one player-controller update
processes it. Releasing the physical key or finger still removes the held
input. The queued press lasts for that update only, including when a mechanism
returns early. This preserves held diving ascent and cart braking without
turning a quick tap into a permanently held control. Pausing, losing focus and
resetting traversal clear the pending press. It is not part of the save schema.

## Verification

All **723 tests pass**, and the production build succeeds with its existing
large-bundle advisory. Four added regressions check actual controller behavior:

- A ground jump starts after a press and release between updates, does not
  repeat, and is canceled by traversal reset. Paused or inactive games reject
  new queued presses.
- A between-update rope release leaves the rope once and supplies its normal
  upward boost.
- A diver rises once after a released tap, retains depth afterward and rises
  continuously only while Space remains held.
- A moving tempering cart brakes for the queued update, resumes after a tap
  and continues braking while the key stays held.

Four production browser cases revisit both eagle ropes using keyboard High at
1280 × 800 and touch Low at 540 × 900. Keyboard releases use a normal quick
Space press; touch releases now use an immediate Jump tap without the previous
two-frame hold. All four catches, release cues and far-ledge landings pass at
full health. Pausing and reloading retains the stored state apart from
last-played timestamps, and resumed controller feet retain each saved landing
within 5 cm. The eight playing and eight paused/reload captures were reviewed.

Four additional High/Low production cases deliver key-down, key-up and either
Escape or window blur synchronously through the game's DOM event handlers,
before any animation frame can process the press. These are scripted DOM
inputs, not a physical focus-change test. Pausing cancels the queued jump;
resuming for twelve frames leaves the supported position exactly unchanged.
Field progress, health, wind state and counterweights remain unchanged, and
reloading preserves the stored state apart from timestamps. Their eight
resumed/reloaded views were reviewed.

Both browser runs load the current production bundles with no development
handle, browser errors or warnings. World geometry, character artwork,
positional sound sources, music and asset attribution are unchanged. Raw
captures, saves and browser data remain in ignored local staging.

VA-37 is fixed for the reproduced missed press. The movement-dependent summit
camera finding VA-36 and the wider [world audit](visual-audit.md) remain open.
