import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { restoreTraversal } from "../src/traversal.js";
import { normalizeSave } from "../src/storage.js";
import { migrateSkyRoute } from "../src/sky-layout.js";
import { updateSoundSources } from "../src/sound-landmarks.js";
import { distanceGain, scoreBar } from "../src/audio.js";
import {
  bridgeGust,
  updateSkyGusts,
  skyWindVelocity,
} from "../src/sky-gusts.js";
import {
  bridgeBoardGeometry,
  bridgeRopeGeometry,
  bridgeAnchorGeometry,
} from "../src/sky-bridge-art.js";
import {
  buildSkyBridges,
  updateSkyBridges,
  recoverSkyBridgeFall,
  restoreSkyBridgeArrival,
} from "../src/sky-bridges.js";
import {
  spanCoordinates,
  bridgeDeckY,
  bridgeDeployed,
  skyDeckAt,
} from "../src/sky-bridge-rules.js";

function fixture(t, stage = 9) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[5],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    world,
    groundHeight: profile.height,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    progress: { stage, field: [], routeVersion: 1 },
    elapsed: 0,
    player: { position: new THREE.Vector3() },
    audio: { tone() {}, noiseHit() {} },
    cb: { toast() {} },
    stamina: 100,
    traversalCourses: [],
  });
  buildSkyBridges(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
  });
  return game;
}

test("sky spans cross real ravines, join their banks exactly, and retain every ordered station", (t) => {
  const game = fixture(t),
    profile = game.terrainProfile;
  assert.equal(game.skyBridges.length, 18);
  assert.equal(game.map.features.filter((f) => f.type === "field").length, 27);
  for (const b of game.skyBridges) {
    const c = spanCoordinates(b, b.bx, b.bz);
    assert.ok(c.length > 40 && c.length < 43);
    assert.equal(profile.height(b.ax, b.az), b.ay);
    assert.equal(profile.height(b.bx, b.bz), b.by);
    assert.ok(
      bridgeDeckY(b, c.length / 2) -
        profile.height((b.ax + b.bx) / 2, (b.az + b.bz) / 2) >
        23.9,
    );
    for (const gap of b.gaps)
      assert.ok(gap.end - gap.start > 1.5 && gap.end - gap.start < 1.61);
    assert.equal(
      game.skyBridgeSources.filter((s) => s.id.startsWith(b.id)).length,
      6,
    );
    if (b.requires)
      assert.ok(game.map.features.some((f) => f.id === b.requires));
  }
  for (let stage = 0; stage < 9; stage++) {
    const stations = game.map.features.filter(
      (f) => f.type === "field" && f.stage === stage,
    );
    assert.deepEqual(
      stations.map((f) => f.step),
      [0, 1, 2],
    );
    const from = game.map.rooms[stage],
      to = game.map.rooms[stage + 1];
    const along = stations.map(
      (f) =>
        (f.x - from.x) * (to.x - from.x) + (f.z - from.z) * (to.z - from.z),
    );
    assert.ok(along[0] > 0 && along[1] > along[0] && along[2] > along[1]);
  }
});

test("all eighteen spans can be crossed in both directions at carrying speed through the character physics", (t) => {
  const game = fixture(t);
  for (const b of game.skyBridges)
    for (const direction of [1, -1]) {
      const c = spanCoordinates(b, b.bx, b.bz),
        start = direction === 1 ? -1 : c.length + 1;
      const x = b.ax + c.ux * start,
        z = b.az + c.uz * start;
      game.player.position.set(x, game.groundHeight(x, z), z);
      Object.assign(game, {
        grounded: true,
        velocityY: 0,
        airVelocity: null,
        jumpBuffer: 0,
        coyote: 0,
        fallPeak: game.player.position.y,
      });
      let jumps = 0,
        finished = false;
      for (let frame = 0; frame < 900; frame++) {
        const p = spanCoordinates(
          b,
          game.player.position.x,
          game.player.position.z,
        );
        if (direction === 1 ? p.along > c.length + 0.8 : p.along < -0.8) {
          finished = true;
          break;
        }
        const jump =
          game.grounded &&
          b.gaps.some((g) => {
            const d = direction === 1 ? g.start - p.along : p.along - g.end;
            return d > 0 && d < 1.15;
          });
        if (jump) jumps++;
        advanceCharacter(
          game,
          { x: c.ux * 4.6 * direction, z: c.uz * 4.6 * direction },
          1 / 60,
          jump,
        );
        assert.equal(
          recoverSkyBridgeFall(game),
          false,
          `${b.id} direction ${direction}: crossing fell`,
        );
      }
      assert.ok(
        finished,
        `${b.id} direction ${direction}: must reach the far bank`,
      );
      assert.equal(jumps, b.gaps.length);
    }
});

test("gusts give advance warning, progress through three patterns and include calm windows", () => {
  const kinds = new Set();
  for (let stage = 0; stage < 9; stage++) {
    const b = { stage, section: 1 },
      sample = bridgeGust(b, 0);
    kinds.add(sample.kind);
    assert.equal(sample.force, 0);
    let calm = 0,
      positive = 0,
      negative = 0,
      previous = 0;
    for (let time = 0; time < sample.period; time += 0.02) {
      const s = bridgeGust(b, time);
      assert(Math.abs(s.force) <= s.peak + 1e-8);
      if (Math.abs(s.force) < 1e-8) calm++;
      if (s.force > 0.01) positive++;
      if (s.force < -0.01) negative++;
      if (Math.abs(s.force) > 1e-8 && Math.abs(previous) < 1e-8)
        assert(
          bridgeGust(b, time - 0.7).warning > 0.4,
          "each force onset must follow a visible warning",
        );
      previous = s.force;
    }
    assert(calm > 120);
    if (stage >= 3) assert(positive > 0 && negative > 0);
  }
  assert.equal(kinds.size, 3);
  assert(bridgeGust({ stage: 0 }, 6).peak < bridgeGust({ stage: 8 }, 4).peak);
});

test("crossing music retains the sky harmony while leaving space for gust warnings", () => {
  for (let stage = 0; stage < 9; stage++)
    for (let bar = 0; bar < 16; bar++) {
      const normal = scoreBar("sky", stage, bar, "explore", "survey"),
        crossing = scoreBar("sky", stage, bar, "explore", "crosswind");
      assert.deepEqual(
        crossing,
        normal.filter((e) => e.voice === "pad" || e.voice === "bass"),
      );
      assert(!crossing.some((e) => e.voice === "pulse"));
    }
});

test("bracing prevents a sustained gust from sweeping an idle explorer off the deck; paused and sheltered bodies do not drift", (t) => {
  const g = fixture(t),
    b = g.skyBridges.find((b) => b.stage === 2),
    c = spanCoordinates(b, b.bx, b.bz),
    along = c.length * 0.27;
  const place = () => {
    const x = b.ax + c.ux * along,
      z = b.az + c.uz * along;
    g.player.position.set(x, bridgeDeckY(b, along), z);
    g.grounded = true;
    g.velocityY = 0;
    g.airVelocity = null;
    g.carrying = false;
    g.elapsed = 0;
    g.paused = false;
    g.coyote = g.jumpBuffer = 0;
  };
  for (const crouching of [true, false]) {
    place();
    g.crouching = crouching;
    let caught = false;
    for (let i = 0; i < 11 * 60; i++) {
      g.elapsed += 1 / 60;
      updateSkyGusts(g);
      advanceCharacter(g, skyWindVelocity(g, { x: 0, z: 0 }), 1 / 60);
      if (recoverSkyBridgeFall(g)) {
        caught = true;
        break;
      }
    }
    assert.equal(caught, !crouching);
    if (crouching) {
      assert(g.grounded);
      assert(
        Math.abs(
          spanCoordinates(b, g.player.position.x, g.player.position.z).across,
        ) < 0.3,
      );
    }
  }
  place();
  g.elapsed = 6;
  updateSkyGusts(g);
  g.crouching = false;
  assert(
    Math.hypot(...Object.values(skyWindVelocity(g, { x: 0, z: 0 }))) > 0.5,
  );
  const sample = b.gust,
    vertices = b.streamers.mesh.geometry.attributes.position.array.slice();
  g.paused = true;
  g.elapsed = 20;
  updateSkyBridges(g, 5);
  assert.equal(b.gust, sample);
  assert.deepEqual(
    b.streamers.mesh.geometry.attributes.position.array,
    vertices,
  );
  assert.deepEqual(skyWindVelocity(g, { x: 1, z: 0 }), { x: 1, z: 0 });
  g.paused = false;
  for (const s of [-1, c.length + 1]) {
    g.player.position.set(b.ax + c.ux * s, bridgeDeckY(b, s), b.az + c.uz * s);
    assert.deepEqual(skyWindVelocity(g, { x: 0, z: 0 }), { x: 0, z: 0 });
  }
  place();
  b.open = 0;
  assert.deepEqual(skyWindVelocity(g, { x: 0, z: 0 }), { x: 0, z: 0 });
});

test("all eighteen gusting spans remain crossable both ways at carrying speed with steering and gap jumps", (t) => {
  const g = fixture(t);
  for (const b of g.skyBridges)
    for (const direction of [1, -1]) {
      const c = spanCoordinates(b, b.bx, b.bz),
        start = direction > 0 ? -1 : c.length + 1,
        x = b.ax + c.ux * start,
        z = b.az + c.uz * start;
      g.player.position.set(x, g.groundHeight(x, z), z);
      Object.assign(g, {
        grounded: true,
        velocityY: 0,
        airVelocity: null,
        jumpBuffer: 0,
        coyote: 0,
        carrying: true,
        crouching: false,
        elapsed: b.stage * 0.71 + 2,
        fallPeak: g.player.position.y,
      });
      let finished = false,
        peak = 0,
        jumps = 0;
      for (let i = 0; i < 1000; i++) {
        const p = spanCoordinates(b, g.player.position.x, g.player.position.z);
        if (direction > 0 ? p.along > c.length + 0.8 : p.along < -0.8) {
          finished = true;
          break;
        }
        g.elapsed += 1 / 60;
        updateSkyGusts(g);
        const jump =
          g.grounded &&
          b.gaps.some((gap) => {
            const d = direction > 0 ? gap.start - p.along : p.along - gap.end;
            return d > 0 && d < 1.15;
          });
        if (jump) jumps++;
        // Correct observed lateral drift; no cancellation of the wind signal.
        const velocity = new THREE.Vector2(
          c.ux * 4.6 * direction - c.uz * p.across * 3,
          c.uz * 4.6 * direction + c.ux * p.across * 3,
        )
          .normalize()
          .multiplyScalar(4.6);
        const pushed = skyWindVelocity(g, { x: velocity.x, z: velocity.y });
        peak = Math.max(peak, Math.abs(g.skyWind?.force || 0));
        advanceCharacter(g, pushed, 1 / 60, jump);
        assert(!recoverSkyBridgeFall(g), `${b.id} direction ${direction} fell`);
      }
      assert(finished, `${b.id} direction ${direction} did not finish`);
      assert(peak > 0.1);
      assert.equal(jumps, b.gaps.length);
    }
});

test("streamer roots stay attached, tips reverse with the gust, and one existing positional wind source follows each pulse", (t) => {
  const g = fixture(t),
    b = g.skyBridges.find((b) => b.stage === 4),
    h = b.streamers;
  const tips = [];
  for (const time of [4.5, 11.5]) {
    g.elapsed = time;
    g.player.position.set(b.ax, b.ay, b.az);
    updateSkyBridges(g, 0);
    const p = h.mesh.geometry.attributes.position;
    for (const [i, a] of h.anchors.entries()) {
      const n = i * (h.segments + 1) * 2;
      assert(Math.abs(p.getX(n) - a.x) < 1e-5);
      assert(Math.abs(p.getY(n) - a.y) < 1e-5);
      assert(Math.abs((p.getZ(n) + p.getZ(n + 1)) / 2 - a.z) < 1e-5);
    }
    tips.push(p.getX(h.segments * 2) - h.anchors[0].x);
  }
  assert(tips[0] * tips[1] < 0);
  g.soundSources = g.skyBridgeSources.map((s) => ({ ...s }));
  updateSoundSources(g);
  assert.equal(
    g.soundSources.filter((s) => s.skyBridgeWind === b.id).length,
    1,
  );
  const source = g.soundSources.find((s) => s.skyBridgeWind === b.id);
  assert.equal(source.activity, b.gust.activity);
  assert(source.activity > 0.8);
  g.paused = true;
  updateSoundSources(g);
  assert.equal(source.activity, 0);
});

test("missing boards remove physical support and a missed jump returns to the last bank without advancing objectives", (t) => {
  const game = fixture(t),
    b = game.skyBridges.find((b) => b.gaps.length),
    c = spanCoordinates(b, b.bx, b.bz),
    gap = b.gaps[0],
    s = (gap.start + gap.end) / 2;
  assert.equal(skyDeckAt(game, b.ax + c.ux * s, b.az + c.uz * s), null);
  for (const bank of ["a", "b"]) {
    b.lastBank = bank;
    game.player.position.set(
      b.ax + c.ux * s,
      bridgeDeckY(b, s),
      b.az + c.uz * s,
    );
    game.grounded = false;
    game.velocityY = 0;
    game.airVelocity = null;
    game.jumpBuffer = 0;
    game.coyote = 0;
    let caught = false;
    for (let i = 0; i < 120; i++) {
      advanceCharacter(game, { x: 0, z: 0 }, 1 / 60);
      if (recoverSkyBridgeFall(game)) {
        caught = true;
        break;
      }
    }
    assert.ok(caught);
    assert.equal(game.grounded, true);
    const restored = spanCoordinates(
      b,
      game.player.position.x,
      game.player.position.z,
    ).along;
    assert.ok(bank === "a" ? restored < 0 : restored > c.length);
    assert.ok(game.canMove(game.player.position.x, game.player.position.z, 0));
    assert.equal(game.progress.stage, 9);
    assert.deepEqual(game.progress.field, []);
  }
});

test("winch progress unfolds only its linked span and changes the actual moving camera surfaces", (t) => {
  const game = fixture(t, 0),
    b = game.skyBridges.find((b) => b.stage === 2 && b.section === 1),
    c = spanCoordinates(b, b.bx, b.bz);
  assert.equal(b.open, 0);
  game.world.updateMatrixWorld(true);
  for (const [i, half] of b.halves.entries()) {
    const bounds = new THREE.Box3().setFromObject(half);
    assert.ok(
      bounds.max.y > (i ? b.by : b.ay) + 15,
      "both halves fold above their banks",
    );
  }
  assert.equal(bridgeDeployed(game.progress, b), false);
  assert.equal(skyDeckAt(game, (b.ax + b.bx) / 2, (b.az + b.bz) / 2), null);
  const start = new THREE.Vector3(b.ax + c.ux * 0.1, b.ay, b.az + c.uz * 0.1);
  assert.equal(
    game.canMove(
      start.x,
      start.z,
      start.y - game.groundHeight(start.x, start.z),
    ),
    false,
  );
  game.progress.stage = 2;
  game.progress.field = [b.requires];
  game.player.position.copy(start);
  updateSkyBridges(game, 1);
  assert.ok(b.open > 0 && b.open < 0.995);
  assert.ok(b.halves[0].rotation.x < 0);
  assert.ok(b.drums.every(({ rotor }) => Math.abs(rotor.rotation.x) > 0));
  const sources = game.skyBridgeSources.filter((s) => s.skyBridgeDrum === b.id);
  assert.equal(sources.length, 4);
  game.soundSources = sources.map((s) => ({ ...s }));
  updateSoundSources(game);
  assert.ok(game.soundSources.every((s) => s.activity > 0));
  for (const [i, s] of sources.entries()) {
    const { rotor, sign } = b.drums[i];
    const front = rotor.position.clone();
    front.z += sign * 0.4;
    b.detail.localToWorld(front);
    assert.ok(front.distanceTo(new THREE.Vector3(s.x, s.y, s.z)) < 1e-7);
    assert.equal(distanceGain(2, s.near, s.range), 1);
    assert.equal(distanceGain(12, s.near, s.range), 0.5);
    assert.equal(distanceGain(22, s.near, s.range), 0);
  }
  assert.equal(
    game.skyBridges.find((q) => q.stage === 2 && q.section === 2).open,
    0,
  );
  updateSkyBridges(game, 10);
  game.world.updateMatrixWorld(true);
  assert.equal(b.open, 1);
  assert.ok(Math.abs(b.halves[0].rotation.x) < 1e-8);
  assert.ok(
    b.drums.every(
      ({ rotor }) => Math.abs(Math.abs(rotor.rotation.x) - Math.PI * 6) < 1e-8,
    ),
  );
  assert.equal(
    game.canMove(
      start.x,
      start.z,
      start.y - game.groundHeight(start.x, start.z),
    ),
    true,
  );
  const s = c.length * 0.2,
    x = b.ax + c.ux * s,
    z = b.az + c.uz * s,
    y = bridgeDeckY(b, s);
  assert.ok(
    game.cameraSurfaces.entry(
      new THREE.Vector3(x, y + 2, z),
      new THREE.Vector3(x, y - 2, z),
    ) < 1,
  );
  updateSoundSources(game);
  assert.ok(
    game.soundSources.every((s) => s.activity === 0),
    "bank drums become silent when deployment settles",
  );
  assert.ok(game.skyBridgeSources.length <= 108);
});

test("weathered boards remain closed solids with flat walking faces and varied finishes", () => {
  const shades = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const g = bridgeBoardGeometry(4.6, 0.75, seed);
    const p = g.attributes.position,
      n = g.attributes.normal;
    const edges = new Map();
    const key = (i) =>
      [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(6)).join(",");
    let volume = 0;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const edge = [key(i + j), key(i + ((j + 1) % 3))].sort().join("/");
        edges.set(edge, (edges.get(edge) || 0) + 1);
        assert.ok(
          Number.isFinite(n.getX(i + j)) &&
            Number.isFinite(n.getY(i + j)) &&
            Number.isFinite(n.getZ(i + j)),
        );
        if (n.getY(i + j) > 0.999)
          assert.ok(Math.abs(p.getY(i + j) - 0.095) < 1e-6);
      }
    }
    assert.ok(
      volume > 0.55 && volume < 0.67,
      "outward-facing closed plank volume",
    );
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      "every bevel edge is sealed",
    );
    shades.add(g.attributes.color.getX(0));
    assert.equal(g.attributes.bridgeWoodCoord.count, p.count);
    g.dispose();
  }
  assert.ok(shades.size > 12, "boards have distinct weathering values");
});

test("rope twist coordinates retain physical scale for unequal cable lengths", () => {
  const geometries = [3, 6].map((length) =>
    bridgeRopeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(),
        new THREE.Vector3(0, length, 0),
      ),
      0.05,
      8,
    ),
  );
  const maxima = geometries.map((g) => {
    const uv = g.attributes.uv;
    const max = Math.max(
      ...Array.from({ length: uv.count }, (_, i) => uv.getX(i)),
    );
    g.dispose();
    return max;
  });
  assert.ok(Math.abs(maxima[1] / maxima[0] - 2) < 1e-6);
});

test("narrow anchor piers retain packed backing through side-view masonry joints", () => {
  const material = new THREE.MeshBasicMaterial();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());
  for (let seed = 1; seed <= 4; seed++) {
    const geometry = bridgeAnchorGeometry(0, 5.9, seed);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    for (const side of [-1, 1])
      for (let i = 1; i < 59; i++) {
        ray.ray.origin.set(side * 2, i / 10, 0.83);
        ray.ray.direction.set(-side, 0, 0);
        const hit = ray.intersectObject(mesh)[0];
        assert.ok(
          hit && hit.distance < 1.5,
          `pier ${seed}, height ${i / 10}, side ${side}`,
        );
      }
    geometry.dispose();
  }
  material.dispose();
});

test("bridge art keeps its GPU attributes after batching and has bounded detail groups", (t) => {
  const game = fixture(t);
  let meshes = 0,
    triangles = 0;
  for (const b of game.skyBridges) {
    assert.equal(b.drums.length, 4);
    assert.equal(b.deckDetails.length, 2);
    for (const group of [b.root, b.detail])
      group.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry,
          count = g.attributes.position.count;
        triangles += (g.index?.count || count) / 3;
        assert.equal(g.attributes.normal.count, count);
        assert.equal(g.attributes.uv.count, count);
        if (o.material.name === "Weathered bridge timber") {
          assert.equal(g.attributes.bridgeWoodCoord.count, count);
          assert.equal(g.attributes.color.count, count);
        }
        if (o.material.userData.windMetal) {
          assert.equal(g.attributes.windCoord.count, count);
          assert.equal(g.attributes.windCavity.count, count);
        }
      });
  }
  assert.ok(meshes < 650, `bridge mesh budget: ${meshes}`);
  assert.ok(triangles < 700000, `bridge triangle budget: ${triangles}`);
  game.player.position.set(-1000, 0, -1000);
  updateSkyBridges(game, 0);
  assert.ok(
    game.skyBridges.every(
      (b) => !b.detail.visible && b.deckDetails.every((d) => !d.visible),
    ),
  );
});

test("visible plank tops agree with support heights along both sagging bridge halves", (t) => {
  const game = fixture(t),
    ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  game.world.updateMatrixWorld(true);
  for (const b of game.skyBridges) {
    const c = spanCoordinates(b, b.bx, b.bz),
      n = Math.ceil(c.length / 0.8),
      step = c.length / n;
    for (const index of [4, 11, n - 12, n - 5]) {
      const s = (index + 0.5) * step,
        x = b.ax + c.ux * s,
        z = b.az + c.uz * s,
        floor = skyDeckAt(game, x, z);
      if (!floor) continue;
      ray.ray.origin.set(x, floor.height + 8, z);
      const hit = ray.intersectObjects(b.halves, true)[0];
      assert.ok(hit, `${b.id}: visible plank`);
      assert.ok(
        Math.abs(hit.point.y - floor.height) < 0.003,
        `${b.id}: physics and rendered sag agree`,
      );
    }
  }
});

test("sky saves retain a supported bridge position, rescue airborne arrivals, and migrate old locations once", (t) => {
  const game = fixture(t),
    b = game.skyBridges[0],
    c = spanCoordinates(b, b.bx, b.bz),
    s = c.length * 0.4;
  const x = b.ax + c.ux * s,
    z = b.az + c.uz * s,
    y = bridgeDeckY(b, s);
  game.progress.position = { x, z, height: y - game.groundHeight(x, z) };
  const saved = normalizeSave({ version: 1, levels: { sky: game.progress } })
    .levels.sky;
  game.progress = saved;
  game.player.position.set(x, game.groundHeight(x, z), z);
  restoreTraversal(game);
  restoreSkyBridgeArrival(game);
  assert.ok(Math.abs(game.player.position.y - y) < 0.000001);
  assert.equal(game.player.position.x, x);
  assert.equal(game.player.position.z, z);
  assert.equal(saved.routeVersion, 1);
  game.progress.position.height += 1;
  game.player.position.set(x, game.groundHeight(x, z), z);
  restoreTraversal(game);
  restoreSkyBridgeArrival(game);
  assert.ok(
    spanCoordinates(b, game.player.position.x, game.player.position.z).along <
      0,
  );
  const old = {
    stage: 4,
    field: ["field-4-0"],
    found: ["note-0"],
    completed: false,
    time: 520,
    position: { x: 220, z: 50 },
    checkpoint: { x: 220, z: 40 },
    traversal: { id: "field-0-0", ledge: 2 },
  };
  assert.equal(migrateSkyRoute(old, game.map), true);
  assert.deepEqual(old.field, ["field-4-0"]);
  assert.deepEqual(old.found, ["note-0"]);
  assert.equal(old.time, 520);
  assert.equal(old.traversal, null);
  assert.equal(old.routeVersion, 1);
  const once = JSON.stringify(old);
  assert.equal(migrateSkyRoute(old, game.map), false);
  assert.equal(JSON.stringify(old), once);
  game.level = LEVELS[0];
  buildSkyBridges(game);
  assert.deepEqual(game.skyBridges, []);
  assert.deepEqual(game.skyBridgeSources, []);
  assert.equal(game.skyTether, null);
});
