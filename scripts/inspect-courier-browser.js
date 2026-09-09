import * as THREE from "three";
import { Soundscape } from "../src/audio.js";
import { COURIER_STOPS } from "../src/courier-rules.js";

// Run against a prepared development Adventure. These are diagnostics, not a
// completion shortcut or a measurement of an unaided player's chapter duration.
export function inspectCourier(game) {
  const h = game.courierFerry;
  let triangles = 0,
    meshes = 0;
  h.root.traverse((o) => {
    if (o.geometry) {
      meshes++;
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  const controls = [
    { kind: "tablet", x: 120, z: 22.2, y: h.y },
    ...COURIER_STOPS.map((x, dock) => ({
      kind: "crank",
      dock,
      x: x - 4.7,
      z: 21.2,
      y: h.y,
    })),
    ...COURIER_STOPS.slice(1).map((x, i) => ({
      kind: "dispatch",
      dock: i + 1,
      x: x + 4.1,
      z: 25,
      y: h.y + 4.2,
    })),
  ];
  const gl = game.renderer.getContext();
  return {
    triangles,
    meshes,
    controls: controls.map((c) => ({
      ...c,
      clear: game.canMove(c.x, c.z, c.y - game.groundHeight(c.x, c.z)),
    })),
    sources: h.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      near: s.near,
      range: s.range,
      gain: s.gain,
      activity: s.activity,
      x: s.x,
      y: s.y,
      z: s.z,
    })),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
export async function verifyCourierAudio(game) {
  const results = [];
  for (const source of game.courierFerry.sources.filter((s) =>
    ["courier-sail", "courier-rope"].includes(s.id),
  )) {
    const buffer = await game.audio.loadBuffer(source.kind),
      measures = [];
    for (const distance of [
      source.near,
      (source.near + source.range) / 2,
      source.range + 1,
    ]) {
      const ctx = new OfflineAudioContext(2, 48000 * 4, 48000),
        sound = new Soundscape(),
        mix = ctx.createGain();
      mix.gain.value = 0.18;
      mix.connect(ctx.destination);
      sound.ctx = ctx;
      sound.buses = { ambience: { input: mix } };
      sound.loadBuffer = async () => buffer;
      await sound.createVoice({ ...source, x: 0, y: 0, z: -distance });
      const voice = sound.voices.get(source.id);
      voice.node.gain.value = source.gain * 0.7;
      const rendered = await ctx.startRendering();
      let square = 0,
        peak = 0,
        count = 0;
      for (let ch = 0; ch < 2; ch++)
        for (let i = 48000; i < 144000; i++) {
          const n = rendered.getChannelData(ch)[i];
          if (!Number.isFinite(n)) throw Error("Nonfinite courier audio");
          square += n * n;
          peak = Math.max(peak, Math.abs(n));
          count++;
        }
      measures.push({
        distance,
        rms: Math.sqrt(square / count),
        peak,
        model: voice.panner.distanceModel,
      });
    }
    const ratio = measures[1].rms / measures[0].rms;
    if (Math.abs(ratio - 0.5) > 0.01 || measures[2].rms !== 0)
      throw Error("Courier source attenuation failed");
    results.push({ id: source.id, kind: source.kind, ratio, measures });
  }
  return results;
}

export function inspectCourierHands(game) {
  return game.courierFerry.handles.map((n, i) =>
    n
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(game.rig.arms[i][2].getWorldPosition(new THREE.Vector3())),
  );
}
