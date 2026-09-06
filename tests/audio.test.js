import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { AUDIO_SOURCES, SCORES, scoreBar, distanceGain } from "../src/audio.js";
import { LEVELS } from "../src/campaign.js";
import { normalizeSave } from "../src/storage.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

test("source attenuation is monotonic, bounded, full at the near radius, and silent at the outer radius", () => {
  for (const source of Object.values(AUDIO_SOURCES)) {
    let previous = 1;
    for (let distance = 0; distance < source.range + 20; distance += 0.25) {
      const gain = distanceGain(distance, source.near, source.range);
      assert.ok(gain >= 0 && gain <= 1 && gain <= previous);
      previous = gain;
    }
    assert.equal(distanceGain(source.near, source.near, source.range), 1);
    assert.equal(distanceGain(source.range, source.near, source.range), 0);
    if (source.file)
      assert.ok(
        existsSync(
          new URL(`../public/assets/audio/${source.file}`, import.meta.url),
        ),
      );
  }
});

test("eight quiet scores vary by chapter and objective, leave space, and suppress melody during listening puzzles", () => {
  const scores = new Set();
  for (const level of LEVELS) {
    assert.ok(SCORES[level.biome]);
    const phrase = Array.from({ length: 8 }, (_, bar) =>
      scoreBar(level.biome, 0, bar),
    );
    scores.add(JSON.stringify(phrase));
    assert.notDeepEqual(
      scoreBar(level.biome, 0, 0),
      scoreBar(level.biome, 1, 0),
    );
    assert.equal(
      phrase[7].filter((n) => !["pad", "bass"].includes(n.voice)).length,
      0,
    );
    assert.ok(
      scoreBar(level.biome, 2, 0, "puzzle").every((n) =>
        ["pad", "bass"].includes(n.voice),
      ),
    );
    assert.ok(
      scoreBar(level.biome, 0, 1, "danger").some((n) => n.voice === "pulse"),
    );
    for (const event of phrase.flat()) {
      assert.ok(event.gain > 0 && event.gain <= 0.05);
      assert.ok(event.length > 0 && event.note >= 24 && event.note < 100);
    }
  }
  assert.equal(scores.size, 8);
});

test("individual sound sliders persist, clamp malformed values, and migrate older saves to a quiet music mix", () => {
  const old = normalizeSave({
    version: 1,
    levels: {},
    settings: { volume: 60 },
  });
  assert.equal(old.settings.music, 32);
  assert.equal(old.settings.ambience, 80);
  const save = normalizeSave({
    version: 1,
    levels: {},
    settings: { music: 0, ambience: 150, effects: -30 },
  });
  assert.equal(save.settings.music, 0);
  assert.equal(save.settings.ambience, 100);
  assert.equal(save.settings.effects, 0);
});

test("water emitters track a draining reservoir and a cooled lava pool becomes silent", () => {
  const pool = { position: { x: 20, y: 5, z: 30 }, userData: { drain: 0 } };
  const source = { waterIndex: 0, x: 0, y: 0, z: 0 };
  const game = { soundSources: [source], waterMeshes: [pool] };
  updateSoundSources(game);
  assert.deepEqual(
    [source.x, source.y, source.z, source.activity],
    [20, 5, 30, 1],
  );
  pool.position.y = 3.2;
  pool.userData.drain = 1.8;
  updateSoundSources(game);
  assert.equal(source.y, 3.2);
  assert.ok(Math.abs(source.activity - 0.3) < 1e-8);
  pool.userData.cooled = true;
  updateSoundSources(game);
  assert.equal(source.activity, 0);
});
