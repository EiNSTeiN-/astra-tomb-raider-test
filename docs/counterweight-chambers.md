# Physical counterweight chambers

The first sanctuary in each chapter now contains a physical stone puzzle. Completing its three field stations opens the entrance. Vesper must then move carved stones onto the right receivers before the rear mechanism becomes accessible. The existing chapter puzzle follows this chamber, and solving that mechanism still creates the checkpoint.

## Playing the chambers

Read the entrance tablet for the room's inscription and current receiver state. Approach an open face of a stone and press **E** (Use on touch) to grip it. While gripping, **W / Up** pushes and **S / Down** pulls along that face, independently of camera orientation. Press Use again to release, then walk around to another face. Each move travels one floor tile. A release requested during movement takes effect after that step settles.

Named receivers require the matching carved stone. Numbered receivers add the weights of the stones on their marked tiles; cuts on each stone show its weight. A clear track must remain empty. All conditions must hold together to latch the chamber and lift the cage around its rear control. The entrance tablet's **Reset chamber** button returns the stones to their initial positions and places Vesper outside the entrance; it is disabled after progressing beyond this sanctuary.

| Chapter | Chamber | Receiver rules | Verified solution length |
| --- | --- | --- | ---: |
| The Verdant Veil | The roots of the sun | SUN and ROOT named sockets around a broken central wall | 14 moves |
| Beneath the Sands | The weight of noon | DAWN carries 3 measures; DUSK carries 4 | 12 moves |
| A Silence of Snow | The silent bellkeepers | BELL, WIND, and STAR named sockets | 15 moves |
| The Drowned Kingdom | The harbor's balance | SEA carries 3; RIVER carries 2; DRAIN stays clear | 14 moves |
| A Heart of Embers | An iron promise | IRON named socket; COOLING carries 4; EXHAUST stays clear | 14 moves |
| Where Eagles Sleep | The two wings | WEST and EAST each carry 3; CROSSING stays clear | 14 moves |
| The Night Below | The answer in the stone | LOW, MID, and HIGH named resonators | 18 moves |
| The Last Meridian | A measure of the world | SUN named socket; WORLD carries 5; PATH stays clear | 20 moves |

All eight use a five-by-five floor with different fixed-wall layouts and two or three movable stones. The move counts are solver results, not human completion times. These chambers add environmental interaction; they do not establish the requested hour of play per chapter.

## Movement, presentation, and persistence

Stones and their collision bounds move together. Both the stone's path and Vesper's path are checked continuously against obstacles, including thin obstructions between otherwise clear endpoints. Vesper cannot dodge or fire while gripping. Hand targets follow the physical handles, and pulling reverses the walking cycle. The chamber floor has a protected terrain foundation; fixed masonry is batched by material while stones, plates, labels, and the lifting cage retain their individual behavior.

Stone friction and plate changes use positional effects. The crystal chamber adds a note as a resonator activates. Gripping selects the score's quiet lifting arrangement; reading the tablet uses the existing reading mix reduction. Environmental emitters retain their distance falloff and obstruction behavior.

Each settled move saves automatically in the chapter's `counterweights` state, including tile positions and move count. Saving during a slide records Vesper's last stable position and the last settled stone tiles. Reloading therefore restores a consistent state. Reset and recovery clear an unfinished grip. Save normalization rejects malformed, overlapping, blocked, and out-of-bounds stone positions, and recalculates the solved state instead of trusting a saved flag. Older saves already beyond the first sanctuary retain their progress.

## Verification

The full automated suite passed **93 tests**, and the production build passed with the existing Three.js chunk-size advisory. New coverage includes all eight chambers solved through character movement and collision, weighted/named/clear receiver rules, continuous slide obstruction, progression gates, save validation, unfinished-move recovery, reset, held movement during grip, and the reversed pulling gait. A test loads the delivered character asset and keeps both hands within 5 cm of their handles across push and pull cycles in all four cardinal directions.

Browser-assisted walkthroughs completed all eight chambers against their actual generated worlds. The helper opens the first field gate and begins at the entrance, then walks between stone faces through the real collision system and animates every move. These are deterministic, development-assisted checks, not unassisted playthroughs. Separate native keyboard checks exercised push and pull, and Chromium's multi-touch protocol confirmed that releasing Use preserves a held Forward finger. Those input checks advanced movement programmatically. Reloading restored a four-move state exactly, and the entrance tablet's Reset button returned the room to its initial arrangement.

The production build loaded that partial test save without exposing the development hook. A native keyboard grip and push completed a fifth move through the normal running game; pausing and reloading preserved the exact tile positions and move count, with Continue expedition available. Chromium reported no console warnings or errors. Software rendering made this check very slow, including an initial wait that expired before the move completed; it does not establish a supported hardware frame rate. Test-created progress was cleared in development and preview, restoring the High default.

Implementation is in `src/counterweight-rules.js` and `src/counterweights.js`, with integration in the game loop, storage, input UI, terrain protection, and character pose modules. The test solver is `scripts/solve-counterweights.js`. The browser helper is available only through the development server:

```js
await (await import('/scripts/verify-counterweights-browser.js')).verifyCounterweights([0, 1])
```

Run that helper after starting a development expedition. It modifies the selected test chapters' progress. It is excluded from the production bundle.

Blind puzzle testing, difficulty tuning, additional room art, and full chapter timing remain necessary. The chambers still share a masonry kit and do not bring the real-time graphics to AAA quality.
