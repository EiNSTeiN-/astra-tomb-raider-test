// Tilted beds and staggered cross joints are evaluated in world space. Derivative
// filtering removes thin seams at a distance; the existing credited rock maps
// supply grain. No additional texture allocations are needed.
export const meridianDeclarations = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
varying float vMeridianRock;
vec3 meridianReliefNormal(vec3 base, float height) {
  vec3 dx=dFdx(-vViewPosition), dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base), ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
#endif
`;

export const meridianColor = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
  vec3 mp=vTerrainPosition;
  float weather=terrainNoise(mp.xz*.061+vec2(23.,7.));
  float bed=(mp.y+mp.x*.028-mp.z*.017)/2.35+weather*.28;
  float bedCell=floor(bed);
  float bedIdentity=terrainHash(vec2(bedCell,17.));
  float drift=terrainNoise(mp.xz*.13+vec2(bedCell*.11,9.));
  float bedEdge=abs(fract(bed+drift*.07+.5)-.5);
  float bedFootprint=max(.003,fwidth(bed));
  float bedSeam=(1.-smoothstep(.009,.025+bedFootprint,bedEdge))
    *(1.-smoothstep(.08,.3,bedFootprint));
  float crossPhase=(mp.x*.71+mp.z*.7)/(2.7+bedIdentity*2.1)+bedIdentity*3.+drift*.14;
  float crossEdge=abs(fract(crossPhase+.5)-.5);
  float crossFootprint=max(.004,fwidth(crossPhase));
  float crossJoint=(1.-smoothstep(.005,.024+crossFootprint,crossEdge))
    *(1.-smoothstep(.1,.35,crossFootprint));
  float meridianExposure=clamp(vMeridianRock,0.,1.);
  float seamSurvival=smoothstep(.24,.71,terrainNoise(mp.xz*.39+vec2(mp.y*.31,17.)));
  float meridianFracture=max(bedSeam,crossJoint*.55)*meridianExposure*seamSurvival;
  float meridianDust=smoothstep(.58,.94,abs(vTerrainNormal.y))
    *smoothstep(.24,.8,terrainNoise(mp.xz*.07+vec2(13.,41.)));
  float rockGray=dot(cliffColor,vec3(.2126,.7152,.0722));
  cliffColor=mix(cliffColor,vec3(rockGray)*vec3(.94,.98,1.04),.82);
  cliffColor*=mix(.92,1.08,bedIdentity)*(1.-meridianFracture*.24);
  float groundGray=dot(earthColor,vec3(.2126,.7152,.0722));
  earthColor=vec3(groundGray)*vec3(.43,.46,.51);
  earthColor=mix(earthColor,vec3(.105,.108,.116),meridianDust*.32);
  // Exposed horizontal shelves share the cliff surface instead of looking like
  // a pale coating on top of a darker wall. Paving remains on working courts.
  terrainSlope=max(terrainSlope,meridianExposure*.86);
  pavingWeight*=1.-meridianExposure;
  float meridianRelief=(-bedSeam*.021-crossJoint*.014)*meridianExposure*seamSurvival;
#endif
`;

export const meridianNormal = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
  earthN=normalize(mix(normal,earthN,.43-meridianDust*.12));
  cliffN=meridianReliefNormal(normalize(mix(normal,cliffN,.66)),meridianRelief);
#endif
`;

export const meridianRoughness = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
  rockRough=mix(.86,.98,max(meridianDust,meridianFracture));
  terrainRough=mix(terrainRough,.96,(1.-pavingWeight)*.74);
#endif
`;

// Clone the scan material so the other chapters keep their original vegetation
// coloration. All texture references remain owned by the loaded asset.
export function meridianBoulderMaterial(source) {
  const material = source.clone();
  material.name = "Weathered meridian boulder";
  material.color.set(0xc7cbd2);
  material.roughness = 1;
  material.normalScale.multiplyScalar(0.7);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float stoneGray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(stoneGray)*vec3(.94,.98,1.04),.92)*.65;`,
    );
  };
  material.customProgramCacheKey = () => "vesper-meridian-boulder-1";
  return material;
}
