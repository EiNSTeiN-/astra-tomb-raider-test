import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { propSupportHeight } from "../src/prop-support.js";
import { monasteryRoofGeometry } from "../src/monastery-roof.js";
import {
  buildDiscoveryProp,
  DISCOVERY_STYLES,
} from "../src/discovery-props.js";
import { supportAt } from "../src/character-motion.js";
import { stationBlocked } from "../src/field-station-solids.js";

test("curved prop support follows rendered triangles after rotation and geometry disposal", () => {
  const roof = new THREE.Mesh(
    monasteryRoofGeometry({ width: 1.8, depth: 1.3, rise: 0.22 }),
    new THREE.MeshStandardMaterial(),
  );
  roof.position.set(31, 12, -17);
  roof.rotation.y = Math.PI / 3;
  roof.updateMatrixWorld(true);
  const height = propSupportHeight(roof),
    ray = new THREE.Raycaster(),
    samples = [];
  for (let x = -0.75; x <= 0.75; x += 0.15)
    for (let z = -0.5; z <= 0.5; z += 0.125) {
      const p = roof.localToWorld(new THREE.Vector3(x, 0, z));
      ray.set(new THREE.Vector3(p.x, 30, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(roof)[0];
      assert(hit);
      assert(Math.abs(height(p.x, p.z) - hit.point.y) < 1e-6);
      samples.push({ x: p.x, z: p.z, y: hit.point.y });
    }
  roof.geometry.dispose();
  roof.removeFromParent();
  for (const p of samples) assert(Math.abs(height(p.x, p.z) - p.y) < 1e-6);
});

for (const biome of Object.keys(DISCOVERY_STYLES))
  test(`${biome} discovery stands and lids support feet on their visible surfaces`, () => {
    const m = Object.fromEntries(
      [
        "wood",
        "stone",
        "dark",
        "bronze",
        "trim",
        "paper",
        "ink",
        "metal",
        "leather",
        "cloth",
        "roof",
      ].map((k) => [k, new THREE.MeshStandardMaterial()]),
    );
    const g = {
      level: { seed: 21, biome },
      world: new THREE.Group(),
      obstacles: [],
      groundHeight: () => 10,
      progress: { found: [] },
      cameraSurfaces: { capture() {} },
    };
    const ray = new THREE.Raycaster();
    for (const [index, type] of [
      [0, "note"],
      [12, "treasure"],
    ]) {
      const f = {
        id: `${type}-${index}`,
        type,
        group: new THREE.Group(),
        marker: new THREE.Mesh(
          new THREE.OctahedronGeometry(0.18),
          new THREE.MeshBasicMaterial(),
        ),
        discovery: {
          x: index * 3,
          y: 10,
          z: 0,
          bottom: 9.85,
          stance: { yaw: Math.PI / 2 },
        },
      };
      f.group.position.set(f.discovery.x, 10, 0);
      f.group.add(f.marker);
      g.world.add(f.group);
      buildDiscoveryProp(g, f, m);
      g.world.updateMatrixWorld(true);
      const construction = f.group.children.find(
        (c) => c.isGroup && c !== f.core,
      );
      for (const dx of [-0.2, 0, 0.2])
        for (const dz of [-0.2, 0, 0.2]) {
          const x = f.discovery.x + dx,
            z = dz;
          ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(construction, true)[0];
          assert(hit);
          const floor = supportAt(g, x, z).height;
          assert(
            Math.abs(floor - hit.point.y) < 0.012,
            `${type} at ${dx},${dz}: physics ${floor}, mesh ${hit.point.y}`,
          );
          assert(
            !f.stationSolids.some((o) => stationBlocked(o, x, floor + 0.02, z)),
            "Supported feet must be able to leave the prop",
          );
        }
      assert(
        f.stationSolids.every((o) => typeof o.surfaceHeight === "function"),
      );
    }
  });
