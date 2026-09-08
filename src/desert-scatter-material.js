import * as THREE from "three";

// Terrain owns these three textures. The scatter shader borrows them through
// uniforms, so retiring this material cannot dispose a still-shared map twice.
export function desertScatterMaterial(terrain) {
  const material = new THREE.MeshStandardMaterial({
    name: "Dry sandstone and talus",
    color: 0xffffff,
    roughness: 0.96,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      scatterColor: terrain.cliffMap,
      scatterNormal: terrain.cliffNormal,
      scatterRough: terrain.cliffRoughness,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vScatterPosition, vScatterNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 scatterP=vec4(position,1.);
        vec3 scatterN=normal;
        #ifdef USE_INSTANCING
          scatterP=instanceMatrix*scatterP;
          mat3 scatterM=mat3(instanceMatrix);
          scatterN/=vec3(dot(scatterM[0],scatterM[0]),dot(scatterM[1],scatterM[1]),dot(scatterM[2],scatterM[2]));
          scatterN=scatterM*scatterN;
        #endif
        vScatterPosition=(modelMatrix*scatterP).xyz;
        vScatterNormal=normalize(mat3(modelMatrix)*scatterN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D scatterColor, scatterNormal, scatterRough;
        varying vec3 vScatterPosition, vScatterNormal;
        vec3 scatterBump(vec3 sampled, vec2 uv, vec3 base) {
          vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
          vec2 st0=dFdx(uv),st1=dFdy(uv);
          vec3 p1=cross(q1,base),p0=cross(base,q0);
          vec3 tangent=p1*st0.x+p0*st1.x,bitangent=p1*st0.y+p0*st1.y;
          float length2=max(dot(tangent,tangent),dot(bitangent,bitangent));
          float scale=length2>0.?inversesqrt(length2):0.;
          vec3 detail=sampled*2.-1.;detail.xy*=.6;
          return normalize(tangent*scale*detail.x+bitangent*scale*detail.y+base*detail.z);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 stoneP=vScatterPosition,stoneN=normalize(vScatterNormal);
        vec3 stoneWeight=pow(abs(stoneN),vec3(4.));
        stoneWeight/=max(.001,stoneWeight.x+stoneWeight.y+stoneWeight.z);
        vec2 stoneX=stoneP.zy/3.,stoneY=stoneP.xz/3.,stoneZ=stoneP.xy/3.;
        vec3 stoneColor=texture2D(scatterColor,stoneX).rgb*stoneWeight.x
          +texture2D(scatterColor,stoneY).rgb*stoneWeight.y
          +texture2D(scatterColor,stoneZ).rgb*stoneWeight.z;
        float strata=.5+.5*sin(stoneP.y*6.+sin(stoneP.x*.14+stoneP.z*.1));
        float dust=smoothstep(.35,.95,stoneN.y);
        stoneColor*=vec3(1.12,1.01,.85)*(.9+strata*.12);
        diffuseColor.rgb*=mix(stoneColor,vec3(.62,.445,.24),dust*.32);
      `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
        float stoneR=texture2D(scatterRough,stoneX).g*stoneWeight.x
          +texture2D(scatterRough,stoneY).g*stoneWeight.y
          +texture2D(scatterRough,stoneZ).g*stoneWeight.z;
        float roughnessFactor=roughness*mix(.82,.99,max(stoneR,dust*.8));
      `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `
        normal=normalize(scatterBump(texture2D(scatterNormal,stoneX).rgb,stoneX,normal)*stoneWeight.x
          +scatterBump(texture2D(scatterNormal,stoneY).rgb,stoneY,normal)*stoneWeight.y
          +scatterBump(texture2D(scatterNormal,stoneZ).rgb,stoneZ,normal)*stoneWeight.z);
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-desert-scatter-1";
  return material;
}
