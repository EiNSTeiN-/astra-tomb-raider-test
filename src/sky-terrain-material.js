export const skyTerrainDeclarations = /* glsl */ `
#ifdef TERRAIN_SKY
uniform sampler2D skyMossMap, skyMossNormal;
varying float vSkyDepth;
#endif
`;

export const skyCliffCoordinates = /* glsl */ `
#ifdef TERRAIN_SKY
cliffUvX=vTerrainPosition.zy/9.;
cliffUvY=vTerrainPosition.xz/9.;
cliffUvZ=vTerrainPosition.xy/9.;
#endif
`;

export const skyTerrainColor = /* glsl */ `
#ifdef TERRAIN_SKY
  float skyBroad=terrainNoise(vTerrainPosition.xz*.028+vec2(21.,7.));
  float skyCross=terrainNoise(vTerrainPosition.xz*.16+vec2(vTerrainPosition.y*.021,19.));
  vec2 skyMossUv=vTerrainPosition.xz/2.8;
  vec3 skyMossColor=texture2D(skyMossMap,skyMossUv).rgb;
  float earthGray=dot(earthColor,vec3(.2126,.7152,.0722));
  earthColor=mix(earthColor,vec3(earthGray)*vec3(.91,.95,.83),.58);
  trailWeight=smoothstep(.12,.9,vTrail)*.82;
  earthColor*=mix(.8,1.12,trailWeight);
  terrainSlope=max(terrainSlope,smoothstep(3.,10.,vSkyDepth)*.94);
  float skyMoss=smoothstep(.42,.7,skyCross*.65+skyBroad*.35)
    *smoothstep(.58,.9,vTerrainNormal.y)*(1.-pavingWeight*.9)*(1.-trailWeight*.9);
  skyMoss*=1.-smoothstep(13.,24.,vSkyDepth);
  growthWeight=skyMoss*.72;
  float skySeep=smoothstep(.67,.83,terrainNoise(vTerrainPosition.xz*.055+vec2(vTerrainPosition.y*.006,3.)))
    *smoothstep(3.,12.,vSkyDepth)*terrainSlope;
  terrainDamp=skySeep*.7;
  float skyJointPhase=vTerrainPosition.y*.49+vTerrainPosition.x*.023-vTerrainPosition.z*.018+skyBroad*2.;
  float skyJoint=(1.-smoothstep(.045,.2,abs(sin(skyJointPhase))))
    *(1.-smoothstep(.5,2.,fwidth(skyJointPhase)));
  vec3 cliffAlternate=texture2D(cliffMap,cliffUvX*2.13+vec2(.39,.71)).rgb*terrainWeights.x
    +texture2D(cliffMap,cliffUvY*2.13+vec2(.39,.71)).rgb*terrainWeights.y
    +texture2D(cliffMap,cliffUvZ*2.13+vec2(.39,.71)).rgb*terrainWeights.z;
  cliffColor=mix(cliffColor,cliffAlternate,smoothstep(.2,.8,skyBroad)*.38);
  float cliffGray=dot(cliffColor,vec3(.2126,.7152,.0722));
  cliffColor=mix(cliffColor,vec3(cliffGray)*vec3(.94,1.,1.025),.84);
  cliffColor*=mix(.74,1.17,skyBroad)*(1.-skyJoint*.14)*(1.-skySeep*.27);
#endif
`;

export const skyTerrainAlbedo = /* glsl */ `
#ifdef TERRAIN_SKY
terrainAlbedo=mix(terrainAlbedo,skyMossColor*vec3(.47,.67,.48),growthWeight);
#endif
`;

export const skyTerrainNormal = /* glsl */ `
#ifdef TERRAIN_SKY
  vec3 skyAlternateN=normalize(
    terrainSurfaceNormal(texture2D(cliffNormal,cliffUvX*2.13+vec2(.39,.71)).xyz,cliffUvX*2.13,normal,.8)*terrainWeights.x
    +terrainSurfaceNormal(texture2D(cliffNormal,cliffUvY*2.13+vec2(.39,.71)).xyz,cliffUvY*2.13,normal,.8)*terrainWeights.y
    +terrainSurfaceNormal(texture2D(cliffNormal,cliffUvZ*2.13+vec2(.39,.71)).xyz,cliffUvZ*2.13,normal,.8)*terrainWeights.z);
  cliffN=normalize(mix(cliffN,skyAlternateN,smoothstep(.2,.8,skyBroad)*.38));
#endif
`;

export const skyGroundNormal = /* glsl */ `
#ifdef TERRAIN_SKY
  terrainN=normalize(mix(terrainN,
    terrainSurfaceNormal(texture2D(skyMossNormal,skyMossUv).xyz,skyMossUv,normal,.45),growthWeight));
#endif
`;

export const skyTerrainRoughness = /* glsl */ `
#ifdef TERRAIN_SKY
  float skyAlternateRough=texture2D(cliffRoughness,cliffUvX*2.13+vec2(.39,.71)).g*terrainWeights.x
    +texture2D(cliffRoughness,cliffUvY*2.13+vec2(.39,.71)).g*terrainWeights.y
    +texture2D(cliffRoughness,cliffUvZ*2.13+vec2(.39,.71)).g*terrainWeights.z;
  rockRough=mix(rockRough,skyAlternateRough,smoothstep(.2,.8,skyBroad)*.38);
#endif
`;
