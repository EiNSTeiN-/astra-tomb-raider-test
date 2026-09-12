# Production status

The original request remains the acceptance target: a Tomb Raider-inspired adventure that runs entirely in a browser, with eight distinct levels lasting approximately an hour each, local-storage persistence, and graphics comparable to a AAA title.

The user also added distance-sensitive environmental audio and quiet background music tailored to each level and objective. That requirement is tracked below alongside the original scope.

## Requirement audit

| Requirement                                   | Evidence in this workspace                                                                                                                                                                                                                                          | Status                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Entirely playable in a browser                | Vite application with bundled Three.js; actual browser checks exercised movement, camps, mechanisms, collectibles, and chapter completion. No backend services are required.                                                                                        | Implemented; broader browser/device coverage still needed                            |
| Tomb Raider-inspired exploration and action   | Third-person camera, directional movement, sprinting, jumping, ledge mantling, guardian combat, ancient mechanisms, side discoveries, camps, and a campaign journal                                                                                                 | Implemented prototype; traversal and encounter design need further depth             |
| Eight levels                                  | Eight deterministic, independently saved worlds and eight relic completion states; browser completion checks reached the campaign ending                                                                                                                            | Implemented                                                                          |
| Distinct atmospheres, goals, and layouts      | Eight map topologies and color/light palettes; chapter-specific architectural landmarks; eight different puzzle disciplines; 69 objective configurations, 207 ordered field actions, physical gates, reservoir drainage, cooled lava, and 96 distinct journal pages | Implemented foundation; significant repeated structural geometry remains             |
| Approximately one hour per level              | No full-length, blind human playthrough data has been collected. Solver and accelerated integration checks do not establish duration.                                                                                                                               | **Not verified; content and pacing are still below a confirmed eight-hour campaign** |
| Local-storage persistence                     | Tests cover save/reload round trips, independent chapter progress, corrupted/unavailable storage, and import/export. Browser test restored a solved objective after reload.                                                                                         | Implemented and tested                                                               |
| Graphics comparable to a modern AAA title     | Generated cinematic menu art, PBR textures, scanned and optimized environment meshes, rigged character animation, shadows, fog, water, particles, and chapter landmarks                                                                                             | **Not met; real-time environments remain prototype quality**                         |
| Distance-sensitive soundscape                 | Locally bundled birds, fire, water, and drips; HRTF emitters; linear distance falloff; occlusion filtering; 12-voice cap; visible sound landmarks                                                                                                                   | Implemented and behaviorally tested; broader listening/device evaluation remains     |
| Quiet music tailored to levels and objectives | Eight original adaptive scores; per-objective voicing and traversal accents; restrained danger pulse; music/ambience ducking; independent persisted mix controls                                                                                                    | Implemented and signal-tested; subjective music and mix review remains               |

## Verification performed

- The Hanging Garden's [nearby depth drawing](hanging-garden-rendering.md)
  reduces repeated shading of hidden stone and timber. Twenty-one camera/quality
  comparisons retain identical pixels, including moving spans and lifts.
  The measured close view uses 13.2% less High and 21.9% less Low GPU rendering
  time with simulation held still; distant views add no depth submissions.
  All 570 tests, the build, the complete assisted route at 100 health and four
  production keyboard/touch/reload cases pass. Audio and cleanup checks also
  pass. The guide records measurement limits;
  chapter pacing, modern AAA graphics and listening acceptance remain unfinished.

- The Hanging Garden now has [coursed piers, stone arches, timber trusses,
  mounted winches and fitted rope rails](hanging-garden-construction.md).
  Camera obstruction covers the rebuilt shafts and arches, and the old blade
  trap beneath the gallery is removed. All 569 tests, the build, the complete
  assisted route at 100 health and nine production input/reload cases pass.
  The guide records matching browser views,
  positional audio, resource cleanup and approximately 5.0 ms High / 4.6 ms Low
  of additional GPU time in the measured close view. Chapter pacing, modern
  AAA graphics and subjective listening acceptance remain unfinished.

- **The Verdant Veil** now has [the Hanging Garden](hanging-garden.md): two
  rotating spans, three broken gallery jumps, a counterweight lift and a raised
  return walk joining the sixth mission's three winches. Moving support,
  handwheel contact, fixed-pier clearance, a live map and saved landing recovery
  are implemented. All 566 tests, the build, the full assisted route at 100
  health and eleven production keyboard/touch/reload cases pass. Positioned
  machinery, distance falloff, three graphics qualities and resource cleanup
  are verified. The guide records actual views and measurement limits; AAA
  graphics, one-hour human chapter pacing and broader listening/device
  acceptance remain unfinished requirements.

- **A Silence of Snow** now has [reconstructed fir sprigs and continuous distant trunks](fir-sprigs.md).
  Shared cutout/normal atlases replace enlarged needle strips. All 557 tests,
  the build, the full assisted wind-house route and six production
  keyboard/touch/movement/reload cases pass. Three graphics qualities,
  positioned audio and resource cleanup pass. The fir delivery is about
  16 MB smaller; the bounded Radeon 780M comparison adds about 1.42 ms on High
  and 0.87 ms on Low. Matched browser images and measurement limits are recorded
  in the guide. AAA graphics, human pacing and broader audio/device acceptance
  remain unfinished requirements.

- **A Silence of Snow** now has [uneven snow shoulders, exposed rock and snow-dusted boulders](snow-banks.md).
  All walking cells, monastery footings, ice edges and moving structure
  foundations retain their previous heights. All 554 tests, the build, assisted
  wind-house/frozen-stair routes and five production input/map/reload cases pass.
  All 109 placed rocks pass ground-contact and clearance checks; three graphics
  qualities, positioned audio and resource cleanup also pass. The guide records
  matched views, memory additions and a bounded Radeon 780M terrain comparison.
  Graphics, human chapter pacing, subjective listening and broad device
  acceptance remain unfinished requirements.

- **A Silence of Snow** now has [irregular alpine ranges and a clearer objective panel](alpine-range.md).
  Two connected ridges, projected rock normals, snow shelves and altitude haze
  replace the repeating peaks. Shared background depth keeps both silhouettes
  visible beyond the gameplay camera. All 551 tests, the build, four depth
  comparisons, the full assisted wind-house route and four production
  keyboard/touch/map/reload cases pass. Positional audio and cleanup pass.
  A bounded Radeon 780M comparison adds about 1.09 ms on High and 1.48 ms on Low.
  The guide records actual views, memory cost, mobile notification placement
  and the remaining graphics, human pacing, listening and device requirements.

- **A Silence of Snow** now has [shutter wheel hand contact and roof clearance](shutter-contact.md).
  Vesper aligns, reaches, grips, turns and releases each wheel; a ratchet holds
  every saved catch. Rising jumps stop beneath the six windbreak roofs.
  All 551 tests and the build pass, including delivered-mesh hand measurements
  and roof checks. The complete assisted wind-walk and return route passes at
  full health, with positional audio, three shader qualities and resource
  cleanup checked. Twelve production keyboard/touch/reload scenarios also pass.
  The guide records the evidence and remaining graphics, human pacing,
  listening and device limitations.

- **A Silence of Snow** now has [the Room of Wind](shutter-house.md): three
  elevated wind walks, differently placed breaks, sequential shutter controls
  and an eastern return stair. Warning ribbons, bracing, persistent catches,
  fall recovery, a local route map and positioned wind/drive sounds are
  implemented. All 548 tests, the build, a continuous assisted outward/return
  route and nine final production keyboard/touch/reload cases pass. The guide
  records measured attenuation, rendering counts, resource cleanup and recovery
  of older airborne saves. Human chapter pacing, AAA graphics, listening and
  broader device acceptance remain open requirements.

- **The Night Below** now has [irregular limestone banks and fitted mineral beds](cavern-banks.md).
  Shared broken seams, mineral deposits and damp shading vary the floor, vault
  and gallery walls. All 33 mineral-bed rims and 99 loose rocks pass ground
  contact checks. All 542 tests, the build, a complete assisted causeway route
  and seven final production keyboard/touch/reload cases pass. Positioned audio,
  three-quality shader checks and resource cleanup also pass. The guide includes
  matched views, added geometry/memory and a bounded Radeon 780M comparison;
  graphics, human pacing, listening and broad device acceptance remain open.

- **The Night Below** now has [the Echo Causeway](echo-causeway.md) for
  **The echo that returns**: two timed four-stone crossings, three relay
  galleries, a climbing second route and a held return path. Moving support,
  fall recovery, local-storage anchors, positioned resonance, a muted-play
  route map and pause behavior are implemented. All 537 tests, the build, a
  continuous assisted outward/return route and seven production keyboard,
  touch and reload cases pass. The guide records rendering counts, attenuation
  and resource cleanup. Human chapter pacing and modern AAA graphics remain
  unmet acceptance requirements.

- The final chapter now has [uneven nearby rock shelves and darker surface shading](meridian-banks.md).
  Walking heights, observatory foundations, water, objectives and obstacle data
  retain their previous values. Five matched views keep the same rendering
  counts, and all 115 loose stones pass ground-contact and clearance checks.
  All 530 tests, the build, the assisted crane route, orrery recovery and seven
  production keyboard/touch/reload cases pass. The guide records a bounded
  terrain GPU comparison, added attribute/profile memory and the remaining
  graphics, pacing, listening and device limitations.

- The final chapter's [meridian escarpment](meridian-escarpment.md) replaces its
  generic triangular ranges with textured rock shelves and eroded cuts. Five
  matching camera captures preserve the sampled gameplay terrain, water,
  objectives and obstacles. Four depth references, twelve foreground probes,
  oblique clipping, a continuous crane route and seven production input/save
  cases pass. All 527 tests pass. The bounded Radeon 780M comparison adds
  0.716 ms of GPU rendering time on High and 0.817 ms on Low; the notes retain
  the increased geometry memory and limits of those measurements.

- The final chapter now has [an astral spindle crane](astral-crane.md) for
  **The distance between stars**. The sequence connects a loading cradle,
  gallery climb, two different cargo clearances and a broken upper walkway.
  Continuous angle/height saves, positioned drive sounds, pause behavior and
  resource cleanup are checked. All 525 tests pass; an assisted continuous
  route and seven production keyboard/touch/reload cases pass. This extends
  authored traversal and mechanism content without establishing chapter pacing
  or modern AAA visual quality.

- The volcanic chapter now has [a continuous caldera skyline](caldera-rim.md).
  A broader irregular rim and world-space rock projection replace the earlier
  triangular slopes and stretched texture mapping. Background depth rendering
  removes far-plane cutoffs while preserving foreground objects and oblique
  reflection clipping. Four ordinary GPU reference views are pixel-identical;
  twelve foreground probes and four clipping comparisons pass. All 519 tests,
  the build, an assisted railway route and seven production keyboard/touch/save
  cases pass. The guide records the added geometry, GPU cost, audio and cleanup
  checks, plus the remaining graphics, pacing, listening and device limits.

- The volcanic chapter now has [fractured banks, matte ash and small fitted rock fragments](volcanic-banks.md).
  Uneven crests retain all walking and working foundations, water and obstacle
  definitions. Five matched High views add 6–9 calls and 4,440–16,560 submitted
  triangles, with the terrain mesh count unchanged. The guide records a bounded
  GPU material/fragment comparison and its limits. All 519 tests, the build,
  a continuous assisted railway route and seven production keyboard/touch/save
  cases pass. Positioned audio, attenuation, three-quality shader checks and
  chapter resource cleanup also pass. AAA graphics, human pacing and listening
  acceptance remain open requirements.

- The volcanic chapter's seventh field mission now uses [a tempering railway](tempering-cart.md).
  A manually driven cargo cart follows two rail runs joined by a turntable.
  Loading, climbing to the coolant inspection, turning the rails and delivery
  replace its generic transport sequence. Moving passenger support, brakes,
  retrieval, safe save recovery, fitted construction and three positional
  machinery/steam emitters are implemented. All 515 tests, the build, a complete
  assisted route with live hazards, and seven production keyboard/touch/save
  cases pass. The guide includes actual renders, measured attenuation and
  cleanup evidence, and retains the pacing, graphics and listening limitations.

- The rain garden now has [fitted construction artwork](rain-garden-construction.md):
  stone paving, supported beams, timber roof trusses and shingles, a planked
  cargo floor, segmented waterwheel rims and mounted inscriptions. Its grooved
  pulley and cable clear the upper passenger area, and falling water reaches its
  impact pool. All 507 tests and the build pass, along with the continuous
  assisted route, positioned audio, shader/resource checks and final production
  keyboard/touch completion and reload. The guide includes matched captures,
  added rendering costs and the remaining graphics, pacing and listening limits.

- The jungle's third field mission now restores [the rain garden](rain-garden.md).
  Nine turnable channel stones connect a released spring to a water-powered
  cargo lift and upper sanctuary sluice. A stair, irrigation terrace, raised
  blade trap and return route give the existing field actions physical context.
  Channel turns, either lift stop and interrupted journeys persist correctly;
  positioned water and machinery sounds and the lifting score follow the flow.
  All 504 tests, the build, a continuous assisted route with live hazards and
  enemies, and eight production keyboard/touch/reload checks pass. The guide
  includes actual renders and retains the graphics, pacing, listening and
  broader device limitations.

- The desert's sixth field mission now restores [the eastern reflector](eastern-reflector.md).
  Brace its fallen timber back, jump to a rear locking pin, descend the west
  service platforms, haul the mirror upright and cross beneath it. Elevated
  darts, collision, camera obstruction and save recovery follow the structure.
  Three positional machinery emitters and the adaptive lifting score track
  hauling and pause; measured distance falloff and resource cleanup pass.
  All 499 tests, the build, a continuous assisted route with live hazards and
  enemies, and seven production keyboard/touch/reload checks pass. The guide
  retains the graphics, pacing, listening and broader device limitations.

- The tidekeeper's archive now has [rounded, translucent bubble guides](archive-bubbles.md)
  with clear centers, soft rims and source, surface and near-camera fades.
  Rise speed stays consistent across well depths; a regression prevents
  drainage from reshuffling bubbles after a long session. All 494 tests,
  the build and release keyboard/touch recovery and reload checks pass.
  Twenty-six matched views and six GPU cases cover appearance, opacity,
  camera direction and occlusion. Ten assisted archive dives and the memorial
  route pass at full health; positional audio and resource cleanup pass.
  Bubble geometry falls from 36 to two triangles per particle with unchanged
  draw-call counts and no new textures. The guide retains shader, frame-rate,
  graphics, pacing, listening and device limitations.

- The coastal wells now have [natural rock banks beneath their marble courts](coastal-banks.md).
  Separate slab maps and an earlier slope transition remove stretched paving
  from steep banks. Twenty-six matched coastal pairs retain geometry counts;
  seven selected other-chapter views are pixel-identical. The compiled shader
  passes a six-angle material check, and all 12 terrain textures release on
  chapter change. All 491 tests, the build and release keyboard/touch archive
  recovery and reload checks pass. The new maps add an estimated 16 MiB of
  terrain texture memory; sampled GPU time rose 9.9% on High and 17.3% on Low,
  with substantial High timing variation. The guide records the comparison,
  cost and remaining graphics, pacing, listening and device requirements.

- The coastal sluices now have [fitted masonry foundations](sluice-foundations.md)
  beneath all nine gates. Forty-five footings support the walls and wider posts
  exposed by diving and drainage, with matching camera and movement collision.
  All 1,125 sampled contacts meet both physical and rendered terrain; 20 matched
  underwater pairs cover all five full/drained wells on High and Low. All 491
  tests, the build, assisted archive and memorial routes, release keyboard/touch
  recovery and older-save restoration pass. The added stone increased sampled
  High GPU time by 4.8% with the same draw-call count. The guide retains the
  graphics, pacing, listening and broader device limitations.

- The five coastal wells now have [one consistent underwater surface](underwater-surfaces.md).
  The ocean is cut out of higher reservoir footprints, and immersed cameras
  skip exterior reflection captures. Twenty underwater comparisons cover full
  and drained wells; three exterior shoreline views remain pixel-identical.
  All 490 tests and the release build pass. Assisted archive and memorial routes,
  positional bubble audio, and release keyboard/touch recovery and reload checks
  pass at full health. Mean GPU time fell by 7.4% in the sampled High underwater
  view. The guide records the comparison, performance limits and remaining
  architecture, graphics, pacing and listening work.

- Water now uses [curved ripples filtered for viewing distance](water-ripples.md),
  with stronger open seas and calmer enclosed pools. The filtering fixture
  reduced spatial sampling error by 82–93% in its six cases. All 488 tests and
  the release build pass; eight chapter views, frozen-water isolation and
  release keyboard/touch swimming, diving, surfacing and save recovery pass.
  The sampled coastal view increased mean GPU time by 5.2% on High and 3.5% on
  Low. The guide includes comparison images, measurement limits and the
  remaining production requirements.

- High-quality water now [refreshes reflections after camera changes](water-reflections.md)
  and blends their capture edges. Matched coastal views reproduce and remove
  the old sharp boundary across the sea. All 488 tests and the release build
  pass; inspected surfaces in all eight chapters compile, and seven chapter
  transitions release their reflection targets. Release keyboard and portrait
  touch swimming and complete save/reload comparisons pass at full health.
  Faster camera motion can increase capture frequency; the guide records that
  cost and the remaining graphics, pacing and device limitations.

- The coastal chapter’s third field mission now repairs [a physical coral pump](coral-pump.md).
  Install the recovered impeller, then balance intake and bypass pressure for
  steady flow. A central gauge and two smaller valve gauges show the same needle,
  including in portrait play. The repair, both valve configurations and older
  saves are covered by four new tests; all 487 tests and the release build pass.
  An assisted repair and perimeter walk finished at full health. Release keyboard
  and portrait touch repairs and four complete save/reload comparisons pass. Machinery and
  outflow voices follow the pump, pause quietly and pass midpoint attenuation
  checks. The guide retains the limits on pacing, graphics and subjective audio.

- The mountain's fourth field mission now restores [a physical frozen stair](frozen-stair.md).
  Two locks, a broken service-gallery jump, a hauling wheel and a six-metre
  ascent replace the three scattered generic winches. The completed stair and
  pass marker persist, including recovery from older saves. All 483 tests and
  the release build pass. The assisted full route, release keyboard/touch ascent
  and four saved-state checks pass at full health. Both positioned pulley voices
  stop at rest/pause and pass a distance-falloff check. The comparison notes
  retain the limits on pacing, graphics, listening and broader device coverage.

- The mountain monastery's 147 timber columns now meet their stone bases in
  all nine courts. All 1,323 browser joint samples are connected, and six
  matched views across the three graphics settings retain the same rendering
  counts. Forty assisted bell-rack walking legs, all 478 tests, the build,
  release keyboard/touch movement and save recovery pass.
  [Joint comparisons and checks](monastery-joints.md) record the correction
  and remaining graphics, pacing, listening and device work.

- The quarry climbing camera now frames the wall when taking a grip or return
  line, retains look input around nearby holds, and restores full orbit on
  terraces. The reproduced torso close-up improved from a 0.97-metre to a
  5.33-metre camera arm. Native keyboard/touch look and 1,295 posed browser views
  across all 37 holds passed; the full assisted route returned at full health.
  All 478 tests and the release build passed, including two new camera
  regressions. Release climbing, keyboard/touch movement and saved recovery
  passed. [Camera comparisons and checks](quarry-camera.md) document the look
  limits, railing retractions and remaining graphics, pacing and device work.

- Desert daylight now uses a calibrated visible sky and reflection capture,
  cooler ambient fill and clearer separation between sun and shade. Eighteen
  matched desert pairs retained all geometry counts, route bounds and source
  positions; the seven other chapters were pixel-identical in matched High
  views. Sky resources released on all eight chapter transitions. All 476 tests,
  the build and release climbing, keyboard/touch movement and save recovery
  passed. A fixed GPU check showed small changes within sample variation.
  [Daylight comparisons and verification](desert-daylight.md) include the
  remaining camera crowding observed beside the quarry wall and the broader
  graphics, pacing, listening and device requirements.

- The quarry now draws its opaque masonry depth before shading the stone,
  reducing hidden-surface work while sharing its existing geometry buffers.
  Fifteen matched views across Low, Balanced and High found zero differing
  RGBA values. A fixed Radeon 780M overview measured GPU reductions of 17.0%
  in High and 27.5% in Low; a distant view had little change. All 476 tests and
  the release build passed. The full assisted climb, rear walk, release climbing,
  keyboard/touch movement and saved recovery passed at full health. Draft
  attenuation, music selection and resource cleanup also passed.
  [Rendering comparisons and measurements](quarry-rendering.md) record the
  added depth submissions, benchmark limits and remaining production requirements.

- The quarry climb now occupies a ruined survey house with stepped buttresses,
  broken rear galleries, an uneven roofline and masonry on both faces. New
  collision and camera bounds leave the rear passages and climbing route clear.
  All 475 tests and the release build passed; the full assisted climb and rear
  walk finished at full health, and release climbing, keyboard/touch movement
  and saved recovery passed. Draft attenuation, music selection and resource
  cleanup also passed. A fixed Radeon 780M view measured GPU increases of
  22.3% in High and 44.6% in Low despite removing hidden geometry.
  [Masonry comparisons and costs](cleft-masonry.md) document that tradeoff and
  the remaining graphics, pacing, listening and device requirements.

- Desert banks now have rounded lower slopes beside the walking routes, opening
  views between their shoulders. Median near-route slope fell from 38.80° to
  17.85° while 51,375 walking-floor and 4,805 reservoir-floor samples remained
  exact. All 473 tests and the release build passed. The assisted climbing route
  recovered its record and returned at full health; release climbing, keyboard
  sprinting, portrait touch controls and saved recovery passed. Bird attenuation
  and terrain-resource cleanup also passed. A fixed Radeon 780M court view
  measured GPU increases of 3.1% in High and 8.9% in Low.
  [Slope comparisons and measurements](desert-transitions.md) record the more
  open views, retained route boundaries and remaining production requirements.

- Sun shadows now use smaller calibrated offsets and a stable world texel
  alignment; High uses a 4096-square map and Balanced retains 2048. A controlled
  GPU fixture reduced shadow separation from about 20 cm to 2–3 cm and removed
  measured subpixel drift. All 473 tests and the release build passed. Forty-eight
  chapter views, native movement, quality changes, slopes, raised platforms and
  resource cleanup passed; release keyboard/touch cases preserved exact saves
  at full health. High GPU rendering cost rose 8.6% in the sampled desert view
  and 4.6% in the jungle, and its larger map adds texture/depth storage.
  [Shadow comparisons and measurements](sun-shadows.md) record these costs,
  fixture limits and the remaining production requirements.

- Soft ambient shading now follows the explorer's animated boot soles on all
  three graphics settings, fading with lift and fitting nearby ground or decks.
  All 471 tests and the release build passed. Hardware checks covered 34 views
  across all eight chapters, a raised terrace and a snow slope; native movement
  and jump checks finished at full health. Release keyboard sprinting and
  portrait two-finger movement/crouching retained exact saves on reload.
  Matching views added two draw calls and 144 triangles; separate Radeon 780M
  samples had enough variability to preclude a speed-change claim.
  [Contact comparisons and limits](explorer-contact.md) document the local
  approximation and the remaining graphics, pacing, listening and device work.

- Desert palms now have fuller crowns with angled, folded leaflets, tapered
  stems, raised leaf scars and wind that keeps frond bases fixed. All 467 tests
  and the release build passed. Matching browser views retained all 70 placements
  and chapter collision/source records. Keyboard sprinting and portrait touch
  movement finished at full health and preserved saves on reload; attenuation
  and resource cleanup passed. A fixed Radeon 780M courtyard sample measured
  GPU increases of 0.5% in High and 1.7% in Low, with sample variation.
  [Palm comparisons and costs](palm-fronds.md) document the increased near
  geometry, benchmark limits and remaining graphics, pacing and listening work.

- The desert's near and middle-distance banks now have broader shoulders and
  varying, softened crests. A baseline comparison retained 51,375 walking-floor
  and 4,805 reservoir-floor samples exactly, together with the chapter's obstacle,
  feature-foundation and sound-source records. All 465 tests and the release
  build passed. The assisted 34-transfer climb recovered its record and returned
  at 100 health; release keyboard climbing and reload retained the safe terrace
  and journal record. Bird attenuation and terrain-resource cleanup passed.
  [Bank comparisons and measurements](desert-banks.md) include matching Low/High
  rendering counts and the remaining grid boundaries, graphics, pacing,
  subjective listening and device limits.

- Stride length and animation playback now follow measured travel speed, while
  crouched recovery steps move beneath the hips. Controlled scans measured
  65–85% reductions in median near-floor sole sliding across four gaits, with
  residual sliding still present. Running retains its flight phase. All 463
  tests and the release build passed, including moving slopes and contact sounds
  at 20/30 updates per second. Native jogging, sprinting and crouched travel
  stopped at 100 health; three release keyboard/touch cases preserved exact
  saves on reload. Five matching pose comparisons retained their triangle and
  draw-call counts. [Stride comparisons and limitations](explorer-stride.md)
  distinguish this correction from planted feet, motion capture and a device
  performance claim.

- Crouching now lowers the hands below the shoulders, relaxes the fingers and
  ties arm swing to the walking clip. All 461 tests and the production build
  passed. New checks cover 540 poses across gait phases, slopes and facing,
  transition/release behavior, blocked movement, and crouched torch contact.
  Native keyboard input completed a 4.68 m crouched walk, stopped, jumped and
  landed at 100 health. Production keyboard and portrait-touch wading checks
  preserved exact local saves on reload. Three matching views retained their
  triangle and draw-call counts; additional joint calculations are not covered
  by a CPU-performance claim. [Crouch comparisons and verification](explorer-crouch.md)
  record the procedural-animation and broader production limits.

- All nine waterfalls in the jungle, coastal and sky chapters now have fitted
  spillway masonry, open upper channels, accelerating streaks, impact foam and
  spray scaled for the active render viewport. Their foundations now extend to
  the sampled pool floor inside the existing collision bounds. All 459 tests
  and the production build passed. Six matched
  views preserved exact obstacle and sound records; all eight chapters rendered.
  Three prepared wading routes retained 100 health, and drainage moved the lower
  effects and sound with the reservoir. Live audio kept linear falloff, including
  half gain at its midpoint. All 42 watched geometry/material resources released
  when leaving each affected chapter. Release keyboard and portrait-touch cases
  preserved exact local saves on reload at 100 health. [Spillway views and evidence](waterfall-spillways.md)
  record the geometry increase, lower draw counts in the selected views and the
  remaining graphics, human pacing, listening and device requirements.

- Jungle trees now use fitted full leaf cards, the original coverage mask and
  shared cluster atlases baked once at load. The final suite passed all 456
  tests and the production build passed. Nine browser comparisons found zero
  color/depth silhouette differences across all three detail tiers and their
  distance fades. All eight chapters rendered, and the new texture/framebuffer
  allocations released on chapter change. Release keyboard and portrait-touch
  checks preserved exact local saves on reload, at 100 health. Matched local GPU samples measured
  about 9.8% more rendering time in High and 8.4% in Performance; the bake also
  adds about 64 MiB of texture storage. [Leaf comparisons and checks](jungle-leaves.md)
  record the visible improvement, geometry changes and memory/performance limits.

- The jungle now has a grounded outer bank and 1,048 additional trees beyond
  its map boundary, filling formerly empty sightlines while preserving the
  original woodland, routes and sound anchors. All 453 tests and the release
  build passed. Twelve controlled High/Performance views linked shaders;
  a prepared 6.58 metre crouched patrol crossing finished at 100 health,
  all 42 jungle patrol route searches completed, and the new resources released
  on chapter change. All seven other chapters rendered. Two release keyboard/portrait-touch
  cases preserved exact saves on reload. The added scenery increases submitted
  geometry and draw calls; [forest comparisons and costs](jungle-fringe.md)
  record these limits alongside the remaining AAA graphics, human pacing,
  listening and device work.

- All 122 guardians now follow regional watch routes with pauses and moving
  sight lines, then resume after investigating a sound. Terrain-aware movement
  keeps patrol, pursuit, charges and return on suitable footing. All 398 route
  legs completed navigation searches; 210 simulated seconds in each chapter
  produced 482 completed circuits without skipped stops. Prepared crouched
  crossings passed in all eight chapters at 100 health. All 450 tests and the
  production build passed, footfall attenuation remained linear, and three
  native keyboard/touch/combat cases retained exact saves on reload. The
  production fight preserved a defeated warden and 82 health after five shots.
  [Patrol behavior and evidence](guardian-patrols.md) distinguish these local
  and accelerated checks from human campaign pacing, encounter balance,
  subjective audio quality and the remaining graphics/device work.

- The Courier Road ferry now has weathered timber framing, grooved wheels,
  continuous rigging, fitted-stone landings and a woven sail that gathers upward
  while its spars retain their span. Moving wind follows the cloth centre and
  cable creaks originate at an axle. All 442 tests and the release build passed.
  Ten final High/Performance views linked shaders, the assisted round trip
  retained all three dispatches at 100 health, both moving voices retained
  linear falloff, and four production keyboard/touch cases preserved exact
  saves on reload. The additional detail raises source triangles from 14,682
  to 63,166 while batching reduces meshes from 59 to 31; these are not frame-rate
  measurements. [Construction comparisons and checks](courier-construction.md)
  record the remaining graphics, human pacing, listening and device work.

- The cloud city now has the optional Courier Road through its first court’s
  north gate. A wind-driven ferry serves three dispatch posts with increasingly
  broken stairs; returning the letters restores a journal register. Trim,
  braking, empty-car retrieval, a local map and saved landing recovery support
  the round trip. Positional wind and rope voices move with the car beneath the
  quiet sky crossing score. All 437 tests passed; all eight focused courier
  checks passed after the final helm fit. The continuous assisted return route
  finished at 100 health, both new voices measured linear attenuation, and
  four production keyboard/touch cases retained exact saves on reload. Existing
  wind controls and bridge approaches remained clear. [Courier Road views and
  evidence](courier-road.md) distinguish this added prototype content from the
  remaining human pacing, AAA graphics, listening and device requirements.

- The cloud city's upper masonry now follows the damaged walls that support it,
  and intact walls meet their level coping. This closes gaps up to 1.2 metres
  beneath six towers. All 4,810 sampled front/rear bearings now meet stone; the
  previous geometry had 1,822 open samples. All 429 tests and the release build
  pass. Eight High/Performance views linked their shaders, 119 wind-control
  routes and 54 bridge-bank approach searches remained clear, and native turns
  saved at two repaired courts. Two production cases passed keyboard/touch
  operation, movement and exact reloads without console warnings/errors or
  failed assets. [Masonry comparisons and checks](citadel-supports.md) record
  the 1,888-triangle increase with unchanged mesh count and the remaining
  graphics, human pacing, listening and device work.

- The cloud city's distant ranges now have irregular crests, branching gullies,
  fractured rock, baked sun visibility and cavity shading. Corrected background
  depth prevents rear faces from painting over nearer slopes while preserving
  distant gameplay scenery. All 428 tests and the production build pass.
  Twelve High/Performance views linked their shaders; reversing triangle order
  produced identical diagnostic pixels, and all eight background resources
  released on chapter change. All 36 assisted native-input bridge crossings
  finished at full health, and 59 feature approaches remained clear. Four release
  cases passed keyboard/touch input and exact save reloads, including airborne
  and older-route recovery. [Mountain comparisons and notes](andean-ridges.md)
  record the additional 48,128 triangles, unchanged draw counts, verification
  limits and the remaining AAA graphics, pacing, listening and device work.

- The cloud city’s eighteen suspension spans now have warned crosswinds,
  crouch bracing, balance-arm poses and striped streamers. Early gusts are
  gentle; later ones reverse or arrive in shorter pulses. Existing positional
  wind follows the envelope, and the score leaves space for the warning.
  All 427 tests and the production build pass. Physics checks crossed every
  span in both directions with carried cargo and steering; 36 assisted native
  browser crossings also finished at 100 health. High/Performance views,
  portrait touch bracing/jumping, pause, source falloff and cleanup passed.
  Four final production cases passed native input and exact save reloads,
  including supported, airborne and older-route positions. No failed assets
  or console warnings/errors were reported. [Crosswind notes and images](sky-crosswinds.md)
  record controls, measured limits and the remaining human pacing, subjective
  listening, browser/GPU and AAA graphics work.

- The orrery court now has pale fitted paving, a broken stone colonnade,
  retaining masonry, under-deck supports and four caged oil lamps. Columns
  block movement, arch openings remain clear, and older overlapping arrivals
  recover at a safe landing. Each lamp uses one quiet positioned fire emitter
  and the shared four-light pool. All 422 tests and the production build pass.
  The assisted native-input route retained all three animated calibrations,
  chart recovery and return in 48 segments at 100 health. Browser checks covered
  fourteen columns, thirteen arch openings, source falloff and cleanup of 87
  graphics resources. Five final production cases passed native keyboard/touch
  interaction and exact reload comparisons without failed assets or console
  warnings/errors. [Court comparisons and notes](orrery-court-art.md) record
  the geometry increase and measured limits. AAA graphics, human chapter
  pacing, subjective listening and broader device testing remain open.

- The Cartographer’s Orrery now has physical bearing instruments, two-hand
  reach/turn/release actions and a four-leaf return bridge that unfolds after
  chart recovery. Calibrations commit at the wheel’s stop; movement cancels an
  unfinished action, pause freezes machinery and sound, and older occupied
  arrivals recover beside the relocated tablet. All 419 tests and the production
  build pass. A continuous assisted native-input route completed all three
  actions, deployment and return in 48 segments at 100 health. Nine turning
  frames supplied 108 hand-surface measurements; keyboard/touch cancellation,
  source falloff, portrait map and cleanup of 78 graphics resources also passed.
  Four final production cases passed native input and exact reload comparisons
  without failed assets or console warnings/errors.
  [Operation notes and images](orrery-operation.md) include the rendering cost
  and measured contact tolerances. AAA graphics, human chapter pacing,
  subjective listening and broader hardware/browser coverage remain open.

- The final chapter now includes **the Cartographer’s Orrery**, an optional
  traversal through three rotating crowns, ordered bearing calibrations and a
  central chart that opens a return bridge. Fixed landings support save and fall
  recovery; the map follows ring angles, and moving machinery uses distance
  attenuation. All 415 tests passed, followed by 14 affected tests after the
  final texture correction. An assisted native-input route completed all three
  rings and the return crossing in 47 movement segments at 100 health. Browser
  checks covered rider/boot support, pause, touch controls, portrait layouts,
  source falloff and cleanup of 44 inspected graphics resources. Five final
  production save states passed native input and exact reload comparisons
  without failed assets or console warnings/errors.
  [Orrery notes and images](cartographers-orrery.md) record the evidence and
  remaining animation work. Human chapter pacing, AAA graphics, subjective
  listening and broader device coverage remain open requirements.

- The crystal chapter now has an optional **Listening Gallery** west of its entry
  camp: 32 connected chambers, five pulse-counted voices, false echoes, three
  ordered expedition memories and two rising shortcut shutters. Engravings, map
  counts and the journal support muted play. Partial discoveries persist; the
  local score omits its melody while listening. All 409 tests passed, followed
  by all 17 affected tests after the final audio placement and arrival checks.
  An assisted native-input route completed the gallery and returned to camp in
  72 movement segments at full health. Five listening approaches were clear;
  live voice diagnostics measured full/half gain and retirement across the
  configured distance range. All 70 inspected graphics resources released on
  chapter change. Four final production save states passed native keyboard/touch
  interaction and exact reload checks without failed assets or console errors.
  [Gallery notes and images](listening-gallery.md) include evidence and limits.
  This adds exploration content; one-hour chapter pacing, AAA graphics and
  subjective sound quality remain unverified or unmet.

- The Cinder Relay’s return car and both landings now have physical pull levers
  and a right-hand action. Commands start at the completed pull; release follows
  the moving car, cancellation preserves an already-started journey, and pause
  freezes the machinery and sound. All 404 tests passed with two workers after
  an interrupted initial run; the production build passes. Browser checks cover
  both directions, both landing levers, hand/boot clearance, touch input, distance
  audio, older occupied saves and cleanup of 297 inspected graphics resources.
  A continuous native-input route with assisted directions completed the ascent,
  return, step-off and lift recall at 100 health. Five final production fixtures
  passed interaction and exact reload checks with no failed assets or console
  warnings/errors. [Lift-control notes](cinder-relay-levers.md) include an image,
  measured tolerances and limits. AAA graphics, human chapter pacing, subjective
  listening and broader device performance remain open production work.

- The Cinder Relay’s three valves now have two-hand reach, quarter-turn and
  release actions with supported alignment. Circuits save at the completed turn;
  movement cancels an unfinished turn, repeated Use cannot queue it, and pause
  freezes motion and silences the positioned mechanical source. All 402 tests
  and the production build pass. Browser checks cover hand-surface contact on
  every valve, native keyboard/touch actions, distance falloff, exact unfinished
  and completed reloads, and the full six-piston route at 100 health. Four final
  production save fixtures passed interaction and exact reload checks without
  failed assets or console warnings/errors. [Valve interaction notes](cinder-relay-hands.md)
  include the sampled contact tolerances and limits. The later lift-control pass
  extends the interaction to the return lever; AAA graphics, human pacing and
  subjective listening remain open.

- The Cinder Relay now has dressed basalt, worn panel decks, fixed pressure
  housings, constant-length sliding rams, gauges, return-lift cable/rollers and
  dispatch cargo. The full 400-test suite passed, followed by ten focused checks
  after final scenery adjustments. Browser checks covered the continuous route,
  all eight chapters in High/Performance, unchanged original controls and bounds,
  audio alignment/falloff, touch input and disposal of 260 inspected resources.
  Older saves occupied by new cargo recover on the same supported gallery.
  Final production interaction and exact reload checks cover partial, transit and
  occupied-gallery fixtures, with no failed assets or console warnings/errors.
  [The art comparison](cinder-relay-art.md) includes matching images and the
  increased rendering cost. AAA graphics, human pacing, subjective listening and
  broader hardware performance remain open production work.

- The volcanic chapter now includes **the Cinder Relay**, an optional ascent
  through six pressure pistons, three circuit controls and safe galleries to a
  dispatch ledger and return lift. All 397 tests and the production build pass.
  A continuous browser route used native movement/interactions with assisted
  directions, crossed every piston and returned at 100 health. Browser checks
  covered High/Performance in all eight chapters, unchanged original objectives
  and obstacles, gallery/transit reloads, multi-touch Use/Jump, hot-floor recovery,
  aligned steam sources, linear audio falloff, paused plumes and disposal of
  173 inspected graphics resources. Production native E opened a saved circuit
  and read the summit ledger; both saves restored exactly apart from last-played
  timestamps. No failed assets or console warnings/errors were reported.
  [Relay notes](cinder-relay.md) include the route, images, workload and limits.
  Its primitive architecture needs further art work; AAA graphics, human chapter
  pacing, consumer-device performance and subjective sound quality remain open.

- The 33 perched birds now have regional plumage, shaped heads/bills, eyes,
  layered feathers and planted feet. Seven jungle birds formerly inside masonry
  now sit above the actual stone; desert/coastal body heights also match their
  perches. The full 390-test suite passed, followed by the three focused tests
  after the final wing-stretch correction. Final browser checks covered all eight
  chapters in High/Performance, 264 toe-contact samples within 0.0041 m, exact
  sound alignment, distance falloff, pause, shared resource disposal and unchanged
  objectives/obstacles. The final production build accepted native movement and
  exact save/reload without failed assets or console warnings/errors.
  [Bird artwork notes](bird-art.md) include images, rendering costs and limits.
  Stylized wildlife, AAA graphics, subjective audio quality and hour-long human
  chapter pacing remain open production work.

- All 154 courtyard braziers now have detailed stone supports, regional motifs,
  weathered basins, fittings and glowing fuel. Near/distant instances share four
  material groups per tier; existing positioned fire recordings remain aligned.
  All 387 tests and the build pass. Browser checks covered 616 clear approaches,
  solid supports, camera bounds, both graphics settings, native input with
  assisted movement, pause, audio falloff and exact chapter resource cleanup.
  Shared textures are now disposed once. Production recovered an older save from
  inside a new footprint, accepted native movement and restored the exact save
  without failed assets or console warnings/errors. [Brazier artwork notes](brazier-art.md)
  include images, workload and limits. AAA graphics, subjective sound quality and
  approximately hour-long human chapter pacing remain open.

- Scattered rocks in the seven non-desert chapters now fit their scanned
  undersides to the terrain and reject steep or reserved footprints. The fitting
  accounts for rendered ground triangles as well as movement heights; an initially
  missed coastal gap fell from 1.51 m to 0.37 m. All 384 tests and the build pass.
  All eight chapters rendered in High and Performance; independent rays found
  ground contact for all 1,058 retained rocks. Objective positions, obstacle
  records and retained rock horizontal transforms matched the baseline. Native
  production torch, rest, movement and exact save/reload passed without failed
  assets or console warnings/errors. [Rock grounding notes](rock-grounding.md)
  include before/after views, reduced scatter density and remaining local edge
  overhangs. AAA graphics, human chapter pacing and subjective sound quality
  remain open.

- All 28 base camps now have fitted stone fire rings, charred timber, coals,
  detailed supply chests, rolled bedding and expedition equipment. A camp flame
  shader, sparks and smoke retain the existing positioned fire recording. All
  380 tests and the build pass. The browser checked 112 approach positions,
  native rest in all eight chapters, jungle torch lighting, fire-voice falloff,
  pause and exact camp resource disposal on chapter changes. Matched jungle and
  desert views show the added detail and geometry cost. High-quality production
  torch/rest controls and exact save/reload passed without failed assets or
  console warnings/errors. [Camp artwork notes](camp-art.md) contain comparisons
  and limits; AAA graphics, subjective audio quality and hour-long human chapter
  pacing remain open.

- Blocked movement now settles the explorer into idle, and the retargeted running
  animation retains its source airborne phase. The asset change is confined to
  20 vertical Run hip values. A production reload check also found and fixed a
  reset of the expedition creation timestamp. All 377 tests and the build pass;
  native movement, an assisted wall fixture, jump/landing and High-quality
  production save/reload passed without console errors or warnings. The release
  restored exact gameplay records, settings and creation time and delivered the
  expected character asset bytes/hash. [Locomotion notes](explorer-locomotion.md)
  retain measurements and limits. Horizontal sliding, AAA quality and human
  chapter pacing remain open.

- The desert now has the optional Surveyor’s Cleft: 37 directional handholds,
  a branch around a broken span, jump/catch transfers, three upper rest terraces,
  belay recovery, a saved summit record and an inclined return descent. All 364
  tests and the production build pass. Native keyboard events with assisted
  simulation completed the route at full health; touch jump/catch, collision,
  pause, distance-sensitive audio, both graphics settings and chapter disposal
  passed. Production native climbing, mid-climb reload and the journal record
  passed from a prepared save. [Climb notes](surveyors-cleft.md) include controls,
  captures and measured evidence. This adds traversal depth; hour-long chapter
  pacing, subjective sound quality and AAA graphics remain unverified or unmet.

- The jungle's nine sanctuary structures now have 392 carved faces on 98 piers, narrower masonry bevels, alternating split-course directions, rain staining and fifteen piers with original woody climbers and folded leaves. Leaf tips and shadows share their wind motion. All 354 tests and the production build pass. Eight matched High/Performance views retained exact camera and collision records; both assisted torch relays and a live stealth approach completed at full health. Shrine fire positions, pause, chapter cleanup and native production movement/reload passed. [Temple facing notes](temple-facings.md) include before/after images and the increased rendering workload. This improves prototype environmental detail; AAA graphics, subjective mix review and approximately one-hour chapter pacing remain open.

- All eight chapters now support crouched movement, directional guardian sight, player-noise investigation, a suspicion meter and quiet approaches. All 350 tests and the production build pass. Eight assisted 6.6 m approaches with live guardians remained undetected at full health; front approaches raised suspicion and triggered combat. Portrait multi-touch, fixed sound-origin searches, music-state changes, pause/chapter cleanup, actual footstep attenuation and native production movement/reload passed. [Stealth notes](stealth.md) record the rendered pose, sound measurements, final bundles and limits. This adds prototype encounter variety; AAA graphics, subjective mix review and approximately one-hour chapter pacing remain open.

- The bellkeepers’ hoist now has fitted paving, timber cargo decks, guide rollers, spoked sheaves, a continuous modeled counterweight cable, supported headers, a detailed bronze bell and refuge furnishings. Previously hidden wall carvings are exposed on their piers. All 341 tests and the production build pass. Eight matched High/Performance views rendered; the continuous assisted route returned at full health, and touch Use, positional drive audio, chapter cleanup and native production ride/archive reloads passed. [The art comparison](hoist-art.md) records images, increased rendering workload, final bundles and verification limits. This improves prototype environmental detail; AAA graphics, subjective listening review and approximately one-hour chapter pacing remain open.

- The mountain now has an optional three-floor tomb beside its western library trail. Two counterweighted cargo lifts lead through a broken gallery jump to a bronze bell tongue, an upper bell and a refuge register. Landing controls recover either platform, and mid-journey reloads restore the last completed stop. The 337-test suite passed, followed by all six focused hoist checks after the final bridge collision correction. A continuous assisted route returned at full health; native production interrupted/completed rides, archive recovery, journal reload and portrait touch Use passed. Live drive voices followed the sheaves and stopped at rest/pause; an offline render measured half amplitude at the falloff midpoint and silence beyond range. [Hoist notes](bellkeepers-hoist.md) include images, the final production bundles and limits. This adds prototype exploration content; AAA graphics, subjective listening review and approximately one-hour chapter pacing remain open.

- All eight chapters now offer precise shoulder aiming with keyboard/mouse and touch controls, slower strafing, pitched arms/pistol, camera and muzzle cover checks, and hit/shield feedback. Cavern mineral beds now reserve clear space around guardian spawns. All 331 tests and the final build pass, including 648 matched armor-ray samples across both detail tiers. Native shots passed in selected encounters in all eight chapters; portrait multi-touch preserved held movement while firing/looking. In production, five native aimed shots defeated an active warden, and reload preserved its defeat and 82 health. [Aiming notes](shoulder-aiming.md) include rendered views, exact evidence and query timing limits. This expands prototype combat; AAA graphics, final mix review and approximately one-hour chapter pacing remain open.

- The causeway handwheels now have a visible approach, two fitted grips, a ratcheting quarter-turn and release. Moving or jumping cancels an unfinished turn; only a completed turn saves. All 321 tests pass, including the delivered hand surface through reach/release and existing torch/cable/underwater-wheel poses. A continuous assisted tomb route, native cancellation/pause/resume, touch Use, objective music-state changes, chapter cleanup and production cancelled/completed reloads passed. [Causeway notes](rainkeeper-causeway.md#reaching-and-turning-the-handwheels) include the rendered interaction and measurement limits. AAA graphics, subjective sound quality and one-hour chapter pacing remain open requirements.

- The jungle now has an optional flooded tomb south of its entrance camp. Six handwheels connect folding crossings; carrying fire to three lamps opens an archive with a new journal record. Turns, lit lamps and record recovery persist separately. All 318 automated tests passed, followed by seven focused checks for the final entrance/archive details. A continuous assisted browser route swam to all six controls, carried fire across the solved path, recovered the record and returned at full health. Both existing torch chains, native production partial/completed reloads, portrait touch controls, positional fire attenuation and chapter cleanup passed. [Causeway notes](rainkeeper-causeway.md) include the rendered hall, local map, evidence and limitations. This adds prototype content; one-hour chapter pacing, subjective sound quality and AAA graphics remain open requirements.

- The jungle's five relay stations now have distinct carved crowns, recessed reliefs, open bronze bowls, charred fuel and state-driven coals/sparks. Solid bases and columns preserve checked approaches and add sound obstruction. All 314 tests and the production build pass. Both assisted torch chains completed at full health; 20 browser relighting approaches, five save-recovery positions, native production ignition/reload/relighting and chapter cleanup passed. All High/Performance shrine views rendered with linked shaders and no console errors or warnings. [Shrine art notes](jungle-shrines.md) include before/after images and workload/verification limits. AAA fidelity and approximately one-hour chapter pacing remain unmet or unverified.

- The jungle's five relay braziers now require a carried torch lit at a campfire or completed beacon. Water and actions requiring both hands put it out; completed beacons remain available for relighting. A fitted left-hand grip, moving flame/light, distance-sensitive fire recording, keyboard/touch controls and saved torch state support the interaction. All 312 tests and the production build pass. Both assisted dry relay chains completed at full health; native keyboard, multi-touch, swimming, pause, chapter cleanup and production reload checks passed. Audio renders measured half amplitude at the falloff midpoint and silence beyond range. [Torch relay notes](torch-relays.md) include the rendered view and verification limits. Approximately one-hour chapters, subjective mix quality and AAA graphics remain unverified or unmet.

- The submerged emergency wheel now has a visible reach, two fitted hand grips, a 60-degree turn and release. Clear approaches respect swimming speed, movement cancels immediately, oxygen continues to decrease, and pause freezes both the action and gate travel. Only completed turns save open gates. All 306 tests and the final build pass, including the delivered hand surface, unchanged bone lengths, intermediate reach/release blending and existing cable grips. Both assisted gallery routes returned at full health; native keyboard cancellation, pause/resume, touch Use and production reload passed. [Wheel interaction notes](gallery-wheel.md) include the rendered pose, contact measurements and recovery rules. AAA quality, broader device/listening review and approximately one hour per chapter remain open requirements.

- The memorial and return gates now retract beneath their floors instead of rising through the palace courtyard. Fixed guides, rotating pinions, wheel supports and connected pressure lines accompany eased gate motion; positioned drive sounds stay at the visible machinery. All 303 tests and the production build pass. Both assisted swimming routes returned at full health before/after drainage, and native production wheel input plus reload preserved progress at the safe bell. Four surface views and ten High/Performance interior views rendered, with no above-terrain vertices on the retracted gates and linked interior shaders. [Machinery notes](gallery-machinery.md) include the courtyard comparison and verification limits. These are prototype art improvements; AAA quality and hour-long chapter pacing remain unmet or unverified.

- Enclosed memorial views now cull hidden palace surfaces and skip the hidden ocean reflection while preserving the complete shadow-caster set, lights, entrance views and clipped sea joins. All 28 High/Performance pixel comparisons matched exactly. Sampled High interior draws fell from 1,467–2,270 to 370–395. Alternating Radeon 780M samples reduced air-bell frame intervals from 18.7–19.0 ms to 16.7 ms; the other enclosed views reduced GPU and frame-callback work while already near the browser presentation limit. All 302 tests and the release build pass. Both rendered traversal checks returned at full health before/after drainage, with exact visibility restoration across 163 renders and a clean chapter transition. Native production controls and safe-bell reload retained chapter state and settings without failed assets or console errors/warnings. [Gallery rendering notes](gallery-rendering.md) contain workload tables, frame measurements and their single-device limits. This preserves the existing art; AAA visual quality and hour-long chapter pacing remain open requirements.

- The Drowned Kingdom now has a submerged memorial gallery beneath the harbor court: two bronze air bells, alternating high/low passages through collapsed masonry, an emergency wheel opening the archive and return gates, and a copper evacuation record saved in the journal. Its interior map and last-breathed-bell reload anchor are independent of the main hydraulic objectives. All 298 tests and the release build pass. Assisted routes returned at full health before and after drainage; native production diving, swimming and E opened the gates, and reload preserved gameplay state while returning to the safe bell. Touch Dive/Rise, portrait journal layout, linear drip attenuation, moving gate sources, all High shader links and chapter resource cleanup passed. [Memorial gallery notes](sunken-gallery.md) include rendered views, source details, measured audio and exact verification limits. This adds authored underwater traversal; AAA graphics, subjective listening review and approximately one-hour chapter pacing remain unmet or unverified.

- High quality now skips a duplicate directional-shadow rebuild during contact occlusion. All eight matched 1280 × 720 views retained identical pixels; seven chapters removed 99–174 shadow draws, while the crystal cavern was unchanged. All 292 tests and the release build passed. An isolated browser successfully used the Radeon 780M, providing the first eight-chapter hardware baseline. Alternating samples measured lower GPU work; total frame-time improvements were consistent in the jungle and overlapped in the water kingdom and cloud city. Native production movement and a paused reload preserved chapter state and settings. [Hardware rendering notes](hardware-rendering.md) contain measurements, reproduction and limits. These selected views on one integrated GPU do not establish broad device support, AAA graphics or hour-long chapter pacing.

- The Drowned Kingdom now has free diving and five submerged tidekeeper records in wells with different depths. Bronze floats and positioned bubble trails guide descent; three-dimensional recovery saves journal records independently of the main objectives. Air, warnings, recovery ascent, a closer underwater camera, water fog, filtered audio and a quieter chapter arrangement support the new exploration goal. Reloading a dive restores the surface with full air and preserves discoveries/progress. All 291 tests and the production build passed. All five dives passed before and after drainage in the actual browser world, and the hydraulic approaches and local control routes remained accessible. Performance and High views linked shaders. Native keyboard input recovered a record in the production build and preserved it through reload; native multi-touch retained independent held controls and opened the journal. Audio renders measured underwater filtering, surface restoration and half amplitude at the bubble source's falloff midpoint. A chapter change disposed 71 inspected archive geometries and the three old audio filters. Software graphics reported ReadPixels stalls; there were no failed assets or JavaScript errors in completed checks. [Diving archive notes](diving-archive.md) contain images and exact evidence. The wells are open exploration spaces, not a completed underwater level; AAA graphics, subjective mix quality, consumer-device performance and hour-long chapter pacing remain open.

- The explorer now wraps its palms, four fingers and opposing thumbs around the return-cable handles, with the lower supports moved clear of the hands. Procedural rotations are removed before the next base-animation update so the grip releases after dismounting. All 285 tests and the production build passed. Across every cable slope and heading, 396 hand inspections measured 717,156 delivered skin vertices: minimum clearance against the conservative smooth-grip envelope was −0.462 mm, every finger/palm group had contact within 2.470 mm, and the strut envelope stayed at least 38.9 mm clear. These are sampled poses, not proof of perfect contact at every instant. Assisted browser input completed all 22 routes across all eight chapters; all eight Performance views and the final High jungle view linked their shaders. No JavaScript errors or failed assets were reported; the software driver reported ReadPixels stalls. The actual audio mix selected the carriage during rides and the winch during returns, stopped both at rest/pause, and changed between climbing and objective music. Isolated same-buffer renders measured half amplitude at each distance midpoint and silence beyond range. [Hand-grip notes](hand-grips.md) contain before/after renders and verification limits. This supersedes the preceding milestone's open-finger pose and pending eight-chapter/audio checks. AAA graphics, supported-device performance, subjective listening quality and hour-long chapter pacing remain open.

- All 22 return cables now have braced departure and arrival terminals, grooved roller carriages, vertically hanging hand grips and automatic winch-driven returns. Carriage friction follows its position and fades from 1.2 to 22 m; the fixed winch fades from 1.2 to 18 m. Rest and pause release the mechanical voices. All 284 tests and the release build passed, covering 44 terminals, route clearance, moving source positions, pause, reuse and secure-summit save recovery. The delivered character passed 3,168 hand-joint checks across every cable slope and heading; finger articulation remains unfinished. Assisted browser input completed 16 routes in six chapters, and all six Performance rider views linked their shaders without reported warnings/errors or failed assets. The browser service stopped responding during the remaining chapter and High release checks, so those results, a native production ride/reload, isolated audio measurements and instrumented resource disposal are not claimed for this milestone. [Return cable notes](return-cables.md) contain the final Performance views and exact verification limits. AAA graphics, consumer-device performance, subjective listening quality and hour-long chapter pacing remain open.

- All 22 climbing routes now have fitted masonry piers, stepped capstones, braced timber or iron hoists, crosshead-mounted bearings and swiveling rope eyes. Their 110 landing surfaces retain exact physical support heights, and the rope's swept path clears the frame. Positioned hoist friction follows motion, fades from 2 to 28 m and stops at rest. The full suite passed 279 tests; all 14 affected checks passed after the final bearing and continuous-friction refinements, and the final release build passed. Assisted full-world browser input completed all 22 routes across eight chapters, including jumps, rope crossings and return cables. All eight Performance views and the final High jungle views linked their shaders. The production build accepted native movement and climbing, saved a secure ledge and restored its centre and height after reload while preserving all other chapter state and settings, apart from the expected last-played timestamp. No failed assets, development hook or console warnings/errors appeared. Audio rendering measured half amplitude at the distance midpoint and silence beyond range. Chapter loading released all nine observed course geometries, six materials and nine textures without retaining old course/audio references. [Climbing construction notes](climbing-construction.md) contain the visual comparison, measurements and verification limits. AAA graphics, supported-device performance, subjective listening quality and hour-long chapter pacing remain open.

- The jungle now has eight authored glyph covenants, 42 four-faced carved drums and 50 physical controls in different forecourt arrangements. Counts, repeated pairs, exclusions and relative steps replace the old four-ring dialog sequences; forward and backward world/focused turns share immediately saved progress. Positioned machinery follows visible motion and falls silent at rest. The full suite passed 276 tests, all 25 affected tests passed after the final refinements, and the release build passed. Browser checks retained 54 feature approaches, eight thresholds, all 50 local control walks and 42 clear drive listening paths. Low and High shaders linked. Assisted input completed all eight covenants; 13,440 delivered-character hand-joint comparisons stayed within 1 mm of the selected grips. Focused controls worked without horizontal overflow at desktop, portrait and landscape sizes, and actual buttons saved and activated the six-drum final covenant. The High release accepted native input and restored exact chapter state and settings after a paused reload, without failed assets, a development hook or console warnings/errors. An isolated audio render measured half amplitude at the distance midpoint and silence beyond range. A chapter change disposed 193 geometries, four materials and four textures and cleared old cipher references. [Covenant court notes](cipher-courts.md) contain art, UI views, measurements and limits. AAA quality, subjective listening review, consumer-device performance and hour-long chapter pacing remain open.

- The explorer now fits its visible soles to sloping terrain, platform tops and sagging bridge decks while preserving animated foot lift and the physical player position. Moving sole contacts emit positioned footsteps; timber decks use a lower filtered sound, and blocked movement, water, idle, pauses and teleports suppress dry footfalls. All 271 tests and the release build passed. Mesh checks covered 810 slope poses, bridge support, contact cadence and counterweight hand alignment. Browser views reduced a 4.58 cm sunken boot to a small positive clearance; an assisted walk retained clear soles and four positioned contacts. An isolated audio render measured half signal at 21 m and silence beyond 40 m, with sound nodes released. Low and High shaders linked. Native release movement and a paused reload restored exact position, active time, health, progress and settings without failed assets, a development hook or console warnings/errors. [Explorer footing notes](explorer-footing.md) contain the rendered comparison and limits. Horizontal foot locking, AAA character quality, supported-device performance and hour-long chapter pacing remain open.

- All 456 natural and mounted quartz pieces now use varied beveled facets and an optical material with cloudy inclusions, fine etching, colored attenuation and light transmission. Surface coordinates and individual thickness survive static batching; transmission captures have bounded resolution and explicit chapter cleanup. All 267 tests passed, the four new art/lifecycle checks passed after the final etch adjustment, and the release build passed. Browser checks retained 54 feature approaches, 41 tuning controls and local walks, 36 natural mineral sound fronts and 66 tuning-tone fronts. Low and High shaders linked. Native tuning saved each turn, aligned glow and comparison tones, and silenced the matching reference; the live mix selected ten voices within its twelve-loop limit. The High release accepted native tuning and movement and restored exact position, active time, health, field work, tuning state and settings after a paused reload, with no failed assets, development hook or console warnings/errors. A chapter change disposed 141 geometries, 42 materials and two transmission targets and cleared their sampler references. Test saves were cleared and High quality restored. [Quartz art notes](mineral-art.md) contain rendered comparisons, measured costs and limits. Transmission adds rendering work; supported hardware frame rates, AAA graphics and hour-long chapter pacing remain open.

- Cloud-city banks and ravines now use bounded downward erosion, layered cliff materials, moss, seepage and worn route centers. The fine grid preserves exact objective foundations and bridge joins; unsupported cliff trees and planting were removed, and bridge approaches retain planting margins. All 263 tests passed, the eight affected checks passed after the final planting adjustment, and the release build passed. Low and High shaders linked. Browser checks retained 59 feature approaches, 54 bank paths, 36 bidirectional crossings with zero falls, 119 dry wind controls and local walks, and 260 clear nearby wind-source listening paths. Native E and W in the High release changed and saved progress; a paused reload restored exact position, stage, field progress, route version, health, active time and mix settings with no failed assets or development hook. A chapter change disposed 81 geometries, one material and eleven textures without retaining old terrain or sound references. [Cloud-city terrain notes](sky-terrain.md) include rendered comparisons, workload measurements and limits. The original AAA visual and hour-long pacing requirements remain open.

- Eighteen cloud-city bridges now have fitted-granite anchor piers, supported timber headers, bronze cable drums, weathered boards, carrying ropes and lashings. Seventy-two localized drum sources follow deployment with a 2–22 m distance fade, then become silent at rest; the shared twelve-voice limit and quiet sky score remain in place. All 259 tests and the production build passed. The complete browser world retained 59 feature approaches, 54 bank paths, 36 bidirectional crossings with zero falls, and 72 clear nearby drum listening positions. Low and High shaders linked. Native E restored a winch; a live sky/winch mix selected six voices with the expected difference between near and far drum gains. The High release accepted native E and W, then restored exact position, field progress, stage, route version, health and active time after a paused reload, without failed assets, a development hook or console warnings/errors. A chapter switch released 379 geometries, five materials and six textures, leaving no bridge sources or old voices. Test saves were cleared and High quality restored. [Bridge construction notes](sky-bridge-art.md) contain rendered comparisons, construction details, budgets and verification limits. AAA graphics, supported hardware performance, subjective listening quality and hour-long chapter pacing remain open.

- Initial public-source packaging was checked from a fresh export of the staged files, without the workspace's installed dependencies or raw asset downloads. `npm ci` installed successfully with zero reported vulnerabilities; all 255 tests and the production build passed. The build reproduced the browser-tested JavaScript/CSS bundles, retaining the existing Three.js chunk-size advisory. Runtime assets, attribution, provenance and selected documentation images are included; dependency installs, build output, private configuration, player saves, browser/agent state and raw conversion sources are excluded. Publication and future playable-milestone commit/push rules are recorded in [CONTRIBUTING.md](../CONTRIBUTING.md).

- Nine cloud-city mechanism chambers now match the fitted-stone citadels, with recessed niches, framed timber wind screens, bronze hinge straps, barrel fittings and corbelled headers. Their existing field restoration, inward opening, moving bounds and positional drive sounds remain integrated. The full suite passed 255 tests, and all eight affected gate tests passed after the final timber-support and masonry-backing adjustments. Low and High shaders linked, and the production build passed. Browser checks retained nine thresholds, 59 original feature approaches, 119 dry wind controls and local routes, 260 wind sound fronts, 54 bank approaches and 36 bidirectional bridge crossings. E completed a third field delivery, opening the gate and starting its two distance-sensitive drives; both became silent at rest. All eighteen drives had clear nearby listening positions. The High release accepted native E and W, then restored the exact saved position, wind state, stage, field actions, time and health after a paused reload, with no failed assets, development hook or console warnings/errors. A chapter switch released 162 gate geometries, six materials, nine textures and nine instance buffers without retaining old gate audio. Temporary saves were cleared and High quality restored. [Sky gate art notes](sky-gate-art.md) include construction close-ups, closed/open views, rendering costs and the three correctly obstructed longer sound probes. AAA graphics, hardware performance, listening evaluation and hour-long chapter pacing remain open.

- Ten fitted-stone citadels now replace the cloud city's original round pillars and stacked pyramids. Trapezoidal gateways, tapered niches, varied surviving wings and broken upper walls establish a more distinct architectural style. Closed beveled stones and recessed backing remove daylight gaps; physical bird perches keep models and emitters together. The full suite passed 253 tests, and all seven affected architecture/audio checks passed after the final perch correction. The release build succeeds. Browser checks retained 119 dry controls and local routes, 260 clear sound fronts, 54 bank approaches, 36 bidirectional bridge crossings and eighteen discovery paths. Low and High shaders linked. The final High release accepted native turning and walking, then restored its exact saved position, health, active time, field actions and both engine records after a paused reload, with no failed assets, development hook or console warnings/errors. A chapter switch released twenty citadel geometries, two materials and six textures, leaving no citadel records, perches, birds or bird sources/voices. Temporary saves were cleared and High quality restored. [Citadel notes](sky-citadels.md) include comparisons, source provenance, rendering costs and integration evidence. AAA graphics, supported hardware frame rates, subjective listening quality and hour-long chapter pacing remain open requirements.

- The cloud city now has three Andean-inspired mountain layers, slowly moving high clouds and a displaced valley cloud bank beneath its routes. Revised sunlight and fill give the stone and bronze more definition; local reservoirs and waterfall sound positions remain unchanged. All 250 tests and the production build pass. The browser retained 119 dry controls and local routes, 260 clear sound fronts, 54 bank approaches and 36 bidirectional bridge crossings. High and Low shaders linked, and advancing only the atmosphere clock changed visible cloud pixels with the camera fixed. The final High release accepted native turning and walking and restored the exact saved position, health, active time, field actions and both engine records after a paused reload. It had no failed assets, development hook or console warnings/errors. A live sound check selected six of the twelve available loop voices. Switching to crystal released five new geometries, five materials and the sky reflection target, leaving no cloud-city update state or wind sources/voices. Temporary saves were cleared and High quality restored. [Cloud-city atmosphere notes](cloud-city-atmosphere.md) include matched views, measured geometry work and lifecycle evidence. AAA graphics, consumer-hardware performance, subjective sound review and hour-long chapter pacing remain open.

- The cloud-city machinery now has dedicated mottled bronze surfaces, profiled bearing housings, hollow ducts with sealed lips, bolted flanges, rounded handwheels, supported fixed braces and pitched turbine blades with frame clearance. Stone foundations use texture coordinates at a consistent physical scale. Sky reservoir levels now lie below the protected working terraces, and court grass is removed without moving surrounding plants. All 247 tests and the production build pass. The final browser world retains 119 clear and dry controls, 260 clear sound fronts, all 119 local routes with swimming updates, 54 bank approaches and 36 bidirectional bridge crossings. Native E turns a casting, starts the hand-grip state and saves the change; Low/High shaders link. The final High release accepted native turning and walking, then restored the exact position, health, time, field actions and both engine records after a paused reload, without failed assets, a development hook or console warnings/errors. [Wind art notes](wind-art.md) include matched Low close-ups, the High court, source provenance and measured workload. A live sound check stayed at eight voices; switching to crystal released all 3,095 instance buffers and all three new metals, leaving no wind sources or voices. Test saves were cleared and High quality restored. Added detail increases rendering work; AAA quality, hardware frame rates and one-hour chapter pacing remain open requirements.

- Wind machinery now uses per-court instances and one shared inscription atlas while retaining source geometry, text resolution, hand anchors and moving camera bounds. A matched High view fell from 2,113 to 1,537 draw calls (27.26%); submitted triangles rose 1.88% because of coarser culling. Inscription pixels fell 82.43%. Chapter cleanup explicitly releases instance buffers. A newly identified reservoir overlap put ten controls below the swimming surface; sky wind courts now preserve their working ground. All 119 local routes pass with swimming updates included, all controls have at most 0.12 m of water, all 260 sound fronts remain clear, and the 54 bank legs and 36 bridge crossings pass. Native E works at a formerly submerged wheel. The High release accepted native turning and walking, then restored the exact saved position, elapsed time, health, field progress and both engine records after a paused reload. Switching to crystal released all 3,068 old instance buffers and the shared atlas. Console checks were clean; temporary saves were cleared and High quality restored. All 243 automated tests and the release build pass. [Wind rendering notes](wind-rendering.md) contain matched views, close-up lettering, regression evidence and software-rendering limits. AAA quality and one-hour pacing remain open requirements.

- The cloud city now has nine physical wind engines with four grid sizes, nine distinct routes, 121 castings, eleven fixed bearings and 119 handwheel/tablet controls. Castings rotate above the walking lanes; visible airflow, driven turbines and positioned air/bearing sounds follow the saved channel state. All 237 tests pass and the release build succeeds with the existing Three.js chunk advisory. Browser checks passed every control approach, 119 local character-physics routes, all 260 emitter fronts, 54 existing bank legs and 36 bidirectional bridge crossings. An assisted 155-turn run activated all nine engines through their record buttons. Focused changes, invalid activation, hints, reset and partial saves passed at desktop and phone sizes. Offline HRTF renders measured half amplitude at each source's distance midpoint and silence beyond its radius. The High focused view linked its shaders and reported 2,081 calls and 3,542,722 triangles across rendering passes. The High production build accepted native E and W and restored the exact position, 215.64380000001196 active seconds, health, stage, field actions and both engine records after reload. The final landscape layout build repeated that exact reload with no failed assets or development hook; console checks were clean. Temporary verification saves were cleared and High quality restored. [Wind engine notes](wind-engines.md) document the layouts, behavior, audio measurements and verification. Hardware frame rates, subjective listening quality, AAA graphics and one-hour chapter pacing remain unverified or unmet.

- The crystal chapter now has eight physical resonance arrays, 33 mounted crystals, 41 wheel/tablet controls and eight recovered memories in the journal. Distinct layouts and relational inscriptions replace the earlier offset-selector dialogs. Turning collars updates saved marks, paired positional tones, wave-ring alignment and the existing four nearby light slots. All 229 tests pass; the release build succeeds with the existing Three.js chunk-size advisory. Browser checks retained all 41 control approaches and local physics routes, all 66 sound fronts and all 36 natural mineral clusters. An assisted 102-turn completion activated every array and retained all eight memories. Native repeated Shift+E kept its downward direction. The final High release accepted native tuning and movement, restored the exact position, 540.0043999999762 accumulated active seconds, field progress and resonance records after reload, and retained the recovered memory in the journal. It had no development hook, failed assets or console warnings/errors. The final plaque readability changes passed all 21 affected resonance/hydraulic checks; temporary saves were cleared and High quality restored. Offline renders verified linear attenuation to silence and a live retune from 196 Hz to 218 Hz without replacing the voice; the tuning arrangement leaves the crystal score's pad and bass beneath the comparison tones. [Resonance array notes](resonance-arrays.md) include the eight designs, rendered views, audio measurements, persistence evidence and remaining limits. AAA graphics, consumer-GPU performance and one-hour pacing remain open requirements.

- The forge's eight main mechanisms now use 102 physical thermal chambers and 110 valve/tablet controls. Six reversible coupling rules lead to eight engraved firing patterns; shutters, molten interiors, coolant plumes and localized rumble/hiss share the saved heat state. The full suite passes all 219 tests, and the release build succeeds with the existing Three.js chunk-size advisory. Browser checks retained all control approaches, 204 sound fronts and 110 local character-physics routes. An assisted 59-turn completion activated all eight regulators through their tablets. A native E command changed and saved five linked shutters. The High production build accepted native E and W, then restored the exact position, 192.00810000002386 accumulated active seconds, field progress and thermal records after a paused reload, without a development hook, failed assets or console warnings/errors. Temporary saves were cleared and High quality restored. Actual offline HRTF voice renders measured half amplitude at each source's distance midpoint and zero beyond its radius; the live scene stayed within 12 voices. [Thermal regulator notes](thermal-regulators.md) include circuit rules, rendered views, measured audio, focused-interface checks and limitations. AAA graphics, hardware frame rates and one-hour pacing remain open requirements.

- The palace's stone floors now cover all ten courts and follow actual causeway cells, with worn tessellated borders, floral medallions, filtered grout/bevel shading and terrain wetness linked to eight live basin descriptions. Shared waterfall basins inherit their enclosing reservoir level. Revised coastal sun direction, reduced fill and calibrated sky radiance give the arcades clearer shadows. Material planning preserves the map grid, terrain heights and saved foundations. All 209 tests and the release build pass; all eight chapter scenes linked their shaders. Browser movement retained 36 hydraulic control positions, 27 pump sound paths, 59 original feature approaches and all 36 local physics routes. Assisted drainage lowered both water and terrain wetness by 1.8 m. The High production build accepted native E at the harbor spillway and W movement, then restored the exact position, 62.355000000000004 active seconds and all three field stations without a development hook or console warnings/errors. Test saves were cleared and High quality restored. [Coastal ground notes](coastal-ground.md) include before/after views, surface and lighting details, workload counts and release evidence. AAA graphics, hardware frame-rate support and one-hour pacing remain open requirements.

- The flooded palace now has nine physical hydraulic courts with 27 cisterns, 36 accessible pump/tablet controls, overhead pipes, moving floats and conserved water transfers. Distinct capacities and check valves lead to a final one-way circuit; unfinished measures and pump selections save after every command. Fifty-four positional pump/outlet sources follow motion and water height, share the 12-voice environmental budget, and fade linearly over 1.5–24/26 m beneath the quiet palace score. All 205 tests and the release build pass. Browser checks cover all controls, 36 local physics routes, 27 pump sound paths, 59 original feature approaches, native E input, focused controls/reset/busy and blocked-route feedback, all nine assisted receiver activations, desktop/phone layouts, and Low/High shader links. Isolated source renders measured half amplitude at each range midpoint and silence beyond the outer radius. The High production build accepted native pump and movement input and then restored the exact position, 212.66130000001192 active seconds, field progress, measures and selected pump without a development hook or console warnings/errors. Test saves were cleared and High quality restored. [Hydraulic court notes](hydraulic-courts.md) contain the nine measures, rendered views, audio measurements, release evidence and testing limits. AAA graphics and one-hour pacing remain open requirements.

- All 69 sanctuary gates now use eight regional panel and crown designs, descending shutters or inward swinging leaves, coursed masonry, rotating drives, moving counterweights and three restoration seals. Their 138 positional drive sources follow motion and fade linearly over 2–34 m beneath the existing quiet scores. Camera and movement collision track the doors; zero-height obstacles no longer block lower ground. All 194 tests and the release build pass. Actual browser scenes retained clear sampled thresholds, all 138 source fronts and approaches to 456 original features, including 77 desert and 40 mountain controls. Native E completed and saved a final field station; an isolated timber-drive render measured half signal at 18 m and silence at 35 m. High production keyboard movement and exact restoration of position, 9.717 active seconds and gate field progress passed without a development hook or console warnings/errors. Test saves were cleared and High quality restored. [Sanctuary gate notes](sanctuary-gates.md) contain the eight regional renders, workload counts, production evidence and test limits. AAA graphics and one-hour pacing remain open requirements.

- The mountain chapter now has eight playable bell racks, 32 swinging bronze bells, 40 rope/tablet controls, and eight composed lessons with repeat, reverse, and shifted-sign rules. Every note saves; world and focused controls share unfinished answers, and replay preserves them. HRTF strikes use linear falloff over 2–55 m and audio-clock scheduling under the quiet mountain score. All 188 tests and the release build pass. Browser checks cover all 40 control positions and local physics routes, 32 sound paths, 54 original feature approaches, native E input, partial-save restoration, invalid and valid diagram submissions, all eight assisted world completions, compact layouts, signal attenuation to silence, shader links, and chapter cleanup. An obsolete hidden pedestal collision found during native input was removed; the follow camera recovered its 5.33 m distance. The final High production bundle restored the exact saved position and 27.241600000023844 active seconds without a development hook or console warnings/errors. Test saves were cleared and High quality restored. [Bell lesson notes](bell-courts.md) contain the screenshots, measurements, and limits. AAA graphics and one-hour pacing remain open requirements.

- The desert now has nine distinct physical sunlight routes with 68 mirrors, 77 accessible controls, saved unfinished orientations, and reflected beams that stop at turning mirrors or cover. Motion-sensitive bearing sounds and illuminated receiver tones share the 12-voice budget beneath the existing quiet desert score. All 176 tests and the release build pass. Assisted browser checks completed all nine receivers, 77 local routes through character physics, sampled approaches to all 59 original features, and all 77 emitter fronts. Native E input, diagram controls, partial-save reload, compact layouts, distance attenuation, locked-source silence, Low/High shader links, and chapter cleanup passed. The High production build accepted keyboard movement and restored the exact saved position and 3.541599999964237 active seconds after reload. No console warnings/errors or production development hook were present; test saves were cleared and High quality restored. [Solar chamber notes](solar-chambers.md) contain the evidence and rendering limits. AAA quality remains unmet and one-hour pacing remains unverified.

- The final chapter now has eleven stone observatories, 86 hinged bronze dome panels, 33 graduated orbital rings, and an eclipsed sky that reveals dawn in the saved completion state. Field stations open the domes; puzzle inputs move the corresponding world rings and preserve unfinished alignments after each move. Twenty-two mechanical/harmonic sources share the spatial voice budget and respond to motion and restoration beneath the existing quiet choir score. All 166 tests and the release build pass. Assisted browser checks cover 63 sampled feature approaches, 31 local court routes through character physics, all 22 emitter fronts, three lunar shutter interactions, partial-save reload/reset/valid and invalid puzzle submission, desktop and compact focus views, distance attenuation, Low/High shader links, and cleanup on a palace load. The High production build accepted keyboard movement and restored its exact saved position and 3.3360999999642376 active seconds after reload, with no development hook or console warnings/errors. [Observatory notes](observatory.md) include actual renders, workload measurements, save behavior, and software-rendering limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour pacing remains unverified.

- The crystal chapter now has a continuous enclosed roof with shared movement, camera, and sight limits; distinct chamber vaults clear its rope gantries. Thirty-six faceted mineral clusters, supported stalactites, and visible drip impacts replace the open-air temple/cone treatment. Saved resonance work drives mineral glow, nearby light, and hum together. Its 45 mineral/drip sources share the existing 12-voice spatial limit and quiet glass score. All 158 tests and the release build pass. Browser checks cover 54 sampled feature approaches, 72 chamber-edge routes followed through character physics, all 36 mineral sound fronts, Low/High shader links, distance attenuation, saved resonance restoration, and cleanup on a sky load. The final High production build accepted keyboard movement and restored the exact saved position and 8.984800000011921 active seconds after reload, with no development hook or console warnings/errors. [Cavern environment notes](caverns.md) include comparisons, sound diagnostics, workload measurements, and software-rendering limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour pacing remains unverified.

- The sky chapter now has an authored route through alternating cliff courts, twenty-seven field stations, and eighteen folding suspension bridges over real ravines. Linked winches/route anchors deploy their decks; later spans have missing-board jumps and a visible recovery tether. Thirty-six wind/rope sources share the spatial voice budget, with creaking responding to deployment and the explorer's presence. All 150 tests and the release build pass. Assisted browser checks crossed every span in both directions at carrying speed, followed all 54 bank approach legs through full-world collision, and found clear sampled approaches for all 59 non-guardian features. Low/High shaders linked, live rope attenuation followed its 3–25 m fade, and supported/airborne/older-layout saves restored correctly. The High production build accepted keyboard movement and restored the exact saved position and 7.499099999964237 active seconds after reload, with no development hook or console warnings/errors. Loading the palace removed sky geometry and emitters. [Sky bridge notes](sky-bridges.md) include rendered views, measurements, migration behavior, and software-rendering limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour pacing remains unverified.

- The volcanic chapter now has nine furnace halls, original toothed machinery, dark local rock/paving/metal materials, an ash-cloud sky, eroded caldera geometry, and moving lava crust. Saved field actions drive matching heat, glow, steam, pressure hiss, rumble, and gear speed; its 45 machinery sources share the existing 12-voice spatial budget and quiet adaptive score. A foundation/occlusion regression was caught and fixed so furnace mouths remain above adjacent terrain. All 144 tests and the release build pass. Browser checks cover 54 sampled approaches, all 18 furnace-mouth sight lines, Low/High shader links, distance attenuation, assisted cooling/ignition/repair and state restoration, and cleanup on palace/snow loads. The final High production build loaded all ten new maps, accepted keyboard movement, and restored the exact saved position and 3.864299999952316 active seconds after reload with no development hook or console warnings/errors. [Forge art and sound notes](forge-art.md) include screenshots, source hashes, measurements, and software-rendering limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour pacing remains unverified.

- The flooded palace now has ten stone courts with fluted columns, open arches, broken blue-plastered vaults, shell reliefs, and mosaic paving. Coastal daylight and sea reflections replace the old flat sky; shoreline scrub replaces 430 trees whose roots were incorrectly below sea level. Bird models and audio emitters share supported stone perches. All 137 tests and the production build pass. Browser checks cover 59 sampled objective approaches, roof/camera openings, Low/High shader links, matched reservoir/waterfall/audio drainage, and cleanup on snow/jungle reload. The High production build loaded all nine new maps, accepted keyboard input, and restored the exact saved position and 6.301100000023841 active seconds after reload, with no development hook or console warnings/errors. [Palace art notes](palace-art.md) include screenshots, source hashes, workload observations, and the software-rendered input check's limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour chapter pacing remains unverified.

- The snow chapter now has nine supported timber monastery courts, whitewashed upper halls, varied snow-covered roofs, animated cloth with matching shadows, and ridged alpine background geometry. Cooler daylight and sky reflections light the new local materials; nine positional wind emitters follow their banner lines. All 131 tests and the production build pass. Browser checks cover 54 sampled feature approaches at their ground/elevated heights, successful Low/High shader links, emitter distance fade, and cleanup when switching to desert/jungle. The High production build loaded all nine new maps, accepted keyboard movement, and restored the exact saved position and 6.6115 active seconds after reload, with no development hook or console warnings/errors. [Monastery art notes](monastery-art.md) include screenshots, provenance, workload counts, and the short software-rendered movement check's limits. Test saves were cleared and High quality restored. AAA quality remains unmet and one-hour chapter pacing remains unverified.

- The desert now has ten sandstone courts with pointed arches, solar carvings, varied galleries and broken spans, plus curved palms with individual leaflets and three distance-selected detail tiers. A daylight sky supplies environment reflections; bird emitters follow the rebuilt perches. The suite passes 124 tests and the release build passes. Built-world checks cover arch/camera clearance, feature margins, and palm budgets/transitions; browser checks cover sampled feature approaches, bird support, shader reception, and switching to snow/jungle. The High-quality production build loaded all six new maps, accepted keyboard movement, and restored the exact saved position/time after reload, with no development hook or console warnings/errors. [Desert art notes](desert-art.md) include screenshots, provenance, exact workload counts, and the software-rendering limits. Test saves were cleared and High quality restored; AAA quality and one-hour pacing remain unmet/unverified.

- Chapter startup now holds the loading screen through required visual/audio preparation and completion of the first rendered view. Loading cannot advance saved play time or persist a partial chapter. Cancellation, independent asset batches, retry, lost-focus pause, and delayed audio resume ordering are covered by 12 new regressions; the suite passes 117 tests and the release build passes. Browser checks exercised held/failed downloads, duplicate and superseded starts, exact saved-game restoration, and compact loading controls. The High-quality production build opened a fresh briefing at zero seconds, accepted keyboard movement, and restored the resulting position and active time exactly after reload. Production checks reported no console warnings/errors and no development hook. [Startup notes](chapter-startup.md) record the assisted checks and software-rendering limits. Test saves were cleared and High quality restored.

- The terrain release build opened the jungle briefing in High quality, fetched all three new local maps with HTTP 200 and expected byte counts, recorded the initial position, and contained no development hook. No console warnings/errors were reported. This checks production loading and rendering; it does not establish a full-level play time or hardware frame rate. Test saves were cleared in development and preview, restoring High quality.
- Terrain now shares material blend weights across color, normals, and roughness; the jungle adds moss, damp variation, and height-guided paving edges. A quality-setting bug was fixed: existing receivers now refresh when shadows are toggled, and chapter loading applies renderer settings. All eight worlds passed checks against the active terrain shader with shadows enabled; the jungle also passed both quality-toggle directions. The suite passes 105 tests and the release build passes. [Terrain material notes](terrain-materials.md) include screenshots, asset provenance, exact sampler counts, and a correction to interpreting older assisted High-quality measurements. AAA quality and supported-device frame rate remain unverified.
- The grass release build accepted keyboard movement and restored the exact saved position and active elapsed time after pause/reload, with no development hook or console warnings/errors. An intro-click wait timed out after the click had completed; the game was observed running and the subsequent check succeeded at a smaller viewport. This remains a software-rendered smoke check. Test progress was cleared in development and preview, restoring High quality.
- Grass now selects detail and draw range per cluster, retains placement/color through fades, and skips distant empty patches. A controlled Performance-quality jungle comparison reduced grass triangles from 196,560 to 22,452 and whole-scene triangles from 859,242 to 685,134 at the same 229 calls. Three grassy chapters, a High jungle view, range transitions, and clearing grass in the desert were checked. The full suite passes 104 tests and the release build passes. [Rendering workload notes](rendering-budget.md) include matching images, reproducible comparison code, and the software-rendering limits. Consumer-GPU frame rate remains unverified.
- The guardian release build passed with the existing Three.js chunk-size advisory and launched a prepared jungle save without the development hook. A slow native-fire loop exceeded the automation tool's 300-second response limit; later observation confirmed a paused game and saved active wall time that survived reload, with no console warnings or errors. That run did not defeat the guardian and is not a passed production combat test. A separate keyboard check with controlled simulation steps defeated the warden in five shots and confirmed it did not respawn after reload. Development and preview test progress was cleared and High quality restored.
- Guardians now use original carved masks, layered stone armor, articulated joints, and equipment specific to the four archetypes. Three skinned surface meshes replace the separate body-part draws; nearby models contain about 20–22 thousand triangles, and distant versions retain about 30% of that geometry. Eight material palettes and procedural weathering distinguish regional finishes. [Guardian art notes](guardian-art.md) include matching before/after images and exact geometry budgets.
- The full suite passes 101 tests. Added coverage verifies rigid skinning, geometry budgets, pose bounds, planted and turning feet on sloped ground, positional footfalls, distance-detail hysteresis, staff projectile origin, shield/core tracer impacts, and fixed dart-trap emitters. A real desert load caught a shared-projectile regression that was fixed and added to the suite.
- Selected encounters rendered in all eight actual chapter worlds without console warnings or errors. A High jungle encounter also rendered with shadows and contact occlusion, reporting about 2.20 million triangles and 298 calls across the rendering work. Browser ankle coordinates matched the sampled terrain height. These are assisted viewpoints on ANGLE/SwiftShader; they do not establish consumer-GPU frame rate, complete encounter coverage, or AAA quality.
- The counterweight production build restored a partial chamber save, accepted a keyboard grip and push through the running game, and retained the resulting five-move state exactly after pause and reload. The development hook was absent, and Chromium reported no console warnings or errors. Software rendering was very slow; an initial movement wait expired before the later successful check. This does not establish hardware performance. Development and preview test progress was cleared and High quality restored.
- Eight physical counterweight chambers now precede the first mechanism in each chapter. Different wall layouts combine named sockets, weighted receivers, and clear tracks; Vesper pushes and pulls stones through continuous collision checks, with handle-following hands, positional friction/plate cues, and a quiet lifting score accent. All eight chambers passed browser-assisted movement walkthroughs. Keyboard push/pull, held multi-touch movement, exact restoration of a four-move save, and the tablet's reset control were checked separately. The full suite passed 93 tests and the production build passed. [Chamber notes](counterweight-chambers.md) record the rules, recovery behavior, and limits of these assisted checks.
- The vegetation production build fetched the five new jungle detail assets, accepted keyboard movement, and restored the changed position exactly after pause and reload. Its development hook was absent. Chromium reported no console warnings or errors. Test progress was cleared in development and preview, and High quality restored. The existing Three.js chunk-size advisory remains the build's only warning; software-rendered input checks are still slow.
- Vegetation now selects detail and draw range per instance. Trees and shrubs use three tiers, ferns two; nearby geometry is retained, and 300 ms complementary dither blends tier changes and range culling. Leaf shadows use the same wind and coverage. At the same 900 × 650 low-quality jungle spawn, submitted triangles fell from 2,761,934 to 857,638 (about 69%). All eight chapters, a High jungle view, and 40 simultaneous tree transitions rendered without console warnings or errors. All 84 tests and the production build passed. [Rendering workload notes](rendering-budget.md) contain exact asset budgets, repeatable profiling, and the limits of these software-rendered measurements.
- The character/audio production build launched without a development hook, loaded the delivered human asset, accepted keyboard movement, and restored the changed position exactly after pause and reload. Chromium reported no console warnings or errors. Software rendering made browser input checks very slow, including one automation timeout after a completed launch click; this is not evidence of an acceptable hardware frame rate. Development and preview test progress was cleared and High quality restored. The build passed with the existing Three.js chunk-size advisory.
- The explorer now uses a fitted 1.74 m human mesh with olive expedition clothing, a pack, rope, canteen, and original equipment. The delivery asset has 46,312 triangles and is approximately 8.08 MB. Retargeted idle/walk/run clips retain ground contact; procedural arm and leg poses support swimming, mantling, ropes, cables, and a visible two-hand sidearm. Source licenses, rebuild instructions, and generated texture prompts are recorded in [character-art.md](character-art.md).
- The new rig rendered in all eight chapters and passed browser-assisted checks on all 22 elevated routes, including rope-hand alignment and return cables. A High jungle waterfall view rendered with the human, contact shadows, and water reflection; it reported approximately 15.3 million triangles and 728 calls across the passes. This is a selected software-rendered view, not a supported hardware frame rate. The automated suite passed all 81 tests, including four checks against the delivered character asset and its runtime poses.
- A recurring Chromium audio-filter warning prompted replacing cutoff automation with a crossfade between fixed filters. Two offline renders each exercised 1,287 obstruction transitions across all nine source types without nonfinite samples or clipping. A live 24-chapter-audio-switch check stayed within 12 voices, retired all playing nodes, and produced no console warnings or errors. Details and a repeatable browser signal check are in [audio-verification.md](audio-verification.md).
- The water upgrade production build launched, accepted keyboard movement, and persisted the changed position through pause and reload without console warnings or errors. It contained no development hook. Development and preview test saves were cleared and High quality restored as the default. The final suite passed all 77 tests; the build retained the existing Three.js chunk-size advisory. The jungle collision-grid check still reached all 54 features and retained clear central passages in all nine sanctuaries.
- Liquid pools now excavate sampled terrain while retaining field-station foundations. Depth controls surface color/transparency and swimming; shallow banks provide a walking exit. Water has animated normals, foam, splash rings, and waterfall impact ripples. Layered curtains, spray, and mist follow changing reservoir levels. Overlapping waterfall basins share their enclosing surface.
- High quality captures one visible nearby water reflection at 512×512, no more than once every three active frames. A High jungle waterfall view rendered without warnings or errors, reporting approximately 9.0 million triangles and 556 calls across the passes. Low and Medium use a sky-color approximation. These software-rendered checks do not establish consumer-GPU performance or AAA quality.
- Real keyboard events plus programmatically advanced movement entered a jungle reservoir, resumed surface swimming after page reload, and exited on the opposite shallow bank without repeated swim/walk transitions. Existing 22 elevated routes passed browser movement/interaction checks against the changed terrain and waterfall obstacles. All eight environments rendered without console warnings or errors.
- A development-assisted hydraulic completion lowered a water-chapter reservoir by 1.77 m in ten simulated seconds; its waterfall impact and positional emitter followed the surface. Reloading restored the completed 1.8 m drainage immediately. New unit coverage includes bank depth, protected foundations, swimming collision/exit, saved arrival, drainage, shared basins, waterfall/emitter alignment, and reflection selection/capture limits.

- At the guardian milestone, the suite had 101 passing tests, including guardian skinning and foot contact, physical counterweight solutions and recovery, push/pull hand alignment, habitat placement and per-tree detail preservation, guardian routing and memory, bounded search slices, camera clearance and moving gates, combat warning/recovery windows, shields, projectile cover, dodging, death recovery, all 69 traps, field-route order, carried-component persistence, distinct journal content, multi-tier mantling, terrain foundations/continuity, mixed-geometry batching, spatial attenuation, changing reservoir/lava emitters, musical arrangements, and audio settings.
- Unit checks cover all eight maps, traversable graph connectivity to every objective/discovery, deterministic generation, save normalization, persistence and export/import, and all 69 puzzle configurations.
- Browser controls test moved the character by three world units through actual keyboard input and the movement update; a camp restored health from 30 to 100 and medical supplies from zero to three.
- Browser puzzle test solved a glyph mechanism through its buttons, advanced the objective, saved it, reloaded, and found the same stage with “Continue expedition” available.
- Each of the eight puzzle interfaces was operated in the browser and advanced a chapter objective. The mountain and cloud-city checks mantled the raised objective platforms before interaction.
- Every chapter's relic and completion transition was exercised; the final campaign screen displayed “The world remembers.”
- These integration checks used development-only positioning and deterministic simulation to avoid traversing the entire campaign. Remaining objective stages in the completion test were advanced through the engine after puzzle solver coverage. They are **not** evidence of eight hours of play or a full unassisted end-to-end playthrough.
- Earlier environment optimization reduced an initial jungle view from approximately 17.3 million triangles to approximately 0.45 million triangles and 49 draw calls. Those figures describe an earlier milestone. The current vegetation, terrain, lighting, and postprocessing increase rendering work; they must be benchmarked on consumer hardware before making frame-rate claims.

## Latest integration additions

- The jungle's nine sanctuaries now use supported corbelled arcades, tapered masonry piers, recessed botanical reliefs, layered entrance crowns, varied side galleries, and broken roof sections. The old four-pier/long-lintel structure and simple block-face decorations were replaced for this chapter. The existing mossy paving remains. These structures still use a shared procedural kit; they do not establish AAA art quality.
- A local 2K sandstone material supplies grain and normal detail, with desaturation, patchy staining, and moss shading. Original relief meshes add physical carving depth. Structural blocks use 44 triangles each and batch by room; fine carvings use bounding-sphere ranges of 42 m in Performance mode and 70 m otherwise, with 6 m hysteresis. These range checks leave structural collision active.
- Four new tests cover closed/outward-facing block geometry, actual relief depth and variations, station and passage clearance, and recovery from older saves inside new masonry. The full suite passes 71 tests.
- Browser collision-grid checks found access to all 54 jungle objectives and discoveries, using opened sanctuary gates and a 1.75 m sampling grid. All nine central arcade openings passed camera and walking-clearance queries; a solid pier stopped camera and sight rays. The jungle's rope route still completed through station restoration and the return cable. These are assisted checks, not an unassisted chapter playthrough.
- A browser reload of a save placed inside a new pier recovered 1.5 m away on clear ground, preserving its journal discovery and stage 3 progress. Every chapter rendered after the architecture changes without console warnings or errors. The jungle High shadow/contact-occlusion path rendered successfully; its checked view was around 10.6 million triangles and 548 draw calls across the passes. Software rendering was slow, and consumer-GPU performance remains unverified.
- The final architecture production build launched the jungle with no console warnings or errors and no development hook. Test-created development and preview saves were cleared, with High quality restored as the default.

- Twenty-two elevated routes now span all eight chapters, including a new volcanic valve route. Each combines five ledges, mantling, a jump gap, a swinging rope, and a return cable unlocked by restoring the summit station. The routes share a structural pattern with rotated layouts, two jump-gap lengths, and regional materials; this is a traversal expansion, not a claim that they are 22 independently authored set pieces.
- Character motion now integrates height in world coordinates, loses support when walking off ledges, and permits a short coyote-time/buffered jump window. Tests cover consistent jump arcs over descending terrain, loss of support, missed-crossing recovery, grip exhaustion, saved ledges, and invalid saved heights.
- All 22 routes passed automated movement and interaction checks against the actual browser world's obstacles, including station restoration and column clearance along the unlocked return cable. Unit simulations also landed on the far ledge using the release prompt. These checks begin at each route's entry and drive input programmatically; they do not establish unassisted difficulty, campaign pacing, or a human completion time.
- A separate keyboard check caught the jungle rope; the rig's two arm chains follow its grip. Reloading while suspended restored the last secure ledge at 5.6 m above its foundation. Rope creaks are positional, rolling cable sounds follow the rider, and hanging/zip traversal selects the score's climbing arrangement.
- A native three-finger browser input check caught the rope at a tablet viewport. Releasing Jump preserved held movement and Use; releasing Use preserved movement. Touch controls now appear for coarse pointers as well as small screens, and traversal prompts use Jump/Use labels.
- The traversal production build opened the jungle without console warnings or errors and contained no development hook. It accepted keyboard movement and saved the resulting position on pause. Development and preview test progress was cleared afterward; the High default was restored. The only build warning was the existing Three.js chunk size advisory.

- The jungle now contains 827 broadleaf trees using two scanned forms, with denser planting along route banks. Deterministic placement checks keep tree bases off walkable routes and away from objectives. Added understory clusters avoid worn trails, paved centers, and station working space. A 2K moss/leaf-litter material blends into narrow worn trails; roots and roughly 5,940 climbing leaves dress ruin piers and lintels.
- Tree detail is selected per instance within each render patch; near and distant trees can share a patch without losing or duplicating placements. Both detail versions cast shadows. A daylight shader now supplies the jungle's visible sky, with matching sun direction and cooler ambient light. The panoramic image remains an environment-lighting texture.
- Birds perch on the existing ruin capitals instead of freestanding poles in the approach. A browser check confirmed that their emitter coordinates match the bird positions. Distance attenuation and persisted mix controls remain in place.
- All eight chapters rendered after the terrain and forest changes without console errors or warnings. The jungle's high-quality path also rendered with shadows and contact occlusion enabled, retaining 18 nearby and 809 distant tree instances. Its checked 900×650 view reported about 9.8 million triangles and 632 calls across the rendering passes. This is a substantial cost increase over the sparse environment; consumer-GPU benchmarking and further optimization remain necessary. Software-rendered browser checks do not establish a playable hardware frame rate.
- The resulting production build opened the jungle and its chapter introduction without console warnings or errors. The development hook was absent. Test-created progress was cleared from the development and preview browsers, and the default high-quality setting was restored.
- Guardians now use bounded A* routes around movement obstacles, with swept edge clearance, last-visible-position memory, and a return to their encounter area after losing contact. A search expands at most 32 nodes per slice, with two slices allowed per frame. Browser-assisted movement checks routed a guardian around a sanctuary wall in each of the eight chapters; unit tests cover closed/reopened gates and returning home. Broader navigation and encounter playtests remain necessary.
- The camera retains individual primitive collision bounds before masonry is merged for rendering. Static surfaces use a spatial index; moving gate groups update their transforms. The camera retracts immediately before an obstruction and extends smoothly after it clears. Browser queries checked all 69 gates: each blocked the view while lowered and cleared it when raised. Unit tests cover overhead beams, rotated walls, pillar gaps, and actor exclusion. Imported vegetation and scanned rocks are not part of this camera surface set.
- Exact segment checks against movement obstacles prevent thin walls from falling between sight samples. The same sight predicate muffles obstructed sound sources. The score's danger cue now follows nearby active encounters and releases after the guardian loses contact; unaware guardians do not trigger it.
- The navigation/camera production build launched, accepted keyboard movement, and saved the changed position when paused. Reloading offered Continue expedition with that position retained. Chromium reported no console errors or warnings. As with previous runs, the browser uses software rendering, so this smoke check does not establish a hardware frame rate.
- There are now 61 paired guardian encounters (122 guardians), using four archetypes and eight chapter-specific patterns. Melee attacks telegraph their strike, hunters commit to a charge, sentries fire physical bolts, and shield keepers expose a recovery window or can be flanked. Projectiles sweep against cover; repeated shots do not continually cancel an attack windup.
- A stamina-funded dodge is available on keyboard and touch controls. Browser checks started it with the R key and with touch. A development-assisted warden encounter showed its warning, then a sideways dodge avoided the strike at full health. Death clears an unfinished climb/dodge and gives a brief recovery window at the checkpoint.
- All 69 sectors have a trap tied to a field station, with eight distinct regional mechanics: blade, darts, falling ice, pressure jet, furnace vent, crosswind, crystal beam, and ground pulse. Their active phases rendered in all eight chapters. A browser interaction check restored the desert field station and disabled its dart trap; unit tests cover disarming after save normalization.
- Two-finger input was exercised through Chromium's touch protocol: holding forward while tapping Dodge spent 28 stamina, and releasing Dodge preserved forward input until that finger was released. Mobile notices no longer intercept input or cover the touch buttons.
- The updated production build launched in Performance mode, displayed the R control, and a keyboard dodge changed the stamina HUD to 72%. The smoke test reported no console errors or warnings. Its test-created progress was cleared and the original high-quality default restored.
- Combat and trap cues are positional. Vent fire emitters follow the vent's active state. Trap and weather particles now have soft round silhouettes; the swinging blade uses a beveled cutting profile.
- The play-time counter and ten-second autosave interval now record active wall time even when the simulation caps a slow frame's delta. Existing recorded history is retained, so older saves may undercount time spent under slow rendering. This change improves measurement; it does not demonstrate one-hour chapter pacing.
- Continuous sampled terrain replaces the flat tiled surface. Mountain and cloud-city room elevations span over 30 m, field tower foundations stay flat, and regenerated chapters reproduce the same heights. Ground, paving, and cliff textures blend across the surface; stone edges are beveled and texture scale follows object dimensions.
- Broadleaf and fir assets now have two distance-selected detail versions, with conversions that retain foliage coverage. Ferns, shrubs, and grass clusters dress path edges and banks. Spatial culling limits small vegetation draw distance; foliage and grass have wind animation.
- Medium/high quality use HDR bloom and antialiasing; high adds contact occlusion. Transparent effects and cutout foliage are excluded from the contact buffer. Fire uses animated shaders and four nearby light slots. Weather volumes follow player elevation.
- All eight chapter environments rendered through the medium pipeline in Chromium. The jungle high-quality pipeline was also exercised. A mountain tower reached 2.8 m and 5.6 m above its new terrain foundation. These were selected viewpoints and development-assisted checks, not full chapter playthroughs.
- Static field-station and gate parts now batch by material. A browser check restored a gate's three field actions, observed its door reach approximately 8 m, and confirmed its collision height became zero while animated station cores stayed attached.
- After vegetation preservation and batching, the checked mountain view reported approximately 0.80 million triangles and 457 calls across the rendering work. Geometry counts are diagnostics, not evidence of a supported frame rate or AAA quality.
- The preceding graphics build launched with high quality enabled, accepted keyboard movement, paused, and persisted the changed position without console errors or warnings. The test browser reported ANGLE/SwiftShader software rendering and was slow at high quality. Hardware-accelerated frame-rate testing is still required. Test-created browser progress was cleared afterward.
- All 207 field actions across eight chapters were exercised through the engine interaction path; the corresponding 69 sanctuary stages advanced. These tests used development positioning and direct puzzle completion after the separate solver tests.
- A closed sanctuary rejected premature puzzle completion. After its three field actions, its physical gate rose and its collision barrier cleared.
- Two-tier tower tests in jungle, snow, sky, and crystal chapters reached 2.8 m and then 5.6 m through the actual mantling methods. A regression test now covers selecting the upper ledge instead of repeatedly selecting the lower one.
- A restored water circuit lowered its reservoir by 1.77 m during ten simulated seconds, approaching its 1.8 m drain target. A restored forge cooling circuit marked its lava pool safe.
- Save-file upload and confirmation restored a chapter at stage 2 with 77 health. Mobile audio settings persisted through reload.
- [Audio verification](audio-verification.md) records rendered distance attenuation, stereo reversal, voice limits, score checks, and mix persistence.
- The newly expanded field routes and narrative content improve chapter substance. They still do not establish a one-hour play time. No duration claim is based on source-code size, route length, or accelerated checks.

## Remaining production work

1. Continue authoring more memorable spaces and meaningful traversal chains, environmental mechanisms, encounters, and narrative content throughout each chapter.
   Enemy routes currently use a bounded local search over movement obstacles; broader navigation around complex architecture, combat balancing, and encounter playtests remain necessary.
2. Run blind playtests, record main-path and discovery play times for every chapter, and tune substantive content toward the requested approximately one-hour pacing. Do not introduce mandatory waits to inflate duration.
3. Replace the remaining primitive architecture and simple effects with coherent production assets and animation; develop the procedural guardian kit into bespoke character art, and refine the adapted human character's materials, deformation, and traversal animation.
4. Improve lighting, terrain composition, water, visual feedback, and distant environments; evaluate real-time views against an explicit AAA visual reference.
5. Benchmark supported desktop and mobile GPUs, add geometry and texture level-of-detail policies, and test more browsers, accessibility settings, and input devices.

The original goal must remain open until the duration and graphics requirements are met with stronger evidence.
