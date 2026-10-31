import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  jungleSpecimen,
  jungleTreeAllowed,
  plantJungleTrees,
} from "../src/jungle-grounding.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { woodlandLayout } from "../src/habitat.js";
import { JungleTreeSolids } from "../src/jungle-tree-solids.js";
import { Adventure } from "../src/game.js";
import { advanceCharacter, supportAt } from "../src/character-motion.js";
import { cameraBodyVisibility } from "../src/camera-body-frame.js";
import { shotCover } from "../src/aiming.js";
import {
  createLodPatch,
  updateLodPatch,
  disposeInstanceBuffers,
} from "../src/instance-lod.js";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  specimens = [],
  models = [];
for (const name of ["island_tree_01", "island_tree_02"]) {
  const scenes = [];
  for (const tier of ["near", "optimized", "distant"]) {
    const doc = await io.read(`public/assets/models/${name}/${tier}.glb`),
      scene = new THREE.Group();
    scene.userData = doc.getRoot().listScenes()[0].getExtras();
    for (const node of doc.getRoot().listNodes()) {
      for (const primitive of node.getMesh()?.listPrimitives() || []) {
        if (primitive.getMaterial().getName() !== name) continue;
        const geometry = new THREE.BufferGeometry(),
          material = new THREE.MeshStandardMaterial({ name });
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            primitive.getAttribute("POSITION").getArray(),
            3,
          ),
        );
        geometry.setIndex(
          new THREE.BufferAttribute(primitive.getIndices().getArray(), 1),
        );
        geometry.applyMatrix4(
          new THREE.Matrix4().fromArray(node.getWorldMatrix()),
        );
        scene.add(new THREE.Mesh(geometry, material));
      }
    }
    scenes.push(scene);
  }
  const model = jungleSpecimen(scenes);
  models.push(model);
  for (const source of model.sources.flat()) {
    source.geometry.translate(
      -model.origin.x,
      -model.origin.y,
      -model.origin.z,
    );
    source.geometry.scale(model.scale, model.scale, model.scale);
    source.geometry.computeBoundingBox();
  }
  specimens.push(model.sources.map((sources) => sources[0]));
}

function transform(x = 0, y = -0.08, z = 0, yaw = 0, scale = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3().setScalar(scale),
  );
}
function patch(sources, matrices = [transform()]) {
  return { tiers: sources.map((source) => [source]), matrices };
}
function game(solids) {
  return Object.assign(Object.create(Adventure.prototype), {
    jungleTreeSolids: solids,
    groundHeight: () => 0,
    walkable: () => true,
    player: new THREE.Group(),
    avatar: new THREE.Group(),
    obstacles: [],
    audio: { tone() {} },
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    map: { spawn: { x: 10, z: 10 } },
  });
}

test("the recorded steep trunk side is not a standing tread and a falling body slides clear", () => {
  const matrix = new THREE.Matrix4().fromArray([
    0.8312395475657146, 0, -0.7075141923819876, 0, 0, 1.0915747880283742, 0, 0,
    0.7075141923819876, 0, 0.8312395475657146, 0, 372.72309826873243,
    -0.6184441827341617, 35.39440362062305, 1,
  ]);
  const solids = new JungleTreeSolids([patch(specimens[0], [matrix])]),
    g = game(solids),
    profile = createTerrainProfile(createMap(LEVELS[0]), LEVELS[0]);
  g.groundHeight = profile.surfaceHeight;
  g.terrainProfile = profile;
  g.level = LEVELS[0];
  const x = 370.57309826873285,
    z = 35.39440362062305,
    y = 2.1729428090092937;
  g.player.position.set(x, y, z);
  assert(g.canMove(x, z, y - g.groundHeight(x, z)));
  assert.equal(solids.support(x, z, y, 0.55, 0.65), null);
  assert.equal(supportAt(g, x, z, y, 0.55).height, g.groundHeight(x, z));
  for (let i = 0; i < 450; i++) {
    advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
    const p = g.player.position;
    assert(
      g.canMove(p.x, p.z, g.jumpY),
      `Body enters wood at ${i}: ${p.toArray()}`,
    );
    assert(p.y >= g.groundHeight(p.x, p.z) - 1e-6);
  }
  assert(g.grounded);
  assert(
    Math.abs(
      g.player.position.y -
        g.groundHeight(g.player.position.x, g.player.position.z),
    ) < 1e-6,
  );
});

test("both delivered trunks keep identical positions and triangles across all detail tiers", () => {
  for (const sources of specimens) {
    for (const source of sources.slice(1)) {
      assert.deepEqual(
        source.geometry.attributes.position.array,
        sources[0].geometry.attributes.position.array,
      );
      assert.deepEqual(
        source.geometry.index.array,
        sources[0].geometry.index.array,
      );
    }
  }
});

test("indexed rays agree with independently raycast delivered trunks under rotation, scale and world translation", () => {
  const ray = new THREE.Raycaster(),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let tested = 0,
    hits = 0,
    misses = 0;
  for (const sources of specimens)
    for (const yaw of [0, 0.73, 2.1])
      for (const scale of [0.82, 1.6]) {
        const placement = transform(37, 3, -42, yaw, scale),
          world = transform(-11, 2, 19),
          matrix = world.clone().multiply(placement),
          solids = new JungleTreeSolids([patch(sources, [placement])], world),
          mesh = new THREE.Mesh(sources[0].geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        mesh.updateMatrixWorld(true);
        const bounds = sources[0].geometry.boundingBox
            .clone()
            .applyMatrix4(matrix),
          center = bounds.getCenter(new THREE.Vector3());
        for (const height of [0.2, 1, 3, 6, 10, 13])
          for (let direction = 0; direction < 12; direction++) {
            const angle = (direction * Math.PI) / 6,
              axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
              target = center
                .clone()
                .setY(matrix.elements[13] + height * scale),
              from = target.clone().addScaledVector(axis, 25),
              to = target.clone().addScaledVector(axis, -25);
            ray.set(from, to.clone().sub(from).normalize());
            ray.far = from.distanceTo(to);
            const hit = ray.intersectObject(mesh)[0],
              entry = solids.entry(from, to);
            if (hit) {
              assert(entry !== null);
              assert(Math.abs(entry - hit.distance / ray.far) < 2e-6);
              hits++;
            } else {
              assert.equal(entry, null);
              misses++;
            }
            tested++;
          }
      }
  assert.equal(tested, 864);
  assert(hits > 150 && misses > 150);
  material.dispose();
});

test("actual trunks stop the body, lens and cover rays while leaves remain soft", () => {
  for (const sources of specimens) {
    const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, 30),
        new THREE.MeshStandardMaterial({ name: "island_tree_01_leaves" }),
      ),
      p = patch(sources);
    p.tiers[0].push(leaf);
    const solids = new JungleTreeSolids([p]),
      g = game(solids),
      from = new THREE.Vector3(-10, 1, 0),
      to = new THREE.Vector3(10, 1, 0);
    assert.equal(solids.shapeCount, 1);
    assert.equal(solids.solids.length, 1);
    assert.equal(g.canMove(0, 0, 0), false);
    assert.equal(g.cameraSpace(new THREE.Vector3(0, 1, 0)), false);
    assert.equal(g.lineOfSight(from, to, 0, 0), false);
    assert(shotCover(g, from, to) < 1);
    assert.equal(
      cameraBodyVisibility(null, to, [{ position: from, radius: 0 }], g),
      0,
    );
    g.jungleTreeSolids = null;
    assert(g.canMove(0, 0, 0), "negative control reproduces an unsolid trunk");
    assert(g.cameraSpace(new THREE.Vector3(0, 1, 0)));
    assert(g.lineOfSight(from, to, 0, 0));
    assert.equal(shotCover(g, from, to), 1);
    assert.equal(
      cameraBodyVisibility(null, to, [{ position: from, radius: 0 }], g),
      1,
    );
    g.jungleTreeSolids = solids;
    g.player.position.set(-4, 0, 0);
    for (let i = 0; i < 150; i++) advanceCharacter(g, { x: 3, z: 0 }, 1 / 60);
    assert(g.player.position.x < 0);
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
    assert(g.restoreNatureArrival({ x: 0, z: 0, height: 0 }) === false);
    g.player.position.set(0, 0, 0);
    assert(g.restoreNatureArrival({ x: 0, z: 0, height: 0 }));
    assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
    const restored = g.player.position.clone();
    assert.equal(
      g.restoreNatureArrival({ x: restored.x, z: restored.z, height: g.jumpY }),
      false,
    );
    leaf.geometry.dispose();
    leaf.material.dispose();
  }
});

test("a fork supports landings below another branch, stops upward jumps and restores earned height", () => {
  const geometry = new THREE.BoxGeometry(4, 0.3, 2),
    material = new THREE.MeshStandardMaterial({ name: "island_tree_01" }),
    sources = [[{ geometry, material }]],
    solids = new JungleTreeSolids([
      { tiers: sources, matrices: [transform(0, 0.15), transform(0, 3.15)] },
    ]),
    g = game(solids);
  assert.equal(supportAt(g, 0, 0, 0.3, 0.55).height, 0.3000000059604645);
  g.player.position.set(0, 0.3, 0);
  let maxY = g.player.position.y;
  for (let i = 0; i < 120; i++) {
    advanceCharacter(g, { x: 0, z: 0 }, 1 / 60, i === 0);
    maxY = Math.max(maxY, g.player.position.y);
    assert.equal(solids.blocked(0, g.player.position.y, 0), false);
  }
  assert(maxY > 1 && maxY < 1.22, "head stops at the real overhead limb");
  assert(g.grounded);
  assert(Math.abs(g.player.position.y - 0.3) < 1e-6);
  g.player.position.y = 0;
  assert(g.restoreNatureArrival({ x: 0, z: 0, height: 0.3 }));
  assert(Math.abs(g.player.position.y - 0.3) < 1e-6);
  assert.equal(g.restoreNatureArrival({ x: 0, z: 0, height: 0.3 }), false);
  geometry.dispose();
  material.dispose();
});

test("camera-ray indexing includes grid seams, diagonal corners, verticals and both travel directions", () => {
  const geometry = new THREE.BoxGeometry(0.16, 3, 0.16),
    material = new THREE.MeshStandardMaterial({ name: "island_tree_01" }),
    solids = new JungleTreeSolids([
      {
        tiers: [[{ geometry, material }]],
        matrices: [transform(0.3, 1.5, 0.3)],
      },
    ]),
    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ),
    ray = new THREE.Raycaster();
  mesh.position.set(0.3, 1.5, 0.3);
  mesh.updateMatrixWorld(true);
  for (const axis of [
    [1, 0, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 0, -1],
    [0, 1, 0],
    [1, 0.1, 0.29],
  ])
    for (const sign of [-1, 1]) {
      const direction = new THREE.Vector3(...axis)
          .normalize()
          .multiplyScalar(sign),
        center = new THREE.Vector3(0.3, 1.5, 0.3),
        from = center.clone().addScaledVector(direction, -4),
        to = center.clone().addScaledVector(direction, 4);
      ray.set(from, direction);
      const hit = ray.intersectObject(mesh)[0];
      assert(hit);
      assert(Math.abs(solids.entry(from, to) - hit.distance / 8) < 1e-7);
    }
  geometry.dispose();
  material.dispose();
  mesh.material.dispose();
});

test("forest LOD packing, culling and geometry disposal preserve immutable collision", () => {
  const world = new THREE.Group(),
    sources = specimens[0],
    matrices = [transform(), transform(30, -0.08, 0)],
    p = createLodPatch(
      world,
      sources.map((source) => [source]),
      matrices,
      matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m)),
    ),
    solids = new JungleTreeSolids([p]);
  const before = solids.entry(
    new THREE.Vector3(-10, 1, 0),
    new THREE.Vector3(10, 1, 0),
  );
  assert(before !== null);
  for (const ranges of [
    [20, 60, 175],
    [0, 28, 115],
  ])
    for (const x of [0, 30, 90, 500])
      updateLodPatch(p, new THREE.Vector3(x, 0, 0), ranges, 1);
  assert.equal(solids.shapeCount, 1);
  assert.equal(solids.solids.length, 2);
  assert.equal(disposeInstanceBuffers(world), 3);
  world.traverse((o) => {
    o.geometry?.dispose();
    o.customDepthMaterial?.dispose();
  });
  assert.equal(
    solids.entry(new THREE.Vector3(-10, 1, 0), new THREE.Vector3(10, 1, 0)),
    before,
  );
});

test("the complete planted forest retains path centers and blocks a delivered overhang at the standing margin", (t) => {
  const level = LEVELS[0],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    ground = terrainProfile.surfaceHeight || terrainProfile.height,
    g = Object.assign(game(null), {
      level,
      map,
      terrainProfile,
      groundHeight: ground,
    }),
    anchors = woodlandLayout(map, level, ground),
    trees = plantJungleTrees(anchors, models, {
      height: ground,
      allowed: (x, z, radius) => jungleTreeAllowed(g, x, z, radius),
    }),
    solids = new JungleTreeSolids(
      specimens.map((sources, variant) =>
        patch(
          sources,
          trees
            .filter((tree) => tree.variant === variant)
            .map((tree) =>
              transform(tree.x, tree.y, tree.z, tree.rotation, tree.scale),
            ),
        ),
      ),
    );
  // In this bare fixture the escarpment rejects 23 former tree seats. The full
  // level also reserves structure footprints and has its own browser count.
  assert.equal(trees.length, 729);
  let samples = 0,
    centerSamples = 0;
  const blocked = [],
    centerBlocked = [];
  for (let gz = 0; gz < map.size; gz++)
    for (let gx = 0; gx < map.size; gx++) {
      if (!map.grid[gz][gx]) continue;
      for (const dx of [-3.049, -1.5, 0, 1.5, 3.049])
        for (const dz of [-3.049, -1.5, 0, 1.5, 3.049]) {
          const x = gx * 7 + dx,
            z = gz * 7 + dz;
          if (
            [-0.45, 0.45].some((ox) =>
              [-0.45, 0.45].some(
                (oz) =>
                  !map.grid[Math.round((z + oz) / 7)]?.[
                    Math.round((x + ox) / 7)
                  ],
              ),
            )
          )
            continue;
          if (!g.canMove(x, z, 0)) continue;
          samples++;
          if (dx === 0 && dz === 0) centerSamples++;
          if (solids.blocked(x, ground(x, z), z)) {
            blocked.push({ x, z });
            if (dx === 0 && dz === 0) centerBlocked.push({ x, z });
          }
        }
    }
  // Inspect the delivered render positions independently of the collision
  // kernel. The one new edge stop must be visible wood entering the standing
  // envelope, rather than a false inside result below an open scan seam.
  const witnesses = blocked.map(({ x, z }) => {
    const y = ground(x, z),
      point = new THREE.Vector3();
    for (const tree of trees) {
      if (Math.hypot(tree.x - x, tree.z - z) > 15) continue;
      const position = specimens[tree.variant][0].geometry.attributes.position,
        matrix = transform(tree.x, tree.y, tree.z, tree.rotation, tree.scale);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(matrix);
        if (
          point.y > y + 0.015 &&
          point.y < y + 1.785 &&
          Math.hypot(point.x - x, point.z - z) < 0.55
        )
          return { x, z, vertex: point.toArray() };
      }
    }
    return null;
  });
  t.diagnostic(
    JSON.stringify({
      trees: trees.length,
      standingSamples: samples,
      centerSamples,
      newlyBlocked: blocked.length,
      witnesses,
    }),
  );
  assert(samples > 5000 && centerSamples > 1000);
  assert.deepEqual(centerBlocked, [], "existing path centers remain available");
  assert.equal(blocked.length, 1);
  assert(witnesses.every(Boolean), "each new stop intersects delivered wood");
});
