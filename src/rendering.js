import * as THREE from "three";
import { WaterReflection } from "./water-reflection.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

class SolidContactPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    // A normal override cannot reproduce cutout leaves or translucent water.
    // Keep those out of the contact buffer rather than shading their whole cards.
    this.scene.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (
        object.userData.excludeContact ||
        materials.some(
          (m) => m.transparent || m.alphaTest > 0 || m.isShaderMaterial,
        )
      ) {
        object.visible = false;
        this._visibilityCache.push(object);
      }
    });
  }
}

export class CinematicRenderer {
  constructor(game) {
    this.game = game;
    this.waterReflection = new WaterReflection(game);
    game.renderer.info.autoReset = false;
    this.configure();
  }
  configure() {
    const { game } = this,
      quality = game.store.data.settings.quality;
    this.enabled = quality !== "low";
    if (!this.enabled) return;
    if (!this.composer) {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: 2,
      });
      this.composer = new EffectComposer(game.renderer, target);
      this.scenePass = new RenderPass(game.scene, game.camera);
      this.ao = new SolidContactPass(game.scene, game.camera, 1, 1);
      this.ao.updateGtaoMaterial({
        radius: 1.4,
        thickness: 0.6,
        distanceFallOff: 1.2,
        samples: 12,
        screenSpaceRadius: false,
      });
      this.ao.updatePdMaterial({ radius: 5, samples: 8 });
      this.ao.blendIntensity = 0.6;
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        0.18,
        0.55,
        1.02,
      );
      this.output = new OutputPass();
      this.antialias = new ShaderPass(FXAAShader);
      for (const pass of [
        this.scenePass,
        this.ao,
        this.bloom,
        this.output,
        this.antialias,
      ])
        this.composer.addPass(pass);
    }
    this.ao.enabled = quality === "high";
    this.resize();
  }
  resize() {
    if (!this.composer) return;
    const renderer = this.game.renderer,
      size = renderer.getSize(new THREE.Vector2()),
      ratio = renderer.getPixelRatio();
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(size.x, size.y);
    this.ao.setSize(
      Math.max(1, Math.floor(size.x * ratio * 0.6)),
      Math.max(1, Math.floor(size.y * ratio * 0.6)),
    );
    this.antialias.uniforms.resolution.value.set(
      1 / (size.x * ratio),
      1 / (size.y * ratio),
    );
  }
  render(dt) {
    this.game.renderer.info.reset();
    this.waterReflection.render();
    if (this.enabled && this.composer) this.composer.render(dt);
    else this.game.renderer.render(this.game.scene, this.game.camera);
  }
  dispose() {
    this.waterReflection.dispose();
    this.composer?.passes.forEach((pass) => pass.dispose?.());
    this.composer?.dispose();
  }
}
