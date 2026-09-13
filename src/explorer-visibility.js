import { MathUtils } from "three";

export function explorerCoverage(distance) {
  return MathUtils.smoothstep(distance, 1.5, 2.2);
}

// A common screen-space mask keeps skin, clothes and equipment opaque at the
// same pixels. Blending those overlapping meshes independently exposes eyes,
// teeth and inner clothing through the exterior as the character fades.
const declarations = /* glsl */ `
uniform float explorerCoverage;
float explorerThreshold() {
  ivec2 cell = ivec2(mod(floor(gl_FragCoord.xy), 4.0));
  const float pattern[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (pattern[cell.y * 4 + cell.x] + .5) / 16.0;
}
`;

export class ExplorerVisibility {
  constructor(groups) {
    this.uniform = { value: 1 };
    this.meshes = [];
    const materials = new Set();
    for (const group of groups.filter(Boolean))
      group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        this.meshes.push({
          mesh,
          excludeContact: mesh.userData.excludeContact,
        });
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          if (materials.has(material)) continue;
          materials.add(material);
          const compile = material.onBeforeCompile,
            key = material.customProgramCacheKey();
          material.onBeforeCompile = (shader, renderer) => {
            compile.call(material, shader, renderer);
            shader.uniforms.explorerCoverage = this.uniform;
            shader.fragmentShader = declarations + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              /void\s+main\s*\(\s*\)\s*\{/,
              `void main() {
              if (explorerCoverage < 1.0 && explorerCoverage < explorerThreshold()) discard;`,
            );
          };
          material.customProgramCacheKey = () => `${key}:explorer-coverage-v1`;
          material.needsUpdate = true;
        }
      });
  }

  set(distance = Infinity) {
    const coverage = explorerCoverage(distance);
    this.uniform.value = coverage;
    // The AO override does not run this material mask. Exclude a fading actor
    // there so it cannot leave a full-size contact silhouette over the scene.
    for (const { mesh, excludeContact } of this.meshes)
      mesh.userData.excludeContact = excludeContact || coverage < 1;
    return coverage;
  }
}
