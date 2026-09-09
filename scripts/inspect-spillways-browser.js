// Development diagnostics for the actual loaded waterfall structures. These
// assisted positions and simulation steps do not measure human playthrough time.
export function inspectSpillways(game) {
  const gl = game.renderer.getContext();
  return {
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
    falls: game.waterfallEffects.map((f) => {
      const source = game.soundSources.find((s) => s.waterfallId === f.index);
      return {
        index: f.index,
        top: f.top,
        bottom: f.basin.position.y,
        height: f.height.value,
        channelY: f.flume.position.y,
        impact: f.impact.position.toArray(),
        sprayHeights: f.sprays.map((p) => p.position.y),
        source: { x: source.x, y: source.y, z: source.z },
        stoneTriangles: f.art.mesh.geometry.attributes.position.count / 3,
        blocks: f.art.blocks.length,
        footings: f.art.footings.map((p) => ({
          top: p.top,
          bottom: p.bottom,
          groundClearance:
            f.art.root.position.y +
            p.bottom -
            game.groundHeight(
              f.art.root.position.x + p.x,
              f.art.root.position.z + p.z,
            ),
        })),
        halfWidth:
          f.basin.material.userData.waterUniforms.impactHalfWidth.value,
        curtains: f.curtains.map((c) => ({
          top: c.position.y + (c.scale.y * 6.9) / 2,
          bottom: c.position.y - (c.scale.y * 6.9) / 2,
          singlePass: c.material.forceSinglePass,
        })),
      };
    }),
  };
}

export function prepareSpillwayWade(game) {
  const f = game.waterfallEffects.find((f) => f.index === 0),
    s = f.basin.userData.waterfallSite || f.basin.userData;
  game.player.position.set(s.x, game.groundHeight(s.x, s.z + 3.6), s.z + 3.6);
  game.health = 100;
  game.grounded = true;
  game.jumpY = 0;
  game.velocityY = 0;
  game.swimming = false;
  game.crouching = false;
  game.yaw = 0;
  game.pitch = 0.15;
  game.keys.clear();
  game.setPaused(false);
  game.updateCamera(1);
  document.activeElement?.blur();
  return { site: { x: s.x, z: s.z }, start: game.player.position.toArray() };
}

export function stepSpillwayWade(game, frames = 48) {
  const start = game.player.position.toArray();
  for (let i = 0; i < frames; i++) {
    game.elapsed += 1 / 60;
    game.updatePlayer(1 / 60);
  }
  game.updateCamera(1);
  game.updateDecorations(0);
  game.renderScene(0);
  return {
    start,
    end: game.player.position.toArray(),
    health: game.health,
    swimming: game.swimming,
    linked: inspectSpillways(game).linked,
  };
}
