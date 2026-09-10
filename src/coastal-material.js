import * as THREE from "three";

export const coastalDeclarations = /* glsl */ `
#ifdef TERRAIN_COASTAL
varying vec3 vCoastal;
uniform vec4 coastalBasins[8];
uniform float coastalWaterHeight[8];
uniform sampler2D coastalSlabMap, coastalSlabNormal, coastalSlabRoughness;

vec3 coastalStone(vec2 p) {
  vec2 uv = p / vec2(1.45, .96);
  uv.x += mod(floor(uv.y), 2.0) * .5;
  vec2 cell = floor(uv), f = fract(uv);
  vec2 edge = min(f, 1.0-f) * vec2(1.45, .96);
  float d = min(edge.x, edge.y);
  float worn = terrainNoise(p * 7.0) * .008;
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  float pixelWidth=max(.003,footprint*.45);
  float farStone=smoothstep(.2,.65,footprint);
  float joint=mix(1.0-smoothstep(.019-pixelWidth,.019+pixelWidth,d-worn),.064,farStone);
  return vec3(joint, mix(smoothstep(.014,.058,d-worn),1.0,farStone), terrainHash(cell));
}

float coastalTessera(vec2 p) {
  vec2 f=fract(p/.095);
  float edge=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y));
  float aa=max(.01, fwidth(edge));
  return smoothstep(.045-aa,.075+aa,edge);
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
  vec2 cp = vCoastal.xy;
  float courtIndex = floor(vCoastal.z+.5);
  vec3 slab = coastalStone(vTerrainPosition.xz);
  float breakage = terrainNoise(vTerrainPosition.xz * .19 + vec2(8,31));
  float burial = smoothstep(.65,.88,breakage) * .38;
  pavingWeight = smoothstep(.05,.8, vCourt - burial);
  // Broad worn limestone slabs sit beneath the surviving tessellated inlays.
  vec3 limestone = texture2D(coastalSlabMap,vTerrainPosition.xz/2.7).rgb;
  vec3 slabColor = limestone * (.55+.22*slab.z) * mix(1.0,.32,slab.x);
  slabColor *= vec3(.89,.95,.92);
  float frame = min(20.0-abs(cp.x),21.0-abs(cp.y));
  float border = (1.0-smoothstep(.6,.85,abs(frame-1.0)))
    * smoothstep(-.2,.4,frame);
  float along = abs(cp.x)>abs(cp.y) ? cp.y : cp.x;
  float braidA = abs((frame-1.0)-sin(along*1.7+courtIndex)*.36);
  float braidB = abs((frame-1.0)+sin(along*1.7+courtIndex)*.36);
  float braid = 1.0-smoothstep(.08,.15,min(braidA,braidB));
  vec2 center=vec2(8.5,mod(courtIndex,3.0)<1.0 ? -15.0 : 6.5);
  vec2 medallionPoint=cp-center;
  float radius=length(medallionPoint), angle=atan(medallionPoint.y,medallionPoint.x);
  float medallion=1.0-smoothstep(3.15,3.3,radius);
  float petals=sin(angle*(6.0+2.0*mod(courtIndex,3.0))+radius*1.6);
  float motif=1.0-smoothstep(.12,.23,abs(radius-(1.65+.53*petals)));
  motif=max(motif,1.0-smoothstep(.055,.14,abs(radius-2.9)));
  motif=max(motif,1.0-smoothstep(.45,.57,radius));
  float pattern=mix(braid,motif,medallion);
  vec3 mosaic=mix(vec3(.055,.16,.17),vec3(.46,.47,.37),pattern);
  mosaic*=.8+.35*terrainHash(floor(vTerrainPosition.xz/.095));
  mosaic*=mix(.42,1.0,coastalTessera(vTerrainPosition.xz));
  float ornament=max(border,medallion);
  ornament*=1.0-smoothstep(.55,.77,breakage + terrainNoise(vTerrainPosition.xz*1.6)*.1);
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
  for(int i=0;i<8;i++) {
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
  float slabHeight=coastalStone(vTerrainPosition.xz).y * .014;
  vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
  vec3 r1=cross(q1,normal),r2=cross(normal,q0);
  float determinant=dot(q0,r1);
  vec3 gradient=sign(determinant)*(dFdx(slabHeight)*r1+dFdy(slabHeight)*r2);
  vec3 bevelN=normalize(max(.000001,abs(determinant))*normal-gradient);
  vec3 slabN=terrainSurfaceNormal(texture2D(coastalSlabNormal,vTerrainPosition.xz/2.7).xyz,
    vTerrainPosition.xz/2.7,normal,.4);
  pavingN=normalize(mix(slabN,pavingN,ornament));
  pavingN=normalize(mix(pavingN,bevelN,.6*(1.0-ornament)));
  earthN=normalize(mix(normal,earthN,.3));
#endif
`;

export function coastalUniforms(game) {
  return {
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
