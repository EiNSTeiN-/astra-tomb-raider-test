import * as THREE from "three";

export const DESERT_PAVING_STYLES = [
  "Processional spine",
  "Paired balance panels",
  "Dawn fan",
  "Aqueduct courses",
  "Broken noon field",
  "Ephemeris rings",
  "Western diagonals",
  "Light-well squares",
  "Relay runners",
  "Sepulchre diamonds",
];

export function desertPavingUniforms(map) {
  const rooms = map?.rooms || [];
  return {
    desertPavingCourts: {
      value: rooms.length
        ? rooms.map(
            (room) =>
              new THREE.Vector3(room.x * 7, room.z * 7, room.index % 10),
          )
        : [new THREE.Vector3(0, 0, -1)],
    },
    desertPavingStrength: { value: 1 },
  };
}

export const desertPavingDeclarations = /* glsl */ `
#ifdef TERRAIN_DESERT
uniform vec3 desertPavingCourts[DESERT_PAVING_COUNT];
uniform float desertPavingStrength;
// Coordinates stay in metres. Derivative filtering softens narrow joints at
// distance, rather than letting one-pixel checker patterns flicker.
vec3 desertPavingPattern(vec2 p, float style) {
  vec2 q=p;
  vec2 size=vec2(1.65,1.05);
  float ornament=0.;
  float sectors=0.;
  if(style<.5) {
    ornament=1.-smoothstep(.1,.2,abs(abs(p.x)-2.7));
  } else if(style<1.5) {
    ornament=1.-smoothstep(.12,.22,abs(abs(p.x)-8.));
    size=vec2(1.45,1.45);
  } else if(style<2.5) {
    vec2 radial=vec2(p.x,p.y+12.);
    float radius=length(radial);
    float angle=radius>1.e-5?atan(radial.x,radial.y):0.;
    size=vec2(1.4,1.25);sectors=48.;
    q=vec2(angle*sectors*size.x/6.28318530718,radius);
    ornament=1.-smoothstep(.12,.25,abs(radius-12.));
  } else if(style<3.5) {
    size=vec2(2.4,.95);
    ornament=1.-smoothstep(.13,.25,abs(mod(p.x+4.,8.)-4.));
  } else if(style<4.5) {
    q=mat2(.96,.28,-.28,.96)*p;size=vec2(1.8,1.3);
    ornament=1.-smoothstep(.2,.45,abs(p.x*.65-p.y*.35));
  } else if(style<5.5) {
    vec2 radial=vec2(p.x,p.y-2.);
    float radius=length(radial);
    float angle=radius>1.e-5?atan(radial.y,radial.x):0.;
    size=vec2(1.4,1.2);sectors=40.;
    q=vec2(angle*sectors*size.x/6.28318530718,radius);
    ornament=1.-smoothstep(.11,.25,abs(mod(q.y+1.5,6.)-3.));
  } else if(style<6.5) {
    q=mat2(.8,.6,-.6,.8)*p;size=vec2(1.85,1.05);
    ornament=1.-smoothstep(.15,.28,abs(mod(q.x+2.25,9.)-4.5));
  } else if(style<7.5) {
    size=vec2(1.35,1.35);
    float square=max(abs(p.x),abs(p.y-2.));
    ornament=1.-smoothstep(.12,.25,abs(mod(square+1.5,6.)-3.));
  } else if(style<8.5) {
    size=vec2(1.2,2.1);
    ornament=1.-smoothstep(.18,.3,abs(mod(p.x+2.,8.)-4.));
  } else {
    q=mat2(.7071,.7071,-.7071,.7071)*p;size=vec2(1.25);
    ornament=1.-smoothstep(.1,.23,abs(max(abs(p.x),abs(p.y-2.))-15.));
  }
  vec2 grid=q/size;
  grid.x+=mod(floor(grid.y),2.)*.5;
  vec2 cell=floor(grid),edge=min(fract(grid),1.-fract(grid))*size;
  if(sectors>0.)cell.x=mod(cell.x,sectors);
  float distance=min(edge.x,edge.y);
  return vec3(distance,ornament,terrainHash(cell+vec2(style*37.,style*17.)));
}
#endif
`;

export const desertPavingColor = /* glsl */ `
#ifdef TERRAIN_DESERT
  vec3 pavingSite=vec3(0.,0.,-1.);
  float pavingNearest=1.e6;
  for(int i=0;i<DESERT_PAVING_COUNT;i++) {
    vec3 site=desertPavingCourts[i];
    vec2 local=vTerrainPosition.xz-site.xy;
    float distance=max(abs(local.x),abs(local.y-1.)*.95);
    if(distance<pavingNearest) { pavingNearest=distance;pavingSite=vec3(local,site.z); }
  }
  vec2 courtPavingUv=pavingSite.xy;
  vec3 courtSlab=desertPavingPattern(courtPavingUv,pavingSite.z);
  float pavingWeather=terrainNoise(vTerrainPosition.xz*.21+vec2(13.,29.));
  float pavingDust=terrainNoise(vTerrainPosition.xz*.071+vec2(53.,17.));
  float pavingField=smoothstep(-.8,2.8,22.-pavingNearest+(pavingWeather-.5)*3.)
    *smoothstep(.92,.985,abs(vTerrainNormal.y))*step(0.,pavingSite.z)*desertPavingStrength;
  float pavingAA=max(.001,fwidth(courtSlab.x));
  float pavingJoint=1.-smoothstep(.015-pavingAA,.045+pavingAA,courtSlab.x);
  float pavingExposure=smoothstep(.28,.62,pavingDust*.7+pavingWeather*.4)
    *smoothstep(.04,.2,courtSlab.z);
  vec3 courtStone=cliffColor*vec3(1.24,1.14,.98)
    *mix(.83,1.18,courtSlab.z);
  courtStone=mix(courtStone,courtStone*vec3(.53,.59,.62),courtSlab.y*.7);
  courtStone=mix(courtStone,earthColor*.62,pavingJoint*.88);
  pavingColor=mix(pavingColor,courtStone,pavingField);
  pavingWeight=mix(pavingWeight,pavingExposure,pavingField);
#endif
`;

export const desertPavingNormal = /* glsl */ `
#ifdef TERRAIN_DESERT
  vec3 courtStoneN=normalize(mix(normal,cliffN,.42));
  courtStoneN=desertReliefNormal(courtStoneN,-pavingJoint*.004);
  pavingN=normalize(mix(pavingN,courtStoneN,pavingField));
#endif
`;

export const desertPavingRoughness = /* glsl */ `
#ifdef TERRAIN_DESERT
  float courtRough=mix(clamp(rockRough,.78,.98),.99,pavingJoint);
  terrainRough=mix(terrainRough,courtRough,pavingField*pavingWeight);
#endif
`;
