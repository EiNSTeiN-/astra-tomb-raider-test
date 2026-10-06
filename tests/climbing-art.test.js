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
import { followClearCamera } from "../src/camera-follow.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { Soundscape } from "../src/audio.js";
import { CLIMBING_STYLES } from "../src/traversal-art.js";
import { supportAt } from "../src/character-motion.js";

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
    terrainProfile: terrain,
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

test("summit reading cameras keep their near-plane margin clear of the actual winch leads", (t) => {
  let views = 0;
  const failures = [];
  for (const level of LEVELS) {
    const g = world(t, level);
    for (const c of g.traversalCourses) {
      for (const [x, z] of [
        [0.9706530381068319, -1.1817921155800946],
        [1.32366729583708, -0.94155373525697],
        [1.76134533940206, -1.0637957853056],
      ]) {
        // Reading feet from the obstructed ordinary jungle summit walk, plus
        // two close boarding feet from the snow route. Rotate these actual
        // working views through all regional courses.
        const feet = c.transform(x, z),
          lens = c.transform(0.9772321406728111, 2.061627035891206),
          roof = c.ledges[4].y,
          target = new THREE.Vector3(feet.x, roof + 1.3, feet.z),
          yaw = -Math.atan2(c.axis.z, c.axis.x),
          pitch = 0.35,
          desired = target
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(yaw) * Math.cos(pitch) * 5.3,
                Math.sin(pitch) * 5.3 + 0.2,
                Math.cos(yaw) * Math.cos(pitch) * 5.3,
              ),
            ),
          game = {
            camera: new THREE.PerspectiveCamera(),
            cameraSurfaces: g.cameraSurfaces,
            cameraFollowTarget: target,
            yaw,
            pitch,
          };
        game.camera.position.set(lens.x, roof + 2.7236194242538296, lens.z);
        for (let frame = 0; frame < 60; frame++)
          game.camera.position.copy(
            followClearCamera(game, target, desired, 1 / 60, () => true),
          );
        // Measure rendered triangles independently of the fitted camera bounds.
        // The long diagonal lead was excluded by the default thin-part filter.
        const triangle = new THREE.Triangle(),
          a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          d = new THREE.Vector3(),
          closest = new THREE.Vector3();
        let distance = Infinity;
        c.zipRig.fixed.traverse((o) => {
          if (!o.isMesh || o.material.name !== "Return cable steel") return;
          const positions = o.geometry.attributes.position,
            index = o.geometry.index;
          for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
            a.fromBufferAttribute(
              positions,
              index ? index.getX(i) : i,
            ).applyMatrix4(o.matrixWorld);
            b.fromBufferAttribute(
              positions,
              index ? index.getX(i + 1) : i + 1,
            ).applyMatrix4(o.matrixWorld);
            d.fromBufferAttribute(
              positions,
              index ? index.getX(i + 2) : i + 2,
            ).applyMatrix4(o.matrixWorld);
            triangle
              .set(a, b, d)
              .closestPointToPoint(game.camera.position, closest);
            distance = Math.min(
              distance,
              closest.distanceTo(game.camera.position),
            );
          }
        });
        assert.ok(
          Number.isFinite(distance),
          `${level.id}/${c.id}: measured actual leads`,
        );
        if (
          distance < 0.28 - 1e-5 ||
          game.camera.position.distanceTo(target) < 3.2
        )
          failures.push({
            chapter: level.id,
            course: c.id,
            distance,
            arm: game.camera.position.distanceTo(target),
          });
        views++;
      }
    }
  }
  assert.equal(views, 63);
  assert.deepEqual(failures, []);
});

test("all 105 climbing piers have finite fitted masonry, bounded batches and flat walking surfaces with shallow joints", (t) => {
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
              hit && Math.abs(hit.point.y - l.y) <= 0.00501,
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

test("all 105 climbing roofs fill their standing edges and corners, with at most 5 mm recessed paving joints", (t) => {
  let rays = 0;
  for (const level of LEVELS) {
    const g = world(t, level),
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses)
      for (const l of c.ledges)
        for (let ix = 0; ix <= 20; ix++)
          for (let iz = 0; iz <= 20; iz++) {
            const x = l.x - l.w + 0.002 + (ix * (2 * l.w - 0.004)) / 20,
              z = l.z - l.d + 0.002 + (iz * (2 * l.d - 0.004)) / 20;
            ray.set(
              new THREE.Vector3(x, l.y + 0.1, z),
              new THREE.Vector3(0, -1, 0),
            );
            const hit = ray.intersectObject(c.art.fixed, true)[0];
            assert(
              hit,
              `${level.id}/${c.id}/${l.index}: empty standing corner`,
            );
            assert(
              Math.abs(hit.point.y - l.y) <= 0.00501,
              `${level.id}/${c.id}/${l.index}: roof differs from support at ${x},${z}`,
            );
            assert.equal(supportAt(g, x, z, l.y).height, l.y);
            rays++;
          }
  }
  assert.equal(rays, 46305);
});

test("pier foundations and all 42 hoist bearings reach the soil beneath their complete lower footprints", (t) => {
  let pierRays = 0,
    postRays = 0;
  for (const level of LEVELS) {
    const g = world(t, level),
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses) {
      for (const l of c.ledges) {
        const bottom = c.art.piers[l.index].bottom;
        for (let ix = 0; ix <= 4; ix++)
          for (let iz = 0; iz <= 4; iz++) {
            const x = l.x - l.w + 0.14 + (ix * (2 * l.w - 0.28)) / 4,
              z = l.z - l.d + 0.14 + (iz * (2 * l.d - 0.28)) / 4,
              ground = g.groundHeight(x, z);
            ray.set(
              new THREE.Vector3(x, bottom - 1, z),
              new THREE.Vector3(0, 1, 0),
            );
            const hit = ray.intersectObject(c.art.fixed, true)[0];
            assert(
              hit && hit.point.y < ground - 0.15,
              `${level.id}/${c.id}/${l.index}: exposed underside at ${x},${z}`,
            );
            pierRays++;
          }
      }
      assert.equal(c.art.footings.length, 2);
      for (const p of c.art.footings) {
        const bottom = p.footing?.bottom ?? p.ground;
        for (const dx of [-0.42, 0, 0.42])
          for (const dz of [-0.42, 0, 0.42]) {
            const x = p.x + dx,
              z = p.z + dz;
            ray.set(
              new THREE.Vector3(x, bottom - 1, z),
              new THREE.Vector3(0, 1, 0),
            );
            const hit = ray.intersectObject(c.art.fixed, true)[0];
            assert(
              hit && hit.point.y <= g.groundHeight(x, z) + 0.015,
              `${level.id}/${c.id}: unsupported hoist footing at ${x},${z}`,
            );
            postRays++;
          }
        assert(
          g.cameraSurfaces.entry(
            new THREE.Vector3(p.x - 1, p.ground + 0.8, p.z),
            new THREE.Vector3(p.x + 1, p.ground + 0.8, p.z),
            0,
          ) < 1,
          `${level.id}/${c.id}: camera enters the low hoist bearing`,
        );
      }
    }
  }
  assert.equal(pierRays, 2625);
  assert.equal(postRays, 378);
});

test("all 210 bronze ledge markers sit in the paving bed and clear the crouched sole height", (t) => {
  let marks = 0,
    rays = 0;
  for (const level of LEVELS) {
    const g = world(t, level),
      ray = new THREE.Raycaster();
    for (const c of g.traversalCourses)
      for (const l of c.ledges)
        for (const side of [-1, 1]) {
          for (const dx of [-0.022, 0, 0.022])
            for (let i = 0; i <= 10; i++) {
              const x = l.x + side * (l.w - 0.17) + dx,
                z = l.z - l.d + 0.18 + (i * (2 * l.d - 0.36)) / 10;
              ray.set(
                new THREE.Vector3(x, l.y + 0.06, z),
                new THREE.Vector3(0, -1, 0),
              );
              ray.far = 0.1;
              const top = ray.intersectObject(c.art.detail, true)[0];
              assert(
                top && Math.abs(top.point.y - l.y - 0.002) <= 0.00001,
                `${level.id}/${c.id}/${l.index}: raised ledge marker`,
              );
              ray.set(
                new THREE.Vector3(x, l.y - 0.06, z),
                new THREE.Vector3(0, 1, 0),
              );
              const bottom = ray.intersectObject(c.art.detail, true)[0];
              assert(
                bottom && Math.abs(bottom.point.y - l.y + 0.005) <= 0.00001,
                `${level.id}/${c.id}/${l.index}: marker misses the joint bed`,
              );
              rays += 2;
            }
          marks++;
        }
  }
  assert.equal(marks, 210);
  assert.equal(rays, 13860);
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
              hit && Math.abs(hit.point.y - summit.y) <= 0.00501,
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
