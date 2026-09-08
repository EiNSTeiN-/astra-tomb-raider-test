# Explorer asset

Vesper uses a fitted MakeHuman human mesh, core hair/eyes/clothing, and a Mixamo-compatible skeleton. The body is shaped with the young-adult female target and a 0.45 athletic target. These source assets are CC0; their original files, license headers, immutable source revisions, and checksums remain under `asset-sources/characters/makehuman/`.

The 1.74 m delivery model contains 46,312 triangles and is approximately 8.08 MB. It includes original procedural pack, straps, rope coil, belt pouch, carabiner, canteen, and gaiters. Body helpers are excluded; covered geometry and the shoes' intersecting upper socks are removed. Normals are averaged across UV seams. Skin color uses a 2K map, while clothing normals and hair cards use 1K delivery textures. Alpha cards remain alpha-tested.

Idle, walking and running come from the existing Mixamo Vanguard locomotion in Three.js r180's Soldier asset. The offline converter transfers world bone orientations onto the fitted skeleton, bakes local glTF tracks, removes horizontal root motion, and corrects vertical placement against the skinned shoes while preserving the donor’s running flight phase. [Locomotion notes](explorer-locomotion.md) describe that correction and collision-aware gait selection. The donor model is retained outside `public/` and is no longer delivered as the player character.

`src/explorer.js` selects the locomotion gait and adds arm/leg poses for swimming, jumping, mantling, ropes and cables. A short visual lift keeps the shorter human rig's hands on the existing rope grips and decays after release. A two-hand firing pose places the visible sidearm and tracer origin together. Recovery clears weapon visibility and visual offsets.

Grounded animation now also fits the visible boots to terrain and deck supports,
with footfalls tied to moving sole contacts. [Footing notes](explorer-footing.md)
describe the runtime fitting, rendered comparison and verification limits.

Reproduce the source validation and mesh build:

```sh
python3 scripts/download-explorer.py
node scripts/build-explorer.mjs
node --test tests/explorer.test.js
```

The source restorer verifies checksums before accepting downloads. It reuses verified local files and only fetches the system pack when a required file is missing. Generated textures are retained as project assets; generating a new image is not a bit-for-bit reproduction method.

## Generated fabric

The built-in image generation tool produced these square 1,254 px texture assets:

- `asset-sources/characters/makehuman/vesper-outfit-color.png`: initial olive/charcoal fabric atlas.
- `asset-sources/characters/makehuman/vesper-outfit-padded.png`: selected atlas, with color extending beyond island boundaries. The converter embeds this texture into `public/assets/characters/vesper.glb`.

The edit target was the CC0 MakeHuman `female_casualsuit01_diffuse.png` atlas. It was inspected before editing. The source UV layout is retained, but this generated texture is a visual adaptation and should not be treated as a mathematically exact reprojection.

Initial prompt:

> Use case: precise-object-edit. Asset type: UV base-color texture atlas for a 3D archaeological explorer's clothes in a browser adventure. Input image is the edit target and exact UV layout template. Keep the square canvas and EVERY existing UV island outline, position, rotation, scale, seam, pocket and collar position exactly fixed. This is a flat texture sheet, not a clothing photograph or character illustration. Change the blue T-shirt islands (top two sideways torso islands and bottom-right two sleeves) to muted weathered olive-green cotton with fine natural woven detail, faint sweat/dust wear and realistic seam stitching. Completely remove the orange human logo and the pale circle on the top-right island, replacing them with uninterrupted matching olive fabric. Change all bright orange piping to subdued dark olive stitching. Change the two lower trouser islands from blue denim to dark charcoal-brown durable expedition twill, preserving their current pockets, seams and silhouette, with subtle dust on knees and hems. Remove all printed text/brands. Keep the unused background flat light gray. Highest possible texture detail with even albedo lighting, no cast shadows, no perspective, no added UV islands, no rearrangement, no straps or equipment drawn across the islands. The image must still align with the original mesh UVs. Output square 2048 by 2048 if available.

Padding prompt:

> Use case: precise-object-edit. This image is an existing UV texture atlas already fitted to a 3D explorer. Make ONLY a texture-padding correction: extend the edge colors and fabric texture of each clothing island outward by approximately 25 pixels into its surrounding light-gray unused area, so sampling just beyond the existing outlines still samples matching fabric instead of gray. Preserve the current cloth texture within every island exactly; preserve the existing square canvas size, the six UV island positions, rotation, scale, pockets, seams and all existing colors. Olive shirt/sleeve edges must extend olive fabric, charcoal-brown trouser edges must extend charcoal-brown fabric. The original clothing borders should remain inferable as stitching, but with matching color bleed outside them. Do not move or reshape the original islands. No text, no logos, no new objects, no shadows. This is a technical UV edge bleed edit, not a new design.

## Evidence and limits

Tests inspect the actual delivery GLB: finite normals, normalized skin weights, required bones/clips, grounded walking/idle shoes and a bounded running flight phase, no horizontal root translation, swimming offset direction, rope and sidearm hand alignment, and recovery cleanup. Browser-assisted traversal checks loaded the new rig and completed all 22 routes, including the return cables, while verifying hand placement at rope catches.

Counterweight movement adds a forward body lean and two hand targets at the stone handles. Pulling reverses the walking clip. An additional delivery-asset test samples push and pull cycles in all four cardinal directions and keeps both hands within 5 cm of their targets. This catches the stance/handle mismatch seen in the initial browser view; the final stance and handle height are shared by the runtime and the test.

This improves the playable character's appearance and motion. It is still an adapted base mesh with procedural animation overlays, not a bespoke AAA character sculpt or a motion-captured traversal library. Further facial animation, clothing deformation, material work, gait/contact refinement, and device testing remain necessary.
