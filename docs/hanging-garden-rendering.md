# Hanging Garden rendering

Nearby stone and timber now draw their depth before their textured surfaces.
This allows the GPU to reject hidden fragments beneath overlapping paving,
inside masonry and behind truss members before running their lighting shaders.
The [garden construction](hanging-garden-construction.md), textures and visible
weathering remain in place.

The twelve depth meshes share the exact geometry buffers of their color meshes
and one lightweight depth material. Each depth mesh is attached to its source,
so span rotation, support lifts and the counterweight carry both transforms
together. They write no color, cast no shadows, produce no picking hits and
are excluded from the contact-normal pass.

Depth drawing is enabled only when the camera is within 40 m of the garden's
central crossing height. The wide-view investigation showed that drawing extra
depth at a distance can cost more than it saves. Distant cameras therefore
retain the original drawing path. This is a rendering choice; it does not hide
any construction or change collision, route state or saves.

## Pixel and draw comparisons

Seven fixed cameras were compared on High, Medium and Low at 1280 × 800,
pixel ratio 1. These cover the close winch, span underside, broken gallery,
wide overview, stair, turning span and a partially raised second bridge.
The same scene and camera were rendered with depth drawing disabled and
forced enabled. All **21 comparisons have zero differing RGBA values**.
All shaders link, with no browser errors, warnings or failed HTTP responses.

The ordinary render path enables the pass in all six nearby views and disables
it in the wide view. Its measured submissions match the corresponding variant
exactly. Extra work per nearby view is the same on all three quality settings:

| View | Additional draws | Additional submitted triangles |
| --- | ---: | ---: |
| Winch | 4 | 43,444 |
| Span underside | 8 | 47,272 |
| Broken gallery | 9 | 51,144 |
| Stair | 6 | 43,708 |
| Turning span | 9 | 47,492 |
| Partially raised bridge | 11 | 51,584 |
| Wide view, automatic pass disabled | 0 | 0 |

These depth submissions share the existing vertex buffers. They add twelve
mesh objects and one material, with no additional geometry or texture downloads.
Additional renderer bookkeeping and GPU resource overhead were not measured.
The pixel comparisons cover these views on the tested browser/GPU; they do not
prove all possible views or devices.

## GPU comparison

The final close-winch comparison uses headless Chromium on Radeon 780M / RADV
Vulkan at 1280 × 800, pixel ratio 1. Each quality has four 4.5-second samples
in disabled/enabled/enabled/disabled order after warmup. Actors, camera, chapter
time and foliage detail levels remain fixed. The only variant is depth drawing
for the existing stone and timber. The current cinematic renderer, including
its normal, shadow, water and postprocessing paths, renders the scene repeatedly.

| Quality | Mean GPU time, disabled | Mean GPU time, enabled | Change |
| --- | ---: | ---: | ---: |
| High | 33.794 ms | 29.347 ms | −13.2% |
| Low | 15.597 ms | 12.178 ms | −21.9% |

These values average the two sample means per variant, collected through
[`benchmark-frames-browser.js`](../scripts/benchmark-frames-browser.js). All
eight accepted samples have hardware timing results, zero disjoint events,
no unfinished queries and no browser errors or warnings. An earlier harness
attempt that bypassed the timing hook produced no GPU samples and was excluded.

The scene is frozen to isolate rendering; simulation, player input and AI work
are not represented by these timings. This is not a gameplay frame-rate claim.
The shared machine also varies between samples: High's disabled sample means
range from 32.519 to 35.070 ms, compared with 29.086 to 29.609 ms enabled.
Other views and devices can have different costs and savings.

The unrestricted diagnostic pass added about 1.5 ms High / 1.2 ms Low in its
wide-view sample pair, with considerable variation between samples. That led
to the distance limit. The final wide view has no extra depth draws or submitted
triangles on any quality setting. The ordinary per-render distance check still
has a CPU cost that was not separately measured.

These paired measurements keep the current construction in both variants.
They cannot be combined with the earlier construction benchmark to claim that
its entire added cost has been recovered.

## Verification

All **570 automated tests pass** in 127.5 seconds with two workers. The
production build succeeds in 3.08 seconds with Vite's existing large-chunk
advisory. No external assets, dependencies, geometry buffers or textures were
added by this change.

The automated regression checks shared geometry, matching transforms during
rotation and lift motion, color/depth settings, shadow and picking exclusions,
contact-pass visibility restoration, the distance threshold and a camera under
a transformed parent. Other chapters return before doing garden-specific work.

The complete assisted route finishes all three winches, rotating crossings,
gallery jumps and the return stair at **100 health**. Normal movement, camera
updates, guardians and hazards are active; the check supplies navigation and
jump timing. This does not establish human playthrough duration.

At the final wide camera the scene retains its previous submissions: High
1,696 calls / 4,816,224 triangles; Medium 1,121 / 3,029,093; Low 605 / 1,380,371.
All three quality settings link their shaders. Changing chapters disposes
**96 geometries, 18 materials and 19 textures exactly once**, including the new
shared depth material. No geometry buffer is added. Garden state is cleared
and all seven machinery emitters are removed.

The actual hoist buffer's left-channel RMS is **0.218721 at 2 m**,
**0.109360 at 15 m** and **0 at 29 m**, beyond its 28 m range. The midpoint is
half the near amplitude. The live handwheel voice, winch/climbing music tasks,
and machinery silence during pause and rest also pass. These are signal and
behavior checks, not subjective listening results. The assisted route reports
no browser errors, warnings or failed HTTP responses.

Four production-browser cases pass without a development hook: keyboard
entrance-winch completion, reload during a committed span rotation, reload
during the counterweight support lift, and muted portrait touch operation of
the final winch and map. Each retains 100 health and compares its chapter save
after reload, excluding the last-played timestamp. The 540 × 900 portrait
layout has no horizontal overflow.

The loaded bundles match `index-BIUX1LJ8.js`, `game-CVgxettx.js`,
`three-CLZSoYGK.js` and `index-Cl7L-B9a.css`. These release cases report no
browser errors, warnings or failed HTTP responses.

Approximately one-hour human chapter pacing, modern AAA graphics, subjective
music and soundscape quality, and broad browser/device coverage remain
unfinished production requirements.
