import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS } from "../src/campaign.js";
import { EXPEDITIONS, fieldComplete } from "../src/expeditions.js";
import {
  buildTorch,
  useTorch,
  updateTorch,
  torchFireSource,
} from "../src/torch.js";
import { finishFieldTask } from "../src/field-world.js";
import { SaveStore, normalizeSave } from "../src/storage.js";

function fixture() {
  const store = new SaveStore({
    getItem() {
      return null;
    },
    setItem() {},
  });
  const g = {
    level: LEVELS[0],
    progress: store.level("verdant"),
    world: new THREE.Group(),
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    items: [],
    flames: [],
    soundSources: [],
    health: 100,
    grounded: true,
    elapsed: 0,
    audio: { tone() {} },
    cb: { toast() {} },
    lineOfSight: () => true,
    saved: 0,
    save() {
      this.saved++;
    },
    state() {
      return {};
    },
  };
  const fire = (f, x) => {
    f.fire = new THREE.Object3D();
    f.fire.position.set(x, f.type === "camp" ? 0.75 : 1.95, 0);
    g.world.add(f.fire);
    g.items.push(f);
    return f;
  };
  fire({ type: "camp", id: "camp-0" }, 0);
  for (const t of EXPEDITIONS.verdant[0].tasks)
    if (t.kind === "brazier") fire({ ...t, type: "field" }, t.step * 10);
  g.player.position.set(2, 0, 0);
  buildTorch(g);
  return g;
}

test("the jungle's flame chain needs fire, accepts relighting at saved beacons, and retains all progress", () => {
  const g = fixture(),
    tasks = EXPEDITIONS.verdant[0].tasks;
  finishFieldTask(g, tasks[0]);
  assert.equal(finishFieldTask(g, tasks[1]), false);
  assert.equal(useTorch(g), true);
  assert.equal(g.progress.torch, true);
  assert.equal(finishFieldTask(g, tasks[2]), false, "task order still matters");
  assert.equal(finishFieldTask(g, tasks[1]), true);
  g.player.position.x = 12;
  assert.equal(useTorch(g), true, "put out the carried torch");
  assert.equal(torchFireSource(g).id, tasks[1].id);
  assert.equal(useTorch(g), true, "the restored beacon supplies fire");
  assert.equal(finishFieldTask(g, tasks[2]), true);
  assert.equal(fieldComplete(g.level, g.progress), true);
  const restored = normalizeSave({
    version: 1,
    levels: { verdant: g.progress },
  }).levels.verdant;
  assert.deepEqual(
    restored.field,
    tasks.map((t) => t.id),
  );
  assert.equal(restored.torch, true);
});

test("cold, distant, occluded and inaccessible fires cannot light a torch", () => {
  const g = fixture();
  g.player.position.x = 22;
  assert.equal(torchFireSource(g), null, "cold beacon");
  assert.equal(useTorch(g), false);
  g.player.position.set(2, 0, 0);
  g.lineOfSight = () => false;
  assert.equal(useTorch(g), false, "wall between player and fire");
  g.lineOfSight = () => true;
  g.player.position.y = 6;
  assert.equal(useTorch(g), false, "different elevation");
  g.player.position.y = 0;
  for (const state of [
    "swimming",
    "diving",
    "climb",
    "blockGrip",
    "dodge",
    "paused",
  ]) {
    g[state] = true;
    assert.equal(useTorch(g), false, state);
    g[state] = false;
  }
  g.grounded = false;
  assert.equal(useTorch(g), false, "cannot take fire while airborne");
});

test("water and two-handed actions extinguish flame and sound without undoing lit stations", () => {
  const g = fixture();
  g.progress.field = ["field-0-0", "field-0-1"];
  useTorch(g);
  const source = g.torch.source;
  assert.equal(source.activity, 1);
  const initial = new THREE.Vector3(source.x, source.y, source.z);
  g.player.position.x += 3;
  g.avatar.rotation.y = Math.PI / 2;
  updateTorch(g);
  assert(
    initial.distanceTo(new THREE.Vector3(source.x, source.y, source.z)) > 2,
  );
  assert.equal(g.torch.root.visible, true);
  g.paused = true;
  updateTorch(g);
  assert.equal(source.activity, 0);
  assert.equal(g.progress.torch, true);
  g.paused = false;
  updateTorch(g);
  assert.equal(source.activity, 1);
  for (const state of ["swimming", "climb", "ropeRide", "blockGrip", "dodge"]) {
    g.progress.torch = true;
    g[state] = true;
    updateTorch(g);
    assert.equal(g.progress.torch, false, state);
    assert.equal(g.torch.root.visible, false);
    assert.equal(g.torch.flame.visible, false);
    assert.equal(source.activity, 0);
    g[state] = false;
  }
  assert.deepEqual(g.progress.field, ["field-0-0", "field-0-1"]);
  g.progress.stage = 1;
  g.progress.field.push("field-1-0");
  g.progress.torch = true;
  updateTorch(g);
  assert.equal(
    g.progress.torch,
    false,
    "transporting a component uses both hands",
  );
});

test("torch saves are strictly typed and isolated to the jungle; older progress retains its beacons", () => {
  const data = normalizeSave({
    version: 1,
    levels: {
      verdant: {
        stage: 7,
        field: ["field-6-0", "field-6-1", "field-6-2"],
        torch: "true",
      },
      tides: { torch: true },
    },
  });
  assert.equal(data.levels.verdant.torch, false);
  assert.equal(data.levels.tides.torch, false);
  assert.equal(data.levels.verdant.stage, 7);
  assert.equal(fieldComplete(LEVELS[0], data.levels.verdant, 6), true);
});
