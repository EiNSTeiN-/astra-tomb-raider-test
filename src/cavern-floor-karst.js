const cached = new WeakMap();

export function cavernFloorUniforms(map) {
  if (map && cached.has(map)) return cached.get(map);
  const uniforms = { cavernFloorStrength: { value: 1 } };
  if (map) cached.set(map, uniforms);
  return uniforms;
}

// Shallow solution joints divide exposed limestone into irregular plates.
// This is material relief only: the delivered floor triangles do not move.
export const cavernFloorDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
uniform float cavernFloorStrength;
struct CavePavement {float coverage;float joint;float lip;float tone;float silt;float relief;};
vec2 cavePlateSeed(vec2 cell) {
  return vec2(karstHash(cell+vec2(43.,17.)),karstHash(cell+vec2(7.,91.)));
}
CavePavement cavePavement(vec2 world,vec3 surfaceNormal,float retainedPaving) {
  float region=karstNoise(world*.037+vec2(37.,71.));
  vec2 warp=vec2(karstNoise(world*.12+vec2(11.,29.)),
    karstNoise(world*.12+vec2(83.,7.)))-.5;
  vec2 p=mat2(.9239,.3827,-.3827,.9239)*world/2.6+warp*.7;
  vec2 cell=floor(p),nearest=vec2(0.),owner=vec2(0.);
  float distanceSquared=1.e10;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 c=cell+vec2(float(x),float(y));
    vec2 d=c+.18+cavePlateSeed(c)*.64-p;
    float q=dot(d,d);
    if(q<distanceSquared) {distanceSquared=q;nearest=d;owner=c;}
  }
  float edge=1.e10;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 c=cell+vec2(float(x),float(y));
    vec2 d=c+.18+cavePlateSeed(c)*.64-p;
    vec2 separation=d-nearest;
    float lengthSquared=dot(separation,separation);
    if(lengthSquared>1.e-6)
      edge=min(edge,dot((d+nearest)*.5,separation)*inversesqrt(lengthSquared));
  }
  float meters=max(0.,edge)*2.6;
  float pixel=max(.004,fwidth(meters));
  float width=.035+.04*karstHash(owner+vec2(19.,3.));
  float joint=(1.-smoothstep(width-pixel*.5,width+pixel*.5,meters))
    *clamp(2.*width/pixel,0.,1.);
  float lip=(1.-smoothstep(.08,.22+pixel,meters))*(1.-joint);
  float silt=smoothstep(.45,.76,region+(karstNoise(world*.24+vec2(3.,41.))-.5)*.23);
  float exposure=(.6+.4*(1.-silt))
    *smoothstep(.50,.90,surfaceNormal.y)*(1.-clamp(retainedPaving,0.,1.))
    *cavernFloorStrength;
  CavePavement result;
  result.coverage=clamp(exposure,0.,1.);
  result.joint=joint*(1.-silt*.82);
  result.lip=lip*(1.-silt*.7);
  result.tone=karstHash(owner+vec2(61.,13.));
  result.silt=silt;
  result.relief=(lip*.0015-joint*.004)*(1.-silt*.8)*result.coverage;
  return result;
}
vec3 cavePavementColor(vec3 substrate,CavePavement floor) {
  float gray=dot(substrate,vec3(.2126,.7152,.0722));
  vec3 stone=mix(substrate,vec3(gray)*vec3(1.13,1.09,.99),.85);
  stone*=.72+floor.tone*.6;
  stone=mix(stone,stone*vec3(1.21,1.18,1.08)+vec3(.012),floor.lip*.7);
  stone*=1.-floor.joint*.62;
  vec3 sediment=mix(substrate,vec3(gray)*vec3(1.16,1.055,.87),.65);
  stone=mix(stone,sediment,floor.silt*.65);
  return mix(substrate,stone,floor.coverage);
}
#endif
`;

export const cavernFloorColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  CavePavement floorKarst=cavePavement(vTerrainPosition.xz,normalize(vTerrainNormal),
    max(archive.coverage,clamp(vCavernRock,0.,1.)));
  terrainAlbedo=cavePavementColor(terrainAlbedo,floorKarst);
#endif
`;

export const cavernFloorRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  roughnessFactor=mix(roughnessFactor,mix(.84,.96,floorKarst.silt),floorKarst.coverage*.7);
#endif
`;

export const cavernFloorNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainN=karstNormal(terrainN,floorKarst.relief);
#endif
`;
