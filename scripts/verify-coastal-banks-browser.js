import * as THREE from "three";

// Render the real terrain color layer with sentinel textures. Red identifies
// paving, blue identifies bedrock, and green would expose unwanted bare soil.
// This checks the compiled slope blend rather than a second CPU implementation.
// Call while the game's animation loop is stopped.
export function inspectCoastalBankMaterial(game) {
  const renderer = game.renderer,
    source = game.terrainMeshes[0].material,
    target = new THREE.WebGLRenderTarget(64, 64),
    previousTarget = renderer.getRenderTarget(),
    previousColor = renderer.getClearColor(new THREE.Color()),
    previousAlpha = renderer.getClearAlpha(),
    previousAutoClear = renderer.autoClear;
  const texture = (r, g, b) => {
    const map = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
    map.needsUpdate = true;
    return map;
  };
  const red = texture(255, 0, 0),
    blue = texture(0, 0, 255),
    green = texture(0, 255, 0),
    material = new THREE.MeshStandardMaterial({
      defines: { ...source.defines },
      map: green,
      normalMap: source.normalMap,
      roughnessMap: source.roughnessMap,
      fog: false,
      toneMapped: false,
    });
  material.onBeforeCompile = (shader) => {
    source.onBeforeCompile(shader);
    Object.assign(shader.uniforms, {
      pavingMap: { value: red },
      coastalSlabMap: { value: red },
      cliffMap: { value: blue },
    });
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      "gl_FragColor=vec4(terrainAlbedo,1.0);",
    );
  };
  material.customProgramCacheKey = () =>
    `${source.customProgramCacheKey()}-bank-classification`;
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.setAttribute(
    "court",
    new THREE.Float32BufferAttribute([2, 2, 2, 2], 1),
  );
  geometry.setAttribute(
    "trail",
    new THREE.Float32BufferAttribute([0, 0, 0, 0], 1),
  );
  geometry.setAttribute(
    "coast",
    new THREE.Float32BufferAttribute(new Float32Array(12), 3),
  );
  const scene = new THREE.Scene(),
    mesh = new THREE.Mesh(geometry, material),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    pixels = new Uint8Array(4 * 4 * 4),
    results = [];
  mesh.position.set(10.3, 20, 10.3);
  scene.add(mesh);
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(target);
    for (const angle of [0, 15, 30, 45, 60, 90]) {
      mesh.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(angle);
      camera.position
        .copy(mesh.position)
        .add(new THREE.Vector3(0, 0, 5).applyQuaternion(mesh.quaternion));
      camera.up.set(0, 1, 0).applyQuaternion(mesh.quaternion);
      camera.lookAt(mesh.position);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 30, 30, 4, 4, pixels);
      const rgb = [0, 1, 2].map((channel) => {
        let sum = 0;
        for (let i = channel; i < pixels.length; i += 4) sum += pixels[i];
        return sum / 16;
      });
      results.push({ angle, rgb });
    }
    return results;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
    target.dispose();
    geometry.dispose();
    material.dispose();
    for (const map of [red, green, blue]) map.dispose();
  }
}
