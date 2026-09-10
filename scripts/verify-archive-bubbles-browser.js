import * as THREE from "three";
import { createArchiveBubbles } from "../src/archive-bubbles.js";

// Call with the game animation loop stopped. Read the delivered bubble shader
// against a transparent target, including its depth test and alternate cameras.
export function inspectArchiveBubbles(renderer) {
  const previousTarget = renderer.getRenderTarget(),
    previousColor = renderer.getClearColor(new THREE.Color()),
    previousAlpha = renderer.getClearAlpha(),
    previousAutoClear = renderer.autoClear,
    target = new THREE.WebGLRenderTarget(128, 128),
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.7, 0.7, 0.7, -0.7, 0.01, 10),
    bubbles = createArchiveBubbles(),
    occluder = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ colorWrite: false }),
    ),
    pixels = new Uint8Array(128 * 128 * 4),
    results = [];
  bubbles.count = 1;
  bubbles.setMatrixAt(0, new THREE.Matrix4());
  bubbles.instanceMatrix.needsUpdate = true;
  bubbles.material.fog = false;
  bubbles.material.toneMapped = false;
  occluder.position.z = 0.2;
  occluder.visible = false;
  scene.add(bubbles, occluder);
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    for (const [name, life, x, z, cover] of [
      ["middle", 0.5, 0, 2, false],
      ["side", 0.5, 2, 0, false],
      ["birth", 0, 0, 2, false],
      ["surface", 1, 0, 2, false],
      ["near-camera", 0.5, 0, 0.2, false],
      ["occluded", 0.5, 0, 2, true],
    ]) {
      const attribute = bubbles.geometry.getAttribute("bubbleLife");
      attribute.setX(0, life);
      attribute.needsUpdate = true;
      camera.position.set(x, 0, z);
      camera.lookAt(0, 0, 0);
      occluder.visible = cover;
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
      const alpha = (x, y) => pixels[(y * 128 + x) * 4 + 3];
      let maximum = 0,
        total = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        maximum = Math.max(maximum, pixels[i]);
        total += pixels[i];
      }
      results.push({
        name,
        center: alpha(64, 64),
        rim: alpha(102, 64),
        maximum,
        total,
      });
    }
    return results;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
    bubbles.geometry.dispose();
    bubbles.material.dispose();
    occluder.geometry.dispose();
    occluder.material.dispose();
    target.dispose();
  }
}
