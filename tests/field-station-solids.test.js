import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Adventure } from "../src/game.js";
import {
  buildFieldStation,
  updateFieldWorld,
  finishFieldTask,
} from "../src/field-world.js";
import {
  advanceCharacter,
  safeArrival,
  supportAt,
} from "../src/character-motion.js";
import {
  stationSolid,
  stationEntry,
  stationMantleEnd,
  stationBlocked,
} from "../src/field-station-solids.js";
import {
  cableApproachClear,
  traversalInteract,
  restoreTraversal,
  trackTraversalSupport,
} from "../src/traversal.js";
import { shotCover } from "../src/aiming.js";
import { updateProjectiles } from "../src/combat.js";
import { LEVELS } from "../src/campaign.js";

function fixture(kind = "valve", y = 0, progress = { stage: 0, field: [] }) {
  const g = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[4],
    map: {},
    world: new THREE.Group(),
    obstacles: [],
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    player: new THREE.Group(),
    groundHeight: () => 0,
    walkable: () => true,
    progress,
    jumpY: y,
    velocityY: 0,
    grounded: true,
    audio: { tone() {} },
    elapsed: 0,
    fieldGates: [],
    flames: [],
    cb: { toast() {} },
    keys: new Set(),
    items: [],
  });
  const f = {
    id: "field-0-2",
    type: "field",
    marker: new THREE.Group(),
    stage: 0,
    step: 2,
    kind,
    x: 0,
    z: 0,
    group: new THREE.Group(),
    yOffset: y,
  };
  f.group.position.y = y;
  g.world.add(f.group);
  g.items.push(f);
  buildFieldStation(g, f, f.group);
  return { g, f };
}

test("generic stations stop sustained walking at the pedestal and leave the front control reachable", () => {
  for (const kind of [
    "valve",
    "winch",
    "brazier",
    "lift",
    "delivery",
    "resonance",
    "survey",
  ]) {
    const { g, f } = fixture(kind);
    g.player.position.set(0, 0, 2.2);
    assert(g.canMove(0, 2.2, 0), kind);
    for (let i = 0; i < 180; i++) advanceCharacter(g, { x: 0, z: -6 }, 1 / 60);
    assert(g.player.position.z >= 1.49 && g.player.position.z <= 1.61, kind);
    assert.equal(g.player.position.y, 0, kind);
    assert(g.canMove(g.player.position.x, g.player.position.z, 0), kind);
    const before = structuredClone(g.progress),
      arrival = safeArrival(g, { x: 0, y: 0, z: 0 });
    assert(arrival && Math.hypot(arrival.x, arrival.z) <= 2.25, kind);
    assert(g.canMove(arrival.x, arrival.z, arrival.y), kind);
    assert.deepEqual(g.progress, before);
    assert.equal(g.canMove(2.7, -1.5, 0), false, "frame column");
    assert.equal(g.canMove(0, -1.5, 1.9), false, "head meets overhead beam");
    assert.equal(g.canMove(0, -2, 0), true, "passage below beam");
    assert.equal(f.stationSolids[0].bounds.max.y, 0.7);
  }
});

test("empty sockets and collected components have their saved collision state before the first frame", () => {
  const { g, f } = fixture("delivery");
  assert.equal(f.core.visible, false);
  g.progress.position = { x: 0, z: 0, height: 0.81 };
  g.traversalCourses = [];
  restoreTraversal(g);
  assert.deepEqual(g.player.position.toArray(), [0, 0.81, 0]);
  const collected = fixture("lift", 0, { stage: 0, field: ["field-0-2"] });
  assert.equal(collected.f.core.visible, false);
  assert(collected.g.canMove(0, 0, 0.81));
  const installed = fixture("delivery", 0, { stage: 0, field: ["field-0-2"] });
  assert(installed.f.core.visible);
  assert.equal(installed.g.canMove(0, 0, 0.81), false);
});

test("delivery from an occupied socket makes a clear supported space before saving, while fitted lintels meet their capitals", () => {
  const { g, f } = fixture("delivery");
  g.progress.field = ["field-0-0", "field-0-1"];
  g.player.position.set(0, 0.81, 0);
  g.jumpY = 0.81;
  let saved;
  g.save = () =>
    (saved = {
      position: g.player.position.clone(),
      field: [...g.progress.field],
    });
  assert(finishFieldTask(g, f));
  assert(f.core.visible);
  assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
  assert.equal(
    supportAt(g, g.player.position.x, g.player.position.z, g.player.position.y)
      .height,
    g.player.position.y,
  );
  assert.deepEqual(saved.field, ["field-0-0", "field-0-1", "field-0-2"]);
  assert(saved.position.equals(g.player.position));
  const lintel = f.stationSolids.at(-1);
  for (const cap of f.stationSolids.filter(
    (s) => Math.abs(s.bounds.max.y - 3.55) < 1e-8,
  ))
    assert(lintel.bounds.min.y <= cap.bounds.max.y);
});

test("a furnished summit retains a clear mantle arc from all four course orientations", () => {
  for (let turn = 0; turn < 4; turn++) {
    const { g } = fixture("survey", 8.4),
      platform = { x: 0, z: 0, w: 2.5, d: 2.5, h: 8.4, climbable: true };
    g.obstacles.push(platform);
    const angle = (turn * Math.PI) / 2,
      rotate = (p) => p.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
      start = rotate(new THREE.Vector3(3, 5.6, -3.95)),
      requested = rotate(new THREE.Vector3(1.5, 8.4, -1.8)),
      end = stationMantleEnd(g, platform, start, requested);
    assert(end, `orientation ${turn}`);
    assert(g.canMove(end.x, end.z, end.y));
    for (let i = 0; i <= 200; i++) {
      const t = i / 200,
        p = start.clone().lerp(end, t * t * (3 - 2 * t));
      p.y += Math.sin(t * Math.PI) * 0.65;
      assert(
        !g.obstacles.some(
          (o) => o.fieldStation && stationBlocked(o, p.x, p.y, p.z),
        ),
        `arc ${turn}/${i}`,
      );
    }
  }
});

test("checkpoint recovery avoids the summit control, retains a clear saved position, and protects cable boarding", () => {
  const { g, f } = fixture("valve", 8.4),
    ledge = { x: 0, z: 0, y: 8.4, w: 2.5, d: 2.5 };
  g.obstacles.push({
    x: 0,
    z: 0,
    w: 2.5,
    d: 2.5,
    h: 8.4,
    climbable: true,
    courseId: f.id,
    ledge: 4,
  });
  const c = {
    id: f.id,
    stage: 0,
    ledges: [null, null, null, null, ledge],
    launch: new THREE.Vector3(0.9, 8.4, 2.65),
  };
  g.traversalCourses = [c];
  g.progress.traversal = { id: f.id, ledge: 4 };
  g.progress.position = { x: 0, z: 0, height: 8.4 };
  restoreTraversal(g);
  assert.equal(g.player.position.y, 8.4);
  assert(g.canMove(g.player.position.x, g.player.position.z, 8.4));
  g.progress.position = { x: 0, z: 2.2, height: 8.4 };
  restoreTraversal(g);
  assert.deepEqual(g.player.position.toArray(), [0, 8.4, 2.2]);
  g.player.position.set(4, 0, 4);
  g.motionLanding = { drop: 8.4 };
  g.grounded = true;
  trackTraversalSupport(g);
  assert.equal(g.player.position.y, 8.4);
  assert(g.canMove(g.player.position.x, g.player.position.z, 8.4));
  g.progress.field = [f.id];
  g.player.position.set(0, 8.4, -2.2);
  assert.equal(cableApproachClear(g, c), false);
  assert(traversalInteract(g));
  assert(!g.zipRide);
  g.player.position.set(0, 8.4, 2.2);
  assert(cableApproachClear(g, c));
  assert(traversalInteract(g));
  assert(g.zipRide);
});

test("elevated solids preserve an older arrival on its earned landing and leave the lower floor open", () => {
  const { g, f } = fixture("valve", 8.4);
  g.obstacles.push({ x: 0, z: 0, w: 2.5, d: 2.5, h: 8.4, climbable: true });
  const arrival = safeArrival(g, { x: 0, y: 8.4, z: 0 });
  assert.equal(arrival.y, 8.4);
  assert(Math.abs(arrival.x) < 2.5 && Math.abs(arrival.z) < 2.5);
  assert(g.canMove(arrival.x, arrival.z, 8.4));
  assert.deepEqual(safeArrival(g, arrival), arrival);
  g.obstacles = g.obstacles.filter((o) => o.fieldStation);
  assert(g.canMove(0, 0, 0));
  assert(
    g.lineOfSight(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -3)),
  );
  assert.equal(
    shotCover(g, new THREE.Vector3(0, 2, 3), new THREE.Vector3(0, 2, -3)),
    1,
  );
  assert.equal(supportAt(g, 0, 0, 0).height, 0);
  assert.equal(f.stationSolids[0].bounds.min.y, 8.4);
});

test("round bases have round ray bounds, hide no empty corners, and support a free cap", () => {
  const { g } = fixture("delivery");
  const base = g.obstacles[0],
    a = new THREE.Vector3(1.05, 0.3, 2),
    b = new THREE.Vector3(1.05, 0.3, 0.8);
  assert.equal(stationEntry(base, a, b), null);
  assert(
    stationEntry(
      base,
      new THREE.Vector3(0, 0.3, 2),
      new THREE.Vector3(0, 0.3, -2),
    ) < 0.25,
  );
  assert.equal(
    stationEntry(base, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0)),
    null,
  );
  updateFieldWorld(g, 0);
  assert.equal(g.items[0].core.visible, false);
  assert.equal(supportAt(g, 0, 0, 1).height, 0.81);
  g.player.position.set(0, 1.3, 0);
  g.grounded = false;
  g.velocityY = -1;
  for (let i = 0; i < 60; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
  assert.equal(g.player.position.y, 0.81);
  assert(g.canMove(0, 0, 0.81));
  g.progress.field.push("field-0-2");
  updateFieldWorld(g, 0);
  assert.equal(g.canMove(0, 0, 0.81), false, "installed component is solid");
});

test("sentry bolts use their swept physical path, including thin controls and open overhead space", () => {
  for (const [y, expected] of [
    [0.4, 0],
    [1.1, 1],
    [3.4, 1],
    [4.1, 0],
  ]) {
    const { g, f } = fixture("delivery");
    g.obstacles = [];
    stationSolid(g, f, f.group, [2, 0.8, 0.04], [0, 0.4, 0]);
    stationSolid(g, f, f.group, [2, 0.4, 0.04], [0, 4.1, 0]);
    g.player.position.set(20, 0, 20);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, y, 2);
    g.world.add(mesh);
    g.projectiles = [
      { mesh, direction: new THREE.Vector3(0, 0, -1), speed: 20, life: 2 },
    ];
    updateProjectiles(g, 0.2);
    assert.equal(g.projectiles.length, expected, `height ${y}`);
  }
});

test("falling onto controls or beside their caps settles outside the solid body volume", () => {
  for (const kind of ["valve", "delivery", "survey", "brazier"])
    for (const [x, z] of [
      [0, 0],
      [0, 0.8],
      [1, 0],
      [1.3, 0],
    ]) {
      const { g } = fixture(kind, 0, { stage: 0, field: ["field-0-2"] });
      g.player.position.set(x, 4.5, z);
      g.grounded = false;
      for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
      assert(g.grounded, `${kind}/${x}/${z}`);
      assert(
        g.canMove(x, z, g.player.position.y),
        `${kind}/${x}/${z}: clear landing`,
      );
      for (let i = 0; i < 60; i++) advanceCharacter(g, { x: 6, z: 0 }, 1 / 60);
      assert(g.player.position.x > x + 1, `${kind}: can leave the control`);
    }
});
