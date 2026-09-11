import { cavernStrata } from "./cavern-strata.js";
import * as THREE from "three";
import { pbrMaterial } from "./visuals.js";

export function cavernRock() {
  const material = pbrMaterial("rock", 0xc0c3bf);
  material.name = "Wet stratified cavern rock";
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 cavePosition, caveNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ncavePosition=(modelMatrix*vec4(position,1.0)).xyz; caveNormal=normalize(mat3(modelMatrix)*normal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
      #include <common>
      varying vec3 cavePosition, caveNormal;
      ${cavernStrata}
    `,
      )
      .replace(
        "#include <normalmap_pars_fragment>",
        /* glsl */ `
      #include <normalmap_pars_fragment>
      vec3 caveDetail(vec3 sampleN, vec2 uv, vec3 n) {
        vec3 d=sampleN*2.0-1.0; d.xy*=.65;
        return normalize(getTangentFrame(-vViewPosition,n,uv)*d);
      }
    `,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
      vec3 caveW=pow(abs(normalize(caveNormal)),vec3(4.));
      caveW/=max(.001,caveW.x+caveW.y+caveW.z);
      vec2 caveX=cavePosition.zy/5.0, caveY=cavePosition.xz/5.0, caveZ=cavePosition.xy/5.0;
      vec3 caveAlbedo=texture2D(map,caveX).rgb*caveW.x+
        texture2D(map,caveY).rgb*caveW.y+texture2D(map,caveZ).rgb*caveW.z;
      KarstSurface karst=karstSurface(cavePosition,normalize(caveNormal));
      diffuseColor.rgb*=karstColor(caveAlbedo,karst);
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
      float caveRough=texture2D(roughnessMap,caveX).g*caveW.x+
        texture2D(roughnessMap,caveY).g*caveW.y+texture2D(roughnessMap,caveZ).g*caveW.z;
      float roughnessFactor=mix(clamp(caveRough,.78,1.),.55,karst.damp);
    `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
      normal=normalize(caveDetail(texture2D(normalMap,caveX).xyz,caveX,normal)*caveW.x+
        caveDetail(texture2D(normalMap,caveY).xyz,caveY,normal)*caveW.y+
        caveDetail(texture2D(normalMap,caveZ).xyz,caveZ,normal)*caveW.z);
      normal=karstNormal(normal,karst.relief);
    `,
      );
  };
  material.customProgramCacheKey = () => "cavern-rock-v2";
  return material;
}

export { mineralMaterial } from "./mineral-art.js";
