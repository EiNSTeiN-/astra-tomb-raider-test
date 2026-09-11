// Rock projection follows world metres on all three axes. Broad flow bands and
// ash distinguish exposed scarps from their sloping aprons without extra maps.
export function calderaMaterial(source, haze) {
  const material = source.clone();
  material.name = "Caldera rock flows and ash";
  material.color.set(0xb9c2cc);
  material.roughnessMap = null;
  material.roughness = 0.94;
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.calderaHaze = { value: haze };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCalderaPosition, vCalderaNormal; varying float vCalderaClip;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCalderaPosition=(modelMatrix*vec4(position,1.)).xyz; vCalderaNormal=normalize(mat3(modelMatrix)*normal);",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vCalderaClip=gl_Position.z+gl_Position.w;
        float backgroundDepth=.2+.75*(max(0.,gl_Position.w)/(max(0.,gl_Position.w)+700.));
        gl_Position.z=gl_Position.w*backgroundDepth;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 calderaHaze;
        varying vec3 vCalderaPosition, vCalderaNormal;
        varying float vCalderaClip;
        float calderaHash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*.1031);
          q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float calderaNoise(vec2 p) {
          vec2 c=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(calderaHash(c),calderaHash(c+vec2(1.,0.)),f.x),
            mix(calderaHash(c+vec2(0.,1.)),calderaHash(c+vec2(1.)),f.x),f.y);
        }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(vCalderaClip<0.) discard;",
      )
      .replace(
        "#include <normalmap_pars_fragment>",
        `#include <normalmap_pars_fragment>
        vec3 calderaDetail(vec3 sampleNormal,vec2 uv,vec3 base) {
          vec3 detail=sampleNormal*2.-1.; detail.xy*=.5;
          return normalize(getTangentFrame(-vViewPosition,base,uv)*detail);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 calderaWeights=pow(abs(normalize(vCalderaNormal)),vec3(4.));
        calderaWeights/=max(.001,calderaWeights.x+calderaWeights.y+calderaWeights.z);
        vec3 calderaUv=vCalderaPosition*.085;
        vec3 rock=texture2D(map,calderaUv.zy).rgb*calderaWeights.x
          +texture2D(map,calderaUv.xz).rgb*calderaWeights.y
          +texture2D(map,calderaUv.xy).rgb*calderaWeights.z;
        float gray=dot(rock,vec3(.2126,.7152,.0722));
        float macro=calderaNoise(vCalderaPosition.xz*.024);
        float flow=vCalderaPosition.y*.2+macro*2.4;
        float beds=.91+.09*sin(flow);
        float ash=smoothstep(.65,.93,vCalderaNormal.y)*smoothstep(.23,.72,macro);
        vec3 stone=mix(rock,vec3(gray)*vec3(.93,1.,1.06),.92)*(.54+macro*.18)*beds;
        diffuseColor.rgb*=mix(stone,vec3(.19,.2,.21),ash*.35);
        `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `normal=normalize(
          calderaDetail(texture2D(normalMap,calderaUv.zy).xyz,calderaUv.zy,normal)*calderaWeights.x
          +calderaDetail(texture2D(normalMap,calderaUv.xz).xyz,calderaUv.xz,normal)*calderaWeights.y
          +calderaDetail(texture2D(normalMap,calderaUv.xy).xyz,calderaUv.xy,normal)*calderaWeights.z);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float airDistance=length(cameraPosition-vCalderaPosition);
        float airDensity=.0024*mix(1.7,.6,smoothstep(0.,150.,vCalderaPosition.y));
        float air=1.-exp(-airDistance*airDensity);
        outgoingLight=mix(outgoingLight,calderaHaze,air);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "vesper-caldera-rock-2";
  return material;
}
