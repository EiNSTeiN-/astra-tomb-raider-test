import * as THREE from "three";

// Development-only probe: use the actual leaf material callbacks on a single
// card, then compare visible pixels with the corresponding shadow-depth pass.
export function inspectLeafCards(game) {
  const renderer = game.renderer;
  const meshes = [...game.forestPatches, ...(game.jungleFringe?.patches || [])]
    .flatMap((p) => p.tiers.flat())
    .filter((m) => m.material.userData.leafTiles);
  const materials = [...new Set(meshes.map((m) => m.material))];
  const masks = new Set(materials.map((m) => m.alphaMap).filter(Boolean));
  const baked = new Set(
    materials
      .filter((m) => !m.alphaMap)
      .flatMap((m) => [m.map, m.normalMap, m.roughnessMap]),
  );
  const sample = [1, 2, 4].map((tiles) =>
    meshes.find((m) => m.material.userData.leafTiles === tiles),
  );
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
  camera.position.set(0, 8, 3);
  camera.lookAt(0, 8, 0);
  const target = new THREE.WebGLRenderTarget(256, 256);
  const pixels = new Uint8Array(256 * 256 * 4);
  const previous = {
    target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
  };
  const probes = [];
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0, 0);
    renderer.setRenderTarget(target);
    for (const source of sample) {
      const b = source.geometry.getAttribute("_leaf_bounds");
      const bounds = [b.getX(0), b.getY(0), b.getZ(0), b.getW(0)];
      const geometry = new THREE.PlaneGeometry(2, 2).translate(0, 8, 0);
      const uv = geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          bounds[0] + uv.getX(i) * (bounds[2] - bounds[0]),
          bounds[1] + uv.getY(i) * (bounds[3] - bounds[1]),
        );
      geometry.setAttribute(
        "_leaf_bounds",
        new THREE.Float32BufferAttribute(
          Array.from({ length: 4 }, () => bounds).flat(),
          4,
        ),
      );
      const coverage = new THREE.InstancedBufferAttribute(
        new Float32Array([1]),
        1,
      );
      geometry.setAttribute("instanceCoverage", coverage);
      const options = {
        map: source.material.map,
        alphaMap: source.material.alphaMap,
        alphaTest: source.material.alphaTest,
        side: THREE.DoubleSide,
        blending: THREE.NoBlending,
        toneMapped: false,
      };
      const color = new THREE.MeshBasicMaterial(options);
      const depth = new THREE.MeshDepthMaterial({
        ...options,
        depthPacking: THREE.BasicDepthPacking,
      });
      for (const [material, original] of [
        [color, source.material],
        [depth, source.customDepthMaterial],
      ]) {
        material.onBeforeCompile = original.onBeforeCompile;
        material.customProgramCacheKey = original.customProgramCacheKey;
      }
      const card = new THREE.InstancedMesh(geometry, color, 1);
      card.setMatrixAt(0, new THREE.Matrix4());
      card.frustumCulled = false;
      scene.add(card);
      try {
        for (const value of [1, 0.4, -0.6]) {
          coverage.setX(0, value);
          coverage.needsUpdate = true;
          const silhouettes = [];
          for (const material of [color, depth]) {
            card.material = material;
            renderer.clear();
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
            silhouettes.push(
              Uint8Array.from({ length: 256 * 256 }, (_, i) =>
                pixels[i * 4 + 3] > 0 ? 1 : 0,
              ),
            );
          }
          probes.push({
            tiles: source.material.userData.leafTiles,
            coverage: value,
            visible: silhouettes[0].reduce((a, b) => a + b, 0),
            mismatch: silhouettes[0].reduce(
              (n, v, i) => n + (v !== silhouettes[1][i]),
              0,
            ),
          });
        }
      } finally {
        scene.remove(card);
        card.dispose();
        geometry.dispose();
        color.dispose();
        depth.dispose();
      }
    }
    return {
      meshes: meshes.length,
      materials: materials.length,
      masks: masks.size,
      bakedTextures: baked.size,
      bounds: meshes.every((m) => !!m.geometry.getAttribute("_leaf_bounds")),
      shadowMapsMatch: meshes.every(
        (m) =>
          m.customDepthMaterial.map === m.material.map &&
          m.customDepthMaterial.alphaMap === m.material.alphaMap,
      ),
      atlasTargets: game.leafAtlases.targets.length,
      atlasBytes: game.leafAtlases.bytes,
      atlasRegions: game.leafAtlases.regions.length,
      texturesConfigured: [...baked].every(
        (t) =>
          t.generateMipmaps &&
          t.anisotropy === 8 &&
          t.wrapS === THREE.RepeatWrapping &&
          t.wrapT === THREE.RepeatWrapping,
      ),
      probes,
    };
  } finally {
    renderer.setRenderTarget(previous.target);
    renderer.setClearColor(previous.clear, previous.alpha);
    renderer.autoClear = previous.autoClear;
    target.dispose();
  }
}
