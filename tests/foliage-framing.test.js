import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FoliageFraming } from "../src/foliage-framing.js";
import { lodMaterial } from "../src/instance-lod.js";

function actor() {
  const avatar = new THREE.Group(),
    model = new THREE.Group(),
    camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 100),
    bones = {};
  avatar.add(model);
  for (const [name, x, y] of [
    ["Head", 0, 1.7],
    ["Hips", 0, 0.9],
    ["LeftHand", -0.42, 1.1],
    ["RightHand", 0.42, 1.1],
    ["LeftFoot", -0.15, 0.08],
    ["RightFoot", 0.15, 0.08],
  ]) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, 0);
    model.add(b);
    bones[name] = b;
  }
  camera.position.set(0, 1, 5);
  camera.lookAt(0, 1, 0);
  return { game: { avatar, rig: { model }, camera }, bones };
}
function patch(material, kind) {
  return {
    kind,
    tiers: [[new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)]],
  };
}
function dispose(patches) {
  for (const p of patches)
    for (const m of p.tiers.flat()) {
      m.geometry.dispose();
      m.material.dispose();
    }
}

test("foliage focus follows posed joints, arrival camera and portrait projection", () => {
  const { game, bones } = actor(),
    f = new FoliageFraming();
  f.update(game);
  const u = f.uniforms,
    wide = u.foliageFocusBounds.value.clone();
  assert.equal(u.foliageFocusEnabled.value, 1);
  bones.Head.position.y = 1.25;
  bones.Hips.position.y = 0.65;
  f.update(game);
  assert(
    u.foliageFocusBounds.value.w < wide.w,
    "lowered pose retains a standing-height opening",
  );
  bones.RightHand.position.x = 1.1;
  f.update(game);
  assert(
    u.foliageFocusBounds.value.z > wide.z,
    "extended hand remains outside the foliage opening",
  );
  game.avatar.position.x = 1.5;
  f.update(game);
  assert(u.foliageFocusBounds.value.x > 0.2, "frame follows only the old root");
  const landscape = u.foliageFocusBounds.value.z;
  game.camera.aspect = 0.6;
  game.camera.updateProjectionMatrix();
  f.update(game);
  assert(u.foliageFocusBounds.value.z > landscape * 2);
  assert.deepEqual(
    u.foliageFocusCamera.value.toArray(),
    game.camera.position.toArray(),
  );
  game.camera.position.z = 9;
  game.camera.lookAt(0, 1, 0);
  f.update(game);
  assert(u.foliageFocusDepth.value > 9);
  assert(u.foliageFocusBounds.value.z < landscape * 2.5);
  game.avatar.visible = false;
  f.update(game);
  assert.equal(u.foliageFocusEnabled.value, 0);
});

test("late plant batches are registered once while bark, rocks, buffers and depth materials remain intact", (t) => {
  const f = new FoliageFraming(),
    leaf = new THREE.MeshStandardMaterial({ name: "Leaves", alphaTest: 0.4 }),
    bark = new THREE.MeshStandardMaterial({ name: "Bark" }),
    rock = new THREE.MeshStandardMaterial({ name: "Stone" }),
    grass = new THREE.MeshStandardMaterial({ name: "Ground cover" }),
    plants = [patch(leaf), patch(bark)],
    rocks = [patch(rock, "rock"), patch(rock, "gravel")],
    ground = [];
  t.after(() => dispose([...plants, ...rocks, ...ground]));
  const depth = new THREE.MeshDepthMaterial();
  t.after(() => depth.dispose());
  plants[0].tiers[0][0].customDepthMaterial = depth;
  const versions = {
      leaf: leaf.version,
      bark: bark.version,
      rock: rock.version,
    },
    geometry = plants[0].tiers[0][0].geometry;
  const g = {
    forestPatches: plants,
    naturePatches: rocks,
    grassPatches: ground,
  };
  f.update(g);
  assert.equal(leaf.version, versions.leaf + 1);
  assert.equal(bark.version, versions.bark);
  assert.equal(rock.version, versions.rock);
  assert.equal(plants[0].tiers[0][0].geometry, geometry);
  assert.equal(plants[0].tiers[0][0].customDepthMaterial, depth);
  f.update(g);
  assert.equal(leaf.version, versions.leaf + 1);
  ground.push(patch(grass));
  f.update(g);
  assert.equal(grass.version, 1);
  assert.equal(ground[0].tiers[0][0].userData.excludeContact, true);
  const material = new THREE.MeshStandardMaterial({ alphaTest: 0.5 }),
    version = material.version,
    root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  t.after(() => {
    root.children[0].geometry.dispose();
    material.dispose();
  });
  g.templePatches = [{ root }];
  f.update(g);
  assert.equal(material.version, version + 1);
});

test("focus composes once with existing wind and LOD coverage without changing their shared inputs", () => {
  const material = new THREE.MeshStandardMaterial({ alphaTest: 0.4 }),
    wind = { value: 12 };
  let calls = 0;
  material.onBeforeCompile = function (shader) {
    assert.equal(this, material);
    calls++;
    shader.uniforms.wind = wind;
  };
  material.customProgramCacheKey = () => "wind-fixture";
  lodMaterial(material);
  const focus = new FoliageFraming();
  focus.material(material);
  focus.material(material);
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  assert.equal(calls, 1);
  assert.equal(shader.uniforms.wind, wind);
  assert.equal(
    shader.uniforms.foliageFocusEnabled,
    focus.uniforms.foliageFocusEnabled,
  );
  focus.uniforms.foliageFocusEnabled.value = 1;
  assert.equal(shader.uniforms.foliageFocusEnabled.value, 1);
  assert.equal(material.alphaTest, 0.4);
  assert.equal(material.transparent, false);
  material.dispose();
});

test("whole-clump metadata preserves wind bounds and the streamed instance and LOD attributes", async (t) => {
  const { createLodPatch } = await import("../src/instance-lod.js");
  const source = new THREE.BoxGeometry(1, 2, 1),
    material = new THREE.MeshStandardMaterial({ name: "Ground cover" }),
    world = new THREE.Group();
  source.computeBoundingSphere();
  source.boundingSphere.radius += 0.4;
  const { radius } = source.boundingSphere,
    matrices = [
      new THREE.Matrix4(),
      new THREE.Matrix4().makeTranslation(4, 0, 0),
    ],
    positions = [new THREE.Vector3(), new THREE.Vector3(4, 0, 0)];
  const p = createLodPatch(
    world,
    [[{ geometry: source, material }]],
    matrices,
    positions,
    { castShadow: false },
  );
  t.after(() => {
    for (const m of p.tiers.flat()) {
      m.dispose();
      m.geometry.dispose();
      m.customDepthMaterial.dispose();
    }
    source.dispose();
    material.dispose();
  });
  const m = p.tiers[0][0],
    matrixBytes = m.instanceMatrix.array.slice(),
    coverage = m.geometry.attributes.instanceCoverage;
  new FoliageFraming().update({ grassPatches: [p] });
  assert.equal(
    m.geometry.boundingSphere.radius,
    radius,
    "registration removes the wind culling margin",
  );
  assert.deepEqual(m.instanceMatrix.array, matrixBytes);
  assert.equal(m.geometry.attributes.instanceCoverage, coverage);
  assert.equal(m.geometry.attributes.position, source.attributes.position);
  const shape = m.geometry.attributes.foliageInstanceShape;
  assert.equal(shape.count, matrices.length);
  assert.equal(shape.getW(0), Math.fround(radius));
  assert.equal(shape.getW(1), shape.getW(0));
});
