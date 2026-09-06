# Soundscape implementation and verification

The added requirement is a polished distance-sensitive soundscape and unobtrusive music tailored to each chapter and objective. The implemented system uses local field recordings, positional Web Audio emitters, and an original adaptive synthesized score. Its behavior has been tested; final artistic approval and listening checks on a range of headphones, speakers, and mobile devices remain subjective production work.

## Spatial sound

`src/sound-landmarks.js` places sources at visible bird perches, waterfall curtains, water pools, campfires, braziers, exposed ridges, furnaces, mechanisms, and crystals. The initial chapter sound banks registered 38–61 sources; subsequent physical mechanisms add more registered sources. At most 12 nearby loop sources are selected at once. Pending loads and sources leaving range are retired safely. Source selection uses slight hysteresis and gain fades to avoid rapid switching.

`src/audio.js` uses HRTF panning and the Web Audio linear distance model. Each source has a near radius and a maximum audible radius. Listener position follows the explorer at head height; listener orientation follows camera yaw. Blocked sources receive a smooth low-pass filter and gain reduction. Shared buffers use different playback offsets, mono downmixing, level normalization, and crossfaded loop seams. Recordings are bundled locally; credits and licenses are in [asset-credits.md](asset-credits.md).

The implementation follows the [Web Audio specification](https://www.w3.org/TR/webaudio-1.0/) and the documented [PannerNode distance model](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel).

### Measured browser rendering

A Chromium `OfflineAudioContext` rendered the actual bundled waterfall recording through an HRTF panner configured with a 6 m near radius and 70 m maximum radius. The same audio segment was used in every case. RMS values below are before the game's master and ambience mix gains.

| Listener position                    | Left RMS | Right RMS | Interpretation                                       |
| ------------------------------------ | -------: | --------: | ---------------------------------------------------- |
| 3 m, centered                        |  0.12592 |   0.12592 | Near-field level                                     |
| 36 m, centered                       |  0.06689 |   0.06689 | 53.1% of near amplitude, matching linear attenuation |
| 90 m, centered                       |        0 |         0 | Silent beyond the audible radius                     |
| Source on the right                  |  0.09403 |   0.14197 | Correct directional balance                          |
| Same position, listener rotated 180° |  0.14197 |   0.09403 | Left/right balance reverses                          |

A stress check supplied 40 nearby emitters and observed 12 active voices, matching the configured cap. All five recording files decoded in Chromium; all eight chapter sound banks initialized without a reported load error. The audio context was explicitly suspended and its state was confirmed as `suspended`.

Waterfall impact spray and its positional source now follow the receiving surface as a reservoir drains. A browser check measured matching impact/surface heights after a 1.77 m descent; the emitter remained 1.85 m above the impact. Surface swimming and wading create positional splash transients, while repeat strokes are rate-limited.

Reservoir emitters now follow the animated water height and fade to 30% of their original source level after the full 1.8 m drainage. A cooled lava pool's emitter becomes inactive. Active panner coordinates follow moving sources with a short smoothing interval. Terrain ridges join masonry in the obstruction test.

Guardian warning/strike cues, sentry bolts, and trap cycles now use positional one-shot effects with HRTF panning and linear distance falloff. The furnace-vent flame has a world emitter that is active only during eruption. The volcanic chapter consequently registers eight additional flame sources, still under the same 12-loop voice cap; one-shot effects are transient and separate from that loop budget.

The eight counterweight chambers use positional stone-friction and pressure-plate transients. The crystal chamber adds a note when a receiver activates. Holding a stone selects the existing quiet lifting arrangement, and reading its tablet ducks the mix through the reading state. The actual-world chamber walkthroughs exercised these action paths; they do not substitute for subjective review of the new effects.

Articulated guardian steps emit a short, low stone-footfall sound at the planted foot. They are limited to guardians within 24 m of the player and at most one event per 120 ms per guardian. Tests walk and turn all four archetypes over a slope and verify finite world positions, ground alignment, and the event interval. The sentry's existing positional discharge now originates at its visible staff lens.

A chapter-switching check exposed a recurring Chromium BiquadFilter warning even after cutoff automation was slowed. `src/audio-occlusion.js` now runs clear and muffled filters with fixed coefficients and crossfades their gains over approximately 300 ms. Both branches use Q = 0.5 and cutoffs below Nyquist. Obstruction no longer automates filter frequency.

The repeatable browser check in `scripts/verify-audio-browser.js` rendered all nine actual ambience voice types with moving emitters and 1,287 obstruction transitions at each sample rate. At 22,050 Hz, peak amplitude was 0.11146 and RMS was 0.02101; at 48,000 Hz, peak was 0.24622 and RMS was 0.04522. Every sample was finite and neither mix clipped. A separate 4 kHz tone fell to 12.1% and 14.2% of clear-path amplitude when muffled. Synthetic noise means exact amplitudes vary between runs. A live test then changed chapter audio 24 times, varied objective arrangements and obstruction, respected the 12-voice cap, and retired every playing node. Chromium reported no warnings or errors during these checks. They do not establish hour-long audio stability on every browser.

Run the signal check from the development browser console:

```js
await (await import('/scripts/verify-audio-browser.js')).verifyAudio()
```

## Adaptive music and mix

The eight scores have distinct tonal centers, scales, tempos, motifs, chord sequences, and instrument spectra. They range from sparse wooden/plucked phrases to bells, soft flute-like tones, glass harmonics, low bronze tones, and airy layered pads. These are synthesized instruments, not recorded orchestral performances or claims of authentic regional instrumentation.

Each arrangement includes rests. Objective index changes phrase voicing and motif placement. Carrying a component introduces a restrained pulse; climbing adds occasional high accents; nearby active encounters introduce a low pulse with a four-second release window. Unaware guardians and guardians returning home do not trigger the cue. Losing visual contact expires encounter memory after eight seconds, after which the cue releases. Score scheduling uses the audio clock rather than frame timing.

Music fades to 14% of its current mix during puzzles and 32% during reading. Ambience also ducks, while action and puzzle cues remain on their independent bus. Chapter changes crossfade their audio buses and retire the old sources. Hidden tabs suspend the context. A master compressor limits overlapping transients.

Browser offline renders confirmed that each of the eight arrangements produces finite, nonzero audio without clipping. These signal checks do not substitute for human listening or a device loudness survey.

## User controls and persistence

Settings expose master volume, background music, world ambience, and action/puzzle cues separately. Browser interaction set music to 21%, ambience to 67%, and effects to 83%; all values survived a page reload and were applied to the next running expedition. A 390 px viewport had no horizontal overflow. Older saves receive the default 32% music, 80% ambience, and 75% effects settings.

## Automated coverage

Exact segment checks against movement obstacles now supplement terrain sampling for sight and sound occlusion. A regression check places a thin wall between samples, confirms that it blocks the source, then confirms that raising the gate or moving the sight line above the wall clears it. Encounter-state tests verify that the score does not react to an unaware guardian or continue requesting danger after contact is lost.

The test suite checks bounded monotonic attenuation, silence beyond every source's range, existence of every bundled recording, distinct chapter arrangements, variation with objectives, musical rests, removal of melody during listening puzzles, restrained note levels, migration/clamping of audio settings, and changing reservoir/lava emitter state. Broader browser/device compatibility and subjective mix evaluation remain to be done.
