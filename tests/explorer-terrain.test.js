import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { inspectExplorerTerrain } from "../scripts/inspect-explorer-terrain-browser.js";

function scene() {
  const groundGeometry = new THREE.PlaneGeometry(6, 6, 3, 3);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.MeshBasicMaterial(),
    ground = new THREE.Mesh(groundGeometry, groundMaterial),
    player = new THREE.Group(),
    avatar = new THREE.Group(),
    model = new THREE.Group(),
    bone = new THREE.Bone(),
    geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.2, 0.04, 0, 0.2, 0.04, 0, 0, 0.07, 0.2],
      3,
    ),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(Array(12).fill(0), 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = "Posed boot";
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  model.add(mesh);
  avatar.add(model);
  player.add(avatar);
  player.position.set(20, 3, 20);
  avatar.rotation.y = 0.7;
  ground.position.set(20, 3, 20);
  player.updateMatrixWorld(true);
  const game = { avatar, rig: { model }, terrainMeshes: [ground] };
  return {
    game,
    bone,
    mesh,
    dispose() {
      for (const r of [geometry, material, groundGeometry, groundMaterial])
        r.dispose();
      mesh.skeleton.dispose();
    },
  };
}

test("terrain contact reads every deformed body vertex with player translation and actual ground triangles", () => {
  const s = scene();
  try {
    const standing = inspectExplorerTerrain(s.game);
    assert.equal(standing.samples, 3);
    assert.equal(standing.embedded, 0);
    assert.equal(standing.missing, 0);
    assert(Math.abs(standing.minimumGap - 0.04) < 1e-6);
    s.bone.position.y = -0.2;
    const lowered = inspectExplorerTerrain(s.game);
    assert.equal(lowered.samples, 3);
    assert.equal(lowered.embedded, 3);
    assert(Math.abs(lowered.minimumGap + 0.16) < 1e-6);
    assert.equal(lowered.witnesses[0].mesh, "Posed boot");
    assert(Math.abs(lowered.witnesses[0].point[1] - 2.84) < 1e-6);
    assert.equal(
      s.mesh.geometry.attributes.position.getY(0),
      Math.fround(0.04),
    );
  } finally {
    s.dispose();
  }
});

test("terrain contact distinguishes missing ground and skips a hidden model rather than certifying empty coverage", () => {
  const s = scene();
  try {
    const absent = inspectExplorerTerrain(s.game, () => null);
    assert.equal(absent.samples, 3);
    assert.equal(absent.missing, 3);
    assert.equal(absent.embedded, 0);
    s.game.rig.model.visible = false;
    const hidden = inspectExplorerTerrain(s.game);
    assert.equal(hidden.samples, 0);
    assert.equal(hidden.meshes.length, 0);
  } finally {
    s.dispose();
  }
});

test("terrain contact rejects invalid delivered body coordinates and invalid supplied ground", () => {
  const s = scene();
  try {
    s.mesh.geometry.attributes.position.setY(0, NaN);
    const broken = inspectExplorerTerrain(s.game);
    assert.equal(broken.invalid, 1);
    assert.equal(broken.samples, 3);
    s.mesh.geometry.attributes.position.setY(0, 0.04);
    assert.equal(inspectExplorerTerrain(s.game, () => NaN).invalid, 3);
  } finally {
    s.dispose();
  }
});
