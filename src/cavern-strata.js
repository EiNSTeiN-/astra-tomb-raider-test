// Shared world-space limestone bedding for the floor, banks, vault and mineral
// beds. Thin joints fade below a pixel instead of crawling at distant angles.
export const cavernStrata = /* glsl */ `
float karstHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float karstNoise(vec2 p){vec2 c=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(karstHash(c),karstHash(c+vec2(1,0)),f.x),mix(karstHash(c+vec2(0,1)),karstHash(c+vec2(1,1)),f.x),f.y);}
struct KarstSurface {float joint;float calcite;float damp;float relief;float bed;float dust;};
KarstSurface karstSurface(vec3 p,vec3 n){
  KarstSurface s;
  float weather=karstNoise(p.xz*.07+vec2(17.,29.));
  float bed=(p.y+p.x*.035+p.z*.018+weather*1.35)/1.9;
  s.bed=karstHash(vec2(floor(bed),11.));
  float edge=abs(fract(bed+.5)-.5),foot=max(.001,fwidth(bed));
  float seam=(1.-smoothstep(.008,.027+foot,edge))*(1.-smoothstep(.08,.28,foot));
  float crossBed=(p.x*.83-p.z*.56)/(2.4+s.bed*2.7)+s.bed*4.+weather*1.8;
  float crossEdge=abs(fract(crossBed+.5)-.5),crossFoot=max(.002,fwidth(crossBed));
  float fracture=(1.-smoothstep(.006,.03+crossFoot,crossEdge))*(1.-smoothstep(.08,.32,crossFoot));
  float survival=smoothstep(.43,.76,karstNoise(p.xz*.41+vec2(p.y*.13,31.)));
  s.joint=max(seam,fracture*.62)*survival;
  float vein=1.-smoothstep(.035,.115+crossFoot,crossEdge);
  s.calcite=vein*smoothstep(.49,.78,weather)*(1.-s.joint*.8);
  s.dust=smoothstep(.55,.94,n.y)*smoothstep(.16,.82,weather);
  s.damp=smoothstep(.56,.84,karstNoise(p.xz*.12+vec2(p.y*.05,47.)))
    *(1.-s.dust*.75);
  s.relief=-s.joint*.019+s.calcite*.008;
  return s;
}
vec3 karstNormal(vec3 base,float height){
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  return normalize(max(abs(determinant),1.e-8)*base-sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry));
}
vec3 karstColor(vec3 albedo,KarstSurface s){
  float gray=dot(albedo,vec3(.2126,.7152,.0722));
  vec3 stone=mix(albedo,vec3(gray)*vec3(1.04,1.015,.97),.78);
  stone*=mix(.86,1.06,s.bed)*(1.-s.joint*.24)*mix(1.,.71,s.damp);
  stone=mix(stone,vec3(.29,.285,.256),s.calcite*.52);
  return stone;
}
`;
export const cavernTerrainDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
varying float vCavernRock;
${cavernStrata}
#endif
`;
export const cavernTerrainColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  KarstSurface karst=karstSurface(vTerrainPosition,normalize(vTerrainNormal));
  cliffColor=karstColor(cliffColor,karst);
  earthColor=karstColor(earthColor,karst)*mix(.66,.78,karst.dust);
  earthColor=mix(earthColor,vec3(.115,.11,.10),karst.dust*.18);
  terrainSlope=max(terrainSlope,clamp(vCavernRock,0.,1.)*.88);
  pavingWeight*=1.-clamp(vCavernRock,0.,1.);
#endif
`;
export const cavernTerrainNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  earthN=karstNormal(normalize(mix(normal,earthN,.42-karst.dust*.12)),karst.relief*.7);
  cliffN=karstNormal(normalize(mix(normal,cliffN,.68)),karst.relief);
#endif
`;
export const cavernTerrainRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainRough=mix(.94,.7,karst.damp)*(1.-pavingWeight)+terrainRough*pavingWeight;
  rockRough=mix(.91,.59,karst.damp);
#endif
`;
