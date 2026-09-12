// Development-only material review. Reload to return to the launcher.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { patinatedBronze } from "../src/observatory-geometry.js";

export function bronzeGallery(material = patinatedBronze()) {
  globalThis.__bronzeGallery?.dispose();
  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#172025";
  document.body.append(mount);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  mount.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x172025);
  const room = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer),
    environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffe6be, 3);
  key.position.set(-3, 5, 7);
  scene.add(key, new THREE.HemisphereLight(0xadc5d7, 0x32312b, 0.5));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.2, 0.3), material);
  scene.add(panel);
  const camera = new THREE.OrthographicCamera(-3.2, 3.2, 2, -2, 0.1, 50);
  const review = {
    renderer,
    camera,
    scene,
    setView(scale = 1, shift = 0) {
      const height = 4 * scale,
        width = (height * innerWidth) / innerHeight;
      Object.assign(camera, {
        left: -width / 2,
        right: width / 2,
        top: height / 2,
        bottom: -height / 2,
      });
      camera.position.set(0, shift, 8);
      camera.lookAt(0, shift, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      panel.geometry.dispose();
      material.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      mount.remove();
    },
  };
  review.setView();
  globalThis.__bronzeGallery = review;
  return review;
}
