// Run in the development browser console:
// await (await import('/scripts/verify-audio-browser.js')).verifyAudio()
import { Soundscape, AUDIO_SOURCES } from "../src/audio.js";
import { createOcclusionFilter } from "../src/audio-occlusion.js";

function measure(buffer, from = 0, to = buffer.duration) {
  let peak = 0,
    square = 0,
    count = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (
      let i = Math.ceil(from * buffer.sampleRate);
      i < Math.floor(to * buffer.sampleRate);
      i++
    ) {
      const sample = samples[i];
      if (!Number.isFinite(sample)) throw new Error("Nonfinite audio sample");
      peak = Math.max(peak, Math.abs(sample));
      square += sample * sample;
      count++;
    }
  }
  return { peak, rms: Math.sqrt(square / count) };
}

export async function verifyAudio() {
  const results = [];
  for (const sampleRate of [22050, 48000]) {
    const ctx = new OfflineAudioContext(2, sampleRate * 12, sampleRate);
    const sound = new Soundscape();
    sound.ctx = ctx;
    const mix = ctx.createGain();
    mix.gain.value = 0.18;
    mix.connect(ctx.destination);
    sound.buses = { ambience: { input: mix } };
    await Promise.all(
      Object.keys(AUDIO_SOURCES).map(async (kind, index) => {
        const source = {
          id: `stress-${kind}`,
          kind,
          x: (index % 3) - 1,
          y: 0,
          z: -2,
        };
        await sound.createVoice(source);
        const voice = sound.voices.get(source.id);
        voice.node.gain.value = AUDIO_SOURCES[kind].gain;
        // Faster transitions than gameplay's 10 Hz spatial update, with differing
        // phases across all nine source types and moving source coordinates.
        for (let step = 1; step < 144; step++) {
          const time = step * 0.075;
          voice.obstruction.setBlocked((step + index) % 2 === 0, time);
          voice.panner.positionX.setTargetAtTime(
            Math.sin(step * 0.3) * 4,
            time,
            0.045,
          );
        }
        voice.player.stop(11.5);
      }),
    );
    const signal = measure(await ctx.startRendering(), 0, 11.5);
    if (!(signal.rms > 0.001 && signal.peak < 1))
      throw new Error(`Invalid ambience signal: ${JSON.stringify(signal)}`);

    const toneContext = new OfflineAudioContext(1, sampleRate * 4, sampleRate);
    const oscillator = toneContext.createOscillator();
    oscillator.frequency.value = 4000;
    const level = toneContext.createGain();
    level.gain.value = 0.3;
    level.connect(toneContext.destination);
    const obstruction = createOcclusionFilter(
      toneContext,
      oscillator,
      level,
      14000,
    );
    obstruction.setBlocked(true, 1.5);
    oscillator.start();
    const tone = await toneContext.startRendering();
    const clear = measure(tone, 0.5, 1.4),
      blocked = measure(tone, 3, 3.9);
    if (!(blocked.rms < clear.rms * 0.2 && blocked.rms > 0))
      throw new Error("Obstruction did not attenuate high frequencies");
    results.push({
      sampleRate,
      transitions: 143 * 9,
      ...signal,
      blockedRatio: blocked.rms / clear.rms,
    });
  }
  return results;
}
