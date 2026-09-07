import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  quartzGeometry,
  mineralMaterial,
  mineralTransmissionTargets,
  disposeMineralTransmission,
} from "../src/mineral-art.js";
import { mergeArchitecture } from "../src/visuals.js";
import { SolidContactPass } from "../src/rendering.js";

test("beveled quartz is a reproducible closed solid inside the established collision envelope", () => {
  for (const [radius, height] of [
    [0.18, 0.65],
    [0.66, 3.61],
    [0.75, 6.9],
  ])
    for (const phase of [0, 0.2, 1, 4.19]) {
      const geometry = quartzGeometry(radius, height, phase),
        p = geometry.attributes.position;
      const again = quartzGeometry(radius, height, phase);
      assert.deepEqual(p.array, again.attributes.position.array);
      assert.equal(p.count / 3, 96);
      for (const attribute of Object.values(geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite));
      const edges = new Map(),
        a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      const inside = new THREE.Vector3(0, height * 0.3, 0);
      const key = (v) => v.toArray().join(",");
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        assert.ok(normal.length() > 1e-10);
        assert.ok(
          normal.dot(a.clone().sub(inside)) > 0,
          "all faces point out of the solid",
        );
        for (const [v, w] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const av = key(v),
            bv = key(w),
            edge = [av, bv].sort().join("/");
          const entry = edges.get(edge) || { count: 0, direction: 0 };
          entry.count++;
          entry.direction += av < bv ? 1 : -1;
          edges.set(edge, entry);
        }
      }
      for (const edge of edges.values())
        assert.deepEqual(edge, { count: 2, direction: 0 });
      for (let i = 0; i < p.count; i++) {
        assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= radius + 1e-6);
        assert.ok(p.getY(i) >= 0 && p.getY(i) <= height + 1e-6);
      }
      geometry.dispose();
      again.dispose();
    }
});

test("batching tilted crystals preserves their independent inclusion coordinates and optical thickness", () => {
  const root = new THREE.Group(),
    material = mineralMaterial(0x9179c9, { value: 0.3 });
  const expected = [];
  for (let i = 0; i < 4; i++) {
    const geometry = quartzGeometry(0.25 + i * 0.14, 2 + i, i * 0.3);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(20 + i * 3, 11 + i, 50);
    mesh.rotation.set(0.2, 0.8 + i, -0.15);
    root.add(mesh);
    expected.push({
      coordinates: [...geometry.attributes.mineralCoord.array],
      sizes: [...geometry.attributes.mineralShape.array],
    });
  }
  mergeArchitecture(root);
  assert.equal(root.children.length, 1);
  const geometry = root.children[0].geometry;
  assert.deepEqual(
    [...geometry.attributes.mineralCoord.array],
    expected.flatMap((e) => e.coordinates),
  );
  assert.deepEqual(
    [...geometry.attributes.mineralShape.array],
    expected.flatMap((e) => e.sizes),
  );
  assert.ok(geometry.attributes.position.getX(0) > 19);
  geometry.dispose();
  material.dispose();
});

function compiled(material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
}

test("shared transmission targets from multiple camera draws are released once and lose sampler references", () => {
  const scene = new THREE.Scene(),
    geometry = quartzGeometry(0.7, 4);
  const materials = [
    mineralMaterial(0x779cd8, { value: 0 }),
    mineralMaterial(0x9179c9, { value: 1 }),
  ];
  materials.forEach((m) => scene.add(new THREE.Mesh(geometry, m)));
  const shaders = materials.map(compiled),
    first = new THREE.WebGLRenderTarget(64, 64),
    second = new THREE.WebGLRenderTarget(32, 32);
  const disposed = [0, 0];
  [first, second].forEach((t, i) =>
    t.addEventListener("dispose", () => disposed[i]++),
  );
  shaders[0].uniforms.transmissionSamplerMap.value = first.texture;
  materials[0].onBeforeRender();
  shaders.forEach(
    (s) => (s.uniforms.transmissionSamplerMap.value = second.texture),
  );
  assert.equal(mineralTransmissionTargets(scene).size, 2);
  disposeMineralTransmission(scene);
  assert.deepEqual(disposed, [1, 1]);
  assert.ok(
    shaders.every((s) => s.uniforms.transmissionSamplerMap.value === null),
  );
  assert.equal(mineralTransmissionTargets(scene).size, 0);
  disposeMineralTransmission(scene);
  assert.deepEqual(disposed, [1, 1]);
  geometry.dispose();
  materials.forEach((m) => m.dispose());
});

test("contact normals exclude transmissive crystals while restoring only previously visible objects", () => {
  const scene = new THREE.Scene(),
    geometry = quartzGeometry(0.6, 3),
    quartz = mineralMaterial(0x779cd8, { value: 0 });
  const visible = new THREE.Mesh(geometry, quartz),
    hidden = new THREE.Mesh(geometry, quartz);
  hidden.visible = false;
  const rock = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  scene.add(visible, hidden, rock);
  const pass = Object.assign(Object.create(SolidContactPass.prototype), {
    scene,
    _visibilityCache: [],
  });
  pass._overrideVisibility();
  assert.equal(visible.visible, false);
  assert.equal(hidden.visible, false);
  assert.equal(rock.visible, true);
  pass._restoreVisibility();
  assert.equal(visible.visible, true);
  assert.equal(hidden.visible, false);
  assert.equal(rock.visible, true);
  geometry.dispose();
  quartz.dispose();
  rock.geometry.dispose();
  rock.material.dispose();
});
