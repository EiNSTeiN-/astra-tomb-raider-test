import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { SaveStore } from "../src/storage.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";

// Delivered leaves at c412187: include both fixed and retiring detail, their
// transforms, every vertex attribute and the index. New crown construction
// must not consume the leaf joinery's seeded random sequence.
const DELIVERED_LEAVES = [
  [
    "2481c1f6f308cfa515d7493d3656ade731746dec8c1b5eabaab10d1267a07f5c",
    "cd5d886b9850f500a1e1633cd6ca2095b955e2d68b78cde380cc190de41538fd",
  ],
  [
    "12f916b33a64e56a6e8a87b4cde5295424318a627b81e4202127745880c2da63",
    "8bd76551b255fe36b5ff4c86b0b7d990f7ab9cd3fa8a0b4f0493eab128f68fb8",
  ],
  [
    "31f18246f196ddd4b1bbda1871d136ffa6c56fdc51e7284381f61b367eb07939",
    "e226837ee1fe09b6135ed53ed5bf0c117da84ef3a59316e0997c6c3b61e4ea19",
  ],
  [
    "1527eef8655726594ebe23b508bf0a0aebe90b7f559b7b5794e4a017d4891191",
    "a7244fa7005c39ed454bbfbf77cd859d90cb216bd297756eee27c895d8ad29e4",
  ],
  [
    "6e667924d77ea515cd69b502f21a165f786aa7ec9392f49b9a44049969a20b87",
    "92747a9fd3926c133ec6af1ca539a2a2d4b298b651968ae1879329731ee7acef",
  ],
  [
    "df6a7a51fd78f249cce8bf5a4925801fc0192fa6dc4e2daf07be6bbaaa82547f",
    "b36e39e6a59316c5d199b01b2320a60adfa3e8208dbc1781abe42b5031dd07db",
  ],
  [
    "048b945c1a17f12e316d19ae4e82d1f4f7d7198d4d40b8291085e5ed90669bc4",
    "7fa03be1acef748b17712e4f555e7ce97849c8d758e8eb130625fa890915e9f9",
  ],
  [
    "f4bef6702a08276378c79938079a09d57ada0ccb7e1f78dcd1e57858eb938883",
    "5ff86a6f62e4fcaf0ee03187492f059abbdc4ce1e661f077b32d95469380c3b1",
  ],
  [
    "86f6776352dc33c7c381df034ac8d6465543e903eb3456c017a9ae6739808e68",
    "ec3a1f9a6e82669c88425ceafa2429b75930c45fbc3bcf58911e18b32a2d03a0",
  ],
];

function leafDigest(root) {
  const hash = createHash("sha256");
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    hash.update(mesh.position.toArray().join(","));
    hash.update(mesh.quaternion.toArray().join(","));
    for (const key of Object.keys(mesh.geometry.attributes).sort()) {
      hash.update(key);
      hash.update(Buffer.from(mesh.geometry.attributes[key].array.buffer));
    }
    if (mesh.geometry.index)
      hash.update(Buffer.from(mesh.geometry.index.array.buffer));
  });
  return hash.digest("hex");
}

test("nine open-air wind crowns retain their leaves and thresholds, bear on real masonry, and supply exact caps and camera surfaces", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[5],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    store = new SaveStore({ getItem: () => null, setItem: () => {} }),
    game = Object.assign(Object.create(Adventure.prototype), {
      level,
      map,
      terrainProfile,
      store,
      progress: store.level(level.id),
      world: new THREE.Group(),
      player: new THREE.Group(),
      obstacles: [],
      elapsed: 0,
      items: map.features.filter((f) => f.type === "mechanism"),
    });
  game.cameraSurfaces = new CameraSurfaces(game.world);
  buildFieldGates(game);
  game.cameraSurfaces.rebuild();
  game.world.updateMatrixWorld(true);
  t.after(() => {
    const materials = new Set(),
      textures = new Set();
    game.world.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  });
  assert.equal(new Set(game.fieldGates.map((g) => g.crown.style)).size, 9);
  assert.equal(game.obstacles.filter((o) => !o.windChamberCrown).length, 45);
  assert.equal(game.obstacles.filter((o) => o.windChamberCrown).length, 9);
  const ray = new THREE.Raycaster();
  let footings = 0,
    caps = 0,
    cameraChecks = 0,
    doorStates = 0,
    minDoorGap = Infinity,
    maxJointGap = -Infinity;
  for (const gate of game.fieldGates) {
    const c = gate.root.position,
      crown = gate.crown,
      w = gate.halfWidth;
    assert.deepEqual(
      gate.leaves.map((l) => leafDigest(l.group)),
      DELIVERED_LEAVES[gate.stage],
    );
    assert(
      gate.root.children.filter((o) => o.isMesh && !o.isInstancedMesh).length <=
        5,
      "no additional fixed material batches",
    );
    for (const side of [-1, 1]) {
      const source = gate.sources.find(
        (s) => s.id === `gate-drive-${gate.stage}-${side}`,
      );
      assert.deepEqual(
        [source.x, source.y, source.z],
        [c.x + side * w, c.y + 3.4, c.z + 7.85],
      );
    }
    // Nine central vertical rays still have no roof above their standing area.
    ray.set(new THREE.Vector3(c.x, c.y + 1.8, c.z), new THREE.Vector3(0, 1, 0));
    assert.equal(
      ray.intersectObject(gate.root, true).length,
      0,
      "court remains open to the sky",
    );
    for (const course of crown.courses) {
      const front = course.side === "front";
      for (const offset of [-0.23, 0, 0.23]) {
        const along = course.center + course.width * offset,
          x =
            c.x +
            (front || course.side === 0
              ? along
              : course.side * (w + course.normal)),
          z =
            c.z +
            (front ? 6.5 : course.side === 0 ? -6.5 - course.normal : along),
          bottom = c.y + course.bottom;
        ray.set(new THREE.Vector3(x, c.y + 20, z), new THREE.Vector3(0, -1, 0));
        const lower = ray
          .intersectObject(gate.root, true)
          .find(
            (h) =>
              h.face.normal.y > 0.65 &&
              h.point.y <= bottom + 0.055 &&
              h.point.y >= bottom - 0.1,
          );
        assert(
          lower,
          `unseated course ${gate.stage}/${course.side}/${course.bottom}/${along}`,
        );
        const gap = bottom - lower.point.y;
        maxJointGap = Math.max(maxJointGap, gap);
        assert(gap < 0.025, "course bears on an actual upward face");
        footings++;
      }
    }
    for (const side of ["front", 0, -1, 1])
      for (const along of [-0.85, -0.5, -0.08, 0, 0.08, 0.5, 0.85].map(
        (f) => f * (side === "front" || side === 0 ? w : 6.9),
      ))
        for (const normal of [-0.22, 0, 0.22]) {
          const x =
              c.x +
              (side === "front" || side === 0
                ? along
                : side * (w + 0.16) + normal),
            z =
              c.z +
              (side === "front"
                ? 6.5 + normal
                : side === 0
                  ? -6.66 + normal
                  : along);
          ray.set(
            new THREE.Vector3(x, c.y + 20, z),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray
              .intersectObject(gate.root, true)
              .find((h) => h.face.normal.y > 0.65),
            support = stationSupport(crown.solid, x, z, Infinity, 0);
          assert(
            hit && support !== null && Math.abs(hit.point.y - support) < 1e-5,
            `delivered cap ${gate.stage}/${side}/${along}/${normal}`,
          );
          assert(
            stationBlocked(crown.solid, x, support - 0.12, z, 1.8, 0.1),
            "raised masonry blocks a body inside the cap",
          );
          const eye = new THREE.Vector3(x, support + 1, z),
            target = new THREE.Vector3(x, support - 0.1, z);
          assert(
            game.cameraSurfaces.entry(eye, target, 0) < 1,
            "camera sees the actual upper surface",
          );
          caps++;
          cameraChecks++;
        }
    // A conservative box separation of every new closed piece from the full
    // moving leaf is stronger than checking a few door corners or its centre.
    for (let n = 0; n <= 20; n++) {
      game.progress.completed = false;
      game.progress.stage = 0;
      gate.amount = n / 20;
      updateSanctuaryGate(game, gate, 0);
      game.world.updateMatrixWorld(true);
      for (const leaf of gate.leaves) {
        const b = new THREE.Box3().setFromObject(leaf.group);
        for (const piece of crown.solid.triangles.solids.slice(
          crown.inheritedParts,
        )) {
          const a = piece.bounds,
            gap = Math.max(
              a.min.x - b.max.x,
              b.min.x - a.max.x,
              a.min.y - b.max.y,
              b.min.y - a.max.y,
              a.min.z - b.max.z,
              b.min.z - a.max.z,
            );
          assert(
            gap > 0,
            `new crown touches leaf ${gate.stage}/${leaf.side}/${n}`,
          );
          minDoorGap = Math.min(minDoorGap, gap);
        }
      }
      doorStates++;
    }
    game.progress.completed = true;
    updateSanctuaryGate(game, gate, 100);
    assert(
      game.canMove(c.x, c.z + 6.5, 0),
      "standing threshold retains clearance",
    );
    assert(
      !stationBlocked(
        crown.solid,
        c.x,
        game.groundHeight(c.x, c.z + 6.5),
        c.z + 6.5,
      ),
      "upper assembly creates no ground column",
    );
  }
  assert.equal(caps, 756);
  assert.equal(cameraChecks, 756);
  assert.equal(doorStates, 189);
  assert(footings >= 189);
  t.diagnostic(
    `${footings} course bearings; ${caps} delivered caps/camera rays; ${doorStates} door states; minimum door separation ${minDoorGap} m; maximum course gap ${maxJointGap} m`,
  );
});
