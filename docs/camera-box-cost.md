# Skipping unrelated camera boxes

Camera visibility now rejects a prop box early when the complete camera ray
lies outside one of its padded coordinate ranges. Every possible intersection
still reaches the existing exact slab or primitive test. The face coordinates
match that test, retaining grazing rays at the padding boundary.

The check applies both to captured world props and to the gallery's furniture
and moving gate boxes. Gate bounds remain live during retraction. The change
does not retain a scene snapshot, alter the camera candidates or reduce the
posed-body samples.

The entrance-bank timing observation is investigated separately from redundant
search work. Replaying its exact player and camera positions records 194 scene
queries, a comfortable arm, no recovery offset and a 24.5 ms instrumented camera
update. The preceding full route recorded 1,044.9 ms at that position. The spike
does not reproduce in this diagnostic; neither observation establishes consumer
frame rates.

Across the diagnostic's 365 updates, the instrumented median is 19.7 ms and the
95th percentile is 95.1 ms. Its largest camera update is the first descent step,
739.2 ms. The profile includes expensive High captures, so whole-run timing
also contains rendering, shader compilation and readback costs. Repeated box
tests are the largest identified JavaScript cost within the camera queries.

## Verification

All 151 selected tests across twenty-three files pass, together with three
CPU-guard checks and the production build. The existing large-bundle advisory
remains.

Two independent full-box reference checks cover 8,442 camera rays. They include
rotated and nonuniformly scaled props, moving and hidden parents, ignored
parents, several camera radii, exact padded boundaries and offsets of
0.0000000001 m on either side. Gallery checks retain occlusion while a gate
retracts, then reveal the cleared passage. Existing posed-body, lens-sweep,
wheel contact, swimming, saved-look, water-arrival and campaign checks pass.

A controlled counter wraps the exact box-test function in separate published
and revised runs of the wheel-departure, entrance-turn and memorial-return
regressions. Across those three fixtures and their 360 motion updates, calls
drop from 37,724,799 to 383,315, a 98.98% reduction. Both variants pass the same
framing assertions; scene-query peaks remain 559, 377 and 746. This measures
avoided box tests, rather than device frame rates.

The current assisted route covers 185.88 m over 4,496 updates at health 100,
with legal body and lens positions, opacity 1, minimum air 15.48 seconds and a
maximum angular step of 0.05 radians. Each of its first 365 camera records
matches the diagnostic's player position, camera position, recovery, opacity
and arm length exactly. All 149 saved route trace samples match the preceding
full route exactly. Three independent posed-surface grids retain zero blockers
among 114 descent, 163 wheel-turn and 212 opened-wheel body rays. This pass
records 41 route poses without rendering continuous gameplay or updating
enemies.

Timing remains variable: the current entrance-bank update records 35.7 ms,
and the route peaks at 769.5 ms while leaving the second air bell at update
2,405. Its camera remains legal and opaque. These runs have different capture
and profiling conditions and do not establish a timing improvement. The
controlled box-test counts are the evidence for reduced work.

Production touch and keyboard checks start from a prepared second-bell save,
dive, rise and restore the air meter to 32 seconds at health 100. Restoring the
initial store and reloading the final store pass two complete-store comparisons,
apart from the designed initial checkpoint position and last-played timestamp.
The current compiled assets load without recorded application or resource
errors. All four native captures are reviewed. These checks use Low quality
and a 360 × 600 viewport at half pixel density (180 × 300 captures); they do
not establish High input performance. The browser and preview server close.

## Remaining work

Continuous performance and consumer-device acceptance remain open. The broader
visual target still includes coarse bronze patina, plain floors and ceilings,
repeated structures, sparse surroundings and wider contact review. Listening
acceptance also remains unfinished; verification audio is muted.

Existing [asset attribution](asset-credits.md) applies. Verification runs within
the locked shared 5/16 CPU allowance, with at most two test workers and one
browser. Private profiles, saves and logs remain inside the ignored local
staging directory.
