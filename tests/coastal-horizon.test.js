import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  coastalHorizonGeometry,
  buildCoastalHorizon,
} from "../src/coastal-horizon.js";
import { LEVELS, createMap } from "../src/campaign.js";

test("coastal islands have finite upward terrain and stay outside playable ground", () => {
  const extent = createMap(LEVELS[3]).size * 7;
  const geometry = coastalHorizonGeometry(extent);
  try {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    let lowestGap = Infinity;
    for (let i = 0; i < p.count; i++) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(n, i);
      assert([...a, ...b].every(Number.isFinite));
      assert(Math.abs(b.length() - 1) < 1e-6);
      assert(b.y > 0);
      const gap = Math.hypot(
        Math.max(0, -a.x, a.x - extent),
        Math.max(0, -a.z, a.z - extent),
      );
      lowestGap = Math.min(lowestGap, gap);
    }
    assert(
      lowestGap > 100,
      `Background must remain outside the playable square: ${lowestGap}`,
    );
    for (let i = 0; i < geometry.index.count; i += 3) {
      a.fromBufferAttribute(p, geometry.index.getX(i));
      b.fromBufferAttribute(p, geometry.index.getX(i + 1));
      c.fromBufferAttribute(p, geometry.index.getX(i + 2));
      assert(
        b.sub(a).cross(c.sub(a)).y > 0,
        "outward winding, no degenerate faces",
      );
    }
    const edges = new Map();
    for (let i = 0; i < geometry.index.count; i += 3) {
      const face = [0, 1, 2].map((j) => geometry.index.getX(i + j));
      for (let j = 0; j < 3; j++) {
        const edge = [face[j], face[(j + 1) % 3]]
          .sort((x, y) => x - y)
          .join(":");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
    for (const [edge, count] of edges) {
      assert(count <= 2, "no non-manifold edges");
      if (count === 1)
        for (const vertex of edge.split(":").map(Number))
          assert(
            p.getY(vertex) < -2.3,
            "open apron boundaries must remain submerged",
          );
    }
  } finally {
    geometry.dispose();
  }
});

test("the coastal background owns no gameplay obstacles or shadow/contact passes", () => {
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshPhysicalMaterial(),
  );
  sea.userData.sea = true;
  const game = {
    map: createMap(LEVELS[3]),
    world: new THREE.Group(),
    scene: { fog: { color: new THREE.Color(0xc4d2ce) } },
    sunOffset: new THREE.Vector3(-95, 72, 45),
    terrainMeshes: [
      {
        material: {
          userData: { terrainUniforms: { cliffMap: { value: null } } },
        },
      },
    ],
    obstacles: [],
    waterMeshes: [sea],
    camera: { far: 450 },
    cameraSurfaces: {
      capture() {
        assert.fail("background entered camera collision");
      },
    },
  };
  buildCoastalHorizon(game);
  const mesh = game.coastalHorizon;
  try {
    assert.equal(game.world.children.length, 1);
    assert.equal(game.obstacles.length, 0);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
    assert.equal(mesh.userData.excludeContact, true);
    assert.equal(
      game.waterMeshes.length,
      1,
      "distant sea does not enlarge the playable water volume",
    );
    assert.equal(
      game.coastalSea.material.transparent,
      false,
      "sea must render before opaque islands",
    );
    assert(game.coastalSea.renderOrder < mesh.renderOrder);
    assert.equal(game.coastalSea.material.depthWrite, false);
    let depthCleared = 0;
    mesh.onAfterRender({
      clearDepth() {
        depthCleared++;
      },
    });
    assert.equal(depthCleared, 1);
  } finally {
    mesh.traverse((o) => {
      o.geometry.dispose();
      o.material.dispose();
    });
    sea.geometry.dispose();
    sea.material.dispose();
  }
});
