import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const CISTERN_FLOOR = 0.7;
export const CISTERN_DEPTH = 2.2;
// Equal unit volumes despite the round, faceted and fluted bowl profiles.
export function cisternRadius(capacity, variant = 0) {
  const segments = variant === 1 ? 12 : 64;
  const area = (segments * Math.sin((2 * Math.PI) / segments)) / 2;
  return Math.sqrt((capacity * 0.6) / (area * CISTERN_DEPTH));
}
export function cisternGeometry(capacity, variant = 0) {
  const r = cisternRadius(capacity, variant),
    segments = variant === 1 ? 12 : 64;
  // Bed, foot, shaft and capital belong to one closed stone bowl. Only the
  // exterior changes: the measured inner wall, floor and water clearance stay.
  const profiles = [
    [
      [0.22, 0.25],
      [0.31, 0.39],
      [0.33, 0.49],
      [0.3, 0.56],
      [0.24, 0.61],
      [0.2, 0.72],
      [0.18, 0.81],
      [0.18, 1.35],
      [0.165, 1.38],
      [0.165, 1.4],
      [0.18, 1.43],
      [0.18, 2.52],
      [0.2, 2.61],
      [0.26, 2.68],
      [0.31, 2.78],
      [0.31, 2.84],
      [0.27, 2.9],
      [0.27, 3.05],
    ],
    [
      [0.22, 0.25],
      [0.33, 0.37],
      [0.33, 0.54],
      [0.22, 0.66],
      [0.205, 0.78],
      [0.205, 1.38],
      [0.18, 1.4],
      [0.18, 1.44],
      [0.205, 1.46],
      [0.205, 2.08],
      [0.18, 2.1],
      [0.18, 2.14],
      [0.205, 2.16],
      [0.205, 2.68],
      [0.3, 2.8],
      [0.3, 2.98],
      [0.27, 3.05],
    ],
    [
      [0.22, 0.25],
      [0.29, 0.37],
      [0.32, 0.47],
      [0.32, 0.52],
      [0.28, 0.61],
      [0.2, 0.73],
      [0.18, 0.82],
      [0.18, 1],
      [0.18, 1.7],
      [0.18, 2.4],
      [0.18, 2.5],
      [0.2, 2.61],
      [0.28, 2.73],
      [0.32, 2.8],
      [0.32, 2.86],
      [0.27, 2.97],
      [0.27, 3.05],
    ],
  ];
  const points = [
    [0, 0.25],
    ...(profiles[variant] || profiles[0]).map(([dr, y]) => [r + dr, y]),
    [r + 0.035, 3.05],
    [r, 2.9],
    [r, CISTERN_FLOOR],
    [0, CISTERN_FLOOR],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  // Put the UV seam at the back. Even angular counts retain the original
  // circular/faceted water boundary after this half-turn.
  const geometry = new THREE.LatheGeometry(points, segments, Math.PI),
    positions = geometry.attributes.position;
  if (variant === 2) {
    for (let i = 0; i < positions.count; i++) {
      const point = points[i % points.length],
        y = positions.getY(i);
      if (point.x <= r + 0.1 || y < 0.73 || y > 2.68) continue;
      const angle = Math.atan2(positions.getX(i), positions.getZ(i)),
        fade =
          THREE.MathUtils.smoothstep(y, 0.74, 0.94) *
          (1 - THREE.MathUtils.smoothstep(y, 2.48, 2.68)),
        radius = point.x - 0.045 * (1 - Math.cos(angle * 8)) * fade;
      positions.setXYZ(
        i,
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius,
      );
    }
    geometry.computeVertexNormals();
    const normal = geometry.attributes.normal,
      n = new THREE.Vector3();
    for (let row = 0; row < points.length; row++) {
      const last = segments * points.length + row;
      n.fromBufferAttribute(normal, row)
        .add(new THREE.Vector3().fromBufferAttribute(normal, last))
        .normalize();
      normal.setXYZ(row, n.x, n.y, n.z);
      normal.setXYZ(last, n.x, n.y, n.z);
    }
  }
  // Approximately two metres per stone texture repeat around the shaft.
  // An integer turn count closes the seam; profile arc length prevents the
  // original equal-row UVs from stretching a whole wall between two rings.
  const turns = Math.max(1, Math.round(Math.PI * (r + 0.18))),
    lengths = [0],
    uv = geometry.attributes.uv;
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  for (let i = 0; i < positions.count; i++)
    uv.setXY(
      i,
      (Math.floor(i / points.length) / segments) * turns,
      lengths[i % points.length] / 2,
    );
  const expanded = geometry.toNonIndexed();
  geometry.dispose();
  if (variant === 1) expanded.computeVertexNormals();
  const p = expanded.attributes.position,
    tex = expanded.attributes.uv;
  for (let i = 0; i < p.count; i += 3)
    if (
      Math.abs(p.getY(i) - p.getY(i + 1)) < 1e-7 &&
      Math.abs(p.getY(i) - p.getY(i + 2)) < 1e-7
    )
      for (let j = i; j < i + 3; j++)
        tex.setXY(j, p.getX(j) / 2, p.getZ(j) / 2);
  // Keep the new UV/normal seams without retaining a full triangle soup.
  const result = mergeVertices(expanded, 1e-6);
  expanded.dispose();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
export function hydraulicPlaque(
  text,
  width = 2,
  color = "#e4d3a2",
  fontSize = 42,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px Georgia`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 384, 64, 748);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 6),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
}
export function hydraulicStreamMaterial(time) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x73aeb9,
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    ior: 1.333,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hydraulicTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float hydraulicTime;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.xz*=1.+.08*sin(position.y*18.-hydraulicTime*8.);",
      );
  };
  material.customProgramCacheKey = () => "hydraulic-falling-water-1";
  return material;
}
