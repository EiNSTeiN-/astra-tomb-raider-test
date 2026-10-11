import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  inspectDesertBankSurface,
  inspectDesertBankContacts,
} from "../scripts/inspect-desert-shoulders-browser.js";

function plane(width, depth, nx, nz, x, z) {
  const geometry = new THREE.PlaneGeometry(width, depth, nx, nz);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, 0, z);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}

test("delivered bank observer counts joined chunks and rejects an actual raised seam", () => {
  const a = plane(6, 12, 3, 6, 3, 6),
    b = plane(6, 12, 3, 6, 9, 6),
    game = {
      terrainProfile: { width: 7, step: 2, waters: [] },
      terrainMeshes: [a, b],
      map: { grid: Array.from({ length: 4 }, () => Array(4).fill(1)) },
    };
  const valid = inspectDesertBankSurface(game);
  assert.equal(valid.vertices, 49);
  assert.equal(valid.duplicateVertices, 7);
  assert.equal(valid.triangles, 72);
  assert.equal(valid.seamErrors, 0);
  assert.equal(valid.invalidNormals, 0);
  assert.equal(valid.invalidVertices, 0);
  assert.equal(valid.offGridVertices, 0);
  b.position.y = 0.05;
  assert.equal(inspectDesertBankSurface(game).seamErrors, 7);
  for (const mesh of [a, b]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("terrain contacts inspect actual palm vertices and merged stone undersides, detecting moved meshes", () => {
  const terrain = plane(100, 100, 50, 50, 50, 50),
    trunk = new THREE.CylinderGeometry(0.3, 0.45, 5, 8, 1, true),
    bark = new THREE.MeshBasicMaterial({ name: "Date palm bark" }),
    pose = new THREE.Matrix4().makeTranslation(30, -0.35, 30),
    tiers = Array.from({ length: 3 }, () => [
      new THREE.InstancedMesh(trunk, bark, 1),
    ]),
    root = new THREE.Group(),
    core = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1, 2.4),
      new THREE.MeshBasicMaterial(),
    ),
    world = new THREE.Group();
  trunk.translate(0, 2.5, 0);
  for (const [mesh] of tiers) {
    mesh.setMatrixAt(0, pose);
    world.add(mesh);
  }
  core.position.y = 0.3;
  root.position.set(50, 0, 50);
  root.add(core);
  world.add(root, terrain);
  const game = {
    world,
    terrainMeshes: [terrain],
    palmPatches: [{ matrices: [pose], tiers }],
    desertPatches: [
      {
        root,
        foundations: [
          { x: 0, z: 0, width: 3, depth: 3, top: 0.8, bottom: -0.2 },
        ],
      },
    ],
  };
  const valid = inspectDesertBankContacts(game);
  assert.equal(valid.palms, 1);
  assert.equal(valid.palmRoots, 27);
  assert.equal(valid.foundations, 1);
  assert.equal(valid.foundationProbes, 121);
  assert.equal(valid.missing, 0);
  assert.equal(valid.exposedPalmRoots, 0);
  assert.equal(valid.exposedPalmEdges, 0);
  assert.equal(valid.exposedFoundations, 0);
  assert(Math.abs(valid.highestPalmRoot + 0.35) < 1e-6);
  assert(Math.abs(valid.highestFoundation + 0.2) < 1e-6);
  for (const [mesh] of tiers) mesh.position.y += 0.4;
  core.position.y += 0.4;
  const raised = inspectDesertBankContacts(game);
  assert.equal(raised.exposedPalmRoots, 27);
  assert.equal(raised.exposedPalmEdges, 405);
  assert.equal(raised.exposedFoundations, 121);
  for (const [mesh] of tiers) mesh.dispose();
  for (const resource of [
    terrain.geometry,
    terrain.material,
    trunk,
    bark,
    core.geometry,
    core.material,
  ])
    resource.dispose();
});
