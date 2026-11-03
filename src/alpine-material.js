import {
  alpineDeclarations,
  alpineDetailDeclarations,
  alpineColorLayer,
  alpineNormalLayer,
  alpineHazeLayer,
} from "./alpine-shader.js";

// Existing rock maps projected in metres; snow collects on ledges and in
// gullies. Its broad coverage and fine edge breakup use separate scales so
// the range reads at a distance. Neighbouring shifted texture samples blend
// continuously across a triangular lattice, keeping rock grain while breaking
// up the large blotches that repeated across entire faces.
export function alpineMaterial(source, haze) {
  const material = source.clone();
  material.name = "Alpine rock faces and deposited snow";
  material.color.set(0xffffff);
  material.roughnessMap = null;
  material.roughness = 0.95;
  material.envMapIntensity = 0.45;
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.alpineHaze = { value: haze };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vAlpinePosition, vAlpineNormal; varying float vAlpineClip;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvAlpinePosition=(modelMatrix*vec4(position,1.)).xyz; vAlpineNormal=normalize(mat3(modelMatrix)*normal);",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vAlpineClip=gl_Position.z+gl_Position.w;
        float backgroundDepth=.2+.75*(max(0.,gl_Position.w)/(max(0.,gl_Position.w)+700.));
        gl_Position.z=gl_Position.w*backgroundDepth;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", alpineDeclarations)
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(vAlpineClip<0.) discard;",
      )
      .replace("#include <normalmap_pars_fragment>", alpineDetailDeclarations)
      .replace("#include <map_fragment>", alpineColorLayer)
      .replace("#include <normal_fragment_maps>", alpineNormalLayer)
      .replace("#include <opaque_fragment>", alpineHazeLayer);
  };
  material.customProgramCacheKey = () => "vesper-alpine-range-7";
  return material;
}
