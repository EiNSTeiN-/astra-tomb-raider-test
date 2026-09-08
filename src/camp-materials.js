import * as THREE from "three";
import { pbrMaterial } from "./visuals.js";

export const CAMP_FABRIC = Object.freeze({
  jungle: 0x666447,
  desert: 0x9c7952,
  snow: 0xa17348,
  water: 0x526c68,
  volcano: 0x79584c,
  sky: 0x5c6379,
  crystal: 0x796775,
  eclipse: 0x535e73,
});
const noise = /* glsl */ `
float campHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float campNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(campHash(i),campHash(i+vec2(1,0)),f.x),mix(campHash(i+vec2(0,1)),campHash(i+vec2(1)),f.x),f.y);}
`;
function detail(material, name, fragment) {
  material.name = name;
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCampUv;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCampUv=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vCampUv;\n" + noise,
      )
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" + fragment,
      );
  };
  material.customProgramCacheKey = () => name;
  return material;
}
export function campMaterials(biome, textured = pbrMaterial) {
  const plain = (color, roughness = 0.9, metalness = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      vertexColors: true,
    });
  const wood = detail(
    textured("monastery-wood", 0xb0a08a, 0.8),
    "Camp weathered wood",
    /* glsl */ `
    float worn=campNoise(vCampUv*vec2(38,5)); diffuseColor.rgb*=.68+.32*worn;`,
  );
  const bark = detail(
    textured("bark", 0x8b7b65, 1),
    "Camp charred bark",
    /* glsl */ `
    float charred=1.0-smoothstep(.08,.42,abs(vCampUv.y-.5));
    float crack=pow(campNoise(vCampUv*vec2(65,16)),6.0);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.018)+crack*.15,charred*.96);`,
  );
  const grain = detail(
    plain(0x9a754c),
    "Camp cut timber grain",
    /* glsl */ `
    vec2 p=vCampUv-.5; float r=length(p);float rings=.5+.5*sin(r*110.0+campNoise(p*17.0)*3.0);
    float split=pow(.5+.5*sin(atan(p.y,p.x)*7.0+r*8.0),38.0)*smoothstep(.12,.48,r);
    diffuseColor.rgb*=(.55+.32*rings)*(1.0-split*.85);`,
  );
  const cloth = detail(
    plain(CAMP_FABRIC[biome]),
    "Camp woven canvas",
    /* glsl */ `
    float weave=sin(vCampUv.x*460.0)*sin(vCampUv.y*460.0);
    float aa=1.0-smoothstep(.015,.04,max(length(dFdx(vCampUv)),length(dFdy(vCampUv))));
    float wear=campNoise(vCampUv*vec2(23,11));
    diffuseColor.rgb*=.7+.28*wear+.055*weave*aa;`,
  );
  const stone = detail(
    textured("rock", biome === "desert" ? 0xa7957e : 0x8d9290, 1),
    "Camp hearth stones",
    /* glsl */ `
    diffuseColor.rgb*=.67+.33*campNoise(vCampUv*18.0);`,
  );
  const coal = detail(
    plain(0x1b1816),
    "Camp charcoal",
    /* glsl */ `
    float cracks=pow(campNoise(vCampUv*17.0),9.0);
    diffuseColor.rgb*=.4+campNoise(vCampUv*31.0);`,
  );
  coal.emissive.set(0xff4008);
  coal.emissiveIntensity = 0.7;
  const previous = coal.onBeforeCompile;
  coal.onBeforeCompile = (shader) => {
    previous(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance*=cracks*3.0;",
    );
  };
  const metal = plain(0x535953, 0.5, 0.7);
  metal.name = "Camp iron fittings";
  const brass = plain(0xa58953, 0.46, 0.6);
  brass.name = "Camp brass buckles";
  const leather = plain(0x483629, 0.88);
  leather.name = "Camp leather straps";
  const seam = plain(0xb7a990, 1);
  seam.name = "Camp stitching and rope";
  return { wood, bark, grain, cloth, stone, coal, metal, brass, leather, seam };
}
