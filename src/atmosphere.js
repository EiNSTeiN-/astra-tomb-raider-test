import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { forgeSky } from "./forge-sky.js";
import { observatorySky } from "./observatory-sky.js";
import { cloudCitySky } from "./cloud-city.js";

export function buildAtmosphere(game) {
  game.sunOffset = new THREE.Vector3(55, 120, 35);
  game.daylightSky = null;
  game.skyEnvironment?.dispose();
  game.skyEnvironment = null;
  if (game.level.biome === "crystal") {
    game.sun.intensity = 0;
    game.sun.castShadow = false;
    game.scene.background.set(0x10151c);
    game.scene.fog.color.set(0x141c25);
    game.scene.fog.density = 0.009;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    if (hemisphere) {
      hemisphere.color.set(0x9cafc7);
      hemisphere.groundColor.set(0x747e99);
      hemisphere.intensity = 1;
    }
    // A dim, enclosed reflection capture avoids reflecting an outdoor sky in quartz.
    const environment = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(30, 24, 30);
    const material = new THREE.MeshBasicMaterial({
      color: 0x39435b,
      side: THREE.BackSide,
    });
    environment.add(new THREE.Mesh(geometry, material));
    const glowGeometry = new THREE.SphereGeometry(2, 12, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xabc6d4 });
    for (const side of [-1, 1]) {
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.set(side * 11, -3, side * 6);
      glow.scale.set(1, 2.5, 1);
      environment.add(glow);
    }
    const generator = new THREE.PMREMGenerator(game.renderer);
    try {
      game.skyEnvironment = generator.fromScene(environment, 0.08, 0.1, 100, {
        size: 64,
      });
      game.scene.environment = game.skyEnvironment.texture;
      game.scene.environmentIntensity = 0.4;
    } finally {
      generator.dispose();
      geometry.dispose();
      material.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
    }
    return;
  }
  if (
    ![
      "jungle",
      "desert",
      "snow",
      "water",
      "volcano",
      "sky",
      "eclipse",
    ].includes(game.level.biome)
  )
    return;
  game.sunOffset.set(-48, 72, 32);
  const volcano = game.level.biome === "volcano";
  const eclipse = game.level.biome === "eclipse";
  const cloudCity = game.level.biome === "sky";
  if (volcano) game.sunOffset.set(-80, 42, 55);
  if (eclipse) game.sunOffset.set(-48, 50, -95);
  if (cloudCity) game.sunOffset.set(-80, 88, -65);
  const sky = eclipse
    ? observatorySky(game.sunOffset, game.progress)
    : volcano
      ? forgeSky(game.sunOffset)
      : cloudCity
        ? cloudCitySky(game.sunOffset)
        : new Sky();
  if (!volcano && !eclipse && !cloudCity) {
    sky.scale.setScalar(4000);
    sky.frustumCulled = false;
    sky.material.uniforms.turbidity.value = 5.5;
    sky.material.uniforms.rayleigh.value = 2;
    sky.material.uniforms.mieCoefficient.value = 0.004;
    sky.material.uniforms.mieDirectionalG.value = 0.78;
    sky.material.uniforms.sunPosition.value.copy(game.sunOffset).normalize();
  }
  game.scene.add(sky);
  game.daylightSky = sky;
  game.sun.color.set(0xfff1dd);
  if (eclipse) {
    game.sun.color.set(0xc5d2e5);
    game.sun.intensity = game.progress.completed ? 1.8 : 1.1;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    if (hemisphere) {
      hemisphere.color.set(0xa4b9d3);
      hemisphere.groundColor.set(0x72717a);
      hemisphere.intensity = 0.95;
    }
    game.scene.fog.color.set(0x424956);
    game.scene.fog.density = 0.0036;
  }
  if (game.level.biome === "desert") {
    game.sunOffset.set(-70, 55, 45);
    sky.material.uniforms.turbidity.value = 7;
    sky.material.uniforms.rayleigh.value = 1.7;
    sky.material.uniforms.mieCoefficient.value = 0.008;
    sky.material.uniforms.sunPosition.value.copy(game.sunOffset).normalize();
    game.sun.color.set(0xffeed4);
    game.sun.intensity = 3;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    hemisphere?.color.set(0xbdcede);
    hemisphere?.groundColor.set(0xaa8053);
    if (hemisphere) hemisphere.intensity = 0.8;
    game.scene.fog.color.set(0xd2b390);
    game.scene.fog.density = 0.0045;
  }
  if (game.level.biome === "snow") {
    game.sunOffset.set(-80, 110, 20);
    sky.material.uniforms.turbidity.value = 3.2;
    sky.material.uniforms.rayleigh.value = 2.6;
    sky.material.uniforms.sunPosition.value.copy(game.sunOffset).normalize();
    game.sun.color.set(0xfff7ec);
    game.sun.intensity = 2.3;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    hemisphere?.color.set(0xbacfe9);
    hemisphere?.groundColor.set(0x7e8997);
    if (hemisphere) hemisphere.intensity = 1;
    game.scene.fog.color.set(0xb6cada);
    game.scene.fog.density = 0.0028;
  }
  if (game.level.biome === "water") {
    // Calibrate the visible sky and its shared reflection capture together.
    sky.material.fragmentShader = sky.material.fragmentShader.replace(
      "gl_FragColor = vec4( retColor, 1.0 );",
      "gl_FragColor = vec4( retColor * .38, 1.0 );",
    );
    game.sunOffset.set(-95, 72, 45);
    sky.material.uniforms.turbidity.value = 2.6;
    sky.material.uniforms.rayleigh.value = 2.5;
    sky.material.uniforms.mieCoefficient.value = 0.004;
    sky.material.uniforms.sunPosition.value.copy(game.sunOffset).normalize();
    game.sun.color.set(0xffefd7);
    game.sun.intensity = 2.35;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    hemisphere?.color.set(0x9db5c5);
    hemisphere?.groundColor.set(0x697c6f);
    if (hemisphere) hemisphere.intensity = 0.55;
    game.scene.fog.color.set(0x9fb9bf);
    game.scene.fog.density = 0.0022;
  }
  if (volcano) {
    game.sun.color.set(0xffdfb4);
    game.sun.intensity = 1.9;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    hemisphere?.color.set(0xb4c5d2);
    hemisphere?.groundColor.set(0x5d4740);
    if (hemisphere) hemisphere.intensity = 1.1;
    game.scene.fog.color.set(0x76665f);
    game.scene.fog.density = 0.004;
  }
  if (game.level.biome === "sky") {
    game.sun.color.set(0xffedcd);
    game.sun.intensity = 2.2;
    const hemisphere = game.scene.children.find(
      (light) => light.isHemisphereLight,
    );
    hemisphere?.color.set(0xaec5d8);
    hemisphere?.groundColor.set(0x677666);
    if (hemisphere) hemisphere.intensity = 0.55;
    game.scene.fog.color.set(0x9aafb8);
    game.scene.fog.density = 0.0017;
  }
  if (
    ["desert", "snow", "water", "volcano", "sky", "eclipse"].includes(
      game.level.biome,
    )
  ) {
    const environment = new THREE.Scene();
    const capture = sky.clone();
    environment.add(capture);
    const generator = new THREE.PMREMGenerator(game.renderer);
    try {
      game.skyEnvironment = generator.fromScene(environment, 0.04, 0.1, 5000, {
        size: 128,
      });
      game.scene.environment = game.skyEnvironment.texture;
      game.scene.environmentIntensity = eclipse
        ? 0.8
        : game.level.biome === "water"
          ? 0.4
          : game.level.biome === "snow"
            ? 0.25
            : cloudCity
              ? 0.6
              : 0.32;
    } finally {
      generator.dispose();
      // The capture shares the live sky's geometry and material.
      environment.remove(capture);
    }
  }
}

export function updateAtmosphere(game, target) {
  game.sun.position
    .copy(target)
    .add(game.sunOffset || new THREE.Vector3(55, 120, 35));
  game.sun.target.position.copy(target);
  game.daylightSky?.position.copy(target);
  if (
    ["volcano", "eclipse", "sky"].includes(game.level.biome) &&
    game.daylightSky
  )
    game.daylightSky.material.uniforms.time.value = game.elapsed;
  if (game.cloudCity) game.cloudCity.time.value = game.elapsed;
  if (game.level.biome === "eclipse" && game.daylightSky) {
    game.daylightSky.material.uniforms.dawn.value = Number(
      !!game.progress.completed,
    );
    game.sun.intensity = game.progress.completed ? 1.8 : 1.1;
  }
}
