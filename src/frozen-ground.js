import * as THREE from "three";

// Refrozen meltwater lies on the existing walking surface. Each patch has a
// different long axis; powder and fractures break up the exposed ice without
// introducing a raised sheet, a second depth surface, or a swimming volume.
const profiles = [
  [0.18, 0.94, 0.78],
  [-0.48, 0.79, 0.93],
  [0.61, 0.9, 0.82],
  [-0.15, 0.87, 0.95],
  [0.42, 0.93, 0.73],
];

export function frozenGroundUniforms(sites) {
  const ice = sites.filter((site) => site.kind === "ice");
  return {
    frozenCenters: {
      value: ice.map(
        (site, i) =>
          new THREE.Vector4(site.x, site.z, site.baseY - 0.025, i * 2.17),
      ),
    },
    frozenShapes: {
      value: ice.map((site, i) => {
        const [turn, x, z] = profiles[i % profiles.length];
        return new THREE.Vector4(
          Math.cos(turn),
          Math.sin(turn),
          (site.width * x) / 2,
          (site.length * z) / 2,
        );
      }),
    },
  };
}

export const frozenDeclarations = /* glsl */ `
#ifdef FROZEN_PATCH_COUNT
uniform vec4 frozenCenters[FROZEN_PATCH_COUNT], frozenShapes[FROZEN_PATCH_COUNT];
uniform sampler2D frozenMap, frozenNormalMap, frozenRoughnessMap;
#endif
`;

export const frozenColor = /* glsl */ `
#ifdef FROZEN_PATCH_COUNT
float frozenCoverage=0.;
vec2 frozenUv=vTerrainPosition.xz/12.;
for(int frozenIndex=0;frozenIndex<FROZEN_PATCH_COUNT;frozenIndex++){
  vec4 center=frozenCenters[frozenIndex],shape=frozenShapes[frozenIndex];
  vec2 delta=vTerrainPosition.xz-center.xy;
  if(length(delta)>max(shape.z,shape.w)*1.12)continue;
  vec2 local=mat2(shape.x,-shape.y,shape.y,shape.x)*delta;
  vec2 q=local/shape.zw;
  vec2 warp=vec2(terrainNoise(q*3.1+center.w),terrainNoise(q*3.1-center.w+17.))-.5;
  float edge=length(q+warp*.14);
  float snowDust=terrainNoise(local*.76+center.w);
  float coverage=(1.-smoothstep(.76,.95,edge+(snowDust-.5)*.045))
    *(1.-smoothstep(.08,.3,abs(vTerrainPosition.y-center.z)))
    *smoothstep(.88,.98,normalize(vTerrainNormal).y);
  if(coverage<=frozenCoverage)continue;
  frozenCoverage=coverage;
  frozenUv=local/12.+vec2(center.w,center.w*.37);
}
// Ice shares the terrain triangles and depth. Texture detail supplies the
// trapped bubbles and fine fractures; powder feathers only its exposed edge.
vec3 frozenDetail=texture2D(frozenMap,frozenUv).rgb;
vec3 frozenAlbedo=mix(vec3(.36,.43,.47),frozenDetail*vec3(.95,1.,1.05),.24);
terrainAlbedo=mix(terrainAlbedo,frozenAlbedo,frozenCoverage);
#endif
`;

export const frozenRoughness = /* glsl */ `
#ifdef FROZEN_PATCH_COUNT
roughnessFactor=mix(roughnessFactor,.25+texture2D(frozenRoughnessMap,frozenUv).g*.4,frozenCoverage);
#endif
`;

export const frozenNormal = /* glsl */ `
#ifdef FROZEN_PATCH_COUNT
terrainN=normalize(mix(terrainN,
  terrainSurfaceNormal(texture2D(frozenNormalMap,frozenUv).xyz,frozenUv,normal,.1),frozenCoverage));
#endif
`;
