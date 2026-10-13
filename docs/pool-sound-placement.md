# Pool sounds follow exposed water

Pool ambience now comes from exposed water beside the restored working ground.
A reservoir's rectangular render sheet can continue beneath a dry instrument
pad, so its mesh centre is no longer a reliable sound position. Exposed wet
centres keep their locations. Dry or shallow centres use a deeper part of the
visible sheet, and the voice follows the water height during draining.

The normal-game survey found three jungle and two crystal emitters below dry
ground. The jungle's fourth centre had only 8.89 cm of water. The five buried
positions were between 9.48 and 41.08 cm below their floors. All six sources
now have anchors over exposed water; the regional pool geometry and working
pads retain their existing shapes.

| Source | Original height above floor | Revised height above floor |
| --- | ---: | ---: |
| Jungle reservoir 1 | -0.095 m | 1.470 m |
| Jungle reservoir 3 | 0.089 m | 1.470 m |
| Jungle reservoir 5 | -0.180 m | 1.470 m |
| Jungle reservoir 7 | -0.137 m | 1.470 m |
| Crystal reservoir 3 | -0.180 m | 1.331 m |
| Crystal reservoir 7 | -0.411 m | 0.617 m |

Buried sources were not uniformly inaudible: the sight query samples the path
between its endpoints, and some recorded approaches remained clear. At the
recorded jungle reservoir-5 bank, the old voice was filtered as obstructed;
the current voice is clear and positioned above wet ground. Architecture still
filters sound where it blocks the route from a bank to the new anchor. Across
the sampled jungle banks, moving a source can improve or reduce the number of
clear paths; this repair does not remove physical occlusion or raise the mix.

The palace arcade's centre is also wet beneath its floating pontoon. Its
source now sits in the open water beside the deck, with a small margin beyond
the wood and rails. Independent rays through the delivered pontoon geometry
confirm the old cover and the clear replacement at both ends of its rise.
A normal-game search finds three clear listening positions among 490 sampled
supported landing positions; the old centre had none in that same search.
Other platform approaches retain their physical filtering.

Placement compares the actual floor with the delivered water sheet's
interpolated bed. It preserves a 6 cm water margin, beyond the wave harmonics'
combined 5.1 cm amplitude. A cached survey keeps only the original centre and
a representative deep face. Ordinary updates reuse those points, follow the
current plane height and stop the pool activity when no stable exposed anchor
remains. Refilling restores the voice, and cooled lava retains its silence.
The cache uses weak mesh keys and adds no GPU resources or timers.

The existing recordings retain [their attribution](asset-credits.md). Sound
attenuation, obstruction filters, the twelve-voice limit, chapter/objective
scores and mix sliders remain in use. No saved state,
puzzle solution, source ID, route or collision geometry changes.

## Verification

All 96 selected checks pass on the final source: 23 audio, water-placement and
arcade checks, followed by 73 sound/water/terrain checks across 32 additional
test files. Five new regressions cover all 28 terrain-pool emitters in six
environments, independent delivered-sheet raycasts and floor clearance,
repeated crystal construction/updates, draining/refilling/depletion/cooling,
cached steady updates, a wet-floor/dry-shader counterexample, translation and
the actual pontoon's covered centre, clear replacement and full rise.

The browser review covers 34 nonblank views: 28 High pool views and six Low
views of the moved jungle/crystal sources. All 28 pool sources have accepted
standing positions, a selected unblocked live voice and panner coordinates
matching their water anchors. Recordings load without fallback failures,
shaders link and the checks report no GL errors. The first 19 views preceded
the final pontoon refinement; all 13 of their High source/depth records are
reloaded and matched exactly against the final implementation. The other 15
views are captured with that final source.

This is prepared static coverage, with guardians present but their simulation
and hazards not advancing. It verifies sampled placement and rendering; it
does not establish continuous bank safety or an uninterrupted traversal.

Six actual browser signal checks pass, covering stream, drip and lava voices.
Identical source phases and buffers run through the delivered
positional-voice/obstruction chain in
48 kHz stereo OfflineAudioContexts. At the middle of each source's near-to-outer
range, measured RMS amplitude is one half of the near signal; beyond the outer
range it is zero. Obstruction reduces the near signal. This checks numerical
falloff and filtering, not perceived loudness or subjective sound quality.

The production build passes in 5.68 seconds with the existing size advisory.
Production keyboard/High at 1280×800 and portrait touch/Low at 540×900 pass
movement, manual look and four strict paused-store reload comparisons. The
keyboard case moves 1.280 m at the jungle reservoir; the touch case moves
2.400 m beside the crystal pool. Both retain health 100 and the chosen saved
look, with no camera adjustments. Comparisons exclude only `lastPlayed` visit
stamps; loaded JavaScript/CSS filenames match the final build, and the page has
no development game hook. All six native views are reviewed.

These checks use canonical prepared stores, live guardian simulation and
headless touch emulation. They are muted and do not establish human listening,
physical-phone performance or an earned route to those positions.

All owned test workers, browsers and preview servers are closed. The final
preview ports are closed and their temporary runtime profiles are cleared.
No generated captures or player stores are published.

All verification uses the shared, locked 5/16 CPU allowance, at most two test
workers and one browser. The discarded first browser capture attempt read the
canvas after an asynchronous voice check and produced blank High images.
Those images are not evidence. The corrected capture renders immediately
before reading the canvas and rejects blank images. Raw diagnostic stores,
profiles, logs, audio measurements and captures stay in ignored local staging.
No external asset, dependency, recording or music is added.

Wider scene composition, continuous routes/combat, shoreline/body contact,
physical-device performance and listening acceptance remain open.

The implementation is in [water-sound.js](../src/water-sound.js) and
[sound-landmarks.js](../src/sound-landmarks.js). The independent live delivery
observer is [inspect-pool-sound-browser.js](../scripts/inspect-pool-sound-browser.js),
with regressions in [water-sound.test.js](../tests/water-sound.test.js) and
[arcade-lock.test.js](../tests/arcade-lock.test.js).

With a chapter open in development, inspect its live emitters in the console:

```js
(await import("/scripts/inspect-pool-sound-browser.js")).inspectPoolSounds(__vesper.game);
```
