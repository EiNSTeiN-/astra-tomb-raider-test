import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

export function reflectionCandidate(game) {
  if (game.store.data.settings.quality !== "high") return null;
  // This pass precedes renderer.render(), which normally updates the camera.
  // Selection, reprojection and capture all need this frame's transform.
  game.camera.updateWorldMatrix(true, false);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      game.camera.projectionMatrix,
      game.camera.matrixWorldInverse,
    ),
  );
  let selected = null,
    best = 55;
  for (const water of game.waterMeshes || []) {
    if (
      water.userData.kind !== "water" ||
      !water.visible ||
      game.camera.position.y < water.position.y + 0.08
    )
      continue;
    water.updateMatrixWorld();
    if (!frustum.intersectsObject(water)) continue;
    const { width, length } = water.userData,
      p = game.player.position;
    const distance = Math.hypot(
      Math.max(0, Math.abs(p.x - water.position.x) - width / 2),
      p.y - water.position.y,
      Math.max(0, Math.abs(p.z - water.position.z) - length / 2),
    );
    if (distance < best) {
      best = distance;
      selected = water;
    }
  }
  return selected;
}
export class WaterReflection {
  constructor(game) {
    this.game = game;
    this.frame = 0;
    this.captures = 0;
    this.capturePosition = new THREE.Vector3();
    this.captureRotation = new THREE.Quaternion();
    this.captureProjection = new THREE.Matrix4();
    this.captureSurface = new THREE.Vector3();
    this.viewPosition = new THREE.Vector3();
    this.viewRotation = new THREE.Quaternion();
    this.reflector = new Reflector(new THREE.PlaneGeometry(1, 1), {
      textureWidth: 512,
      textureHeight: 512,
      multisample: 0,
      clipBias: 0.003,
    });
    this.reflector.rotation.x = -Math.PI / 2;
  }
  viewChanged(surface) {
    const camera = this.game.camera;
    this.viewPosition.setFromMatrixPosition(camera.matrixWorld);
    this.viewRotation.setFromRotationMatrix(camera.matrixWorld);
    // Reprojection can reuse nearby views, but quick turns, camera recovery,
    // resizing and draining a pool must not expose an old capture's boundary.
    return (
      this.captures === 0 ||
      this.viewPosition.distanceToSquared(this.capturePosition) > 0.25 ** 2 ||
      Math.abs(this.viewRotation.dot(this.captureRotation)) <
        Math.cos(THREE.MathUtils.degToRad(1)) ||
      !camera.projectionMatrix.equals(this.captureProjection) ||
      surface.position.distanceToSquared(this.captureSurface) > 0.015 ** 2
    );
  }
  render(exteriorOccluded = false) {
    const game = this.game,
      selected = exteriorOccluded ? null : reflectionCandidate(game),
      changed = selected !== this.selected;
    this.selected = selected;
    for (const water of game.waterMeshes || []) {
      const u = water.material.userData.waterUniforms;
      if (u) u.mirrorWeight.value = water === selected ? 1 : 0;
    }
    this.frame++;
    if (
      !selected ||
      (!changed &&
        !game.paused &&
        this.frame % 3 !== 0 &&
        !this.viewChanged(selected))
    )
      return;
    const saved = game.waterMeshes.map((w) => w.visible),
      avatarVisible = game.avatar.visible;
    try {
      for (const water of game.waterMeshes) water.visible = false;
      game.avatar.visible = true;
      this.reflector.position.copy(selected.position);
      this.reflector.updateMatrixWorld(true);
      this.reflector.forceUpdate = true;
      // Reflector owns the oblique clipping plane and preserves renderer targets,
      // XR state and shadow updates. Only this single chosen plane is captured.
      this.reflector.onBeforeRender(game.renderer, game.scene, game.camera);
      const u = selected.material.userData.waterUniforms;
      u.waterMirror.value = this.reflector.getRenderTarget().texture;
      u.waterMirrorMatrix.value
        .copy(this.reflector.material.uniforms.textureMatrix.value)
        .multiply(this.reflector.matrixWorld.clone().invert());
      this.capturePosition.setFromMatrixPosition(game.camera.matrixWorld);
      this.captureRotation.setFromRotationMatrix(game.camera.matrixWorld);
      this.captureProjection.copy(game.camera.projectionMatrix);
      this.captureSurface.copy(selected.position);
      this.captures++;
    } finally {
      game.waterMeshes.forEach((w, i) => (w.visible = saved[i]));
      game.avatar.visible = avatarVisible;
    }
  }
  dispose() {
    this.reflector.geometry.dispose();
    this.reflector.dispose();
  }
}
