# VESPER: The Hollow Earth

An original, browser-based third-person archaeological adventure built with Three.js, Vite, and plain JavaScript. Explore eight connected chapters, decipher ancient mechanisms, climb ruins, face stone guardians, and follow a missing expedition through a forgotten world.

**Current milestone: a playable campaign prototype.** All eight chapters and their completion flow are implemented. The map is revealed as you explore, and surveyed areas persist. The requested approximately one-hour duration per chapter has not been established by human playtesting, and the real-time graphics do not yet reach modern AAA production quality. See [the production status](docs/production-status.md) for the original requirements, evidence, and remaining work.

## Run

Requires Node.js 22.12 or newer. The required runtime assets are included in this repository.

```sh
npm ci
npm run dev
```

Open **http://localhost:5174**. The terminal prints the actual port if another process already occupies it. A browser with WebGL 2 and hardware acceleration is recommended.

```sh
npm run build       # Static deployable website in dist/
npm run preview     # Serve the production build
npm test            # Campaign connectivity, persistence, and puzzle tests
```

Deploy `dist/` to a static host. There is no game server, login, API key, or database. The game code, 3D models, textures, and generated artwork are served locally by the application.

Playable milestones are committed and pushed to [EiNSTeiN-/astra-tomb-raider-test](https://github.com/EiNSTeiN-/astra-tomb-raider-test). See [CONTRIBUTING.md](CONTRIBUTING.md) for validation and publication rules.

In **The Last Meridian**, the optional **Cartographer’s Orrery** lies beside the
cache west of the entry area. Jump onto moving stone crowns, calibrate the Earth,
Moon and Star bearings, and recover the central return chart. **M** shows the
live ring positions; fixed landings preserve progress, and **E / Use** operates
each bearing. The chart opens a direct bridge back. See
[the route and verification](docs/cartographers-orrery.md).
The [physical instrument pass](docs/orrery-operation.md) adds two-hand bearing
turns and a four-leaf bridge that unfolds after recovery. Move or jump to cancel
an unfinished turn; completed calibrations persist.
The [court artwork pass](docs/orrery-court-art.md) adds pale fitted paving,
a broken colonnade, structural supports and quiet positional oil lamps.

In **The Night Below**, the optional **Listening Gallery** lies west of the
entry camp. Follow two, one, then three crystal pulses through its branching
passages; **E / Use** records each memory. Engraved counts support muted play.
Two shortcut shutters open as fragments are recovered; return them to the
entrance tablet. **M** charts the route and **J** keeps the voices. See
[the gallery and verification](docs/listening-gallery.md).

## Controls

| Control                    | Action                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| W A S D / arrow keys       | Move / swim relative to the camera                                           |
| Mouse                      | Look around after clicking the world                                  |
| Z / C · I / K             | Look left / right · up / down without pointer lock                                             |
| Shift                      | Sprint, using regenerating stamina                                    |
| Space                      | Jump; mantle a nearby marked ledge; release a hanging rope            |
| E                          | Interact; hold while jumping to catch a rope; ride an unlocked cable  |
| Right mouse button / V    | Hold / toggle precise shoulder aim                                    |
| F / left click when locked | Fire; directional assistance when the shoulder aim is released                      |
| R + movement direction     | Dodge on firm ground, using stamina; backward if no direction is held |
| B                          | Toggle crouch for quiet movement and slower visual detection          |
| Q                          | Explorer's instinct; reveal nearby points of interest                 |
| H                          | Use a medical supply                                                  |
| M                          | Open the expedition map                                               |
| J                          | Open the field journal                                                |
| Escape                     | Pause / close a dialog / release the pointer                          |

Small screens and devices with touch input have touch movement, turning, jumping, interaction, aiming, firing, dodge, and crouch controls. Toggle Aim, then drag the world to adjust your view while moving or firing with another finger. Keyboard and mouse provide the best experience.

Shoulder aiming brings the camera closer and slows movement to a careful strafe. Aimed shots follow the crosshair, hit the guardian’s posed armor, and stop at cover. A blue diamond means a shield blocked the shot; move around the keeper or wait for its recovery. Pause, traversal and interaction release aim. See [aiming and combat verification](docs/shoulder-aiming.md).

Crouch with **B / Crouch** to move quietly behind guardians. Watch their facing direction, use solid cover, and withdraw when the amber suspicion meter grows. Footsteps and gunfire draw investigation to their source; a lit torch makes you easier to see. Aiming, jumping and dodging return you to standing. See [stealth behavior and verification](docs/stealth.md).

Counterweight stones use **E / Use** to grip or release. While gripping, **W / Up** pushes and **S / Down** pulls; release to walk around to another face.

Desert mirrors use **E / Use** at each numbered handwheel. Follow the reflected sunlight and activate the receiver when it lights up. The sanctuary tablet also offers diagram controls for the same saved mirrors.

The desert’s **Surveyor’s Cleft** branches east from the western survey path.
Climb 37 handholds to three rest terraces and a summit record. **E / Use** grips;
**WASD / arrows** follow the wall. At a broken span, use **Jump + direction**, then
hold **Use** to catch. Release movement and press Jump to mount a terrace.
Rest to refill stamina; a missed catch returns you on belay. The summit’s eastern
return line lowers you to the sand. **M** shows a wall elevation, and **J** keeps
the recovered bearing. See [climbing and verification notes](docs/surveyors-cleft.md).

Mountain bells use **E / Use** at each named pull rope. Read the bellkeeper's tablet, listen to its phrase, and answer according to its repeat, reverse, or shifted-sign rule. The tablet offers replay, reset, activation, and focused controls. Replaying preserves your partial answer.

The cloud city’s eighteen suspension bridges now have **crosswinds**. Rising
striped streamers warn of gusts and show their direction. **B / Crouch** braces
against the push; stand and countersteer for gap jumps. Later spans reverse the
wind or introduce shorter pulses. The safety tether, saved crossings and
winch requirements remain in place. See [crosswind controls and checks](docs/sky-crosswinds.md).

In **A Heart of Embers**, **the Cinder Relay** branches west from the obsidian-hub
station in Black Glass. Open three pressure circuits, ride six pistons and jump
between their crowns to reach a dispatch ledger 24 metres above the settling
floor. **E / Use** operates valves and lift controls; **Space / Jump** crosses
gaps. At a valve, Vesper takes both grips and completes a quarter turn; move or
jump before it finishes to cancel. Completed turns stay saved. Safe galleries
preserve progress, and the ledger releases a return lift.
**M** shows the chamber and **J** keeps its recovered story. See the
[route, sound and verification notes](docs/cinder-relay.md).
The [foundry art pass](docs/cinder-relay-art.md) adds dressed basalt, riveted
platforms, sliding rams, return-lift hardware, pressure gauges and refuge cargo,
with matching images and measured rendering costs.
See [valve operation and hand-contact checks](docs/cinder-relay-hands.md).
The [return-lift levers](docs/cinder-relay-levers.md) now use a visible right-hand
pull; movement cancels an unfinished command, and release follows the moving car.

East of the mountain’s western library trail, **the bellkeepers’ hoist** adds an
optional tomb with two counterweighted lifts, three floors and a broken gallery
jump. Recover a bronze tongue, restore the upper bell and cross to a refuge
archive. **E / Use** operates onboard and landing levers; **M** shows all three
floors. Lift stops and discoveries persist. See the
[tomb and verification notes](docs/bellkeepers-hoist.md).

Jungle glyph drums use **E / Use** to advance through SUN, ROOT, RAIN and MOON;
**Shift + E** turns backward. Read each court's covenant and satisfy every
inscription before activating its sun gate. Counts, matching pairs, exclusions and
different-sign groups replace the former repeated dialog-only sequence. Focused
controls offer both directions and share the same saved unfinished turns.

The jungle's beacon chains now need a carried flame. Press **T** (Torch on touch)
near a campfire or a burning brazier, then **E** (Use) at the next beacon.
Swimming or using both hands puts the torch out; completed beacons stay lit and
can relight it. The carried flame, saved progress and moving crackle follow the
same world state. See [torch relay notes](docs/torch-relays.md).
The five relay stops have distinct carved crowns, open bronze bowls and glowing
coals, with solid columns that also obstruct sound. See the
[shrine comparison and verification](docs/jungle-shrines.md).

South of the jungle's entrance camp, **the Rainkeeper's causeway** adds an
optional flooded tomb. Swim to six handwheels, turn their bronze channels to
lower connecting crossings, then carry fire along a dry route to three lamps.
Their flames open an archive containing a new journal record. **M** shows the
local crossing map; **Space toward a platform corner** climbs out of the water.
Vesper reaches for each wheel with both hands; move away before the quarter-turn
finishes to cancel. Completed wheel positions, burning lamps and the recovered
record persist independently.
See [the causeway guide and verification](docs/rainkeeper-causeway.md).

## Campaign

All chapters can be selected from the expedition screen and maintain independent progress.

| Chapter             | Setting                    | Main objective and puzzle discipline                      | Map structure                               |
| ------------------- | -------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| The Verdant Veil    | Cambodian jungle sanctuary | Restore sun gates by deciphering relational glyph ciphers | Branching ruins with loops and side shrines |
| Beneath the Sands   | Buried Arabian desert city | Route sunlight through mirrors                            | Radial courts and connecting passages       |
| A Silence of Snow   | Himalayan monastery        | Climb sanctuaries and answer transformed bell phrases     | Mountain switchbacks                        |
| The Drowned Kingdom | Flooded Aegean palace      | Route water through nine cistern circuits and restore sluices | Island courts and causeways                 |
| A Heart of Embers   | Volcanic forge             | Match eight firing patterns through linked thermal valves | An inward spiral                            |
| Where Eagles Sleep  | Andean cloud city          | Restore winches and wind channels; cross suspension bridges | Alternating cliff courts and ravines       |
| The Night Below     | Crystal caverns            | Tune eight relational resonance arrays and recover stored memories | Enclosed chambers and winding tunnels       |
| The Last Meridian   | Celestial observatory      | Align coupled orbital rings                               | Concentric citadel routes                   |

The campaign contains 69 main mechanisms, 207 ordered field actions across 69 sectors, eight chapter relics, 96 distinct journal pages, and 48 supply caches. Each sector has a three-station field route that opens a physical sanctuary gate. Routes include transporting components, 22 elevated routes with mantles, jump gaps, swinging ropes, and unlockable return cables, valves, winches, beacon fires, surveys, and resonance stations. Water objectives drain reservoirs; cooling circuits turn hazardous lava into safe surfaces. Each main mechanism becomes a checkpoint; camps heal and replenish supplies. Falling in combat returns you to your last checkpoint while preserving discoveries.

There are 61 paired guardian encounters, with chapter-specific combinations of melee wardens, charging hunters, ranged sentries, and shield keepers. Glowing ground marks precede attacks; charges and bolts commit to the position marked during the warning. Shield keepers resist frontal shots until they recover from a strike, and can also be attacked from behind. Dodging costs 28 stamina and grants a short evasion window. It requires firm ground and free hands. The sidearm has unlimited ammunition with a short firing cooldown.

Each chapter's first sanctuary also has a physical counterweight chamber, with a distinct wall layout and receiver rules. Push and pull carved stones to match named sockets, balance weighted receivers, or keep specified tracks empty. Satisfying every receiver lifts the cage around the rear mechanism. Entrance tablets explain the rules, show receiver progress, and offer a chamber reset. Stone friction and pressure plates have positional audio; the score adds its quiet lifting accent during a grip. Every settled move saves. See [counterweight chamber notes](docs/counterweight-chambers.md) for all eight designs and verification.

On an elevated route, hold E (Use on touch) while jumping toward the hanging rope. Directional input builds the swing; the prompt indicates when releasing Space (Jump on touch) should reach the far ledge. Restored summit stations unlock a return cable. A missed crossing recovers at the last secure ledge, and reloading during a swing restores that ledge. Cable sounds follow the rider, and the score uses its climbing arrangement during the crossing.

The 22 climbing routes now have fitted masonry piers, recessed panels, stepped
capstones and braced timber or iron hoists. Swiveling eyes follow the swinging
ropes, with local friction sounds that fade with distance and become silent at
rest. The same jump and landing locations retain saved traversal progress.
See [climbing construction notes](docs/climbing-construction.md).

Return cables have braced departure and arrival terminals, grooved roller
carriages, separate hand grips and a departure winch. After dismounting, the
carriage returns automatically for reuse. Rolling friction follows the carriage;
the winch sounds at its own position during the return. Both fade with distance
and stop at rest or on pause. Reloading an interrupted ride restores the secure
summit. See [return cable notes](docs/return-cables.md).

The explorer's palms, fingers and thumbs now fit the cable grips, with support
struts placed outside the hands. The grip releases back to the base animation
after dismounting. See [hand-grip views and verification](docs/hand-grips.md).

The Drowned Kingdom now includes free diving and five sunken tidekeeper records.
Follow bronze floats and bubble trails, hold X to descend and Space to rise,
watch your air, and recover records with E. The journal preserves the recovered
story; reloading a dive returns you safely to the water surface. Underwater sound
is muffled and the chapter score becomes more sparse. Touch players have Dive,
Rise and a journal link in the pause menu. See [diving and archive notes](docs/diving-archive.md).

A submerged memorial gallery now extends west from the first sounding well.
Follow its bronze survey line, breathe in two air bells, swim through a collapsed
colonnade, and open the emergency gates to recover a copper evacuation record.
The gallery has its own exploration map, positioned drips and moving gate sounds,
and reloads return to the last bell where you breathed. See
[memorial gallery notes](docs/sunken-gallery.md).

Enclosed gallery views now skip hidden exterior surfaces while keeping the full
palace shadow casters and the visible entrance. Matched High and Performance
views retain identical pixels with substantially fewer draw calls. See
[gallery rendering measurements](docs/gallery-rendering.md).

Guardians route around cover, investigate the player's last visible position, and return to their encounter area after losing contact. Their route searches run in small frame slices. The follow camera retracts before captured ruin walls, pillars, overhead beams, and moving gates, then extends smoothly when the view clears.

Guardians now have carved masks, layered stone armor, articulated limbs, and distinct maces, forearm blades, staffs, and shields. Foot placement follows the terrain, and their poses show each attack and recovery window. Eight regional material palettes weather their stone and metal. Nearby models use about 20–22 thousand triangles, while distant models retain the silhouette at roughly 30% of that geometry; each guardian uses three character draw calls. Staff bolts and shot tracers now align with the visible lens, shield, and chest core. See [guardian art notes](docs/guardian-art.md) for verification and remaining limits.

Liquid pools have excavated beds and shallow banks. Vesper automatically swims in deeper water, can climb a nearby ledge with Space, and resumes at the water surface after reloading a swimming save. Completing hydraulic work lowers the reservoir and exposes its banks; that drainage restores immediately on load. Animated surface normals, depth-dependent color and transparency, shoreline foam, stroke ripples, waterfall ribbons, spray, and mist replace the earlier flat water treatment. High quality captures a single nearby planar reflection at 512 px, at most once every three active frames; other settings use a sky-color reflection approximation.

The 28 base camps now have stone fire rings, charred timber, glowing coals, fitted supply chests, rolled bedding and small expedition equipment. Animated flame tongues, embers and light smoke use the existing positioned fire sound. Resting and torch lighting keep their familiar controls; the chests now have solid footprints. See [camp artwork comparisons](docs/camp-art.md) for verification and rendering cost.

The 154 courtyard braziers have framed stone supports, regional ornament, weathered basins, rolled rims, handles and glowing fuel. Nearby and distant models share instanced material groups; fire, smoke and embers retain the existing positioned recordings. The supports are solid and older saves inside them recover on nearby clear ground. See [brazier artwork comparisons](docs/brazier-art.md).

The jungle, desert, coast and cloud city now have 33 regional perched birds with layered feathers, planted feet and quiet head/wing movements. Corrected perches bring the jungle birds out of the masonry and align their visible bodies with the positioned sound. See [bird artwork and placement notes](docs/bird-art.md).

Vesper now uses a human mesh with textured skin and hair, weathered olive clothing, and fitted expedition equipment. Blocked movement settles into idle; [locomotion notes](docs/explorer-locomotion.md) record the animation and collision checks. Retargeted locomotion fits the boot height while preserving the running clip’s airborne phase; arm and leg poses support swimming, jumping, mantling, ropes and cables. Firing draws a visible sidearm with a two-hand grip. The character remains an adapted base model with procedural pose overlays; see [character art notes](docs/character-art.md).

The jungle sanctuaries now have supported stone arcades, recessed botanical carvings, weathered blocks, broken roof sections, and varied side galleries. Fine relief detail has a shorter draw distance than the structural masonry. Older saves made inside a newly added support recover on nearby clear ground.

Eight authored glyph covenants occupy these sanctuaries' forecourts, with 42
four-faced stone drums, working handwheels, relief signs and shared inscription
tablets. Four- to six-drum deductions progress from following a cycle to combining
counts, matching pairs and exclusions. Stone sounds follow each turning drive,
and unfinished work saves after every turn. See [covenant court notes](docs/cipher-courts.md).

Scattered rocks now fit their scanned undersides into the terrain across all chapters. Unsupported placements on sharp banks are rejected, and their footprints reserve space around objectives, guardian starts, structures and water. [Rock grounding notes](docs/rock-grounding.md) show the corrected overhangs and the resulting reduction in scatter density.

The jungle has denser woodland along route edges, two scanned broadleaf tree forms, fern and shrub clusters, and roots with climbing leaves on ruin piers. A moss-and-leaf-litter material blends into worn trails and stone courts. Its daylight sky shares a sun direction with scene lighting. Trees, shrubs, ferns, and rocks use per-instance distance selection. Three tree tiers preserve near detail, with short dithered transitions and matching wind in leaf shadows. [Rendering workload notes](docs/rendering-budget.md) record a 69% reduction in submitted triangles at the low-quality jungle spawn. These additions improve environmental dressing; they do not establish AAA visual quality or a supported hardware frame rate.

Each sector also has an environmental trap connected to a field station: swinging blades, dart galleries, falling ice, pressure jets, furnace vents, crosswinds, sweeping crystal beams, or expanding ground pulses. Traps have visible warning and clear intervals. Restoring the connected station disables its trap, and that state follows the existing field-progress save. Beams and pulses can be jumped; crosswinds push against movement and consume stamina. Keyboard and touch controls both support dodging. Touch movement stays held while another finger uses an action button.

The terrain now blends color, surface normals, and roughness consistently across ground, paving, and cliffs. The jungle adds mottled moss, damp variation, and worn paving edges guided by a stone height map. Switching graphics quality refreshes shadow receivers correctly. [Terrain material notes](docs/terrain-materials.md) include comparisons, asset sources, and verified shader limits.

High quality skips an unnecessary second directional-shadow render during contact occlusion. All eight matched views retained identical pixels, and the first Radeon 780M measurements now provide a hardware baseline. See [hardware rendering notes](docs/hardware-rendering.md) for the per-chapter work reduction, timing variation, and development benchmark helper.

The desert city now has ten sandstone courts with pointed arches, carved solar panels, varied galleries, and broken cornices. A hazy daylight sky also supplies reflections for its metalwork. Curved palm trunks and individually modeled leaflets replace the old branch clusters, with three distance-selected detail tiers and matching wind in their shadows. Bird models and positional emitters sit on the new stone perches. [Desert art notes](docs/desert-art.md) include the rendered comparisons, asset sources, collision checks, and performance limits.

The desert landscape now has warm ripple-textured sand, dust entering the paving,
layered exposed sandstone, and separate distant dune and escarpment ranges.
Off-path erosion preserves the walking surfaces, reservoirs and climbing anchors.
See [desert landscape comparisons](docs/desert-landscape.md) for the rendered
change, added geometry cost, positional-audio checks and saved-climb recovery.

Desert boulders now sit in the terrain using their sampled undersides and share
its sandstone material. Small rubble gathers around piers and banks, with larger
stones kept outside the walking cells. A smaller geometry-only rock asset replaces
the moss-textured model in this chapter. See [stone placement comparisons](docs/desert-scatter.md)
for route checks, rendering measurements and production save/reload evidence.

The Himalayan monasteries now have supported timber bell pavilions, whitewashed upper halls, lattice windows, covered galleries, and damaged slate roofs carrying uneven snow. Wind moves the hanging cloth and its shadows; nearby wind audio comes from the banner lines. A cooler daylight sky lights the buildings against ridged alpine peaks. [Monastery art notes](docs/monastery-art.md) include the rendered comparisons, material sources, approach checks, and production save/reload verification.

Eight playable bell racks now occupy the mountain's mechanism courts. Their 32 bronze bells swing above working ropes and pulleys, with brief hand poses when the explorer pulls a grip. Eight composed phrases use four response rules and share saved answers between the world and focused controls. Bell strikes have positional decay, obstruction filtering, and steady audio-clock timing beneath the quiet mountain score. Visual signs and flashes support play without hearing the notes. [Bell lesson notes](docs/bell-courts.md) include browser views, measured audio falloff, control routes, and release evidence.

The flooded palace now has ten courts with fluted columns, open stone arcades, broken barrel vaults, blue plaster, shell carvings, and mosaic paving. Its daylight sky opens onto the sea, and shoreline scrub replaces trees that were incorrectly rooted underwater. Birds perch on visible stone brackets; draining water retains its matching waterfall and sound position. [Palace art notes](docs/palace-art.md) include comparisons, material sources, and verification.

Nine hydraulic circuits now occupy those palace courts, with 27 open cisterns, turning handwheels, overhead pipes, floating gauges and visible water transfers. Different capacities and check valves lead to a final one-way circuit. Physical pumps and focused controls share saved quantities and selected sources; the tablet activates each balanced receiver. Pump and falling-water sounds follow their machinery and fade with distance beneath the quiet palace score. [Hydraulic court notes](docs/hydraulic-courts.md) include the nine measures, browser views, movement checks and measured audio falloff.

Limestone paving now extends across the palace floors and follows the actual causeways. Worn teal mosaic borders and floral medallions distinguish the courts, and the ground's wet staining follows draining reservoirs. Revised coastal daylight gives the arcades clearer shadows; thin grout detail softens at distance. [Coastal ground notes](docs/coastal-ground.md) include before/after views, drainage checks and rendering limits.

The volcanic forge now has nine furnace halls with recessed fireboxes, corroded metal hoods, hollow chimneys, overhead pipes, and rotating toothed gears. An ash-cloud sky, eroded caldera rim, dark paving, and moving lava crust establish its volcanic setting. Saved objectives control furnace glow and rumble, coolant steam and pressure hiss, and gear motion. Positional emitters follow their visible machinery and retain the quiet adaptive score. [Forge art and sound notes](docs/forge-art.md) include comparisons, source records, distance measurements, and release save/reload verification.

Eight physical regulators now occupy the forge forecourts. Their 102 chambers use six different coupling rules and engraved HEAT / COOL targets, progressing from a cold manifold to an alternating heart-engine pattern. Turn handwheels with E or Use, watch linked shutters and coolant outlets respond, and activate the completed pattern at its record tablet. The optional focused controls share the same saved state. Hot chambers emit restrained mechanical rumble, changing shutters release short localized steam, and the score adds its quiet working accent during a turn. [Thermal regulator notes](docs/thermal-regulators.md) describe the designs, access checks, audio falloff and save verification.

The sky chapter now crosses real ravines on eighteen suspension bridges between alternating cliff courts. Restoring marked winches and route anchors lowers the linked decks. Later bridges have missing boards to jump; a visible safety tether returns a missed crossing to the last bank. Wind and rope creaks come from the spans, with creaking responding to deployment and the explorer's presence. Supported bridge positions persist, while older map saves retain progress and resume at a safe sector bank. [Sky bridge notes](docs/sky-bridges.md) include rendered views, movement checks, distance measurements, and save verification.

The bridge anchors now match the fitted-stone city, with supported timber headers, bronze cable drums, weathered deck boards and rope lashings. Turning drums have nearby positional creaks that stop when deployment settles. [Bridge construction notes](docs/sky-bridge-art.md) describe the art, sound and verification.

Layered Andean-inspired ranges now surround these crossings, with slowly moving high clouds and a displaced cloud bank below the routes. Warmer direct light and cooler fill distinguish bronze machinery from stone; local waterfalls retain their surfaces and positioned sounds. [Cloud-city atmosphere notes](docs/cloud-city-atmosphere.md) include matched views, geometry costs and clearance checks.

The [mountain relief pass](docs/andean-ridges.md) adds irregular crests, branching
gullies, fractured rock and baked mountain shadows. It also corrects depth
ordering between slopes while keeping the distant ranges behind playable scenery.

Ten fitted-stone citadels replace the cloud city's original round pillars and stacked pyramids. Trapezoidal gateways, recessed niches, surviving side wings and broken upper walls vary their silhouettes. Bird models and emitters share perches on their forward caps. [Citadel notes](docs/sky-citadels.md) describe the original masonry and its integration checks.

The nine cloud-city mechanism chambers now share that masonry, with recessed niches and framed timber wind screens. Bronze straps, hinge barrels and drives move with the opening leaves; their positional creaks follow motion and stop at rest. [Sky gate art notes](docs/sky-gate-art.md) include closed/open views, sound approaches, material details and verification.

Nine physical wind engines now occupy the cloud-city courts. Their 121 castings include 110 turning ducts and eleven fixed bearings, with four grid sizes and nine distinct routes. Turn the numbered handwheels, follow visible airflow, and activate the receiver when its turbine spins. Air and bearing sounds follow the actual machinery and fade with distance beneath the quiet cloud-city score. Every turn saves, and the focused controls operate the same ducts. [Wind engine notes](docs/wind-engines.md) describe the layouts, controls, persistence and verification.

The crystal chapter now has continuous vaulted rock chambers and tunnels, with clearance for its climbing gantries. Thirty-six faceted mineral clusters replace the former cones; saved resonance work changes their glow, nearby illumination, and positional hum together. Stalactites drip into visible impact rings, with sound and ripples following the water surface as it drains. The chapter uses enclosed reflections and four nearby crystal light slots. [Cavern environment notes](docs/caverns.md) include comparisons, collision checks, sound measurements, and production save/reload verification.

Eight playable resonance arrays now occupy the cavern forecourts, with 33 mounted crystals in arcs, opposed banks, a diamond and a spiral. Engraved relations connect their twelve tuning marks. Turn collars with E / Use, or hold Shift with E to turn downward; the focused controls offer both directions. Paired tones converge as each crystal reaches its stored voice, and visible rings settle into unison for play with sound muted. Each completed array reveals a memory fragment that remains in the journal. Every turn saves, and the quiet crystal score leaves room for tuning. See [resonance array notes](docs/resonance-arrays.md).

The final observatory now has eleven stone arcades with hinged bronze domes and graduated orbital instruments beneath an eclipsed sky. Field work opens the shutters, and turning a puzzle ring moves its two linked rings in the world. A focused camera keeps the instrument visible beside the controls; unfinished alignments save after each move. Gear motion and restoration drive nearby mechanical and harmonic sounds while the chapter's quiet choir score continues. [Observatory notes](docs/observatory.md) include rendered views, save behavior, spatial audio checks, and release verification.

The desert's nine solar circuits now occupy physical forecourts with 68 bronze-mounted mirrors, moving handwheels, visible light paths, and nine receiver controls. Each court has a distinct optical route; field work and the first counterweight chamber unlock the collectors. Mirror bearings respond to motion and receivers hum when illuminated, with distance-sensitive sound beneath the desert's sparse plucked score. Every turn saves, and the optional diagram shares the world controls' state. See [solar chamber notes](docs/solar-chambers.md) for browser views and verification.

The 69 sanctuary gates now have eight regional designs, from carved jungle shutters to mountain timber doors and celestial bronze leaves. Doors descend into floor slots or swing inward, with matching moving collision, rotating drives, three restoration seals, and nearby mechanical sound that fades with distance and stops at rest. Existing field saves restore open gates silently. See [sanctuary gate notes](docs/sanctuary-gates.md) for the rendered designs, input checks and audio measurements.

## Persistence

Chapter startup waits for its required visual files, audio preparation, and first rendered view before allowing play. Loading does not count toward expedition time. You can cancel with Escape or **Back to expeditions**; failed loads offer a retry while preserving your saved progress. A saved expedition that finishes loading after losing focus opens paused. See [chapter startup notes](docs/chapter-startup.md) for implementation and verification.

Progress is stored in browser local storage under `vesper-expedition-v1`. Saves include position and supported height, the last secure traversal ledge, checkpoint, health, medical supplies, discoveries, defeated guardians, mechanism and field-station progress, unfinished mirror/ring alignments, bell answers, cistern quantities and selected pumps, thermal firing patterns and valve turns, crystal tuning marks, recovered memories, counterweight stone positions, carried-component state, chapter completion, elapsed play time, surveyed map cells, and settings. Autosave occurs every ten seconds during play, on important actions, on pause, and when leaving the page.

Settings include save export and import. Importing requires an explicit confirmation because it replaces that browser's save. If local storage is unavailable or full, the game remains playable in memory and reports that persistence is unavailable.

## Soundscape

The world includes positional birds, flowing water, waterfalls, fire, wind, dripping caves, machinery, and crystal resonators. Sources grow louder as you approach, fade to silence at their outer radius, and pan with the camera direction. Masonry and terrain muffle obstructed sources. A maximum of 12 nearby emitters plays at once, with fades between selected sources. Draining reservoirs lowers and quiets their water emitters; cooled lava pools become silent.

Each chapter has an original quiet score with its own scale, tempo, chord progression, melodic motif, and instrument palette. Objective progression changes the voicing; carrying and climbing add different musical accents, while an active nearby encounter introduces a restrained pulse. Unaware guardians do not trigger that cue. Music and ambience duck during puzzles and reading, keeping listening cues clear. Audio suspends in a hidden tab.

Settings provide independent master, music, ambience, and action/puzzle volume controls. All four persist in local storage. Headphones help reveal source direction. Recordings are bundled in the app and credited in Settings and [asset credits](docs/asset-credits.md). See [audio verification](docs/audio-verification.md) for measured checks and limitations.

## Project layout

- `src/main.js` — expedition screen, HUD, dialogs, journal, collection, settings, and input UI.
- `src/game.js` — game loop, movement, collisions, mantling, camera, combat, checkpoints, interactions, and scene generation.
- `src/stealth.js` — crouching, directional sight, player noise, investigation and awareness feedback.
- `src/combat.js` and `src/encounters.js` — guardian encounters, attack timing, projectiles, shields, damage, and dodge movement.
- `src/guardian-art.js` — articulated armor, equipment, weathered materials, shared skinned geometry, distance detail, and terrain-following steps.
- `src/navigation.js` — bounded, incremental routes around obstacles using the movement collision predicate.
- `src/camera-collision.js` — spatially indexed ruin surfaces, moving gate transforms, and swept follow-camera clearance.
- `src/hazards.js` — eight environmental trap types, their visuals, warning cycles, collision checks, and persistent disarming.
- `src/campaign.js` — chapter definitions and deterministic map generation.
- `src/sky-layout.js`, `src/sky-bridge-rules.js`, `src/sky-bridges.js` — authored cliff crossings, ravine/deck support, folding bridges, safety tether, and map-save migration.
- `src/cavern-profile.js`, `src/cavern-geometry.js`, `src/cavern-material.js`, `src/caverns.js` — continuous cave enclosure and collision, faceted minerals, stalactites, positional sources, and saved resonance responses.
- `src/gate-designs.js`, `src/sanctuary-gates.js`, `src/sky-gate-art.js` — regional gate construction, moving leaves and shutters, fitted cloud-city masonry and timber screens, camera surfaces, restoration seals, and positional drives.
- `src/expeditions.js` and `src/field-world.js` — authored field routes, their stations, physical gates, and progression rules.
- `src/journal.js` — 96 chapter-specific narrative discoveries.
- `src/puzzles.js` — eight puzzle state machines, validators, hints, and interfaces.
- `src/hydraulic-rules.js`, `src/hydraulic-geometry.js`, `src/hydraulic-courts.js` — nine directed cistern circuits, saved measures, physical pumps, conserved water animation and positional machinery sounds.
- `src/coastal-layout.js`, `src/coastal-material.js` — palace floor and causeway coverage, worn tessellation, filtered slab shading and water-linked ground wetness.
- `src/thermal-courts.js`, `src/thermal-rules.js` — physical forge regulators, reversible valve circuits, moving shutters, coolant outlets and saved firing patterns.
- `src/wind-courts.js`, `src/wind-rules.js`, `src/wind-rendering.js`, `src/wind-art.js` — physical wind engines, rotating ducts, airflow traces, fixed bearings, saved channel routes, detailed bronze machinery, instance batches and shared inscriptions. See [wind art notes](docs/wind-art.md) and [rendering and ground verification](docs/wind-rendering.md).
- `src/resonance-courts.js`, `src/resonance-rules.js` — physical crystal arrays, relational inscriptions, tuning collars, paired tones and recovered memories.
- `src/counterweight-rules.js`, `src/counterweights.js` — eight physical stone chambers, receiver rules, push/pull movement, poses, and recovery.
- `src/visuals.js` — PBR materials, architecture batching, procedural palms, and panorama.
- `src/vegetation.js`, `src/instance-lod.js` — scanned vegetation, distance tiers, instance culling, and dithered transitions.
- `src/terrain.js` — continuous chapter elevation, level foundations, and distant ridges.
- `src/terrain-material.js` — matching ground, paving, and cliff material layers, moss coverage, and height-guided transitions.
- `src/groundcover.js` — spatially culled grass clusters and wind animation.
- `src/habitat.js` — deterministic woodland/undergrowth placement and a worn-trail mask.
- `src/explorer.js`, `src/pose.js` — human character loading, equipment materials, locomotion, limb poses, and the visible sidearm.
- `src/character-motion.js`, `src/traversal-courses.js`, `src/traversal.js` — world-space jumping, elevated routes, rope physics, return cables, and ledge recovery.
- `src/pose.js` — hand placement on moving rope grips.
- `src/temple-architecture.js` — chamfered masonry, corbelled galleries, carved relief, and weathered temple materials.
- `src/ruin-growth.js` — roots, hanging tendrils, and animated climbing leaves.
- `src/palace-architecture.js`, `src/palace-geometry.js`, `src/palace-material.js` — fluted columns, broken vaults, tidal stone weathering, and coastal court plans.
- `src/forge-architecture.js`, `src/forge-geometry.js`, `src/forge-state.js` — furnace halls, original machinery, and saved-objective heat, steam, and motion.
- `src/forge-effects.js`, `src/forge-sky.js`, `src/forge-caldera.js` — fireboxes, lava crust, plumes, ash clouds, and an eroded volcanic rim.
- `src/monastery-architecture.js`, `src/monastery-roof.js`, `src/monastery-cloth.js` — supported timber halls, damaged snow-covered roofs, and animated banners with matching shadows.
- `src/snow-mountains.js` — ridged alpine background geometry and slope-dependent snow.
- `src/atmosphere.js`, `src/cloud-city.js`, `src/andean-geology.js` — regional daylight, sky reflections, eroded Andean ranges with baked illumination, and drifting cloud banks. See [cloud-city atmosphere notes](docs/cloud-city-atmosphere.md) and [mountain relief](docs/andean-ridges.md).
- `src/sky-masonry.js`, `src/sky-architecture.js` — fitted, beveled masonry with recessed joints, trapezoidal gateways, niches and varied cloud-city ruins.
- `src/rendering.js` — bloom, high-quality contact occlusion, antialiasing, and quality tiers.
- `src/effects.js` — animated shader fire and nearby fire lighting.
- `src/landmarks.js` — architecture specific to each environment.
- `src/storage.js` — validated local saves and import/export.
- `src/audio.js` — spatial audio, local recordings, adaptive composition, mixing, and effects.
- `src/sound-landmarks.js` — visible sound sources, waterfalls, bird perches, and emitter placement.
- `tests/` — campaign connectivity, field progression, journal uniqueness, traversal, audio, persistence, and puzzle checks.
- `asset-sources/` — source manifests, licenses and original edited character artwork. Raw downloads and conversion intermediates are ignored by Git and excluded from the website build; the scripts can restore them when needed.

The development build exposes `window.__vesper` for inspecting and testing the game. This hook is removed from production builds.

## Art and dependencies

Campaign key art, chapter artwork, and the jungle panorama were created using the built-in image generation tool. The final files and prompts are documented in [art prompts](docs/art-prompts.md).

Scanned environment assets are from [Poly Haven](https://polyhaven.com), whose asset license is [CC0](https://polyhaven.com/license). The human character uses [MakeHuman CC0 graphical assets](https://static.makehumancommunity.org/about/license.html), fitted equipment, and a generated clothing texture. Its locomotion is retargeted from Mixamo Vanguard animation in the [Three.js r180 Soldier example](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Soldier.glb). Adobe permits Mixamo characters and animation in games under its [Mixamo usage terms](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

See [asset credits](docs/asset-credits.md) for individual sources, licenses, and reproduction instructions. This is an original game and does not include Tomb Raider characters, story, branding, or game assets.
