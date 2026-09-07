import * as THREE from "three";
import { resetDiving } from "../src/diving.js";
import { archiveInteract } from "../src/tide-archive.js";
import {
  Soundscape,
  AUDIO_SOURCES,
  createImmersionFilter,
  setImmersion,
} from "../src/audio.js";

// Assisted entry at each float. Descent, floor approach, recovery and ascent use
// the actual chapter's collision and movement methods, not a simplified world.
export function diveArchiveRoutes(game) {
  const results = [];
  const saved = structuredClone(game.progress);
  const save = game.save;
  game.save = () => {};
  try {
    for (const drained of [false, true]) {
      game.progress.archive = [];
      game.progress.field = drained
        ? game.map.features.filter((f) => f.type === "field").map((f) => f.id)
        : [];
      game.updateDecorations(100);
      for (const site of game.tideArchive) {
        resetDiving(game);
        game.keys.clear();
        game.courseAnchor = null;
        game.climb = game.ropeRide = game.zipRide = game.blockGrip = null;
        game.player.position
          .copy(site.position)
          .setY(site.water.position.y - 0.38);
        game.player.position.z += 1.5;
        game.swimming = true;
        game.grounded = false;
        game.health = 100;
        game.keys.add("KeyX");
        const surface = game.player.position.clone();
        for (
          let i = 0;
          i < 300 && game.player.position.y > site.position.y + 0.1;
          i++
        ) {
          game.elapsed += 1 / 60;
          game.updatePlayer(1 / 60);
        }
        game.keys.clear();
        const reached = game.player.position.distanceTo(site.position);
        const recovered = archiveInteract(game);
        const air = game.diveAir;
        game.keys.add("Space");
        for (let i = 0; i < 300 && game.diving; i++) {
          game.elapsed += 1 / 60;
          game.updatePlayer(1 / 60);
        }
        game.keys.clear();
        results.push({
          id: site.record.id,
          drained,
          reached,
          recovered,
          air,
          surfaced:
            !game.diving && Math.abs(game.player.position.y - surface.y) < 0.1,
          health: game.health,
        });
      }
    }
    return results;
  } finally {
    Object.assign(game.progress, saved);
    game.save = save;
    game.updateDecorations(100);
  }
}

export function diveView(game, index = 0, underwater = true) {
  const site = game.tideArchive[index];
  resetDiving(game);
  game.keys.clear();
  game.progress.archive = [];
  game.diving = underwater;
  game.swimming = true;
  game.grounded = false;
  game.player.position
    .copy(site.position)
    .add(
      new THREE.Vector3(
        0,
        underwater ? 1 : site.water.position.y - site.position.y - 0.38,
        1.8,
      ),
    );
  game.yaw = 0;
  game.pitch = 0.08;
  for (let i = 0; i < 30; i++) game.updatePlayer(1 / 60);
  game.updateCamera(10);
  game.updateDecorations(0);
  game.updateAudio();
  game.renderScene(0);
  game.cb.update?.(game.state());
  const gl = game.renderer.getContext();
  return {
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}

export async function inspectDiveAudio(game) {
  const water = [];
  for (const sampleRate of [22050, 48000]) {
    const ctx = new OfflineAudioContext(1, sampleRate * 7, sampleRate);
    const oscillator = ctx.createOscillator();
    const immersion = createImmersionFilter(ctx);
    oscillator.frequency.value = 4000;
    oscillator.connect(immersion);
    immersion.connect(ctx.destination);
    setImmersion({ ambience: { immersion } }, true, 1.5);
    setImmersion({ ambience: { immersion } }, false, 4.5);
    oscillator.start();
    const result = await ctx.startRendering();
    const rms = (start, end) => {
      const a = result
        .getChannelData(0)
        .slice(start * sampleRate, end * sampleRate);
      return Math.sqrt(
        a.reduce((sum, sample) => sum + sample * sample, 0) / a.length,
      );
    };
    water.push({
      sampleRate,
      clear: rms(0.5, 1.4),
      submerged: rms(3.5, 4.4),
      restored: rms(6, 6.9),
    });
  }
  const buffer = await game.audio.loadBuffer("bubbles");
  const spatial = [];
  for (const distance of [1, 8.5, 17]) {
    const ctx = new OfflineAudioContext(2, 96000, 48000);
    const audio = new Soundscape();
    audio.ctx = ctx;
    const input = ctx.createGain();
    input.connect(ctx.destination);
    audio.buses = { ambience: { input } };
    audio.buffers.set("bubbles", Promise.resolve(buffer));
    await audio.createVoice({
      id: "bubble-test",
      kind: "bubbles",
      x: 0,
      y: 0,
      z: -distance,
    });
    const voice = audio.voices.get("bubble-test");
    voice.node.gain.value = AUDIO_SOURCES.bubbles.gain;
    const result = await ctx.startRendering();
    let energy = 0;
    for (let channel = 0; channel < 2; channel++)
      for (const sample of result.getChannelData(channel).slice(48000))
        energy += sample * sample;
    spatial.push({ distance, rms: Math.sqrt(energy / 96000) });
  }
  return { water, spatial };
}
