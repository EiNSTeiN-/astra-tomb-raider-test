import * as THREE from "three";
import { HYDRAULIC_TRIALS } from "./hydraulic-rules.js";

const PLANS = [
  ["Arrival quay", [2.1, 1.05, 0, 0], [0.91, 0.94, 0.87], 0],
  ["Counterweight exchange", [1.5, 1.5, 0, 1], [0.96, 0.91, 0.81], 1],
  ["Harbor counting house", [1.16, 0.74, 0, 0], [0.84, 0.93, 0.94], 2],
  ["Coral pump workshops", [1.98, 0.66, 0, 2], [0.88, 0.93, 0.86], 3],
  [
    "Tidekeeper return gallery",
    [1.82, 0.88, Math.PI / 2, 0],
    [0.77, 0.91, 0.92],
    4,
  ],
  [
    "Isolated intake court",
    [1.22, 1.22, Math.PI / 4, 1],
    [0.94, 0.91, 0.81],
    5,
  ],
  ["Counterflow crossing", [2.25, 0.75, Math.PI / 4, 2], [0.83, 0.91, 0.85], 6],
  ["Queen's circulation hall", [2.3, 2.3, 0, 1], [0.98, 0.93, 0.83], 7],
  [
    "Pressure reserve cloisters",
    [1.34, 1.02, Math.PI / 2, 0],
    [0.8, 0.9, 0.91],
    8,
  ],
  [
    "Abyssal lock basilica",
    [1.75, 1.75, Math.PI / 4, 1],
    [0.83, 0.88, 0.82],
    9,
  ],
];

export function coastalFloorPlan(index) {
  const p = PLANS[index];
  if (!p) throw new RangeError("Unknown coastal floor " + index);
  return {
    name: p[0],
    tile: [...p[1]],
    stone: [...p[2]],
    motif: p[3],
    // The eastern rear bay is dry and clear of the instruments, cover walls
    // and column feet. Large ceremonial designs fit inside the same bay.
    panel: [12.25, -16.5, index > 6 ? 4.2 : 3.6, index > 6 ? 1.12 : 1],
    capacity: [...(HYDRAULIC_TRIALS[index - 1]?.capacity ?? [8, 5, 3])],
  };
}

export function coastalFloorUniforms(game) {
  const rooms = game.terrainProfile.coastal.rooms,
    plans = rooms.map((r) => coastalFloorPlan(r.index));
  return {
    coastalCourtFrames: {
      value: rooms.map((r) => new THREE.Vector4(r.x, r.z, r.index, r.radius)),
    },
    coastalFloorTiles: {
      value: plans.map((p) => new THREE.Vector4(...p.tile)),
    },
    coastalFloorStone: {
      value: plans.map((p) => new THREE.Vector3(...p.stone)),
    },
    coastalFloorMeasures: {
      value: plans.map((p) => new THREE.Vector3(...p.capacity)),
    },
    coastalFloorPanels: {
      value: plans.map((p) => new THREE.Vector4(...p.panel)),
    },
  };
}

export const coastalFloorDeclarations = /* glsl */ `
uniform vec4 coastalCourtFrames[COASTAL_COURT_COUNT];
uniform vec4 coastalFloorTiles[COASTAL_COURT_COUNT];
uniform vec3 coastalFloorStone[COASTAL_COURT_COUNT];
uniform vec3 coastalFloorMeasures[COASTAL_COURT_COUNT];
uniform vec4 coastalFloorPanels[COASTAL_COURT_COUNT];

float coastalStroke(float d,float width,float aa){
 return 1.0-smoothstep(width-aa,width+aa,abs(d));
}
float coastalRect(vec2 p,vec2 size){
 vec2 q=abs(p)-size;
 return length(max(q,0.0))+min(max(q.x,q.y),0.0);
}
float coastalMotif(vec2 p,float style,vec3 measures,float aa){
 float r=length(p),a=r>.0001?atan(p.y,p.x):0.0,line=0.0;
 if(style<.5){
  line=coastalStroke(p.y-sin(p.x*.95)*.55,.09,aa);
  line=max(line,coastalStroke(p.y+1.1-sin(p.x*.95)*.55,.09,aa));
  line=max(line,coastalStroke(r-2.8,.10,aa));
 }else if(style<1.5){
  line=max(coastalStroke(length(p-vec2(-1.25,-.2))-1.05,.10,aa),coastalStroke(length(p-vec2(1.25,-.2))-1.05,.10,aa));
  line=max(line,coastalStroke(p.y-1.35,.12,aa)*(1.0-smoothstep(2.5,2.7,abs(p.x))));
  line=max(line,coastalStroke(p.x,.09,aa)*(1.0-smoothstep(1.2,1.4,abs(p.y))));
 }else if(style<2.5){
  for(int j=0;j<3;j++){
   float value=j==0?measures.x:(j==1?measures.y:measures.z);
   float h=3.8*value/measures.x;
   vec2 q=p-vec2((float(j)-1.0)*1.5,-1.9+h*.5);
   line=max(line,coastalStroke(coastalRect(q,vec2(.34,h*.5)),.075,aa));
  }
  line=max(line,coastalStroke(p.y+2.25,.09,aa)*(1.0-smoothstep(2.5,2.7,abs(p.x))));
 }else if(style<3.5){
  vec2 q=abs(p);
  line=coastalStroke(max(q.x,q.y)-2.35,.10,aa);
  line=max(line,coastalStroke(max(q.x,q.y)-1.15,.10,aa));
  line=max(line,coastalStroke(p.x,.10,aa)*(1.0-smoothstep(.9,1.2,abs(p.y))));
 }else if(style<4.5){
  line=coastalStroke(p.x-sin(p.y*1.65)*.58-1.0,.10,aa);
  line=max(line,coastalStroke(p.x+sin(p.y*1.65)*.58+1.0,.10,aa));
  line*=1.0-smoothstep(2.8,3.2,abs(p.y));
 }else if(style<5.5){
  line=coastalStroke(abs(p.x)+abs(p.y)-2.7,.11,aa);
  line=max(line,coastalStroke(abs(p.x)+abs(p.y)-1.25,.11,aa));
  line=max(line,coastalStroke(r-.35,.12,aa));
 }else if(style<6.5){
  line=coastalStroke(abs(p.y)-.7*p.x-1.05,.10,aa);
  line=max(line,coastalStroke(abs(p.x)+.7*p.y-1.05,.10,aa));
  line*=1.0-smoothstep(2.5,3.0,max(abs(p.x),abs(p.y)));
 }else if(style<7.5){
  line=coastalStroke(r-(2.9+.72*cos(a*8.0)),.12,aa);
  line=max(line,coastalStroke(r-4.6,.13,aa));
  line=max(line,coastalStroke(r-1.4,.12,aa));
  line=max(line,coastalStroke(r-.4,.12,aa));
 }else if(style<8.5){
  line=max(coastalStroke(r-2.9,.10,aa),coastalStroke(r-2.9*measures.y/measures.x,.10,aa));
  line=max(line,coastalStroke(r-2.9*measures.z/measures.x,.10,aa));
  line=max(line,coastalStroke(p.y,.08,aa)*(1.0-smoothstep(2.8,3.1,abs(p.x))));
 }else{
  float spiral=sin(log(max(.28,r))*7.5-a*2.0);
  line=coastalStroke(spiral,.12,aa*2.5)*(1.0-smoothstep(3.5,3.9,r));
  line=max(line,coastalStroke(r-4.3,.12,aa));
 }
 return line;
}
`;
