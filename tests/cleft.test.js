import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { SaveStore, normalizeSave } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  supportAt,
  safeArrival,
  advanceCharacter,
} from "../src/character-motion.js";
import { restoreTraversal, resetTraversal } from "../src/traversal.js";
import { createTerrainProfile } from "../src/terrain.js";
import { buildSurveyorsCleft } from "../src/cleft-art.js";
import {
  cleftInteract,
  updateCleft,
  cleftSafePoint,
  cleftSavePosition,
  cleftObjective,
} from "../src/cleft.js";
import {
  CLEFT_NODES,
  CLEFT_EDGES,
  CLEFT_TERRACES,
  cleftDirection,
  normalizeCleft,
} from "../src/cleft-rules.js";

function fixture(groundHeight = () => 3) {
  const world = new THREE.Group(),
    store = new SaveStore({ getItem: () => null, setItem() {} });
  const g = Object.assign(Object.create(Adventure.prototype), {
    world,
    store,
    progress: store.level("sands"),
    level: LEVELS[1],
    map: { cleft: { x: 29, z: 31 } },
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    groundHeight,
    walkable: () => true,
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(world),
    obstacles: [],
    traversalCourses: [],
    keys: new Set(),
    elapsed: 0,
    stamina: 100,
    health: 100,
    grounded: true,
    jumpY: 0.18,
    velocityY: 0,
    explored: new Set(),
    audio: {
      noiseHit(...args) {
        g.hits.push(args);
      },
      tone() {},
    },
    cb: {
      toast() {},
      cleftRecord() {
        g.records++;
      },
    },
    hits: [],
    records: 0,
  });
  buildSurveyorsCleft(g);
  g.cameraSurfaces.rebuild();
  g.player.position.copy(cleftSafePoint(g));
  return g;
}
function step(g, n = 1, x = 0, up = 0) {
  for (let i = 0; i < n; i++) {
    g.elapsed += 1 / 60;
    updateCleft(g, 1 / 60, x, up);
  }
}
function grip(g, index = 0) {
  g.player.position.copy(cleftSafePoint(g, index));
  g.grounded = true;
  g.cleftCooldown = 0;
  assert.equal(cleftInteract(g), true);
  step(g, 32);
  assert.equal(g.wallGrip.kind, "hang");
}
function move(g, id, catchIt = true) {
  const from = CLEFT_NODES[g.wallGrip.node],
    to = CLEFT_NODES[id],
    x = to.x - from.x,
    up = to.y - from.y;
  const direction = cleftDirection(from.id, x, up);
  assert.equal(direction.id, id);
  if (direction.leap) g.keys.add("Space");
  step(g, 1, x, up);
  if (direction.leap && catchIt) g.keys.add("KeyE");
  const kind = g.wallGrip.kind;
  step(g, kind === "leap" ? 58 : 40);
  g.keys.clear();
  return kind;
}
function mount(g, index) {
  g.keys.add("Space");
  step(g);
  step(g, 52);
  assert.equal(g.wallGrip, null);
  assert.equal(g.cleft.anchor, index);
}

function cameraFixture() {
  const g = fixture();
  g.camera = new THREE.PerspectiveCamera(58, 1280 / 800, 0.1, 1200);
  g.sun = new THREE.DirectionalLight();
  g.yaw = -2.05306456382522;
  g.pitch = 0.15;
  g.camera.position.copy(g.player.position).add(new THREE.Vector3(-4, 2, -2));
  return g;
}

test("taking a quarry grip frames its open face, retains look input, and releases the orbit on a terrace", () => {
  const g = cameraFixture();
  grip(g, 1);
  const saved = JSON.stringify(g.progress);
  for (let i = 0; i < 90; i++) g.updateCamera(1 / 60);
  const target = g.player.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  assert(g.camera.position.distanceTo(target) > 5);
  assert(g.camera.position.z > target.z + 5);
  assert(g.avatar.visible);
  g.yaw = 0.4;
  g.pitch = 0.3;
  g.updateCamera(1 / 60);
  assert(Math.abs(g.yaw - 0.4) < 1e-10);
  assert.equal(g.pitch, 0.3);
  assert.equal(
    JSON.stringify(g.progress),
    saved,
    "camera never changes the save",
  );
  mount(g, 1);
  g.yaw = 2.4;
  g.pitch = -0.2;
  g.updateCamera(1 / 60);
  assert.equal(g.yaw, 2.4);
  assert.equal(g.pitch, -0.2);
  grip(g, 1);
  g.updateCamera(1 / 60);
  assert.equal(g.yaw, 0, "a new grip reframes after free terrace look");
  g.wallGrip = null;
  g.updateCamera(1 / 60);
  g.wallGrip = { kind: "rappel-reach" };
  g.yaw = Math.PI;
  g.updateCamera(1 / 60);
  assert.equal(g.yaw, 0, "the return line also faces out from the wall");
});

test("all quarry handholds retain a clear camera and visible grip across the bounded look arc", () => {
  const g = cameraFixture();
  for (const node of g.cleft.nodes)
    for (const yaw of [
      -Math.PI,
      -0.85,
      -0.55,
      -0.5,
      -0.4,
      0,
      0.4,
      0.5,
      0.55,
      0.85,
      Math.PI,
    ])
      for (const pitch of [-0.65, 0.02, 0.08, 0.15, 0.2, 0.55, 1.05]) {
        g.wallGrip = { kind: "hang", node: node.id };
        g.cleft.cameraActive = true;
        g.yaw = yaw;
        g.pitch = pitch;
        g.player.position.copy(node.grip).add(new THREE.Vector3(0, -1.9, 0.55));
        const target = g.player.position
          .clone()
          .add(new THREE.Vector3(0, 1.3, 0));
        g.camera.position.copy(target).add(new THREE.Vector3(0, 1, 5.3));
        g.updateCamera(2);
        g.camera.updateMatrixWorld();
        const arm = g.camera.position.distanceTo(target),
          grip = node.grip.clone().project(g.camera),
          feet = g.player.position.clone().project(g.camera);
        // Railings can retract an oblique view. Both ends of the climber must
        // still fit the frame, rather than accepting the original torso close-up.
        assert(arm > 2.5 && arm < 5.5, `${node.id}/${yaw}/${pitch}: ${arm}`);
        assert(g.cameraSurfaces.entry(target, g.camera.position) > 0.99999);
        assert(g.camera.position.y > g.groundHeight() + 0.28);
        assert(Math.abs(grip.x) < 0.8 && Math.abs(grip.y) < 0.8);
        assert(Math.abs(feet.x) < 0.9 && Math.abs(feet.y) < 0.9);
        assert(g.avatar.visible);
      }
});

test("cleft graph offers a climbable bypass and directional, bidirectional gap transfers", () => {
  const reach = new Set([0]);
  for (let i = 0; i < CLEFT_NODES.length; i++)
    for (const e of CLEFT_EDGES) {
      if (e.leap) continue;
      if (reach.has(e.a)) reach.add(e.b);
      if (reach.has(e.b)) reach.add(e.a);
    }
  assert(reach.has(12));
  assert(!reach.has(22));
  assert.equal(CLEFT_EDGES.filter((e) => e.leap).length, 3);
  for (const e of CLEFT_EDGES)
    for (const [a, b] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      const p = CLEFT_NODES[a],
        q = CLEFT_NODES[b];
      assert.equal(cleftDirection(a, q.x - p.x, q.y - p.y).id, b);
      if (!e.leap) assert(Math.hypot(p.x - q.x, p.y - q.y) < 1.7);
    }
  assert.equal(cleftDirection(0, 0, 0), null);
});
test("cleft save normalization gates the record and leaves other chapters unchanged", () => {
  assert.deepEqual(normalizeCleft({ terrace: 3, recovered: true }), {
    visited: false,
    terrace: 0,
    recovered: false,
  });
  assert.equal(
    normalizeCleft({ visited: true, terrace: 2, recovered: true }).recovered,
    false,
  );
  assert.equal(normalizeCleft({ visited: true, terrace: Infinity }).terrace, 0);
  const data = normalizeSave({
    version: 1,
    levels: {
      sands: { cleft: { visited: true, terrace: 3, recovered: true } },
      frost: { cleft: { visited: true, terrace: 3, recovered: true } },
    },
  });
  assert(data.levels.sands.cleft.recovered);
  assert.equal(data.levels.frost.cleft, null);
});
test("cleft map connects to the western survey path, keeps features clear, and levels the footing", () => {
  const m = createMap(LEVELS[1]);
  assert(m.cleft);
  const path = m.paths.at(-1);
  assert.deepEqual(path[0], { x: 22, z: 35 });
  for (const p of path) assert(m.grid[p.z][p.x]);
  for (const f of m.features)
    assert(Math.hypot(f.x - 29, f.z - 31) * 7 > 40, f.id);
  const p = createTerrainProfile(m, LEVELS[1]);
  for (const t of CLEFT_TERRACES)
    assert(Math.abs(p.height(203 + t.x, 217 + 2) - p.height(203, 217)) < 0.03);
  for (const l of LEVELS.filter((l) => l.id !== "sands"))
    assert.equal(createMap(l).cleft, undefined);
});
test("all terraces support safe arrivals; facade, balcony undersides, and sight rays remain solid", () => {
  const g = fixture();
  for (let i = 0; i < 4; i++) {
    const p = cleftSafePoint(g, i);
    assert(g.canMove(p.x, p.z, p.y - 3));
    assert.equal(supportAt(g, p.x, p.z, p.y).height, p.y);
    assert.deepEqual(safeArrival(g, p), { x: p.x, y: p.y, z: p.z });
    if (i) assert(!g.canMove(p.x, p.z, p.y - 3 - 1));
  }
  assert(!g.canMove(g.cleft.x, g.cleft.z - 1, 5));
  assert(
    !g.lineOfSight(
      new THREE.Vector3(203, 8, 215),
      new THREE.Vector3(203, 8, 219),
      0,
      0,
    ),
  );
  g.cleft.root.traverse((m) => {
    if (m.geometry)
      for (const a of Object.values(m.geometry.attributes))
        for (const v of a.array) assert(Number.isFinite(v));
  });
});
test("complete cleft ascent uses both routes, catches gaps, rests, collects once, and descends", () => {
  const g = fixture();
  grip(g);
  for (const id of [1, 2, 3, 4, 33, 34, 35, 36, 7, 8, 9, 10, 11, 12])
    move(g, id);
  assert(g.stamina < 100);
  mount(g, 1);
  assert.equal(g.progress.cleft.terrace, 1);
  g.stamina = 100;
  grip(g, 1);
  for (let i = 13; i <= 22; i++) move(g, i);
  mount(g, 2);
  g.stamina = 100;
  grip(g, 2);
  for (let i = 23; i <= 32; i++) move(g, i);
  mount(g, 3);
  assert.equal(cleftObjective(g).step, 3);
  g.player.position.copy(g.cleft.recordPoint).add(new THREE.Vector3(-1, 0, 0));
  assert(cleftInteract(g));
  assert(g.progress.cleft.recovered);
  assert.equal(g.records, 1);
  cleftInteract(g);
  assert.equal(g.records, 1);
  g.player.position.copy(g.cleft.returnStart);
  assert(cleftInteract(g));
  assert.equal(g.wallGrip.kind, "rappel-reach");
  step(g, 465);
  assert.equal(g.wallGrip, null);
  assert.equal(g.cleft.anchor, 0);
  assert(g.grounded);
  assert(g.player.position.distanceTo(g.cleft.returnEnd) < 1e-6);
  assert(g.hits.length > 30);
  assert(g.hits.every((h) => h[3].isVector3));
});
test("missed catches and exhaustion recover on belay; pausing freezes motion and saves a supported terrace", () => {
  const g = fixture();
  grip(g);
  for (const id of [1, 2, 3, 4]) move(g, id);
  step(g, 10, 1, 0);
  assert.equal(g.wallGrip.kind, "hang");
  assert.equal(g.wallGrip.node, 4);
  move(g, 5, false);
  assert.equal(g.wallGrip.kind, "recover");
  step(g, 101);
  assert(g.grounded);
  assert.equal(g.cleft.anchor, 0);
  grip(g, 1);
  move(g, 13);
  g.stamina = 0.001;
  step(g);
  assert.equal(g.wallGrip.kind, "recover");
  const before = g.player.position.clone(),
    time = g.wallGrip.time;
  g.paused = true;
  step(g, 80);
  assert.deepEqual(g.player.position, before);
  assert.equal(g.wallGrip.time, time);
  const saved = cleftSavePosition(g);
  assert.equal(supportAt(g, saved.x, saved.z, saved.y).height, saved.y);
  g.save();
  assert.equal(g.progress.position.height, 6);
  g.paused = false;
  step(g, 101);
  g.player.position.set(g.progress.position.x, 3, g.progress.position.z);
  restoreTraversal(g);
  assert.equal(g.player.position.y, 9);
  assert.equal(g.wallGrip, null);
});
test("standing, attack exclusion, old-save recovery, and reset release all climbing state", () => {
  const g = fixture();
  grip(g);
  g.attack();
  assert.equal(g.attackCooldown, undefined);
  resetTraversal(g);
  assert.equal(g.wallGrip, null);
  assert.equal(g.cleft.anchor, 0);
  const arrival = safeArrival(g, new THREE.Vector3(203, 3, 216));
  assert(arrival);
  assert(g.canMove(arrival.x, arrival.z, arrival.y - 3));
  g.player.position.copy(cleftSafePoint(g, 2));
  g.grounded = true;
  step(g);
  assert.equal(g.cleft.anchor, 2);
  g.player.position.z += 6;
  g.grounded = false;
  g.player.position.y -= 2;
  step(g);
  assert.equal(g.wallGrip.kind, "recover");
});

test("every authored transfer clears the wall and terrace undersides; a newly obstructed grip recovers safely", () => {
  const g = fixture(),
    c = g.cleft;
  for (const e of CLEFT_EDGES)
    for (let i = 0; i <= 40; i++) {
      const t = i / 40,
        p = c.nodes[e.a].grip.clone().lerp(c.nodes[e.b].grip, t);
      p.y -= 1.9;
      if (e.leap) p.y += Math.sin(t * Math.PI) * 0.65;
      p.z += 0.55;
      assert(g.canMove(p.x, p.z, p.y - 3), `${e.a}/${e.b}/${t}`);
    }
  grip(g);
  g.cleft.solids.push({
    x: g.player.position.x,
    z: g.player.position.z,
    w: 1,
    d: 1,
    bottom: 3.5,
    top: 6,
  });
  step(g, 1, 0, 1);
  step(g, 2);
  assert.equal(g.wallGrip.kind, "recover");
  step(g, 102);
  assert(g.grounded);
});

test("the ruined rear galleries block piers while their ground-level passages remain open to players and cameras", () => {
  const g = fixture(),
    c = g.cleft;
  for (const x of [-15.2, -6, 4.6, 15.2]) {
    assert(!g.canMove(c.x + x, c.z - 9.1, 0));
    const from = new THREE.Vector3(c.x + x, c.y + 1.6, c.z - 15),
      to = new THREE.Vector3(c.x + x, c.y + 1.6, c.z - 4);
    assert(!g.lineOfSight(from, to, 0, 0));
    assert(g.cameraSurfaces.entry(from, to, 0) < 1);
  }
  for (const x of [-10.6, -0.7, 9.9]) {
    for (let z = -15; z <= -3.5; z += 0.25)
      assert(g.canMove(c.x + x, c.z + z, 0), `${x}, ${z}`);
    const from = new THREE.Vector3(c.x + x, c.y + 1.6, c.z - 15),
      to = new THREE.Vector3(c.x + x, c.y + 1.6, c.z - 3.5);
    assert(g.lineOfSight(from, to, 0, 0));
    assert.equal(g.cameraSurfaces.entry(from, to, 0), 1);
  }
  // A ray through the intact crown is stopped; the open space below is not
  // filled by an oversized gallery collision box.
  const from = new THREE.Vector3(c.x - 0.7, c.y + 24.4, c.z - 15),
    to = new THREE.Vector3(c.x - 0.7, c.y + 24.4, c.z - 3.5);
  assert(!g.lineOfSight(from, to, 0, 0));
  assert(g.cameraSurfaces.entry(from, to, 0) < 1);
  for (const x of [-6, 0, 6, 12])
    assert(!g.canMove(c.x + x, c.z + 0.4, 0), "base relief has physical depth");
});

test("quarry masonry seats its foundations on uneven ground and keeps the draft fracture visibly open", () => {
  const g = fixture((x, z) => 3 + (x - 203) * 0.035 + (z - 217) * 0.08),
    c = g.cleft,
    ray = new THREE.Raycaster();
  for (const [x, z, w, d] of [
    [-15.7, 0.15, 3.8, 5.4],
    [15.7, 0.15, 3.8, 5.4],
    [-15.2, -9.1, 2.7, 2.7],
    [15.2, -9.1, 2.7, 2.7],
    [-6, -9.1, 2.6, 2.7],
    [4.6, -9.1, 2.6, 2.7],
  ])
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const px = c.x + x + sx * w * 0.4,
          pz = c.z + z + sz * d * 0.4,
          floor = g.groundHeight(px, pz);
        ray.set(
          new THREE.Vector3(px, floor - 3, pz),
          new THREE.Vector3(0, 1, 0),
        );
        const hit = ray.intersectObject(c.masonry, true)[0];
        assert(
          hit && hit.point.y <= floor,
          "foundation underside must meet the ground",
        );
        assert(
          hit.point.y > floor - 1,
          "buried foundation remains fitted to the slope",
        );
      }
  const draft = c.sources[0];
  ray.set(
    new THREE.Vector3(draft.x, draft.y, draft.z + 0.5),
    new THREE.Vector3(0, 0, -1),
  );
  const hit = ray.intersectObject(c.masonry, true)[0];
  assert(
    hit && hit.distance > 0.85,
    "draft emerges at the exposed recessed core",
  );
  assert(
    g.lineOfSight(
      new THREE.Vector3(draft.x, draft.y, draft.z),
      new THREE.Vector3(draft.x, draft.y, draft.z + 3),
      0,
      0,
    ),
  );
  const materials = new Set();
  c.root.traverse((m) => {
    if (m.material) materials.add(m.material);
  });
  for (const name of ["Survey house sandstone", "Survey house exposed core"]) {
    const material = [...materials].find((m) => m.name === name);
    assert(material.vertexColors);
    assert.notEqual(material, g.stoneMat);
    assert.notEqual(material, g.darkMat);
  }
  assert.equal(
    g.stoneMat.vertexColors,
    false,
    "other architecture keeps its original material",
  );
});
