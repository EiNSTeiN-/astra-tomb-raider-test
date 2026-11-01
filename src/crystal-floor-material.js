import { Vector4 } from "three";
import { RESONANCE_TRIALS } from "./resonance-rules.js";
import { CRYSTAL_ENCLOSURE_FLOOR_GLSL } from "./crystal-enclosure-plan.js";

const courtUniforms = new WeakMap();

// Terrain and worn paving patches share a single world-space composition.
// The treatment changes shading only; the delivered walking triangles remain.
export function crystalFloorUniforms(map) {
  if (map && courtUniforms.has(map)) return courtUniforms.get(map);
  const uniforms = {
    crystalFloorStrength: { value: 0.97 },
    crystalFloorSites: {
      value: RESONANCE_TRIALS.map((trial, stage) => {
        const feature = map?.features?.find(
          (f) => f.type === "mechanism" && f.stage === stage,
        );
        return new Vector4(
          feature ? feature.x * 7 : 100000,
          feature ? feature.z * 7 : 100000,
          Math.max(11, ...trial.positions.map(([x]) => Math.abs(x) + 5)),
          Math.max(25, ...trial.positions.map(([, z]) => z + 7)),
        );
      }),
    },
  };
  if (map) courtUniforms.set(map, uniforms);
  return uniforms;
}

export const crystalFloorDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
uniform vec4 crystalFloorSites[8];
uniform float crystalFloorStrength;
struct CrystalFloor {
  float coverage; float joint; float inlay; float tone; float relief; float dust; float stage;
};
${CRYSTAL_ENCLOSURE_FLOOR_GLSL}
float archiveBand(float distance,float width,float pixel) {
  float aa=max(.004,pixel);
  return (1.-smoothstep(width-aa*.5,width+aa*.5,abs(distance)))
    *clamp(2.*width/aa,0.,1.);
}
float archiveAngle(vec2 p) {
  return dot(p,p)<1.e-8 ? 0. : atan(p.x,p.y);
}
vec3 archiveReliefNormal(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  return normalize(max(abs(determinant),1.e-8)*base-sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry));
}
CrystalFloor archiveFloor(vec2 world) {
  vec2 p=world; float stage=0.,boundary=100000.;
  for(int i=0;i<8;i++) {
    vec4 site=crystalFloorSites[i]; vec2 q=world-site.xy;
    float width=mix(6.25,site.z,smoothstep(4.5,11.,q.y));
    float edge=min(max(abs(q.x)-width,max(-6.25-q.y,q.y-site.w)),archiveChamberEdge(q,i));
    if(edge<boundary) { boundary=edge; p=q; stage=float(i); }
  }
  float pixel=max(.004,length(fwidth(p)));
  float wear=terrainNoise(p*.32+vec2(stage*13.7,19.));
  float coverage=(1.-smoothstep(-.3,.6,boundary+(wear-.5)*.5))
    *smoothstep(.90,.99,abs(vTerrainNormal.y))*crystalFloorStrength;
  vec2 tileSize=vec2(1.6,2.4),courses=p/tileSize;
  float radius=length(p-vec2(0,9)),angle=archiveAngle(p-vec2(0,9));
  float radial=0.;
  if(stage>.5 && stage<1.5) {
    courses=vec2(angle*12./6.2831853,radius/2.);
    radial=1.;
  } else if(stage>1.5 && stage<2.5) {
    tileSize=vec2(1.8,2.2);courses=vec2(abs(p.x),p.y)/tileSize;
  } else if(stage>2.5 && stage<3.5) {
    tileSize=vec2(1.7,2.4);courses=mat2(.91,.414,-.414,.91)*p/tileSize;
  } else if(stage>3.5 && stage<4.5) {
    tileSize=vec2(1.9);courses=mat2(.707,.707,-.707,.707)*p/tileSize;
  } else if(stage>5.5 && stage<6.5) {
    tileSize=vec2(1.8,2.4);courses=vec2(abs(p.x),p.y-3.)/tileSize;
  } else if(stage>6.5) {
    vec2 q=p-vec2(0,15);radius=length(q);angle=archiveAngle(q);
    courses=vec2(angle*16./6.2831853,radius/1.8);radial=2.;
  }
  float row=floor(courses.y);
  courses.x+=mod(row,2.)*.5;
  vec2 cell=floor(courses),f=fract(courses);
  if(radial>.5) cell.x=mod(cell.x+(radial<1.5?12.:16.),radial<1.5?12.:16.);
  vec2 seam=min(f,1.-f)*tileSize;
  float distance=min(seam.x,seam.y);
  if(radial>.5) {
    float divisions=radial<1.5?12.:16.;
    float spoke=abs(sin(angle*divisions*.5+mod(row,2.)*1.5707963))*radius/(divisions*.5);
    float ring=min(f.y,1.-f.y)*(radial<1.5?2.:1.8);
    distance=min(spoke,ring);
  }
  float chips=(terrainNoise(p*2.4+vec2(stage,31.))-.5)*.035;
  float joint=archiveBand(distance-chips,.035,pixel);
  float tile=terrainHash(cell+vec2(stage*31.7,stage*11.3));
  float inlay=archiveBand(boundary+.85,.22,pixel);
  if(stage<.5) {
    // Three guide lights: receiving lanes and a transverse threshold course.
    float rails=archiveBand(abs(p.x)-4.,.18,pixel);
    float threshold=archiveBand(p.y-9.2,.2,pixel)*(1.-smoothstep(4.2,4.6,abs(p.x)));
    inlay=max(inlay,max(rails,threshold));
  } else if(stage<1.5) {
    // A descending echo unfolds as concentric listening rings.
    inlay=max(inlay,max(archiveBand(radius-4.5,.2,pixel),archiveBand(radius-9.,.28,pixel)));
  } else if(stage<2.5) {
    // Two opposed banks frame a deliberately clear central aisle.
    float banks=archiveBand(abs(p.x)-4.5,.23,pixel);
    float ties=archiveBand(mod(p.y+1.,7.)-3.5,.13,pixel)*smoothstep(4.2,4.7,abs(p.x));
    inlay=max(inlay,max(banks,ties));
  } else if(stage<3.5) {
    float steps=mod(p.y-p.x*.45+2.5,5.)-2.5;
    inlay=max(inlay,archiveBand(steps,.18,pixel));
  } else if(stage<4.5) {
    float fan=min(abs(p.x*.8-(p.y-6.)*.5),abs(p.x*.8+(p.y-6.)*.5));
    inlay=max(inlay,archiveBand(fan,.22,pixel)*smoothstep(5.5,7.,p.y));
    inlay=max(inlay,archiveBand(length(p-vec2(0,6))-3.,.16,pixel));
  } else if(stage<5.5) {
    float fracture=(f.x-(.3+f.y*.3+(wear-.5)*.13))*tileSize.x;
    float broken=smoothstep(.62,.87,tile);
    float fissure=archiveBand(fracture,.07,pixel)*broken;
    coverage*=1.-fissure*.72;
    joint=max(joint,fissure);
    inlay=max(inlay,archiveBand(abs(p.x)-6.,.18,pixel)*(1.-broken*.7));
  } else if(stage<6.5) {
    float rings=min(abs(length(p-vec2(-3,13))-5.),abs(length(p-vec2(3,13))-5.));
    inlay=max(inlay,archiveBand(rings,.24,pixel));
  } else {
    vec2 q=abs(p-vec2(0,15));
    float octagon=max(max(q.x,q.y),(q.x+q.y)*.70710678);
    float spokes=min(min(q.x,q.y),abs(q.x-q.y)*.70710678);
    inlay=max(inlay,max(archiveBand(octagon-7.,.3,pixel),archiveBand(octagon-3.3,.16,pixel)));
    inlay=max(inlay,archiveBand(spokes,.15,pixel)*(1.-smoothstep(6.5,7.,octagon)));
  }
  CrystalFloor result;
  result.coverage=clamp(coverage,0.,1.);
  result.joint=joint;
  result.inlay=inlay*(.5+.5*smoothstep(.22,.65,wear))*(1.-joint*.65);
  result.tone=.72+tile*.42+(wear-.5)*.08;
  result.dust=smoothstep(.48,.83,terrainNoise(p*.16+vec2(27.,stage*7.)));
  result.relief=(.004*(1.-joint)-.014*joint-.004*result.inlay)*result.coverage;
  result.stage=stage;
  return result;
}
vec3 archiveStoneColor(vec3 paving,CrystalFloor floor) {
  float gray=dot(paving,vec3(.2126,.7152,.0722));
  vec3 tint=vec3(1.16,1.09,.94);
  if(floor.stage>.5 && floor.stage<1.5) tint=vec3(.96,1.05,1.12);
  else if(floor.stage>3.5 && floor.stage<4.5) tint=vec3(1.08,1.01,1.13);
  else if(floor.stage>5.5 && floor.stage<6.5) tint=vec3(1.12,1.02,.99);
  else if(floor.stage>6.5) tint=vec3(.96,1.09,1.08);
  vec3 stone=mix(paving,vec3(gray)*tint,.75)*floor.tone;
  stone=mix(stone,stone*.34,floor.joint*.82);
  vec3 inlay=mix(vec3(.055,.078,.086),vec3(.14,.108,.055),step(2.5,floor.stage)*.6);
  stone=mix(stone,inlay,floor.inlay*.88);
  return mix(stone,vec3(.115,.10,.079),floor.dust*.16*(1.-floor.inlay));
}
#endif
`;

export const crystalFloorColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  CrystalFloor archive=archiveFloor(vTerrainPosition.xz);
  terrainAlbedo=mix(terrainAlbedo,archiveStoneColor(pavingColor,archive),archive.coverage);
#endif
`;
export const crystalFloorRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainRough=mix(terrainRough,.85+archive.joint*.12-archive.inlay*.2+archive.dust*.03,archive.coverage);
#endif
`;
export const crystalFloorNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  vec3 archiveN=archiveReliefNormal(normalize(mix(pavingN,normal,.35)),archive.relief);
  terrainN=normalize(mix(terrainN,archiveN,archive.coverage));
#endif
`;
