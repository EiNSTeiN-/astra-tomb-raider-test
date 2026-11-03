import { Vector2, Vector4 } from "three";

const cached = new WeakMap();

// Terrain and paving share the same delivered water planes. Updating an early
// paving reference in place also updates its material clones without retaining
// the game, its meshes or chapter-specific textures.
export function cavernPoolUniforms(map, profile) {
  let uniforms = map && cached.get(map);
  if (!uniforms) {
    uniforms = {
      cavernPoolStrength: { value: 1 },
      cavernPoolSites: {
        value: Array.from({ length: 4 }, (_, i) => new Vector4(1e5, 1e5, 0, i)),
      },
      cavernPoolBounds: {
        value: Array.from({ length: 4 }, () => new Vector2()),
      },
    };
    if (map) cached.set(map, uniforms);
  }
  if (profile?.waters) {
    const pools = profile.waters.filter(
      (site) => site.kind === "water" && site.shore === "crystal",
    );
    for (let i = 0; i < 4; i++) {
      const site = pools[i];
      uniforms.cavernPoolSites.value[i].set(
        site?.x ?? 1e5,
        site?.z ?? 1e5,
        site?.baseY ?? 0,
        i,
      );
      uniforms.cavernPoolBounds.value[i].set(
        site ? site.width / 2 : 0,
        site ? site.length / 2 : 0,
      );
    }
  }
  return uniforms;
}

export const cavernPoolDeclarations = /* glsl */ `
#ifdef TERRAIN_CAVERN
uniform vec4 cavernPoolSites[4];
uniform vec2 cavernPoolBounds[4];
uniform float cavernPoolStrength;
struct CavePool {float coverage;float depth;float calcite;float silt;float grain;float relief;float variant;};
CavePool cavePool(vec3 world,vec3 surfaceNormal) {
  vec4 site=cavernPoolSites[0];float nearest=1.e20;
  for(int i=0;i<4;i++) {
    vec4 candidate=cavernPoolSites[i];
    vec2 delta=abs(world.xz-candidate.xy)-cavernPoolBounds[i];
    float edge=max(delta.x,delta.y);
    if(edge<nearest) {nearest=edge;site=candidate;}
  }
  float depth=site.z-world.y;
  // Blend inside the delivered water bounds. Nearby dry controls can stand
  // close to its plane outside that rectangle and must not receive wet paint.
  float region=1.-smoothstep(-.55,0.,nearest);
  float coverage=smoothstep(-.06,.08,depth)*region*cavernPoolStrength;
  vec2 p=world.xz-site.xy;
  float seed=site.w*17.11;
  float weather=karstNoise(p*.37+vec2(seed,37.));
  float grain=karstNoise(p*5.3+vec2(29.,seed));
  float field=karstNoise(p*.91+vec2(seed+world.y*.04,71.));
  float footprint=max(.003,fwidth(field));
  float vein=(1.-smoothstep(.02,.065+footprint,abs(field-.54)))
    *(1.-smoothstep(.11,.3,footprint));
  float line=1.-smoothstep(.025,.115+max(.003,fwidth(depth)),
    abs(depth-.04+(weather-.5)*.035));
  float silt=smoothstep(.12,.85,depth)*smoothstep(.66,.96,surfaceNormal.y)
    *(.3+.7*smoothstep(.25,.8,weather));
  CavePool result;
  result.coverage=clamp(coverage,0.,1.);result.depth=depth;
  result.calcite=clamp(line*.75+vein*.38*(1.-silt*.7),0.,1.);
  result.silt=silt;result.grain=grain;result.variant=site.w;
  result.relief=(result.calcite*.0018+(grain-.5)*.0012-silt*.0008)*result.coverage;
  return result;
}
vec3 cavePoolColor(vec3 rock,CavePool pool) {
  float gray=dot(rock,vec3(.2126,.7152,.0722));
  vec3 limestone=mix(rock,vec3(gray)*vec3(1.10,1.065,.96),.85)
    *(.78+pool.grain*.30);
  vec3 siltTint=vec3(.82,.75,.63);
  if(pool.variant>.5&&pool.variant<1.5) siltTint=vec3(.96,.71,.46);
  else if(pool.variant>1.5&&pool.variant<2.5) siltTint=vec3(.69,.77,.77);
  else if(pool.variant>2.5) siltTint=vec3(.72,.65,.56);
  limestone=mix(limestone,vec3(gray)*siltTint,pool.silt*.72);
  vec3 deposit=vec3(gray)*vec3(1.6,1.53,1.36)+vec3(.02);
  return mix(limestone,deposit,pool.calcite*.68);
}
#endif
`;

export const cavernPoolColor = /* glsl */ `
#ifdef TERRAIN_CAVERN
  CavePool poolGround=cavePool(vTerrainPosition,normalize(vTerrainNormal));
  terrainAlbedo=mix(terrainAlbedo,cavePoolColor(cliffColor,poolGround),poolGround.coverage);
#endif
`;
export const cavernPoolRoughness = /* glsl */ `
#ifdef TERRAIN_CAVERN
  roughnessFactor=mix(roughnessFactor,clamp(.66+poolGround.silt*.25-poolGround.calcite*.15,.48,.96),poolGround.coverage);
#endif
`;
export const cavernPoolNormal = /* glsl */ `
#ifdef TERRAIN_CAVERN
  if(cavernPoolStrength>0.) {
    terrainN=normalize(mix(terrainN,cliffN,poolGround.coverage));
    terrainN=karstNormal(terrainN,poolGround.relief);
  }
#endif
`;
