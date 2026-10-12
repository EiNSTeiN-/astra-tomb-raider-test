# Blind bays and inner masonry for the crystal archive

The eight archive chambers in The Night Below now have different blind-bay
profiles and geometric inlays. Shallow dressed courses also break up their
plain inner wall faces. The rear panels carry smaller matching diagrams,
connecting each chamber's interior to its exterior and vaulted crown.

| Chamber | Blind bay and inlay |
| --- | --- |
| Guide-light porch | Stepped head, two uprights and a rising chevron |
| Descending apsis | Rounded hood and three descending chevrons |
| Mirrored nave | Pointed head and opposed branching lines |
| Ascending vault | Tiered head and four rising bands |
| Violet fan | Splayed head and five spreading rays |
| Broken archive | Faceted head and interrupted angular lines |
| Heart crossing | Curved pointed head and two linked loops |
| Prism lantern | Octagonal bay, eight-sided border and spokes |

These are sealed decorative recesses in the existing walls. Their backing,
footings and movement envelope remain in place. The crystal gates use sinking
panels; a hinged design retains its clear side-wall pockets. Inlay bars embed
in their backing panels, and the inner courses embed in the wall core. The
existing terrain, tuning hardware, gate drive, field tasks, lights, sound and
save schema are unchanged.

The new profiles and diagrams are original geometry in
[crystal-wall-art.js](../src/crystal-wall-art.js). Their integration and inner
courses are in [chamber-walls.js](../src/chamber-walls.js). They reuse existing
credited masonry, bronze and mineral-inlay materials. No texture, dependency,
external asset or recording is added.

## Geometry and gate checks

An isolated comparison against the published gate builders covers all 69
gates. The other seven chapters retain byte-identical geometry attributes,
indices, transforms and material names. Texture requests match in every
chapter. All delivered gate attributes remain finite.

The 24 revised crystal walls retain their original 0.85 m movement half-width.
Checks transform 737,592 delivered vertex records back to their individual
wall coordinates. Their depth ranges from -0.571946 m to +0.743495 m, within
that envelope; their horizontal and vertical limits also pass.

The complete crystal gate construction retains 226 meshes while increasing
from 192,808 to 339,436 source triangles and from 17,983,584 to 32,059,872
geometry-array bytes. Those totals include the existing drives, panels and
vaults. Extra geometric detail has a rendering and memory cost; unchanged
batch counts do not establish unchanged GPU cost or consumer frame rate.

The stepped bay heads split the masonry courses at their horizontal ledges.
Without those splits, an independent exterior ray reaches the deep backing
outside the intended outline instead of the finished stone face. A retained
regression detects that defect in the control and checks six outside-tier rays
across both stepped designs and all three wall orientations after the repair.

All nineteen selected gate and vault regressions pass in 86.53 seconds.
They cover all 69 standing center passages, 180 sealed regional walls and
their full-width footings, deep backing beside opened leaves, moving camera
bounds, restored field saves, and the crystal vaults' closed stone, bearings,
body rays and locked/restored thresholds.

The normal-controller route check completes all 49 local instrument legs over
358.634 metres and all 33 reversible physical wheel adjustments. Its 57 views
retain legal grounded positions, full health, finite HDR and linked shaders.
These are prepared local routes with enemy simulation disabled, rather than
uninterrupted campaign traversal. The production build passes in 4.11 seconds
with the existing large-chunk advisory.

Native checks exercise the built game with keyboard/High at 1280×800 and
touch/Low at 540×900. Both solve the ascending objective `[1, 4, 7, 10]` in
twelve turns and advance from objective 3 to objective 4. Movement, look,
crouching, jump/landing and map inputs pass. An earned tuning reload and two
further gameplay-store reloads preserve every saved field apart from
`lastPlayed` timestamps. Neither layout overflows. The loaded JavaScript/CSS
filenames and delivered explorer model hash match the current production
files, with no development game hook or application/HTTP error. The known
GPU readback diagnostic is recorded separately from errors and warnings.

## Rendering survey

The final survey covers 35 paired views: sixteen fixed inner/exterior wall
observers and eight normal follow-camera views at 1280×800 High, eight
follow-camera views at 540×900 Low, and three inner wall views at 1280×800
Medium. Player position, camera, selected look and simulation time match in
each pair. All High/Medium HDR inputs are finite, Low uses RGBA8, and shader
links and WebGL error checks pass. No application errors or warnings occur.

All sixteen validated observers frame nine wall probes with clear cavern and
registered-surface sight rays. Each High/Medium capture asserts that its camera
matches the selected observer. These fixed views inspect construction; the
normal follow-camera and native controls cover gameplay framing.

The control builds the published gate construction alongside the current
gates, alternating visibility at the same camera and time. Field progress is
prepared, enemy simulation is disabled and audio is muted. Water reflections
and shadows refresh for both images. These are controlled builder comparisons
inside the current environment, rather than photographs of an earlier complete
application.

The paired views retain the same rendering call counts while adding between
zero and 554,440 submitted triangles across the sampled rendering passes.
Those counters include reflections, shadows and other visible chambers; they
do not establish consumer hardware frame rate.

On chapter change, all 234 owned gate geometries and eight materials dispose
exactly once. Each browser and temporary server closes when its check ends.

## Captures

All 141 final captures are reviewed on thirteen contact sheets: seventy
material/construction comparisons, 57 local-route views and fourteen native
keyboard/touch views. All eight exterior treatments, selected close inner
views, the portrait follow view and both native landing views are also
inspected at full size. No new placement or rendering issue appears in these
sampled wall views. This review does not cover continuous campaign traversal.

The fourteen selected WebP files preserve their source pixels and dimensions
exactly through checked lossless conversion.

The exterior views below show the eight blind-bay treatments. The controlled
references use the published gate builders in the same current environment,
as described above. Close inner views inspect coursing and smaller diagrams;
the portrait view uses the normal follow camera.

| Chamber | Exterior wall view |
| --- | --- |
| Guide-light porch | [Stepped head and uprights](images/crystal-wall-detail/porch.webp) |
| Descending apsis | [Rounded hoods and chevrons](images/crystal-wall-detail/apsis.webp) · [Control](images/crystal-wall-detail/apsis-before.webp) |
| Mirrored nave | [Pointed heads and opposed lines](images/crystal-wall-detail/nave.webp) |
| Ascending vault | [Tiered heads and rising bands](images/crystal-wall-detail/ascending.webp) |
| Violet fan | [Splayed heads and rays](images/crystal-wall-detail/fan.webp) |
| Broken archive | [Faceted heads and interrupted lines](images/crystal-wall-detail/broken.webp) |
| Heart crossing | [Curved heads and linked loops](images/crystal-wall-detail/crossing.webp) |
| Prism lantern | [Octagonal bays and spokes](images/crystal-wall-detail/lantern.webp) |

The guide-light porch's inner wall is shown
[with courses and diagrams](images/crystal-wall-detail/interior.webp) and
[in the control](images/crystal-wall-detail/interior-before.webp).
The [prism lantern at portrait Low](images/crystal-wall-detail/portrait.webp)
shows the wall detail behind its instruments in the normal camera.
Production controls are shown after landing with
[keyboard at High](images/crystal-wall-detail/native-keyboard.webp) and
[touch at portrait Low](images/crystal-wall-detail/native-touch.webp).

## Scope

This addresses the repeated recess shapes and plain inner masonry in the
archive chambers. Broader sparse cavern paths, continuous camera movement and
full eight-chapter visual acceptance remain under review. These checks do
not establish human campaign traversal, subjective audio quality, consumer
hardware performance or AAA graphics.

Verification uses the shared CPU launcher, locked to nine of sixteen available
CPUs (56.25%), with one browser and one worker at a time. Raw captures, seeded
stores, comparison builders and logs remain in ignored local staging.
A final process audit finds no remaining owned jobs, both verification ports
are closed, and transient runtime files are absent. Retained staging files are
verification evidence and resume notes rather than active background work.
