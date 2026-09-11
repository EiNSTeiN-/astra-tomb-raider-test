// Snow gathers on the broad shoulders; tilted rock beds and short fractures
// remain visible on steeper cuts. Derivative filtering suppresses distant seams.
export const snowDeclarations = /* glsl */ `
#ifdef TERRAIN_SNOW
varying float vSnowRock;
vec3 snowReliefNormal(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
#endif
`;
export const snowColor = /* glsl */ `
#ifdef TERRAIN_SNOW
  vec3 sp=vTerrainPosition;
  float snowWeather=terrainNoise(sp.xz*.071+vec2(37.,19.));
  float snowBroken=terrainNoise(sp.xz*.39+vec2(sp.y*.17,13.));
  float snowBed=(sp.y+sp.x*.07-sp.z*.035)/2.1+snowWeather*.24;
  float snowIdentity=terrainHash(vec2(floor(snowBed),31.));
  float snowEdge=abs(fract(snowBed+.5)-.5);
  float snowFootprint=max(.003,fwidth(snowBed));
  float snowSeam=(1.-smoothstep(.01,.035+snowFootprint,snowEdge))
    *(1.-smoothstep(.1,.35,snowFootprint));
  float snowJointPhase=(sp.x*.73+sp.z*.68)/(1.8+snowIdentity*2.4)+snowIdentity*3.;
  float snowJointFootprint=max(.004,fwidth(snowJointPhase));
  float snowJoint=(1.-smoothstep(.007,.028+snowJointFootprint,abs(fract(snowJointPhase+.5)-.5)))
    *(1.-smoothstep(.1,.4,snowJointFootprint));
  float snowFracture=max(snowSeam,snowJoint*.65)*smoothstep(.22,.7,snowBroken);
  float snowDeposited=smoothstep(.67,.96,normalize(vTerrainNormal).y+(snowWeather-.5)*.18);
  float snowExposure=clamp(vSnowRock,0.,1.);
  terrainSlope=smoothstep(.1,.72,max(terrainSlope,snowExposure*(1.-snowDeposited)));
  pavingWeight*=1.-snowExposure;
  float snowRockGray=dot(cliffColor,vec3(.2126,.7152,.0722));
  cliffColor=mix(cliffColor,vec3(snowRockGray)*vec3(.79,.86,.96),.88)
    *(.32+.1*snowIdentity)*(1.-snowFracture*.32);
  earthColor*=vec3(.88,.94,1.)*(.92+.08*snowWeather);
  float snowRelief=(-snowSeam*.027-snowJoint*.015)*smoothstep(.22,.7,snowBroken);
#endif
`;
export const snowNormal = /* glsl */ `
#ifdef TERRAIN_SNOW
  earthN=normalize(mix(normal,earthN,.27));
  cliffN=snowReliefNormal(normalize(mix(normal,cliffN,.65)),snowRelief);
#endif
`;
export const snowRoughness = /* glsl */ `
#ifdef TERRAIN_SNOW
  terrainRough=mix(terrainRough,.97,1.-pavingWeight);
  rockRough=mix(.86,.97,snowFracture);
#endif
`;

// Scan materials are cloned so other chapters retain their authored surfaces.
// Existing map references remain owned by the loaded asset.
export function snowBoulderMaterial(source) {
  const material = source.clone();
  material.name = "Snow-dusted alpine boulder";
  material.color.set(0xffffff);
  material.roughness = 1;
  material.normalScale.multiplyScalar(0.55);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      float upward=inverseTransformDirection(nonPerturbedNormal,viewMatrix).y;
      float deposited=smoothstep(.48,.87,upward);
      float gray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(vec3(gray)*vec3(.38,.43,.5),vec3(.73,.82,.91),deposited);
      normal=normalize(mix(normal,nonPerturbedNormal,deposited*.65));`,
    );
  };
  material.customProgramCacheKey = () => "vesper-alpine-boulder-1";
  return material;
}
