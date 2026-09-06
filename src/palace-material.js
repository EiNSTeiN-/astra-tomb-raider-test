export function weatherPalaceStone(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vPalacePosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvPalacePosition=(modelMatrix*vec4(position,1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vPalacePosition;
      float palaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float palaceNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(palaceHash(i),palaceHash(i+vec2(1,0)),f.x),mix(palaceHash(i+vec2(0,1)),palaceHash(i+vec2(1,1)),f.x),f.y);}
    `,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float staining=palaceNoise(vPalacePosition.xz*.65+vPalacePosition.y*.11);
      float wetStone=(1.0-smoothstep(1.2,4.6,vPalacePosition.y+staining*1.4));
      float salt=exp(-pow((vPalacePosition.y-3.5-staining*.8)*3.0,2.0))*.18;
      diffuseColor.rgb*=mix(vec3(1.0),vec3(.47,.64,.55),wetStone*(.5+.5*staining));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.53,.43),salt);
      diffuseColor.rgb*=.91+.09*palaceNoise(vPalacePosition.xz*.09+vPalacePosition.y*.16);
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      roughnessFactor=mix(max(.72,roughnessFactor),.51,wetStone*.55);
    `,
      );
  };
  material.customProgramCacheKey = () => "vesper-palace-tidal-stone-1";
}
