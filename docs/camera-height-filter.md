# Rejecting camera props on other floors

Camera queries now reject vertically disjoint static props before adding them
to the candidate set. Rooms above and below a short body ray share horizontal
index cells; collecting their props only to reject them afterward repeats
unnecessary set insertion and iteration. The early check uses the same padded
face arithmetic as the existing exact box test, retaining grazing contacts.

The existing index, recovery positions, posed-body samples, moving-prop updates
and visibility checks remain in use. No new index storage or query cache is
introduced. Moving gates continue to use their current transformed bounds.

## Bell-departure investigation

VA-260 recorded a 769.5 ms camera update while leaving the second air bell at
route update 2,405. Replaying the same route reaches the exact pre-dive state.
The spike does not reproduce: the instrumented update takes 24.8 ms, and five
restored-state repetitions take about 9–11 ms. The update makes 874 scene
queries and 2,102 occupancy checks. These are diagnostic observations under
the shared CPU allowance, rather than evidence of continuous frame rates.

A controlled comparison restores the delivered explorer pose and camera state
before each update. Fourteen repetitions of the published and revised query
code retain the exact resulting player, camera, orientation, target, recovery,
opacity and swim-blend state. The same 874 scene queries supply 22,452 prop
candidates before the change and 10,178 afterward, a **54.7% reduction**. This
counts candidate-set entries across queries, not unique objects or exact box
tests. The largest individual candidate set drops from 42 to 21.

At this tide-chapter fixture, both versions retain 325 index cells, 25,224 stored
static references, 22,120 unique static surfaces and 76 dynamic surfaces.
Separate warmed timing samples vary substantially and do not establish a timing
improvement. The reduced candidate work is the measured benefit.

## Verification

All 107 selected checks across sixteen files pass, including camera recovery,
posed explorer and guardian visibility, roof/terrain clearance, swimming,
gallery lining, campaign state and sound behavior. Three CPU-guard checks and
the production build also pass. The existing large-bundle advisory remains.

The stacked-floor regression compares 528 local, padded-boundary and vertical
queries with an independent full-box reference. Its local-query bound detects
the published unfiltered implementation. The existing reference checks retain
all 8,442 world and gallery ray results, including transformed props, hidden
and ignored parents, exact padding boundaries and live moving gates.

The gallery shell regression now inspects the delivered paving and coffers
alongside their backing. Floors must lie within the 32 mm recessed bed and
ceilings within the 120 mm ceiling bed, entirely outside nominal swim space
within floating-point tolerance. Both lens-sweep directions still block, and
the sounding-well aperture remains open. This replaces the obsolete assumption
that the backing itself remains on every nominal horizontal plane after the
[lining revision](gallery-lining.md).

The assisted gallery loop covers 185.88 m over 4,496 fixed-step updates at
health 100, with legal body and lens positions, opacity 1, minimum air 15.48
seconds and maximum angular step 0.05 radians. All 365 early update records and
149 full-route trajectory samples match the preceding route exactly. Three
independent posed-body grids retain zero blockers among 114 descent, 163
wheel-turn and 212 opened-wheel body rays. Six High captures at 1280 × 800 are
reviewed, with linked programs and finite half-float buffers. The route records
41 poses; it does not render continuous gameplay or advance enemies.

This loop still records a 491 ms camera update at frame 1,597, under the
colonnade's upper obstruction, with a legal lens and no recovery offset.
Different capture, profiling and scheduling conditions prevent interpreting
the changed peak as a timing improvement. Continuous performance remains open.

Production touch and keyboard checks start from a prepared second-bell save,
dive, rise and recover the air meter to 32 seconds at health 100. Initial-store
restoration and final-store reload pass two complete-store comparisons, apart
from the designed initial checkpoint position and last-played timestamp. The
current compiled assets load without recorded application or resource errors.
All four release captures are reviewed. These use Low quality at a 360 × 600
viewport and half pixel density (180 × 300 images); they do not establish High
input performance. All verification browsers and preview servers close, with
their ports confirmed closed afterward.

## Remaining work

VA-260 remains open for continuous timing and consumer-device evaluation. The
earlier spike is not established as fixed. The wider visual target includes
material repetition, shared structures, sparse surroundings and continuous
body/geometry contact review across all eight worlds. Subjective listening and
device acceptance also remain open; these verification sessions are muted.

Existing [asset attribution](asset-credits.md) applies; this change adds no
assets or dependencies. Verification uses the locked shared 5/16 CPU allowance,
at most two test workers and one browser, with expensive checks run sequentially.
Private profiles, saves, captures and logs stay in the ignored local staging
directory. Verification browsers and preview servers are closed after use.
