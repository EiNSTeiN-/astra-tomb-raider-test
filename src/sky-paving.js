import * as THREE from "three";

// These are original geometric compositions, rather than historical symbols.
// Their shared central approach joins the court's entrance to its wind controls.
export const SKY_PAVING_STYLES = [
  "Arrival causeway",
  "Counterweight courts",
  "Braided crossing",
  "Courier steps",
  "Eagle fan",
  "Sail court",
  "Mountain courses",
  "Crosswind compass",
  "Broken switchback",
  "Skyward altar",
];

export const SKY_PAVING_ENVELOPE = Object.freeze({
  halfWidth: 20,
  halfDepth: 23,
  offsetZ: 3,
  edge: 3.5,
});

// Includes the noisy feathered edge and the specimen's complete leaning reach.
// The same envelope drives the shader, so surviving meadow cannot grow through
// intact slabs. Other placements keep their original random samples/transforms.
export function skyPavingPlantClear(map, x, z, radius = 0, profile) {
  const e = SKY_PAVING_ENVELOPE;
  const inside = (map?.rooms || []).some(
    (room) =>
      Math.max(
        Math.abs(x - room.x * 7) - e.halfWidth,
        Math.abs(z - room.z * 7 - e.offsetZ) - e.halfDepth,
      ) <
      e.edge + radius,
  );
  if (!inside) return true;
  if (profile) {
    // The shader fades out below an upward normal of .94. Keep planting on
    // steep, unpaved shoulders, with a conservative .90 margin over the whole
    // leaning footprint so a bank plant cannot reach onto the flat stone.
    const probes = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.707, 0.707],
      [-0.707, 0.707],
      [0.707, -0.707],
      [-0.707, -0.707],
    ];
    const steep = probes.every(([dx, dz]) => {
      const px = x + dx * radius,
        pz = z + dz * radius,
        h = 0.35;
      const nx = profile.height(px - h, pz) - profile.height(px + h, pz),
        nz = profile.height(px, pz - h) - profile.height(px, pz + h);
      return (h * 2) / Math.hypot(nx, h * 2, nz) < 0.9;
    });
    if (steep) return true;
  }
  return false;
}

export function skyPavingUniforms(map) {
  const rooms = map?.rooms || [];
  return {
    skyPavingCourts: {
      value: rooms.length
        ? rooms.map(
            (room) =>
              new THREE.Vector3(room.x * 7, room.z * 7, room.index % 10),
          )
        : [new THREE.Vector3(0, 0, -1)],
    },
    skyPavingStrength: { value: 1 },
    skyPavingEnvelope: {
      value: new THREE.Vector4(
        SKY_PAVING_ENVELOPE.halfWidth,
        SKY_PAVING_ENVELOPE.halfDepth,
        SKY_PAVING_ENVELOPE.offsetZ,
        SKY_PAVING_ENVELOPE.edge,
      ),
    },
  };
}

export const skyPavingDeclarations = /* glsl */ `
#ifdef TERRAIN_SKY
uniform vec3 skyPavingCourts[SKY_PAVING_COUNT];
uniform float skyPavingStrength;
uniform vec4 skyPavingEnvelope;

float skyPavingLine(float distance,float width) {
  float aa=max(.004,fwidth(distance));
  return 1.-smoothstep(width-aa,width+aa,distance);
}

// Course joints are evaluated in metres. Staggering changes by course, while
// clipped corners and lightly wandering bed joints break the rectangular grid.
// No vertex displacement is applied to the shared walking surface.
vec4 skyPavingPattern(vec2 p,float style) {
  vec2 q=p, size=vec2(1.85,1.22);
  float band=0., lane=abs(p.x);
  vec2 c=p-vec2(0.,5.);
  float radius=length(c),diamond=abs(c.x)+abs(c.y);
  if(style<.5) {
    size=vec2(1.25,2.5);
    band=skyPavingLine(abs(abs(p.x)-3.2),.16);
    band=max(band,skyPavingLine(abs(p.y-8.),.16)*step(3.2,abs(p.x)));
  } else if(style<1.5) {
    size=vec2(2.35,1.15);
    band=skyPavingLine(abs(abs(p.x)-7.8),.2);
    band=max(band,skyPavingLine(abs(p.y-4.),.17)*step(7.8,abs(p.x)));
    lane=min(lane,abs(abs(p.x)-7.8));
  } else if(style<2.5) {
    q=mat2(.8,.6,-.6,.8)*p;size=vec2(1.6,1.28);
    band=skyPavingLine(abs(abs(c.x)-abs(c.y)*.65-2.8),.19);
    band*=1.-smoothstep(12.,15.,abs(c.y));
    lane=min(lane,abs(p.y-5.));
  } else if(style<3.5) {
    size=vec2(2.6,1.05);
    float tread=floor((p.y+16.)/6.);
    float stepX=mod(tread,2.)*4.-2.;
    band=skyPavingLine(abs(p.x-stepX),.17);
    band=max(band,skyPavingLine(abs(mod(p.y+16.,6.)-3.),.16)*step(abs(p.x),8.));
  } else if(style<4.5) {
    q=mat2(.9238795,.3826834,-.3826834,.9238795)*p;
    size=vec2(2.15,1.18);
    band=skyPavingLine(abs(abs(c.x)-abs(c.y)*.8-2.),.18);
    band=max(band,skyPavingLine(abs(diamond-13.),.2));
    lane=min(lane,abs(diamond-10.));
  } else if(style<5.5) {
    size=vec2(1.4,2.05);
    float octagon=max(max(abs(c.x),abs(c.y)),(abs(c.x)+abs(c.y))*.70710678);
    band=skyPavingLine(abs(octagon-11.5),.21);
    band=max(band,skyPavingLine(abs(octagon-5.8),.14));
    lane=min(lane,abs(octagon-8.));
  } else if(style<6.5) {
    size=vec2(3.,.98);
    band=skyPavingLine(abs(mod(p.y+18.,7.)-3.5),.18);
    band*=1.-smoothstep(11.,14.,abs(p.x));
    lane=min(lane,abs(abs(p.x)-9.));
  } else if(style<7.5) {
    q=mat2(.70710678,.70710678,-.70710678,.70710678)*p;
    size=vec2(1.5,1.5);
    band=skyPavingLine(abs(radius-11.),.19);
    band=max(band,skyPavingLine(min(abs(c.x),abs(c.y)),.18)*smoothstep(3.,4.,radius));
    band=max(band,skyPavingLine(abs(abs(c.x)-abs(c.y)),.14)*smoothstep(7.,8.,radius));
    lane=min(lane,abs(radius-8.));
  } else if(style<8.5) {
    q=mat2(.8,-.6,.6,.8)*p;size=vec2(2.1,1.18);
    float zig=abs(mod(p.y+18.,16.)-8.)-4.;
    band=skyPavingLine(abs(p.x-zig),.2);
    band=max(band,skyPavingLine(abs(abs(p.x)-12.5),.15));
    lane=min(lane,abs(p.x-zig));
  } else {
    size=vec2(1.9,1.5);
    float square=max(abs(c.x),abs(c.y));
    band=skyPavingLine(abs(square-13.5),.23);
    band=max(band,skyPavingLine(abs(square-6.),.17));
    band=max(band,skyPavingLine(min(abs(c.x),abs(c.y)),.22)*step(6.,square));
    lane=min(lane,abs(square-10.));
  }
  // Every plan carries a restrained border around the surviving terrace floor.
  float border=max(abs(p.x)/17.8,abs(p.y-3.)/20.2);
  band=max(band,skyPavingLine(abs(border-1.)*17.8,.18));
  float row=floor(q.y/size.y);
  float bed=row*size.y+(terrainHash(vec2(row,style+71.))-.5)*.24;
  if(q.y<bed)row-=1.;
  float next=(row+1.)*size.y+(terrainHash(vec2(row+1.,style+71.))-.5)*.24;
  if(q.y>next)row+=1.;
  bed=row*size.y+(terrainHash(vec2(row,style+71.))-.5)*.24;
  next=(row+1.)*size.y+(terrainHash(vec2(row+1.,style+71.))-.5)*.24;
  float rowT=(q.y-bed)/(next-bed);
  float width=size.x*mix(.82,1.18,terrainHash(vec2(row,style+53.)));
  float shift=terrainHash(vec2(row,style+31.))*.65+.2;
  float lean=(terrainHash(vec2(row,style+91.))-.5)*.24;
  float column=q.x/width+shift+(rowT-.5)*lean;
  vec2 id=vec2(floor(column),row);
  float grain=terrainHash(id+vec2(style*37.,style*59.));
  vec2 cell=vec2(fract(column)*width,q.y-bed);
  vec2 edges=min(cell,vec2(width,next-bed)-cell);
  float corner=(edges.x+edges.y-mix(.06,.19,grain))*.70710678;
  float edge=min(min(edges.x,edges.y),corner);
  // Sparse fractures terminate at individual stones' edges. Their narrow
  // grooves use the same derivative filter as the surrounding mortar.
  float fracture=abs(cell.x-cell.y*.43-width*.57);
  if(grain>.85)edge=min(edge,fracture*.72+.015);
  float traffic=1.-smoothstep(1.2,4.8,min(lane,abs(p.y+10.)));
  return vec4(edge,band,grain,traffic);
}

vec3 skyPavingRelief(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
#endif
`;

export const skyPavingColor = /* glsl */ `
#ifdef TERRAIN_SKY
  vec3 skyPavingSite=vec3(0.,0.,-1.);
  float skyPavingDistance=1.e6;
  for(int i=0;i<SKY_PAVING_COUNT;i++) {
    vec3 site=skyPavingCourts[i];vec2 p=vTerrainPosition.xz-site.xy;
    float d=max(abs(p.x)-skyPavingEnvelope.x,abs(p.y-skyPavingEnvelope.z)-skyPavingEnvelope.y);
    if(d<skyPavingDistance){skyPavingDistance=d;skyPavingSite=vec3(p,site.z);}
  }
  vec4 skySlab=skyPavingPattern(skyPavingSite.xy,skyPavingSite.z);
  float skyWeather=terrainNoise(vTerrainPosition.xz*.22+vec2(61.,23.));
  float skySoil=terrainNoise(vTerrainPosition.xz*.083+vec2(17.,41.));
  float skyFloor=(1.-smoothstep(-1.,skyPavingEnvelope.w-1.,skyPavingDistance+(skyWeather-.5)*2.))
    *smoothstep(.94,.99,normalize(vTerrainNormal).y)
    *(1.-smoothstep(.5,3.,vSkyDepth))*step(0.,skyPavingSite.z)*skyPavingStrength;
  float skyEdge=skySlab.x+(terrainNoise(vTerrainPosition.xz*4.2)-.5)*.025;
  float skyPavingJoint=1.-smoothstep(.018-max(.001,fwidth(skyEdge)),.045+max(.001,fwidth(skyEdge)),skyEdge);
  float skyBevel=smoothstep(.015,.085,skyEdge);
  // Worn paths stay legible; soil and growth reclaim the outer, quieter slabs.
  float skySurvival=smoothstep(.19,.55,skyWeather*.35+(1.-skySoil)*.35+skySlab.w*.5);
  skySurvival*=mix(.4,1.,smoothstep(.01,.14,skySlab.z));
  float skyGrain=dot(texture2D(cliffMap,vTerrainPosition.xz/2.8).rgb,vec3(.2126,.7152,.0722));
  vec3 skyStone=mix(vec3(.155,.17,.165),vec3(.29,.30,.265),skySlab.z);
  skyStone*=mix(.72,1.2,smoothstep(.1,.65,skyGrain));
  skyStone=mix(skyStone,skyStone*vec3(.42,.59,.61),skySlab.y*.78);
  skyStone*=mix(.81,1.,skyBevel);
  skyStone=mix(skyStone,earthColor*.63,skyPavingJoint*.9);
  pavingColor=mix(pavingColor,skyStone,skyFloor);
  pavingWeight=mix(pavingWeight,skySurvival,skyFloor);
  growthWeight*=1.-skyFloor*skySurvival;
#endif
`;

export const skyPavingNormal = /* glsl */ `
#ifdef TERRAIN_SKY
  vec3 skyStoneN=normalize(mix(normal,
    terrainSurfaceNormal(texture2D(cliffNormal,vTerrainPosition.xz/2.8).xyz,
      vTerrainPosition.xz/2.8,normal,.32),.55));
  skyStoneN=skyPavingRelief(skyStoneN,-skyPavingJoint*.007+skyBevel*.004);
  pavingN=normalize(mix(pavingN,skyStoneN,skyFloor));
#endif
`;

export const skyPavingRoughness = /* glsl */ `
#ifdef TERRAIN_SKY
  float skyStoneRough=mix(.92,.78,skySlab.w)*(1.-skySlab.y*.04);
  terrainRough=mix(terrainRough,mix(skyStoneRough,.98,skyPavingJoint),skyFloor*pavingWeight);
#endif
`;
