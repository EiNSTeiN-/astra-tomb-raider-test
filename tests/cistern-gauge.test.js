import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cisternGeometry, cisternRadius } from "../src/hydraulic-geometry.js";
import {
  CISTERN_GAUGE,
  gaugeFrameGeometry,
  cisternGaugeAssets,
  buildCisternGauge,
  updateCisternGauge,
} from "../src/cistern-gauge.js";
import { hydraulicLampSupportGeometry } from "../src/hydraulic-lamp-geometry.js";
import { hydraulicPumpGeometry } from "../src/hydraulic-pump-geometry.js";

function disposeAssets(assets) {
  Object.values(assets).forEach((r) => r.dispose());
}
function closed(geometry) {
  const p = geometry.attributes.position,
    index = geometry.index?.array,
    indices = index || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  for (const a of Object.values(geometry.attributes))
    assert(a.array.every(Number.isFinite));
  const key = (i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join(",");
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]],
      [a, b, c] = tri.map((j) => new THREE.Vector3().fromBufferAttribute(p, j));
    if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-10) continue;
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const edge = [key(tri[j]), key(tri[(j + 1) % 3])].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert([...edges.values()].every((n) => n === 2));
  assert(volume > 0);
}

test("status-lamp sockets and braces are closed, seated into all pump casings and attached to the lens", () => {
  const support = hydraulicLampSupportGeometry(),
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster();
  try {
    closed(support);
    for (let variant = 0; variant < 3; variant++) {
      const casting = new THREE.Mesh(hydraulicPumpGeometry(variant), material);
      try {
        for (const point of [
          [0.035, 1.18, -0.035],
          [0.14, 0.92, -0.12],
        ]) {
          const p = new THREE.Vector3(...point);
          ray.set(
            p.clone().add(new THREE.Vector3(0, 0, 2)),
            new THREE.Vector3(0, 0, -1),
          );
          const hits = [
            ...new Set(
              ray
                .intersectObject(casting, false)
                .map((h) => Math.round(h.distance * 1e6) / 1e6),
            ),
          ];
          assert(hits.filter((d) => d < 2).length % 2 === 1);
        }
      } finally {
        casting.geometry.dispose();
      }
    }
    const socket = new THREE.Mesh(support, material);
    ray.set(new THREE.Vector3(0.55, 1.65, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(socket, false)[0];
    assert(hit && hit.distance < 0.11 && hit.distance > 0.05);
  } finally {
    support.dispose();
    material.dispose();
  }
});

test("sight gauges have closed finite frames, glass walls, liquid, float, scale and target geometry", () => {
  const assets = cisternGaugeAssets();
  try {
    for (const [name, geometry] of Object.entries(assets))
      if (name.endsWith("Geometry")) closed(geometry);
    for (let variant = 0; variant < 3; variant++) {
      const frame = gaugeFrameGeometry(17, variant);
      try {
        closed(frame);
      } finally {
        frame.dispose();
      }
    }
  } finally {
    disposeAssets(assets);
  }
});

test("actual bowl walls bear the brackets and clear the sight glass across all capacities and profiles", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster(),
    assets = cisternGaugeAssets(),
    guide = new THREE.Group(),
    direction = new THREE.Vector3(
      Math.sin(CISTERN_GAUGE.angle),
      0,
      Math.cos(CISTERN_GAUGE.angle),
    );
  let clearance = Infinity,
    anchors = 0;
  try {
    for (let capacity = 3; capacity <= 17; capacity++)
      for (let variant = 0; variant < 3; variant++) {
        const r = cisternRadius(capacity, variant),
          bowl = new THREE.Mesh(cisternGeometry(capacity, variant), material),
          gauge = buildCisternGauge(
            guide,
            r,
            capacity,
            1,
            { bronze: material, dark: material, goal: material, variant },
            assets,
          );
        gauge.root.updateMatrixWorld(true);
        try {
          for (const y of [0.59, 0.7, 1, 1.7, 2.8, 3.01])
            for (let n = 0; n < 16; n++) {
              const a = (n * Math.PI) / 8,
                point = new THREE.Vector3(
                  Math.sin(a) * 0.115,
                  y,
                  Math.cos(a) * 0.115,
                ).applyMatrix4(gauge.root.matrixWorld),
                outward = new THREE.Vector3(point.x, 0, point.z).normalize();
              ray.set(
                outward
                  .clone()
                  .multiplyScalar(r + 1)
                  .setY(y),
                outward.clone().negate(),
              );
              const hit = ray.intersectObject(bowl, false)[0];
              assert(hit);
              const gap =
                Math.hypot(point.x, point.z) -
                Math.hypot(hit.point.x, hit.point.z);
              clearance = Math.min(clearance, gap);
              assert(gap > 0.014);
            }
          for (const y of [0.565, 3.015]) {
            ray.set(
              direction
                .clone()
                .multiplyScalar(r + 1)
                .setY(y),
              direction.clone().negate(),
            );
            const distances = [
              ...new Set(
                ray
                  .intersectObject(bowl, false)
                  .map((h) => Math.round(h.distance * 1e6) / 1e6),
              ),
            ];
            assert(
              distances.length >= 2 &&
                distances[0] < 0.87 &&
                distances[1] > 0.87,
            );
            anchors++;
          }
          for (const mesh of gauge.root.children) {
            const p = mesh.geometry.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const point = new THREE.Vector3()
                .fromBufferAttribute(p, i)
                .applyMatrix4(mesh.matrixWorld);
              assert(
                Math.abs(point.x) <= r + 0.390001 &&
                  Math.abs(point.z) <= r + 0.390001,
              );
              assert(point.y <= 3.060001);
            }
          }
        } finally {
          gauge.frame.geometry.dispose();
          gauge.root.removeFromParent();
          bowl.geometry.dispose();
        }
      }
    assert(anchors === 90 && clearance > 0.014);
  } finally {
    material.dispose();
    disposeAssets(assets);
  }
});

test("rendered liquid tops and ceramic float centers follow the same water plane, including empty stops", () => {
  const assets = cisternGaugeAssets(),
    material = new THREE.MeshStandardMaterial(),
    tank = new THREE.Group(),
    gauge = buildCisternGauge(
      tank,
      1,
      17,
      7,
      { bronze: material, dark: material, goal: material, variant: 0 },
      assets,
    );
  try {
    for (let n = 0; n <= 32; n++) {
      const height = 0.7 + (n / 32) * 2.2;
      updateCisternGauge(gauge, height, n > 0);
      tank.updateMatrixWorld(true);
      const geometry = gauge.liquid.geometry.attributes.position;
      let top = -Infinity;
      for (let i = 0; i < geometry.count; i++)
        top = Math.max(
          top,
          new THREE.Vector3()
            .fromBufferAttribute(geometry, i)
            .applyMatrix4(gauge.liquid.matrixWorld).y,
        );
      assert(Math.abs(top - height) < 1e-6);
      assert(
        Math.abs(gauge.float.getWorldPosition(new THREE.Vector3()).y - height) <
          1e-6,
      );
      assert(gauge.liquid.visible === n > 0);
      assert(height - 0.08 >= 0.619999 && height + 0.08 < 3.01);
    }
    updateCisternGauge(gauge, 0.7, false);
    tank.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
        gauge.float.getWorldPosition(new THREE.Vector3()),
        new THREE.Vector3(0, -1, 0),
      ),
      seat = ray.intersectObject(gauge.frame, false)[0];
    assert(seat && Math.abs(seat.distance - 0.08) < 1e-6);
  } finally {
    gauge.frame.geometry.dispose();
    material.dispose();
    disposeAssets(assets);
  }
});
