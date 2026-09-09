import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";

// One crown description drives every detail tier. Leaflet placement and color
// do not consume the frond RNG, so reducing detail cannot rearrange the crown.
export function palmFronds(variant, bend, height) {
  const rng = random(1170 + variant);
  return Array.from({ length: 32 }, (_, f) => {
    const angle = f * 2.39996 + (rng() - 0.5) * 0.55,
      young = f < 6,
      old = f >= 24,
      length = young ? 1.5 + rng() * 1.2 : 3.6 + rng() * 1.6,
      lift = young ? 3.8 + rng() : old ? 1.3 + rng() : 2.8 + rng(),
      tip = young ? 3.5 + rng() * 1.3 : old ? -1.2 - rng() * 1.6 : rng() * 1.5,
      direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
      root = new THREE.Vector3(bend, height - f * 0.021, 0).addScaledVector(
        direction,
        0.13,
      ),
      point = (r, y, s = 0) =>
        root
          .clone()
          .addScaledVector(direction, r)
          .addScaledVector(side, s)
          .add(new THREE.Vector3(0, y, 0)),
      curve = new THREE.CubicBezierCurve3(
        root,
        point(length * 0.16, lift * 0.72),
        point(length * 0.68, lift, (rng() - 0.5) * 0.4),
        point(length, tip, (rng() - 0.5) * 0.6),
      );
    return { curve, side, old, young, seed: 7919 + variant * 179 + f * 73 };
  });
}

export function palmCrownGeometry(variant, bend, height, tier) {
  const fronds = palmFronds(variant, bend, height),
    parts = [],
    positions = [],
    colors = [],
    uvs = [],
    motion = [],
    leafletStride = [1, 2, 4][tier],
    // Width compensation retains the distant silhouette as leaflets thin out.
    widthScale = [1, 1.35, 1.7][tier];
  let bladeCount = 0;
  for (const { curve, side, old, young, seed } of fronds) {
    const stalk = new THREE.TubeGeometry(
        curve,
        [14, 9, 6][tier],
        0.024,
        3,
        false,
      ),
      stalkColors = [],
      stalkMotion = [];
    for (let i = 0; i < stalk.attributes.position.count; i++) {
      const t = stalk.attributes.uv.getX(i),
        center = curve.getPointAt(t),
        point = new THREE.Vector3().fromBufferAttribute(
          stalk.attributes.position,
          i,
        );
      point
        .sub(center)
        .multiplyScalar(1.6 - t * 1.52)
        .add(center);
      stalk.attributes.position.setXYZ(i, point.x, point.y, point.z);
      stalkColors.push(old ? 0.27 : 0.22, old ? 0.23 : 0.29, 0.12);
      stalkMotion.push(t * t, 0);
    }
    stalk.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(stalkColors, 3),
    );
    stalk.setAttribute(
      "palmMotion",
      new THREE.Float32BufferAttribute(stalkMotion, 2),
    );
    stalk.computeVertexNormals();
    parts.push(stalk.toNonIndexed());
    stalk.dispose();

    for (let i = 0; i < 48; i += leafletStride)
      for (const sign of [-1, 1]) {
        const rng = random(seed + i * 349 + (sign + 1) * 101),
          t = 0.075 + ((i + rng() * 0.45 + (sign < 0 ? 0.25 : 0)) / 48) * 0.91,
          point = curve.getPointAt(t),
          tangent = curve.getTangentAt(t).normalize(),
          up = side.clone().cross(tangent).normalize(),
          // Alternating groups leave each side in several planes, rather than
          // making a broad flat comb. Basal leaflets remain short and spiny.
          plane =
            ((Math.floor(i / 3) % 3) - 1) * 0.33 + 0.28 + (rng() - 0.5) * 0.28,
          sweep = 0.18 + rng() * 0.5,
          direction = side
            .clone()
            .multiplyScalar(sign * Math.cos(plane))
            .addScaledVector(up, Math.sin(plane))
            .addScaledVector(tangent, sweep)
            .normalize(),
          across = up.clone().cross(direction).normalize(),
          normal = direction.clone().cross(across).normalize(),
          reach =
            (0.14 + Math.sin(Math.PI * t) ** 0.7 * (young ? 0.63 : 0.92)) *
            (0.72 + rng() * 0.46) *
            Math.min(1, t / 0.18),
          width = (0.034 + rng() * 0.012) * widthScale * Math.min(1, t / 0.2),
          curl = (old ? 0.12 : 0.045) + rng() * 0.055,
          shade = 0.78 + rng() * 0.36,
          color = new THREE.Color().setRGB(
            0.16 * shade,
            0.235 * shade,
            0.115 * shade,
          );
        if (old)
          color.lerp(
            new THREE.Color().setRGB(0.31, 0.245, 0.12),
            0.28 + rng() * 0.35,
          );
        const vertex = (s, edge = 0) => {
          const spread = Math.sin(Math.PI * s) ** 0.55 * width,
            center = point
              .clone()
              .addScaledVector(direction, s * reach)
              .addScaledVector(normal, -curl * s * s),
            position = center
              .addScaledVector(across, edge * spread)
              .addScaledVector(normal, Math.abs(edge) * spread * 0.65),
            tint = color.clone().multiplyScalar(edge ? 1.08 : 0.91);
          if (s > 0.78)
            tint.lerp(
              new THREE.Color().setRGB(0.34, 0.29, 0.16),
              old ? 0.42 : 0.1,
            );
          return {
            position,
            color: tint,
            uv: [edge * 0.5 + 0.5, s],
            motion: [t * t, s * s],
          };
        };
        const emit = (...vertices) => {
          for (const v of vertices) {
            positions.push(...v.position.toArray());
            colors.push(v.color.r, v.color.g, v.color.b);
            uvs.push(...v.uv);
            motion.push(...v.motion);
          }
        };
        const root = vertex(0),
          tip = vertex(1),
          a = [
            vertex(tier === 0 ? 0.3 : 0.48, -1),
            vertex(tier === 0 ? 0.3 : 0.48),
            vertex(tier === 0 ? 0.3 : 0.48, 1),
          ];
        if (tier === 2) {
          emit(root, a[0], tip);
          emit(root, tip, a[2]);
        } else {
          emit(root, a[0], a[1]);
          emit(root, a[1], a[2]);
          const b =
            tier === 0 ? [vertex(0.72, -1), vertex(0.72), vertex(0.72, 1)] : a;
          if (tier === 0)
            for (let j = 0; j < 2; j++) {
              emit(a[j], b[j], b[j + 1]);
              emit(a[j], b[j + 1], a[j + 1]);
            }
          emit(b[0], tip, b[1]);
          emit(b[1], tip, b[2]);
        }
        bladeCount++;
      }
  }
  const blades = new THREE.BufferGeometry();
  blades.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  blades.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  blades.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  blades.setAttribute(
    "palmMotion",
    new THREE.Float32BufferAttribute(motion, 2),
  );
  blades.computeVertexNormals();
  const bladeStart = parts.reduce(
    (sum, g) => sum + g.attributes.position.count,
    0,
  );
  parts.push(blades);
  const foliage = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  foliage.computeBoundingBox();
  foliage.computeBoundingSphere();
  // Include the maximum shader displacement in the source and instance bounds.
  foliage.boundingSphere.radius += 0.4;
  foliage.boundingBox.expandByScalar(0.4);
  foliage.userData = { fronds: fronds.length, blades: bladeCount, bladeStart };
  return foliage;
}
