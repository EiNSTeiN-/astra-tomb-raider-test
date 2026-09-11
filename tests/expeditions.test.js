import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, createMap } from "../src/campaign.js";
import {
  EXPEDITIONS,
  currentFieldTask,
  fieldComplete,
  carryingComponent,
} from "../src/expeditions.js";
import { SaveStore } from "../src/storage.js";
import { JOURNAL } from "../src/journal.js";

test("all 96 discoverable journal pages contain distinct chapter narratives", () => {
  const titles = new Set(),
    texts = new Set();
  for (const level of LEVELS) {
    assert.equal(JOURNAL[level.id].length, 12);
    for (const [title, text] of JOURNAL[level.id]) {
      titles.add(title);
      texts.add(text);
      assert.ok(text.length > 100);
    }
  }
  assert.equal(texts.size, 96);
  assert.ok(titles.size > 80);
});

test("all 69 sectors have three ordered field actions, with a destination for every carried component", () => {
  let count = 0;
  for (const level of LEVELS) {
    const missions = EXPEDITIONS[level.id],
      map = createMap(level);
    assert.equal(missions.length, level.mechanisms);
    const progress = { stage: 0, field: [], completed: false };
    for (const [stage, mission] of missions.entries()) {
      assert.equal(mission.tasks.length, 3);
      assert.equal(fieldComplete(level, progress), false);
      for (const task of mission.tasks) {
        assert.equal(currentFieldTask(level, progress).id, task.id);
        const feature = map.features.find((f) => f.id === task.id);
        assert.ok(feature);
        // Tower clearances include their wide frames. The rail mission uses
        // compact service benches and a 10 m landing, needing a 14 m buffer.
        for (const other of map.features.filter(
          (f) => f !== feature && f.type !== "field",
        ))
          assert.ok(
            Math.hypot(feature.x - other.x, feature.z - other.z) >=
              (feature.cartHeight !== undefined ? 2 : 4),
          );
        progress.field.push(task.id);
        if (task.kind === "lift")
          assert.equal(carryingComponent(level, progress), true);
        if (task.kind === "delivery")
          assert.equal(carryingComponent(level, progress), false);
        count++;
      }
      assert.equal(fieldComplete(level, progress), true);
      assert.equal(currentFieldTask(level, progress), null);
      assert.equal(carryingComponent(level, progress), false);
      progress.stage = stage + 1;
    }
    assert.equal(currentFieldTask(level, progress), null);
  }
  assert.equal(count, 207);
});

test("a transported component and field objective survive export/reload without resetting earlier gates", () => {
  const level = LEVELS[0],
    memory = new Map();
  const storage = {
    getItem: (k) => memory.get(k),
    setItem: (k, v) => memory.set(k, v),
  };
  const original = new SaveStore(storage),
    progress = original.level(level.id);
  progress.stage = 1;
  progress.field.push("field-1-0");
  original.save();
  const loaded = new SaveStore(storage).level(level.id);
  assert.equal(carryingComponent(level, loaded), true);
  assert.equal(currentFieldTask(level, loaded).id, "field-1-1");
  assert.equal(fieldComplete(level, loaded, 0), true);
  assert.equal(fieldComplete(level, loaded, 1), false);
});
