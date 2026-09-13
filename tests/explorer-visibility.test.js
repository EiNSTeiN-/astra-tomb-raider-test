import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ExplorerVisibility } from "../src/explorer-visibility.js";
import { buildFireEffects } from "../src/effects.js";

test("close visibility shares an opaque mask across skin and gear, retains material hooks, and restores contact state", () => {
  const skin = new THREE.MeshStandardMaterial(),
    cloth = new THREE.MeshStandardMaterial(),
    flame = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }),
    group = new THREE.Group();
  cloth.onBeforeCompile = (shader) => {
    shader.uniforms.fabric = { value: 3 };
  };
  const key = cloth.customProgramCacheKey();
  for (const material of [skin, cloth, cloth, flame])
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  group.children[3].userData.excludeContact = true;
  const visibility = new ExplorerVisibility([group, null]);
  for (const material of [skin, cloth, flame]) {
    const shader = {
      uniforms: {},
      fragmentShader: "void main() {\n#include <clipping_planes_fragment>\n}",
    };
    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.explorerCoverage, visibility.uniform);
    assert.equal(
      shader.fragmentShader.split("uniform float explorerCoverage;").length,
      2,
    );
    if (material === cloth) assert.equal(shader.uniforms.fabric.value, 3);
  }
  assert.notEqual(cloth.customProgramCacheKey(), key);
  assert.equal(skin.transparent, false);
  assert.equal(skin.depthWrite, true);
  assert.equal(flame.opacity, 0.8);
  assert.equal(visibility.set(1), 0);
  assert(visibility.set(1.85) > 0 && visibility.uniform.value < 1);
  assert(group.children.every((m) => m.userData.excludeContact));
  assert(group.children.every((m) => m.visible));
  assert.equal(visibility.set(2.7), 1);
  assert(group.children.slice(0, 3).every((m) => !m.userData.excludeContact));
  assert.equal(group.children[3].userData.excludeContact, true);
  assert.equal(visibility.set(), 1);
  for (const mesh of group.children) mesh.geometry.dispose();
  for (const material of [skin, cloth, flame]) material.dispose();
});

test("carried fire fades independently of world fires while retaining its live animation clock", () => {
  const flame = () =>
      new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.5),
        new THREE.MeshBasicMaterial(),
      ),
    carried = flame(),
    stationary = flame(),
    g = {
      world: new THREE.Group(),
      flames: [carried, stationary],
      torch: { flame: carried },
    };
  buildFireEffects(g);
  assert.notEqual(carried.material, stationary.material);
  assert.equal(
    carried.material.uniforms.time,
    stationary.material.uniforms.time,
  );
  const visibility = new ExplorerVisibility([carried]),
    shader = {
      uniforms: { ...carried.material.uniforms },
      fragmentShader: carried.material.fragmentShader,
    };
  carried.material.onBeforeCompile(shader, {});
  assert(shader.fragmentShader.includes("explorerThreshold()) discard;"));
  assert(!stationary.material.fragmentShader.includes("explorerThreshold"));
  assert.equal(visibility.set(1), 0);
  g.fireTime.value = 25;
  assert.equal(shader.uniforms.time.value, 25);
  assert.equal(stationary.material.uniforms.time.value, 25);
  for (const mesh of g.flames) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
