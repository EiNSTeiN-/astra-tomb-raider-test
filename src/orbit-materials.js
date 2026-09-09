import * as THREE from "three";

// Share the observatories' credited texture maps, without changing their
// material tint, normal strength or texture repeat in the surrounding chapter.
export function orbitMaterials(game) {
  const masonry = (game.observatoryMaterials?.stone || game.stoneMat).clone(),
    paving = (game.observatoryMaterials?.dark || game.stoneMat).clone(),
    recess = (game.observatoryMaterials?.stone || game.darkMat).clone();
  for (const [material, name, color, normal] of [
    [masonry, "Orrery ashlar", 0xc4c9c3, 0.32],
    [paving, "Orrery fitted limestone", 0xd5d5c4, 0.24],
    [recess, "Orrery recessed stone", 0x53656a, 0.48],
  ]) {
    material.name = name;
    material.color.setHex(color);
    material.normalScale.setScalar(normal);
    material.roughness = 0.92;
    material.vertexColors = true;
  }
  return { masonry, paving, recess };
}

// Per-block variation survives batching into a single material draw. Geometry
// that shares these materials receives white vertex colors in the vault helper.
export function tintOrbitStone(geometry, seed) {
  const tone = 0.82 + (Math.sin(seed * 73.7) * 0.5 + 0.5) * 0.18,
    color = new THREE.Color(tone, tone * 0.99, tone * 0.965),
    colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
