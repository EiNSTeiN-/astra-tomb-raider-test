# Generated artwork

The artwork below was generated with the built-in image generation tool and retained in the project; the memorial delivery asset was converted into geometry. No API-key CLI fallback was used. The chapter atlas is cropped with CSS, preserving each panel’s aspect ratio.

## Cavern fresco atlas

Generated with the built-in image generation tool for this project. These are
fictional archaeological paintings. The delivered source is 1254×1254; the prompt
requested 2048×2048. The packing script preserves the original cells, repeats one
edge column in the narrower cells, and adds copied gutters without resampling.

Exact prompt:

> Use case: stylized-concept. Asset type: ONE square albedo texture atlas for eight ancient cavern archive wall frescoes in an original archaeological browser adventure. Produce a 2048 by 2048 square texture with an exact regular grid of FOUR columns and TWO rows: eight separate equal portrait panels, no gaps, each 512 wide by 1024 tall. Each panel is an entire flat front-on weathered limestone fresco, not a painting of a room, no perspective. All important imagery stays in the central 75% width and central 70% height of each cell, leaving softly worn neutral limestone around its edges. Consistent desaturated blue-grey limestone background, traces of dusty ochre, charcoal, faded copper and blue mineral pigment. Fine believable chipped plaster, soft worn carved contours, delicate mineral accretions and hairline cracks. Subtle ambient uniform illumination suitable for game albedo: NO baked spotlight, cast shadow, shine, glow or bright white highlights. Original fictional ancient visual culture, elegant and tactile, quiet archaeological narrative relief painting rather than modern vector symbols. TOP ROW, left to right: (1) a robed wayfinder holding three small lamps beneath stepped stars; (2) a solitary traveler descending many cave steps, with successive faint repeated silhouettes suggesting an echo; (3) two robed archivists facing opposite sides of a tall mirrored stone slab, with tiny reflected faces; (4) a procession of four small travelers carrying lamps upward along diagonal stone steps. BOTTOM ROW, left to right: (5) two musicians facing each other across branching wave patterns; (6) two separated hands reaching across a repaired fracture, with five small fragments of a broken vessel carefully joined below; (7) two intertwined quiet wave-shaped ribbons forming a heart-like paired rhythm around a central standing figure; (8) a lone woman and her older reflected self on opposite sides of a faceted octagonal stone, with eight faint radiating etched paths. Composition in every cell is refined tall continuous narrative fresco with layered architectural and natural details; no lettering, labels, numbers, typography, watermark, UI, frame or visible grid lines. Each fresco must fill its cell and the precise grid must remain aligned. This is a production texture atlas, not a contact sheet or concept board.

## Cavern fresco correction

The built-in image generation tool corrected the guide-light figure's extra arm.
The atlas packer selects only the corrected top-left cell from this edit, keeping
the other seven cells from the original source pixel-identical. Both source
hashes and the selected region are retained in the provenance manifest.

Exact edit prompt:

> Use case: precise-object-edit. Edit target: the supplied 1254 by 1254 pixel 4-column, 2-row fresco texture atlas. Correct ONLY the top-left cell, x=0..313, y=0..626. Its wayfinder currently has three arms, an anatomical error. Replace that figure's arm arrangement with EXACTLY TWO natural arms attached to the two shoulders: one raised hand holds a single horizontal wooden yoke from which THREE small oil lamps hang by three chains, while the other hand rests naturally on a slim walking staff at the figure's side. No additional hands, arms or repeated arm silhouettes. Preserve her head, robes, standing stance, stepped stars, limestone backdrop and overall tall composition. Keep the same subtle blue-grey, dusty ochre and copper pigment, fine worn plaster and mineral grain, soft flat albedo illumination. Keep the other SEVEN cells absolutely unchanged. Preserve the exact square size, four-column two-row grid, all cell edges and orientation. Do not add text, glow, frame, perspective, cast shadows, or decorative limbs. This is a localized correction to an archaeological game texture.

## Cinematic key art

Final file: `public/assets/verdant-temple.png`

Prompt:

```text
Use case: stylized-concept
Asset type: cinematic widescreen key art for an original premium archaeological action-adventure browser game, Vesper: The Hollow Earth.
Primary request: incredibly beautiful photorealistic AAA game environment concept art. A vast overgrown ancient temple hidden in a lush jungle valley in Southeast Asia. In the mid-right distance a monumental intricately carved Angkor-like stone temple with a tall central tower emerges from mist and luxuriant forest. At lower right a tiny silhouette of a female explorer with a backpack stands on a weathered stone terrace, back to camera, surveying the breathtaking discovery. Huge fern leaves and dark vines frame the foreground at far edges. Steep misty mountains, waterfalls on the right, tiny birds over the temple. The temple occupies the center-right half, well visible and striking.
Composition: very wide landscape, 16:9. The left third is a quiet dark jungle foreground with atmospheric deep green-black negative space, designed to receive overlaid white game title text in HTML. Sky is soft muted warm light, not excessively bright. Temple centered at about 68 percent horizontally, explorer at 75 percent horizontally near bottom. No interface in the image.
Lighting: cinematic dawn, sunbeams through humidity, warm cream-gold rim light, volumetric mist, deep forest shadows, photographic rich organic textures, delicate film grain, sophisticated desaturated olive and charcoal palette. Unreal Engine 5 cinematic aesthetic, epic scale, believable architectural detail.
Constraints: original game, no recognizable franchise character, no weapons close-up, no text, no logo, no watermark. High detail.
```

## Eight chapter artworks

Final file: `public/assets/chapter-atlas.png`

Prompt:

```text
Use case: stylized-concept. Asset type: environment artwork contact sheet for eight chapter thumbnails in an original archaeological action-adventure game. Generate a wide landscape contact sheet with exactly FOUR COLUMNS and TWO ROWS, eight equally sized rectangular panels edge to edge, without gutters, borders, labels, typography, or text. Each panel is photorealistic cinematic AAA game environment concept art with exquisite atmospheric lighting, epic scale, detailed stone architecture. Top row left to right: 1. ancient jungle temple in lush Cambodian rainforest at golden misty dawn, rich green, 2. enormous intricately carved doorway in a sandstone cliff deep in Arabian desert dunes at sunset, warm ochre, 3. abandoned Himalayan monastery on a snow-covered peak with a narrow bridge, cold silver blue, 4. partially submerged Greek palace with monumental arches and teal water, moody sea mist. Bottom row left to right: 5. ancient black stone forge with rivers of lava inside volcanic caldera, glowing amber fire, 6. lost Incan city with narrow rope bridges between towering Andean cliffs and clouds, pale sage and sky blue, 7. subterranean ruined citadel with forests of luminous violet crystals, mysterious purple darkness, 8. immense ancient circular observatory under a solar eclipse with brass celestial rings and glowing gold light. Cohesive cinematic art direction across all 8 panels. No people, no text, no letters, no logos, no watermarks. Panels precisely equal in size, 4 columns by 2 rows. 16:9 overall aspect ratio.
```

## Jungle environment panorama

Final file: `public/assets/jungle-panorama.png`

Prompt:

```text
Use case: stylized-concept. Asset type: seamless equirectangular 360 degree environment panorama used as the background skydome of a 3D archaeological jungle adventure game. Primary request: breathtaking photorealistic tropical jungle valley at dawn, immense steep limestone mountains and ancient verdant forest stretching to a distant horizon, waterfalls in far mountain cliffs. Warm pearl and muted golden sky above, sun rays penetrating low morning mist through a humid green valley. Dense realistic jungle trees below horizon. No buildings, no people, no foreground objects. Equirectangular projection, seamless left and right edges, exactly 2:1 aspect ratio, entire 360 degree view around camera. Sky occupies upper 65 percent, distant mountains and misty jungle lower 35 percent. Camera is on a high stone platform overlooking the distant valley; no platform visible in the actual image. Photorealistic, atmospheric depth, realistic light, sophisticated muted green shadows and warm cream dawn sky. Designed to wrap onto the interior of a huge sphere with no obvious seams or lens distortion. No text or watermarks.
```

## Memorial relief

Generated using the built-in image generation tool. Original 1774 × 887 PNG retained locally at `asset-sources/memorial/evacuation-relief-generated.png` (excluded from publication as a source intermediate). The playable asset is `public/assets/memorial/evacuation-relief.glb`. Source and delivery hashes are retained in `asset-sources/memorial/sources.json`. See [memorial art notes](memorial-art.md) for conversion, installation and limitations.

Exact final prompt:

```text
Use case: stylized-concept. Asset type: grayscale height/displacement map for a carved stone wall frieze in an original archaeological adventure game. Create one wide rectangular ancient maritime memorial carving, viewed perfectly straight-on and orthographic, filling the canvas with a clean continuous rectangular edge. Its central composition shows three modest oared evacuation boats carrying small robed adult and child silhouettes, above rhythmic layered wave bands, with an understated braided-rope border. These are symbolic shallow relief figures, not living people or a photographic scene. The fictional seafaring civilization honors ordinary families who escaped a flooded city; quiet, dignified, beautifully crafted archaeological detail. Use grayscale to encode physical elevation only: the recessed background is a uniform dark gray, stone faces and boat hulls are higher pale gray, the highest softly rounded carving edges are nearly white. Smooth sculpted transitions, carefully separated silhouettes, broad readable forms with restrained fine chisel detail. No cast shadows, no directional lighting, no shiny highlights, no perspective, no sky, no scenery outside the panel, no text, no lettering, no logos, no watermark, no tiled copies. Landscape approximately 2:1 composition. It will be converted into actual shallow stone geometry and lit in real time.
```


## Monastery fresco atlas

Generated with the built-in image generation tool. The playable file is `public/assets/textures/monastery-records-atlas.webp`. The original 1536 × 1024 PNG remains locally at `asset-sources/monastery-records/atlas-generated.png` as an excluded source intermediate. The tracked [source manifest](../asset-sources/monastery-records/sources.json) records hashes, dimensions, story order and the repeatable atlas-packing command. All eight painted cell regions preserve their generated pixels; only copied edge gutters and lossless WebP encoding are added. The paintings depict a fictional mountain civilization, without claims of historical accuracy.

Exact final prompt:

```text
Use case: illustration-story.
Asset type: ONE color texture atlas for the painted inner walls of an original archaeological adventure game, VESPER. This is flat artwork consumed on physical plaster, not a scene render.
Create one cohesive sheet divided into exactly TWO columns and FOUR equal rows: eight full-bleed panoramic fresco cells, each approximately 3:1 wide. Overall image aspect ratio 3:2, target 1536 by 1024. No gaps, labels, numbers or frames between the cells. Keep every painting inside its cell so the game can sample the grid.
Medium: richly detailed original hand-painted mineral-pigment frescos on warm ivory aged plaster, worn matte tempera, subtle irregular brushwork, fine natural craquelure, faded ochre, muted rust red, deep smoky blue, moss and chalk. The style is sophisticated archaeological wall painting rather than computer icons, modern illustration or photographic scenery. Tiny painted robed travelers, vegetation and animals should read as historical pictorial storytelling; no recognizable copyrighted characters or real religious portraits. Even flat illumination without baked cast shadows.
Reading order across rows:
1. A long mountain pilgrimage: tiny travelers and pack animals winding toward a refuge through snow peaks, stone gateways, pale sunrise and painted geometric earth bands.
2. The valley of bells: bronze bells suspended between mountain pavilions, small keepers below, layered valleys and broad flowing echo-cloud motifs.
3. A listening mountain garden: windswept alpine trees, birds, ribbons and streaming cloud bands crossing a quiet blue mountain landscape.
4. The stair of voices: a long climbing stone stair between mountain terraces with tiny travelers calling across the valley, warm rust and chalk.
5. The memory garden: a weathered circular floral memory-wheel mandala at the center, small alpine shrubs and mountain scenes extending to both sides, smoky blue and faded gold.
6. Woven wind: interwoven painted cloud ribbons, cloth banners, cranes and alpine plants, a rich patterned rhythm in mineral blue and ochre.
7. Summit vigil: an old radiant sun above a high mountain refuge and tiered peaks, tiny pilgrims, rust red, warm gold and ivory, a solemn spacious composition.
8. The archive: an old mountain library told as painted scroll shelves, robed record keepers, star charts, moon and mountain windows, restrained smoky blue and ochre.
Give each cell a continuous narrative panorama, beautiful and detailed at full resolution, with quieter edges and a clear central composition. Keep enough visible pale plaster between painted forms for a convincing worn fresco. No text, calligraphy, modern symbols, photoreal perspective rooms, borders, drop shadows, watermarks or logos.
```


## Jungle fresco atlas

Original project artwork generated with the built-in image generation tool. No external reference image was supplied. The source is a 1536 × 1024 atlas, packed into the playable lossless WebP with copied edge gutters. See `asset-sources/jungle-records/sources.json` and `scripts/build-jungle-fresco.mjs`.

> Use case: illustration-story. Asset type: ONE production albedo texture atlas for the rear stone friezes of eight fictional jungle-temple chambers in an original browser adventure game. Produce a high-resolution landscape 3:2 image arranged as an exact seamless 2-column by 4-row grid of EIGHT equally sized horizontal painted fresco scenes. Each cell is a complete 3:1 panorama. No gutters, no frame between cells, no numbers, no lettering, no watermarks. Read cells left to right, top to bottom. Unified art direction: sophisticated ancient mineral-pigment wall painting on pale warm weathered limestone; charcoal and muted terracotta linework, restrained malachite green, dusty ochre and faded turquoise. Worn but legible figures and motifs; delicate branching cracks, rubbed pigment and small areas of missing plaster. Flat orthographic painted art, hand-painted sculptural silhouettes and fine artisan ornament, richly detailed and elegantly composed. Even diffuse illumination appropriate for a texture, no perspective view of a room, no modern illustration panels or glossy 3D, no baked directional shadows, no fake text. Keep the important motifs away from the outermost 5% of each cell. Each panorama should flow across three visual episodes, without panel borders, reading source, journey, destination. Fictional culture, original designs, no copied franchise characters or real sacred iconography. Scene 1: a keeper carrying a torch through a grove, flame traveling through old stone channels to two sanctuary braziers under a rising sun. Scene 2: immense living tree roots around a stone gatehouse, a recovered circular bronze counterweight, a rope pulley lifting the gate. Scene 3: rain clouds and a hillside spring, branching stone irrigation channels through a garden, a water-lift tower and upper sluice. Scene 4: three sunlit observation stations at different heights among tall trees, a keeper climbing to a canopy tablet, a large engraved sunrise dial. Scene 5: an amber lens cradled in leaves, an eastern stepped altar, a focused ray of light through the installed lens. Scene 6: a hanging garden crossing with cable drums, two stone bridge spans pivoting around piers above water, a final winch and return walkway. Scene 7: a traveler carrying flame between successive stone braziers through a lush temple garden, culminating in a bright inner beacon beneath a canopy of small lights. Scene 8: a small sun seal and a compass beside a weathered trail marker, an explorer leaving an offering, a heart-shaped seed/flower within the final temple gate. All eight cells must have clearly distinct compositions while sharing the same believable aged stone and pigment palette. Use the entire image as the precisely registered 2 by 4 texture atlas.
