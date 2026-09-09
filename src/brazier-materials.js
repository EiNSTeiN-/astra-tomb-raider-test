import * as THREE from "three";

export const BRAZIER_FINISHES = Object.freeze({
  jungle: { stone: 0x879782, metal: 0x9a8154, patina: 0x47685b, sides: 8 },
  desert: { stone: 0xc2a580, metal: 0xc2a364, patina: 0x6e654a, sides: 8 },
  snow: { stone: 0x8b979d, metal: 0xb0a078, patina: 0x5c6c68, sides: 8 },
  water: { stone: 0xb3b7a8, metal: 0x9f9970, patina: 0x417c74, sides: 8 },
  volcano: { stone: 0x72767b, metal: 0x777773, patina: 0x6b4a34, sides: 6 },
  sky: { stone: 0x8c9a9a, metal: 0xaa9b6d, patina: 0x527f71, sides: 8 },
  crystal: { stone: 0x8c91a2, metal: 0x8f939f, patina: 0x555c78, sides: 6 },
  eclipse: { stone: 0x9894a0, metal: 0xb0a385, patina: 0x606279, sides: 12 },
});

const noise = /* glsl */ `
float brazierHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float brazierNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(brazierHash(i),brazierHash(i+vec3(1,0,0)),f.x),mix(brazierHash(i+vec3(0,1,0)),brazierHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(brazierHash(i+vec3(0,0,1)),brazierHash(i+vec3(1,0,1)),f.x),mix(brazierHash(i+vec3(0,1,1)),brazierHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
function surface(material, name, fragment, extra = {}) {
  material.name = name;
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBrazierPosition,vBrazierNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBrazierPosition=position;vBrazierNormal=normal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBrazierPosition,vBrazierNormal;uniform vec3 brazierPatina;\n" +
          noise,
      )
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" + fragment,
      );
  };
  material.customProgramCacheKey = () => name;
  return material;
}

export function brazierMaterials(game) {
  const finish = BRAZIER_FINISHES[game.level.biome];
  const stone = surface(
    game.darkMat.clone(),
    "Brazier carved stone",
    /* glsl */ `float grain=brazierNoise(vBrazierPosition*19.0);
    diffuseColor.rgb*=.76+grain*.32;
    diffuseColor.rgb*=1.0-smoothstep(1.7,2.35,vBrazierPosition.y)*.25;`,
  );
  stone.color.set(finish.stone);
  const metal = surface(
    new THREE.MeshStandardMaterial({
      color: finish.metal,
      roughness: 0.57,
      metalness: 0.75,
    }),
    "Brazier weathered metal",
    /* glsl */ `float wear=brazierNoise(vBrazierPosition*9.0)*.65+brazierNoise(vBrazierPosition*31.0)*.35;
    float patina=smoothstep(.42,.73,wear)*.74;
    diffuseColor.rgb=mix(diffuseColor.rgb,brazierPatina,patina);
    float soot=smoothstep(2.45,2.76,vBrazierPosition.y)*max(0.0,vBrazierNormal.y);
    diffuseColor.rgb*=1.0-soot*.68;`,
    { brazierPatina: { value: new THREE.Color(finish.patina) } },
  );
  const recess = game.darkMat.clone();
  recess.name = "Brazier carved recesses";
  recess.color.set(finish.stone).multiplyScalar(0.48);
  recess.roughness = 1;
  recess.vertexColors = true;
  const coal = surface(
    new THREE.MeshStandardMaterial({
      color: 0x17100b,
      roughness: 1,
      emissive: 0xff4e09,
      emissiveIntensity: 1.15,
    }),
    "Brazier charcoal fissures",
    /* glsl */ `float fissure=pow(brazierNoise(vBrazierPosition*43.0),8.0);
    diffuseColor.rgb*=.55+brazierNoise(vBrazierPosition*85.0)*.7;`,
  );
  const previous = coal.onBeforeCompile;
  coal.onBeforeCompile = (shader) => {
    previous(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance*=fissure*5.0;",
    );
  };
  return { stone, metal, recess, coal, finish };
}
