import * as THREE from "three";
import { animateExplorer } from "../src/explorer.js";
import { updateReturnCable } from "../src/return-cable.js";
import { Soundscape } from "../src/audio.js";
import { handGeometry } from "./inspect-hand-geometry.js";

export function returnCableView(
  game,
  view = "rider",
  index = 0,
  travel = 0.35,
) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const c = game.traversalCourses[index],
    rig = c.zipRig;
  game.progress.stage = c.stage;
  game.progress.field = [c.id];
  game.progress.completed = false;
  c.zip.visible = true;
  game.zipRide = {
    course: c,
    approach: false,
    time: travel * 2.4,
    duration: 2.4,
  };
  game.ropeRide = null;
  game.grounded = false;
  game.player.position.copy(c.launch).lerp(c.exit, travel);
  game.avatar.rotation.y = Math.atan2(
    c.exit.x - c.launch.x,
    c.exit.z - c.launch.z,
  );
  updateReturnCable(game, c, 0);
  for (let i = 0; i < 24; i++) animateExplorer(game, 1 / 60, false, false);
  const center =
    view === "terminal"
      ? c.launch.clone().add(new THREE.Vector3(0, 1.8, 0))
      : game.player.position.clone().add(new THREE.Vector3(0, 1.75, 0));
  const eye = center
    .clone()
    .addScaledVector(rig.frame.across, view === "terminal" ? 3.8 : 2.6)
    .addScaledVector(rig.frame.direction, view === "terminal" ? 2.5 : -1.8)
    .add(new THREE.Vector3(0, view === "terminal" ? 1.8 : 1.05, 0));
  game.camera.fov = view === "terminal" ? 57 : 50;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.copy(eye);
  game.camera.lookAt(center);
  game.updateDecorations(0, 1, 1);
  game.renderScene(0);
  const contacts = handGeometry(game).map(({ side, fingers }) => ({
      side,
      minimum: Math.min(...Object.values(fingers).map((f) => f.minimum)),
      maximumContact: Math.max(...Object.values(fingers).map((f) => f.minimum)),
    })),
    gl = game.renderer.getContext();
  return {
    chapter: game.level.id,
    view,
    handContacts: contacts,
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}

// Assisted audio check: force a spatial selection tick even if the browser has
// suspended its real-time audio clock. Offline renders use the delivered voice
// factory, filters and HRTF panner, with a shared buffer for each comparison.
export async function inspectCableSound(game) {
  const c = game.traversalCourses[0],
    rig = c.zipRig,
    audio = game.audio;
  game.renderer.setAnimationLoop(null);
  game.paused = false;
  game.zipRide = { course: c, approach: false };
  game.player.position.copy(c.launch).lerp(c.exit, 0.35);
  updateReturnCable(game, c, 0);
  const tick = async () => {
    audio.lastSpatial = -Infinity;
    game.updateAudio();
    await Promise.all([...audio.buffers.values()]);
    audio.lastSpatial = -Infinity;
    game.updateAudio();
    return {
      task: audio.task,
      voices: [...audio.voices.keys()],
      count: audio.voices.size,
    };
  };
  const riding = await tick();
  game.zipRide = null;
  rig.travel = 0.65;
  rig.returning = true;
  const winch = rig.sources[1];
  game.player.position.set(winch.x, winch.y - 1.6, winch.z + 1.2);
  updateReturnCable(game, c, 1 / 60);
  const returning = await tick();
  game.setPaused(true);
  const paused = [...audio.voices.keys()].filter((id) =>
    rig.sources.some((s) => s.id === id),
  );
  game.paused = false;
  rig.travel = 0;
  rig.returning = false;
  updateReturnCable(game, c, 0);
  const resting = await tick();
  game.setPaused(true);
  const measured = [];
  for (const original of rig.sources) {
    const buffer = await audio.loadBuffer(original.kind),
      distances = [
        original.near,
        (original.near + original.range) / 2,
        original.range + 1,
      ],
      rms = [];
    for (const distance of distances) {
      const ctx = new OfflineAudioContext(2, 96000, 48000),
        isolated = new Soundscape(),
        input = ctx.createGain();
      isolated.ctx = ctx;
      isolated.buses = { ambience: { input } };
      input.connect(ctx.destination);
      isolated.buffers.set(original.kind, Promise.resolve(buffer));
      const source = { ...original, x: 0, y: 0, z: -distance };
      await isolated.createVoice(source);
      const voice = isolated.voices.get(source.id);
      voice.node.gain.value = original.gain * 0.7;
      const rendered = await ctx.startRendering();
      let energy = 0;
      for (let channel = 0; channel < 2; channel++) {
        const samples = rendered.getChannelData(channel);
        for (let i = 48000; i < 96000; i++) energy += samples[i] ** 2;
      }
      rms.push(Math.sqrt(energy / 96000));
      voice.player.disconnect();
      voice.panner.disconnect();
      voice.node.disconnect();
      voice.obstruction.nodes.forEach((node) => node.disconnect());
      input.disconnect();
    }
    measured.push({ id: original.id, distances, rms });
  }
  return { riding, returning, paused, resting, measured };
}
