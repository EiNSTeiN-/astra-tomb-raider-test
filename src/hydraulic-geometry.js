import * as THREE from "three";

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
  const points = [
    [0, 0.25],
    [r + 0.22, 0.25],
    [r + 0.3, 0.48],
    [r + 0.18, 0.65],
    [r + 0.17, 2.74],
    [r + 0.27, 2.85],
    [r + 0.27, 3.05],
    [r + 0.035, 3.05],
    [r, 2.9],
    [r, 0.7],
    [0, 0.7],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(points, segments);
  if (variant === 2) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      if (
        p.getY(i) > 0.6 &&
        p.getY(i) < 2.8 &&
        Math.hypot(p.getX(i), p.getZ(i)) > r + 0.1
      ) {
        const a = Math.atan2(p.getX(i), p.getZ(i)),
          scale = 1 + 0.018 * Math.cos(a * 16);
        p.setXYZ(i, p.getX(i) * scale, p.getY(i), p.getZ(i) * scale);
      }
    geometry.computeVertexNormals();
  }
  return geometry;
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
