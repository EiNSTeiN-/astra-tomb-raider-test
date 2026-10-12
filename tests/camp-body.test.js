import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildCamp } from "../src/camps.js";
import { campMaterials } from "../src/camp-materials.js";
import { animateExplorer } from "../src/explorer.js";
import { advanceCharacter, safeArrival } from "../src/character-motion.js";
import {
  closedMeshReader,
  inspectExplorerSolids,
} from "../scripts/inspect-explorer-solids-browser.js";

async function actor() {
  const io = new NodeIO(),
    doc = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(doc),
    { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  const mixer = new THREE.AnimationMixer(scene),
    actions = {};
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  return {
    model: scene,
    mixer,
    actions,
    state: "Idle",
    weapon: { group: new THREE.Group() },
  };
}
function dispose(root) {
  const resources = new Set();
  root.traverse((m) => {
    if (m.geometry) resources.add(m.geometry);
    if (m.skeleton) resources.add(m.skeleton);
    for (const material of m.material ? [m.material].flat() : []) {
      resources.add(material);
      for (const v of Object.values(material))
        if (v?.isTexture) resources.add(v);
    }
  });
  for (const r of resources) r.dispose();
}
function campGame(level, rig) {
  const map = createMap(level),
    g = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      rig,
      terrainProfile: createTerrainProfile(map, level),
      world: new THREE.Group(),
      obstacles: [],
      traversalCourses: [],
      flames: [],
      items: [],
      player: new THREE.Group(),
      avatar: new THREE.Group(),
      grounded: true,
      elapsed: 0,
      actualMoveSpeed: 0,
      moveVelocity: { x: 0, z: 0 },
      jumpY: 0,
      velocityY: 0,
      audio: { tone() {} },
    });
  g.player.add(g.avatar);
  g.avatar.add(rig.model);
  g.world.add(g.player);
  g.campMaterials = campMaterials(
    level.biome,
    (_name, color) => new THREE.MeshStandardMaterial({ color }),
  );
  const feature = map.features.find((f) => f.id === "camp-0"),
    group = new THREE.Group();
  group.position.set(
    feature.x * 7,
    g.groundHeight(feature.x * 7, feature.z * 7),
    feature.z * 7,
  );
  g.world.add(group);
  const camp = buildCamp(g, feature, group);
  return { g, camp };
}
function pose(g, crouch, heading) {
  g.rig.mixer.stopAllAction();
  g.rig.actions.Idle.reset().play();
  g.rig.state = "Idle";
  g.rig.grounding = undefined;
  g.rig.crouchBlend = 0;
  g.crouching = crouch;
  g.avatar.rotation.set(0, heading, 0);
  for (let i = 0; i < 60; i++) animateExplorer(g, 1 / 60, false, false);
}
function flameContacts(g, fire) {
  const centre = fire.getWorldPosition(new THREE.Vector3()),
    p = new THREE.Vector3(),
    halfHeight = fire.geometry.parameters.height / 2,
    radius = fire.geometry.parameters.width / 2;
  let contacts = 0;
  g.avatar.traverse((m) => {
    if (!m.isMesh) return;
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      m.getVertexPosition(i, p).applyMatrix4(m.matrixWorld);
      if (
        p.y > centre.y - halfHeight &&
        p.y < centre.y + halfHeight &&
        Math.hypot(p.x - centre.x, p.z - centre.z) < radius
      )
        contacts++;
    }
  });
  return contacts;
}
function lowestSole(g) {
  g.avatar.updateWorldMatrix(true, false);
  g.rig.model.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  let lowest = Infinity;
  for (const foot of g.rig.grounding?.feet || [])
    for (const index of foot.clearanceIndices || foot.indices) {
      foot.shoe.getVertexPosition(index, p).applyMatrix4(foot.shoe.matrixWorld);
      lowest = Math.min(lowest, p.y - g.player.position.y);
    }
  return lowest;
}

test("the delivered standing and crouching explorer clears camp furniture and flames at radial walking stops in eight chapters", async (t) => {
  const rig = await actor();
  let poses = 0,
    vertices = 0,
    embedded = 0,
    flame = 0;
  try {
    for (const level of LEVELS) {
      const { g, camp } = campGame(level, rig),
        meshes = [];
      for (const root of [camp.solid, camp.fine])
        root.traverse((m) => {
          if (m.isMesh) meshes.push(m);
        });
      g.world.updateMatrixWorld(true);
      const reader = closedMeshReader(meshes);
      for (const o of [camp.hearthObstacle, camp.obstacle, camp.kettleObstacle])
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          const dx = Math.sin(angle),
            dz = Math.cos(angle),
            x = o.x + dx * 3.8,
            z = o.z + dz * 3.8;
          g.player.position.set(x, g.groundHeight(x, z), z);
          g.grounded = true;
          g.velocityY = g.jumpY = 0;
          assert(g.canMove(x, z, 0), `${level.id}: blocked approach ${x},${z}`);
          for (let i = 0; i < 90; i++)
            advanceCharacter(g, { x: -dx * 6, z: -dz * 6 }, 1 / 60);
          assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
          for (const crouch of [false, true]) {
            pose(g, crouch, angle + Math.PI);
            const q = inspectExplorerSolids(g, reader),
              f = flameContacts(g, camp.fire);
            poses++;
            vertices += q.samples;
            embedded += q.embedded;
            flame += f;
            assert.equal(q.invalid, 0);
            assert.equal(
              q.embedded,
              0,
              JSON.stringify({
                level: level.id,
                kind:
                  o === camp.hearthObstacle
                    ? "hearth"
                    : o === camp.obstacle
                      ? "chest"
                      : "kettle",
                angle,
                crouch,
                ...q,
              }),
            );
            assert.equal(f, 0, `${level.id}: delivered body enters flame`);
          }
        }
      g.avatar.remove(rig.model);
      dispose(g.world);
    }
  } finally {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.model);
    dispose(rig.model);
  }
  t.diagnostic(JSON.stringify({ poses, vertices, embedded, flame }));
});

test("delivered jumping poses clear the recorded sky and eclipse hearths through descent and return to ground", async (t) => {
  const rig = await actor();
  let snapshots = 0,
    vertices = 0,
    maxCorrection = 0;
  try {
    for (const chapter of [5, 7]) {
      const { g, camp } = campGame(LEVELS[chapter], rig),
        meshes = [];
      try {
        for (const root of [camp.solid, camp.fine])
          root.traverse((m) => {
            if (m.isMesh) meshes.push(m);
          });
        g.world.updateMatrixWorld(true);
        const reader = closedMeshReader(meshes);
        for (const o of [
          camp.hearthObstacle,
          camp.obstacle,
          camp.kettleObstacle,
        ]) {
          const z = o.z + 3.8,
            x = o.x;
          g.player.position.set(x, g.groundHeight(x, z), z);
          g.grounded = true;
          g.velocityY = g.jumpY = 0;
          pose(g, false, Math.PI);
          for (let i = 0; i < 120; i++) {
            const before = g.player.position.clone();
            advanceCharacter(g, { x: 0, z: -6 }, 1 / 60, i === 0);
            const shift = Math.hypot(
              g.player.position.x - before.x,
              g.player.position.z - before.z,
            );
            maxCorrection = Math.max(maxCorrection, shift);
            animateExplorer(g, 1 / 60, false, false);
            if (!g.grounded)
              assert(
                lowestSole(g) > 0,
                "The airborne sole extends below its physical feet",
              );
            if (i % 10 !== 0 && shift < 0.15) continue;
            const q = inspectExplorerSolids(g, reader),
              f = flameContacts(g, camp.fire);
            snapshots++;
            vertices += q.samples;
            assert.equal(q.invalid, 0);
            assert.equal(q.embedded, 0, JSON.stringify({ chapter, i, ...q }));
            assert.equal(
              f,
              0,
              JSON.stringify({
                chapter,
                i,
                root: g.player.position.toArray(),
                flame: f,
              }),
            );
          }
          assert(
            g.grounded,
            JSON.stringify({
              chapter,
              object:
                o === camp.hearthObstacle
                  ? "hearth"
                  : o === camp.obstacle
                    ? "chest"
                    : "kettle",
              root: g.player.position.toArray(),
              escape: g.campEscape && {
                x: g.campEscape.x,
                z: g.campEscape.z,
                remaining: g.campEscape.remaining,
              },
              velocityY: g.velocityY,
            }),
          );
          assert.equal(g.jumpY, 0);
          assert(!g.campEscape);
          assert(g.canMove(g.player.position.x, g.player.position.z, 0));
        }
      } finally {
        g.avatar.remove(rig.model);
        dispose(g.world);
      }
    }
  } finally {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.model);
    dispose(rig.model);
  }
  t.diagnostic(JSON.stringify({ snapshots, vertices, maxCorrection }));
  assert(
    maxCorrection <= 0.105,
    `A camp contact snaps ${maxCorrection} metres horizontally`,
  );
});

test("occupied older camp positions recover to clear delivered poses without changing chosen look in eight chapters", async (t) => {
  const rig = await actor();
  let poses = 0,
    vertices = 0;
  try {
    for (const level of LEVELS) {
      const { g, camp } = campGame(level, rig),
        meshes = [];
      try {
        for (const root of [camp.solid, camp.fine])
          root.traverse((m) => {
            if (m.isMesh) meshes.push(m);
          });
        g.world.updateMatrixWorld(true);
        const reader = closedMeshReader(meshes);
        g.yaw = 0.37;
        g.pitch = -0.18;
        for (const o of [
          camp.hearthObstacle,
          camp.obstacle,
          camp.kettleObstacle,
        ]) {
          const requested = { x: o.x, y: g.groundHeight(o.x, o.z), z: o.z },
            recovered = safeArrival(g, requested);
          assert(
            recovered &&
              Math.hypot(recovered.x - requested.x, recovered.z - requested.z) <
                4,
          );
          g.player.position.set(recovered.x, recovered.y, recovered.z);
          g.grounded = true;
          g.jumpY = 0;
          for (const crouch of [false, true]) {
            pose(g, crouch, Math.PI);
            const q = inspectExplorerSolids(g, reader);
            poses++;
            vertices += q.samples;
            assert.equal(
              q.embedded,
              0,
              JSON.stringify({ level: level.id, crouch, ...q }),
            );
            assert.equal(q.invalid, 0);
            assert.equal(flameContacts(g, camp.fire), 0);
            assert.equal(g.yaw, 0.37);
            assert.equal(g.pitch, -0.18);
          }
        }
      } finally {
        g.avatar.remove(rig.model);
        dispose(g.world);
      }
    }
  } finally {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.model);
    dispose(rig.model);
  }
  t.diagnostic(JSON.stringify({ poses, vertices }));
});

test("running approaches and their stopped animation fades clear the recorded sky camp boundaries", async (t) => {
  const rig = await actor(),
    { g, camp } = campGame(LEVELS[5], rig),
    meshes = [];
  let snapshots = 0,
    vertices = 0;
  try {
    for (const root of [camp.solid, camp.fine])
      root.traverse((m) => {
        if (m.isMesh) meshes.push(m);
      });
    g.world.updateMatrixWorld(true);
    const reader = closedMeshReader(meshes);
    for (const [object, o] of [
      camp.hearthObstacle,
      camp.obstacle,
      camp.kettleObstacle,
    ].entries())
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const dx = Math.sin(angle),
          dz = Math.cos(angle),
          x = o.x + dx * 3.8,
          z = o.z + dz * 3.8;
        g.player.position.set(x, g.groundHeight(x, z), z);
        g.grounded = true;
        g.velocityY = g.jumpY = 0;
        g.campEscape = null;
        pose(g, false, angle + Math.PI);
        g.moveVelocity = { x: -dx * 6, z: -dz * 6 };
        for (let i = 0; i < 70; i++) {
          const before = g.player.position.clone();
          advanceCharacter(g, g.moveVelocity, 1 / 60);
          g.actualMoveSpeed =
            Math.hypot(
              g.player.position.x - before.x,
              g.player.position.z - before.z,
            ) * 60;
          g.elapsed += 1 / 60;
          animateExplorer(g, 1 / 60, g.actualMoveSpeed > 0.12, true);
          if (
            i % 8 ||
            Math.hypot(g.player.position.x - o.x, g.player.position.z - o.z) >
              2.8
          )
            continue;
          const q = inspectExplorerSolids(g, reader);
          snapshots++;
          vertices += q.samples;
          assert.equal(q.invalid, 0);
          assert.equal(
            q.embedded,
            0,
            JSON.stringify({ object, angle, i, ...q }),
          );
          assert.equal(flameContacts(g, camp.fire), 0);
        }
      }
  } finally {
    g.avatar.remove(rig.model);
    dispose(g.world);
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.model);
    dispose(rig.model);
  }
  t.diagnostic(JSON.stringify({ snapshots, vertices }));
});
