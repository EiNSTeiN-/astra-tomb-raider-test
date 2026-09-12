import { pbrMaterial } from "./visuals.js";

const lavaNoise = /* glsl */ `
float slagHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float slagNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(slagHash(i),slagHash(i+vec2(1,0)),f.x),
    mix(slagHash(i+vec2(0,1)),slagHash(i+vec2(1,1)),f.x),f.y);
}
vec3 slagCell(vec2 p) {
  vec2 cell=floor(p),f=fract(p);float first=100.,second=100.,identity=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y));float id=slagHash(cell+o);
    vec2 q=o+.1+.8*vec2(id,slagHash(cell+o+vec2(31,17)))-f;
    float d=dot(q,q);
    if(d<first){second=first;first=d;identity=id;}else second=min(second,d);
  }
  return vec3(sqrt(second)-sqrt(first),sqrt(first),identity);
}
vec3 slagNormal(vec3 base,float height) {
  vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
  vec3 rx=cross(dy,base),ry=cross(base,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
  return normalize(max(abs(determinant),1.e-8)*base-gradient);
}
`;

// Horizontal pools share a world scale, while their world position gives each
// one a different flow field. Surface relief is shading only: the sampled bed
// remains authoritative for movement and the visible cooling shoreline.
export function lavaMaterial(time, heat, sharedSurface) {
  const material =
    sharedSurface?.clone() || pbrMaterial("forge-rock", 0xc4c9cd);
  material.name = "Cooled slag rafts and molten seams";
  material.normalScale.set(0.7, 0.7);
  material.metalness = 0.08;
  const uniforms = { forgeTime: time, forgeHeat: heat };
  material.userData.forgeUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float bedHeight;varying vec3 vSlagWorld;varying float vSlagDepth;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSlagWorld=(modelMatrix*vec4(position,1.)).xyz;
        vSlagDepth=vSlagWorld.y-bedHeight;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float forgeTime,forgeHeat;varying vec3 vSlagWorld;varying float vSlagDepth;
        ${lavaNoise}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if(vSlagDepth<.008)discard;
        vec2 world=vSlagWorld.xz;
        float hot=clamp(forgeHeat,0.,1.);
        // Slow deformation belongs to hot material; cold plates stay still.
        vec2 drift=vec2(slagNoise(world*.23+forgeTime*.009*hot),
          slagNoise(world*.19+vec2(17.,31.)-forgeTime*.007*hot))-.5;
        vec2 wrinkles=vec2(slagNoise(world*1.9),slagNoise(world*1.7+vec2(9.,17.)))-.5;
        vec2 q=world*.94+drift*1.35+wrinkles*.22;
        vec3 plate=slagCell(q);
        float macro=slagNoise(world*.17+vec2(7.,13.));
        float detail=1.-smoothstep(.12,.45,length(fwidth(world)));
        float grain=slagNoise(world*7.+drift);
        float ridges=slagNoise(world*2.6+drift*2.);
        float crackWidth=mix(.012,.065,smoothstep(.3,.75,macro));
        float footprint=max(.004,fwidth(plate.x));
        float seam=1.-smoothstep(crackWidth-footprint,crackWidth+footprint,plate.x);
        float torn=smoothstep(.5,.8,macro)*
          (1.-smoothstep(.02,.19,plate.x))*(.45+.55*slagNoise(q*3.));
        float shore=smoothstep(.012,.22,vSlagDepth);
        float broken=smoothstep(.25,.67,slagNoise(world*1.4+drift*2.));
        float molten=max(seam*(.08+.92*broken),torn)*shore;
        float ash=smoothstep(.2,.82,slagNoise(world*.9+vec2(19.,3.)));
        diffuseColor.rgb*=mix(.4,.85,ash)*mix(.7,1.25,plate.z)*
          mix(.8,1.15,ridges)*(1.-seam*.48);
        float slagRelief=(min(.3,plate.x)*.13-seam*.025+
          (ridges-.5)*.025+(grain-.5)*.008)*detail;
      `,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float slagGray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(slagGray)*vec3(.94,1.,1.06),.94);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor=mix(.96,.65,molten*hot);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        normal=slagNormal(normal,slagRelief);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `
        float flow=slagNoise(world*.38+vec2(forgeTime*.018,-forgeTime*.025));
        float heat=hot*hot;
        vec3 glow=mix(vec3(1.2,.045,.002),vec3(3.2,.65,.035),flow);
        totalEmissiveRadiance=glow*molten*heat*(.4+.6*smoothstep(.15,.8,macro));
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-slag-pools-1";
  return material;
}
