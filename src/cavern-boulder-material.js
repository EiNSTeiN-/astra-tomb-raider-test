import { cavernStrata } from "./cavern-strata.js";

// Retain the scan's grain and texture ownership. Limestone deposits replace
// the outdoor coloration; bedding and dampness use each placed stone's world
// coordinates, including the instance transform used by the LOD batches.
export function cavernBoulderMaterial(source) {
  const material = source.clone(),
    previous = source.onBeforeCompile,
    previousKey = source.customProgramCacheKey();
  material.name = "Calcareous cavern boulder";
  material.color.setHex(0xffffff);
  material.roughness = 1;
  material.normalScale.multiplyScalar(0.62);
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCavernBoulderWorld;",
      )
      .replace(
        "#include <worldpos_vertex>",
        /* glsl */ `
        #include <worldpos_vertex>
        vec4 cavernBoulderPosition=vec4(transformed,1.);
        #ifdef USE_BATCHING
          cavernBoulderPosition=batchingMatrix*cavernBoulderPosition;
        #endif
        #ifdef USE_INSTANCING
          cavernBoulderPosition=instanceMatrix*cavernBoulderPosition;
        #endif
        vCavernBoulderWorld=(modelMatrix*cavernBoulderPosition).xyz;
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vCavernBoulderWorld;\n${cavernStrata}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        vec3 cavernBoulderNormal=inverseTransformDirection(nonPerturbedNormal,viewMatrix);
        KarstSurface cavernStone=karstSurface(vCavernBoulderWorld,cavernBoulderNormal);
        float scanGray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        vec3 limestone=min(vec3(.72),vec3(scanGray)*vec3(1.08,1.055,.98)*1.28);
        diffuseColor.rgb=karstColor(limestone,cavernStone);
        float calciteCoat=clamp(cavernStone.calcite*.62+cavernStone.dust*.18,0.,.8);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.255,.228),calciteCoat*.28);
        roughnessFactor=mix(max(roughnessFactor,.76),.56,cavernStone.damp);
        roughnessFactor=mix(roughnessFactor,.88,calciteCoat*.48);
        normal=karstNormal(normalize(mix(normal,nonPerturbedNormal,calciteCoat*.35)),cavernStone.relief*.45);
      `,
      );
  };
  material.customProgramCacheKey = () => previousKey + "-cavern-boulder-1";
  return material;
}
