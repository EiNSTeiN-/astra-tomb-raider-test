import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import { waterAt } from "../src/hydrology.js";
import { updateWindCourts } from "../src/wind-courts.js";
import { Soundscape } from "../src/audio.js";
export function windView(game, stage = 5) {
  const site = game.windSites[stage],
    c = site.root.position;
  game.player.position.set(c.x, game.groundHeight(c.x, c.z + 23), c.z + 23);
  game.updateDecorations(4);
  game.cb.update?.(game.state());
  game.camera.fov = 80;
  game.camera.filmOffset = 0;
  game.camera.updateProjectionMatrix();
  game.camera.position.set(c.x, c.y + 13, c.z + 31);
  game.camera.lookAt(c.x, c.y + 3.5, c.z + 13);
  game.renderScene();
  return {
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
  };
}
export function inspectWind(game) {
  const gl = game.renderer.getContext();
  return {
    arrays: game.windSites.length,
    nodes: game.windSites.reduce((n, s) => n + s.nodes.length, 0),
    controls: game.items
      .filter((f) => f.type === "wind")
      .map((f) => ({
        id: f.id,
        waterDepth: waterAt(game, f.x * 7, f.z * 7)?.depth || 0,
        clear: [-0.12, 0, 0.12].every((dx) =>
          [-0.12, 0, 0.12].every((dz) =>
            game.canMove(f.x * 7 + dx, f.z * 7 + dz, 0),
          ),
        ),
      })),
    sounds: game.windSites.flatMap((s) => [
      ...s.nodes.flatMap((n) =>
        [n.air, n.bearing].map((source) => ({
          id: source.id,
          clear: game.lineOfSight(
            n.control?.group.position ||
              new THREE.Vector3(n.air.x, n.air.y - 3.05, n.air.z + 1.5),
            new THREE.Vector3(source.x, source.y - 1.4, source.z),
          ),
        })),
      ),
      ...s.fans.map(({ sound: source }) => ({
        id: source.id,
        clear: game.lineOfSight(
          new THREE.Vector3(
            source.x,
            game.groundHeight(source.x, source.z + 1.5),
            source.z + 1.5,
          ),
          new THREE.Vector3(source.x, source.y - 1.4, source.z),
        ),
      })),
    ]),
    anchors: game.windSites.flatMap((s) =>
      s.nodes.map((n) => ({
        id: `${s.stage}/${n.index}`,
        attached: n.handles.every((h) => h.parent === n.wheel),
      })),
    ),
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}

// Render the actual HRTF voice graph at a constant 70% source activity. Reuse
// the same buffer and loop offset so comparisons measure only spatial falloff.
export async function verifyWindAudio(game) {
  const site = game.windSites[1],
    sources = [
      site.nodes[0].air,
      site.nodes[0].bearing,
      ...site.fans.map((f) => f.sound),
    ],
    result = [];
  for (const source of sources) {
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
      const moved = { ...source, x: 0, y: 0, z: -distance };
      await sound.createVoice(moved);
      const voice = sound.voices.get(source.id);
      voice.node.gain.value = source.gain * 0.7;
      const rendered = await ctx.startRendering();
      let square = 0,
        peak = 0,
        count = 0;
      for (let channel = 0; channel < 2; channel++) {
        const a = rendered.getChannelData(channel);
        for (let i = 48000; i < 144000; i++) {
          if (!Number.isFinite(a[i])) throw Error("Nonfinite wind audio");
          square += a[i] * a[i];
          peak = Math.max(peak, Math.abs(a[i]));
          count++;
        }
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
      throw Error("Wind source attenuation failed");
    result.push({ id: source.id, kind: source.kind, measures, ratio });
  }
  return result;
}
// Assisted local routes use actual character physics; they do not establish play duration.
export function walkWindCourts(game) {
  const saved = {
    position: game.player.position.clone(),
    stage: game.progress.stage,
    completed: game.progress.completed,
    sites: game.windSites.map((s) => ({
      state: structuredClone(s.state),
      display: s.nodes.map((n) => [n.angle, n.goal]),
    })),
  };
  const motion = Object.fromEntries(
    [
      "jumpY",
      "velocityY",
      "grounded",
      "jumpBuffer",
      "coyote",
      "motionLanding",
      "fallPeak",
      "airVelocity",
      "swimming",
      "nextSwimStroke",
      "stamina",
    ].map((k) => [
      k,
      game[k]?.clone
        ? game[k].clone()
        : game[k] && typeof game[k] === "object"
          ? structuredClone(game[k])
          : game[k],
    ]),
  );
  const result = [];
  try {
    game.progress.completed = true;
    game.updateDecorations(100);
    for (const site of game.windSites) {
      const points = [
        site.tablet,
        ...site.nodes.map((n) => n.control).filter(Boolean),
        site.tablet,
      ].map((f) => ({ x: f.x * 7, z: f.z * 7 }));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          route = findRoute((x, z) => game.canMove(x, z, 0), a, b, {
            cell: 0.3,
            margin: 7,
            maxVisited: 12000,
            maxDistance: 50,
          });
        let arrived = route.status === "complete",
          frames = 0;
        if (arrived) {
          game.player.position.set(a.x, game.groundHeight(a.x, a.z), a.z);
          Object.assign(game, {
            jumpY: 0,
            velocityY: 0,
            grounded: true,
            jumpBuffer: 0,
            airVelocity: { x: 0, z: 0 },
          });
          restoreWaterArrival(game);
          for (const p of route.points) {
            let n = 0;
            while (
              Math.hypot(
                p.x - game.player.position.x,
                p.z - game.player.position.z,
              ) > 0.14 &&
              n++ < 700
            ) {
              const dx = p.x - game.player.position.x,
                dz = p.z - game.player.position.z,
                d = Math.hypot(dx, dz);
              const input = { x: dx / d, z: dz / d };
              if (!advanceSwimming(game, input, 1 / 60, false))
                advanceCharacter(
                  game,
                  { x: input.x * 4.6, z: input.z * 4.6 },
                  1 / 60,
                );
              frames++;
            }
            if (n >= 700) {
              arrived = false;
              break;
            }
          }
        }
        result.push({
          stage: site.stage,
          leg: i,
          arrived,
          frames,
          status: route.status,
          swimming: !!game.swimming,
          heightError: Math.abs(
            game.player.position.y - game.groundHeight(b.x, b.z),
          ),
        });
      }
    }
  } finally {
    game.progress.stage = saved.stage;
    game.progress.completed = saved.completed;
    game.player.position.copy(saved.position);
    Object.assign(game, motion);
    game.windSites.forEach((s, i) => {
      s.state = saved.sites[i].state;
      s.nodes.forEach(
        (n, j) => ([n.angle, n.goal] = saved.sites[i].display[j]),
      );
    });
    game.updateDecorations(0);
    updateWindCourts(game, 0);
  }
  return result;
}
