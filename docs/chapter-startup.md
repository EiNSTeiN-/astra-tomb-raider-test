# Chapter preparation and recovery

Starting or resuming an expedition now keeps the loading screen visible until its required visual files and audio preparation have settled and its first scene has finished rendering. Previously the game could appear while textures and models were arriving. The simulation and saved play time now remain stopped throughout preparation.

The screen announces two stages: loading the environment and soundscape, then preparing the first view. **Back to expeditions** and Escape cancel the attempt. Repeated starts of the same chapter share one request; choosing a different chapter cancels the earlier attempt. Required asset failures and preparation deadlines return to the launcher with a retry action. Existing chapter progress is retained, and a cancelled first visit does not create a saved chapter.

## Lifecycle

`src/asset-loading.js` creates a separate Three.js loading manager for each attempt. Synchronous masonry helpers capture it through a scoped texture-loader factory; terrain, panorama, explorer, and vegetation loaders receive that same manager. An explicit build hold keeps the batch open until asynchronous model construction has finished discovering embedded images and installing scene objects. Errors from a cancelled batch cannot become errors in the replacement batch.

`Adventure.load(..., { preparing: true })` builds an inactive, paused world. Its `save()` guard prevents partially constructed state from reaching localStorage. The launcher snapshots the destination chapter and current selection before construction and restores those in memory on cancellation or failure. Settings and other chapter entries are retained.

`src/chapter-startup.js` waits for the visual batch and the existing audio readiness promise. Environmental recordings retain the audio engine's synthesized fallback when an optional recording fails. The initial camera, decorations, and spatial audio are updated without advancing gameplay. Scene compilation and one render initialize the visible scene, shadow/reflection work, and post-processing. A WebGL 2 fence is polled with a zero blocking timeout until that submitted work completes. No pixel readback is used.

Only the owning request can activate the prepared chapter. New expeditions open their briefing; saved expeditions resume when focused or open paused when the document is hidden or lacks focus. Resuming resets the frame clock so loading time is excluded. The loading overlay makes both launcher and game controls inert and clears held movement controls. Its compact layout keeps the return button visible on short screens.

Audio stays suspended during loading. The audio engine also records the latest playback intent: if a delayed resume resolves after loading or tab hiding requested a pause, it suspends again. Chapter audio construction can now explicitly start paused.

## Verification

The full suite passes **117 tests**, including 12 new startup regressions. These cover discovered image readiness, independent batches and loader scope restoration, cancellation with late rejection, timeouts, nonblocking fence polling and cleanup, graphics-context errors, visual/audio readiness ordering, frozen simulation and saves, rollback, and delayed audio resume ordering. The production build passes with the existing Three.js chunk-size advisory.

Browser checks used the real application and locally served assets:

- A held jungle texture kept the overlay visible, controls inert, simulation inactive, and a prepared save at exactly 77 seconds. Duplicate starts returned the same request. Escape returned to the launcher with localStorage unchanged; late completion did not reactivate the game.
- A failed `temple-color.jpg` download produced the retry screen and retained the 77-second save. Clicking retry loaded successfully with zero asset-batch errors and exactly the same `(56, 70)` position and time before gameplay resumed. The corrected audio state was suspended during the held download.
- Cancelling a new desert visit removed its temporary chapter entry. Superseding a held explorer-model request with a snow-chapter start succeeded with zero errors in the new batch.
- A saved snow chapter at 88 seconds finished loading while another tab had focus and opened the pause menu at exactly 88 seconds. Chromium's automation focus emulation was disabled for this check; `document.hasFocus()` was false. The harness kept `document.hidden` false, so this specifically verifies the lost-focus path.
- At 640 × 420, the compact loading screen's return button occupied vertical pixels 302–338, entirely inside the viewport. The earlier layout had extended past the bottom and was corrected.
- The production build, without the development hook, opened a fresh High-quality jungle briefing at zero play time. Holding a required texture left localStorage unchanged during loading. Native keyboard movement then changed the position, and pausing saved 10.226599999964238 active seconds at `(56.05685138510625, 69.94314861489376, height 0)`.
- Reloading that production save, starting while another tab gained focus, and finishing preparation restored exactly that position and elapsed time in the pause menu. Production checks reported no console warnings or errors. Intentional cancellation and failed-download development cases produced expected loader/network error logs; these are not described as console-clean runs.

These checks ran on Chromium with ANGLE/SwiftShader software rendering. They establish lifecycle behavior, not consumer-GPU performance. Scene compilation still performs synchronous JavaScript/driver work, so cancellation can only respond when that work yields. Assets and the first-frame wait each have a 120-second deadline; this does not shorten downloads or remove later rendering costs. Broader browser/device testing, compressed texture delivery, AAA art quality, and full-duration chapter playtests remain open production work.

Development and production-preview test saves were cleared after verification, restoring the default High setting.
