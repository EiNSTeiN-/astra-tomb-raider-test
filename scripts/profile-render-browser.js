// Development browser console, with an expedition loaded:
// (await import('/scripts/profile-render-browser.js')).profileRender(__vesper.game)
// This reports submitted work, not GPU frame time or supported frame rate.
export function inspectTerrainProgram(game) {
  const material = game.terrainMeshes?.[0]?.material;
  const active =
    material && game.renderer.properties.get(material).currentProgram;
  if (!active) return null;
  const gl = game.renderer.getContext(),
    samplers = [];
  for (
    let i = 0;
    i < gl.getProgramParameter(active.program, gl.ACTIVE_UNIFORMS);
    i++
  ) {
    const uniform = gl.getActiveUniform(active.program, i);
    if (
      [gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW].includes(
        uniform.type,
      )
    )
      samplers.push({ name: uniform.name, count: uniform.size });
  }
  return {
    quality: game.store.data.settings.quality,
    shadowsEnabled: game.renderer.shadowMap.enabled,
    receivesDirectionalShadows: samplers.some((s) =>
      s.name.startsWith("directionalShadowMap"),
    ),
    textureUnits: samplers.reduce((sum, sampler) => sum + sampler.count, 0),
    samplers,
    linkLog: gl.getProgramInfoLog(active.program),
  };
}

export function profileRender(game) {
  const renderer = game.renderer;
  const original = renderer.renderBufferDirect;
  const submissions = new Map();
  renderer.renderBufferDirect = function (
    camera,
    scene,
    geometry,
    material,
    object,
    group,
  ) {
    const key = `${object.name || object.type} / ${material.isMeshDepthMaterial ? "shadow" : material.name || material.type}`;
    const total = geometry.index?.count ?? geometry.attributes.position.count;
    const start = Math.max(geometry.drawRange.start, group?.start ?? 0);
    const end = Math.min(
      total,
      geometry.drawRange.start + geometry.drawRange.count,
      group ? group.start + group.count : Infinity,
    );
    const entry = submissions.get(key) || { name: key, calls: 0, triangles: 0 };
    entry.calls++;
    if (object.isMesh)
      entry.triangles +=
        (Math.max(0, end - start) / 3) *
        (object.isInstancedMesh ? object.count : 1);
    submissions.set(key, entry);
    return original.call(
      this,
      camera,
      scene,
      geometry,
      material,
      object,
      group,
    );
  };
  try {
    game.renderScene();
    const gl = renderer.getContext(),
      extension = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      chapter: game.level.id,
      quality: game.store.data.settings.quality,
      viewport: renderer.getSize({
        set(x, y) {
          return { width: x, height: y };
        },
      }),
      pixelRatio: renderer.getPixelRatio(),
      gpu: extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : "Unavailable",
      submitted: { ...renderer.info.render },
      forestInstances: game.forestPatches.reduce(
        (counts, patch) => counts.map((n, i) => n + patch.counts[i]),
        [0, 0, 0],
      ),
      grassInstances: game.grassPatches.reduce(
        (counts, patch) => counts.map((n, i) => n + patch.counts[i]),
        [0, 0, 0],
      ),
      largestSubmissions: [...submissions.values()]
        .sort((a, b) => b.triangles - a.triangles)
        .slice(0, 15),
    };
  } finally {
    renderer.renderBufferDirect = original;
  }
}

// Reconstruct the previous full-detail, patch-culled grass in a paused Low
// scene. Both measurements use the same frame state and non-grass geometry.
// The temporary meshes never alter gameplay, saves, or the source materials.
export function compareGroundCover(game) {
  if (!game.paused || game.store.data.settings.quality !== "low")
    throw new Error(
      "Pause an expedition and select Performance quality first.",
    );
  game.renderScene(); // Exclude one-time environment preparation from both counts.
  const hidden = game.grassPatches
    .flatMap((patch) => patch.tiers.flat())
    .map((mesh) => [mesh, mesh.visible]);
  const legacy = [];
  let before;
  try {
    for (const [mesh] of hidden) mesh.visible = false;
    for (const patch of game.grassPatches) {
      const source = patch.tiers[0][0];
      const geometry = source.geometry.clone();
      geometry.attributes.instanceCoverage.array.fill(1);
      geometry.computeBoundingSphere();
      const mesh = new source.constructor(
        geometry,
        source.material,
        patch.matrices.length,
      );
      legacy.push(mesh);
      mesh.name = "Legacy ground cover";
      patch.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, patch.colors[i]);
      });
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.visible =
        mesh.boundingSphere.center.distanceTo(game.player.position) <
        38 + mesh.boundingSphere.radius;
      game.world.add(mesh);
    }
    before = profileRender(game);
  } finally {
    for (const mesh of legacy) {
      game.world.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const [mesh, visible] of hidden) mesh.visible = visible;
  }
  return { before, after: profileRender(game) };
}
