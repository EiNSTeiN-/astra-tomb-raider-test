import { Vector4 } from "three";

const cached = new WeakMap();

// Terrain and the worn paving above it share each impact and flow direction.
// Supplying the delivered floor updates existing references, including paving
// materials that were constructed before their terrain material.
export function dripGroundUniforms(map, profile) {
  let uniforms = map && cached.get(map);
  if (!uniforms) {
    uniforms = {
      dripGroundStrength: { value: 1 },
      dripGroundSites: {
        value: Array.from({ length: 9 }, (_, i) => {
          const room = map?.rooms?.[i];
          return new Vector4(
            room ? room.x * 7 - 10 : 100000,
            room ? room.z * 7 + 8 : 100000,
            -0.894427191,
            -0.4472135955,
          );
        }),
      },
    };
    if (map) cached.set(map, uniforms);
  }
  if (typeof profile?.surfaceHeight === "function")
    for (const [i, site] of uniforms.dripGroundSites.value.entries()) {
      if (!map?.rooms?.[i]) continue;
      const sample = profile.surfaceHeight,
        dx = sample(site.x + 1, site.y) - sample(site.x - 1, site.y),
        dz = sample(site.x, site.y + 1) - sample(site.x, site.y - 1),
        length = Math.hypot(dx, dz);
      if (length > 0.002) {
        site.z = -dx / length;
        site.w = -dz / length;
      }
    }
  return uniforms;
}

export const dripGroundDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
uniform vec4 dripGroundSites[9];
uniform float dripGroundStrength;
struct DripGround {float calcite; float wet; float relief;};
DripGround dripGround(vec2 world,vec3 surfaceNormal) {
  vec4 site=dripGroundSites[0]; float nearest=1.e20,seed=0.;
  for(int i=0;i<9;i++) {
    vec4 candidate=dripGroundSites[i]; vec2 delta=world-candidate.xy;
    float distanceSquared=dot(delta,delta);
    if(distanceSquared<nearest) {nearest=distanceSquared;site=candidate;seed=float(i)*13.71;}
  }
  vec2 delta=world-site.xy;
  vec2 p=vec2(dot(delta,site.zw),dot(delta,vec2(-site.w,site.z)));
  float broad=terrainNoise(p*.43+vec2(seed,31.));
  float grain=terrainNoise(p*3.1+vec2(17.,seed));
  // Broken fans widen downhill; a small splash zone surrounds the impact.
  float along=clamp(p.x,-1.,6.);
  float fanWidth=.75+max(0.,along)*.38;
  float across=p.y+sin(p.x*1.3+seed)*.2+(broad-.5)*.3;
  float fan=(1.-smoothstep(fanWidth*.5,fanWidth,abs(across)))
    *smoothstep(-1.2,-.3,p.x)*(1.-smoothstep(3.8,6.3,p.x));
  float radial=length(p*vec2(.86,1.))+(broad-.5)*.35;
  float splash=1.-smoothstep(.7,2.2,radial);
  float boundary=max(fan,splash*.85)*smoothstep(.67,.97,surfaceNormal.y)
    *dripGroundStrength;
  // Millimetre-scale mineral bands catch light without moving the floor.
  float phase=radial*13.+broad*2.3+seed;
  float bandwidth=max(.03,fwidth(phase));
  float band=(.5+.5*sin(phase))*(1.-smoothstep(.7,2.8,bandwidth));
  float crust=(.42+band*.35+grain*.23)*boundary;
  float core=(1.-smoothstep(.28,.95,radial))*(.75+grain*.25);
  float branch=abs(across-(.22+max(0.,p.x-.6)*.18)*sin(seed+1.7));
  float rillDistance=min(abs(across),branch+1.-smoothstep(.5,1.3,p.x));
  float rillWidth=.025+.035*broad;
  float rill=(1.-smoothstep(rillWidth,rillWidth+max(.018,fwidth(across)),rillDistance))
    *smoothstep(-.35,.15,p.x)*(1.-smoothstep(3.,5.7,p.x))
    *smoothstep(.24,.68,terrainNoise(p*2.+vec2(seed,41.)));
  float wet=max(core,rill*.6)*boundary;
  DripGround result;
  result.calcite=clamp(crust*(1.-wet*.8),0.,1.);
  result.wet=clamp(wet,0.,1.);
  result.relief=(band*.0012-rill*.0008)*boundary;
  return result;
}
vec3 dripGroundColor(vec3 substrate,DripGround ground) {
  float lightness=dot(substrate,vec3(.2126,.7152,.0722));
  vec3 mineral=vec3(1.10,1.045,.91)*clamp(lightness*1.65+.045,.07,.46);
  vec3 color=mix(substrate,mineral,ground.calcite*.8);
  return color*(1.-ground.wet*.32);
}
#endif
`;

export const dripGroundColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  DripGround drip=dripGround(vTerrainPosition.xz,normalize(vTerrainNormal));
  terrainAlbedo=dripGroundColor(terrainAlbedo,drip);
#endif
`;

export const dripGroundRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  roughnessFactor=mix(roughnessFactor,.24,drip.wet*.8);
#endif
`;

export const dripGroundNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  terrainN=archiveReliefNormal(terrainN,drip.relief);
#endif
`;
