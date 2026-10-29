import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { animateExplorer } from "../src/explorer.js";
import { stationSolid, stationBlocked } from "../src/field-station-solids.js";
import {
  canSwimAt,
  recoverSwimmer,
  turnSwimmer,
} from "../src/swimmer-clearance.js";

async function swimmer() {
  const io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document);
  const { scene, animations } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const player = new THREE.Group(),
    avatar = new THREE.Group(),
    mixer = new THREE.AnimationMixer(scene),
    actions = {};
  player.add(avatar);
  avatar.add(scene);
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  const water = new THREE.Mesh();
  Object.assign(water.userData, { kind: "water", width: 30, length: 30 });
  const game = {
    player,
    avatar,
    level: { biome: "water" },
    elapsed: 0,
    swimming: true,
    diving: true,
    grounded: false,
    groundHeight: () => -8,
    obstacles: [],
    waterMeshes: [water],
    rig: {
      model: scene,
      mixer,
      actions,
      state: "Idle",
      weapon: { group: new THREE.Group() },
    },
  };
  const pillar = stationSolid(
    game,
    { id: "pier" },
    new THREE.Group(),
    [2, 8, 2],
    [0, -2, 0],
    { bodyPadding: 0.4 },
  );
  game.canMove = (x, z, height, clearance) =>
    !stationBlocked(pillar, x, height - 8, z, clearance);
  return { game, pillar };
}

function penetration(game, box) {
  game.player.updateMatrixWorld(true);
  let minY = Infinity,
    deepest = 0,
    vertices = 0,
    invalid = 0;
  const point = new THREE.Vector3();
  game.avatar.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      vertices++;
      minY = Math.min(minY, point.y);
      if (!point.toArray().every(Number.isFinite)) {
        invalid++;
        continue;
      }
      if (
        point.x > box.min.x &&
        point.x < box.max.x &&
        point.y > box.min.y &&
        point.y < box.max.y &&
        point.z > box.min.z &&
        point.z < box.max.z
      )
        deepest = Math.max(
          deepest,
          Math.min(
            point.x - box.min.x,
            box.max.x - point.x,
            point.y - box.min.y,
            box.max.y - point.y,
            point.z - box.min.z,
            box.max.z - point.z,
          ),
        );
    }
  });
  return { deepest, vertices, invalid, minY };
}

test("the delivered swimmer tucks and recovers beside a pier without embedding head, hands or equipment", async () => {
  const { game: g, pillar } = await swimmer();
  // Positive control: the old centre check accepts a pose whose actual head
  // and stroke enter this physical box. Do not use the movement probes to
  // measure the rendered mesh.
  g.player.position.set(0, -3, 1.5);
  g.avatar.rotation.y = Math.PI;
  const canMove = g.canMove;
  g.canMove = () => true;
  animateExplorer(g, 0, false, false);
  assert(penetration(g, pillar.bounds).deepest > 0.1);
  g.canMove = canMove;
  let read = 0;
  for (const distance of [1.5, 1.8, 2, 2.3, 3])
    for (let heading = 0; heading < 8; heading++) {
      const angle = (heading * Math.PI) / 4;
      g.avatar.rotation.y = angle;
      g.rig.swimCompact = 0;
      g.player.position.set(
        -Math.sin(angle) * distance,
        -3,
        -Math.cos(angle) * distance,
      );
      // Diagonal starts need the same centre margin as the delivered controller.
      if (!g.canMove(g.player.position.x, g.player.position.z, 5, 0.8))
        g.player.position.multiply(new THREE.Vector3(1.4, 1, 1.4));
      recoverSwimmer(g);
      assert(canSwimAt(g, ...g.player.position.toArray()));
      for (let phase = 0; phase < 16; phase++) {
        g.elapsed = (phase * Math.PI) / 32;
        animateExplorer(g, 1 / 60, false, false);
        const r = penetration(g, pillar.bounds);
        assert.equal(r.invalid, 0);
        assert(r.deepest < 0.005, JSON.stringify({ heading, phase, ...r }));
        read += r.vertices;
      }
      turnSwimmer(g, { x: Math.cos(angle), z: -Math.sin(angle) }, 0.05);
      animateExplorer(g, 1 / 60, false, false);
      assert(penetration(g, pillar.bounds).deepest < 0.005);
    }
  assert(read > 25_000_000);
  // A stored camera orbit can face the body into a pier even though another
  // heading fits the saved root. Arrival should retain that saved position.
  g.player.position.set(0, -3, 1.5);
  g.avatar.rotation.y = Math.PI;
  g.rig.swimCompact = 0;
  assert(!canSwimAt(g, ...g.player.position.toArray()));
  const savedPosition = g.player.position.clone();
  assert.equal(recoverSwimmer(g, true), false);
  assert(g.player.position.equals(savedPosition));
  assert(canSwimAt(g, ...g.player.position.toArray()));
  animateExplorer(g, 0, false, false);
  assert(penetration(g, pillar.bounds).deepest < 0.005);
  // Retraction must not leave the feet in the bed while an upright swimmer
  // moves into shallower water and returns to the prone stroke.
  g.player.position.set(3, -7.6, 3);
  g.rig.swimCompact = 1;
  animateExplorer(g, 1 / 60, false, false);
  assert(g.rig.swimCompact < 0.05);
  assert(penetration(g, pillar.bounds).minY >= -8.005);
});
