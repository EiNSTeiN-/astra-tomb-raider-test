import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { safeArrival } from "../src/character-motion.js";
import {
  buildJungleShrine,
  lotusBowlGeometry,
  updateJungleShrine,
} from "../src/jungle-shrines.js";
import { torchFireSource } from "../src/torch.js";

function fixture() {
  const world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level: LEVELS[0],
    map: createMap(LEVELS[0]),
    world,
    obstacles: [],
    flames: [],
    items: [],
    player: new THREE.Group(),
    groundHeight: () => 0,
    walkable: () => true,
    stoneMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    cameraSurfaces: new CameraSurfaces(world),
    jumpY: 0,
    elapsed: 3,
    progress: { stage: 0, field: [] },
  });
  for (const feature of game.map.features.filter(
    (f) => f.type === "field" && f.kind === "brazier",
  )) {
    const f = { ...feature },
      group = new THREE.Group();
    group.position.set(f.x * 7, 0, f.z * 7);
    world.add(group);
    f.group = group;
    assert(buildJungleShrine(game, f, group));
    game.items.push(f);
  }
  game.cameraSurfaces.rebuild();
  return game;
}

test("relay bowls have an open inner floor below their rolled lip and finite two-sided surface normals", () => {
  const geometry = lotusBowlGeometry(),
    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
  mesh.updateMatrixWorld();
  const cast = (r) =>
    new THREE.Raycaster(
      new THREE.Vector3(r, 3, 0),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh)[0];
  assert(
    cast(0.2).point.y < 1.21,
    "centre must reveal the basin floor, not a cap",
  );
  assert(cast(0.71).point.y > 1.49, "rolled lip stands above the interior");
  assert(geometry.attributes.normal.array.every(Number.isFinite));
  assert(geometry.attributes.position.array.every(Number.isFinite));
  geometry.dispose();
  mesh.material.dispose();
});

test("five physical shrines block their shafts, retain four relighting approaches, and recover old saves inside the pedestal", () => {
  const game = fixture();
  assert.equal(game.items.length, 5);
  assert.equal(new Set(game.items.map((f) => f.shrine.index)).size, 5);
  for (const f of game.items) {
    const x = f.x * 7,
      z = f.z * 7;
    for (const o of game.obstacles.filter((o) => o.shrine === f.id))
      assert.equal(game.canMove(o.x, o.z, 0), false, `${f.id} solid shaft`);
    game.progress.stage = f.stage;
    game.progress.field = [f.id];
    for (const [dx, dz] of [
      [2.2, 0],
      [-2.2, 0],
      [0, 2.2],
      [0, -2.2],
    ]) {
      game.player.position.set(x + dx, 0, z + dz);
      assert(game.canMove(x + dx, z + dz, 0), `${f.id} approach ${dx}/${dz}`);
      assert.equal(
        torchFireSource(game)?.id,
        f.id,
        `${f.id} fire reachable ${dx}/${dz}`,
      );
    }
    const saved = { x, y: 0, z },
      arrival = safeArrival(game, saved);
    assert(
      game.canMove(
        arrival.x,
        arrival.z,
        arrival.y - game.groundHeight(arrival.x, arrival.z),
      ),
      `${f.id} recovered save`,
    );
    assert(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x + 2.7, 1.5, z + 2),
        new THREE.Vector3(x + 2.7, 1.5, z - 4),
      ) < 1,
      `${f.id} camera stops at the column`,
    );
    assert.equal(
      game.cameraSurfaces.entry(
        new THREE.Vector3(x, 2, z + 2),
        new THREE.Vector3(x, 2, z - 4),
      ),
      1,
      `${f.id} camera passage stays open above the bowl`,
    );
    updateJungleShrine(game, f, true);
    assert(f.shrine.coals.emissiveIntensity > 0);
    assert(f.shrine.sparks.visible);
    const entries = [...game.progress.field];
    updateJungleShrine(game, f, false);
    assert.equal(f.shrine.coals.emissiveIntensity, 0);
    assert.equal(f.shrine.sparks.visible, false);
    assert.deepEqual(
      game.progress.field,
      entries,
      "appearance never rewrites saved progress",
    );
    assert.equal(
      f.fire.getWorldPosition(new THREE.Vector3()).y,
      1.95,
      "source remains at existing flame height",
    );
  }
});
