import { Vector4 } from "three";

const courtUniforms = new WeakMap();

// Work areas share the original terrain. Keep each composition inside its own
// court, even where two halls approach one another along a short connection.
export function forgeFloorUniforms(map) {
  if (map && courtUniforms.has(map)) return courtUniforms.get(map);
  const rooms = map?.rooms || [];
  const uniforms = {
    forgeFloorStrength: { value: 0.92 },
    forgeFloorSites: {
      value: rooms.length
        ? rooms.map((room, index) => {
            const nearest = Math.min(
              ...rooms
                .filter((other) => other !== room)
                .map(
                  (other) => Math.hypot(room.x - other.x, room.z - other.z) * 7,
                ),
            );
            return new Vector4(
              room.x * 7,
              room.z * 7 + 12,
              Math.min(18.5, nearest * 0.44),
              (room.index ?? index) % 9,
            );
          })
        : [new Vector4(0, 0, 0, -1)],
    },
  };
  // Terrain and the thin worn-paving patches must render the same courses.
  // A weak map lets the outgoing chapter and its numeric data retire together.
  if (map) courtUniforms.set(map, uniforms);
  return uniforms;
}

// Called inside TERRAIN_FORGE. Filter every band using the world-space pixel
// footprint, rather than differentiating a wrapped angle or repeated cell.
export const forgeFloorDeclarations = /* glsl */ `
uniform vec4 forgeFloorSites[FORGE_FLOOR_COUNT];
uniform float forgeFloorStrength;
struct ForgeFloor { float coverage; float inlay; float joint; float tone; float relief; float quench; };
vec3 foundryReliefNormal(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
float foundryBand(float distance, float width, float pixel) {
  float aa=max(.004,pixel);
  return (1.-smoothstep(width-aa*.5,width+aa*.5,abs(distance)))
    *clamp(2.*width/aa,0.,1.);
}
float foundryAngle(vec2 p) {
  return dot(p,p)<1.e-8 ? 0. : atan(p.y,p.x);
}
ForgeFloor foundryFloor(vec2 world) {
  vec2 p=vec2(0.); float style=0.,coverage=0.;
  for(int i=0;i<FORGE_FLOOR_COUNT;i++) {
    vec4 site=forgeFloorSites[i];
    if(site.z<=0.) continue;
    vec2 local=world-site.xy;
    float mask=1.-smoothstep(site.z*.73,site.z,length(local));
    if(mask>coverage) { coverage=mask; p=local*(18.5/site.z); style=site.w; }
  }
  float pixel=max(.004,length(fwidth(p))),r=length(p),angle=foundryAngle(p);
  float wear=terrainNoise(p*.24+vec2(style*7.3,31.));
  float edge=1.-smoothstep(11.8,13.,max(abs(p.x),abs(p.y)));
  float line=0.;
  if(style<.5) {
    // Receiving: paired haul lanes and short transverse loading bays.
    line=foundryBand(abs(p.x)-6.5,.16,pixel)*edge;
    float ties=foundryBand(mod(p.y+2.75,5.5)-2.75,.11,pixel);
    line=max(line,ties*smoothstep(4.7,5.2,abs(p.x))*edge);
  } else if(style<1.5) {
    // Air: a fan of channels between a hub and its outer distribution ring.
    float spokes=abs(sin(angle*4.))*r/4.;
    line=max(foundryBand(r-9.8,.16,pixel),foundryBand(r-3.6,.12,pixel));
    line=max(line,foundryBand(spokes,.12,pixel)*smoothstep(3.4,4.,r)*(1.-smoothstep(9.7,10.1,r)));
  } else if(style<2.5) {
    // Fuel: nested chevrons, worn into the receiving apron.
    line=foundryBand(mod(p.y+abs(p.x)*.72+1.8,3.6)-1.8,.11,pixel)*edge;
  } else if(style<3.5) {
    // Pressure: three expansion rings and four radial connections.
    line=max(foundryBand(r-3.5,.12,pixel),max(foundryBand(r-7.,.12,pixel),foundryBand(r-10.5,.15,pixel)));
    line=max(line,foundryBand(min(abs(p.x),abs(p.y)),.09,pixel)*smoothstep(3.4,4.,r)*(1.-smoothstep(10.2,10.7,r)));
  } else if(style<4.5) {
    // Fitting: interlocking gear circles, with teeth only at the rims.
    for(int i=0;i<2;i++) {
      vec2 q=p-vec2(i==0?-4.:4.,0.); float radius=length(q);
      float teeth=abs(sin(foundryAngle(q)*8.))*radius/8.;
      float rim=max(foundryBand(radius-4.5,.15,pixel),foundryBand(teeth,.1,pixel)*smoothstep(3.9,4.1,radius)*(1.-smoothstep(4.8,5.1,radius)));
      line=max(line,rim);
    }
  } else if(style<5.5) {
    // Casting: long narrow mould beds with staggered end bands.
    float lane=mod(p.x+1.75,3.5)-1.75;
    line=foundryBand(lane,.13,pixel)*edge;
    float ends=abs(p.y+(mod(floor((p.x+1.75)/3.5),2.)-.5)*1.4)-10.;
    line=max(line,foundryBand(ends,.17,pixel)*edge);
  } else if(style<6.5) {
    // Pilot fires: a six-lobed flame rosette, surrounded by a service ring.
    line=max(foundryBand(r-(5.2+1.2*cos(angle*6.)),.17,pixel),foundryBand(r-9.2,.14,pixel));
    line=max(line,foundryBand(r-2.,.12,pixel));
  } else if(style<7.5) {
    // Quenching: paired channels bend through the dressed stone.
    float bend=sin(p.y*.32)*.65;
    line=max(foundryBand(abs(p.x-bend)-3.5,.15,pixel),foundryBand(abs(p.x-bend)-7.3,.15,pixel))*edge;
    line=max(line,foundryBand(abs(p.y)-11.4,.17,pixel)*edge);
  } else {
    // The heart: nine spokes join two broad circular courses.
    float spokes=abs(sin(angle*4.5))*r/4.5;
    line=max(foundryBand(r-6.,.16,pixel),foundryBand(r-12.,.18,pixel));
    line=max(line,foundryBand(spokes,.14,pixel)*smoothstep(5.9,6.4,r)*(1.-smoothstep(11.8,12.3,r)));
  }
  float survival=smoothstep(.23,.66,wear);
  float inlay=line*survival;
  ForgeFloor result;
  result.coverage=coverage*forgeFloorStrength*smoothstep(.72,.95,abs(vTerrainNormal.y));
  result.inlay=inlay;
  result.joint=line*(1.-survival)*.8;
  result.tone=.84+terrainNoise(p*.085+vec2(style*13.,17.))*.23;
  result.relief=(-inlay*.006-result.joint*.008)*result.coverage;
  result.quench=step(6.5,style)*(1.-step(7.5,style));
  return result;
}
`;

export const forgeFloorColor = /* glsl */ `
  ForgeFloor foundry=foundryFloor(vTerrainPosition.xz);
  // The working aprons lie in front of the old room-center paving mask.
  // Let their worn courses reach into that border without a second surface.
  float foundryGround=(.55+.45*smoothstep(.03,.45,vCourt))*(1.-terrainSlope);
  foundry.coverage*=foundryGround;
  foundry.relief*=foundryGround;
  pavingWeight=max(pavingWeight,foundry.coverage*.9);
  float foundryGray=dot(pavingColor,vec3(.2126,.7152,.0722));
  vec3 foundryStone=mix(pavingColor,vec3(foundryGray)*vec3(.88,.96,1.06),.65)*foundry.tone;
  foundryStone=mix(foundryStone,earthColor*.55,foundry.joint*.6);
  vec3 foundryIron=mix(vec3(.16,.13,.085),foundryStone*.38,.35);
  foundryStone=mix(foundryStone,foundryIron,foundry.inlay*.85);
  pavingColor=mix(pavingColor,foundryStone,foundry.coverage);
`;

export const forgeFloorNormal = /* glsl */ `
  vec3 foundryN=foundryReliefNormal(normalize(mix(pavingN,normal,foundry.inlay*.65)),foundry.relief);
  pavingN=normalize(mix(pavingN,foundryN,foundry.coverage));
`;

export const forgeFloorRoughness = /* glsl */ `
  terrainRough=mix(terrainRough,.9+foundry.joint*.07-foundry.inlay*(.17+foundry.quench*.07),foundry.coverage*pavingWeight);
`;
