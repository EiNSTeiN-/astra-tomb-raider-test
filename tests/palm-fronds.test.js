import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { palmGeometry, buildDesertPalms } from "../src/desert-palms.js";
import { LEVELS, createMap } from "../src/campaign.js";

test("folded palm blades are nondegenerate and retain their attachment positions across detail tiers", () => {
  for (let variant = 0; variant < 3; variant++) {
    let nearRoots;
    for (let tier = 0; tier < 3; tier++) {
      const { trunk, foliage } = palmGeometry(variant, tier),
        { position: p, uv, palmMotion: motion } = foliage.attributes,
        roots = new Set();
      assert.equal(p.count, motion.count);
      for (let i = foliage.userData.bladeStart; i < p.count; i++) {
        if (uv.getY(i) === 0) {
          assert.equal(
            motion.getY(i),
            0,
            "no tip flutter at the leaflet attachment",
          );
          roots.add([p.getX(i), p.getY(i), p.getZ(i)].join(","));
        }
        assert(motion.getX(i) >= 0 && motion.getX(i) <= 1);
        assert(motion.getY(i) >= 0 && motion.getY(i) <= 1);
      }
      assert.equal(roots.size, foliage.userData.blades);
      if (tier === 0) nearRoots = roots;
      else
        for (const root of roots)
          assert(nearRoots.has(root), "detail reduction moved a leaf root");
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        assert(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-15,
          "degenerate blade or tapered stalk",
        );
      }
      trunk.dispose();
      foliage.dispose();
    }
  }
});

test("built palms share wind and coverage with their shadows and reserve displacement in their bounds", (t) => {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const game = {
    level: LEVELS[1],
    map: createMap(LEVELS[1]),
    world: new THREE.Group(),
    groundHeight: () => 0,
  };
  buildDesertPalms(game);
  const materials = new Set();
  for (const patch of game.palmPatches)
    for (const tier of patch.tiers) {
      const foliage = tier[1],
        shaders = [foliage.material, foliage.customDepthMaterial].map(
          (material) => {
            const shader = {
              uniforms: {},
              vertexShader: "#include <common>\n#include <begin_vertex>",
              fragmentShader:
                "#include <common>\n#include <alphatest_fragment>",
            };
            material.onBeforeCompile(shader, {});
            return shader;
          },
        );
      assert.equal(shaders[0].uniforms.palmTime, game.palmWind);
      assert.equal(shaders[1].uniforms.palmTime, game.palmWind);
      assert.equal(shaders[0].vertexShader, shaders[1].vertexShader);
      assert.match(shaders[0].vertexShader, /attribute vec2 palmMotion/);
      assert.match(shaders[0].fragmentShader, /vInstanceCoverage/);
      const { position: p, palmMotion: motion } = foliage.geometry.attributes,
        point = new THREE.Vector3();
      let anchors = 0;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i);
        // Bound the complete shader displacement, regardless of wind phase.
        const displacement = Math.hypot(
          motion.getX(i) * 0.24,
          motion.getX(i) * 0.18,
          motion.getY(i) * 0.028,
        );
        assert(
          point.distanceTo(foliage.geometry.boundingSphere.center) +
            displacement <=
            foliage.geometry.boundingSphere.radius + 1e-6,
        );
        if (motion.getX(i) === 0 && motion.getY(i) === 0) anchors++;
      }
      assert(anchors >= 32, "each frond has a fixed base");
      for (const mesh of tier) {
        materials.add(mesh.material);
        mesh.geometry.dispose();
        mesh.customDepthMaterial.dispose();
        mesh.dispose();
      }
    }
  for (const material of materials) {
    material.map?.dispose();
    material.normalMap?.dispose();
    material.roughnessMap?.dispose();
    material.dispose();
  }
});
