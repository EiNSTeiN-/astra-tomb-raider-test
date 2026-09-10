import * as THREE from "three";

const HALF_SIZE = 55;
const position = new THREE.Vector3();
const target = new THREE.Vector3();
const axis = new THREE.Vector3();
const basis = new THREE.Matrix4();

export function configureSunShadow(game) {
  const shadow = game.sun?.shadow;
  if (!shadow) return;
  const quality = game.store.data.settings.quality,
    requested = quality === "high" ? 4096 : 2048,
    size = Math.min(
      requested,
      game.renderer.capabilities?.maxTextureSize || 2048,
    );
  if (shadow.mapSize.x !== size || quality === "low") {
    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapSize.set(size, size);
    shadow.needsUpdate = true;
  }
  Object.assign(shadow.camera, {
    left: -HALF_SIZE,
    right: HALF_SIZE,
    top: HALF_SIZE,
    bottom: -HALF_SIZE,
    near: 0.5,
    far: 300,
  });
  // Bias is normalized by the shadow camera's depth range. Express its intent
  // in metres: the old -0.0008 offset displaced depth by almost 24 cm.
  shadow.bias = -0.024 / (shadow.camera.far - shadow.camera.near);
  shadow.normalBias = size > 2048 ? 0.035 : 0.045;
  stabilizeSunShadow(game.sun);
}

// Keep the world-to-shadow raster phase fixed as the light follows the player.
// Only the orthographic window shifts (by at most half a texel); the actual
// light direction and the sky's sun direction stay untouched.
export function stabilizeSunShadow(light) {
  const shadow = light?.shadow;
  if (!shadow) return;
  const camera = shadow.camera;
  light.getWorldPosition(position);
  light.target.getWorldPosition(target);
  basis.lookAt(position, target, camera.up);
  const stepX = (HALF_SIZE * 2) / shadow.mapSize.x,
    stepY = (HALF_SIZE * 2) / shadow.mapSize.y,
    x = axis.setFromMatrixColumn(basis, 0).dot(position),
    y = axis.setFromMatrixColumn(basis, 1).dot(position),
    dx = Math.round(x / stepX) * stepX - x,
    dy = Math.round(y / stepY) * stepY - y;
  camera.left = -HALF_SIZE + dx;
  camera.right = HALF_SIZE + dx;
  camera.bottom = -HALF_SIZE + dy;
  camera.top = HALF_SIZE + dy;
  camera.updateProjectionMatrix();
}
