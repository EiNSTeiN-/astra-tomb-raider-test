import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { hydraulicPumpGeometry } from "../src/hydraulic-pump-geometry.js";
import { stoneBlockGeometry } from "../src/temple-architecture.js";

test("pump castings have finite attributes, closed component surfaces and outward volume", () => {
  const counts = [];
  for (let variant = 0; variant < 3; variant++) {
    const g = hydraulicPumpGeometry(variant);
    try {
      for (const attribute of Object.values(g.attributes))
        assert(attribute.array.every(Number.isFinite));
      const p = g.attributes.position,
        edges = new Map();
      let volume = 0;
      const key = (i) =>
        [p.getX(i), p.getY(i), p.getZ(i)]
          .map((v) => Math.round(v * 1e5))
          .join(",");
      for (let i = 0; i < p.count; i += 3) {
        const [a, b, c] = [i, i + 1, i + 2].map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, j),
        );
        if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-10) continue;
        volume += a.dot(b.clone().cross(c)) / 6;
        for (let j = 0; j < 3; j++) {
          const edge = [key(i + j), key(i + ((j + 1) % 3))].sort().join("|");
          edges.set(edge, (edges.get(edge) || 0) + 1);
        }
      }
      assert([...edges.values()].every((n) => n === 2));
      assert(volume > 0.05 && volume < 0.2);
      counts.push(p.count);
    } finally {
      g.dispose();
    }
  }
  assert.equal(new Set(counts).size, 3);
  assert.throws(() => hydraulicPumpGeometry(3), RangeError);
});

test("new pump vertices preserve the existing body reservation and pedestal bearing", () => {
  let vertices = 0,
    feet = 0;
  for (let variant = 0; variant < 3; variant++) {
    const g = hydraulicPumpGeometry(variant),
      p = g.attributes.position;
    try {
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        // The rear pipe remains inside the adjoining cistern's existing body
        // box. The low casting occupies the pump's existing 0.44/0.43 margin;
        // its upper neck fits the old rectangular post exactly.
        const tank = Math.abs(x) <= 0.096 && z <= -0.26 && y <= 0.846;
        const pump =
          Math.abs(x) <= 0.44 && Math.abs(z) <= 0.43 && y <= 1.100001;
        const formerPost =
          Math.abs(x) <= 0.160001 && Math.abs(z) <= 0.135001 && y <= 1.460001;
        assert(tank || pump || formerPost);
        if (y < 0.45) {
          assert(Math.abs(x) < 0.37 && Math.abs(z) < 0.300001);
          assert(y >= 0.434999);
          feet++;
        }
        vertices++;
      }
    } finally {
      g.dispose();
    }
  }
  assert(vertices > 5000 && feet > 0);
});

test("castings clear the retained rotating rim and spokes while their axle meets the hub", () => {
  for (let variant = 0; variant < 3; variant++) {
    const g = hydraulicPumpGeometry(variant),
      p = g.attributes.position;
    let axle = 0;
    try {
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i) - 1.35,
          z = p.getZ(i),
          radius = Math.hypot(x, y);
        assert(Math.hypot(radius - 0.38, z - 0.13) > 0.055001);
        if (radius <= 0.11) {
          if (z > 0.04 && z < 0.1) axle++;
          continue;
        }
        for (let phase = 0; phase < 16; phase++)
          for (let spoke = 0; spoke < 4; spoke++) {
            const angle = (phase * Math.PI) / 8 + (spoke * Math.PI) / 4,
              px = x * Math.cos(angle) + y * Math.sin(angle),
              py = -x * Math.sin(angle) + y * Math.cos(angle);
            assert(
              Math.abs(px) > 0.030001 ||
                Math.abs(py) > 0.320001 ||
                z < 0.089999 ||
                z > 0.170001,
            );
          }
      }
      assert(axle > 0);
    } finally {
      g.dispose();
    }
  }
});

test("casting feet and fasteners seat on actual beveled plinths, while the former wide foot overhangs", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster(),
    down = new THREE.Vector3(0, -1, 0);
  let controls = 0,
    probes = 0;
  try {
    for (let seed = 1; seed <= 16; seed++) {
      const base = new THREE.Mesh(
        stoneBlockGeometry(0.74, 0.45, 0.6, seed),
        material,
      );
      base.position.y = 0.225;
      base.updateMatrixWorld(true);
      try {
        ray.set(new THREE.Vector3(0, 2, -0.3), down);
        const control = ray.intersectObject(base, false)[0];
        if (!control || control.point.y < 0.433) controls++;
        for (let variant = 0; variant < 3; variant++) {
          const g = hydraulicPumpGeometry(variant),
            p = g.attributes.position;
          try {
            for (let i = 0; i < p.count; i++) {
              if (p.getY(i) >= 0.45) continue;
              ray.set(new THREE.Vector3(p.getX(i), 2, p.getZ(i)), down);
              const hit = ray.intersectObject(base, false)[0];
              assert(hit && p.getY(i) < hit.point.y - 0.001);
              probes++;
            }
          } finally {
            g.dispose();
          }
        }
      } finally {
        base.geometry.dispose();
      }
    }
    assert(probes > 1000 && controls > 0);
  } finally {
    material.dispose();
  }
});
