import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CISTERN_FLOOR, CISTERN_DEPTH } from "./hydraulic-geometry.js";

export const CISTERN_GAUGE = {
  angle: -Math.PI / 4,
  offset: 0.45,
  outer: 0.115,
  inner: 0.108,
  bottom: 0.59,
  top: 3.01,
  liquidBed: 0.62,
  floatRadius: 0.08,
};

export function gaugeTubeGeometry(inner, outer, bottom, top, segments = 32) {
  return new THREE.LatheGeometry(
    [
      [outer, bottom],
      [outer, top],
      [inner, top],
      [inner, bottom],
      [outer, bottom],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

export function gaugeFrameGeometry(capacity, variant = 0) {
  const parts = [];
  const part = (geometry, x = 0, y = 0, z = 0) => {
    geometry.translate(x, y, z);
    const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
    if (expanded !== geometry) geometry.dispose();
    parts.push(expanded);
  };
  const box = (w, h, d, x, y, z) =>
    part(new THREE.BoxGeometry(w, h, d), x, y, z);
  for (const y of [0.565, 3.015]) {
    part(
      gaugeTubeGeometry(
        0.104,
        0.14,
        y - 0.04,
        y + 0.04,
        variant === 1 ? 12 : 32,
      ),
    );
    // The inner ends lie in the closed bowl wall; the outer ends overlap cups.
    box(0.06, 0.055, 0.26, 0, y, -0.19);
    box(0.26, 0.055, 0.055, -0.1, y, -0.05);
  }
  // The empty indicator rests on this sealed seat at the zero-height datum.
  part(new THREE.CylinderGeometry(0.112, 0.112, 0.02, 32), 0, 0.61, 0);
  for (const x of [-0.27, -0.13]) box(0.018, 2.45, 0.06, x, 1.815, -0.05);
  for (let n = 0; n <= capacity; n++)
    box(
      n % 5 === 0 ? 0.105 : 0.08,
      0.018,
      0.012,
      -0.2,
      CISTERN_FLOOR + (n / capacity) * CISTERN_DEPTH,
      -0.025,
    );
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geometry.name = "Seated sight-gauge frame";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function cisternGaugeAssets() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.06, -0.025);
  for (const [x, y] of [
    [0.025, -0.025],
    [0.025, -0.05],
    [0.07, 0],
    [0.025, 0.05],
    [0.025, 0.025],
    [-0.06, 0.025],
  ])
    shape.lineTo(x, y);
  shape.closePath();
  return {
    glassGeometry: gaugeTubeGeometry(
      CISTERN_GAUGE.inner,
      CISTERN_GAUGE.outer,
      CISTERN_GAUGE.bottom,
      CISTERN_GAUGE.top,
    ),
    liquidGeometry: new THREE.CylinderGeometry(0.095, 0.095, 1, 24),
    floatGeometry: new THREE.SphereGeometry(CISTERN_GAUGE.floatRadius, 16, 12),
    scaleGeometry: new THREE.BoxGeometry(0.12, 2.45, 0.04),
    targetGeometry: new THREE.ExtrudeGeometry(shape, {
      depth: 0.02,
      bevelEnabled: false,
      steps: 1,
    }),
    glassMaterial: new THREE.MeshPhysicalMaterial({
      name: "Cistern sight glass",
      color: 0xd0e7e6,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    liquidMaterial: new THREE.MeshPhysicalMaterial({
      name: "Sight-gauge water column",
      color: 0x367c86,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.75,
      emissive: 0x102f36,
      emissiveIntensity: 0.09,
    }),
    floatMaterial: new THREE.MeshStandardMaterial({
      name: "Sight-gauge ceramic float",
      color: 0x8ec7c3,
      emissive: 0x164645,
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.3,
    }),
  };
}

export function buildCisternGauge(
  tank,
  radius,
  capacity,
  target,
  materials,
  assets,
) {
  const root = new THREE.Group(),
    distance = radius + CISTERN_GAUGE.offset;
  root.name = "Cistern sight gauge";
  root.position.set(
    Math.sin(CISTERN_GAUGE.angle) * distance,
    0,
    Math.cos(CISTERN_GAUGE.angle) * distance,
  );
  root.rotation.y = CISTERN_GAUGE.angle;
  tank.add(root);
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const frame = add(
      gaugeFrameGeometry(capacity, materials.variant),
      materials.bronze,
    ),
    scale = add(assets.scaleGeometry, materials.dark, -0.2, 1.815, -0.05),
    glass = add(assets.glassGeometry, assets.glassMaterial),
    liquid = add(assets.liquidGeometry, assets.liquidMaterial),
    float = add(assets.floatGeometry, assets.floatMaterial),
    goal = add(
      assets.targetGeometry,
      materials.goal,
      -0.2,
      CISTERN_FLOOR + (target / capacity) * CISTERN_DEPTH,
      -0.031,
    );
  glass.castShadow = liquid.castShadow = false;
  glass.userData.excludeContact = true;
  float.userData.animated = liquid.userData.animated = true;
  const gauge = {
    root,
    frame,
    scale,
    glass,
    liquid,
    float,
    goal,
    liquidBed: CISTERN_GAUGE.liquidBed,
  };
  updateCisternGauge(gauge, CISTERN_FLOOR, false);
  return gauge;
}

export function updateCisternGauge(gauge, height, hasWater) {
  gauge.float.position.y = height;
  gauge.liquid.position.y = (gauge.liquidBed + height) / 2;
  gauge.liquid.scale.y = height - gauge.liquidBed;
  gauge.liquid.visible = hasWater;
}
