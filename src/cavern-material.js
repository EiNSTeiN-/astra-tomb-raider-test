import * as THREE from "three";
import { pbrMaterial } from "./visuals.js";

export function cavernRock() {
  const material = pbrMaterial("rock", 0x899495);
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
      float caveLayer=sin(cavePosition.y*1.3+sin(cavePosition.x*.17)*1.6+sin(cavePosition.z*.19));
      float caveWet=smoothstep(.1,.85,sin(cavePosition.x*.37+sin(cavePosition.z*.21)*3.));
      diffuseColor.rgb*=caveAlbedo*mix(.67,1.04,smoothstep(-.9,.6,caveLayer))*mix(1.,.7,caveWet);
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
      float caveRough=texture2D(roughnessMap,caveX).g*caveW.x+
        texture2D(roughnessMap,caveY).g*caveW.y+texture2D(roughnessMap,caveZ).g*caveW.z;
      float roughnessFactor=mix(clamp(caveRough,.62,1.),.32,caveWet*.7);
    `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
      normal=normalize(caveDetail(texture2D(normalMap,caveX).xyz,caveX,normal)*caveW.x+
        caveDetail(texture2D(normalMap,caveY).xyz,caveY,normal)*caveW.y+
        caveDetail(texture2D(normalMap,caveZ).xyz,caveZ,normal)*caveW.z);
    `,
      );
  };
  material.customProgramCacheKey = () => "cavern-rock-v1";
  return material;
}

export function mineralMaterial(color, restoration) {
  const material = new THREE.MeshPhysicalMaterial({
    name: "Faceted luminous quartz",
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    roughness: 0.24,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.restoration = restoration;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 mineralPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nmineralPosition=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float restoration; varying vec3 mineralPosition;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        float band=sin(mineralPosition.y*6.+sin(mineralPosition.x*11.)*.7);
        float inclusions=smoothstep(.4,.9,band)*.08;
        float rim=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
        totalEmissiveRadiance*= (.24+rim*.7+inclusions)*(.55+restoration*.85);
        diffuseColor.rgb*=mix(.94,1.,smoothstep(-.8,.6,band));
      `,
      );
  };
  material.customProgramCacheKey = () => "cavern-mineral-v1";
  return material;
}
