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
import { CameraSurfaces, followCamera } from "../src/camera-collision.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { Soundscape } from "../src/audio.js";
import { CLIMBING_STYLES } from "../src/traversal-art.js";

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

test("summit cable frames retain supported feet and clear the observed reading and boarding views on all 21 courses", (t) => {
  let views = 0;
  const blocked = [];
  for (const level of LEVELS) {
    const g = world(t, level);
    for (const c of g.traversalCourses) {
      const summit = c.ledges[4],
        ray = new THREE.Raycaster();
      // Test the entire stone footplate, rather than just its centre height.
      for (const p of c.zipRig.posts.slice(0, 2))
        for (const x of [-0.21, 0.21])
          for (const z of [-0.21, 0.21]) {
            ray.set(
              new THREE.Vector3(p.x + x, p.floor + 0.1, p.z + z),
              new THREE.Vector3(0, -1, 0),
            );
            const hit = ray.intersectObject(c.art.fixed, true)[0];
            assert.ok(
              hit && Math.abs(hit.point.y - summit.y) < 0.001,
              `${level.id}/${c.id}: supported terminal footplate`,
            );
          }
      // Relative feet/angles from obstructed continuous eagle approaches.
      // Rotate those real working-edge views through every campaign course.
      for (const [x, z, heading] of [
        [0.5624657651637, 2.19656168235463, 2.1029591445476035],
        [0.78180967001387, 2.2454142891183, 2.264878396865836],
        [0.01546097382555, 2.19253483461532, 2.2457876265597903],
        [0.7474637624049, 2.2510970531875, 3.659162828695816],
        [0.77175901510066, 2.23843278971435, 2.703856569015338],
      ]) {
        const p = c.transform(x, z),
          target = new THREE.Vector3(p.x, summit.y + 1.3, p.z),
          yaw = heading - Math.atan2(c.axis.z, c.axis.x),
          offset = new THREE.Vector3(
            Math.sin(yaw) * Math.cos(0.13) * 5.3,
            Math.sin(0.13) * 5.3 + 0.2,
            Math.cos(yaw) * Math.cos(0.13) * 5.3,
          ),
          desired = target.clone().add(offset);
        let camera = target.clone().addScaledVector(offset, 0.06);
        for (let frame = 0; frame < 60; frame++) {
          camera = followCamera(
            camera,
            target,
            desired,
            1 / 60,
            g.cameraSurfaces,
            () => true,
            target,
          );
          assert.equal(g.cameraSurfaces.entry(target, camera, 0), 1);
        }
        if (camera.distanceTo(target) <= 5.2)
          blocked.push(
            `${level.id}/${c.id}: ${x},${z}, ${camera.distanceTo(target)} m`,
          );
        ray.set(target, offset.clone().normalize());
        ray.far = offset.length();
        if (ray.intersectObject(c.root, true).length)
          blocked.push(`${level.id}/${c.id}: rendered sight line ${x},${z}`);
        views++;
      }
    }
  }
  assert.equal(views, 105);
  assert.deepEqual(blocked, []);
});

test("climbing pier wall and coping joints have continuous bearing behind their recessed edges", (t) => {
  const misses = [];
  let rays = 0,
    wallRays = 0;
  for (const level of LEVELS) {
    const g = world(t, level),
      style = CLIMBING_STYLES[level.biome],
      bands = style.bands,
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses)
      for (const l of c.ledges) {
        const height = c.art.piers[l.index].height,
          wallHeight = height - 0.18 - bands * 0.13,
          rows = Math.min(10, Math.max(1, Math.ceil(wallHeight / style.row))),
          recess = (row) => (row > 1 && row < rows - 2 ? style.inset : 0.03);
        const joints = Array.from({ length: bands + 1 }, (_, i) => ({
          y: l.y - 0.18 - i * 0.13,
          offsets: [0.1, 0.14],
          kind: `coping ${i}`,
        }));
        for (let row = 1; row < rows; row++) {
          const inset = Math.max(recess(row - 1), recess(row));
          joints.push({
            y: l.y - height + (row * wallHeight) / rows,
            offsets: [inset + 0.03, inset + 0.06],
            kind: `wall ${row}`,
          });
        }
        for (const joint of joints)
          for (const axis of ["x", "z"])
            for (const side of [-1, 1])
              for (const offset of joint.offsets) {
                const across = axis === "x" ? "z" : "x",
                  half = axis === "x" ? l.w : l.d,
                  acrossHalf = axis === "x" ? l.d : l.w,
                  origin = new THREE.Vector3(l.x, joint.y, l.z),
                  direction = new THREE.Vector3();
                origin[axis] += half + 0.1;
                origin[across] += side * (acrossHalf - offset);
                direction[axis] = -1;
                ray.set(origin, direction);
                ray.far = half * 2 + 0.2;
                if (joint.kind.startsWith("wall")) wallRays++;
                else rays++;
                if (!ray.intersectObject(c.art.fixed, true).length)
                  misses.push(
                    `${level.id}/${c.id}/${l.index}: ${joint.kind}, ${axis}, ${side}, ${offset}`,
                  );
              }
      }
  }
  assert.ok(wallRays > 5000, `${wallRays} wall bearing rays`);
  assert.equal(rays, 3360, `${rays} coping bearing rays`);
  t.diagnostic(
    `${wallRays} wall and ${rays} coping bearing rays across 105 piers`,
  );
  assert.equal(
    misses.length,
    0,
    `${misses.length}/${rays + wallRays} open joints: ${misses.slice(0, 6).join("; ")}`,
  );
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
