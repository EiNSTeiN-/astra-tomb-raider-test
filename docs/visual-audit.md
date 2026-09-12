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

Field stations, optional discoveries, connecting routes, elevated structures,
water interiors and return paths still need systematic current coverage.
Earlier local milestone checks provide useful references, but do not replace
this review. Each moving mechanism also needs inspection in its relevant open,
closed and intermediate states.

## Findings and follow-up

| ID | Observation | Evidence and next action | Status |
| --- | --- | --- | --- |
| VA-01 | Monastery column bases stand above parts of the sloping ground beneath them. | Especially clear behind courts 5–7. Footprint measurements found gaps over 10 cm at 48 of 147 supports, with a largest measured gap of 1.58 m. Center-only foundation placement caused the gaps. [Foundation courses, comparisons and checks](monastery-foundations.md) document the repair, rendered-terrain sampling and production input/reload verification. | Fixed |
| VA-02 | Some court bases stand above sloping ground; desert shafts also have gaps above their slabs. | The footprint investigation found gaps over 10 cm at 15 of 98 jungle piers, 15 of 108 desert piers and 18 of 132 coastal columns. The largest gap was 2.12 m. All 108 desert shafts also had approximately 17 cm of clearance above their slabs. [Court foundations and joint repairs](court-foundations.md) record the correction, 94 reviewed views and production input/reload verification. | Fixed |
| VA-03 | Waterfall landmarks read as narrow freestanding slabs with an unconvincing water source and receiving area. | Visible in jungle, coast and sky court overviews, including the entrances. Rework their construction and water flow while preserving positional sound. | Open |
| VA-04 | Some desert mirror handwheels appear separated from their stands. | Front of desert court 5, including the rightmost instrument. Inspect shafts and mounting from close oblique views and repair confirmed gaps. | Open |
| VA-05 | Repeated plain rear walls and sparse surrounding ground weaken the identity of many courts. | Present throughout the survey, especially in coastal, volcanic, crystal and eclipse courts. Improve composition and architectural detail in the affected spaces, then review the approaches and returns. | Open |
| VA-06 | Bronze gate surfaces show conspicuous horizontal bands in close views. | The desert gate material uses a periodic color term. Check it in motion and replace distracting repetition or aliasing with suitable surface detail. | Open |
| VA-07 | The central observatory pedestal appears to lack contact around portions of its base. | Rear eclipse views. Its cylinder currently starts at the terrain height of its center. Measure the full circular footprint and address exposed gaps. Column foundations have separate footprint sampling and need their own verification. | Open |
| VA-08 | Some roots growing around jungle piers end above the ground. | Close views of court 1's pier at world coordinates 222, 31 show unsupported root ends, visible in the [foundation comparison](court-foundations.md). Inspect the root curves against the local terrain and fit their ends into the soil. | Open |

A view with no recorded finding is not a declaration that its entire area is
finished. The next passes must expand coverage, resolve the observations above,
and confirm playability, persistence and the positional audio after changes.
