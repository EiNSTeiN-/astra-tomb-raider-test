// Run after rendering a development chapter. The cue records describe the
// controls sent to actual surface shaders; no separate warning floor is drawn.
export function inspectGroundCues(game) {
  const state = game.groundCues;
  const markers = [
    ...(game.enemies || []).map((e) => e.warning),
    ...(game.hazards || []).flatMap((h) => [h.marker, h.wave]).filter(Boolean),
  ];
  const actorMaterials = new Set();
  game.world.traverse((object) => {
    let actor = object.isSkinnedMesh;
    for (let p = object; p; p = p.parent) actor ||= !!p.userData.actor;
    if (actor && object.material)
      for (const m of Array.isArray(object.material)
        ? object.material
        : [object.material])
        actorMaterials.add(m);
  });
  const gl = game.renderer.getContext();
  return {
    chapter: game.level.id,
    cues: structuredClone(state?.records || []),
    texture: state && {
      width: state.texture.image.width,
      height: state.texture.image.height,
      bytes: state.data.byteLength,
    },
    receiverMaterials: state?.materials.size || 0,
    actorMaterialOverlap: state
      ? [...actorMaterials].filter((m) => state.materials.has(m)).length
      : 0,
    standaloneVertices: markers.reduce(
      (n, m) =>
        n + (m.userData.groundCue ? m.geometry.attributes.position.count : 0),
      0,
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    glError: gl.getError(),
  };
}
