# Rendering the enclosed memorial

The memorial gallery previously submitted the exterior palace to its camera
passes even when solid walls hid the only exit. The air-bell camera could also
capture a reflection of the distant ocean. The renderer now omits exterior color
and contact-shading draws when the entrance is fully hidden, while retaining the
complete exterior shadow-caster set. This reduces rendering work without changing
the tested images or gameplay geometry.

## Visibility and lighting

The visibility footprint comes from the union of the gallery's actual room
rectangles. Its only exterior aperture is the eastern end of the entrance
passage. Projecting wall endpoints onto that aperture partitions it into
intervals; testing those intervals retains even narrow views around a turn. A
35 cm guard around the camera keeps corner shading conservative. Internal gate
positions, floor steps and bronze skirts do not restrict this test, so they can
only cause extra exterior drawing rather than incorrectly hide the outside.
The check applies only when the camera is inside the gallery's three-dimensional
volume. The surface courtyard and open entrance retain the original render.

Culling uses the live scene graph for each draw. The gallery, explorer, ambient
particles, clipped ocean and every light remain available. The clipped ocean
costs one small surface draw but preserves its subpixel joins with the gallery
walls; its hidden reflection capture is suppressed. No textures, material
resolution, light intensities, shadow-map quality or post effects are reduced.

Three builds its camera render list before drawing the shadow maps. The renderer
briefly restores the exterior only during a shadow update, preserving the
palace's influence on sunlight. It restores all changed visibility and the shadow
callback after the frame, including if drawing throws. Physics, camera collision,
audio source selection and save operations therefore see the original scene
state. Other chapters do not instantiate this gallery visibility pass.

## Matched rendered views

The final comparison used an isolated Chromium 148 browser with ANGLE Vulkan on
the Radeon 780M at 1280 × 720. Culling was alternately disabled and enabled while
camera position, quality, animation time and world state stayed fixed. Each state
was warmed before reading the pixels. All **28 comparisons had zero changed
pixels**, and every shader linked. Exterior shadow draw counts were unchanged.

The comparisons include the four main gallery views, both sides of a 1 mm
entrance-corner alignment, several turning-passage positions, and the courtyard
above the interior, in both High and Performance modes. Synchronous pixel reads
emitted four driver readback-stall warnings; there were no JavaScript errors or
failed assets. Those readbacks are verification overhead, not part of gameplay.

| View and quality | Draw calls before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| High entrance | 784 → 784 | 1,439,774 → 1,439,774 |
| High air bell | 2,270 → 384 | 3,695,614 → 656,682 |
| High colonnade | 1,586 → 395 | 2,650,352 → 673,316 |
| High memorial | 1,467 → 370 | 2,473,850 → 699,856 |
| Performance entrance | 242 → 242 | 434,452 → 434,452 |
| Performance air bell | 687 → 53 | 1,009,400 → 76,792 |
| Performance colonnade | 661 → 46 | 1,007,640 → 76,004 |
| Performance memorial | 593 → 28 | 918,092 → 74,672 |

These counts include the enabled rendering passes. In the warmed High air-bell
view, 662 reflection draws disappear and contact draws fall from 609 to 41,
while all 271 exterior/interior shadow draws remain. Counts differ from the
initial gallery screenshots because this comparison warms the reflection and
camera state before capture. The entrance remains unchanged deliberately.

The [gallery screenshots and playing notes](sunken-gallery.md) remain applicable.
This optimization does not raise texture or model detail and is not evidence of
AAA art or one-hour chapter pacing.

## Automated checks

All **302 tests** pass, and the final production build succeeds with the existing
large Three.js-chunk advisory. New checks cover narrow-corner visibility, the
camera guard, exterior and surface views, retained lights and actors, late scene
objects, hidden effect state, complete shadow casters, error restoration, and
suppressed reflection weights. The existing water/reflection, gallery traversal,
camera, persistence and eight-chapter suites remain green.

The delivered bundles are `index-CVeQz3U6.js`, `game-DG24N-jm.js`,
`three-DhbJ4463.js` and `index-BdgvWVky.css`.

## Hardware frame measurements

The same isolated Radeon 780M browser ran the actual High-quality animation
loop at 1280 × 720 and pixel ratio 1. Each view used four four-second samples
in **original, culled, culled, original** order, with 700 ms settling before
each sample. No synchronous pixel reads or competing test/build jobs ran during
these samples. GPU timer queries reported no disjoint or unfinished samples.

The table shows the range of the two sample means per mode. “Frame callback” is
elapsed time inside the JavaScript frame function, including driver submission;
it is not total CPU utilization. Frame interval also includes presentation pacing.

| View | Frame interval, original → culled (ms) | Frame callback, original → culled (ms) | GPU render, original → culled (ms) |
| --- | ---: | ---: | ---: |
| Entrance | 16.67–17.24 → 16.74–17.09 | 13.22–14.63 → 12.72–14.63 | 11.17–11.18 → 11.02–11.19 |
| Bell | 18.70–18.98 → 16.67 | 18.11–18.38 → 8.33–8.86 | 13.13–13.72 → 10.55 |
| Colonnade | 17.00–17.02 → 16.67 | 15.43–15.48 → 7.01–7.51 | 11.13–11.25 → 8.38–8.42 |
| Memorial | 16.74–17.26 → 16.66 | 14.37–15.38 → 6.45–8.17 | 10.74–10.80 → 8.12–8.21 |

The three enclosed views consistently reduced GPU and frame-callback time.
The air bell moved from roughly 18.7–19.0 ms per frame to 16.7 ms, with its
95th-percentile interval falling from 24.3–25.0 ms to 16.9–17.0 ms. The other
interiors already approached the browser’s approximately 60 Hz presentation
limit; their main gains are reduced work and steadier frame delivery. The
entrance control has unchanged draw work and overlapping timing ranges.

The run recorded 3,761 frame callbacks. These are short samples on one
Radeon 780M/ANGLE Vulkan system, not minimum-device specifications or a campaign
frame-rate guarantee. See [the earlier hardware baseline](hardware-rendering.md)
for the eight-chapter context.

To repeat a development measurement in disposable progress, toggle
`game.cinematic.galleryVisibility.enabled`, position the camera with the
[gallery view helper](../scripts/verify-gallery-browser.js), resume the normal
animation loop, and use [benchmarkFrames](../scripts/benchmark-frames-browser.js).
Keep quality, viewport and view fixed, alternate both modes, and record GPU timer
validity along with frame intervals.

## Route and chapter-state checks

The complete assisted route was repeated before and after 1.8 m drainage, this
time rendering at sampled points along the route. Both runs opened the two
gates, recovered the memorial record, visited all nine interior sections and
returned to the well at 100 health. Across 163 renders, 133 used interior culling
and 30 retained the exterior. Every render restored the original object
visibility and shadow callback before the next movement step.

Switching to the crystal chapter left no gallery visibility pass, retained the
renderer’s original shadow callback and linked the new chapter's shaders.
These checks used real chapter collision and movement with supplied waypoints;
they do not establish blind human difficulty or playthrough duration.

The final High production build accepted native descent, swimming and E at the
emergency wheel. Pausing saved the opened gates; reload returned to the second
air bell and retained chapter state, 93 health, settings and exactly
13.84599999999996 active seconds. A recovered-record fixture also displayed the
correct journal entry. The production hook was absent, assets loaded and console
checks reported no errors or warnings. Startup was deliberately unfocused to
pause immediately during the reload comparison. Verification used fresh browser
contexts that were closed afterward.
