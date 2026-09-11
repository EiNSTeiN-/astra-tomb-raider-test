// Existing rock maps projected in metres; snow collects on ledges and in
// gullies. Its broad coverage and fine edge breakup use separate scales so
// the range reads at a distance without a regular striped texture.
export function alpineMaterial(source, haze) {
  const material = source.clone();
  material.name = "Alpine rock faces and deposited snow";
  material.color.set(0xffffff);
  material.roughnessMap = null;
  material.roughness = 0.95;
  material.envMapIntensity = 0.45;
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.alpineHaze = { value: haze };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vAlpinePosition, vAlpineNormal; varying float vAlpineClip;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvAlpinePosition=(modelMatrix*vec4(position,1.)).xyz; vAlpineNormal=normalize(mat3(modelMatrix)*normal);",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vAlpineClip=gl_Position.z+gl_Position.w;
        float backgroundDepth=.2+.75*(max(0.,gl_Position.w)/(max(0.,gl_Position.w)+700.));
        gl_Position.z=gl_Position.w*backgroundDepth;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 alpineHaze;
        varying vec3 vAlpinePosition, vAlpineNormal;
        varying float vAlpineClip;
        float alpineHash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*.1031);
          q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float alpineNoise(vec2 p) {
          vec2 c=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(alpineHash(c),alpineHash(c+vec2(1.,0.)),f.x),
            mix(alpineHash(c+vec2(0.,1.)),alpineHash(c+vec2(1.)),f.x),f.y);
        }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(vAlpineClip<0.) discard;",
      )
      .replace(
        "#include <normalmap_pars_fragment>",
        `#include <normalmap_pars_fragment>
        vec3 alpineDetail(vec3 sampleNormal,vec2 uv,vec3 base,float strength) {
          vec3 detail=sampleNormal*2.-1.; detail.xy*=strength;
          return normalize(getTangentFrame(-vViewPosition,base,uv)*detail);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 alpineN=normalize(vAlpineNormal);
        vec3 alpineWeights=pow(abs(alpineN),vec3(4.));
        alpineWeights/=max(.001,alpineWeights.x+alpineWeights.y+alpineWeights.z);
        vec3 alpineUv=vAlpinePosition*.07;
        vec3 rock=texture2D(map,alpineUv.zy).rgb*alpineWeights.x
          +texture2D(map,alpineUv.xz).rgb*alpineWeights.y
          +texture2D(map,alpineUv.xy).rgb*alpineWeights.z;
        float broad=alpineNoise(vAlpinePosition.xz*.027);
        float broken=alpineNoise(vAlpinePosition.xz*.19+vAlpinePosition.y*.012);
        float strata=sin(vAlpinePosition.y*.29+broad*5.);
        float gray=dot(rock,vec3(.2126,.7152,.0722));
        vec3 stone=mix(rock,vec3(gray)*vec3(.78,.85,.96),.8)
          *(.36+.14*broad)*(.93+.07*strata);
        float snowline=27.+broad*30.;
        float shelter=alpineN.y+(broad-.5)*.27+(broken-.5)*.09;
        float snow=smoothstep(.44,.72,shelter)
          *smoothstep(snowline,snowline+32.,vAlpinePosition.y);
        vec3 snowColor=mix(vec3(.58,.70,.82),vec3(.89,.93,.96),.5+.5*broken);
        diffuseColor.rgb*=mix(stone,snowColor,snow);
        `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `float detailStrength=mix(.55,.08,snow);
        normal=normalize(
          alpineDetail(texture2D(normalMap,alpineUv.zy).xyz,alpineUv.zy,normal,detailStrength)*alpineWeights.x
          +alpineDetail(texture2D(normalMap,alpineUv.xz).xyz,alpineUv.xz,normal,detailStrength)*alpineWeights.y
          +alpineDetail(texture2D(normalMap,alpineUv.xy).xyz,alpineUv.xy,normal,detailStrength)*alpineWeights.z);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float airDistance=length(cameraPosition-vAlpinePosition);
        float airDensity=.00065*mix(1.9,.55,smoothstep(0.,220.,vAlpinePosition.y));
        float air=1.-exp(-airDistance*airDensity);
        outgoingLight=mix(outgoingLight,alpineHaze,air);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "vesper-alpine-range-2";
  return material;
}
