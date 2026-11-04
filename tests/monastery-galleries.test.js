import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildMonasteryArchitecture } from "../src/monastery-architecture.js";
import { monasteryGalleryPlan } from "../src/monastery-galleries.js";
import { monasteryGalleryRoofPlan } from "../src/monastery-wing-plan.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import { verifyMonasteryGalleryBearings } from "../scripts/inspect-monastery-galleries-browser.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new T.Group(),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      world,
      terrainProfile: profile,
      groundHeight: (x, z) => profile.surfaceHeight(x, z),
      obstacles: [],
      cameraSurfaces: new CameraSurfaces(world),
      player: new T.Group(),
      grounded: true,
      jumpY: 0,
      velocityY: 0,
      audio: { tone() {} },
    });
  buildMonasteryArchitecture(g);
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    world.traverse((m) => {
      m.geometry?.dispose();
      if (m.material) materials.add(m.material);
      m.customDepthMaterial?.dispose();
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      m.dispose();
    }
    textures.forEach((t) => t.dispose());
  });
  return g;
}

test("nine cloister compositions preserve every lodge connection and separate outer roof caps", () => {
  const forms = new Set();
  for (let index = 0; index < 9; index++)
    for (const side of [-1, 1]) {
      const p = monasteryGalleryPlan(index, side);
      forms.add(JSON.stringify(p.bays));
      assert.deepEqual(p.bays[0].roof, {
        ...monasteryGalleryRoofPlan(-17, -5),
        profile: "hip",
      });
      const first = p.bays[0].roof,
        middle = p.bays[1].roof,
        last = p.bays[2].roof;
      assert(
        Math.abs(
          middle.z - middle.width / 2 - (first.z + first.width / 2) - 0.12,
        ) < 1e-10,
      );
      assert(
        Math.abs(
          last.z - last.width / 2 - (middle.z + middle.width / 2) - 0.12,
        ) < 1e-10,
      );
    }
  assert(forms.size >= 9);
});

test("delivered cloister rafters bear on their roof battens after batching, with detached-frame controls", (t) => {
  const g = fixture(t),
    r = verifyMonasteryGalleryBearings(g);
  assert.deepEqual(r.accepted.failures, []);
  assert.equal(r.accepted.courts, 9);
  assert.equal(r.accepted.bays, 39);
  assert.equal(r.accepted.open, 2);
  assert(r.liftedFailures > 500);
  assert(g.cameraSurfaces.count < 700);
  t.diagnostic(JSON.stringify(r));
});

test("all thirteen lodge-to-cloister connections retain grounded controller crossings and save arrival", (t) => {
  const g = fixture(t);
  let frames = 0,
    connections = 0;
  for (const patch of g.monasteryPatches)
    for (const wing of patch.wings) {
      if (!wing.plan.gallery) continue;
      const c = wing.root.getWorldPosition(new T.Vector3()),
        x = c.x + wing.plan.gallery.x,
        start = c.z + 2,
        end = c.z + 6;
      g.player.position.set(x, c.y + wing.plan.floor, start);
      g.grounded = true;
      g.velocityY = 0;
      g.jumpY = g.player.position.y - g.groundHeight(x, start);
      assert(
        g.canMove(x, start, g.jumpY),
        `clear entry ${patch.root.name}/${wing.plan.side}`,
      );
      for (const target of [end, start]) {
        let arrived = false;
        for (let i = 0; i < 500; i++) {
          const dz = target - g.player.position.z;
          if (Math.abs(dz) < 0.025) {
            arrived = true;
            break;
          }
          advanceCharacter(
            g,
            { x: 0, z: Math.sign(dz) * Math.min(3, Math.abs(dz) * 60) },
            1 / 60,
          );
          frames++;
          const p = g.player.position;
          assert(g.grounded, `grounding ${patch.root.name}/${wing.plan.side}`);
          assert(
            g.canMove(p.x, p.z, p.y - g.groundHeight(p.x, p.z)),
            `body ${patch.root.name}/${wing.plan.side}`,
          );
        }
        assert(
          arrived,
          `stalled ${patch.root.name}/${wing.plan.side}: ${g.player.position.toArray()}`,
        );
      }
      const p = g.player.position,
        saved = { x: p.x, y: p.y, z: p.z };
      assert.deepEqual(safeArrival(g, saved), saved);
      connections++;
    }
  assert.equal(connections, 13);
  t.diagnostic(`${frames} controller frames, ${connections} return crossings`);
});

test("adjacent covered bays permit controller jumps across their drainage joints", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let crossings = 0,
    frames = 0;
  for (const patch of g.monasteryPatches)
    for (const side of patch.plan.galleries) {
      const bays = patch.galleries.records.filter((r) => r.side === side),
        c = patch.root.position,
        x = c.x + side * 17.2;
      for (let j = 0; j < 2; j++) {
        const a = bays[j],
          b = bays[j + 1];
        if (a.open || b.open) continue;
        const edge = c.z + a.roof.z + a.roof.width / 2,
          start = edge - 2,
          target = c.z + b.roof.z - b.roof.width / 2 + 1.7;
        ray.set(new T.Vector3(x, c.y + 40, start), new T.Vector3(0, -1, 0));
        const hit = ray.intersectObject(patch.root, true).find((h) => {
          const tag = h.object.geometry.attributes.monasteryGallery,
            ids = h.object.geometry.index;
          return (
            tag &&
            Math.floor(
              tag.getX(ids ? ids.getX(h.faceIndex * 3) : h.faceIndex * 3),
            ) === a.id
          );
        });
        assert(hit);
        g.player.position.set(x, hit.point.y, start);
        g.grounded = true;
        g.velocityY = 0;
        g.jumpBuffer = 0;
        g.airVelocity = null;
        g.jumpY = hit.point.y - g.groundHeight(x, start);
        let jumped = false,
          arrived = false;
        for (let i = 0; i < 500; i++) {
          const dz = target - g.player.position.z;
          if (Math.abs(dz) < 0.025) {
            arrived = true;
            break;
          }
          const jump = !jumped && g.player.position.z >= edge - 1.2;
          if (jump) jumped = true;
          advanceCharacter(g, { x: 0, z: Math.min(3, dz * 60) }, 1 / 60, jump);
          frames++;
          const p = g.player.position;
          assert(g.canMove(p.x, p.z, p.y - g.groundHeight(p.x, p.z)));
        }
        assert(
          arrived,
          `joint ${patch.root.name}/${side}/${j}: ${g.player.position.toArray()}`,
        );
        for (let i = 0; i < 120; i++)
          advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
        assert(g.grounded);
        assert(g.player.position.y > g.groundHeight(x, target) + 1);
        crossings++;
      }
    }
  assert.equal(crossings, 23);
  t.diagnostic(
    `${crossings} drainage joints, ${frames} moving controller updates`,
  );
});

test("older outer-gallery saves restore to legal supported positions without changing progress", (t) => {
  const g = fixture(t),
    material = new T.MeshBasicMaterial(),
    ray = new T.Raycaster();
  let checked = 0,
    relocated = 0;
  g.progress = {
    stage: 3,
    field: ["frost-trial"],
    found: ["journal"],
    health: 87,
  };
  const progress = JSON.stringify(g.progress);
  try {
    for (const patch of g.monasteryPatches)
      for (const side of patch.plan.galleries)
        for (const [za, zb] of [
          [-5, 7],
          [7, 18],
        ]) {
          const old = monasteryGalleryRoofPlan(za, zb),
            c = patch.root.position,
            meshes = [];
          try {
            for (const snow of [false, true]) {
              const m = new T.Mesh(
                monasteryRoofGeometry({
                  width: old.width,
                  depth: old.depth,
                  rise: old.rise,
                  seed: g.monasteryPatches.indexOf(patch),
                  snow,
                }),
                material,
              );
              m.position.set(c.x + side * 19, c.y + old.y, c.z + old.z);
              m.rotation.y = old.angle;
              m.updateMatrixWorld(true);
              meshes.push(m);
            }
            const x = c.x + side * 19,
              z = c.z + old.z;
            ray.set(new T.Vector3(x, c.y + 35, z), new T.Vector3(0, -1, 0));
            const hit = ray.intersectObjects(meshes)[0];
            assert(hit);
            const saved = { x, y: hit.point.y, z },
              arrival = safeArrival(g, saved);
            assert(arrival);
            assert(
              g.canMove(
                arrival.x,
                arrival.z,
                arrival.y - g.groundHeight(arrival.x, arrival.z),
              ),
            );
            if (Math.hypot(arrival.x - x, arrival.z - z) > 0.001) relocated++;
            g.player.position.set(arrival.x, arrival.y, arrival.z);
            g.grounded = true;
            g.velocityY = 0;
            g.jumpBuffer = 0;
            g.airVelocity = null;
            for (let i = 0; i < 180; i++)
              advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
            const p = g.player.position;
            assert(g.grounded);
            assert(g.canMove(p.x, p.z, p.y - g.groundHeight(p.x, p.z)));
            assert.equal(JSON.stringify(g.progress), progress);
            checked++;
          } finally {
            meshes.forEach((m) => m.geometry.dispose());
          }
        }
  } finally {
    material.dispose();
  }
  assert.equal(checked, 26);
  t.diagnostic(
    `${checked} older rooftop saves, ${relocated} nearby relocations, progress unchanged`,
  );
});
