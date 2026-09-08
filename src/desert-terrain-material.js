// World-space sediment and the chapter's bundled CC0 sand ripple maps.
export const desertTerrainDeclarations = /* glsl */ `
#ifdef TERRAIN_DESERT
varying float vDesertRock;
vec3 desertReliefNormal(vec3 base, float height) {
  vec3 dx=dFdx(-vViewPosition), dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base), ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
#endif
`;

export const desertTerrainColor = /* glsl */ `
#ifdef TERRAIN_DESERT
  float desertMacro=terrainNoise(vTerrainPosition.xz*.037+vec2(41.,9.));
  float desertDrift=terrainNoise(vTerrainPosition.xz*.18+vec2(13.,27.));
  vec2 desertUv=mat2(.86,.51,-.51,.86)*vTerrainPosition.xz/12.+vec2(.07,.31);
  earthColor=texture2D(map,desertUv).rgb
    *mix(vec3(2.1,1.63,1.07),vec3(2.55,1.86,1.16),desertMacro);
  pavingWeight*=smoothstep(.15,.67,desertDrift+vCourt*.19);
  terrainSlope=max(terrainSlope,vDesertRock*.86);
  float bedPhase=vTerrainPosition.y*1.55+vTerrainPosition.x*.033
    -vTerrainPosition.z*.021+desertMacro*.9;
  float bed=pow(.5+.5*sin(bedPhase),7.);
  float thinPhase=vTerrainPosition.y*11.+desertMacro*5.;
  float thin=(.5+.5*sin(thinPhase))*(1.-smoothstep(.8,2.4,fwidth(thinPhase)));
  float varnish=smoothstep(.5,.78,terrainNoise(vTerrainPosition.xz*.23+vec2(vTerrainPosition.y*.008,7.)))
    *(1.-smoothstep(.7,.95,abs(vTerrainNormal.y)));
  cliffColor*=mix(vec3(.89,.79,.66),vec3(1.12,1.08,.99),desertMacro);
  cliffColor*=1.-bed*.22-thin*.045-varnish*.21;
  cliffColor=mix(cliffColor,vec3(.62,.445,.24),smoothstep(.62,.95,vTerrainNormal.y)*.28);
  terrainDamp=0.;
#endif
`;

export const desertTerrainNormal = /* glsl */ `
#ifdef TERRAIN_DESERT
  earthN=terrainSurfaceNormal(texture2D(normalMap,desertUv).xyz,desertUv,normal,.52);
  float sediment=sin(bedPhase)*.025+sin(thinPhase)*.0015*(1.-smoothstep(.8,2.4,fwidth(thinPhase)));
  cliffN=desertReliefNormal(cliffN,sediment);
#endif
`;

export const desertTerrainRoughness = /* glsl */ `
#ifdef TERRAIN_DESERT
  terrainRough=mix(.86,.99,texture2D(roughnessMap,desertUv).g);
  terrainRough=mix(terrainRough,texture2D(pavingRoughness,pavingUv).g,pavingWeight);
  rockRough=mix(.93,.79,varnish);
#endif
`;
