// Existing rock maps are projected in world metres, with broader weathering and
// narrow mineral beds filtered by screen footprint. No additional textures.
export function meridianRockMaterial(source, haze) {
  const material = source.clone();
  material.name = "Weathered meridian strata";
  material.color.set(0xc4c5c8);
  material.roughnessMap = null;
  material.roughness = 0.96;
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.meridianHaze = { value: haze };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vMeridianPosition, vMeridianNormal; varying float vMeridianClip;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMeridianPosition=(modelMatrix*vec4(position,1.)).xyz; vMeridianNormal=normalize(mat3(modelMatrix)*normal);",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vMeridianClip=gl_Position.z+gl_Position.w;
        float backgroundDepth=.2+.75*(max(0.,gl_Position.w)/(max(0.,gl_Position.w)+700.));
        gl_Position.z=gl_Position.w*backgroundDepth;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 meridianHaze;
        varying vec3 vMeridianPosition, vMeridianNormal;
        varying float vMeridianClip;
        float meridianHash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
        }
        float meridianNoise(vec2 p) {
          vec2 c=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(meridianHash(c),meridianHash(c+vec2(1.,0.)),f.x),mix(meridianHash(c+vec2(0.,1.)),meridianHash(c+vec2(1.)),f.x),f.y);
        }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(vMeridianClip<0.) discard;",
      )
      .replace(
        "#include <normalmap_pars_fragment>",
        `#include <normalmap_pars_fragment>
        vec3 meridianDetail(vec3 sampleNormal, vec2 uv, vec3 base) {
          vec3 detail=sampleNormal*2.-1.;detail.xy*=.38;
          return normalize(getTangentFrame(-vViewPosition,base,uv)*detail);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 meridianWeights=pow(abs(normalize(vMeridianNormal)),vec3(4.));
        meridianWeights/=max(.001,meridianWeights.x+meridianWeights.y+meridianWeights.z);
        vec3 meridianUv=vMeridianPosition*.09;
        vec3 rock=texture2D(map,meridianUv.zy).rgb*meridianWeights.x+texture2D(map,meridianUv.xz).rgb*meridianWeights.y+texture2D(map,meridianUv.xy).rgb*meridianWeights.z;
        float gray=dot(rock,vec3(.2126,.7152,.0722));
        float macro=meridianNoise(vMeridianPosition.xz*.02);
        float phase=vMeridianPosition.y*.42+macro*2.7;
        float footprint=max(.01,fwidth(phase));
        float mineral=(1.-smoothstep(.06,.06+footprint,abs(sin(phase))))*(1.-smoothstep(.35,1.2,footprint));
        float weather=smoothstep(.42,.86,macro)*(1.-smoothstep(.4,.85,vMeridianNormal.y));
        vec3 stone=mix(rock,vec3(gray)*vec3(.94,.99,1.03),.84)*(.58+macro*.24);
        stone=mix(stone,stone*vec3(.65,.7,.77),weather*.36);
        stone*=.88+.12*smoothstep(-.3,.5,sin(phase));
        stone=mix(stone,vec3(.3,.28,.23),mineral*.18);
        diffuseColor.rgb*=stone;
      `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `normal=normalize(
        meridianDetail(texture2D(normalMap,meridianUv.zy).xyz,meridianUv.zy,normal)*meridianWeights.x+
        meridianDetail(texture2D(normalMap,meridianUv.xz).xyz,meridianUv.xz,normal)*meridianWeights.y+
        meridianDetail(texture2D(normalMap,meridianUv.xy).xyz,meridianUv.xy,normal)*meridianWeights.z);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float airDistance=length(cameraPosition-vMeridianPosition);
        float airDensity=.0021*mix(1.65,.65,smoothstep(0.,145.,vMeridianPosition.y));
        float air=1.-exp(-airDistance*airDensity);
        outgoingLight=mix(outgoingLight,meridianHaze,air);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "vesper-meridian-strata-1";
  return material;
}
