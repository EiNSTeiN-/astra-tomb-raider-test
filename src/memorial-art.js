import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { vaultStoneGeometry } from "./palace-geometry.js";

// The memorial occupies the existing flooded room; all masonry stays below its
// ceiling. Narrow bounds follow each vault sector instead of blocking the nave.
export function buildMemorialArt(game, { add, block, bronze, trim, glass }) {
  const gallery = game.sunkenGallery,
    o = gallery.profile.origin;
  const solidMesh = (mesh) => {
    mesh.updateMatrixWorld(true);
    gallery.solids.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  };
  // Recessed mortar closes the narrow joints behind the individual voussoirs.
  add(
    vaultStoneGeometry(6.29, 6.72, 0, Math.PI, 9.98, 72),
    game.darkMat,
    o.x - 8,
    o.y - 5.8,
    o.z + 48,
  ).scale.y = 0.4;
  for (let bay = 0; bay < 6; bay++) {
    const z = o.z + 43.825 + bay * 1.65;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 24 + 0.002;
      const b = ((i + 1) * Math.PI) / 24 - 0.002;
      const stone = add(
        vaultStoneGeometry(6.25, 6.65, a, b, 1.63, 3),
        game.stoneMat,
        o.x - 8,
        o.y - 5.8,
        z,
      );
      stone.scale.y = 0.4;
      solidMesh(stone);
    }
  }
  for (const z of [43.3, 47.8, 52.2]) {
    for (let i = 0; i < 24; i++) {
      const stone = add(
        vaultStoneGeometry(
          6.04,
          6.32,
          (i * Math.PI) / 24 + 0.003,
          ((i + 1) * Math.PI) / 24 - 0.003,
          0.32,
          3,
        ),
        game.stoneMat,
        o.x - 8,
        o.y - 5.8,
        o.z + z,
      );
      stone.scale.y = 0.4;
      solidMesh(stone);
    }
    for (const side of [-1, 1]) {
      const x = o.x - 8 + side * 6.1;
      block(x, o.y - 7.13, o.z + z, 0.58, 2.74, 0.48, game.stoneMat, true);
      block(x, o.y - 8.3, o.z + z, 0.82, 0.4, 0.72, game.stoneMat, true);
      block(x, o.y - 5.88, o.z + z, 0.78, 0.3, 0.64, game.stoneMat, true);
    }
  }
  // A continuous backing seals the relief's edges; the loaded carving faces
  // into the room, away from the rear wall. Its collision also covers its depth.
  block(o.x - 8, o.y - 5.7, o.z + 52.8, 6.72, 3.42, 0.28, game.stoneMat, true);
  gallery.solids.push({
    min: { x: o.x - 11.3, y: o.y - 7.35, z: o.z + 52.45 },
    max: { x: o.x - 4.7, y: o.y - 4.05, z: o.z + 52.68 },
  });
  for (const side of [-1, 1]) {
    block(
      o.x - 8 + side * 3.55,
      o.y - 5.7,
      o.z + 52.57,
      0.3,
      3.8,
      0.42,
      game.stoneMat,
      true,
    );
    block(
      o.x - 8,
      o.y - 5.7 + side * 1.82,
      o.z + 52.57,
      7.4,
      0.23,
      0.42,
      game.stoneMat,
      true,
    );
  }
  // Narrow recesses and offerings flank the central route, below the vault.
  for (const side of [-1, 1])
    for (const z of [45.5, 50.1]) {
      const x = o.x - 8 + side * 6.52;
      block(x, o.y - 7.05, o.z + z, 0.2, 1.9, 1.52, game.darkMat, true);
      for (const offset of [-0.86, 0.86])
        block(
          x - side * 0.16,
          o.y - 7.05,
          o.z + z + offset,
          0.38,
          2.2,
          0.2,
          game.stoneMat,
          true,
        );
      for (const y of [-8.08, -6.02])
        block(
          x - side * 0.16,
          o.y + y,
          o.z + z,
          0.48,
          0.2,
          1.94,
          game.stoneMat,
          true,
        );
      const urn = add(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.15, 0),
            new THREE.Vector2(0.27, 0.14),
            new THREE.Vector2(0.3, 0.43),
            new THREE.Vector2(0.13, 0.67),
            new THREE.Vector2(0.12, 0.76),
            new THREE.Vector2(0.17, 0.79),
            new THREE.Vector2(0.13, 0.82),
            new THREE.Vector2(0.08, 0.75),
            new THREE.Vector2(0.08, 0.67),
            new THREE.Vector2(0.2, 0.4),
            new THREE.Vector2(0.1, 0.12),
            new THREE.Vector2(0, 0.12),
          ],
          24,
        ),
        bronze,
        x - side * 0.25,
        o.y - 7.98,
        o.z + z,
      );
      solidMesh(urn);
    }
  const r = gallery.profile.record;
  block(r.x, o.y - 8.3, r.z, 2.85, 0.4, 1.75, game.stoneMat, true);
  block(r.x, o.y - 7.88, r.z, 2.3, 0.46, 1.2, game.stoneMat, true);
  block(r.x, o.y - 7.54, r.z, 2.6, 0.22, 1.5, game.stoneMat, true);
  for (const x of [-0.48, 0.48])
    block(r.x + x, o.y - 7.4, r.z, 0.12, 0.12, 0.28, trim);
  // A caged phosphor-glass lamp hangs below the vault, with a visible suspension.
  const lampZ = o.z + 49.65;
  gallery.solids.push({
    min: { x: o.x - 8.25, y: o.y - 4.22, z: lampZ - 0.25 },
    max: { x: o.x - 7.75, y: o.y - 3.3, z: lampZ + 0.25 },
  });
  add(
    new THREE.CylinderGeometry(0.025, 0.025, 0.52, 8),
    trim,
    o.x - 8,
    o.y - 3.57,
    lampZ,
  );
  add(new THREE.SphereGeometry(0.2, 20, 12), glass, o.x - 8, o.y - 3.99, lampZ);
  for (const y of [-3.8, -4.18])
    add(
      new THREE.CylinderGeometry(0.24, 0.24, 0.055, 20),
      bronze,
      o.x - 8,
      o.y + y,
      lampZ,
    );
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    add(
      new THREE.CylinderGeometry(0.012, 0.012, 0.38, 6),
      trim,
      o.x - 8 + Math.cos(a) * 0.215,
      o.y - 3.99,
      lampZ + Math.sin(a) * 0.215,
    );
  }
  const light = new THREE.PointLight(0x9fc8bd, 24, 14, 2);
  light.position.set(o.x - 8, o.y - 4.05, lampZ);
  gallery.root.add(light);
  gallery.lights.push(light);
}

export async function loadMemorialArt(game) {
  const gallery = game.sunkenGallery;
  if (!gallery) return;
  const gltf = await new GLTFLoader(game.assetBatch?.manager).loadAsync(
    "/assets/memorial/evacuation-relief.glb",
  );
  const stale = game.sunkenGallery !== gallery;
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      m.dispose();
    if (stale) mesh.geometry.dispose();
  });
  if (stale) return;
  const material = game.stoneMat.clone();
  material.name = "Submerged memorial carving";
  // Strong marble veins obscure the shallow figures. Keep the stone's grain
  // and roughness, with a quiet base color that lets the modeled relief read.
  material.map = null;
  material.color.set(0xaaa995);
  material.normalScale.set(0.04, 0.04);
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = mesh.receiveShadow = true;
  });
  const o = gallery.profile.origin;
  gltf.scene.position.set(o.x - 8, o.y - 5.7, o.z + 52.64);
  gltf.scene.rotation.y = Math.PI;
  gallery.root.add(gltf.scene);
  gallery.relief = gltf.scene;
  game.renderOnce = true;
}
