import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { EXPEDITIONS } from "../src/expeditions.js";
import { buildRegionalStation } from "../src/field-station-art.js";
import {
  buildCarriedFittings,
  updateCarriedFittings,
} from "../src/carried-fittings.js";
import { ExplorerVisibility } from "../src/explorer-visibility.js";
import { updateFieldWorld } from "../src/field-world.js";

async function actor() {
  const io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
}

function stations(level) {
  const game = {
    level,
    progress: { stage: 0, field: [] },
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    groundHeight: () => 0,
    obstacles: [],
    fieldGates: [],
  };
  game.items = createMap(level).features.filter(
    (f) =>
      f.kind === "lift" &&
      f.cartHeight === undefined &&
      f.craneHeight === undefined &&
      !(level.id === "tides" && f.stage === 2),
  );
  for (const f of game.items) {
    f.group = new THREE.Group();
    f.marker = new THREE.Object3D();
    buildRegionalStation(game, f, f.group);
  }
  return game;
}

test("all 20 regional fittings survive recovery and reload, then leave the pack on delivery or sector advance", async () => {
  const { scene } = await actor();
  let count = 0;
  for (const level of LEVELS) {
    const game = stations(level),
      carrier = buildCarriedFittings(game, scene);
    game.rig = { carrier };
    assert.equal(carrier.variants.length, game.items.length);
    const visibility = new ExplorerVisibility([carrier.root]);
    for (const f of game.items) {
      count++;
      const variant = carrier.variants.find((v) => v.id === f.id);
      const mission = EXPEDITIONS[level.id][f.stage];
      game.progress = { stage: f.stage, field: [] };
      updateCarriedFittings(game);
      assert.equal(carrier.root.visible, false);
      game.progress.field.push(f.id);
      updateFieldWorld(game, 0);
      assert.equal(carrier.root.visible, true);
      assert.equal(
        f.core.visible,
        false,
        "source and carried copy change in the same world update",
      );
      assert.deepEqual(
        carrier.variants.filter((v) => v.fitting.visible).map((v) => v.id),
        [f.id],
      );
      game.progress = JSON.parse(JSON.stringify(game.progress));
      updateCarriedFittings(game);
      assert.equal(
        variant.fitting.visible,
        true,
        "restored progress must restore the object",
      );
      const sourceMeshes = [],
        copies = [];
      f.core.traverse((m) => {
        if (m.isMesh) sourceMeshes.push(m);
      });
      variant.fitting.traverse((m) => {
        if (m.isMesh) copies.push(m);
      });
      assert.equal(copies.length, sourceMeshes.length);
      const seat = carrier.root.getObjectByName(
          "Recovered fitting bearing seat",
        ),
        seatTop = seat.position.y + seat.geometry.parameters.height / 2;
      let lowest = Infinity;
      for (const copy of copies) {
        const positions = copy.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(copy.matrix);
          lowest = Math.min(lowest, p.y);
        }
      }
      assert(
        Math.abs(lowest - seatTop) < 1e-6,
        "cartridge bottom must bear on its cradle",
      );
      for (let i = 0; i < copies.length; i++) {
        const source = sourceMeshes[i],
          copy = copies[i];
        assert.notEqual(copy.geometry, source.geometry);
        assert.deepEqual(
          copy.geometry.attributes.position.array,
          source.geometry.attributes.position.array,
        );
        assert.notEqual(copy.material, source.material);
        assert.equal(copy.material.map, source.material.map);
        assert.equal(
          copy.material.color.getHex(),
          source.material.color.getHex(),
        );
        assert.equal(copy.material.roughness, source.material.roughness);
        assert(copy.position.equals(source.position));
        assert(copy.quaternion.equals(source.quaternion));
        assert(copy.scale.equals(source.scale));
      }
      const previousCompile = f.core.children.find((m) => m.isMesh).material
        .onBeforeCompile;
      visibility.set(1.7);
      assert(visibility.uniform.value > 0 && visibility.uniform.value < 1);
      assert.equal(
        f.core.children.find((m) => m.isMesh).material.onBeforeCompile,
        previousCompile,
        "the actor mask must not change the source station's material",
      );
      game.progress.field.push(
        mission.tasks.find((t) => t.kind === "delivery").id,
      );
      updateFieldWorld(game, 0);
      assert.equal(carrier.root.visible, false);
      game.progress = { stage: f.stage + 1, field: [f.id] };
      updateCarriedFittings(game);
      assert.equal(carrier.root.visible, false);
    }
    scene.getObjectByName("mixamorigSpine2").remove(carrier.root);
  }
  assert.equal(count, 20);
});

test("the retaining shoes seat in the delivered backpack and remain attached throughout animation and turns", async () => {
  const { scene, animations } = await actor(),
    game = stations(LEVELS[5]);
  const player = new THREE.Group();
  player.add(scene);
  const carrier = buildCarriedFittings(game, scene),
    pack = scene.getObjectByName("Spine2_canvas"),
    shoes = carrier.root.children.filter(
      (m) =>
        m.isMesh &&
        m.geometry.type === "BoxGeometry" &&
        m.geometry.parameters.depth === 0.028,
    );
  assert.equal(shoes.length, 4);
  pack.geometry.computeBoundingBox();
  scene.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(),
    contacts = [];
  for (const shoe of shoes) {
    const center = shoe.getWorldPosition(new THREE.Vector3());
    ray.set(
      new THREE.Vector3(center.x, center.y, -1.2),
      new THREE.Vector3(0, 0, 1),
    );
    const hits = ray.intersectObject(pack);
    const hit = hits.find(
      (h) => h.point.z >= center.z - 0.014 && h.point.z <= center.z + 0.014,
    );
    assert(
      hit,
      `cradle plate misses the pack at ${center.toArray()}: ${hits.map((h) => h.point.toArray())}`,
    );
    contacts.push({
      shoe,
      packPoint: pack.worldToLocal(hit.point.clone()),
      carrierPoint: carrier.root.worldToLocal(hit.point.clone()),
    });
  }
  const bones = [];
  scene.traverse((b) => {
    if (b.isBone) bones.push([b, b.position.clone(), b.scale.clone()]);
  });
  const mixer = new THREE.AnimationMixer(scene),
    weights = pack.geometry.attributes.skinWeight,
    indices = pack.geometry.attributes.skinIndex,
    spineIndex = indices.getX(0);
  for (let i = 0; i < weights.count; i++) {
    assert.equal(weights.getX(i), 1);
    assert.equal(indices.getX(i), spineIndex);
  }
  let samples = 0;
  for (const name of ["Idle", "Walk", "Run"]) {
    const action = mixer.clipAction(animations.find((c) => c.name === name));
    action.play();
    for (let frame = 0; frame < 120; frame++) {
      mixer.update(1 / 60);
      player.position.set(
        frame * 0.03,
        Math.sin(frame / 19) * 0.2,
        -frame * 0.01,
      );
      player.rotation.y = frame / 13;
      scene.rotation.x = Math.sin(frame / 21) * 0.14;
      player.updateMatrixWorld(true);
      for (const { carrierPoint, packPoint } of contacts) {
        const actual = carrier.root.localToWorld(carrierPoint.clone());
        const expected = pack.applyBoneTransform(0, packPoint.clone());
        pack.localToWorld(expected);
        assert(
          actual.distanceTo(expected) < 1e-6,
          `${name}/${frame}: attachment drift ${actual.distanceTo(expected)}`,
        );
      }
      for (const [bone, position, scale] of bones) {
        if (/Spine/.test(bone.name))
          assert(bone.position.distanceTo(position) < 1e-7);
        assert(bone.scale.distanceTo(scale) < 1e-7);
      }
      samples++;
    }
    action.stop();
  }
  assert.equal(samples, 360);
});

test("mechanically installed and crane-handled components do not acquire a second cartridge", async () => {
  const { scene } = await actor();
  for (const [id, stage, mechanism] of [
    ["tides", 2, "coralPump"],
    ["embers", 6, "temperingCart"],
    ["eclipse", 6, "astralCrane"],
  ]) {
    const game = stations(LEVELS.find((l) => l.id === id)),
      carrier = buildCarriedFittings(game, scene);
    game.rig = { carrier };
    game.progress = {
      stage,
      field: [`field-${stage}-0`],
      [mechanism]: { installed: true, loaded: true, seated: true },
    };
    updateCarriedFittings(game);
    assert.equal(carrier.root.visible, false);
    scene.getObjectByName("mixamorigSpine2").remove(carrier.root);
  }
});
