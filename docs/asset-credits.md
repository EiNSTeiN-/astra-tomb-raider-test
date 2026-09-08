# Asset credits and provenance

The shoulder camera, precise hit queries, reticle, touch look controls and pitched sidearm pose are original code changes. They reuse the existing credited explorer asset, original sidearm and guardian geometry, and original synthesized effects. No new external models, textures, recordings or generated artwork were introduced. See [shoulder aiming notes](shoulder-aiming.md).

The five jungle flame shrines in `src/jungle-shrines.js` are original code-authored geometry: chamfered masonry, botanical reliefs, stepped crowns, open fluted bowls, rings, fuel and sparks. They reuse the original temple geometry and its existing credited material maps; bronze patina and sparks are procedural shaders. The existing credited `fire.ogg` remains their sound source. No new external assets or recordings were introduced. See [shrine art notes](jungle-shrines.md).

The jungle’s carried resin torch, bindings and wrapped head are original code-authored geometry in `src/torch.js`. Its hand pose reuses the calibrated cylinder grip; lighting and flame rendering reuse the original fire shader. Its positioned crackle uses the existing credited `fire.ogg` recording. No new external assets were introduced. See [torch relay notes](torch-relays.md).

The cloud-city gate walls, niche reveals, timber screens, hinge straps, pin barrels and wind crests are original code-authored assets in `src/sky-gate-art.js`. They reuse the existing credited rock, temple and monastery timber maps, the original fitted-stone generator and the wind machinery's bronze shader. No new external assets or recordings were added. See [sky gate art notes](sky-gate-art.md).

The cloud-city citadels, fitted polygonal stone geometry, trapezoidal portals, recessed niches and broken upper walls are original code-authored assets in `src/sky-masonry.js` and `src/sky-architecture.js`. They reuse the credited local rock and temple maps. The new perches reuse the existing bird models and recordings. No new external assets were added. See [citadel notes](sky-citadels.md).

The cloud-city sky, three Andean-inspired ridge layers and drifting valley cloud bank are original geometry and shaders in `src/cloud-city.js`. The ridges reuse the existing credited rock map. No new external image, model or sound files were added for this environment pass. See [cloud-city atmosphere notes](cloud-city-atmosphere.md).

The wind-engine castings, collars, rotating grips, braces, supports, turbines, channel rules and inscriptions are original to this repository. Their detailed mechanical kit and dedicated cast/worn bronze shader are in `src/wind-art.js`. They reuse the existing credited rock maps and original procedural wind/mechanical sounds. No new external assets were added. See [wind engine notes](wind-engines.md) and [wind art notes](wind-art.md).

The hydraulic cisterns, handwheels, pipes, gauges, plaques and falling-water shader are original code-authored assets. They reuse the credited palace stone and mosaic maps, existing original patinated bronze and water materials, procedural mechanical sound and bundled stream recording. Their construction and source reuse are described in [hydraulic court notes](hydraulic-courts.md).

The coastal floor layouts, braided mosaics, floral medallions, slab shading and wetness code are also original to this repository. They reuse the existing palace stone and mosaic maps. [Coastal ground notes](coastal-ground.md) record the surface work and matching daylight changes.

## Generated artwork

The submerged memorial’s evacuation-boat relief is original generated artwork, created with the built-in image generation tool and converted into shallow geometry by `scripts/build-memorial-relief.mjs`. Its runtime asset is `public/assets/memorial/evacuation-relief.glb`; [the exact prompt](art-prompts.md#memorial-relief) and `asset-sources/memorial/sources.json` retain provenance. The surrounding vaulted masonry, frame, offerings, altar and suspended lamp are original geometry in `src/memorial-art.js`, reusing the credited palace stone maps and original bronze materials. No new audio assets were added. See [memorial art notes](memorial-art.md).

The generated campaign artwork is original to this project. It was created using the built-in image generation tool. Final local paths and generation prompts are in [art-prompts.md](art-prompts.md).

- `public/assets/verdant-temple.png` — cinematic expedition-screen key art.
- `public/assets/chapter-atlas.png` — eight painted chapter environments.
- `public/assets/jungle-panorama.png` — an environment-lighting texture for the jungle. The jungle and cloud city's visible skies now use real-time daylight shaders; the cloud city also captures its shader sky for environment lighting.

## Environment scans and PBR materials

The public repository includes runtime assets, source manifests, licenses and the original edited character artwork. References below to retained original downloads describe the local development workspace: those raw downloads and conversion intermediates are Git-ignored and can be restored with the asset scripts. They are not required to run the checked-in game.

These assets are published by Poly Haven under [CC0](https://polyhaven.com/license). Materials use local color, OpenGL normal, and roughness maps at the 1K and 2K resolutions recorded below. Static meshes use optimized, locally embedded GLB files.

| Asset                                                 | Source                                                      | Local asset                                  |
| ----------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Forest Ground 04                                      | [Poly Haven](https://polyhaven.com/a/forest_ground_04)      | `textures/ground-*`                          |
| Forest Leaves 02 — Rob Tuytel                         | [Poly Haven](https://polyhaven.com/a/forest_leaves_02)      | `textures/forest-*` (2K)                     |
| Worn Rock Natural 01 — Dimitrios Savva and Rob Tuytel | [Poly Haven](https://polyhaven.com/a/worn_rock_natural_01)  | `textures/temple-*` (2K)                     |
| Sandstone Cracks — Rob Tuytel                         | [Poly Haven](https://polyhaven.com/a/sandstone_cracks)      | `textures/sandstone-*` (2K)                  |
| Sandstone Blocks 08 — Rob Tuytel                      | [Poly Haven](https://polyhaven.com/a/sandstone_blocks_08)   | `textures/sandstone-wall-*` (2K)             |
| Wood Planks — Amal Kumar | [Poly Haven](https://polyhaven.com/a/wood_planks) | `textures/monastery-wood-*` (2K) |
| White Plaster 02 — Rob Tuytel | [Poly Haven](https://polyhaven.com/a/white_plaster_02) | `textures/monastery-plaster-*` (2K) |
| Roof Slates 02 — Rob Tuytel | [Poly Haven](https://polyhaven.com/a/roof_slates_02) | `textures/monastery-roof-*` (1K) |
| Marble Rock 02 — Amal Kumar | [Poly Haven](https://polyhaven.com/a/marble_rock_02) | `textures/palace-stone-*` (2K) |
| Blue Plaster Weathered — Amal Kumar | [Poly Haven](https://polyhaven.com/a/blue_plaster_weathered) | `textures/palace-plaster-*` (2K) |
| Marble Mosaic Tiles — Amal Kumar | [Poly Haven](https://polyhaven.com/a/marble_mosaic_tiles) | `textures/palace-mosaic-*` (2K) |
| Rock Face 03 — Dario Barresi, Rico Cilliers | [Poly Haven](https://polyhaven.com/a/rock_face_03) | `textures/forge-rock-*` (2K) |
| Rusty Metal 04 — Amal Kumar | [Poly Haven](https://polyhaven.com/a/rusty_metal_04) | `textures/forge-metal-*` (2K, including metalness) |
| Volcanic Rock Tiles — Charlotte Baglioni | [Poly Haven](https://polyhaven.com/a/volcanic_rock_tiles) | `textures/forge-paving-*` (2K) |
| Rock Boulder Dry                                      | [Poly Haven](https://polyhaven.com/a/rock_boulder_dry)      | `textures/rock-*`                            |
| Monastery Stone Floor                                 | [Poly Haven](https://polyhaven.com/a/monastery_stone_floor) | `textures/stone-*`                           |
| Mossy Cobblestone                                     | [Poly Haven](https://polyhaven.com/a/mossy_cobblestone)     | `textures/moss-*`                            |
| Snow 01                                               | [Poly Haven](https://polyhaven.com/a/snow_01)               | `textures/snow-*`                            |
| Aerial Sand                                           | [Poly Haven](https://polyhaven.com/a/aerial_sand)           | `textures/sand-*`                            |
| Bark Brown 01                                         | [Poly Haven](https://polyhaven.com/a/bark_brown_01)         | `textures/bark-*`                            |
| Island Tree 02                                        | [Poly Haven](https://polyhaven.com/a/island_tree_02)        | `models/island_tree_02/{near,optimized,distant}.glb` |
| Island Tree 01                                        | [Poly Haven](https://polyhaven.com/a/island_tree_01)        | `models/island_tree_01/{near,optimized,distant}.glb` |
| Fir Tree 01                                           | [Poly Haven](https://polyhaven.com/a/fir_tree_01)           | `models/fir_tree_01/{near,optimized,distant}.glb`    |
| Fern 02                                               | [Poly Haven](https://polyhaven.com/a/fern_02)               | `models/fern_02/{optimized,distant}.glb`               |
| Shrub 01                                              | [Poly Haven](https://polyhaven.com/a/shrub_01)              | `models/shrub_01/{optimized,middle,distant}.glb`              |
| Rock Moss Set 01                                      | [Poly Haven](https://polyhaven.com/a/rock_moss_set_01)      | `models/rock_moss_set_01/optimized.glb`      |

Local paths above are relative to `public/assets/`. Unmodified model sources are retained under `asset-sources/models/`, outside the website's public directory.

The layered terrain also uses two unmodified 2K maps from [ambientCG Ground 037](https://ambientcg.com/view?id=Ground037): `textures/verdure-color.jpg` and `textures/verdure-normal.jpg`. These are covered by [ambientCG's CC0 license](https://docs.ambientcg.com/license/). `textures/moss-height.jpg` is the 1K displacement map for the existing Poly Haven Mossy Cobblestone material; it guides surface blending without changing collision geometry. The original archive, download metadata, URLs, and SHA-256 records are in `asset-sources/terrain-detail/`. Reproduce these files with `python3 scripts/download-terrain-detail.py`.

To reproduce model downloads and geometry optimization:

```sh
python3 scripts/download-assets.py
node scripts/optimize-assets.mjs
node scripts/optimize-tree.mjs
node scripts/build-vegetation-lods.mjs
python3 scripts/download-forest-floor.py
python3 scripts/download-temple-stone.py
```

Mesh optimization uses glTF Transform and Meshoptimizer. The current shrub contains 21,598 triangles, the fern set 4,360, and the rock set 12,614. Their source assets contain 156,012, 6,232, and 63,127 triangles respectively. Increased foliage retention and shorter draw distances replace the earlier, overly sparse shrub and fern conversions.

Additional distant tiers now contain 3,075 triangles for Island Tree 01, 1,724 for Island Tree 02, and 7,566 for the combined fir specimens. Shrub middle/distant tiers contain 5,394/1,310 triangles; the distant fern set contains 2,428. The conversions reuse the same locally credited assets and textures. See [rendering workload notes](rendering-budget.md) for the conversion, crossfades, and measured limits.

The original broadleaf tiers are Island Tree 01 (114,941 near / 15,646 middle triangles) and Island Tree 02 (56,896 near / 8,564 middle triangles). Tree 01's source has 1,599,403 triangles. `preserve-canopy.mjs` reduces each connected leaf to a textured diamond; the distant version samples leaves and expands their area to preserve coverage. The jungle combines both species. Tree detail is selected per instance, preserving all tree placements when quality or distance changes.

Fir Tree 01 includes three tree specimens. Its source has 6,982,937 triangles; the bundled versions have 363,598 and 46,025. `preserve-needles.mjs` samples whole disconnected needles and increases their area for distant coverage. This avoids the nearly bare trunks produced by ordinary triangle simplification. These conversions trade some leaf and needle shape accuracy for rendering cost; they are not production-quality vegetation LODs.

The flooded palace uses nine unmodified 2K maps from Marble Rock 02, Blue Plaster Weathered, and Marble Mosaic Tiles, totaling 24,476,296 bytes. `python3 scripts/download-palace-materials.py` reproduces them and retains source metadata/hashes in `asset-sources/palace-materials/`. The fluted columns, arch stones, broken vaults, capital scrolls, shell carvings, and weathering shader are original project geometry/code. [Palace art notes](palace-art.md) include rendered evidence and verification.

The Himalayan monastery uses nine unmodified color, OpenGL normal, and roughness maps from Wood Planks, White Plaster 02, and Roof Slates 02, totaling 15,584,337 bytes. `python3 scripts/download-monastery-materials.py` reproduces these maps and records source metadata and hashes under `asset-sources/monastery-materials/`. Timber buildings, snow roof shells, bell profiles, geometric cloth motifs, and the alpine range are original project geometry/shaders. [Monastery art notes](monastery-art.md) record implementation and rendered evidence.

The jungle sanctuary blocks, corbelled arcades and botanical relief panels are original procedural geometry in `src/temple-architecture.js`. Their material desaturates the sandstone scan and adds procedural damp staining and moss.

Terrain, clustered grass blades, climbing leaves, roots, shader fire, and the current ruin geometry are generated by project code. The vegetation shaders add restrained wind animation. The jungle sky uses the Three.js analytical daylight shader. These are real-time assets and effects, separate from the generated campaign artwork.

The sky chapter's suspension bridges, folding decks, cables and safety tether are original project geometry. The current fitted-stone piers, supported timber headers, weathered boards, lashings, cable drums and rope-surface shader are in `src/sky-bridge-art.js`. They reuse the existing local rock and monastery wood maps and the project's bronze shader; rope fibres are procedural. Span and drum creaks use the original rope synthesis, with no new external assets or recordings. [Bridge construction notes](sky-bridge-art.md) record the implementation and verification.

The crystal chapter's inner vaults, six-sided quartz prisms, mineral beds, stalactites, falling drops, and impact rings are generated by project code. The cave wall material reuses the local Rock Boulder Dry maps, with procedural strata and wetness; it is not a separate cave scan. Quartz uses an original physical material and internal-band shader. Existing local water-drip recordings and synthesized resonance supply its environmental sound. No additional third-party files were downloaded for this enclosure.

The final observatory's closed bronze dome shells, hinges, orbital bands, graduated markers, and eclipse sky are original project geometry and shaders. Its arcades reuse the project's fluted-column and arch-stone generators, with the existing local Worn Rock Natural 01 and Marble Rock 02 maps. Patina is generated by shader noise. Machinery, resonance, and the quiet choir arrangement use the existing original Web Audio synthesis. No new third-party image, model, or sound files were downloaded for this chapter. [Observatory notes](observatory.md) record the implementation and verification.

The eight regional sanctuary gate designs are original procedural geometry in `src/sanctuary-gates.js`, reusing the credited local stone, plaster, timber, roof, snow and forge materials. Their reliefs, arches, fluted supports, roofs and scaled drive gears reuse the project’s original geometry builders. Mechanical and timber-drive sounds use the existing original Web Audio synthesis; no new recordings or music were downloaded.

## Explorer character and animation

`public/assets/characters/vesper.glb` combines the MakeHuman base mesh, adult female/athletic targets, MPFB Mixamo-compatible rig weights, and MakeHuman core clothing, hair, skin, eyes, eyebrows and eyelashes. These graphical assets are [CC0 under the MakeHuman asset license](https://static.makehumancommunity.org/about/license.html); the [system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) lists the individual core assets. Original files and license headers remain under `asset-sources/characters/makehuman/`. Their source revisions and SHA-256 checksums are recorded in `sources.json`.

The fitted character uses female_casualsuit01, shoes04, ponytail01, high-poly eyes with the brown material, eyebrow001, eyelashes01, and young_caucasian_female skin. The clothing's base color was adapted using the built-in image generation tool; its original source is retained. The pack, straps, rope coil, belt equipment, gaiters and runtime sidearm are original project geometry.

Idle/walk/run locomotion comes from the Mixamo Vanguard animation distributed in the [Three.js r180 Soldier example](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Soldier.glb). [Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) permits incorporating its characters and animation into games. The donor remains as `asset-sources/characters/locomotion-source.glb`, outside the public website directory. The converter retargets animation, removes horizontal root motion, and grounds the skinned shoes. This is an adapted character, not an original production sculpt.

[Character art notes](character-art.md) include the conversion method, final generated texture paths, exact prompts, and evidence. Reproduce source validation and the delivery GLB with `python3 scripts/download-explorer.py` and `node scripts/build-explorer.mjs`.

The unused Michelle reference remains under `asset-sources/characters/` for development and is not shipped.

## Typography, icons, and code dependencies

- Cormorant Garamond and DM Sans are locally served Google Fonts. Their SIL Open Font License files are included in `public/assets/fonts/`.
- [Lucide](https://lucide.dev) icons — ISC license.
- [Three.js](https://threejs.org) — MIT license.
- [Vite](https://vite.dev) — MIT license.
- [glTF Transform](https://gltf-transform.dev) and [Meshoptimizer](https://github.com/zeux/meshoptimizer) — MIT license.

## Field recordings and original music

The bellkeepers’ hoist, paired lift controls, gallery layout, folding upper
crossing, refuge archive, floor maps and register are original project geometry,
code and writing in `src/bell-hoist*.js`. Its surfaces reuse the credited local
monastery stone, timber and snow maps, and its bell reuses the original monastery
bell geometry. Drive, wind and bell sounds use existing original Web Audio
synthesis; the mountain score uses its existing objective arrangements. No new
external assets, recordings or music were added. See the
[hoist verification notes](bellkeepers-hoist.md).

The Rainkeeper's causeway, its turning bronze channels, folding stone crossings,
six handwheels, sanctuary lamps, archive grille, rain drain, local map and keeper's
record are original project geometry, code and writing in `src/fire-vault*.js`.
The ratcheting handwheels, paired grips and their character interaction are also
original project code; they reuse the delivered character and hand rig credited
above. Its masonry and bowls reuse the credited temple maps and original
temple/shrine geometry. Fire and drips use the existing recordings listed below; the handwheel
and grille sounds use the existing original machine and hoist synthesis. No new
external assets or recordings were added. [Causeway notes](rainkeeper-causeway.md)
record the playable behavior and verification limits.

The eight playable resonance arrays, crystal mounts, numbered collars, handwheels, inlaid connections, wave rings, relational inscriptions and recovered memory fragments are original project code and writing in `src/resonance-courts.js` and `src/resonance-rules.js`. They reuse the existing local quartz geometry, mineral material, stone and patinated bronze. The paired tuning tones use original harmonic synthesis in `src/audio.js`; no new external art, recordings or music were added.

The forge's eight thermal regulators, 102 chambers, handwheels, hinged shutters, coolant spouts, linked conduits and coordinate plaques are original geometry and code in `src/thermal-courts.js`. Six coupling laws and eight firing records are authored in `src/thermal-rules.js`. They reuse the existing forge metal/stone textures, molten-material and steam shaders, and original Web Audio machine/steam synthesis. No new external art, recordings or music were added for these regulators.

The mountain's eight playable bell racks, ropes, pulleys, grip motion, hand poses, and composed lesson phrases are original project code in `src/bell-courts.js` and `src/bell-rules.js`. Their bronze shells reuse `bellGeometry()` from the monastery architecture, and their surfaces reuse existing local wood, stone, and patinated bronze materials. The positioned bronze strikes use original inharmonic synthesis in `src/audio.js`; no new external art or recordings were added.

The solar chamber mirrors, bronze supports, handwheels, collector shutters, receiver lenses, coordinate marks, and light-path presentation are original geometry and code in `src/solar-chambers.js`. The nine optical layouts are authored in `src/solar-rules.js`. They reuse the existing local environment materials and Web Audio machinery/crystal synthesis; this addition downloads no external art or sound assets. The silvered faces use the scene's environment reflection, not a planar mirror render.

All recordings are shipped locally under `public/assets/audio/`; runtime playback makes no third-party requests. The game downmixes recordings to mono for spatial positioning, limits long loops to 36 seconds, applies an equal-power seam crossfade, and adjusts RMS/peak level. Playback offsets vary between emitters. These are generic environmental recordings, not verified recordings of each chapter's geographic location.

| Local file      | Work and author                                                                                                          | License                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `birds.ogg`     | [Ambient Bird Sounds](https://opengameart.org/content/ambient-bird-sounds), isaiah658                                    | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fire.ogg`      | [Fireplace Sound loop](https://opengameart.org/content/fireplace-sound-loop), PagDev; OGA's Ogg conversion of `fire.wav` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `drips.flac`    | [Dripping water loop](https://opengameart.org/content/dripping-water-loop), Independent.nu, submitted by qubodup         | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `stream.ogg`    | `stream3.ogg` from [Stream Sounds](https://opengameart.org/content/stream-sounds), kurt                                  | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)     |
| `waterfall.ogg` | `waterfall2.ogg` from [Stream Sounds](https://opengameart.org/content/stream-sounds), kurt                               | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)     |

Attribution to kurt, the original work, its license, and the looping/level changes is also visible in the game's Settings dialog. No endorsement by any recording author is implied.

Reproduce the bundled recordings with `python3 scripts/download-audio.py`.

The eight adaptive musical arrangements, musical puzzle cues, action effects, and supplemental wind/machine/crystal textures are original Web Audio synthesis in `src/audio.js`. No external music service or prerecorded soundtrack is used. The score uses sparse phrases, tonal pads, deliberately empty bars, and different instrument spectra, scales, motifs, tempi, and chord progressions for each chapter.
