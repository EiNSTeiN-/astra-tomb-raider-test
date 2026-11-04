import * as THREE from "three";

export const MONASTERY_PAVING_STYLES = [
  "Pilgrim causeway",
  "Echo rings",
  "Prayer-stone panels",
  "Stair landings",
  "Memorial diamonds",
  "Windward courses",
  "Summit runners",
  "Archive squares",
  "Observatory compass",
];

export function monasteryPavingUniforms(map) {
  const rooms = map?.rooms || [];
  return {
    monasteryPavingCourts: {
      value: rooms.length
        ? rooms.map(
            (room) => new THREE.Vector3(room.x * 7, room.z * 7, room.index % 9),
          )
        : [new THREE.Vector3(0, 0, -1)],
    },
    monasteryPavingStrength: { value: 1 },
  };
}

export const monasteryPavingDeclarations = /* glsl */ `
#ifdef TERRAIN_SNOW
uniform vec3 monasteryPavingCourts[MONASTERY_PAVING_COUNT];
uniform float monasteryPavingStrength;

// Metre-scale slate courses and restrained inset bands. The radial grids have
// integral sector counts, so stone identities close across atan's branch cut.
vec3 monasterySlab(vec2 p,float style) {
  vec2 q=p,size=vec2(1.35,2.1);
  float band=0.,sectors=0.;
  if(style<.5) {
    band=1.-smoothstep(.12,.24,abs(abs(p.x)-3.2));
  } else if(style<1.5) {
    vec2 r=p-vec2(0.,5.);float radius=length(r);
    float angle=radius>1.e-5?atan(r.y,r.x):0.;
    size=vec2(1.2,1.35);sectors=48.;
    q=vec2(angle*sectors*size.x/6.28318530718,radius);
    band=1.-smoothstep(.12,.24,abs(mod(radius+2.,8.)-4.));
  } else if(style<2.5) {
    size=vec2(1.75,.85);
    band=1.-smoothstep(.12,.25,abs(abs(p.x)-7.));
  } else if(style<3.5) {
    size=vec2(2.8,.9);
    band=1.-smoothstep(.14,.27,abs(mod(p.y+2.,8.)-4.));
  } else if(style<4.5) {
    q=mat2(.70710678,.70710678,-.70710678,.70710678)*p;
    size=vec2(1.25);
    band=1.-smoothstep(.12,.25,abs(max(abs(p.x),abs(p.y-5.))-10.));
  } else if(style<5.5) {
    q=mat2(.96,.28,-.28,.96)*p;size=vec2(2.3,1.05);
    band=1.-smoothstep(.13,.26,abs(mod(q.x+1.5,6.)-3.));
  } else if(style<6.5) {
    size=vec2(1.05,2.6);
    band=1.-smoothstep(.12,.24,abs(abs(p.x)-5.2));
  } else if(style<7.5) {
    size=vec2(1.55);
    band=1.-smoothstep(.12,.25,abs(mod(max(abs(p.x),abs(p.y-4.))+1.5,6.)-3.));
  } else {
    vec2 r=p-vec2(0.,5.);float radius=length(r);
    float angle=radius>1.e-5?atan(r.y,r.x):0.;
    size=vec2(1.2,1.65);sectors=32.;
    q=vec2(angle*sectors*size.x/6.28318530718,radius);
    band=max(1.-smoothstep(.12,.25,abs(radius-12.)),
      (1.-smoothstep(.12,.25,min(abs(r.x),abs(r.y))))*step(3.,radius));
  }
  vec2 grid=q/size;
  grid.x+=mod(floor(grid.y),2.)*.5;
  vec2 cell=floor(grid),edge=min(fract(grid),1.-fract(grid))*size;
  if(sectors>0.)cell.x=mod(cell.x,sectors);
  return vec3(min(edge.x,edge.y),band,terrainHash(cell+vec2(style*29.,style*41.)));
}

float monasteryWear(vec2 p,float style) {
  float lane=abs(p.x);
  if(style> .5&&style<1.5)lane=min(abs(abs(p.x)-5.),abs(length(p-vec2(0.,5.))-8.));
  else if(style>1.5&&style<2.5)lane=min(abs(abs(p.x)-7.),abs(p.y-5.));
  else if(style>3.5&&style<4.5)lane=abs(length(p-vec2(0.,5.))-8.);
  else if(style>4.5&&style<5.5)lane=abs(p.x*.96-p.y*.28);
  else if(style>5.5&&style<6.5)lane=abs(abs(p.x)-5.2);
  else if(style>6.5&&style<7.5)lane=min(abs(p.x),abs(p.y-4.));
  else if(style>7.5)lane=min(abs(p.x),abs(p.y-5.));
  // A worn crosswalk beneath the bell links the two lodge doors.
  lane=min(lane,abs(p.y+10.)+max(0.,abs(p.x)-14.));
  return 1.-smoothstep(1.1,4.5,lane);
}
#endif
`;

export const monasteryPavingColor = /* glsl */ `
#ifdef TERRAIN_SNOW
  vec3 monasterySite=vec3(0.,0.,-1.);float monasteryDistance=1.e6;
  for(int i=0;i<MONASTERY_PAVING_COUNT;i++) {
    vec3 site=monasteryPavingCourts[i];vec2 p=sp.xz-site.xy;
    float d=max(abs(p.x)-17.,abs(p.y-5.)-23.);
    if(d<monasteryDistance){monasteryDistance=d;monasterySite=vec3(p,site.z);}
  }
  vec3 monasteryStone=monasterySlab(monasterySite.xy,monasterySite.z);
  float monasteryWeather=terrainNoise(sp.xz*.19+vec2(23.,51.));
  float monasteryDrift=terrainNoise(sp.xz*.057+vec2(61.,13.));
  float monasteryField=(1.-smoothstep(-1.5,2.8,monasteryDistance+(monasteryWeather-.5)*2.2))
    *smoothstep(.93,.99,normalize(vTerrainNormal).y)*(1.-snowExposure)
    *step(0.,monasterySite.z)*monasteryPavingStrength;
  float monasteryEdge=monasteryStone.x+(terrainNoise(sp.xz*3.7)-.5)*.035;
  float monasteryAA=max(.001,fwidth(monasteryEdge));
  float monasteryJoint=1.-smoothstep(.012-monasteryAA,.035+monasteryAA,monasteryEdge);
  float monasteryTraffic=monasteryWear(monasterySite.xy,monasterySite.z);
  // Snow survives in sheltered patches and between slabs, rather than forming
  // an opaque uniform sheet. The well-travelled lanes expose more stone.
  float monasteryBare=smoothstep(.26,.64,monasteryTraffic*.62
    +monasteryWeather*.35+(1.-monasteryDrift)*.31);
  monasteryBare*=mix(.24,1.,smoothstep(.02,.2,monasteryStone.z));
  monasteryBare*=1.-monasteryJoint*mix(.08,.4,monasteryDrift);
  vec3 monasterySlate=mix(vec3(.10,.115,.12),vec3(.21,.215,.21),monasteryStone.z);
  float monasteryGrain=dot(texture2D(cliffMap,sp.xz/2.2).rgb,vec3(.2126,.7152,.0722));
  monasterySlate*=mix(.55,1.5,smoothstep(.035,.45,monasteryGrain));
  monasterySlate=mix(monasterySlate,monasterySlate*vec3(1.28,.94,.68),monasteryStone.y*.7);
  monasterySlate=mix(monasterySlate,vec3(.025,.03,.034),monasteryJoint*.7);
  pavingColor=mix(pavingColor,monasterySlate,monasteryField);
  pavingWeight=mix(pavingWeight,monasteryBare,monasteryField);
#endif
`;

export const monasteryPavingNormal = /* glsl */ `
#ifdef TERRAIN_SNOW
  vec3 monasteryN=normalize(mix(normal,cliffN,.42));
  monasteryN=snowReliefNormal(monasteryN,-monasteryJoint*.005);
  if(monasteryField>0.)pavingN=normalize(mix(pavingN,monasteryN,monasteryField));
#endif
`;

export const monasteryPavingRoughness = /* glsl */ `
#ifdef TERRAIN_SNOW
  terrainRough=mix(terrainRough,mix(.9,.98,monasteryJoint),monasteryField*pavingWeight);
#endif
`;
