import * as THREE from "three";
import {
  coastalFloorUniforms,
  coastalFloorDeclarations,
} from "./coastal-floor-plan.js";

export const coastalDeclarations = /* glsl */ `
#ifdef TERRAIN_COASTAL
varying vec3 vCoastal;
uniform vec4 coastalBasins[COASTAL_BASIN_COUNT];
uniform float coastalWaterHeight[COASTAL_BASIN_COUNT];
uniform sampler2D coastalSlabMap, coastalSlabNormal, coastalSlabRoughness;
${coastalFloorDeclarations}

vec3 coastalStone(vec2 p,vec4 profile) {
  vec2 size=profile.xy,uv=p/size;
  if(profile.w<.5)uv.x+=mod(floor(uv.y),2.0)*.5;
  vec2 cell=floor(uv),f=fract(uv);
  if(profile.w>1.5){
    vec2 block=floor(p/size.x),q=fract(p/size.x);
    if(mod(block.x+block.y,2.0)<1.0)q=q.yx;
    uv=q*vec2(3.0,1.0);cell=block*3.0+floor(uv);f=fract(uv);size=vec2(size.x/3.0,size.x);
  }
  vec2 edge=min(f,1.0-f)*size;
  float d=min(edge.x,edge.y),worn=terrainNoise(p*7.0)*.008;
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  float pixelWidth=max(.003,footprint*.45),farStone=smoothstep(.2,.65,footprint);
  float joint=mix(1.0-smoothstep(.019-pixelWidth,.019+pixelWidth,d-worn),.064,farStone);
  return vec3(joint,mix(smoothstep(.014,.058,d-worn),1.0,farStone),terrainHash(cell));
}

float coastalTessera(vec2 p) {
  vec2 f=fract(p/.095);
  float edge=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y));
  float aa=max(.01, fwidth(edge));
  float coverage=smoothstep(.045-aa,.075+aa,edge);
  float footprint=max(length(dFdx(p)),length(dFdy(p)))/.095;
  return mix(coverage,.85,smoothstep(.8,2.0,footprint));
}
#endif
`;

export const coastalCliffCoordinates = /* glsl */ `
#ifdef TERRAIN_COASTAL
  cliffUvX=vTerrainPosition.zy/3.2;
  cliffUvY=vTerrainPosition.xz/3.2;
  cliffUvZ=vTerrainPosition.xy/3.2;
#endif
`;

export const coastalColor = /* glsl */ `
#ifdef TERRAIN_COASTAL
  // Fragment world coordinates keep room identity stable at terrain seams.
  vec4 floorFrame=coastalCourtFrames[0],tileProfile=coastalFloorTiles[0];
  vec3 stoneTint=coastalFloorStone[0],floorMeasures=coastalFloorMeasures[0];
  vec4 panelProfile=coastalFloorPanels[0];
  float closestCourt=1.0e12;
  for(int i=0;i<COASTAL_COURT_COUNT;i++){
    vec2 delta=vTerrainPosition.xz-coastalCourtFrames[i].xy;
    float distanceSquared=dot(delta,delta);
    if(distanceSquared<closestCourt){
      closestCourt=distanceSquared;floorFrame=coastalCourtFrames[i];
      tileProfile=coastalFloorTiles[i];stoneTint=coastalFloorStone[i];floorMeasures=coastalFloorMeasures[i];
      panelProfile=coastalFloorPanels[i];
    }
  }
  vec2 cp=vTerrainPosition.xz-floorFrame.xy;
  float courtIndex=floorFrame.z;
  float floorBlend=1.0-smoothstep(22.0,26.0,max(abs(cp.x),abs(cp.y)));
  mat2 floorTurn=mat2(cos(tileProfile.z),sin(tileProfile.z),-sin(tileProfile.z),cos(tileProfile.z));
  vec2 floorPoint=floorTurn*cp;
  vec3 baseSlab=coastalStone(vTerrainPosition.xz,vec4(1.45,.96,0,0));
  vec3 courtSlab=coastalStone(floorPoint,tileProfile);
  vec3 slab=mix(baseSlab,courtSlab,floorBlend);
  vec2 baseStoneUv=vTerrainPosition.xz/2.7,floorStoneUv=floorPoint/2.7;
  float breakage=terrainNoise(vTerrainPosition.xz*.19+vec2(8,31));
  float floorEdge=min(20.0-abs(cp.x),21.0-abs(cp.y));
  float edgeWear=1.0-smoothstep(1.0,5.0,floorEdge);
  float burial=smoothstep(.61,.85,breakage)*(.18+edgeWear*.45);
  pavingWeight=smoothstep(.05,.8,vCourt-burial);
  vec3 limestone=mix(texture2D(coastalSlabMap,baseStoneUv).rgb,
    texture2D(coastalSlabMap,floorStoneUv).rgb,floorBlend);
  vec3 slabColor=limestone*(.55+.22*slab.z)*mix(1.0,.32,slab.x);
  slabColor*=mix(vec3(.89,.95,.92),stoneTint,floorBlend);
  float aa=max(.012,(fwidth(cp.x)+fwidth(cp.y))*.55);
  float border=(1.0-smoothstep(.6,.85,abs(floorEdge-1.0)))*smoothstep(-.2,.4,floorEdge);
  float along=abs(cp.x)>abs(cp.y)?cp.y:cp.x;
  float braidA=abs((floorEdge-1.0)-sin(along*1.7+courtIndex)*.36);
  float braidB=abs((floorEdge-1.0)+sin(along*1.7+courtIndex)*.36);
  float braid=1.0-smoothstep(.08,.15,min(braidA,braidB));
  vec2 panelPoint=cp-panelProfile.xy;
  float panelRadius=panelProfile.z;
  float panel=1.0-smoothstep(panelRadius,panelRadius+.16,length(panelPoint));
  if(courtIndex>1.5&&courtIndex<3.5)panel=1.0-smoothstep(-.1,.12,coastalRect(panelPoint,vec2(3.0,3.05)));
  float motif=coastalMotif(panelPoint*panelProfile.w,courtIndex,floorMeasures,aa*panelProfile.w);
  float pattern=mix(braid,motif,panel);
  vec3 accent=mix(vec3(.46,.47,.37),vec3(.57,.47,.32),mod(courtIndex,3.0)<1.5?.38:0.0);
  vec3 mosaic=mix(vec3(.055,.16,.17),accent,pattern);
  mosaic*=.8+.35*terrainHash(floor(vTerrainPosition.xz/.095));
  mosaic*=mix(.42,1.0,coastalTessera(vTerrainPosition.xz));
  float ornament=max(border,panel)*floorBlend;
  float erosion=1.0-smoothstep(.58,.8,breakage+terrainNoise(vTerrainPosition.xz*1.6)*.1);
  ornament*=mix(erosion,.72+.28*erosion,panel);
  pavingColor=mix(slabColor,mosaic,ornament);
  earthColor*=vec3(.53,.58,.52);
  // Paving belongs to the level courts. Exposed banks use their own rock maps
  // and world-space projection before the horizontal tiles visibly stretch.
  terrainSlope=1.0-smoothstep(.72,.96,abs(normalize(vTerrainNormal).y));
  float bankVariation=terrainNoise(vTerrainPosition.xz*.19
    +vec2(vTerrainPosition.y*.071,vTerrainPosition.y*.13));
  cliffColor*=mix(.86,1.12,bankVariation);
  // Recent water height controls darkening; old salt remains after drainage.
  float tidalWet=1.0-smoothstep(-2.4,-1.65,vTerrainPosition.y);
  for(int i=0;i<COASTAL_BASIN_COUNT;i++) {
    vec4 basin=coastalBasins[i];
    vec2 q=abs(vTerrainPosition.xz-basin.xy)-basin.zw;
    float bank=1.0-smoothstep(.05,1.8,max(q.x,q.y));
    float wet=1.0-smoothstep(coastalWaterHeight[i]-.12,
      coastalWaterHeight[i]+.52,vTerrainPosition.y);
    tidalWet=max(tidalWet,bank*wet);
  }
  terrainDamp=tidalWet*(.65+.35*terrainNoise(vTerrainPosition.xz*2.4));
  growthWeight=terrainDamp*smoothstep(.44,.75,breakage)*.32;
  pavingColor=mix(pavingColor,vec3(.045,.09,.055),growthWeight);
  earthColor*=mix(1.0,.55,terrainDamp);
#endif
`;

export const coastalAlbedo = /* glsl */ `
#ifdef TERRAIN_COASTAL
  terrainAlbedo*=mix(1.0,.57,terrainDamp);
  float oldTide=exp(-pow((vTerrainPosition.y+1.0+terrainMacro*.5)*2.5,2.0));
  terrainAlbedo=mix(terrainAlbedo,vec3(.32,.35,.29),oldTide*.2);
#endif
`;

export const coastalNormal = /* glsl */ `
#ifdef TERRAIN_COASTAL
  // Geometric tile bevels in the normal response, with no collision displacement.
  float slabHeight=slab.y*.014;
  vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
  vec3 r1=cross(q1,normal),r2=cross(normal,q0);
  float determinant=dot(q0,r1);
  vec3 gradient=sign(determinant)*(dFdx(slabHeight)*r1+dFdy(slabHeight)*r2);
  vec3 bevelN=normalize(max(.000001,abs(determinant))*normal-gradient);
  vec3 slabN=normalize(mix(terrainSurfaceNormal(texture2D(coastalSlabNormal,baseStoneUv).xyz,baseStoneUv,normal,.4),
    terrainSurfaceNormal(texture2D(coastalSlabNormal,floorStoneUv).xyz,floorStoneUv,normal,.4),floorBlend));
  pavingN=normalize(mix(slabN,pavingN,ornament));
  pavingN=normalize(mix(pavingN,bevelN,.6*(1.0-ornament)));
  earthN=normalize(mix(normal,earthN,.3));
#endif
`;

export function coastalUniforms(game) {
  return {
    ...coastalFloorUniforms(game),
    coastalBasins: {
      value: game.terrainProfile.waters.map(
        (w) => new THREE.Vector4(w.x, w.z, w.width / 2, w.length / 2),
      ),
    },
    coastalWaterHeight: {
      value: new Float32Array(game.terrainProfile.waters.map((w) => w.baseY)),
    },
  };
}

export function updateCoastalWater(game) {
  const heights =
    game.terrainMeshes?.[0]?.material.userData.terrainUniforms
      ?.coastalWaterHeight?.value;
  if (!heights) return;
  game.terrainProfile.waters.forEach((site, i) => {
    const covering = game.waterMeshes.find(
      (w) =>
        !w.userData.sea &&
        Math.abs(w.position.x - site.x) + site.width / 2 <=
          w.userData.width / 2 + 0.01 &&
        Math.abs(w.position.z - site.z) + site.length / 2 <=
          w.userData.length / 2 + 0.01,
    );
    heights[i] = covering?.position.y ?? site.baseY;
  });
}
