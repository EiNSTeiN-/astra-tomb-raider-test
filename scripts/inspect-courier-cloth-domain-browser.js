import * as THREE from "three";
import { courierSailMaterial } from "../src/courier-sail.js";

// Exercise the actual sail material on a multisampled HDR target. Extended UVs
// model covered edge fragments; the control restores the failing pow expression.
export function inspectCourierClothDomain(renderer) {
  const scene = new THREE.Scene(),
    geometry = new THREE.PlaneGeometry(4, 2.8, 8, 8),
    guarded = courierSailMaterial(),
    control = guarded.clone(),
    card = new THREE.Mesh(geometry, guarded),
    target = new THREE.WebGLRenderTarget(80, 80, {
      type: THREE.HalfFloatType,
      samples: 2,
    }),
    camera = new THREE.OrthographicCamera(-2.2, 2.2, 1.55, -1.55, 0.1, 10),
    ambient = new THREE.AmbientLight(0xffffff, 2),
    light = new THREE.DirectionalLight(0xffffff, 2),
    uv = geometry.attributes.uv,
    originalUV = uv.array.slice(),
    saved = {
      target: renderer.getRenderTarget(),
      color: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
    },
    result = { guarded: [], control: [], interior: [] };
  scene.background = new THREE.Color(0.04, 0.06, 0.08);
  scene.add(card, ambient, light);
  light.position.set(1, 2, 3);
  control.onBeforeCompile = (shader) => {
    guarded.onBeforeCompile(shader);
    const before = shader.fragmentShader;
    shader.fragmentShader = before.replace(
      "pow(max(0.,1.-clothUv.y),5.)",
      "pow(1.-clothUv.y,5.)",
    );
    if (shader.fragmentShader === before)
      throw new Error("The unbounded sailcloth control was not constructed");
  };
  control.customProgramCacheKey = () => "courier-cloth-unbounded-control";

  function render(material, range, back) {
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        originalUV[i * 2],
        range[0] + originalUV[i * 2 + 1] * (range[1] - range[0]),
      );
    uv.needsUpdate = true;
    camera.position.set(0, 0, back ? -3 : 3);
    camera.lookAt(0, 0, 0);
    card.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = new Uint16Array(80 * 80 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 80, 80, pixels);
    let nonfinite = 0,
      maximum = 0;
    for (let i = 0; i < pixels.length; i++) {
      const value = THREE.DataUtils.fromHalfFloat(pixels[i]);
      if (!Number.isFinite(value)) nonfinite++;
      else if (i % 4 !== 3) maximum = Math.max(maximum, value);
    }
    return {
      pixels,
      report: {
        range,
        back,
        nonfinite,
        maximum,
        error: renderer.getContext().getError(),
      },
    };
  }

  try {
    renderer.autoClear = true;
    for (const back of [false, true])
      for (const range of [[-0.02, 1.02], [-0.125, 1.125]]) {
        result.guarded.push(render(guarded, range, back).report);
        result.control.push(render(control, range, back).report);
      }
    for (const back of [false, true]) {
      const a = render(guarded, [0.05, 0.95], back),
        b = render(control, [0.05, 0.95], back);
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
        back,
        differences,
        maximumDifference,
        guarded: a.report,
        control: b.report,
      });
    }
    return result;
  } finally {
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(saved.color, saved.alpha);
    renderer.autoClear = saved.autoClear;
    geometry.dispose();
    guarded.dispose();
    control.dispose();
    ambient.dispose();
    light.dispose();
    target.dispose();
  }
}
