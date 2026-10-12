import * as T from "three";
// Compare actual rendered body pixels with/without opaque alpha-tested foliage.
// Preserve original wind, atlas and per-instance coverage shader wrappers.
export function inspectFoliageFraming(
  g,
  { width = 640, height = 400, camera = g.camera, includePixels = false } = {},
) {
  const foliage = new Set();
  const leafy = (material) =>
    material.alphaTest > 0 || /leaves|twig|frond|foliage/i.test(material.name);
  for (const patches of [
    g.naturePatches?.filter((p) => ["fern", "shrub"].includes(p.kind)),
    g.grassPatches,
    g.skyMeadow?.patches,
    g.snowGroundcover?.patches,
    g.meridianGroundcover?.patches,
    g.desertGroundcover?.patches,
  ])
    for (const patch of patches || [])
      if (patch.kind !== "rock")
        for (const m of patch.tiers.flat()) foliage.add(m);
  for (const patches of [
    g.forestPatches,
    g.palmPatches,
    g.jungleFringe?.patches,
  ])
    for (const patch of patches || [])
      for (const m of patch.tiers.flat())
        if ([m.material].flat().some(leafy)) foliage.add(m);
  for (const patch of g.templePatches || [])
    for (const root of [patch.root, patch.detail].filter(Boolean))
      root.traverse((m) => {
        if (m.isMesh && [m.material].flat().some(leafy)) foliage.add(m);
      });
  const actor = new Set();
  g.avatar.traverse((m) => {
    if (m.isMesh) actor.add(m);
  });
  const state = [],
    materials = new Map(),
    renderer = g.renderer,
    target = new T.WebGLRenderTarget(width, height, { depthBuffer: true });
  const previous = {
    target: renderer.getRenderTarget(),
    background: g.scene.background,
    override: g.scene.overrideMaterial,
    shadow: renderer.shadowMap.autoUpdate,
    shadowUpdate: renderer.shadowMap.needsUpdate,
  };
  const pixels = () => {
    renderer.render(g.scene, camera);
    const p = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, p);
    return p;
  };
  try {
    g.scene.traverse((m) => {
      if (!m.isMesh && !m.isPoints && !m.isLine) return;
      state.push({ m, visible: m.visible, material: m.material });
      if (!actor.has(m) && !foliage.has(m)) {
        m.visible = false;
        return;
      }
      const kind = actor.has(m) ? "body" : "plant",
        wrap = (original) => {
          const key = original.uuid + kind;
          if (materials.has(key)) return materials.get(key);
          const probe = original.clone(),
            compile = original.onBeforeCompile,
            cache = original.customProgramCacheKey();
          probe.onBeforeCompile = function (s, r) {
            compile.call(this, s, r);
            s.fragmentShader = s.fragmentShader.replace(
              "#include <dithering_fragment>",
              "#include <dithering_fragment>\ngl_FragColor=vec4(" +
                (kind === "body" ? "1.,1.,1." : "0.,1.,0.") +
                ",1.);",
            );
          };
          probe.customProgramCacheKey = () =>
            cache + "-foliage-observer-" + kind;
          probe.toneMapped = false;
          materials.set(key, probe);
          return probe;
        };
      m.material = Array.isArray(m.material)
        ? m.material.map(wrap)
        : wrap(m.material);
    });
    g.scene.background = new T.Color(0);
    g.scene.overrideMaterial = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(target);
    for (const m of foliage) m.visible = false;
    const body = pixels();
    for (const { m, visible } of state) if (foliage.has(m)) m.visible = visible;
    const combined = pixels();
    let samples = 0,
      blocked = 0;
    const witnesses = [];
    for (let i = 0; i < body.length; i += 4)
      if (body[i] > 250 && body[i + 1] > 250 && body[i + 2] > 250) {
        samples++;
        if (combined[i] < 5 && combined[i + 1] > 250 && combined[i + 2] < 5) {
          blocked++;
          if (witnesses.length < 12)
            witnesses.push([(i / 4) % width, Math.floor(i / 4 / width)]);
        }
      }
    return {
      samples,
      blocked,
      width,
      height,
      witnesses,
      error: renderer.getContext().getError(),
      ...(includePixels ? { pixels: combined } : {}),
    };
  } finally {
    for (const { m, visible, material } of state) {
      m.visible = visible;
      m.material = material;
    }
    g.scene.background = previous.background;
    g.scene.overrideMaterial = previous.override;
    renderer.shadowMap.autoUpdate = previous.shadow;
    renderer.shadowMap.needsUpdate = previous.shadowUpdate;
    renderer.setRenderTarget(previous.target);
    for (const m of materials.values()) m.dispose();
    target.dispose();
  }
}
