# Directional shadows and hardware measurements

High quality now renders the directional shadow map once for the main color pass. The contact-occlusion pass still draws surface normals and depth, but no longer rebuilds the shadow map. That second rebuild did not contribute to contact occlusion and ran after cutout foliage had been hidden from its normal buffer.

`SolidContactPass` temporarily suppresses automatic and explicitly requested shadow updates during its normal/depth draw. It restores both flags afterward, including on an exception, and leaves shadow support enabled so receivers retain their shader variants. Performance and Balanced do not run this contact pass. No geometry, texture, light, shadow resolution, material or gameplay content changed.

## Matched image and workload checks

Each chapter was loaded in Performance, switched to High, and allowed to settle at its spawn. Elapsed animation time was fixed at 10 seconds, the camera was stationary, and the same scene rendered with the previous and updated contact pass. Each mode received a preparation render before measurement. The comparison includes all rendering passes; the water view also includes its reflection capture.

At 1280 × 720 and pixel ratio 1, **all eight comparisons had zero differing RGB pixels**. All terrain programs linked successfully.

| Chapter            | Draw calls before → after | Submitted triangles before → after | Removed shadow draws |
| ------------------ | ------------------------: | ---------------------------------: | -------------------: |
| Verdant Veil       |                 927 → 779 |              3,689,080 → 3,116,084 |                  148 |
| Beneath the Sands  |                 750 → 621 |              1,765,647 → 1,337,219 |                  129 |
| A Silence of Snow  |             1,238 → 1,074 |              2,660,401 → 2,335,986 |                  164 |
| Drowned Kingdom    |             1,402 → 1,303 |              2,362,365 → 2,016,227 |                   99 |
| A Heart of Embers  |                 789 → 674 |                1,053,497 → 807,455 |                  115 |
| Where Eagles Sleep |             1,209 → 1,035 |              3,062,170 → 2,460,158 |                  174 |
| Night Below        |             1,875 → 1,875 |              2,738,339 → 2,738,339 |                    0 |
| Last Meridian      |                 542 → 403 |                  995,031 → 733,095 |                  139 |

The crystal cavern's directional light does not cast shadows. Its unchanged workload is expected. Pixel equality applies to these selected views, not every possible camera or animation state.

## Actual GPU access

These checks used Chrome for Testing 148.0.7778.96, headless Chromium, ANGLE Vulkan, and an **AMD Radeon 780M (RADV PHOENIX, Mesa 25.2.8)**. The WebGL renderer string identified the AMD device and exposed `EXT_disjoint_timer_query_webgl2`. Earlier sandboxed browser checks could not open the graphics device and selected software rendering. The isolated browser was given access to the device for these measurements; no system drivers or settings were changed.

A first baseline at commit `6f9125a`, before this optimization, ran the real game loop at each stationary spawn. After 2.5 seconds of warmup, each tier was sampled for approximately 6.5 seconds. This establishes a first hardware baseline, not a complete chapter benchmark:

| Chapter            | Performance mean frame interval, ms | Previous High mean frame interval, ms |
| ------------------ | ----------------------------------: | ------------------------------------: |
| Verdant Veil       |                               12.12 |                                 25.21 |
| Beneath the Sands  |                                8.61 |                                 15.26 |
| A Silence of Snow  |                                9.89 |                                 19.70 |
| Drowned Kingdom    |                                9.67 |                                 19.88 |
| A Heart of Embers  |                                8.60 |                                 17.08 |
| Where Eagles Sleep |                               14.90 |                                 27.41 |
| Night Below        |                               12.79 |                                 20.26 |
| Last Meridian      |                                8.50 |                                 12.03 |

All samples used 1280 × 720 at pixel ratio 1. Headless presentation is not synchronized to a consumer display; reciprocal frame intervals are not a guarantee of displayed FPS. CPU time includes the full game frame, including driver waits. GPU queries surround rendering only. Startup, shader compilation, full-route traversal, thermal/power controls, other applications and other devices are outside this baseline.

## Alternating timing comparison

Three representative High scenes then ran in **before / after / after / before** order in the same browser. Each sample lasted about 6.5 seconds after a 1.5-second warmup. The player and camera remained stationary while the actual simulation, decoration, audio and UI loop ran. No test suite or second graphics browser ran during these samples.

The pairs below are the two individual run means, in chronological order within each mode, rather than a pooled percentage:

| View          | Frame interval before, ms | Frame interval after, ms | GPU render before, ms | GPU render after, ms |
| ------------- | ------------------------: | -----------------------: | --------------------: | -------------------: |
| Jungle        |             23.87 / 24.44 |            21.98 / 21.93 |         18.69 / 18.10 |        17.53 / 17.62 |
| Water kingdom |             19.82 / 17.71 |            19.94 / 17.03 |         14.88 / 13.30 |        13.94 / 12.50 |
| Cloud city    |             24.30 / 24.54 |            22.55 / 24.65 |         18.54 / 19.48 |        18.07 / 17.72 |

Each sample recorded 263–381 frame intervals. No timer became disjoint, no query was skipped, and none remained unfinished. The jungle's frame interval decreased consistently. Water and cloud-city frame times overlap; these samples do not establish a consistent total-frame improvement there. The exact removed work and identical selected images are stronger evidence than a universal frame-rate claim.

## Reproduction and functional verification

In a disposable development browser profile, start an expedition, let shader preparation settle, and run:

```js
await (
  await import("/scripts/benchmark-frames-browser.js")
).benchmarkFrames(__vesper.game);
```

The helper samples the existing animation loop, so native movement can continue. It reports mean, median, p95, submitted geometry and optional GPU timing. It restores the frame/render methods and deletes timer queries when finished. Without the timer extension, GPU timing is unavailable. Sampling runs ordinary gameplay, including its normal saves; use a separate profile for reproducible diagnostics. The helper is not included in the production bundle.

All **292 automated tests** pass, and the release build succeeds with the existing large Three.js chunk advisory. The new regression exercises all combinations of enabled, automatic and pending shadow updates, including a failed normal draw. The matched rendering checks reported no JavaScript errors or failed asset responses.

The High production build accepted native W movement from `(56, 70)` to `(58.1633224864, 67.8366775136)`. Pause saved 10.5813 accumulated active seconds and health 93. Reload and a simulated focus-loss pause restored the exact chapter state and settings apart from the expected last-played timestamp. No development hook, JavaScript errors or failed asset responses appeared. Checked bundles: `index-vd3h1BuT.js`, `game-ByOwk77G.js`, `three-BdBRyBCh.js` and `index-BdgvWVky.css`. All disposable test browsers were closed.

These measurements cover one integrated GPU and selected viewpoints. Broader desktop/mobile/browser coverage, sustained performance, subjective audio review, AAA graphics and approximately one hour of unassisted play per chapter remain open in [production status](production-status.md).
