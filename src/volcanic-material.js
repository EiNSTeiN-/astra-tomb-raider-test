// World-space cooling joints and ash shade the terrain. Scattered scans receive
// a matching charcoal tint. Fine seams fade with their screen footprint.
export const volcanicDeclarations = /* glsl */ `
#ifdef TERRAIN_FORGE
vec3 volcanicJoint(vec3 p) {
  vec2 drift=vec2(terrainNoise(p.xz*.31+vec2(p.y*.045,9.)),terrainNoise(p.xz*.27+vec2(31.,p.y*.053)))-.5;
  vec2 q=p.xz*.43+vec2(p.y*.019,-p.y*.013)+drift*.23;
  vec2 cell=floor(q), f=fract(q);
  float first=100.,second=100.,identity=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) {
    vec2 offset=vec2(float(i),float(j));
    float h=terrainHash(cell+offset);
    vec2 seed=.12+.76*vec2(h,terrainHash(cell+offset+vec2(37.,19.)));
    vec2 v=offset+seed-f;
    float d=dot(v,v);
    if(d<first){second=first;first=d;identity=h;}
    else second=min(second,d);
  }
  return vec3(sqrt(second)-sqrt(first),sqrt(first),identity);
}
vec3 volcanicReliefNormal(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
#endif
`;

export const volcanicColor = /* glsl */ `
#ifdef TERRAIN_FORGE
  vec3 cooling=volcanicJoint(vTerrainPosition);
  float jointWidth=max(.012,fwidth(cooling.x)*1.2);
  float joint=1.-smoothstep(.022-jointWidth,.055+jointWidth,cooling.x);
  float jointDetail=1.-smoothstep(.12,.35,fwidth(vTerrainPosition.x)+fwidth(vTerrainPosition.z));
  float flowMacro=terrainNoise(vTerrainPosition.xz*.043+vec2(17.,31.));
  float flowPhase=vTerrainPosition.y/(3.2+cooling.z*2.6)+cooling.z*1.7 + flowMacro*.18;
  float crossSeam=abs(fract(flowPhase+.5)-.5);
  float seamFootprint=max(.006,fwidth(flowPhase));
  float seam=(1.-smoothstep(.008,.022+seamFootprint,crossSeam))*(1.-smoothstep(.07,.3,seamFootprint))*step(.47,cooling.z);
  float fracture=max(joint*jointDetail,seam*.55);
  float ash=smoothstep(.58,.94,abs(vTerrainNormal.y))*smoothstep(.3,.72,flowMacro);
  float basaltGray=dot(cliffColor,vec3(.2126,.7152,.0722));
  cliffColor=mix(cliffColor,vec3(basaltGray)*vec3(.96,1.,1.07),.94);
  cliffColor*=mix(.82,1.18,cooling.z)*(1.-fracture*.3);
  cliffColor=mix(cliffColor,vec3(.23,.245,.26),ash*.25);
  float groundGray=dot(earthColor,vec3(.2126,.7152,.0722));
  earthColor=mix(vec3(groundGray)*vec3(.4,.43,.46),vec3(.11,.12,.13),ash*.17);
  pavingWeight*=smoothstep(.15,.72,vCourt+terrainNoise(vTerrainPosition.xz*.19)*.21);
  float coolingRelief=(min(.32,cooling.x)*.12-joint*.014-seam*.012)*jointDetail;
  terrainDamp=0.;
#endif
`;
export const volcanicNormal = /* glsl */ `
#ifdef TERRAIN_FORGE
  cliffN=volcanicReliefNormal(cliffN,coolingRelief);
  earthN=normalize(mix(earthN,normal,ash*.24));
#endif
`;
export const volcanicRoughness = /* glsl */ `
#ifdef TERRAIN_FORGE
  rockRough=mix(.79,.98,max(fracture,ash));
  terrainRough=mix(terrainRough,.98,ash*(1.-pavingWeight));
#endif
`;

// Keep the scan's geometry, texture detail and placement, but remove the moss
// coloration from this ash-covered chapter. The local material owns no textures.
export function volcanicBoulderMaterial(source) {
  const material = source.clone();
  material.name = "Ash-darkened volcanic boulder";
  material.color.set(0xaeb7c2);
  material.roughness = 1;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float stoneGray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(stoneGray)*vec3(.94,1.,1.06),.96)*.6;`,
    );
  };
  material.customProgramCacheKey = () => "vesper-volcanic-boulder-1";
  return material;
}
