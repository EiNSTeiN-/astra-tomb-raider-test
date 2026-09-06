// Development-only material/pose review. Reload the page to restore the launcher.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Adventure } from "../src/game.js";
import { buildGuardian, updateGuardians } from "../src/combat.js";
import { LEVELS } from "../src/campaign.js";
import { constrainCamera } from "../src/camera-collision.js";

export async function guardianGallery({
  biome = "jungle",
  state = "idle",
} = {}) {
  globalThis.__guardianGallery?.dispose();
  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#101b1e";
  document.body.append(mount);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  mount.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x142126);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(environment, 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.45;
  environment.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(
    32,
    innerWidth / innerHeight,
    0.1,
    60,
  );
  camera.position.set(0, 4.8, 17.5);
  camera.lookAt(0, 1.8, 0);
  const key = new THREE.DirectionalLight(0xffe5ba, 4);
  key.position.set(-6, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8 });
  key.shadow.normalBias = 0.035;
  scene.add(key, new THREE.HemisphereLight(0x92bdd5, 0x262624, 0.8));
  const rim = new THREE.DirectionalLight(0x75bcca, 2);
  rim.position.set(3, 6, -5);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0x233033, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const loader = new THREE.TextureLoader();
  const textures = await Promise.all(
    ["color", "normal", "roughness"].map((channel) =>
      loader.loadAsync(`/assets/textures/stone-${channel}.jpg`),
    ),
  );
  textures[0].colorSpace = THREE.SRGBColorSpace;
  textures.forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });
  const game = Object.assign(Object.create(Adventure.prototype), {
    scene,
    world: scene,
    camera,
    renderer,
    level: LEVELS.find((l) => l.biome === biome),
    stoneMat: new THREE.MeshStandardMaterial({
      color: 0xbac0ad,
      map: textures[0],
      normalMap: textures[1],
      roughnessMap: textures[2],
      normalScale: new THREE.Vector2(0.45, 0.45),
    }),
    goldMat: new THREE.MeshStandardMaterial({
      color: 0xb4a273,
      metalness: 0.7,
      roughness: 0.4,
    }),
    groundHeight: () => 0,
    canMove: () => true,
    lineOfSight: () => false,
    rng: () => 0.5,
    elapsed: 0,
    audio: { noiseHit() {} },
    player: new THREE.Group(),
    enemies: [],
    projectiles: [],
    store: { data: { settings: { quality: "high" } } },
  });
  game.player.position.set(0, 0, 35);
  for (const [i, kind] of ["warden", "hunter", "sentry", "bulwark"].entries()) {
    const enemy = buildGuardian(game, {
      id: `review-${kind}`,
      kind,
      x: ((i - 1.5) * 3.45) / 7,
      z: 0,
    });
    enemy.group.rotation.y = -0.12;
    enemy.state = state;
    enemy.timer =
      state === "windup" ? enemy.spec.windup * 0.35 : enemy.spec.recovery * 0.7;
    game.enemies.push(enemy);
  }
  updateGuardians(game, 0);
  const started = performance.now();
  while (
    game.enemies.some((e) =>
      e.art?.skins.some((m) =>
        [m.material.map, m.material.normalMap, m.material.roughnessMap].some(
          (t) => t && !t.image,
        ),
      ),
    ) &&
    performance.now() - started < 10000
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  renderer.render(scene, camera);
  const labels = document.createElement("div");
  labels.style.cssText =
    "position:absolute;bottom:8%;left:10%;right:10%;display:flex;justify-content:space-around;color:#dec8a1;font:12px sans-serif;letter-spacing:3px;text-transform:uppercase";
  labels.innerHTML = [
    "Stone warden",
    "Ridge hunter",
    "Sanctuary sentry",
    "Shield keeper",
  ]
    .map((x) => `<span>${x}</span>`)
    .join("");
  mount.append(labels);
  const review = {
    game,
    render: () => renderer.render(scene, camera),
    dispose() {
      renderer.dispose();
      target.dispose();
      textures.forEach((t) => t.dispose());
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.skeleton?.dispose();
        o.material?.dispose();
      });
      mount.remove();
    },
  };
  globalThis.__guardianGallery = review;
  return {
    triangles: renderer.info.render.triangles,
    calls: renderer.info.render.calls,
    kinds: game.enemies.map((e) => e.kind),
  };
}

// These selected encounter views use the actual chapter terrain and lighting.
// Positioning and attack state are assisted; this is not a combat playthrough.
export async function guardianChapterViews(indices = [0, 1, 2, 3, 4, 5, 6, 7]) {
  globalThis.__guardianGallery?.dispose();
  globalThis.__guardianGallery = null;
  const hook = globalThis.__vesper;
  if (!hook) throw new Error("Run this through the development server.");
  hook.store.data.settings.quality = "low";
  if (!hook.game) await hook.startGame(indices[0]);
  const game = globalThis.__vesper.game,
    results = [];
  game.renderer.setAnimationLoop(null);
  for (const index of indices) {
    if (game.levelIndex !== index) game.load(LEVELS[index], index);
    hook.closeModal(false);
    game.setPaused(true);
    await game.visualsReady;
    const enemy = game.enemies[0];
    const p = enemy.group.position;
    const focus = p.clone().add(new THREE.Vector3(0, 1.8, 0));
    let viewpoint = null,
      clearance = 0;
    for (let j = 0; j < 16; j++) {
      const angle = 0.4 + (j * Math.PI) / 8;
      const desired = focus
        .clone()
        .add(new THREE.Vector3(Math.sin(angle) * 7, 1.3, Math.cos(angle) * 7));
      const clear = constrainCamera(
        focus,
        desired,
        game.cameraSurfaces,
        (v) =>
          v.y > game.groundHeight(v.x, v.z) + 0.4 &&
          game.canMove(v.x, v.z, v.y - game.groundHeight(v.x, v.z)),
      );
      const distance = clear.distanceTo(focus);
      if (distance > clearance) {
        clearance = distance;
        viewpoint = clear;
      }
      if (distance > 7) break;
    }
    game.camera.position.copy(viewpoint);
    game.camera.lookAt(focus);
    game.player.position.set(
      viewpoint.x,
      game.groundHeight(viewpoint.x, viewpoint.z),
      viewpoint.z,
    );
    enemy.group.rotation.y = Math.atan2(viewpoint.x - p.x, viewpoint.z - p.z);
    document.querySelector("#hud-title").textContent = game.level.title;
    document.querySelector("#hud-chapter-number").textContent =
      `CHAPTER ${String(index + 1).padStart(2, "0")} / 08`;
    document.querySelector("#hud-location").textContent = game.level.location;
    enemy.state = "windup";
    enemy.timer = enemy.spec.windup * 0.4;
    game.updateDecorations(0.1);
    updateGuardians(game, 0);
    game.updateAudio();
    const started = performance.now();
    while (
      enemy.art.skins.some((m) =>
        [m.material.map, m.material.normalMap].some((t) => t && !t.image),
      ) &&
      performance.now() - started < 10000
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    game.renderScene();
    results.push({
      chapter: game.level.id,
      kind: enemy.kind,
      tier: enemy.art.tier,
      bodyMeshes: enemy.art.skins.length,
      submitted: { ...game.renderer.info.render },
      finiteBones: Array.from(enemy.art.skeleton.boneMatrices).every(
        Number.isFinite,
      ),
      cameraClearance: clearance,
    });
  }
  return results;
}
