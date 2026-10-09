// Tilted beds and staggered cross joints are evaluated in world space. Derivative
// filtering removes thin seams at a distance; the existing credited rock maps
// supply grain. No additional texture allocations are needed.
export const meridianDeclarations = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
varying float vMeridianRock;
uniform vec4 meridianCourts[MERIDIAN_COURT_COUNT];
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
  // Wind-polished tracks separate from sheltered mineral soil. Broad oxide
  // washes interrupt the repeating scan grain without changing ground height.
  float meridianWash=terrainNoise(mp.xz*vec2(.037,.081)+vec2(weather*3.,19.));
  float meridianFine=terrainNoise(mp.xz*.31+vec2(7.,37.));
  earthColor*=mix(.78,1.28,smoothstep(.22,.78,meridianWash));
  earthColor=mix(earthColor,earthColor*vec3(1.29,1.12,.86),
    smoothstep(.48,.81,meridianWash)*meridianDust*.66);
  earthColor=mix(earthColor,earthColor*vec3(.91,1.07,.99),
    smoothstep(.54,.82,meridianFine)*(1.-meridianWash)*.38);
  trailWeight=smoothstep(.08,.87,vTrail)*.72;
  earthColor=mix(earthColor,vec3(groundGray)*vec3(.5,.48,.44),trailWeight);
  // Concentric dressed courses belong to the dome footprint. Eroded outer
  // stones blend into the mineral soil rather than stamping a complete disk.
  float meridianCourtMask=0.;
  vec2 meridianLocal=vec2(0.);
  float meridianCourtStyle=0.;
  for(int i=0;i<MERIDIAN_COURT_COUNT;i++) {
    vec4 site=meridianCourts[i];
    vec2 delta=mp.xz-site.xy;
    float mask=1.-smoothstep(site.z-.65,site.z+.15,length(delta));
    mask*=smoothstep(.22,.57,terrainNoise(mp.xz*.43+vec2(11.,29.)));
    if(mask>meridianCourtMask) { meridianCourtMask=mask; meridianLocal=delta; meridianCourtStyle=site.w; }
  }
  float courtRadius=length(meridianLocal);
  float courseWidth=1.2+mod(meridianCourtStyle,3.)*.17;
  float coursePhase=courtRadius/courseWidth;
  float courseEdge=abs(fract(coursePhase+.5)-.5)*courseWidth;
  float courseFootprint=max(.003,fwidth(courtRadius));
  float circleJoint=1.-smoothstep(.009,.024+courseFootprint,courseEdge);
  float segmentCount=8.+mod(meridianCourtStyle,3.)*4.;
  float courseAngle=(atan(meridianLocal.y,meridianLocal.x)/6.2831853+.5)*segmentCount
    +mod(floor(coursePhase),2.)*.5;
  float angleEdge=abs(fract(courseAngle+.5)-.5);
  float radialJoint=(1.-smoothstep(.004,.014+fwidth(courseAngle),angleEdge))*smoothstep(1.8,2.4,courtRadius);
  float dressedJoint=max(circleJoint,radialJoint);
  float stoneIdentity=terrainHash(vec2(floor(coursePhase),floor(courseAngle)+meridianCourtStyle*23.));
  float pavingGray=dot(pavingColor,vec3(.2126,.7152,.0722));
  vec3 dressedStone=vec3(pavingGray)*vec3(1.1,1.03,.88)*mix(.84,1.15,stoneIdentity);
  dressedStone*=1.-dressedJoint*.5;
  pavingColor=mix(pavingColor,dressedStone,meridianCourtMask);
  // The dome centers sit 17 m behind the old court markers, where the legacy
  // paving attribute nearly vanishes. Ground the courses at the actual domes.
  pavingWeight=max(pavingWeight,meridianCourtMask*.86);
  // Exposed horizontal shelves share the cliff surface instead of looking like
  // a pale coating on top of a darker wall. Paving remains on working courts.
  terrainSlope=max(terrainSlope,meridianExposure*.86);
  pavingWeight*=1.-meridianExposure;
  float meridianRelief=(-bedSeam*.021-crossJoint*.014)*meridianExposure*seamSurvival;
  float courtRelief=-dressedJoint*.008*meridianCourtMask;
#endif
`;

export const meridianNormal = /* glsl */ `
#ifdef TERRAIN_MERIDIAN
  earthN=normalize(mix(normal,earthN,.43-meridianDust*.12));
  cliffN=meridianReliefNormal(normalize(mix(normal,cliffN,.66)),meridianRelief);
  pavingN=meridianReliefNormal(pavingN,courtRelief);
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
