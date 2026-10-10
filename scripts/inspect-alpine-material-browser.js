import * as THREE from "three";
import { alpineMaterial } from "../src/alpine-material.js";

// Development-only regression on a disposable renderer. Exercise the actual
// factory's GPU texture sampler across diagonal and lattice edges. A patterned
// fixture makes reversed upper-triangle weights observable without depending
// on a particular photograph, camera, light or snow mask.
export function verifyAlpineMaterialContinuity(game) {
  const renderer = game.renderer,
    gl = renderer.getContext(),
    previousTarget = renderer.getRenderTarget(),
    previousClear = renderer.autoClear;
  const bytes = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = ((x + 0.5) / 64) * Math.PI * 2,
        v = ((y + 0.5) / 64) * Math.PI * 2,
        values = [
          0.5 + 0.4 * Math.sin(u) + 0.05 * Math.cos(v * 3),
          0.5 + 0.35 * Math.cos(v) + 0.08 * Math.sin(u * 4),
          0.5 + 0.22 * Math.sin(u + v) + 0.2 * Math.cos(u * 2),
          1,
        ];
      values.forEach((value, channel) => {
        bytes[(y * 64 + x) * 4 + channel] = Math.round(value * 255);
      });
    }
  const map = new THREE.DataTexture(bytes, 64, 64),
    normalMap = new THREE.DataTexture(
      new Uint8Array([128, 128, 255, 255]),
      1,
      1,
    );
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  const source = new THREE.MeshStandardMaterial({ map, normalMap }),
    materials = [],
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new THREE.PlaneGeometry(2, 2),
    target = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType }),
    pixel = new Float32Array(8 * 8 * 4),
    uv = new THREE.Vector2(),
    mesh = new THREE.Mesh(geometry, source);
  camera.position.z = 2;
  scene.add(mesh);
  const cases = [],
    epsilon = 0.00001;
  for (const [x, y] of [
    [0, 0],
    [5, -3],
    [-4, 8],
  ]) {
    for (const t of [0.13, 0.27, 0.68, 0.86])
      cases.push({
        kind: "diagonal",
        x: x + t,
        y: y + 1 - t,
        dx: 0,
        dy: epsilon,
      });
    cases.push({ kind: "vertical", x: x + 1, y: y + 0.27, dx: epsilon, dy: 0 });
    cases.push({
      kind: "horizontal",
      x: x + 0.37,
      y: y + 1,
      dx: 0,
      dy: epsilon,
    });
  }
  const results = [];
  try {
    renderer.autoClear = true;
    for (const broken of [false, true]) {
      const material = alpineMaterial(source, new THREE.Color(0)),
        build = material.onBeforeCompile;
      materials.push(material);
      material.toneMapped = false;
      material.customProgramCacheKey = () => `alpine-continuity-${broken}`;
      material.onBeforeCompile = (shader) => {
        build(shader);
        shader.uniforms.alpineProbeUv = { value: uv };
        if (broken) {
          const original = shader.fragmentShader;
          shader.fragmentShader = original.replace(
            "vec3(f.x+f.y-1.,1.-f.x,1.-f.y)",
            "vec3(f.x+f.y-1.,1.-f.y,1.-f.x)",
          );
          if (shader.fragmentShader === original)
            throw new Error(
              "Alpine failing-control replacement was not found.",
            );
        }
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform vec2 alpineProbeUv;",
          )
          .replace(
            "#include <opaque_fragment>",
            "outgoingLight=alpineSample(map,alpineProbeUv);\n#include <opaque_fragment>",
          );
      };
      mesh.material = material;
      const capture = (x, y) => {
        // Inverse of the sampler's skew: inspect edges in lattice space.
        uv.set(x + 0.5 * y, y * Math.sqrt(3) * 0.5);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, 8, 8, pixel);
        if (gl.getError() || !pixel.every(Number.isFinite))
          throw new Error("Alpine edge probe produced invalid GPU output.");
        return Array.from(pixel.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 3));
      };
      for (const c of cases) {
        const a = capture(c.x - c.dx, c.y - c.dy),
          b = capture(c.x + c.dx, c.y + c.dy),
          jump = Math.max(...a.map((value, i) => Math.abs(value - b[i])));
        if (!broken && jump > 0.004)
          throw new Error(`Alpine ${c.kind} seam: ${jump}`);
        if (broken && jump < 0.02)
          throw new Error(
            "Alpine failing-control fixture did not detect the seam.",
          );
        results.push({ broken, ...c, a, b, jump });
      }
    }
    if (
      !renderer.info.programs.every((p) =>
        gl.getProgramParameter(p.program, gl.LINK_STATUS),
      )
    )
      throw new Error("Alpine edge probe shader did not link.");
    return results;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousClear;
    for (const material of materials) material.dispose();
    source.dispose();
    map.dispose();
    normalMap.dispose();
    geometry.dispose();
    target.dispose();
  }
}
