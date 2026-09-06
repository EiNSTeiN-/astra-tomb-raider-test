# Guardian art and animation

The four enemy archetypes now use articulated stone armor, carved masks, recessed eye lenses, mechanical joints, and equipment attached to their hands. The previous model had rigid legs and a largely box-shaped body. The new forms are authored in `src/guardian-art.js`; they are original code-generated geometry, using the existing locally bundled CC0 temple-stone texture. No additional external model or image is required.

| Archetype | Visual identity | Near triangles | Distant triangles |
| --- | --- | ---: | ---: |
| Stone warden | Crowned mask and a flanged mace | 21,324 | 6,468 |
| Ridge hunter | Swept crests, a pointed mask, and paired forearm blades | 20,400 | 5,944 |
| Sanctuary sentry | Radiating halo and a staff with a visible projectile lens | 21,484 | 6,468 |
| Shield keeper | Larger armor, a kite shield, and a mace | 22,160 | 6,792 |

Eight chapter palettes tint the stone and metal. A shader desaturates the sandstone's color variation, adds broad weathering, and gives the damp chapters a green patina. Texture coordinates and weathering follow the armor in its bind pose, so the surface pattern stays attached during animation. These are procedural surface treatments, not individually painted character atlases.

## Geometry and rendering

Each guardian uses three skinned meshes: carved stone, aged metal, and luminous lenses. Armor vertices have a single full bone weight. This allows rigid components to rotate at their joints without stretching the stone and avoids a draw call for every plate, finger, and carving. The skeleton has 19 bones, or 20 for the shield keeper. Geometry is shared between instances of an archetype; the stone and metal materials are shared within the chapter, while each guardian has its own luminous material for attack and hit feedback.

The distant version removes small inlays, simplifies curved surfaces, and reduces finger detail. It retains the mask, equipment, moving joints, and silhouette. Geometry switches have 5 m hysteresis around 26 m in Performance mode and 42 m otherwise. Body drawing stops beyond 80 m in Performance and 125 m otherwise. This visibility policy does not disable combat simulation. Fixed skin bounds enclose the authored poses without scanning every skinned vertex every frame. Chapter cleanup now disposes each shared skeleton once, including its bone texture.

The same 1280 × 760 gallery view reported 36 main-view draw calls for the old four guardians and floor, and 13 for the new set. The new set submits 85,370 main-view triangles including the floor. This deliberately increases nearby geometry detail while reducing draw calls; the distant tiers reduce each character's triangles by about 70%. These counts do not establish a hardware frame rate.

The [previous models](images/guardians-before.png) and [new models](images/guardians-after.png) were captured in the same development gallery lighting and camera. The gallery isolates the characters for inspection; it is not a chapter environment or a target frame-rate demonstration.

## Motion and combat feedback

Foot targets remain in world space during their planted phase. Alternating steps lift toward their next ground target; the hips settle to keep the supporting leg within reach. Knees and ankles follow a two-bone pose solver, including on sloped terrain. The chest, head, shoulder, elbow, hand, and shield poses distinguish raising a mace, crouching for a charge, channeling a staff, and exposing the shield keeper's recovery window. The existing attack timing, damage, health, dodge windows, and shield rules remain the combat authority.

Footfalls are positional, limited to nearby guardians, and rate-limited per guardian. The sentry's bolt starts at its moving staff lens. Player shot tracers end at the shield when blocked and at the moving chest core when successful. Existing distance-sensitive ambience and quiet chapter scores continue to handle environmental and encounter sound.

## Verification and remaining work

`tests/guardian-art.test.js` checks the actual runtime geometry: finite attributes, normalized rigid weights, valid bone indices, bounded triangles, distinct equipment geometry, distant detail reduction, shared skeletons, pose bounds, planted feet, slope/turn contact, positional footfalls, projectile origin, and detail hysteresis. Existing combat tests cover damage and recovery timing; an added check verifies that tracers meet the shield or core consistently with the damage result.

The full suite passes **101 tests**. Selected encounters rendered in all eight chapter worlds without console warnings or errors. The [High jungle encounter](images/guardian-jungle-high.png) also exercised shadows and contact occlusion; its selected view reported 2,199,656 triangles and 298 calls across the rendering work. Actual-world ankle positions matched the sampled terrain height. The browser uses ANGLE/SwiftShader software rendering, so these checks do not establish a consumer-GPU frame rate. A desert-load regression in the shared bolt function was fixed: stationary dart emitters retain their existing origin while sentries use the animated staff lens. A regression test now fires the actual trap's three-bolt volley.

The final production build passed, retaining the existing Three.js chunk-size advisory. It launched a prepared jungle save without the development hook and reported no console warnings or errors. A native-fire loop exceeded the tool's 300-second response limit under software rendering. A subsequent observation confirmed that the browser had reached pause and saved 311.0865 seconds of active wall time; that time survived reload. The guardian was not defeated in that run, so it is **not** a passed production combat or frame-rate test.

A separate development check sent real keyboard F events with controlled combat-simulation steps between them. Five shots reduced the warden from 5 HP to zero and saved its defeat; after reload it did not respawn. These checks use a prepared nearby save and do not measure normal encounter duration. Test-created progress was cleared in development and preview, with High quality restored.

The development gallery can be opened from the browser console:

```js
await (await import('/scripts/verify-guardian-art-browser.js')).guardianGallery({
  biome: 'jungle',
  state: 'windup',
})
```

Reload to restore the launcher. `guardianChapterViews([0, 1])` in the same module reviews selected encounters in the actual chapter worlds. It uses assisted player positioning and attack states and modifies test saves; it is not an unassisted combat playthrough. These helpers are excluded from the production bundle.

The result improves the guardian silhouettes, surfaces, and animation, but remains a procedural character kit. Bespoke sculpting, richer deformation and reaction animation, animation blending, terrain and encounter playtests, and consumer-GPU measurements remain necessary. It does not establish AAA visual quality or the requested hour of gameplay per chapter.
