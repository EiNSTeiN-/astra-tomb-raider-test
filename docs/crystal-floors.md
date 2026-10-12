# Stone floors for the crystal archive

The eight archive chambers in The Night Below now have worn stone paving
beneath their instruments and inside their existing walls. Coursing, dark
inlays and restrained joint shading give each chamber a distinct floor that
echoes its vaulted crown and instrument arrangement.

| Chamber | Floor treatment |
| --- | --- |
| Guide-light porch | Staggered stone courses with two longitudinal inlays |
| Descending apsis | Radial courses and concentric inlays |
| Mirrored nave | Paired coursing and two opposed lanes |
| Ascending vault | Diagonal courses and graduated transverse bands |
| Violet fan | Diamond coursing with two spreading inlays |
| Broken archive | Irregular fractures and worn seams through the courses |
| Heart crossing | Paired courses with two interlocking ring inlays |
| Prism lantern | Radial courses, octagonal border and eight spokes |

The material shades the delivered terrain directly. Its footprint narrows
inside the chamber walls and widens toward the instruments. Existing stone
maps supply the grain; cell tones, weathering, joints and inlays supply the
larger structure. Borders blend into the surrounding rock, and paving fades
on steep banks. The broken chamber uses localized fractures rather than
removing entire rectangular tile patches.

Joint and inlay relief changes shading normals. It does not displace the
ground or create another overlapping surface. Puzzle positions, collision,
terrain heights, water planes, character geometry, lights and audio retain
their preceding data and behavior. No texture, external asset, dependency or
recording is added.

## Geometry and rendering verification

A comparison against the published builders finds identical terrain geometry
buffers, height arrays, water metadata and vertex shader templates in all
eight chapters. Every terrain factory requests the same texture paths. For
the other seven biomes, fragment templates match after removing the inactive
crystal-floor blocks and blank lines; their uniforms and program keys match.

The crystal terrain retains its 81 meshes, 64,009 delivered vertex records,
119,072 triangles and 3,530,828 geometry-array bytes. The floor material adds
an array of eight four-component site parameters and a strength parameter.
The existing nine terrain textures remain in use. The fragment shader performs
additional floor calculations; unchanged geometry and draw counts do not
establish unchanged GPU cost or consumer hardware frame rate.

The final survey covers 27 paired views: eight elevated floor observers and
eight normal follow-camera views at 1280×800 High, eight follow-camera views
at 540×900 Low, and three elevated views at 1280×800 Medium. Both images in
each pair keep the same player, camera, selected look and simulation time.
Rendering calls, triangles, lines and points match. High and Medium HDR checks
remain finite; Low uses RGBA8. Shader links and WebGL error checks pass.

The control sets paving strength to zero in the current world. These are
controlled material comparisons, rather than captures of an earlier complete
application. Elevated observers inspect the floor layouts; the normal follow
camera covers the prepared tablet approaches. Field progress is prepared,
enemy simulation is disabled and audio is muted for this survey.

Image review found a ceiling formation obstructing the initial elevated heart
view. That observer was replaced with a legal clear position, framing all nine
floor probes and leaving eight unobstructed; the instrument over the ninth
probe remains visible. The replacement pair passes the same state, primitive,
shader and HDR checks. It changes the diagnostic view, not the game camera.

The terrain material and all nine owned textures each dispose once on chapter
change. The subsequent jungle terrain has no crystal-floor uniforms.

The normal controller completes all 49 local legs through the instrument
forecourts, covering 358.634 metres, and all 33 reversible physical wheel
adjustments. These are prepared local routes with enemy simulation disabled,
rather than uninterrupted campaign traversal. Their 57 captures retain legal
grounded positions, full health, finite HDR and linked shaders.

All 30 selected regressions pass, covering delivered terrain sampling, cavern
geometry, dry instrument margins, retained pools, physical tuning and focused
puzzle framing. The production build passes in 5.36 seconds with the existing
large-chunk advisory.

Native built-game checks pass with keyboard/High at 1280×800 and touch/Low at
540×900. Both solve the ascending objective `[1, 4, 7, 10]` in twelve turns and
advance from objective 3 to objective 4. Movement, look, crouch, jump/landing
and map inputs pass. An earned tuning reload and two further gameplay-store
reloads retain all saved fields apart from `lastPlayed` timestamps. The page
has no development game hook, and its loaded JavaScript/CSS filenames and
explorer model hash match the current delivery files. Neither case records
errors or warnings apart from the separately filtered GPU readback diagnostic.

## Captures

The 125 final captures are reviewed on contact sheets: 54 material comparisons,
57 local-route views and fourteen native keyboard/touch views. The eight
elevated floor treatments, selected normal views and two native landing views
are also inspected at full size. The courts read as continuous stone working
areas; instrument approaches remain clear in the sampled views. This is a
review of these recorded states, not continuous campaign or device acceptance.

Fourteen selected captures are delivered below as lossless WebP files. Each
decoded image matches its source pixels and dimensions exactly.

| Chamber | High elevated floor view |
| --- | --- |
| Guide-light porch | [Paving](images/crystal-floors/porch.webp) · [Control](images/crystal-floors/porch-before.webp) |
| Descending apsis | [Radial courses](images/crystal-floors/apsis.webp) |
| Mirrored nave | [Opposed lanes](images/crystal-floors/nave.webp) |
| Ascending vault | [Diagonal courses](images/crystal-floors/ascending.webp) |
| Violet fan | [Spreading inlays](images/crystal-floors/fan.webp) |
| Broken archive | [Fractured courses](images/crystal-floors/broken.webp) |
| Heart crossing | [Interlocking rings](images/crystal-floors/crossing.webp) |
| Prism lantern | [Octagon and spokes](images/crystal-floors/lantern.webp) · [Control](images/crystal-floors/lantern-before.webp) |

Normal camera samples show the [broken archive at High](images/crystal-floors/broken-follow.webp)
and [prism lantern at portrait Low](images/crystal-floors/lantern-portrait.webp).
Production controls are shown after landing with
[keyboard at High](images/crystal-floors/native-keyboard.webp) and
[touch at portrait Low](images/crystal-floors/native-touch.webp).

## Scope

This gives the instrument courts and chamber interiors their own stone
footprints. Wider cavern paths, lower wall composition, continuous camera
motion and full eight-chapter visual acceptance remain under review. These
checks do not establish human campaign traversal, subjective audio quality,
consumer hardware performance or AAA graphics.

Verification uses the shared CPU launcher, locked to nine of sixteen available
CPUs (56.25%), with one browser and one test worker at a time. Raw captures,
seeded stores, logs and comparison helpers remain in ignored local staging.
Owned browsers and servers are closed after verification. A final process
audit finds no remaining owned jobs, both verification ports are closed, and
transient runtime files are absent. The retained staging files are evidence
and resume notes rather than active background work.

The floor calculations are in
[crystal-floor-material.js](../src/crystal-floor-material.js), with the layer
integration in [terrain-material.js](../src/terrain-material.js).
