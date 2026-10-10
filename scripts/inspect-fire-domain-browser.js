import * as THREE from "three";
import { buildFireEffects } from "../src/effects.js";

// Run against a live WebGL renderer. These cards exercise the actual factory
// shader in an HDR target, including UV values that an edge fragment can receive
// under multisampling. A deliberately unbounded control proves that the test
// detects invalid colour even where the intended flame is transparent.
export function inspectFireDomain(renderer) {
  const scene = new THREE.Scene(),
    world = new THREE.Group(),
    flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 1, 8),
      new THREE.MeshBasicMaterial(),
    ),
    factory = { world, flames: [flame] },
    target = new THREE.WebGLRenderTarget(80, 80, {
      type: THREE.HalfFloatType,
      samples: 2,
    }),
    camera = new THREE.OrthographicCamera(-0.425, 0.425, 0.5, -0.5, 0.1, 10),
    saved = {
      target: renderer.getRenderTarget(),
      color: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
    };
  scene.background = new THREE.Color(0.04, 0.06, 0.08);
  scene.add(world);
  world.add(flame);
  buildFireEffects(factory);
  const guarded = flame.material,
    control = guarded.clone(),
    uv = flame.geometry.attributes.uv,
    originalUV = uv.array.slice(),
    result = { guarded: [], control: [], interior: [] };
  control.fragmentShader = control.fragmentShader.replace(
    "float y=clamp(vUv.y,0.0,1.0)",
    "float y=vUv.y",
  );
  control.uniforms.time = factory.fireTime;

  function render(material, range, time, seed) {
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        originalUV[i * 2],
        range[0] + originalUV[i * 2 + 1] * (range[1] - range[0]),
      );
    uv.needsUpdate = true;
    world.position.set(seed[0], 0, seed[1]);
    camera.position.set(seed[0], 0, seed[1] + 3);
    camera.lookAt(seed[0], 0, seed[1]);
    factory.fireTime.value = time;
    flame.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = new Uint16Array(80 * 80 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 80, 80, pixels);
    let nonfinite = 0,
      maximum = 0,
      hdrPixels = 0;
    for (let i = 0; i < pixels.length; i++) {
      const value = THREE.DataUtils.fromHalfFloat(pixels[i]);
      if (!Number.isFinite(value)) nonfinite++;
      else if (i % 4 !== 3) maximum = Math.max(maximum, value);
    }
    for (let i = 0; i < pixels.length; i += 4)
      if ([0, 1, 2].some((channel) => THREE.DataUtils.fromHalfFloat(pixels[i + channel]) > 1))
        hdrPixels++;
    return {
      pixels,
      report: {
        range,
        time,
        seed,
        nonfinite,
        maximum,
        hdrPixels,
        error: renderer.getContext().getError(),
      },
    };
  }

  try {
    if (control.fragmentShader === guarded.fragmentShader)
      throw new Error("The unbounded flame control was not constructed");
    renderer.autoClear = true;
    const cases = [
      { range: [-0.02, 1.02], time: 0, seed: [0, 0] },
      { range: [-0.125, 1.125], time: 0.37, seed: [112, 287] },
      { range: [-0.125, 1.125], time: 2.73, seed: [268, 240] },
      { range: [-0.02, 1.02], time: 8.4, seed: [553, 417] },
    ];
    for (const { range, time, seed } of cases) {
      result.guarded.push(render(guarded, range, time, seed).report);
      result.control.push(render(control, range, time, seed).report);
    }
    for (const time of [0, 0.37, 2.73, 8.4]) {
      const a = render(guarded, [0.05, 0.95], time, [268, 240]),
        b = render(control, [0.05, 0.95], time, [268, 240]);
      let differences = 0,
        maximumDifference = 0;
      for (let i = 0; i < a.pixels.length; i++) {
        differences += a.pixels[i] !== b.pixels[i] ? 1 : 0;
        maximumDifference = Math.max(
          maximumDifference,
          Math.abs(
            THREE.DataUtils.fromHalfFloat(a.pixels[i]) -
              THREE.DataUtils.fromHalfFloat(b.pixels[i]),
          ),
        );
      }
      result.interior.push({
        time,
        differences,
        maximumDifference,
        guarded: a.report,
        control: b.report,
      });
    }
    return result;
  } finally {
    flame.material = guarded;
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(saved.color, saved.alpha);
    renderer.autoClear = saved.autoClear;
    flame.geometry.dispose();
    guarded.dispose();
    control.dispose();
    factory.fireLights.forEach((light) => light.dispose());
    target.dispose();
  }
}
