import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { bellStoneGeometry } from "../src/bell-landing-stone.js";
import { FacadeCamera } from "../src/fitted-facades.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { supportAt } from "../src/character-motion.js";
import { buildBellPlatform } from "../src/bell-rack-art.js";
import { Adventure } from "../src/game.js";
import { advanceCharacter } from "../src/character-motion.js";
import { stationBlocked } from "../src/field-station-solids.js";

function closed(g) {
  const p = g.attributes.position,
    index = g.index,
    edges = new Map();
  let volume = 0;
  const key = (v) =>
    v
      .toArray()
      .map((x) => Math.round(x * 1e6))
      .join(",");
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(
        p,
        index ? index.getX(i + j) : i + j,
      ),
    );
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.lengthSq() > 1e-16, "nondegenerate triangle");
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const x = key(u),
        y = key(v),
        pair = [x, y].sort().join("/");
      edges.set(pair, (edges.get(pair) || 0) + (x < y ? 1 : -1));
    }
  }
  assert(
    [...edges.values()].every((n) => n === 0),
    "closed oriented edges",
  );
  assert(volume > 0, "outward solid");
  for (const a of Object.values(g.attributes))
    assert(a.array.every(Number.isFinite));
}

test("dressed blocks and thin paving slabs remain closed inside their exact cells with physical stone UVs", () => {
  for (let seed = 1; seed <= 12; seed++)
    for (const paving of [false, true]) {
      const w = seed % 2 ? 1.24 : 0.61,
        h = paving ? 1.186 : 0.43,
        d = paving ? 0.045 : 0.12,
        geometry = bellStoneGeometry(
          w,
          h,
          d,
          seed,
          paving ? { rise: 0.002, bevel: 0.018, facet: 0 } : {},
        );
      closed(geometry);
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        assert(Math.abs(p.getX(i)) <= w / 2 + 1e-7);
        assert(Math.abs(p.getY(i)) <= h / 2 + 1e-7);
        assert(Math.abs(p.getZ(i)) <= d / 2 + 1e-7);
      }
      for (let i = 0; i < p.count; i += 3) {
        const points = [0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(p, i + j),
          ),
          normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3());
        assert(
          normal.dot(new THREE.Vector3().fromBufferAttribute(n, i)) > 0.999999,
        );
        if (Math.abs(normal.z) > 0.999999)
          for (let j = 1; j <= 2; j++) {
            assert(
              Math.abs(
                (uv.getX(i + j) - uv.getX(i)) * 2 - (p.getX(i + j) - p.getX(i)),
              ) < 1e-6,
            );
            assert(
              Math.abs(
                (uv.getY(i + j) - uv.getY(i)) * 2 - (p.getY(i + j) - p.getY(i)),
              ) < 1e-6,
            );
          }
      }
      geometry.dispose();
    }
});

test("finite camera cells follow every delivered shoulder and slab face through rotated parents", () => {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  let probes = 0;
  try {
    for (const paving of [false, true]) {
      const geometry = bellStoneGeometry(
          1.24,
          paving ? 1.186 : 0.43,
          paving ? 0.045 : 0.12,
          91,
          paving ? { rise: 0.002, bevel: 0.018, facet: 0 } : {},
        ),
        camera = new FacadeCamera(geometry),
        mesh = new THREE.Mesh(geometry, material);
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const frame = new THREE.Matrix4()
            .makeRotationY(yaw)
            .setPosition(12, 7, -9),
          inverse = frame.clone().invert();
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(frame);
        mesh.updateMatrixWorld(true);
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i += 3) {
          const v = [0, 1, 2].map((j) =>
              new THREE.Vector3().fromBufferAttribute(p, i + j),
            ),
            normal = new THREE.Triangle(...v).getNormal(new THREE.Vector3());
          if (normal.z < 0.01) continue;
          const center = v
              .reduce((s, v) => s.add(v), new THREE.Vector3())
              .multiplyScalar(1 / 3),
            from = center
              .clone()
              .addScaledVector(normal, 0.15)
              .applyMatrix4(frame),
            to = center
              .clone()
              .addScaledVector(normal, -0.15)
              .applyMatrix4(frame);
          ray.set(from, to.clone().sub(from).normalize());
          ray.far = 0.3;
          const hit = ray.intersectObject(mesh, false)[0];
          assert(hit);
          const a = from.clone().applyMatrix4(inverse),
            b = to.clone().applyMatrix4(inverse),
            t = camera.entry(a, b, 0);
          assert(
            t !== null && Math.abs(t - hit.distance / 0.3) < 2e-5,
            `finite shoulder mismatch ${paving}/${yaw}/${i}`,
          );
          const padded = camera.entry(a, b, 0.04);
          assert(padded !== null && padded <= t + 1e-6);
          probes++;
        }
      }
      geometry.dispose();
    }
    assert(probes > 150);
  } finally {
    material.dispose();
  }
});

test("all seven paved landings retain fixed support with at most two millimetres of joint recess", (t) => {
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    stone = new THREE.MeshStandardMaterial({ vertexColors: true }),
    wood = new THREE.MeshStandardMaterial({ vertexColors: true }),
    game = {
      level,
      map,
      world,
      obstacles: [],
      groundHeight: profile.height,
      terrainProfile: profile,
      stoneMat: stone,
      monasteryMaterials: { stone, wood },
      cameraSurfaces: new CameraSurfaces(world),
    },
    ray = new THREE.Raycaster();
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
    stone.dispose();
    wood.dispose();
  });
  let samples = 0,
    controls = 0;
  for (const feature of map.features.filter(
    (f) => f.type === "mechanism" && f.stage > 0,
  )) {
    game.cameraSurfaces = new CameraSurfaces(world);
    const x = feature.x * 7,
      z = feature.z * 7,
      base = game.groundHeight(x, z),
      height = 2.8 + (feature.stage % 3) * 0.3,
      landing = buildBellPlatform(game, feature, x, base, z, height),
      top = base + height;
    world.updateMatrixWorld(true);
    game.cameraSurfaces.rebuild();
    for (const dx of [
      -3.79, -3.2, -2.533333333, -1.266666667, 0, 1.266666667, 2.533333333, 3.2,
      3.79,
    ])
      for (const dz of [
        -2.99, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 2.99,
      ]) {
        const from = new THREE.Vector3(x + dx, top + 0.3, z + dz),
          to = from.clone().add(new THREE.Vector3(0, -0.5, 0));
        ray.set(from, new THREE.Vector3(0, -1, 0));
        ray.far = 0.5;
        const hit = ray.intersectObject(landing.root, true)[0];
        assert(hit);
        assert(
          top - hit.point.y >= -1e-5 && top - hit.point.y <= 0.00205,
          "paving leaves a deep gap or lifts the saved deck",
        );
        assert(
          Math.abs(supportAt(game, x + dx, z + dz, top + 0.05).height - top) <
            1e-5,
        );
        assert(
          Math.abs(
            game.cameraSurfaces.entry(from, to, 0) - hit.distance / 0.5,
          ) < 2e-5,
          `batched paving camera differs: stage=${feature.stage} x=${dx} z=${dz} camera=${game.cameraSurfaces.entry(from, to, 0)} mesh=${hit.distance / 0.5}`,
        );
        samples++;
      }
    landing.root.position.y -= 0.04;
    world.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(x, top + 0.3, z), new THREE.Vector3(0, -1, 0));
    ray.far = 0.5;
    assert(
      top - ray.intersectObject(landing.root, true)[0].point.y > 0.035,
      "lowered-deck control must miss its fixed support plane",
    );
    landing.root.position.y += 0.04;
    controls++;
  }
  assert.equal(samples, 693);
  assert.equal(controls, 7);
});

test("landing body clearance rejects the recorded wall entry while retaining mantle targets and a grounded walk-off", (t) => {
  const stone = new THREE.MeshStandardMaterial(),
    wood = new THREE.MeshStandardMaterial();
  t.after(() => {
    stone.dispose();
    wood.dispose();
  });
  for (let stage = 1; stage <= 7; stage++) {
    const world = new THREE.Group(),
      height = 2.8 + (stage % 3) * 0.3,
      game = Object.assign(Object.create(Adventure.prototype), {
        level: LEVELS[2],
        world,
        obstacles: [],
        groundHeight: () => 0,
        walkable: () => true,
        stoneMat: stone,
        monasteryMaterials: { stone, wood },
        player: new THREE.Group(),
        avatar: new THREE.Group(),
        audio: { tone() {} },
        yaw: 0,
        jumpY: 0,
        velocityY: 0,
        grounded: true,
        health: 100,
      });
    const landing = buildBellPlatform(
        game,
        { id: `bell-${stage}`, stage },
        0,
        0,
        0,
        height,
      ),
      body = game.obstacles.find((o) => o.bellLandingBody);
    assert(
      stationBlocked(body, 3.81, 0, 0, 1.8),
      "recorded legal root must now reserve the posed body",
    );
    assert(!stationBlocked(body, 4.5, 0, 0, 1.8), "the side aisle stays clear");
    assert(
      game.lineOfSight(
        new THREE.Vector3(4.2, 0, -4),
        new THREE.Vector3(4.2, 0, 4),
        1,
        1,
      ),
      "a sound/sight ray outside the masonry must clear the movement margin",
    );
    assert(
      !game.lineOfSight(
        new THREE.Vector3(3, 0, -4),
        new THREE.Vector3(3, 0, 4),
        1,
        1,
      ),
      "the same ray through real masonry must remain obstructed",
    );
    assert.equal(
      supportAt(game, 3.81, 0, height + 0.05).height,
      0,
      "body padding must not add a hovering support ledge",
    );
    game.player.position.set(0, 0, 3.7);
    assert(game.canMove(0, 3.7, 0));
    assert(
      game.tryClimb(0, -1),
      "mantle remains reachable outside the body margin",
    );
    assert.equal(game.climb.end.y, height);
    game.player.position.copy(game.climb.end);
    game.climb = null;
    game.jumpY = height;
    for (let i = 0; i < 150; i++) {
      advanceCharacter(game, { x: 0, z: 4 }, 1 / 60);
      assert(
        game.canMove(
          game.player.position.x,
          game.player.position.z,
          game.jumpY,
        ),
        "descent catches the body in its side margin",
      );
    }
    assert(
      game.grounded &&
        game.player.position.y < 0.01 &&
        game.player.position.z > 5,
      "walking off must reach the lower floor",
    );
    for (const angle of [
      0,
      Math.PI / 2,
      Math.PI,
      -Math.PI / 2,
      Math.atan2(3.8, 3),
      Math.atan2(-3.8, 3),
      Math.atan2(3.8, -3),
      Math.atan2(-3.8, -3),
    ]) {
      game.player.position.set(0, height, 0);
      game.jumpY = height;
      game.velocityY = 0;
      game.grounded = true;
      for (let i = 0; i < 150; i++) {
        advanceCharacter(
          game,
          { x: Math.sin(angle) * 4, z: Math.cos(angle) * 4 },
          1 / 60,
        );
        assert(
          game.canMove(
            game.player.position.x,
            game.player.position.z,
            game.jumpY,
          ),
          `walk-off contact at stage ${stage}, heading ${angle}, tick ${i}`,
        );
      }
      assert(
        game.grounded && game.player.position.y < 0.01,
        "every side and corner reaches the lower floor",
      );
    }
    landing.root.traverse((o) => o.geometry?.dispose());
  }
});
