import * as THREE from "three";
import { random } from "./campaign.js";

export function coastalSaltbushSpecimen() {
  const rng = random(491927),
    branches = [],
    leaves = [],
    vector = (x, y, z) => new THREE.Vector3(x, y, z),
    branch = (a, b, bottom, top) => branches.push({ a, b, bottom, top });
  branch(vector(0, 0, 0), vector(0, 0.24, 0), 0.043, 0.027);
  for (let arm = 0; arm < 8; arm++) {
    const angle = (arm * Math.PI) / 4 + (rng() - 0.5) * 0.16,
      shoulder = vector(
        Math.sin(angle) * 0.2,
        0.37 + rng() * 0.09,
        Math.cos(angle) * 0.2,
      ),
      reach = 0.44 + rng() * 0.13,
      tip = vector(
        Math.sin(angle) * reach,
        0.77 + rng() * 0.23,
        Math.cos(angle) * reach,
      );
    branch(vector(0, 0.17, 0), shoulder, 0.021, 0.012);
    branch(shoulder, tip, 0.012, 0.004);
    for (const fork of [-1, 0, 1]) {
      const start = fork ? shoulder.clone().lerp(tip, 0.26) : shoulder,
        theta = angle + fork * (0.4 + rng() * 0.12),
        end = fork
          ? vector(
              Math.sin(theta) * (reach + 0.07),
              tip.y - 0.09 + rng() * 0.08,
              Math.cos(theta) * (reach + 0.07),
            )
          : tip;
      if (fork) branch(start, end, 0.0075, 0.0028);
      for (let node = 0; node < 8; node++)
        for (const side of [-1, 1]) {
          const root = start.clone().lerp(end, (node + 0.55) / 8),
            orientation = theta + side * (0.9 + rng() * 0.38);
          leaves.push({
            root,
            angle: orientation,
            length: 0.09 + rng() * 0.045,
            width: 0.018 + rng() * 0.008,
            lift: 0.018 + rng() * 0.035,
            tone: 0.88 + rng() * 0.19,
          });
        }
    }
  }
  const roots = new Map(),
    wood = new THREE.Color(0x625c4d),
    leafBase = new THREE.Color(0x536c61),
    leafTip = new THREE.Color(0xa4b39e);
  let radius = 0,
    height = 0;
  const tiers = [0, 1, 2].map((tier) => {
    const positions = [],
      colors = [],
      normals = [];
    const vertex = (point, color, normal) => {
      const y = Math.abs(point.y) < 1e-7 ? 0 : point.y;
      positions.push(point.x, y, point.z);
      colors.push(color.r, color.g, color.b);
      normals.push(normal.x, normal.y, normal.z);
      if (y === 0)
        roots.set(`${point.x},${point.z}`, vector(point.x, 0, point.z));
      radius = Math.max(radius, Math.hypot(point.x, point.z) + 0.032);
      height = Math.max(height, y);
    };
    for (const b of branches) {
      const delta = b.b.clone().sub(b.a),
        q = new THREE.Quaternion().setFromUnitVectors(
          vector(0, 1, 0),
          delta.clone().normalize(),
        ),
        centre = b.a.clone().add(b.b).multiplyScalar(0.5),
        twig = new THREE.CylinderGeometry(
          b.top,
          b.bottom,
          delta.length(),
          [7, 6, 4][tier],
          1,
        ),
        p = twig.attributes.position,
        n = twig.attributes.normal;
      for (const i of twig.index.array)
        vertex(
          new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyQuaternion(q)
            .add(centre),
          wood,
          new THREE.Vector3().fromBufferAttribute(n, i).applyQuaternion(q),
        );
      twig.dispose();
    }
    for (let index = 0; index < leaves.length; index++) {
      // Alternate retained sides of paired leaves; each coarse tier is still
      // a subset of the preceding one, without stripping one side of a shoot.
      if ((index + Math.floor(index / 2)) % [1, 2, 4][tier]) continue;
      const leaf = leaves[index],
        s = Math.sin(leaf.angle),
        c = Math.cos(leaf.angle);
      const section = (t) =>
        [-1, 0, 1].map((side) => {
          const width =
            leaf.width *
            Math.sin(Math.PI * (0.035 + t * 0.95)) *
            [1, 1.15, 1.4][tier];
          return leaf.root
            .clone()
            .add(
              vector(
                s * leaf.length * t + c * side * width,
                leaf.lift * t +
                  Math.sin(Math.PI * t) * (side === 0 ? 0.006 : 0.0015),
                c * leaf.length * t - s * side * width,
              ),
            );
        });
      for (let segment = 0; segment < [4, 3, 2][tier]; segment++) {
        const a = segment / [4, 3, 2][tier],
          b = (segment + 1) / [4, 3, 2][tier],
          points = [...section(a), ...section(b)],
          order = [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5];
        for (let j = 0; j < order.length; j += 3) {
          const normal = points[order[j + 1]]
            .clone()
            .sub(points[order[j]])
            .cross(points[order[j + 2]].clone().sub(points[order[j]]))
            .normalize();
          if (normal.y < 0) normal.negate();
          normal.y += 0.4;
          normal.normalize();
          for (const i of order.slice(j, j + 3))
            vertex(
              points[i],
              leafBase
                .clone()
                .lerp(leafTip, 0.2 + (i < 3 ? a : b) * 0.8)
                .multiplyScalar(leaf.tone),
              normal,
            );
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute(
      "coastalBend",
      new THREE.Float32BufferAttribute(
        positions
          .filter((_, i) => i % 3 === 1)
          .map((y) => Math.min(1, y / 1.06)),
        1,
      ),
    );
    geometry.computeBoundingBox();
    geometry.boundingBox.expandByVector(vector(0.025, 0, 0.018));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 0.032;
    return geometry;
  });
  return {
    variant: 3,
    tiers,
    roots: [...roots.values()],
    radius,
    height,
    maxRootSpan: 0.06,
  };
}
