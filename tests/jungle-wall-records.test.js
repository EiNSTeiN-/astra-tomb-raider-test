import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  jungleRecordPlan,
  jungleRecordGeometry,
  buildJungleWallRecord,
} from "../src/jungle-wall-records.js";

test("all eight painted slabs are closed outward solids with unpainted returns", () => {
  for (let stage = 0; stage < 8; stage++) {
    const plan = jungleRecordPlan(stage),
      g = jungleRecordGeometry(plan),
      p = g.attributes.position,
      coord = g.attributes.jungleRecordCoord,
      edges = new Map();
    let volume = 0,
      painted = 0,
      plain = 0;
    for (const a of Object.values(g.attributes))
      assert(a.array.every(Number.isFinite));
    for (let i = 0; i < coord.count; i++) {
      assert.equal(coord.getZ(i), stage);
      assert(coord.getX(i) >= 0 && coord.getX(i) <= 1);
      assert(coord.getY(i) >= 0 && coord.getY(i) <= 1);
      if (coord.getW(i)) {
        painted++;
        assert(g.attributes.normal.getZ(i) > 0.99);
      } else plain++;
    }
    for (let i = 0; i < g.index.count; i += 3) {
      const v = [0, 1, 2].map((k) =>
        new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i + k)),
      );
      assert(
        v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq() > 1e-14,
      );
      volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
      const keys = v.map((q) =>
        q
          .toArray()
          .map((n) => n.toFixed(6))
          .join(","),
      );
      for (let j = 0; j < 3; j++) {
        const a = keys[j],
          b = keys[(j + 1) % 3],
          key = [a, b].sort().join("|"),
          e = edges.get(key) || [0, 0];
        e[0]++;
        e[1] += a < b ? 1 : -1;
        edges.set(key, e);
      }
    }
    assert(
      [...edges.values()].every(
        ([count, direction]) => count === 2 && direction === 0,
      ),
    );
    assert(
      volume > plan.width * plan.height * 0.214 &&
        volume < plan.width * plan.height * 0.226,
    );
    assert(painted > 700 && plain > 500);
    g.dispose();
  }
});

test("assembled records embed every flat back in the retained core and stay within its old movement reservation", (t) => {
  let loads = 0;
  t.mock.method(THREE.TextureLoader.prototype, "load", () => {
    loads++;
    return new THREE.Texture();
  });
  const trim = new THREE.MeshStandardMaterial(),
    m = { trim };
  let backs = 0;
  for (let stage = 0; stage < 8; stage++) {
    const pieces = [],
      add = (g, material, x, y, z) => {
        const mesh = new THREE.Mesh(g, material);
        mesh.position.set(x, y, z);
        pieces.push(mesh);
        return mesh;
      };
    const record = buildJungleWallRecord(stage, 13, m, add);
    assert(record.frames.length > 40);
    for (const mesh of pieces) {
      mesh.updateMatrixWorld();
      const p = mesh.geometry.attributes.position,
        n = mesh.geometry.attributes.normal;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        mesh.matrixWorld,
      );
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld),
          normal = new THREE.Vector3()
            .fromBufferAttribute(n, i)
            .applyMatrix3(normalMatrix);
        assert(Math.abs(v.x) < 6.5 && v.y > 0.8 && v.y < 7);
        assert(v.z > -0.85 && v.z < -0.13);
        if (normal.z > 0.99) {
          backs++;
          assert(
            v.z > -0.4 && v.z < -0.14,
            "entire flat backing enters continuous wall stone",
          );
        }
      }
      mesh.geometry.dispose();
    }
  }
  assert(backs > 2000);
  assert.equal(loads, 1, "one atlas shared by eight chamber records");
  assert.equal(m.jungleRecord.userData.additionalTextures.length, 1);
  assert.equal(
    m.jungleRecord.userData.additionalTextures[0].colorSpace,
    THREE.SRGBColorSpace,
  );
  m.jungleRecord.userData.additionalTextures[0].dispose();
  m.jungleRecord.dispose();
  trim.dispose();
});
