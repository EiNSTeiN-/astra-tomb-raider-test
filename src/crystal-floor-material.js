import { CRYSTAL_ENCLOSURE_FLOOR_GLSL } from "./crystal-enclosure-plan.js";

import { Vector4 } from "three";
import { RESONANCE_TRIALS } from "./resonance-rules.js";

// The floor belongs to the chamber and its instrument forecourt. It shades
// the delivered ground, without a second surface or a changed walking height.
export function crystalFloorUniforms(map) {
  return {
    crystalFloorStrength: { value: 0.95 },
    crystalFloorSites: {
      value: RESONANCE_TRIALS.map((trial, stage) => {
        const feature = map?.features?.find(
          (f) => f.type === "mechanism" && f.stage === stage,
        );
        return new Vector4(
          feature ? feature.x * 7 : 100000,
          feature ? feature.z * 7 : 100000,
          Math.max(8.5, ...trial.positions.map(([x]) => Math.abs(x) + 3.2)),
          Math.max(20, ...trial.positions.map(([, z]) => z + 4)),
        );
      }),
    },
  };
}

export const crystalFloorDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
uniform vec4 crystalFloorSites[8];
uniform float crystalFloorStrength;
struct CrystalFloor { float coverage; float joint; float inlay; float tone; float relief; };
${CRYSTAL_ENCLOSURE_FLOOR_GLSL}
float archiveLine(float distance) {
  float aa=clamp(fwidth(distance),.006,.12);
  return 1.0-smoothstep(.035,.075+aa,abs(distance));
}
CrystalFloor archiveFloor(vec2 world) {
  vec2 p=world; float stage=0.0, boundary=100000.0;
  for(int i=0;i<8;i++) {
    vec4 site=crystalFloorSites[i]; vec2 q=world-site.xy;
    float width=mix(6.25,site.z,smoothstep(4.5,10.5,q.y));
    float edge=min(max(abs(q.x)-width,max(-6.25-q.y,q.y-site.w)),archiveChamberEdge(q,i));
    if(edge<boundary) { boundary=edge; p=q; stage=float(i); }
  }
  float wear=terrainNoise(p*.43+stage*13.7);
  float coverage=(1.0-smoothstep(-.15,.4,boundary+(wear-.5)*.24))
    *smoothstep(.66,.92,abs(vTerrainNormal.y))*crystalFloorStrength;
  vec2 courses=p/vec2(1.6,2.4);
  float radius=length(p-vec2(0,7));
  if(stage>.5 && stage<1.5) {
    vec2 radial=p-vec2(0,7);
    courses=vec2(atan(radial.x+1e-5,radial.y+1e-5)*12.0/6.2831853,radius/2.0);
  } else if(stage>1.5 && stage<2.5) {
    courses=vec2(abs(p.x)/1.8,p.y/2.2);
  } else if(stage>2.5 && stage<3.5) {
    courses=mat2(.91,.414,-.414,.91)*p/vec2(1.7,2.4);
  } else if(stage>3.5 && stage<4.5) {
    courses=mat2(.707,.707,-.707,.707)*p/1.9;
  } else if(stage>5.5 && stage<6.5) {
    courses=vec2(abs(p.x)/1.8,(p.y-3.0)/2.4);
  } else if(stage>6.5) {
    vec2 radial=p-vec2(0,15);
    courses=vec2(atan(radial.x+1e-5,radial.y+1e-5)*16.0/6.2831853,length(radial)/1.8);
  }
  courses.x+=mod(floor(courses.y),2.0)*.5;
  vec2 cell=floor(courses), f=fract(courses);
  float edge=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y));
  float aa=clamp(length(fwidth(courses)),.005,.08);
  float joint=1.0-smoothstep(.012,.027+aa,edge);
  float tile=terrainHash(cell+vec2(stage*31.7,stage*11.3));
  float inlay=archiveLine(boundary+.65);
  if(stage<.5) inlay=max(inlay,archiveLine(abs(p.x)-2.1));
  else if(stage<1.5) inlay=max(inlay,archiveLine(mod(radius+1.0,4.0)-2.0));
  else if(stage<2.5) inlay=max(inlay,archiveLine(abs(p.x)-4.4));
  else if(stage<3.5) inlay=max(inlay,archiveLine(mod(p.y-p.x*.45+2.0,5.0)-2.5));
  else if(stage<4.5) {
    float fan=min(abs(p.x*.8-(p.y-6.0)*.5),abs(p.x*.8+(p.y-6.0)*.5));
    inlay=max(inlay,archiveLine(fan)*smoothstep(5.5,7.0,p.y));
  } else if(stage<5.5) {
    float fracture=f.x-(.3+f.y*.3+(wear-.5)*.13);
    float broken=smoothstep(.55,.85,tile);
    coverage*=1.0-(1.0-smoothstep(.07,.24,abs(fracture)))*broken*.3;
    joint=max(joint,archiveLine(fracture)*broken*.7);
  } else if(stage<6.5) {
    float rings=min(abs(length(p-vec2(-3,13))-4.0),abs(length(p-vec2(3,13))-4.0));
    inlay=max(inlay,archiveLine(rings));
  } else {
    vec2 q=abs(p-vec2(0,15));
    float octagon=max(max(q.x,q.y),(q.x+q.y)*.707);
    float spokes=min(min(q.x,q.y),abs(q.x-q.y)*.707);
    inlay=max(inlay,max(archiveLine(octagon-5.5),archiveLine(spokes)*(1.0-smoothstep(4.8,5.3,octagon))));
  }
  CrystalFloor result;
  result.coverage=clamp(coverage,0.0,1.0);
  result.joint=joint; result.inlay=inlay*(1.0-joint*.7);
  result.tone=.76+tile*.3+(wear-.5)*.1;
  result.relief=(.012*(1.0-joint)-.008*result.inlay)*result.coverage;
  return result;
}
#endif
`;

export const crystalFloorColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  CrystalFloor archive=archiveFloor(vTerrainPosition.xz);
  vec3 archiveStone=pavingColor*vec3(1.02,.98,.87)*archive.tone;
  archiveStone=mix(archiveStone,earthColor*.32,archive.joint*.8);
  archiveStone=mix(archiveStone,pavingColor*vec3(.3,.37,.4),archive.inlay*.82);
  terrainAlbedo=mix(terrainAlbedo,archiveStone,archive.coverage);
#endif
`;

export const crystalFloorRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainRough=mix(terrainRough,.84+archive.joint*.11-archive.inlay*.09,archive.coverage);
#endif
`;

export const crystalFloorNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainN=normalize(mix(terrainN,karstNormal(pavingN,archive.relief),archive.coverage));
#endif
`;
