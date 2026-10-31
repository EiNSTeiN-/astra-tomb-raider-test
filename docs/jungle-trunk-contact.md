# Physical jungle trunks

The jungle forest previously rendered scanned trunks without registering their
physical surfaces. Its planting rules already keep roots outside the old
walking grid. Trunk contact is a prerequisite for opening more of the
surrounding visible forest floor, and gives sight, shot and environmental
occlusion queries a physical surface matching the visible wood.

Interior jungle trees now use the delivered trunk triangles for body and lens
clearance, sight, shot cover and foot support. A rising jump stops beneath an
overhead fork. The separate leaves and fine-branch mesh remain soft scenery.
The outer forest remains scenery beyond the current walking domain.

## Geometry and persistence

Both island-tree specimens deliver identical trunk positions and triangle
indices at all three detail settings. Two shared CPU kernels retain the
authored tree transforms independently of the renderer's packed instance
buffers. Changing detail, culling a patch or disposing its rendering buffers
cannot move the physical trunk. Chapter construction clears the outgoing
collision state.

Ray queries traverse the existing triangle index along their segment rather
than testing every triangle of each candidate scan. Independent raycasts cover
both delivered trunks at different rotations, scales and world offsets, along
with vertical rays, grid seams and diagonal cell crossings.

Support selection distinguishes a low root or fork from a higher overhead
branch. Asynchronous arrival restoration waits for the forest geometry and
preserves a valid saved height. It excludes the ordinary 20 cm stepping
allowance when selecting a saved floor: an initial regression caught that
allowance incrementally raising the explorer on repeated root reloads.

## Verification

All 27 focused trunk, rock, camera-sight and aiming tests pass. They include
864 independent delivered-trunk ray comparisons, immutable detail/culling
checks, actual-trunk body and cover cases, a layered-fork jump/landing case,
saved-root recovery and repeated restoration. The fork is a controlled geometry
fixture; it does not establish traversal across every branch in the forest.

A broader campaign sweep was stopped after 1,054 reported passes while its
slow wind-camera surveys were still running. It is recorded as incomplete,
not a passing full-suite run.

The live jungle builds 752 interior trunk instances using two shared kernels.
Of 63,264 sampled positions that intersect trunk geometry, none were legal
standing positions under the preceding walking rules. This supports the
existing planting separation at those samples; it is not an exhaustive
continuous path check or evidence that the walking boundary has been repaired.

A separate integration regression samples 51,978 eligible standing positions
across the existing grid, including 2,079 cell centers. Every sampled path
center remains clear. One edge sample now stops where a delivered bark vertex
enters the configured standing collision envelope. A direct vertex inspection
confirms that wood witness; the initial expectation of zero new edge contacts
was corrected rather than suppressing the physical overhang.

Four delivered instance rays agree with independent rendered-mesh raycasts.
The sight and shot queries reject those segments; in two cases other cover
already blocks the shot earlier. Four landscape contexts and one portrait
context are reviewed. The helper
starts with the Performance renderer and changes forest detail ranges for the
landscape views without reapplying the complete renderer preset. These are
geometry and framing observations, rather than verification of the High
preset. All five positions remain legal,
and 240,475 posed explorer vertices clear independent terrain triangles at
the 15 mm inspection tolerance, with minimum gaps approximately 6 mm. These
are terrain observations, not whole-body clearance against every nearby solid.
Shaders link and sampled HDR output is finite. The following desert chapter
clears the outgoing jungle collision state.

The production build passes with its existing bundle-size advisory. Built
keyboard/landscape and portrait-touch cases use the actual Performance preset.
Their forward moves cover 2.90 m and 3.60 m respectively, followed by crouch and
jump inputs and reviewed resting views. All four complete-store reload
comparisons pass, excluding only play timestamps; all eight release captures
are reviewed. These prepared camp cases mark guardians defeated to isolate
movement and persistence. They do not verify combat or off-grid root traversal.
Served bundle names match the build, with no application error or warning.

Checks use the shared locked five-of-sixteen CPU allowance, two test workers
at most and one browser at a time. The owned preview, browser and worker close
after the development checks. Muted rendering and geometric occlusion checks
do not establish subjective sound quality or device performance.

## Scope

This work adds physical trunks. The recorded jungle flank still reaches the
old walking-grid boundary near x = 374.05 m, z = 49 m while grass continues
beyond it; VA-161 remains open. Extending that ground still needs a coherent
exterior boundary, protected objective access, actual movement and persistence
checks. Continuous whole-body contact, broader world composition and subjective
audio/device acceptance also remain under review.
