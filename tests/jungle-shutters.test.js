import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { jungleShutterGeometry } from "../src/jungle-shutters.js";

test("all jungle relief slabs are closed, outward-facing and seated inside the stone leaf", () => {
  for (let stage = 0; stage < 8; stage++)
    for (const side of [-1, 1]) {
      const g = jungleShutterGeometry(stage, side),
        p = g.attributes.position;
      const edges = new Map();
      let volume = 0;
      for (const attribute of Object.values(g.attributes))
        assert([...attribute.array].every(Number.isFinite));
      for (let i = 0; i < g.index.count; i += 3) {
        const points = [0, 1, 2].map((n) =>
          new THREE.Vector3().fromBufferAttribute(p, g.index.getX(i + n)),
        );
        assert(
          points[1]
            .clone()
            .sub(points[0])
            .cross(points[2].clone().sub(points[0]))
            .length() > 1e-9,
          "nondegenerate face",
        );
        volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
        const keys = points.map((v) =>
          v
            .toArray()
            .map((x) => Math.round(x * 1e6))
            .join(","),
        );
        for (let j = 0; j < 3; j++) {
          const a = keys[j],
            b = keys[(j + 1) % 3],
            key = [a, b].sort().join("|");
          const e = edges.get(key) || [0, 0];
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
      assert(volume > 3.5 && volume < 5);
      assert(Math.abs(g.boundingBox.min.z - 0.16) < 1e-6);
      // The underlying shutter ends at z=.24, so the rear is genuinely embedded.
      assert(g.boundingBox.min.z < 0.24 - 0.07);
      assert(g.boundingBox.max.z > 0.465 && g.boundingBox.max.z < 0.48);
      g.dispose();
    }
});

test("eight trial reliefs have distinct sculpted profiles with mirrored paired figures", () => {
  const fields = [];
  for (let stage = 0; stage < 8; stage++) {
    const left = jungleShutterGeometry(stage, -1),
      right = jungleShutterGeometry(stage, 1);
    const a = left.attributes.position,
      b = right.attributes.position,
      field = [];
    for (let j = 0; j <= 80; j++)
      for (let i = 0; i <= 64; i++) {
        const k = j * 65 + i;
        assert(
          Math.abs(a.getZ(k) - b.getZ(j * 65 + 64 - i)) <= 0.0061,
          "mirrored carving, with independent fine weathering",
        );
        field.push(a.getZ(k));
      }
    for (const previous of fields) {
      const different = field.filter(
        (z, i) => Math.abs(z - previous[i]) > 0.08,
      ).length;
      assert(
        different > 500,
        "different silhouettes across substantial areas, not just detail noise",
      );
    }
    fields.push(field);
    left.dispose();
    right.dispose();
  }
});
