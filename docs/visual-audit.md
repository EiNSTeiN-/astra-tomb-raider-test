# Playable-world visual audit

This audit tracks the current acceptance target: eight distinct browser-playable
chapters with local saves, and a rich, polished playable world without observed
placement or geometry defects. There is no minimum chapter duration. AAA is the
artistic direction. **The audit is open.**

## Coverage on September 12, 2026

The first survey captured 154 ground-level observer views, from the front and
rear of all **77 main courts**, at commit `3fafe38`. Every capture used High
graphics, the chapter's terrain and lighting, a valid ground-level walking
position, and fresh chapter progress. The shadow focus and nearby decoration
visibility were updated at each viewpoint. All shaders linked without browser
errors or warnings. All 154 images were reviewed in labeled contact sheets;
selected suspected defects were also inspected at full capture resolution.

These are assisted, static overview views. They do not inspect every face of a
court, the interiors behind closed gates, or an entire traversal route. Camera
positions with nearby obstructions are rejected; larger intervening terrain
and architecture remain visible and may hide part of the intended court.
The source helper is [inspect-world-courts-browser.js](../scripts/inspect-world-courts-browser.js).

| Chapter | Main courts / reviewed overview views | Field stations | Optional discovery areas | Generated path segments |
| --- | ---: | ---: | ---: | ---: |
| The Verdant Veil | 9 / 18 | 24 | 18 | 63 |
| Beneath the Sands | 10 / 20 | 27 | 18 | 73 |
| A Silence of Snow | 9 / 18 | 24 | 18 | 59 |
| The Drowned Kingdom | 10 / 20 | 27 | 18 | 64 |
| A Heart of Embers | 9 / 18 | 24 | 18 | 60 |
| Where Eagles Sleep | 10 / 20 | 27 | 18 | 55 |
| The Night Below | 9 / 18 | 24 | 18 | 64 |
| The Last Meridian | 11 / 22 | 30 | 18 | 74 |
| Total | **77 / 154** | **207** | **144** | **512** |

The [field-station clearance pass](field-station-clearance.md) adds mechanical
checks at 169 generic controls, complete assisted routes through all 21 climbing
courses, and representative rendered views of 16 installations. The
[regional construction pass](regional-field-stations.md) adds front/rear views
of all 169 shared stations, 44 completed states, 16 Low views and 79 close-ups,
including both sides of all 21 climbing controls.
The [field-courtyard pass](field-courtyards.md) adds 352 views of all 148 shared
ground courtyards and their regional fixtures, plus 32,226 sampled approach-lane
positions, occupied-position recovery and stable layout checks across progress
states. Optional discoveries, connecting routes, other elevated structures,
water interiors and return paths
still need systematic current coverage.
Earlier local milestone checks provide useful references, but do not replace
this review. Each moving mechanism also needs inspection in its relevant open,
closed and intermediate states.

The [initial approach/return survey](initial-court-routes.md) adds 164 reviewed
High views from 14 continuous assisted legs in seven chapters. The sky ground
search is incomplete and needs a traversal-aware continuation. The survey
records VA-15 through VA-17 below. The subsequent [jungle chamber pass](jungle-chambers.md)
adds 24 carved exterior faces and their detailed opening/clearance review.

## Findings and follow-up

| ID | Observation | Evidence and next action | Status |
| --- | --- | --- | --- |
| VA-01 | Monastery column bases stand above parts of the sloping ground beneath them. | Especially clear behind courts 5–7. Footprint measurements found gaps over 10 cm at 48 of 147 supports, with a largest measured gap of 1.58 m. Center-only foundation placement caused the gaps. [Foundation courses, comparisons and checks](monastery-foundations.md) document the repair, rendered-terrain sampling and production input/reload verification. | Fixed |
| VA-02 | Some court bases stand above sloping ground; desert shafts also have gaps above their slabs. | The footprint investigation found gaps over 10 cm at 15 of 98 jungle piers, 15 of 108 desert piers and 18 of 132 coastal columns. The largest gap was 2.12 m. All 108 desert shafts also had approximately 17 cm of clearance above their slabs. [Court foundations and joint repairs](court-foundations.md) record the correction, 94 reviewed views and production input/reload verification. | Fixed |
| VA-03 | Waterfall landmarks read as narrow freestanding slabs with an unconvincing water source and receiving area. | All nine structures now have [supplied header reservoirs, regional crowns, deep supports and three lit spill channels](supplied-cascades.md). The subsequent [receiving-pool correction](receiving-shores.md) closes exposed water/terrain boundaries and removes disconnected cloud-city puddles. It records shoreline, drainage, route, positional audio and production save checks. | Fixed |
| VA-04 | Desert mirror handwheels lack an axle connecting them to their stands. | Close oblique views confirmed the missing connection. All 68 mirrors now have cast housings, horizontal axles and rotating hubs. [Mount construction and comparisons](solar-mounts.md) record 17 reviewed views, 77 assisted routes and production turning/movement/save checks. A separate resume-camera issue is tracked as VA-09. | Fixed |
| VA-05 | Repeated plain rear walls and sparse surrounding ground weaken the identity of many courts. | [Regional chamber walls](chamber-walls.md) now give 35 coastal, volcanic, crystal and eclipse chambers 105 detailed outer faces with real recesses, regional surrounds and framed interior panels. The review covers wall/interior views, opening states, footing and camera depth, nearby movement and sound paths. The subsequent [jungle chambers](jungle-chambers.md) add 56 carved recesses across another 24 faces. Initial route views still show plain desert/snow chamber sides, repeated footprints and sparse surroundings; broader composition and route work remain open. | Open; wall treatment improved |
| VA-06 | Bronze gate surfaces show conspicuous horizontal bands in close views. | The shared shader's periodic color term is replaced by filtered irregular oxidation and pitting across six chapters. [Bronze comparisons and measurements](bronze-surfaces.md) document High/Low renders, five gate positions per chapter, camera shifts, an 85.5% reduction at the old stripe frequency in a controlled panel, measured GPU cost and production keyboard/touch pump operation with exact reloads apart from timestamps. | Fixed |
| VA-07 | The central observatory pedestal appears to lack contact around portions of its base. | Three of eleven pedestal footprints had sampled gaps over 10 cm, reaching 1.31 m; 88 column bases had a largest sampled gap of 1.7 cm. [Observatory foundation repairs](observatory-foundations.md) add continuous pedestal footings, extend column bases below their complete footprints and correct stretched pedestal textures. Evidence includes 17,688 terrain samples, 56 reviewed renders, 31 valid assisted routes and four production movement/reload cases. | Fixed |
| VA-08 | Jungle pier roots have blunt, partly exposed ends at the soil. | Rendered-terrain measurements refined the initial floating-root diagnosis: every old endpoint ring touched the ground along at least one edge, but exposed portions reached 28 cm above it. All 54 roots now taper into the ground, with their entire end rings buried at least 17.3 cm. [Root construction and comparisons](ruin-roots.md) record 22 reviewed views and production keyboard/touch save checks. | Fixed |
| VA-09 | Resuming at a close solar control can leave the camera obscured by a handwheel or adjacent receiver column. | Chapters now retain saved look angles and select a clear nearby orbit when the requested view is blocked. The reproduced view improves from 0.81 m to 5.33 m. [Camera comparisons and checks](arrival-camera.md) record all 77 solar controls in both formats, 409 sampled approaches/ledges, ten production input/reload cases and preservation of other save fields during an obstruction correction. | Fixed |
| VA-10 | Volcanic lava pools appear as glowing square sheets above the ground. | All 1,296 sampled points on the four old mesh borders stood 12 cm above the terrain. [Slag pools and shoreline repairs](lava-shores.md) add buried borders, shallow irregular basins, textured crust, damage that follows the exposed surface and solid cooled footing. Verification covers all 615 tests, local routes, visual states, sound-source access and production movement/cooling/reload cases. | Fixed |
| VA-11 | The explorer can walk into a generic field-valve pedestal. | [Field-station clearance](field-station-clearance.md) adds bounded physical solids at all 169 generic stations, preserves control access, recovers occupied saves on a supported surface and protects mantle/cable approaches. Empty sockets retain their saved collision state and delivery makes room for an installed component. | Fixed |
| VA-12 | Generic field stations repeat simple frames, pedestals, wheels and tablets across distinct environments, often on sparse paving. | [Regional field stations](regional-field-stations.md) now add eight crown styles, jointed masonry, mounted wheels, route diagrams, carried cartridges, caged resonators and open bowls at all 169 shared installations. The review covers 477 assisted views while preserving every working position and all 21 climbing routes. The subsequent [field courtyards](field-courtyards.md) add broken corner masonry, regional furnishings and worn paving at all 148 ground sites, with 352 reviewed views, preserved approach lanes and stable layouts across progress states. Central footprints and modular corners still repeat; continuous approach/return and landscape review remain open. | Open; station construction and courtyards improved |
| VA-13 | Backing toward a courtyard pier can crowd the explorer against the camera. | The [close-camera pass](close-camera.md) reproduces the wall slide, follows player translation directly at short camera distances, and fades the explorer and equipment together between 2.2 and 1.5 m. Eight chapter movement checks retain chosen angles and recover the full orbit; aiming, crouching, scope exit, carried fire and reflection checks retain their behavior. | Fixed |
| VA-14 | The Low air-bell ceiling view has a rectangular, banded highlight above its lamp. | Upward rays confirmed coincident bronze and stone faces in both bells. The [ceiling and lamp repair](air-bell-ceilings.md) seats each liner 8 cm below its backing, mounts the lamp in a fitted bronze housing, and matches clearance to the finished cap and circular lamp footprint. Tests, 28 views, full/drained gallery routes and native diving/reload checks verify the repair. | Fixed |
| VA-15 | Initial routes contain repeated steep-sided terrain mounds with abrupt shoulders and broad flat faces. | The [initial route review](initial-court-routes.md) records these forms in the jungle, snow, volcanic, crystal and eclipse chapters. Improve the terrain transitions and recheck dependent structures, vegetation and movement. | Open; terrain composition |
| VA-16 | A tree base appears suspended above the snow approach. | The source scene contained three specimens planted at one height, leaving the observed root centre 2.53 m above rendered snow. [Individual fir placement](fir-grounding.md) seats 269 accepted trees independently, excludes path/working-area intrusions and verifies all lower roots with 164,956 terrain rays. Close views, the snow route and native input/reload checks pass. | Fixed |
| VA-17 | First-court crystal and eclipse pools show conspicuous straight water-sheet edges against the terrain. | [Route images](initial-court-routes.md) expose the boundaries. Measure the full perimeters and inspect the basin geometry before repairing the affected shores. | Open; shoreline investigation |

A view with no recorded finding is not a declaration that its entire area is
finished. The next passes must expand coverage, resolve the observations above,
and confirm playability, persistence and the positional audio after changes.
