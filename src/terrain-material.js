import {
  meridianDeclarations,
  meridianColor,
  meridianNormal,
  meridianRoughness,
} from "./meridian-terrain-material.js";
import {
  volcanicDeclarations,
  volcanicColor,
  volcanicNormal,
  volcanicRoughness,
} from "./volcanic-material.js";
import {
  desertTerrainDeclarations,
  desertTerrainColor,
  desertTerrainNormal,
  desertTerrainRoughness,
} from "./desert-terrain-material.js";
import * as THREE from "three";
import {
  coastalDeclarations,
  coastalCliffCoordinates,
  coastalColor,
  coastalAlbedo,
  coastalNormal,
  coastalUniforms,
} from "./coastal-material.js";
import {
  skyTerrainDeclarations,
  skyCliffCoordinates,
  skyTerrainColor,
  skyTerrainAlbedo,
  skyTerrainNormal,
  skyGroundNormal,
  skyTerrainRoughness,
} from "./sky-terrain-material.js";

const declarations = /* glsl */ `
uniform sampler2D pavingMap, pavingNormal, pavingRoughness;
uniform sampler2D cliffMap, cliffNormal, cliffRoughness;
uniform vec3 cliffTint;
uniform float courtStrength;
#ifdef TERRAIN_JUNGLE
uniform sampler2D pavingHeight, trackMap, trackNormal, verdureMap, verdureNormal;
#endif
varying float vCourt, vTrail;
varying vec3 vTerrainPosition, vTerrainNormal;

float terrainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float terrainNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(terrainHash(cell), terrainHash(cell + vec2(1, 0)), f.x),
    mix(terrainHash(cell + vec2(0, 1)), terrainHash(cell + vec2(1, 1)), f.x), f.y);
}
${coastalDeclarations}
${skyTerrainDeclarations}
${desertTerrainDeclarations}
${volcanicDeclarations}
${meridianDeclarations}
`;

const colorLayer = /* glsl */ `
vec2 earthUv = vTerrainPosition.xz / 4.0;
vec2 rotatedEarthUv = mat2(.8, .6, -.6, .8) * earthUv + vec2(.37, .61);
vec2 pavingUv = vTerrainPosition.xz / 5.0;
vec2 cliffUvX = vTerrainPosition.zy / 5.0;
vec2 cliffUvY = vTerrainPosition.xz / 5.0;
vec2 cliffUvZ = vTerrainPosition.xy / 5.0;
${skyCliffCoordinates}
${coastalCliffCoordinates}
float terrainMacro = terrainNoise(vTerrainPosition.xz * .065);
float earthBlend = smoothstep(.2, .8, terrainMacro) * .65;
vec3 earthColor = mix(texture2D(map, earthUv).rgb,
  texture2D(map, rotatedEarthUv).rgb, earthBlend);
vec3 pavingColor = texture2D(pavingMap, pavingUv).rgb;
vec3 terrainWeights = pow(abs(normalize(vTerrainNormal)), vec3(4.0));
terrainWeights /= max(.0001, terrainWeights.x + terrainWeights.y + terrainWeights.z);
vec3 cliffColor = texture2D(cliffMap, cliffUvX).rgb * terrainWeights.x
  + texture2D(cliffMap, cliffUvY).rgb * terrainWeights.y
  + texture2D(cliffMap, cliffUvZ).rgb * terrainWeights.z;
float terrainSlope = 1.0 - smoothstep(.48, .85, abs(vTerrainNormal.y));
float pavingWeight = vCourt * courtStrength;
float trailWeight = 0.0;
float terrainDamp = 0.0;
float growthWeight = 0.0;
#ifdef TERRAIN_JUNGLE
  vec2 trackUv = vTerrainPosition.xz / 3.0;
  vec2 verdureUv = vTerrainPosition.xz / 2.5;
  float stoneHeight = texture2D(pavingHeight, pavingUv).r;
  float erosion = terrainNoise(vTerrainPosition.xz * .24 + vec2(19, 7));
  float coverage = clamp(vCourt - smoothstep(.56, .85, erosion) * .3, 0.0, 1.0);
  // Raised stone survives the transition while soil and moss enter its joints.
  pavingWeight = smoothstep(.12, .32, coverage + stoneHeight * .42 - .42);
  trailWeight = smoothstep(.08, .95, vTrail) * .86;
  earthColor *= vec3(.72, .81, .69);
  earthColor = mix(earthColor, texture2D(trackMap, trackUv).rgb * vec3(.72, .78, .7), trailWeight);
  terrainDamp = smoothstep(.34, .74, terrainNoise(vTerrainPosition.xz * .11 + vec2(31, 17)))
    * (.55 + .45 * terrainMacro) * (1.0 - terrainSlope * .8);
  float groundGrowth = smoothstep(.32, .7, terrainNoise(vTerrainPosition.xz * .16 + vec2(7, 43)))
    * .8 * (1.0 - trailWeight) * (1.0 - pavingWeight);
  float jointGrowth = (1.0 - smoothstep(.2, .5, stoneHeight)) * .7 * pavingWeight;
  growthWeight = max(groundGrowth, jointGrowth) * smoothstep(.35, .82, vTerrainNormal.y);
  vec3 mossSample = texture2D(verdureMap, verdureUv).rgb;
  // Retain leaf litter between individual moss fronds, not only between patches.
  growthWeight *= mix(.12, 1.0, smoothstep(.004, .05, mossSample.g - mossSample.r));
#endif
${coastalColor}
${skyTerrainColor}
${desertTerrainColor}
${volcanicColor}
${meridianColor}
vec3 terrainAlbedo = mix(earthColor, pavingColor, pavingWeight);
terrainAlbedo = mix(terrainAlbedo, cliffColor * cliffTint, terrainSlope);
#ifdef TERRAIN_JUNGLE
  terrainAlbedo = mix(terrainAlbedo,
    mossSample * vec3(.42, .61, .57), growthWeight);
  terrainAlbedo *= mix(1.0, .73, terrainDamp);
#endif
${coastalAlbedo}
${skyTerrainAlbedo}
diffuseColor.rgb *= terrainAlbedo * mix(.87, 1.04, terrainNoise(vTerrainPosition.xz * .013));
`;

const roughnessLayer = /* glsl */ `
float terrainRough = mix(texture2D(roughnessMap, earthUv).g,
  texture2D(roughnessMap, rotatedEarthUv).g, earthBlend);
// Compacted soil and soft moss use restrained, fixed matte responses.
terrainRough = mix(terrainRough, .92, trailWeight);
terrainRough = mix(terrainRough, texture2D(pavingRoughness, pavingUv).g, pavingWeight);
#ifdef TERRAIN_COASTAL
terrainRough=mix(terrainRough,mix(texture2D(coastalSlabRoughness,vTerrainPosition.xz/2.7).g,
  .94,slab.x),pavingWeight*(1.0-ornament));
#endif
float rockRough = texture2D(cliffRoughness, cliffUvX).g * terrainWeights.x
  + texture2D(cliffRoughness, cliffUvY).g * terrainWeights.y
  + texture2D(cliffRoughness, cliffUvZ).g * terrainWeights.z;
${skyTerrainRoughness}
${desertTerrainRoughness}
${volcanicRoughness}
${meridianRoughness}
terrainRough = mix(terrainRough, rockRough, terrainSlope);
terrainRough = mix(terrainRough, .97, growthWeight);
terrainRough = mix(terrainRough, .48, terrainDamp * .5 * (1.0 - growthWeight));
float roughnessFactor = roughness * clamp(terrainRough, .42, 1.0);
`;

const normalHelper = /* glsl */ `
vec3 terrainSurfaceNormal(vec3 sampleNormal, vec2 uv, vec3 baseNormal, float strength) {
  vec3 detail = sampleNormal * 2.0 - 1.0;
  detail.xy *= strength;
  return normalize(getTangentFrame(-vViewPosition, baseNormal, uv) * detail);
}
`;

const normalLayer = /* glsl */ `
vec3 earthN = normalize(mix(
  terrainSurfaceNormal(texture2D(normalMap, earthUv).xyz, earthUv, normal, .8),
  terrainSurfaceNormal(texture2D(normalMap, rotatedEarthUv).xyz, rotatedEarthUv, normal, .8), earthBlend));
#ifdef TERRAIN_JUNGLE
  earthN = normalize(mix(earthN,
    terrainSurfaceNormal(texture2D(trackNormal, trackUv).xyz, trackUv, normal, .65), trailWeight));
#endif
vec3 pavingN = terrainSurfaceNormal(texture2D(pavingNormal, pavingUv).xyz, pavingUv, normal, 1.0);
vec3 cliffN = normalize(
  terrainSurfaceNormal(texture2D(cliffNormal, cliffUvX).xyz, cliffUvX, normal, .9) * terrainWeights.x
  + terrainSurfaceNormal(texture2D(cliffNormal, cliffUvY).xyz, cliffUvY, normal, .9) * terrainWeights.y
  + terrainSurfaceNormal(texture2D(cliffNormal, cliffUvZ).xyz, cliffUvZ, normal, .9) * terrainWeights.z);
${coastalNormal}
${skyTerrainNormal}
${desertTerrainNormal}
${volcanicNormal}
${meridianNormal}
vec3 terrainN = normalize(mix(earthN, pavingN, pavingWeight));
terrainN = normalize(mix(terrainN, cliffN, terrainSlope));
#ifdef TERRAIN_JUNGLE
  terrainN = normalize(mix(terrainN,
    terrainSurfaceNormal(texture2D(verdureNormal, verdureUv).xyz, verdureUv, normal, .38), growthWeight));
#endif
${skyGroundNormal}
normal = terrainN;
`;

export function terrainMaterial(game) {
  const biome = game.level.biome;
  const natural =
    {
      jungle: "forest",
      sky: "ground",
      desert: "desert-sand",
      snow: "snow",
      water: "sand",
      volcano: "forge-rock",
      crystal: "rock",
      eclipse: "rock",
    }[biome] || "ground";
  const loader = new THREE.TextureLoader(game.assetBatch?.manager);
  const pending = [],
    textures = [];
  const load = (name, suffix) => {
    let texture;
    pending.push(
      new Promise((resolve, reject) => {
        texture = loader.load(
          `/assets/textures/${name}-${suffix}.jpg`,
          resolve,
          undefined,
          reject,
        );
      }),
    );
    texture.colorSpace =
      suffix === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    textures.push(texture);
    return texture;
  };
  const material = new THREE.MeshStandardMaterial({
    name: "Layered terrain",
    color: 0xffffff,
    roughness: 1,
    map: load(natural, "color"),
    normalMap: load(natural, "normal"),
    roughnessMap: load(natural, "roughness"),
  });
  const paving =
    biome === "jungle"
      ? "moss"
      : biome === "desert"
        ? "sandstone-wall"
        : biome === "water"
          ? "palace-mosaic"
          : biome === "volcano"
            ? "forge-paving"
            : "stone";
  const cliff =
    biome === "desert"
      ? "sandstone"
      : ["volcano", "sky"].includes(biome)
        ? "forge-rock"
        : "rock";
  const uniforms = {
    pavingMap: { value: load(paving, "color") },
    pavingNormal: { value: load(paving, "normal") },
    pavingRoughness: { value: load(paving, "roughness") },
    cliffMap: { value: load(cliff, "color") },
    cliffNormal: { value: load(cliff, "normal") },
    cliffRoughness: { value: load(cliff, "roughness") },
    cliffTint: {
      value: new THREE.Color(
        {
          jungle: 0x819279,
          desert: 0xe0bd82,
          snow: 0xd4e1e7,
          water: 0xa8b9b0,
          volcano: 0xadb4be,
          sky: 0xe0e4df,
          crystal: 0x737386,
          eclipse: 0x9d9991,
        }[biome],
      ),
    },
    courtStrength: {
      value:
        biome === "crystal"
          ? 0.38
          : biome === "volcano"
            ? 0.93
            : biome === "desert"
              ? 0.55
              : 0.86,
    },
  };
  if (biome === "desert") material.defines = { TERRAIN_DESERT: 1 };
  if (biome === "eclipse") material.defines = { TERRAIN_MERIDIAN: 1 };
  if (biome === "volcano") material.defines = { TERRAIN_FORGE: 1 };
  if (biome === "sky") {
    material.defines = { TERRAIN_SKY: 1 };
    Object.assign(uniforms, {
      skyMossMap: { value: load("verdure", "color") },
      skyMossNormal: { value: load("verdure", "normal") },
    });
  }
  if (biome === "water") {
    material.defines = { TERRAIN_COASTAL: 1 };
    Object.assign(uniforms, coastalUniforms(game), {
      coastalSlabMap: { value: load("palace-stone", "color") },
      coastalSlabNormal: { value: load("palace-stone", "normal") },
      coastalSlabRoughness: { value: load("palace-stone", "roughness") },
    });
  }
  if (biome === "jungle") {
    material.defines = { TERRAIN_JUNGLE: 1 };
    Object.assign(uniforms, {
      pavingHeight: { value: load("moss", "height") },
      trackMap: { value: load("ground", "color") },
      trackNormal: { value: load("ground", "normal") },
      verdureMap: { value: load("verdure", "color") },
      verdureNormal: { value: load("verdure", "normal") },
    });
  }
  material.userData.additionalTextures = textures.slice(3);
  material.userData.terrainUniforms = uniforms;
  game.terrainTexturesReady = Promise.all(pending);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float court, trail; varying float vCourt, vTrail; varying vec3 vTerrainPosition, vTerrainNormal;\n#ifdef TERRAIN_COASTAL\nattribute vec3 coast; varying vec3 vCoastal;\n#endif\n#ifdef TERRAIN_DESERT\nattribute float desertRock; varying float vDesertRock;\n#endif\n#ifdef TERRAIN_MERIDIAN\nattribute float meridianRock; varying float vMeridianRock;\n#endif\n#ifdef TERRAIN_SKY\nattribute float skyDepth; varying float vSkyDepth;\n#endif",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvCourt=court; vTrail=trail; vTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz; vTerrainNormal=normalize(mat3(modelMatrix)*normal);\n#ifdef TERRAIN_COASTAL\nvCoastal=coast;\n#endif\n#ifdef TERRAIN_DESERT\nvDesertRock=desertRock;\n#endif\n#ifdef TERRAIN_MERIDIAN\nvMeridianRock=meridianRock;\n#endif\n#ifdef TERRAIN_SKY\nvSkyDepth=skyDepth;\n#endif",
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + declarations)
      .replace("#include <map_fragment>", colorLayer)
      .replace("#include <roughnessmap_fragment>", roughnessLayer)
      .replace(
        "#include <normalmap_pars_fragment>",
        "#include <normalmap_pars_fragment>\n" + normalHelper,
      )
      .replace("#include <normal_fragment_maps>", normalLayer);
  };
  material.customProgramCacheKey = () =>
    `vesper-terrain-${biome}-${["desert", "water", "volcano", "eclipse"].includes(biome) ? 8 : 7}`;
  return material;
}
