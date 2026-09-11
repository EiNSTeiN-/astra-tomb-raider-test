import * as THREE from "three";
import { calderaMaterial } from "../src/caldera-material.js";

// Run in a disposable development expedition with its animation loop stopped.
// Compare the background projection to a conventional camera that can see the
// entire range, then exercise foreground depth at the gameplay camera's limits.
export function verifyCalderaDepth(
  game,
  { name = "Eroded caldera rim", createMaterial = calderaMaterial } = {},
) {
  const source = game.world.getObjectByName(name);
  if (!source) throw new Error(`Load the chapter containing ${name} first.`);
  const renderer = game.renderer,
    target = new THREE.WebGLRenderTarget(512, 320),
    previousTarget = renderer.getRenderTarget(),
    previousClear = renderer.autoClear;
  const scene = new THREE.Scene();
  scene.background = game.scene.fog.color.clone();
  scene.environment = game.scene.environment;
  scene.environmentIntensity = game.scene.environmentIntensity;
  scene.add(game.daylightSky.clone());
  for (const light of game.scene.children.filter((o) => o.isLight)) {
    const copy = light.clone();
    copy.castShadow = false;
    scene.add(copy);
  }
  const rim = new THREE.Mesh(source.geometry, source.material);
  rim.frustumCulled = false;
  rim.renderOrder = source.renderOrder;
  scene.add(rim);
  const reference = createMaterial(game.darkMat, game.scene.fog.color);
  const compile = reference.onBeforeCompile;
  reference.onBeforeCompile = (shader) => {
    compile(shader);
    const code = /float backgroundDepth=.*\n\s*gl_Position\.z=.*;/;
    if (!code.test(shader.vertexShader))
      throw new Error("Reference projection replacement was not found.");
    shader.vertexShader = shader.vertexShader.replace(code, "");
  };
  reference.customProgramCacheKey = () =>
    `vesper-distant-perspective-reference-${name}`;
  const camera = new THREE.PerspectiveCamera(58, 512 / 320, 0.1, 450);
  scene.add(camera);
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x25e76b }),
  );
  marker.visible = false;
  camera.add(marker);
  const capture = () => {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    const pixels = new Uint8Array(512 * 320 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 512, 320, pixels);
    return pixels;
  };
  const difference = (a, b, centre = false) => {
    let changed = 0,
      total = 0,
      count = 0,
      max = 0;
    for (let y = centre ? 150 : 0; y < (centre ? 170 : 320); y++)
      for (let x = centre ? 246 : 0; x < (centre ? 266 : 512); x++)
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(
            a[(y * 512 + x) * 4 + c] - b[(y * 512 + x) * 4 + c],
          );
          changed += d > 1 ? 1 : 0;
          total += d;
          max = Math.max(max, d);
          count++;
        }
    return { changed, mean: total / count, max, channels: count };
  };
  const clipAtHeight = (height) => {
    const plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -height,
    ).applyMatrix4(camera.matrixWorldInverse);
    const clip = new THREE.Vector4(...plane.normal.toArray(), plane.constant),
      m = camera.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + m[8]) / m[0],
      (Math.sign(clip.y) + m[9]) / m[5],
      -1,
      (1 + m[10]) / m[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    m[2] = clip.x;
    m[6] = clip.y;
    m[10] = clip.z + 1;
    m[14] = clip.w;
  };
  const results = [];
  try {
    renderer.autoClear = true;
    for (const [name, position, toward] of [
      ["north", [213, 30, 213], [213, 85, -120]],
      ["east", [385, 21, 218], [620, 80, 218]],
      ["south", [103, 27, 399], [114, 75, 640]],
      ["west", [82, 20, 171], [-120, 80, 151]],
    ]) {
      camera.position.set(...position);
      camera.lookAt(...toward);
      camera.updateMatrixWorld(true);
      camera.far = 1600;
      camera.updateProjectionMatrix();
      rim.material = reference;
      rim.onAfterRender = () => {};
      const expected = capture();
      camera.far = 450;
      camera.updateProjectionMatrix();
      rim.material = source.material;
      rim.onAfterRender = source.onAfterRender;
      const projection = difference(capture(), expected);
      if (
        projection.mean > 0.02 ||
        projection.changed / projection.channels > 0.001
      )
        throw new Error(
          `${name}: background differs from conventional perspective: ${JSON.stringify(projection)}`,
        );
      const foreground = [];
      for (const distance of [3, 225, 449]) {
        marker.visible = true;
        marker.position.set(0, 0, -distance);
        marker.scale.setScalar(distance * 0.2);
        const actual = capture();
        rim.visible = false;
        const expected = capture();
        const centre = (160 * 512 + 256) * 4;
        if (
          expected[centre + 1] < 80 ||
          expected[centre + 1] < expected[centre] * 1.4 ||
          expected[centre + 1] < expected[centre + 2] * 1.3
        )
          throw new Error(
            `${name}: foreground probe at ${distance} m was not visible`,
          );
        rim.visible = true;
        const delta = difference(actual, expected, true);
        if (delta.max)
          throw new Error(`${name}: foreground at ${distance} m was obscured`);
        foreground.push({ distance, ...delta });
      }
      marker.visible = false;
      camera.far = 1600;
      camera.updateProjectionMatrix();
      clipAtHeight(60);
      rim.material = reference;
      rim.onAfterRender = () => {};
      const clippedReference = capture();
      if (difference(expected, clippedReference).changed < 1000)
        throw new Error(`${name}: the oblique plane did not clip the ridge`);
      camera.far = 450;
      camera.updateProjectionMatrix();
      clipAtHeight(60);
      rim.material = source.material;
      rim.onAfterRender = source.onAfterRender;
      const clipping = difference(capture(), clippedReference);
      if (clipping.mean > 0.04 || clipping.changed / clipping.channels > 0.002)
        throw new Error(
          `${name}: oblique clipping differs: ${JSON.stringify(clipping)}`,
        );
      results.push({ name, projection, foreground, clipping });
    }
    return results;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousClear;
    reference.dispose();
    marker.geometry.dispose();
    marker.material.dispose();
    target.dispose();
  }
}
