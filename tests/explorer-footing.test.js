import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  footingReader,
  inspectExplorerFooting,
} from "../scripts/inspect-explorer-footing-browser.js";

function scene() {
  const groundGeometry = new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2),
    material = new THREE.MeshBasicMaterial(),
    ground = new THREE.Mesh(groundGeometry, material),
    geometry = new THREE.BufferGeometry(),
    player = new THREE.Group(),
    avatar = new THREE.Group(),
    model = new THREE.Group(),
    left = new THREE.Bone(),
    right = new THREE.Bone();
  left.name = "mixamorigLeftFoot";
  right.name = "mixamorigRightFoot";
  left.position.set(0.12, 0.1, 0);
  right.position.set(-0.12, 0.1, 0);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0.09, 0.006, 0, 0.15, 0.006, 0, 0.12, 0.006, 0.1, -0.15, 0.006, 0,
        -0.09, 0.006, 0, -0.12, 0.006, 0.1,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4,
    ),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(
      Array.from({ length: 6 }, () => [1, 0, 0, 0]).flat(),
      4,
    ),
  );
  const shoe = new THREE.SkinnedMesh(geometry, material);
  shoe.name = "shoes04";
  shoe.add(left, right);
  shoe.bind(new THREE.Skeleton([left, right]));
  player.add(avatar);
  avatar.add(model);
  model.add(shoe);
  player.position.set(20, 3, 20);
  avatar.rotation.y = 0.7;
  ground.position.copy(player.position);
  const game = { player, avatar, rig: { model } };
  return {
    game,
    ground,
    read: footingReader([ground]),
    dispose() {
      geometry.dispose();
      groundGeometry.dispose();
      material.dispose();
      shoe.skeleton.dispose();
    },
  };
}

test("sole observations follow the actual skin and world transforms, detecting floating and lowered controls", () => {
  const s = scene();
  try {
    const standing = inspectExplorerFooting(s.game, s.read);
    assert.equal(standing.samples, 6);
    assert.equal(standing.missing, 0);
    assert.equal(standing.invalid, 0);
    assert(
      standing.feet.every(
        (f) => f.contacts.length === 3 && Math.abs(f.minimumGap - 0.006) < 1e-6,
      ),
    );
    assert(
      standing.feet[0].localAnkle[0] > 0 && standing.feet[1].localAnkle[0] < 0,
    );
    s.game.avatar.position.y = 0.2;
    const raised = inspectExplorerFooting(s.game, s.read);
    assert(
      raised.feet.every(
        (f) => f.contacts.length === 0 && Math.abs(f.minimumGap - 0.206) < 1e-6,
      ),
    );
    s.game.avatar.position.y = -0.1;
    assert(
      inspectExplorerFooting(s.game, s.read).feet.every(
        (f) => Math.abs(f.minimumGap + 0.094) < 1e-6,
      ),
    );
    assert.equal(inspectExplorerFooting(s.game, () => null).missing, 6);
    assert.equal(inspectExplorerFooting(s.game, () => NaN).invalid, 6);
  } finally {
    s.dispose();
  }
});

test("a delivered upper face supports a boot above it while an overhead slab remains a ceiling", () => {
  const s = scene(),
    geometry = new THREE.BoxGeometry(2, 1, 2),
    material = new THREE.MeshBasicMaterial(),
    rock = new THREE.Mesh(geometry, material);
  rock.position.set(20, 4.5, 20);
  rock.rotation.y = 0.4;
  try {
    const read = footingReader([s.ground], [rock]);
    assert.equal(read(new THREE.Vector3(20, 3.5, 20)), 3);
    assert(Math.abs(read(new THREE.Vector3(20, 5.006, 20)) - 5) < 1e-6);
    assert.equal(footingReader([], [])(new THREE.Vector3()), null);
    geometry.attributes.position.setY(0, NaN);
    assert.throws(
      () => footingReader([s.ground], [rock]),
      /invalid support geometry/,
    );
  } finally {
    geometry.dispose();
    material.dispose();
    s.dispose();
  }
});
