import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { Soundscape } from "../src/audio.js";
import {
  createAssetBatch,
  materialTextureLoader,
  withMaterialManager,
} from "../src/asset-loading.js";
import {
  prepareChapter,
  preserveChapterSave,
  waitForFirstFrame,
  waitForTask,
} from "../src/chapter-startup.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

function graphics(statuses = [3]) {
  const calls = [];
  const fence = {};
  return {
    calls,
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    ALREADY_SIGNALED: 2,
    CONDITION_SATISFIED: 3,
    WAIT_FAILED: 4,
    TIMEOUT_EXPIRED: 5,
    fenceSync(...args) {
      calls.push(["fence", ...args]);
      return fence;
    },
    flush() {
      calls.push(["flush"]);
    },
    isContextLost() {
      return false;
    },
    clientWaitSync(...args) {
      calls.push(["wait", ...args]);
      return statuses.length > 1 ? statuses.shift() : statuses[0];
    },
    deleteSync(value) {
      assert.equal(value, fence);
      calls.push(["delete"]);
    },
  };
}

test("a chapter waits for discovered images after model jobs finish, and reports all failures", async () => {
  const batch = createAssetBatch();
  let finished = false;
  batch.ready.then(() => {
    finished = true;
  });
  batch.manager.itemStart("masonry.jpg");
  batch.manager.itemStart("model.glb");
  batch.manager.itemStart("embedded-leaf.jpg");
  batch.manager.itemEnd("model.glb");
  batch.seal([{ status: "rejected", reason: "model construction failed" }]);
  batch.seal([{ status: "rejected", reason: "must not duplicate" }]);
  batch.manager.itemEnd("embedded-leaf.jpg");
  await tick();
  assert.equal(finished, false);
  batch.manager.itemError("masonry.jpg");
  batch.manager.itemEnd("masonry.jpg");
  assert.deepEqual((await batch.ready).errors, [
    { cause: "model construction failed" },
    { url: "masonry.jpg" },
  ]);
});

test("an old batch cannot contaminate a retry and material loader scope restores after a thrown build", async () => {
  const old = createAssetBatch(),
    retry = createAssetBatch();
  withMaterialManager(old.manager, () => {
    assert.equal(materialTextureLoader().manager, old.manager);
    assert.throws(() =>
      withMaterialManager(retry.manager, () => {
        assert.equal(materialTextureLoader().manager, retry.manager);
        throw Error("interrupted build");
      }),
    );
    assert.equal(materialTextureLoader().manager, old.manager);
  });
  assert.equal(materialTextureLoader().manager, THREE.DefaultLoadingManager);
  old.manager.itemStart("old.jpg");
  old.seal();
  retry.seal();
  assert.deepEqual(await retry.ready, { errors: [] });
  old.manager.itemError("old.jpg");
  old.manager.itemEnd("old.jpg");
  assert.deepEqual((await old.ready).errors, [{ url: "old.jpg" }]);
  assert.deepEqual(await retry.ready, { errors: [] });
});

test("task cancellation consumes late rejection, including an already-aborted request", async () => {
  for (const alreadyAborted of [true, false]) {
    const controller = new AbortController(),
      task = deferred();
    if (alreadyAborted) controller.abort();
    const result = waitForTask(task.promise, controller.signal);
    controller.abort();
    await assert.rejects(result, { name: "AbortError" });
    task.reject(Error("late network rejection"));
    await tick();
  }
});

test("task deadlines settle a hung request while preserving normal values and failures", async () => {
  await assert.rejects(waitForTask(new Promise(() => {}), undefined, 10), {
    kind: "timeout",
  });
  assert.equal(await waitForTask(Promise.resolve(42)), 42);
  await assert.rejects(waitForTask(Promise.reject(Error("offline"))), {
    message: "offline",
  });
});

test("first-frame fences poll without a blocking GPU timeout and release exactly once", async () => {
  const gl = graphics([5, 3]);
  await waitForFirstFrame(gl);
  assert.equal(gl.calls.filter(([name]) => name === "flush").length, 1);
  assert.equal(gl.calls.filter(([name]) => name === "wait").length, 2);
  for (const call of gl.calls.filter(([name]) => name === "wait"))
    assert.deepEqual(call.slice(2), [0, 0]);
  assert.equal(gl.calls.filter(([name]) => name === "delete").length, 1);
});

test("cancelling a pending first frame cleans the fence and never polls it again", async () => {
  const gl = graphics([5]),
    controller = new AbortController();
  const pending = waitForFirstFrame(gl, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(gl.calls.filter(([name]) => name === "wait").length, 1);
  assert.equal(gl.calls.filter(([name]) => name === "delete").length, 1);
  const untouched = graphics();
  await assert.rejects(waitForFirstFrame(untouched, controller.signal), {
    name: "AbortError",
  });
  assert.equal(untouched.calls.length, 0);
});

test("context loss, rejected fences, and a stalled GPU return recoverable preparation errors", async () => {
  const lost = graphics();
  lost.isContextLost = () => true;
  await assert.rejects(waitForFirstFrame(lost), { kind: "renderer" });
  await assert.rejects(waitForFirstFrame(graphics([4])), { kind: "renderer" });
  const stalled = graphics([5]);
  await assert.rejects(waitForFirstFrame(stalled, undefined, 10), {
    kind: "timeout",
  });
  for (const gl of [lost, stalled])
    assert.equal(gl.calls.filter(([name]) => name === "delete").length, 1);
});

function chapter(visuals, audio) {
  const calls = [];
  return {
    calls,
    active: false,
    paused: true,
    preparing: true,
    renderOnce: true,
    progress: { time: 77 },
    visualsReady: visuals,
    audio: { ready: audio },
    updateCamera(dt) {
      calls.push(["camera", dt]);
    },
    updateDecorations(dt) {
      calls.push(["decorations", dt]);
    },
    updateAudio() {
      calls.push(["audio"]);
    },
    renderer: {
      compile() {
        calls.push(["compile"]);
      },
      getContext: () => graphics(),
    },
    renderScene(dt) {
      calls.push(["render", dt]);
    },
  };
}

test("preparation waits for both visual assets and decoded audio, then submits a frozen first view", async () => {
  const visual = deferred(),
    audio = deferred();
  const game = chapter(visual.promise, audio.promise),
    stages = [];
  const pending = prepareChapter(game, {
    onStage: (stage) => stages.push(stage),
  });
  visual.resolve({ errors: [] });
  await tick();
  assert.deepEqual(game.calls, []);
  audio.resolve();
  await pending;
  assert.deepEqual(game.calls, [
    ["camera", 1],
    ["decorations", 0],
    ["audio"],
    ["compile"],
    ["render", 0],
  ]);
  assert.equal(stages.length, 2);
  assert.equal(game.progress.time, 77);
  assert.equal(game.active, false);
  assert.equal(game.renderOnce, false);
});

test("missing required visuals and cancelled preparation cannot submit or activate a view", async () => {
  const failed = chapter(
    Promise.resolve({ errors: [{ url: "stone.jpg" }] }),
    Promise.resolve(),
  );
  await assert.rejects(prepareChapter(failed), { kind: "assets" });
  assert.deepEqual(failed.calls, []);
  const controller = new AbortController(),
    visual = deferred();
  const cancelled = chapter(visual.promise, Promise.resolve());
  const pending = prepareChapter(cancelled, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  visual.resolve({ errors: [] });
  await tick();
  assert.deepEqual(cancelled.calls, []);
});

test("rollback restores saved chapter values without overwriting settings or other chapters", () => {
  const original = { time: 77, position: { x: 56, z: 70 }, found: ["note-0"] };
  const store = {
    data: {
      currentLevel: 2,
      settings: { quality: "high" },
      levels: { verdant: structuredClone(original), snow: { time: 90 } },
    },
  };
  const restore = preserveChapterSave(store, "verdant");
  store.data.levels.verdant.position.x = 7;
  store.data.levels.verdant.found.push("note-1");
  store.data.currentLevel = 0;
  store.data.settings.quality = "low";
  store.data.levels.snow.time = 91;
  restore();
  assert.deepEqual(store.data.levels.verdant, original);
  assert.equal(store.data.currentLevel, 2);
  assert.equal(store.data.settings.quality, "low");
  assert.equal(store.data.levels.snow.time, 91);
  const remove = preserveChapterSave(store, "desert");
  store.data.levels.desert = { time: 0 };
  remove();
  assert.equal(Object.hasOwn(store.data.levels, "desert"), false);
});

test("loading frames cannot simulate, advance saved time, or persist a partly built chapter", () => {
  let reads = 0;
  const game = {
    active: false,
    preparing: true,
    renderOnce: true,
    scene: {},
    elapsed: 0,
    clock: {
      getDelta() {
        reads++;
        return 42;
      },
    },
    progress: { time: 77 },
    store: {
      save() {
        assert.fail("loading must not write storage");
      },
    },
    player: { position: { x: 56, y: 2, z: 70 } },
    updatePlayer() {
      assert.fail("loading must not simulate");
    },
  };
  Adventure.prototype.frame.call(game);
  Adventure.prototype.save.call(game);
  assert.equal(reads, 1);
  assert.equal(game.elapsed, 0);
  assert.equal(game.progress.time, 77);
});

test("a delayed audio resume cannot override a newer loading or background pause", async () => {
  const sound = new Soundscape(),
    resumed = deferred();
  let suspensions = 0;
  sound.ctx = {
    resume: () => resumed.promise,
    suspend() {
      suspensions++;
      return Promise.resolve();
    },
  };
  const unlocking = sound.resume();
  await sound.pause();
  resumed.resolve();
  await unlocking;
  assert.equal(sound.wantsPlayback, false);
  assert.equal(suspensions, 2);
  await sound.resume();
  assert.equal(sound.wantsPlayback, true);
  assert.equal(suspensions, 2);
});
