import * as THREE from "three";
import { waterRipples } from "../src/water-ripples.js";

// Disposable GPU fixture: compare the actual ripple shader with a 16x16-sample
// pixel average. Normal channels are linear, without lighting or tone mapping.
// This measures spatial filtering, not complete water appearance or frame rate.
export function verifyWaterRipples() {
  const renderer = new THREE.WebGLRenderer({ antialias: false }),
    scene = new THREE.Scene(),
    camera = new THREE.Camera(),
    geometry = new THREE.PlaneGeometry(2, 2),
    mesh = new THREE.Mesh(geometry),
    materials = new Map(),
    size = 128,
    samples = 16,
    results = [];
  scene.add(mesh);
  const shaders = {
    filtered: waterRipples,
    unfiltered: waterRipples.replace(
      /float waterBandWeight\(vec2 phaseStep\)\{[^}]+\}/,
      "float waterBandWeight(vec2 phaseStep){return 1.0;}",
    ),
  };
  function render(mode, resolution, span, time) {
    if (!materials.has(mode))
      materials.set(
        mode,
        new THREE.ShaderMaterial({
          uniforms: { span: { value: span }, time: { value: time } },
          vertexShader: `uniform float span; varying vec2 point;
            void main(){point=uv*span+vec2(17.3,-41.7);gl_Position=vec4(position,1.0);}`,
          fragmentShader: `uniform float time; varying vec2 point;
            ${shaders[mode]}
            void main(){vec2 slope=waterRipples(point,time,dFdx(point),dFdy(point));
            gl_FragColor=vec4(.5+slope*3.0,.5,1.0);}`,
          depthTest: false,
          depthWrite: false,
        }),
      );
    mesh.material = materials.get(mode);
    mesh.material.uniforms.span.value = span;
    mesh.material.uniforms.time.value = time;
    const target = new THREE.WebGLRenderTarget(resolution, resolution, {
        depthBuffer: false,
      }),
      bytes = new Uint8Array(resolution * resolution * 4);
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(
        target,
        0,
        0,
        resolution,
        resolution,
        bytes,
      );
      return bytes;
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
    }
  }
  function error(bytes, reference) {
    let squared = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        for (let channel = 0; channel < 2; channel++) {
          let average = 0;
          for (let dy = 0; dy < samples; dy++)
            for (let dx = 0; dx < samples; dx++)
              average +=
                reference[
                  ((y * samples + dy) * size * samples + x * samples + dx) * 4 +
                    channel
                ];
          average /= samples * samples;
          squared += (bytes[(y * size + x) * 4 + channel] - average) ** 2;
        }
    return Math.sqrt(squared / (size * size * 2)) / 255;
  }
  try {
    for (const span of [32, 128, 256])
      for (const time of [25, 26.3]) {
        const reference = render("unfiltered", size * samples, span, time),
          row = { span, time, metresPerPixel: span / size };
        for (const mode of Object.keys(shaders))
          row[mode] = error(render(mode, size, span, time), reference);
        if (row.filtered >= row.unfiltered * 0.25)
          throw Error(`Ripple filtering failed at ${span} m / ${time} s`);
        results.push(row);
      }
    const gl = renderer.getContext();
    if (
      !renderer.info.programs.every((p) =>
        gl.getProgramParameter(p.program, gl.LINK_STATUS),
      )
    )
      throw Error("Ripple fixture shader did not link");
    return results;
  } finally {
    geometry.dispose();
    for (const material of materials.values()) material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
