import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import {
  buildTraversalCourse,
  hasTraversalCourse,
  ropeGrip,
  updateCourseVisual,
} from "../src/traversal-courses.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { Soundscape } from "../src/audio.js";

function world(t, level) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const map = createMap(level),
    terrain = createTerrainProfile(map, level),
    root = new THREE.Group();
  const game = {
    world: root,
    map,
    level,
    groundHeight: terrain.height,
    obstacles: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(root),
    traversalCourses: [],
  };
  for (const f of map.features.filter(
    (f) => f.type === "field" && hasTraversalCourse(level, f),
  )) {
    const station = new THREE.Group();
    root.add(station);
    buildTraversalCourse(game, f, station);
  }
  root.updateMatrixWorld(true);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const gs = new Set(),
      ms = new Set(),
      ts = new Set();
    root.traverse((o) => {
      if (o.geometry) gs.add(o.geometry);
      for (const m of o.material
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : []) {
        ms.add(m);
        for (const x of Object.values(m)) if (x?.isTexture) ts.add(x);
      }
    });
    gs.forEach((g) => g.dispose());
    ms.forEach((m) => m.dispose());
    ts.forEach((x) => x.dispose());
  });
  return game;
}

test("all 105 climbing piers have finite fitted masonry, bounded batches and exact walking surfaces", (t) => {
  let count = 0;
  for (const level of LEVELS) {
    const g = world(t, level),
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses) {
      count++;
      let vertices = 0;
      c.root.traverse((o) => {
        if (!o.geometry) return;
        for (const a of Object.values(o.geometry.attributes))
          for (const v of a.array)
            assert.ok(
              Number.isFinite(v),
              `${level.id}/${c.id}: finite ${a.name}`,
            );
        vertices += o.geometry.attributes.position.count;
      });
      assert.ok(vertices < 180000, `${level.id}/${c.id}: ${vertices} vertices`);
      assert.ok(c.art.fixed.children.length <= 3);
      assert.ok(c.art.detail.children.length <= 3);
      for (const l of c.ledges) {
        const label = `${level.id}/${c.id}/${l.index}`;
        assert.ok(c.art.piers[l.index].height > 0, label);
        for (const x of [-1.8, 0, 1.8])
          for (const z of [-1.8, 0, 1.8]) {
            ray.set(
              new THREE.Vector3(l.x + x, l.y + 0.2, l.z + z),
              new THREE.Vector3(0, -1, 0),
            );
            const hit = ray.intersectObject(c.art.fixed, true)[0];
            assert.ok(
              hit && Math.abs(hit.point.y - l.y) < 0.001,
              `${label}: walking top ${x},${z}: ${hit?.point.y} expected ${l.y}`,
            );
          }
        const a = new THREE.Vector3(l.x, l.y - 1, l.z + 4),
          b = new THREE.Vector3(l.x, l.y - 1, l.z);
        assert.ok(
          g.cameraSurfaces.entry(a, b) < 1,
          `${label}: solid camera envelope`,
        );
      }
    }
  }
  assert.equal(count, 21);
});

test("all anchor yokes track the real pendulum and leave the rope swept path clear", (t) => {
  for (const level of LEVELS) {
    const g = world(t, level),
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses)
      for (const angle of [-1.15, -0.6, 0, 0.6, 1.15]) {
        c.angle = angle;
        updateCourseVisual(c);
        g.world.updateMatrixWorld(true);
        const hanging = c.art.swing
            .localToWorld(new THREE.Vector3(0, -1, 0))
            .sub(c.anchor)
            .normalize(),
          expected = ropeGrip(c).sub(c.anchor).normalize();
        assert.ok(
          hanging.distanceTo(expected) < 1e-8,
          `${level.id}/${c.id}: yoke follows rope`,
        );
        ray.set(c.anchor.clone().addScaledVector(expected, 0.55), expected);
        ray.far = c.length - 0.55;
        assert.equal(
          ray.intersectObject(c.art.fixed, true).length,
          0,
          `${level.id}/${c.id}: rope clears truss`,
        );
      }
  }
});

test("anchor sound uses world coordinates, follows speed, and is silent at rest or after a chapter change", (t) => {
  const g = world(t, LEVELS[0]),
    c = g.traversalCourses[0];
  g.soundSources = [{ ...c.sound }];
  assert.deepEqual([c.sound.x, c.sound.y, c.sound.z], c.anchor.toArray());
  c.omega = 0.6;
  updateCourseVisual(c);
  updateSoundSources(g);
  assert.ok(g.soundSources[0].activity > 0);
  assert.equal(c.sound.near, 2);
  assert.equal(c.sound.range, 28);
  c.omega = 0;
  updateCourseVisual(c);
  updateSoundSources(g);
  assert.equal(g.soundSources[0].activity, 0);
  c.omega = 0.6;
  updateCourseVisual(c);
  g.traversalCourses = [];
  updateSoundSources(g);
  assert.equal(g.soundSources[0].activity, 0);
});

test("hoist friction has finite audible energy throughout its loop before motion gating", () => {
  const sound = new Soundscape();
  sound.ctx = {
    sampleRate: 48000,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (i) => data[i],
      };
    },
  };
  const buffer = sound.synthetic("hoist", 13),
    data = buffer.getChannelData(0);
  for (let start = 0; start + 24000 <= data.length; start += 24000) {
    let sum = 0;
    for (let i = start; i < start + 24000; i++) {
      assert.ok(Number.isFinite(data[i]));
      sum += data[i] ** 2;
    }
    assert.ok(
      Math.sqrt(sum / 24000) > 0.02,
      `quiet half-second at ${start / buffer.sampleRate}s`,
    );
  }
});
