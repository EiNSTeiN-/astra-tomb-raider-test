import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import {
  buildTraversalCourse,
  hasTraversalCourse,
} from "../src/traversal-courses.js";
import {
  updateReturnCable,
  RETURN_CABLE_HEIGHT,
  cableHands,
  silenceCableMotion,
} from "../src/return-cable.js";
import {
  updateTraversal,
  traversalInteract,
  restoreTraversal,
  captureTraversal,
} from "../src/traversal.js";
import { normalizeSave } from "../src/storage.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

function world(t, level) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const map = createMap(level),
    terrain = createTerrainProfile(map, level),
    g = Object.assign(Object.create(Adventure.prototype), {
      world: new THREE.Group(),
      level,
      map,
      groundHeight: terrain.height,
      obstacles: [],
      player: new THREE.Group(),
      avatar: new THREE.Group(),
      stoneMat: new THREE.MeshStandardMaterial(),
      goldMat: new THREE.MeshStandardMaterial(),
      keys: new Set(),
      stamina: 100,
      grounded: true,
      elapsed: 0,
      progress: { stage: 0, field: [], found: [] },
      audio: { noiseHit() {} },
      save() {},
      cb: { toast() {} },
      traversalCourses: [],
    });
  for (const f of map.features.filter(
    (f) => f.type === "field" && hasTraversalCourse(level, f),
  ))
    buildTraversalCourse(g, f, new THREE.Group());
  g.world.updateMatrixWorld(true);
  t.after(() => {
    const gs = new Set(),
      ms = new Set();
    g.world.traverse((o) => {
      if (o.geometry) gs.add(o.geometry);
      if (o.material) ms.add(o.material);
    });
    gs.forEach((x) => x.dispose());
    ms.forEach((x) => {
      for (const v of Object.values(x)) if (v?.isTexture) v.dispose();
      x.dispose();
    });
  });
  return g;
}

test("all 42 cable terminals have grounded posts, visible locked frames and clear departure and arrival paths", (t) => {
  let terminals = 0;
  for (const level of LEVELS) {
    const g = world(t, level);
    for (const c of g.traversalCourses) {
      const rig = c.zipRig;
      terminals += 2;
      assert.equal(rig.posts.length, 4);
      assert.equal(rig.root.visible, true);
      assert.equal(rig.carriage.visible, false);
      for (const [i, p] of rig.posts.entries()) {
        assert.ok(p.head > p.floor + 1);
        assert.ok(
          Math.abs(p.floor - (i < 2 ? c.launch.y : g.groundHeight(p.x, p.z))) <
            1e-6,
        );
      }
      for (let i = 0; i <= 40; i++) {
        const p = c.launch.clone().lerp(c.exit, i / 40);
        assert.ok(
          g.canMove(p.x, p.z, p.y - g.groundHeight(p.x, p.z)),
          `${level.id}/${c.id}: body path ${i}`,
        );
      }
      rig.root.traverse((o) => {
        if (o.geometry)
          for (const a of Object.values(o.geometry.attributes))
            for (const v of a.array) assert.ok(Number.isFinite(v));
      });
    }
  }
  assert.equal(terminals, 42);
});

test("carriages and hand grips track the cable plane; both spatial sources stop after the automatic return", (t) => {
  const g = world(t, LEVELS[0]),
    c = g.traversalCourses[0],
    rig = c.zipRig;
  c.zip.visible = true;
  g.soundSources = rig.sources.map((s) => ({ ...s }));
  g.zipRide = { course: c, approach: false };
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    g.player.position.copy(c.launch).lerp(c.exit, t);
    updateReturnCable(g, c, 0);
    g.world.updateMatrixWorld(true);
    updateSoundSources(g);
    assert.ok(
      rig.carriage.position.distanceTo(
        g.player.position
          .clone()
          .add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0)),
      ) < 1e-6,
    );
    assert.equal(rig.carriage.visible, true);
    assert.equal(cableHands(g).length, 2);
    assert.ok(cableHands(g)[0].distanceTo(cableHands(g)[1]) > 0.4);
    assert.deepEqual(
      [g.soundSources[0].x, g.soundSources[0].y, g.soundSources[0].z],
      rig.carriage.position.toArray(),
    );
    assert.ok(g.soundSources[0].activity > 0);
  }
  g.zipRide = null;
  rig.returning = true;
  updateReturnCable(g, c, 0.5);
  updateSoundSources(g);
  assert.ok(rig.travel < 1 && rig.travel > 0);
  assert.ok(g.soundSources[1].activity > 0);
  const released = [];
  g.audio.releaseVoice = (id) => released.push(id);
  g.paused = true;
  silenceCableMotion(g);
  updateReturnCable(g, c, 0);
  updateSoundSources(g);
  assert.ok(rig.sources.every((s) => s.activity === 0));
  assert.ok(rig.sources.every((s) => released.includes(s.id)));
  g.paused = false;
  for (let i = 0; i < 210; i++) updateReturnCable(g, c, 1 / 60);
  updateSoundSources(g);
  assert.equal(rig.travel, 0);
  assert.equal(rig.returning, false);
  assert.ok(g.soundSources.every((s) => s.activity === 0));
  g.traversalCourses = [];
  updateSoundSources(g);
  assert.ok(g.soundSources.every((s) => s.activity === 0));
});

test("restored stations enable the cable, a paused ride retains its secure summit, and the trolley becomes reusable", (t) => {
  const g = world(t, LEVELS[0]),
    c = g.traversalCourses[0],
    l = c.ledges[4];
  g.progress.stage = c.stage;
  g.player.position.set(l.x, l.y, l.z);
  g.courseAnchor = { id: c.id, ledge: 4 };
  assert.equal(traversalInteract(g), false);
  g.progress.field = [c.id];
  assert.equal(traversalInteract(g), true);
  for (let i = 0; i < 70; i++) updateTraversal(g, 1 / 60, { x: 0, z: 0 });
  assert.equal(g.zipRide.approach, false);
  const saved = normalizeSave({
    version: 1,
    levels: {
      verdant: {
        ...g.progress,
        position: { x: g.player.position.x, z: g.player.position.z, height: 0 },
        traversal: captureTraversal(g),
      },
    },
  });
  assert.deepEqual(saved.levels.verdant.traversal, { id: c.id, ledge: 4 });
  for (let i = 0; i < 120; i++) updateTraversal(g, 1 / 60, { x: 0, z: 0 });
  assert.equal(g.zipRide, null);
  assert.ok(c.zipRig.returning);
  assert.ok(g.player.position.distanceTo(c.exit) < 1e-6);
  for (let i = 0; i < 210; i++) updateTraversal(g, 1 / 60, { x: 0, z: 0 });
  g.progress = saved.levels.verdant;
  restoreTraversal(g);
  g.grounded = true;
  assert.ok(
    g.player.position.distanceTo(new THREE.Vector3(l.x, l.y, l.z)) < 1e-6,
  );
  assert.equal(traversalInteract(g), true);
});
