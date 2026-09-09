import { createOcclusionFilter } from "./audio-occlusion.js";
import { echoEnvelope, ECHO_PERIOD } from "./echo-gallery-rules.js";

// Web Audio coordinates match the Three.js world. Each emitter is a mono source
// positioned relative to the explorer; music and interface sounds stay in stereo.
export const AUDIO_SOURCES = {
  ...Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      `echo${n}`,
      { range: 24, near: 1.5, gain: 0.4, filter: 7000 },
    ]),
  ),
  birds: { file: "birds.ogg", range: 48, near: 3, gain: 0.85, filter: 14000 },
  waterfall: {
    file: "waterfall.ogg",
    range: 70,
    near: 6,
    gain: 1.05,
    filter: 10000,
  },
  stream: { file: "stream.ogg", range: 36, near: 3, gain: 0.65, filter: 11000 },
  fire: { file: "fire.ogg", range: 22, near: 2, gain: 0.8, filter: 12000 },
  drips: { file: "drips.flac", range: 28, near: 2, gain: 0.65, filter: 12000 },
  wind: { range: 65, near: 4, gain: 0.7, filter: 6000 },
  steam: { range: 22, near: 2, gain: 0.16, filter: 7500 },
  rope: { range: 25, near: 3, gain: 0.18, filter: 4600 },
  hoist: { range: 28, near: 2, gain: 0.055, filter: 4600 },
  machine: { range: 32, near: 3, gain: 0.7, filter: 4000 },
  crystal: { range: 34, near: 3, gain: 0.6, filter: 10000 },
  resonator: { range: 16, near: 1.2, gain: 0.14, filter: 7000 },
  lava: { range: 45, near: 4, gain: 0.9, filter: 4500 },
  bubbles: { range: 16, near: 1, gain: 0.2, filter: 2800 },
};

export const SCORES = {
  jungle: {
    root: 50,
    bpm: 58,
    scale: [0, 2, 3, 5, 7, 9, 10],
    chords: [0, 3, 5, 4],
    motif: [0, 4, 2, 1, 5, 4, 2, 0],
    voice: "wood",
    color: 1800,
  },
  desert: {
    root: 45,
    bpm: 54,
    scale: [0, 1, 4, 5, 7, 8, 10],
    chords: [0, 3, 1, 4],
    motif: [0, 1, 4, 3, 1, 0, 4, 2],
    voice: "pluck",
    color: 1600,
  },
  snow: {
    root: 50,
    bpm: 46,
    scale: [0, 2, 4, 7, 9, 12, 14],
    chords: [0, 3, 1, 2],
    motif: [4, 2, 1, 0, 3, 2, 1, 0],
    voice: "bell",
    color: 2600,
  },
  water: {
    root: 43,
    bpm: 52,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [0, 5, 3, 4],
    motif: [0, 2, 4, 5, 4, 2, 1, 2],
    voice: "glass",
    color: 1800,
  },
  volcano: {
    root: 38,
    bpm: 62,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [0, 1, 5, 4],
    motif: [0, 0, 4, 1, 0, 3, 2, 1],
    voice: "bronze",
    color: 1200,
  },
  sky: {
    root: 48,
    bpm: 60,
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [0, 3, 1, 4],
    motif: [0, 2, 4, 6, 5, 4, 2, 4],
    voice: "flute",
    color: 2300,
  },
  crystal: {
    root: 52,
    bpm: 48,
    scale: [0, 2, 3, 6, 7, 9, 10],
    chords: [0, 2, 5, 3],
    motif: [0, 4, 6, 2, 5, 3, 1, 4],
    voice: "glass",
    color: 2400,
  },
  eclipse: {
    root: 40,
    bpm: 50,
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [0, 5, 3, 4],
    motif: [0, 4, 2, 6, 5, 4, 1, 0],
    voice: "choir",
    color: 1800,
  },
};

export function distanceGain(distance, near = 3, range = 40) {
  return Math.max(0, Math.min(1, 1 - (distance - near) / (range - near)));
}
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function createImmersionFilter(context) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(20000, context.sampleRate * 0.48);
  filter.Q.value = 0.5;
  return filter;
}

export function setImmersion(buses, underwater, time) {
  for (const [name, bus] of Object.entries(buses || {})) {
    const filter = bus.immersion;
    if (!filter) continue;
    const clear = Math.min(20000, filter.context.sampleRate * 0.48);
    filter.frequency.setTargetAtTime(
      underwater ? (name === "music" ? 950 : 700) : clear,
      time,
      0.18,
    );
  }
}

// Four phrases, with deliberate rests. Objective index changes voicing and motif
// placement while keeping the chapter's tonal center stable across transitions.
export function scoreBar(biome, stage, bar, mode = "explore", task = "survey") {
  const s = SCORES[biome] || SCORES.jungle;
  const degree = (n) => s.scale[((n % 7) + 7) % 7] + Math.floor(n / 7) * 12;
  const chord = s.chords[(Math.floor(bar / 2) + Math.floor(stage / 3)) % 4];
  const events = [];
  if (bar % 2 === 0) {
    [0, 2, 4].forEach((interval, i) =>
      events.push({
        beat: i * 0.09,
        note: s.root + degree(chord + interval),
        length: 8.8,
        gain: 0.025,
        voice: "pad",
        pan: (i - 1) * 0.42,
      }),
    );
    events.push({
      beat: 0,
      note: s.root - 12 + degree(chord),
      length: 7,
      gain: 0.03,
      voice: "bass",
      pan: 0,
    });
  }
  if (
    bar % 8 < 6 &&
    mode !== "puzzle" &&
    mode !== "reading" &&
    task !== "tuning" &&
    task !== "dive"
  ) {
    const sparse = ["snow", "crystal", "eclipse"].includes(biome);
    const beats = sparse ? [0.6, 2.6] : [0.5, 1.8, 3.1];
    beats.forEach((beat, i) => {
      const motif = s.motif[(bar * 2 + i + stage) % s.motif.length];
      events.push({
        beat,
        note: s.root + 12 + degree(motif),
        length: s.voice === "flute" ? 1.5 : 2.9,
        gain: 0.037,
        voice: s.voice,
        pan: Math.sin(bar + i * 2) * 0.32,
      });
    });
  }
  if (
    (mode === "danger" && task !== "dive") ||
    (task === "lift" && bar % 2 === 0)
  )
    [0, 2].forEach((beat) =>
      events.push({
        beat,
        note: s.root - 12,
        length: 0.6,
        gain: 0.045,
        voice: "pulse",
        pan: 0,
      }),
    );
  if (task === "climb" && bar % 4 === 3)
    events.push({
      beat: 1,
      note: s.root + 24 + degree(4),
      length: 3,
      gain: 0.02,
      voice: "flute",
      pan: 0.25,
    });
  return events;
}

export class Soundscape {
  constructor() {
    this.volume = 0.45;
    this.mix = { music: 32, ambience: 80, effects: 75 };
    this.ctx = null;
    this.buffers = new Map();
    this.voices = new Map();
    this.sources = [];
    this.playingNodes = new Set();
    this.mode = "explore";
    this.generation = 0;
    this.stage = 0;
    this.task = "survey";
    this.maxVoices = 12;
    this.lastSpatial = -1;
  }
  init() {
    if (this.ctx) return true;
    const Constructor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Constructor) return false;
    this.ctx = new Constructor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.22;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.noiseBuffer = this.synthetic("wind", 12);
    return true;
  }
  start(biome = "jungle", sources = [], { paused = false } = {}) {
    if (!this.init()) return;
    this.stopScene();
    if (paused) this.pause();
    else this.resume();
    this.biome = biome;
    this.sources = sources;
    this.mode = "explore";
    this.stage = 0;
    this.task = "survey";
    const t = this.ctx.currentTime;
    this.sceneBus = this.ctx.createGain();
    this.sceneBus.gain.setValueAtTime(0, t);
    this.sceneBus.gain.linearRampToValueAtTime(1, t + 1.2);
    this.sceneBus.connect(this.master);
    this.buses = {};
    for (const name of ["music", "ambience", "effects"]) {
      const input = this.ctx.createGain(),
        output = this.ctx.createGain(),
        immersion = createImmersionFilter(this.ctx);
      input.connect(output);
      output.connect(immersion);
      immersion.connect(this.sceneBus);
      this.buses[name] = { input, output, immersion };
    }
    this.addReverb(
      "music",
      ["snow", "crystal", "eclipse"].includes(biome) ? 3.8 : 2.8,
      0.27,
    );
    if (["crystal", "eclipse", "water"].includes(biome))
      this.addReverb("ambience", 1.8, 0.12);
    this.applyMix();
    // Quiet, broad air bed; individual landmarks are always positional.
    const bed = this.ctx.createBufferSource(),
      bedGain = this.ctx.createGain();
    bed.buffer = this.noiseBuffer;
    bed.loop = true;
    bedGain.gain.value = ["sky", "snow", "desert"].includes(biome)
      ? 0.1
      : 0.035;
    bed.connect(bedGain);
    bedGain.connect(this.buses.ambience.input);
    bed.start();
    this.track(bed, [bedGain]);
    this.bar = 0;
    this.nextBar = t + 0.25;
    this.scheduler = setInterval(() => this.schedule(), 125);
    this.schedule();
    const generation = this.generation;
    this.ready = Promise.allSettled(
      [...new Set(sources.map((s) => s.kind))].map((kind) =>
        this.loadBuffer(kind),
      ),
    ).then((results) => {
      if (generation !== this.generation) return;
      this.failures = results.filter((r) => r.status === "rejected").length;
    });
  }
  addReverb(bus, seconds, amount) {
    const ctx = this.ctx,
      convolver = ctx.createConvolver(),
      send = ctx.createGain();
    const impulse = ctx.createBuffer(
      2,
      Math.floor(ctx.sampleRate * seconds),
      ctx.sampleRate,
    );
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        smooth = smooth * 0.42 + (Math.random() * 2 - 1) * 0.58;
        data[i] =
          smooth *
          Math.pow(1 - i / data.length, 3.4) *
          (i < ctx.sampleRate * 0.02 ? 0 : 1);
      }
    }
    convolver.buffer = impulse;
    send.gain.value = amount;
    this.buses[bus].input.connect(send);
    send.connect(convolver);
    convolver.connect(this.buses[bus].output);
    this.buses[bus].reverb = [send, convolver];
  }
  async loadBuffer(kind) {
    if (this.buffers.has(kind)) return this.buffers.get(kind);
    const config = AUDIO_SOURCES[kind];
    const promise = (async () => {
      if (!config?.file) return this.synthetic(kind, 13);
      try {
        const response = await fetch(`/assets/audio/${config.file}`);
        if (!response.ok)
          throw Error(`Audio ${config.file}: ${response.status}`);
        const original = await this.ctx.decodeAudioData(
          await response.arrayBuffer(),
        );
        return this.loopBuffer(original);
      } catch (error) {
        console.warn(
          "A field recording could not load; using a quiet synthesized fallback.",
          error,
        );
        return this.synthetic(kind, 13);
      }
    })();
    this.buffers.set(kind, promise);
    return promise;
  }
  loopBuffer(original) {
    const rate = original.sampleRate;
    const count = Math.min(original.length, rate * 36),
      fade = Math.min(Math.floor(rate * 0.8), Math.floor(count / 5));
    const buffer = this.ctx.createBuffer(1, count - fade, rate),
      out = buffer.getChannelData(0);
    const mono = new Float32Array(count);
    for (let ch = 0; ch < original.numberOfChannels; ch++) {
      const data = original.getChannelData(ch);
      for (let i = 0; i < count; i++)
        mono[i] += data[i] / original.numberOfChannels;
    }
    let power = 0,
      peak = 0;
    for (let i = 0; i < out.length; i++) {
      let value = mono[i + fade];
      if (i >= out.length - fade) {
        const n = i - (out.length - fade),
          a = n / fade;
        value =
          value * Math.cos((a * Math.PI) / 2) +
          mono[n] * Math.sin((a * Math.PI) / 2);
      }
      out[i] = value;
      power += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    const gain = Math.min(
      0.12 / Math.max(0.0001, Math.sqrt(power / out.length)),
      0.72 / Math.max(0.0001, peak),
    );
    for (let i = 0; i < out.length; i++) out[i] *= gain;
    return buffer;
  }
  synthetic(kind, duration) {
    if (/^echo[1-4]$/.test(kind)) {
      const rate = this.ctx.sampleRate,
        count = Number(kind.at(-1)),
        buffer = this.ctx.createBuffer(1, rate * ECHO_PERIOD, rate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        data[i] =
          echoEnvelope(count, t) *
          0.22 *
          (Math.sin(t * 2 * Math.PI * 294) +
            0.22 * Math.sin(t * 2 * Math.PI * 588));
      }
      return buffer;
    }
    const rate = this.ctx.sampleRate,
      buffer = this.ctx.createBuffer(1, Math.floor(rate * duration), rate);
    const pressureLowStep = 1 - Math.exp((-2 * Math.PI * 480) / rate),
      pressureHighStep = 1 - Math.exp((-2 * Math.PI * 6800) / rate);
    const data = buffer.getChannelData(0);
    let brown = 0,
      pressureLow = 0,
      pressureHigh = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate,
        noise = Math.random() * 2 - 1;
      brown = brown * 0.975 + noise * 0.025;
      // A band-limited pressure hiss has a separate spectrum from ridge wind.
      // Slow modulation breathes without producing a rhythmic musical pulse.
      pressureLow += (noise - pressureLow) * pressureLowStep;
      pressureHigh += (noise - pressureHigh) * pressureHighStep;
      const air = brown * (0.4 + 0.3 * Math.sin(t * 0.47) ** 2);
      data[i] =
        kind === "bubbles"
          ? (Math.sin(t * 2 * Math.PI * (210 + 60 * Math.sin(t * 3.1))) * 0.12 +
              brown * 0.2) *
            Math.pow(Math.max(0, Math.sin(t * 11 + Math.sin(t * 2.3))), 12)
          : kind === "resonator"
            ? (Math.sin(t * 2 * Math.PI * 200) +
                0.12 * Math.sin(t * 2 * Math.PI * 400)) *
              0.1
            : kind === "rope" || kind === "hoist"
              ? (Math.sin(t * 2 * Math.PI * 91 + Math.sin(t * 0.81) * 7) *
                  0.05 +
                  Math.sin(t * 2 * Math.PI * 143 + Math.sin(t * 0.7) * 3) *
                    0.015 +
                  (pressureHigh - pressureLow) * 0.08) *
                (kind === "hoist"
                  ? 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.07), 6)
                  : Math.pow(0.5 + 0.5 * Math.sin(t * 1.07), 6))
              : kind === "steam"
                ? (pressureHigh - pressureLow) *
                  (0.32 + Math.sin(t * 0.73) ** 2 * 0.08)
                : kind === "crystal"
                  ? (Math.sin(t * 2 * Math.PI * 330) +
                      0.35 * Math.sin(t * 2 * Math.PI * 495)) *
                    (0.018 + Math.sin(t * 0.7) ** 8 * 0.025)
                  : kind === "machine" || kind === "lava"
                    ? air * 0.6 +
                      Math.sin(t * Math.PI * 2 * 48) *
                        (0.03 + 0.01 * Math.sin(t * 4))
                    : air;
    }
    return this.loopBuffer(buffer);
  }
  track(node, extra = []) {
    this.playingNodes.add(node);
    node.onended = () => {
      this.playingNodes.delete(node);
      node.disconnect();
      extra.forEach((n) => n.disconnect());
    };
  }
  async createVoice(source) {
    const generation = this.generation;
    const voice = { source, loading: true, gain: 0, distance: Infinity };
    this.voices.set(source.id, voice);
    const buffer = await this.loadBuffer(source.kind);
    if (generation !== this.generation || this.voices.get(source.id) !== voice)
      return;
    const config = AUDIO_SOURCES[source.kind],
      ctx = this.ctx;
    const player = ctx.createBufferSource(),
      panner = ctx.createPanner(),
      gain = ctx.createGain();
    player.buffer = buffer;
    player.loop = true;
    player.playbackRate.value = source.rate || 1;
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.refDistance = source.near || config.near;
    panner.maxDistance = source.range || config.range;
    panner.rolloffFactor = 1;
    panner.positionX.value = source.x;
    panner.positionY.value = source.y;
    panner.positionZ.value = source.z;
    gain.gain.value = 0;
    const obstruction = createOcclusionFilter(
      ctx,
      player,
      panner,
      config.filter,
    );
    panner.connect(gain);
    gain.connect(this.buses.ambience.input);
    const hash = [...source.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    player.start(
      0,
      source.phaseSync
        ? ctx.currentTime % buffer.duration
        : (hash * 0.731) % buffer.duration,
    );
    this.track(player, [panner, gain, ...obstruction.nodes]);
    Object.assign(voice, {
      player,
      panner,
      node: gain,
      obstruction,
      loading: false,
    });
  }
  releaseVoice(id) {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    if (voice.loading) return;
    const t = this.ctx.currentTime;
    voice.node.gain.setTargetAtTime(0, t, 0.1);
    voice.player.stop(t + 0.45);
  }
  update(
    position,
    yaw,
    {
      stage = 0,
      task = "survey",
      danger = false,
      occluded,
      sourceActive,
      underwater = false,
      listenerHeight = 1.6,
    } = {},
  ) {
    if (!this.ctx || !this.sceneBus) return;
    const t = this.ctx.currentTime,
      listener = this.ctx.listener;
    this.stage = stage;
    this.task = task;
    this.underwater = underwater;
    setImmersion(this.buses, underwater, t);
    if (danger) this.dangerUntil = t + 4;
    if (["explore", "danger"].includes(this.mode))
      this.setMode((this.dangerUntil || 0) > t ? "danger" : "explore");
    const set = (param, value) => param.setTargetAtTime(value, t, 0.045);
    if (listener.positionX) {
      set(listener.positionX, position.x);
      set(listener.positionY, position.y + listenerHeight);
      set(listener.positionZ, position.z);
      set(listener.forwardX, -Math.sin(yaw));
      set(listener.forwardY, 0);
      set(listener.forwardZ, -Math.cos(yaw));
      set(listener.upX, 0);
      set(listener.upY, 1);
      set(listener.upZ, 0);
    } else {
      listener.setPosition(position.x, position.y + listenerHeight, position.z);
      listener.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0);
    }
    if (t - this.lastSpatial < 0.1) return;
    this.lastSpatial = t;
    const candidates = this.sources
      .map((source) => {
        const config = AUDIO_SOURCES[source.kind];
        const distance = Math.hypot(
          source.x - position.x,
          source.y - position.y - listenerHeight,
          source.z - position.z,
        );
        const gain =
          distanceGain(
            distance,
            source.near || config.near,
            source.range || config.range,
          ) *
          (source.gain ?? config.gain) *
          (source.activity ?? 1) *
          (sourceActive?.(source) === false ? 0 : 1);
        return {
          source,
          distance,
          gain,
          priority: gain * (this.voices.has(source.id) ? 1.12 : 1),
        };
      })
      .filter((c) => c.gain > 0.006)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.maxVoices);
    const selected = new Set(candidates.map((c) => c.source.id));
    for (const id of this.voices.keys())
      if (!selected.has(id)) this.releaseVoice(id);
    for (const c of candidates) {
      if (!this.voices.has(c.source.id)) this.createVoice(c.source);
      const v = this.voices.get(c.source.id);
      if (!v || v.loading) continue;
      const blocked = !!occluded?.(c.source);
      const config = AUDIO_SOURCES[c.source.kind];
      set(v.panner.positionX, c.source.x);
      set(v.panner.positionY, c.source.y);
      set(v.panner.positionZ, c.source.z);
      if (Number.isFinite(c.source.rate) && c.source.rate > 0)
        set(v.player.playbackRate, Math.max(0.25, Math.min(4, c.source.rate)));
      v.node.gain.setTargetAtTime(
        (c.source.gain ?? config.gain) *
          (c.source.activity ?? 1) *
          (blocked ? 0.38 : 1),
        t,
        0.22,
      );
      v.obstruction.setBlocked(blocked, t);
      Object.assign(v, {
        distance: c.distance,
        gain: c.gain * (blocked ? 0.38 : 1),
        blocked,
      });
    }
  }
  schedule() {
    if (!this.ctx || this.ctx.state !== "running" || !this.sceneBus) return;
    const now = this.ctx.currentTime;
    if (this.nextBar < now - 0.5) this.nextBar = now + 0.1;
    const score = SCORES[this.biome],
      beat = 60 / score.bpm;
    while (this.nextBar < now + 0.4) {
      for (const event of scoreBar(
        this.biome,
        this.stage,
        this.bar,
        this.mode,
        this.task,
      ))
        this.instrument(
          event,
          this.nextBar + event.beat * beat,
          event.length * beat,
        );
      this.nextBar += 4 * beat;
      this.bar++;
    }
  }
  instrument(event, time, length, bus = "music") {
    if (!this.buses) return;
    const ctx = this.ctx,
      voice = event.voice;
    const envelope = ctx.createGain(),
      pan = ctx.createStereoPanner(),
      filter = ctx.createBiquadFilter();
    pan.pan.value = event.pan || 0;
    filter.type = "lowpass";
    filter.frequency.value =
      voice === "pad" ? 900 : SCORES[this.biome]?.color || 2200;
    const slow = ["pad", "choir", "flute", "bass"].includes(voice);
    const attack = slow ? Math.min(1.6, length * 0.22) : 0.012;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(event.gain, time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    envelope.connect(filter);
    filter.connect(pan);
    pan.connect(this.buses[bus].input);
    const partials =
      voice === "pad" || voice === "choir"
        ? [1, 1.003, 2]
        : voice === "bell" || voice === "glass"
          ? [1, 2.756, 5.404]
          : voice === "bronze"
            ? [1, 1.99, 3.01]
            : [1, 2];
    let remaining = partials.length;
    partials.forEach((ratio, i) => {
      const oscillator = ctx.createOscillator(),
        level = ctx.createGain();
      oscillator.type =
        ["pluck", "wood", "pulse"].includes(voice) && i === 0
          ? "triangle"
          : "sine";
      oscillator.frequency.value = midi(event.note) * ratio;
      oscillator.frequency.setValueAtTime(midi(event.note) * ratio, time);
      if (voice === "pulse")
        oscillator.frequency.exponentialRampToValueAtTime(
          midi(event.note) * 0.48,
          time + length,
        );
      level.gain.value = i === 0 ? 0.7 : 0.15 / i;
      oscillator.connect(level);
      level.connect(envelope);
      oscillator.start(time);
      oscillator.stop(time + length + 0.05);
      this.playingNodes.add(oscillator);
      oscillator.onended = () => {
        this.playingNodes.delete(oscillator);
        oscillator.disconnect();
        level.disconnect();
        if (--remaining === 0) {
          envelope.disconnect();
          filter.disconnect();
          pan.disconnect();
        }
      };
    });
  }
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMix();
  }
  applyMix() {
    if (!this.buses) return;
    const t = this.ctx.currentTime;
    const musicDuck =
      { puzzle: 0.14, reading: 0.32, pause: 0.3, danger: 0.85 }[this.mode] ?? 1;
    const ambientDuck =
      { puzzle: 0.3, reading: 0.5, pause: 0.4 }[this.mode] ?? 1;
    for (const [name, bus] of Object.entries(this.buses)) {
      const duck =
        name === "music" ? musicDuck : name === "ambience" ? ambientDuck : 1;
      bus.output.gain.setTargetAtTime(
        (this.mix[name] / 100) * duck * (name === "music" ? 3.5 : 1),
        t,
        0.6,
      );
    }
  }
  setMix(settings) {
    for (const name of ["music", "ambience", "effects"])
      if (Number.isFinite(settings[name]))
        this.mix[name] = clamp(settings[name], 0, 100);
    this.applyMix();
  }
  setVolume(v) {
    this.volume = clamp(v, 0, 100) / 100;
    if (this.master)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
  }
  tone(type = "click") {
    if (!this.ctx || !this.buses) return;
    if (type === "shoot" || type === "hurt") {
      this.noiseHit(
        type === "shoot" ? 0.22 : 0.12,
        type === "shoot" ? 0.11 : 0.18,
        type === "shoot" ? 2700 : 450,
      );
      return;
    }
    const notes = {
      click: [69],
      collect: [72, 76, 79],
      solve: [67, 74, 79, 83],
      jump: [48],
      gate: [38, 45],
      field: [62, 69],
    };
    (notes[type] || notes.click).forEach((note, i) =>
      this.instrument(
        { note, gain: type === "click" ? 0.04 : 0.14, voice: "wood" },
        this.ctx.currentTime + i * 0.13,
        type === "solve" ? 2.2 : 0.5,
        "effects",
      ),
    );
  }
  noiseHit(gain, length, frequency, position) {
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime,
      source = this.ctx.createBufferSource(),
      envelope = this.ctx.createGain(),
      filter = this.ctx.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(gain * 5, t + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(filter);
    filter.connect(envelope);
    const spatial = position ? this.ctx.createPanner() : null;
    if (spatial) {
      spatial.panningModel = "HRTF";
      spatial.distanceModel = "linear";
      spatial.refDistance = 2;
      spatial.maxDistance = 40;
      spatial.positionX.value = position.x;
      spatial.positionY.value = position.y;
      spatial.positionZ.value = position.z;
      envelope.connect(spatial);
      spatial.connect(this.buses.effects.input);
    } else envelope.connect(this.buses.effects.input);
    source.start(0, Math.random() * 5);
    source.stop(t + length + 0.03);
    this.track(source, [filter, envelope, ...(spatial ? [spatial] : [])]);
  }
  footstep(surface, sprint = false, position, gain = 1) {
    if (!this.ctx || !this.buses) return;
    this.noiseHit(
      (sprint ? 0.11 : 0.075) * gain,
      surface === "snow" ? 0.21 : 0.11,
      surface === "snow"
        ? 4000
        : surface === "desert"
          ? 1800
          : surface === "wood"
            ? 600
            : 950,
      position,
    );
  }
  note(frequency) {
    if (!this.ctx || !this.buses) return;
    this.instrument(
      { note: 69 + 12 * Math.log2(frequency / 440), gain: 0.25, voice: "bell" },
      this.ctx.currentTime,
      0.9,
      "effects",
    );
  }
  // Bronze has inharmonic partials. Each strike stays at the visible bell while
  // the listener moves; delayed strikes use the audio clock for steady phrases.
  bell(frequency, position, { delay = 0, atTime, blocked = false } = {}) {
    if (!this.ctx || !this.buses || !Number.isFinite(frequency)) return null;
    this.bellVoices ||= new Set();
    while (this.bellVoices.size >= 12)
      this.bellVoices.values().next().value.stop();
    const t = Number.isFinite(atTime)
        ? Math.max(this.ctx.currentTime, atTime)
        : this.ctx.currentTime + Math.max(0, delay),
      panner = this.ctx.createPanner(),
      filter = this.ctx.createBiquadFilter(),
      envelope = this.ctx.createGain();
    panner.panningModel = "HRTF";
    panner.distanceModel = "linear";
    panner.refDistance = 2;
    panner.maxDistance = 55;
    panner.rolloffFactor = 1;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    filter.type = "lowpass";
    filter.frequency.value = blocked ? 1200 : 12000;
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(blocked ? 0.12 : 0.32, t + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    envelope.connect(filter);
    filter.connect(panner);
    panner.connect(this.buses.effects.input);
    const nodes = [],
      levels = [];
    let remaining = 4,
      retired = false;
    const voice = {
      panner,
      filter,
      envelope,
      frequency,
      time: t,
      stop: () => {
        if (retired) return;
        retired = true;
        this.bellVoices.delete(voice);
        for (const node of nodes) {
          try {
            node.stop();
          } catch {}
        }
      },
    };
    this.bellVoices.add(voice);
    [1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
      const node = this.ctx.createOscillator(),
        level = this.ctx.createGain();
      node.type = "sine";
      node.frequency.value = frequency * ratio;
      level.gain.value = [0.7, 0.2, 0.075, 0.025][i];
      node.connect(level);
      level.connect(envelope);
      nodes.push(node);
      levels.push(level);
      this.playingNodes.add(node);
      node.onended = () => {
        this.playingNodes.delete(node);
        node.disconnect();
        level.disconnect();
        if (--remaining === 0) {
          retired = true;
          this.bellVoices.delete(voice);
          envelope.disconnect();
          filter.disconnect();
          panner.disconnect();
        }
      };
      node.start(t);
      node.stop(t + 3.55);
    });
    return voice;
  }
  stopScene() {
    for (const voice of this.bellVoices || []) voice.stop();
    this.generation++;
    clearInterval(this.scheduler);
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      oldBus = this.sceneBus,
      oldBuses = this.buses;
    if (oldBus) oldBus.gain.setTargetAtTime(0, t, 0.1);
    const oldNodes = [...this.playingNodes];
    oldNodes.forEach((node) => {
      try {
        node.stop(t + 0.4);
      } catch {}
    });
    setTimeout(() => {
      oldBus?.disconnect();
      Object.values(oldBuses || {}).forEach((bus) => {
        bus.input.disconnect();
        bus.output.disconnect();
        bus.immersion?.disconnect();
        bus.reverb?.forEach((n) => n.disconnect());
      });
    }, 500);
    this.voices.clear();
    this.sources = [];
    this.sceneBus = null;
    this.buses = null;
    this.lastSpatial = -1;
    this.dangerUntil = 0;
  }
  pause() {
    this.wantsPlayback = false;
    return this.ctx?.suspend().catch(() => {});
  }
  resume() {
    if (globalThis.document?.hidden) return;
    this.wantsPlayback = true;
    return this.ctx
      ?.resume()
      .then(() => {
        // A gesture may have queued resume before chapter loading or tab hiding
        // requested silence. Honor the latest intent when that resume completes.
        if (!this.wantsPlayback) return this.ctx.suspend();
      })
      .catch(() => {});
  }
  debug() {
    return {
      state: this.ctx?.state || "uninitialized",
      biome: this.biome,
      mode: this.mode,
      stage: this.stage,
      task: this.task,
      musicBar: this.bar,
      mix: { ...this.mix },
      registered: this.sources.length,
      active: this.voices.size,
      nodes: this.playingNodes.size,
      voices: [...this.voices.values()].map((v) => ({
        id: v.source.id,
        kind: v.source.kind,
        distance: v.distance,
        gain: v.gain,
        blocked: v.blocked,
        loading: v.loading,
      })),
    };
  }
}
