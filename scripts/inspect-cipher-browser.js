import * as THREE from "three";
import { advanceCharacter } from "../src/character-motion.js";
import { updateCipherCourts, settleCipher } from "../src/cipher-courts.js";

export function inspectCipher(game) {
  const blocked = [],
    soundBlocked = [],
    walkFailed = [];
  for (const site of game.cipherSites) {
    for (const f of [...site.nodes.map((n) => n.control), site.tablet]) {
      const p = f.group.position;
      if (!game.canMove(p.x, p.z, 0, 0)) blocked.push(f.id);
      game.player.position.copy(p).z += 1;
      game.player.position.y = game.groundHeight(p.x, p.z + 1);
      Object.assign(game, {
        grounded: true,
        jumpY: 0,
        velocityY: 0,
        airVelocity: null,
        jumpBuffer: 0,
        coyote: 0.1,
      });
      for (let i = 0; i < 30; i++)
        advanceCharacter(game, { x: 0, z: -2 }, 1 / 60);
      if (
        Math.hypot(game.player.position.x - p.x, game.player.position.z - p.z) >
          0.08 ||
        !game.grounded
      )
        walkFailed.push(f.id);
    }
    for (const node of site.nodes) {
      const listener = node.control.group.position
        .clone()
        .add(new THREE.Vector3(0, 1.6, 0));
      const s = node.sound;
      if (!game.lineOfSight(listener, new THREE.Vector3(s.x, s.y, s.z)))
        soundBlocked.push(node.control.id);
    }
  }
  return {
    courts: game.cipherSites.length,
    controls: game.cipherSites.reduce((n, s) => n + s.nodes.length + 1, 0),
    sounds: game.cipherSources.length,
    blocked,
    soundBlocked,
    walkFailed,
  };
}
export function cipherView(game, stage = 1, close = false) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  settleCipher(game);
  const site = game.cipherSites[stage],
    c = site.root.position;
  game.player.position.copy(site.tablet.group.position);
  if (close) {
    const n = site.nodes[0];
    game.camera.position.set(c.x + n.x + 2.8, c.y + n.y + 2.8, c.z + n.z + 4.3);
    game.camera.lookAt(c.x + n.x, c.y + n.y + 1.5, c.z + n.z);
  } else {
    game.camera.position.set(c.x + 13, c.y + 9, c.z + 28);
    game.camera.lookAt(c.x, c.y + 1, c.z + 12);
  }
  updateCipherCourts(game, 0);
  game.updateDecorations(0);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    stage,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
