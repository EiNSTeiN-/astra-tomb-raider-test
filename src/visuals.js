import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./campaign.js";
import { materialTextureLoader } from "./asset-loading.js";

export function pbrMaterial(name, color = 0xffffff, repeat = 1) {
  const textureLoader = materialTextureLoader();
  const map = textureLoader.load(`/assets/textures/${name}-color.jpg`);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = textureLoader.load(`/assets/textures/${name}-normal.jpg`),
    roughness = textureLoader.load(`/assets/textures/${name}-roughness.jpg`);
  for (const t of [map, normal, roughness]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({
    color,
    map,
    normalMap: normal,
    roughnessMap: roughness,
    roughness: 1,
    normalScale: new THREE.Vector2(0.65, 0.65),
  });
}

export function mergeArchitecture(world) {
  const groups = new Map();
  world.updateMatrixWorld(true);
  for (const child of [...world.children]) {
    if (
      !child.isMesh ||
      child.isInstancedMesh ||
      Array.isArray(child.material) ||
      child.userData.animated
    )
      continue;
    const key = child.material.uuid;
    if (!groups.has(key))
      groups.set(key, { material: child.material, parts: [], originals: [] });
    const g = groups.get(key);
    let geometry = child.geometry.clone();
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    g.parts.push(geometry.applyMatrix4(child.matrix));
    g.originals.push(child);
  }
  for (const group of groups.values()) {
    if (group.parts.length < 3) {
      group.parts.forEach((g) => g.dispose());
      continue;
    }
    const geometry = mergeGeometries(group.parts, false);
    group.parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, group.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    for (const child of group.originals) {
      world.remove(child);
      child.geometry.dispose();
    }
  }
}

export { loadExplorer, animateExplorer } from "./explorer.js";

export {
  loadNature,
  loadForest,
  updateForest,
  updateNature,
} from "./vegetation.js";

export function buildTrees(game) {
  const rng = random(game.level.seed + 192),
    green = ["jungle", "sky", "water"].includes(game.level.biome),
    snow = game.level.biome === "snow";
  if (!green && !snow && game.level.biome !== "desert") return;
  const count = green ? 260 : snow ? 180 : 70,
    d = new THREE.Object3D(),
    trunkMat = pbrMaterial("bark", 0x9b8b73, 2);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.72, 1, 9, 4);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count * 3);
  const leafGeo = makeFrond();
  const leafMat = new THREE.MeshStandardMaterial({
    color: snow ? 0x9eaa99 : 0x39593a,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count * 18);
  let n = 0;
  for (let i = 0; i < count * 8 && n < count; i++) {
    const gx = 2 + Math.floor(rng() * (game.map.size - 4)),
      gz = 2 + Math.floor(rng() * (game.map.size - 4));
    if (game.map.grid[gz][gx]) continue;
    const x = gx * 7,
      z = gz * 7,
      y = game.groundHeight(x, z),
      h = 11 + rng() * 12;
    for (let b = 0; b < 3; b++) {
      d.position.set(
        x + (b ? (b === 1 ? 2 : -2) : 0),
        y + h * (b ? 0.74 : 0.5),
        z + (b ? 1 : 0),
      );
      d.rotation.set(b ? 0.35 : 0, 0, b ? (b === 1 ? -0.5 : 0.5) : 0);
      d.scale.set(b ? 0.7 : 1, b ? h * 0.55 : h, b ? 0.7 : 1);
      d.updateMatrix();
      trunks.setMatrixAt(n * 3 + b, d.matrix);
    }
    for (let f = 0; f < 18; f++) {
      const a = (f / 9) * Math.PI * 2,
        r = f < 9 ? 1.6 : 3;
      d.position.set(
        x + Math.cos(a) * r,
        y + h + (f < 9 ? 0 : -2),
        z + Math.sin(a) * r,
      );
      d.rotation.set(0.15 + rng() * 0.3, -a, 0);
      d.scale.set(2 + rng() * 2, 1.2 + rng(), 4 + rng() * 4);
      d.updateMatrix();
      leaves.setMatrixAt(n * 18 + f, d.matrix);
      leaves.setColorAt(
        n * 18 + f,
        new THREE.Color().setHSL(
          0.24 + rng() * 0.07,
          0.25 + rng() * 0.12,
          0.25 + rng() * 0.12,
        ),
      );
    }
    n++;
  }
  trunks.count = n * 3;
  leaves.count = n * 18;
  trunks.castShadow = true;
  leaves.castShadow = true;
  trunks.receiveShadow = true;
  leaves.receiveShadow = true;
  game.world.add(trunks, leaves);
}
function makeFrond() {
  const verts = [],
    uv = [],
    indices = [];
  const sections = 12;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections,
      w = Math.sin(Math.PI * t) * 0.38;
    verts.push(-w, -t * t * 0.3, t, w, -t * t * 0.3, t);
    uv.push(0, t, 1, t);
    if (i < sections) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export async function loadPanorama(game) {
  if (game.level.biome !== "jungle") return;
  const scene = game.scene;
  const texture = await new THREE.TextureLoader(
    game.assetBatch?.manager,
  ).loadAsync("/assets/jungle-panorama.png");
  if (game.scene !== scene) {
    texture.dispose();
    return;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  if (!game.daylightSky) scene.background = texture;
  scene.backgroundIntensity = 0.75;
  scene.backgroundRotation.y = Math.PI * 0.65;
  scene.environment = texture;
  scene.environmentIntensity = 0.22;
  game.renderOnce = true;
}
