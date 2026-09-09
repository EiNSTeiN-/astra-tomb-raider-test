# Explorer locomotion

The later [stride-alignment update](explorer-stride.md) reduces horizontal
sliding through bounded stride warping and calibrated playback, and brings
crouched recovery steps beneath the hips. The measurements below record the
earlier running-flight and blocked-movement correction.

Holding movement against a solid wall now settles Vesper into the idle animation.
The controller reports actual horizontal travel after resolving collisions, and
locomotion uses that measurement instead of assuming that requested movement
succeeded. Moving away resumes the appropriate walking or running clip. Scripted
traversal supplies its own motion, and counterweight pulling retains its reversed
walking cycle.

The offline character converter also preserves the source running clip’s brief
airborne phase. Previously, it lowered the hips until a shoe touched the floor in
every frame, including frames where both donor feet were in the air. The converter
now measures the animated source sole height, scales positive running clearance
to the fitted skeleton, and retains that lift when correcting the delivered boots.
The existing runtime terrain fitting still follows slopes and decks.

The delivery remains 46,312 triangles and 8,075,456 bytes. A comparison against the
preceding published GLB found changes in only 20 vertical values of the Run hip
translation track. All other 264 accessors and all eight embedded images matched,
including geometry, skinning, other animation tracks and rotation keys. This adds
no runtime meshes, materials, textures or audio assets. Character and animation
attribution remains in [asset credits](asset-credits.md).

A byte comparison also confirmed identical GLB metadata and identical bytes
outside those Run hip values. The delivery SHA-256 is
`dfc6b1b8a6dfad6bfa12ff17a900fec16912e2b062d121b2686405eb81398683`.

## Verification

Sampling the actual skinned shoes at 120 evenly spaced points per animation gave:

| Clip | Lowest sole height | Peak height of the lower sole | Samples below 1 cm |
| ---- | -----------------: | ----------------------------: | -----------------: |
| Idle |        −0.00004 cm |                    0.00001 cm |          120 / 120 |
| Walk |           −0.21 cm |                       0.35 cm |          120 / 120 |
| Run  |           −0.47 cm |                       8.57 cm |           81 / 120 |

These are baked animation measurements before runtime terrain fitting. Small
negative values occur between the converter’s 30 Hz keys. The regression test
requires both running ground contact and a bounded airborne phase, so forcing
every running frame back to the floor fails it. Horizontal hip translation must
remain fixed in every clip.

Delivery-mesh tests also cover transition from moving to blocked idle, restart,
counterweight pulling, slopes, bridge support, footstep cadence, swimming,
crouching, ropes, cables, the causeway wheel, torch and cleft grips. The controller
test drives into a solid wall, verifies zero resolved speed while the requested
speed remains 6 or 10 m/s, and resumes travel along the wall. All 22 authored
traversal routes remain covered by the existing integration checks.

A browser run from the ordinary desert spawn used native keyboard movement for
walking/jogging, sprinting, stopping and crouching. During the recorded jog and
sprint, the lower sole rose to 9.10 and 8.10 cm above the terrain during flight;
the minimum sampled clearances were +0.53 cm in both phases. A separate wall check
used an assisted starting position beside an existing pier, then native W and
Shift input. It measured zero travel and the Idle state despite a requested
10 m/s. Native S resumed Run at 6 m/s; a held Space jumped and landed at 100 health.
Neither check reported console errors or warnings.

The release reload check also exposed an existing timestamp defect: save
normalization replaced `createdAt` with the current time. Valid creation times
now survive reload and export/import. Older saves and malformed timestamps receive
a current default; per-chapter `lastPlayed` still updates when a chapter opens.

All 377 automated tests and the production build passed. The build retains the
existing large-chunk advisory. In the High-quality production browser, native W
moved 9.02 m. A paused reload restored the exact position, 100 health, 11.959 active
seconds, chapter record, settings and original creation timestamp; only the
chapter’s deliberate `lastPlayed` refresh was excluded from the comparison. The
browser exposed no development hook, and the delivered GLB matched its expected
byte count and SHA-256 with HTTP 200. No assets failed and no console warnings or
errors were recorded. The checked release loaded `index-Bv0WtZgs.js`,
`game-DgdjtBmm.js` and `three-BO-Q2dVM.js`.

## Limits

This corrects locomotion selection and the missing running flight phase. It does
not solve horizontal foot sliding: the delivered clips still have a mismatch
between their stride and the controller’s travel speeds. A trial of short foot
holds was rejected after it increased sliding during release and produced a
bridge reach error; that code is not included. Physics speeds, jump arcs, obstacle
bounds and saved positions are unchanged by the animation correction.

The native checks cover a short desert route and an assisted wall fixture, not
full human chapter playthroughs. These results do not establish AAA animation or
graphics, approximately one-hour chapter pacing, subjective audio quality, or
supported-device frame rates.
