import * as THREE from "three";
import { cutTerrainGeometry } from "./terrain-cut.js";
import { EXPEDITIONS, fieldComplete } from "./expeditions.js";
import { waterAt } from "./hydrology.js";
import { moltenMaterial } from "./forge-effects.js";
import { updateCoastalWater } from "./coastal-material.js";

const waveCode = `
float waterWave(vec2 p,float t){return sin(p.x*1.7+p.y*.8-t*1.4)*.028+sin(p.x*-.9+p.y*2.3-t*.9)*.017+sin(p.x*4.7+p.y*3.1+t*.8)*.006;}
vec2 waterSlope(vec2 p,float t){return vec2(1.7,.8)*cos(p.x*1.7+p.y*.8-t*1.4)*.028+vec2(-.9,2.3)*cos(p.x*-.9+p.y*2.3-t*.9)*.017+vec2(4.7,3.1)*cos(p.x*4.7+p.y*3.1+t*.8)*.006;}
`;
const common = `uniform float waterTime; uniform float waveScale; varying vec3 vWaterWorld; varying float vWaterBed;
${waveCode}`;

export function waterMaterial(game, site) {
  const ice = site.kind === "ice";
  const material = new THREE.MeshPhysicalMaterial({
    color: ice ? 0xa7c7ce : game.level.water,
    roughness: ice ? 0.27 : 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    ior: 1.333,
    reflectivity: 0.35,
    clearcoat: ice ? 0.45 : 0,
    side:
      !ice && game.level.biome === "water" ? THREE.DoubleSide : THREE.FrontSide,
    forceSinglePass: true,
  });
  const uniforms = {
    waterTime: { value: 0 },
    waveScale: { value: ice ? 0 : 1 },
    waterMirror: { value: null },
    waterMirrorMatrix: { value: new THREE.Matrix4() },
    mirrorWeight: { value: 0 },
    impactCenter: { value: new THREE.Vector2(1e5, 1e5) },
    impactAmount: { value: 0 },
    impactHalfWidth: { value: 0 },
    waterSky: { value: new THREE.Color(game.level.sky) },
    splashCenter: { value: new THREE.Vector3(1e5, 0, 1e5) },
    splashTime: { value: -100 },
    poolSize: { value: new THREE.Vector2(site.width, site.length) },
    poolCenter: { value: new THREE.Vector2(site.x, site.z) },
  };
  material.userData.waterUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${common}\nattribute float bedHeight;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec3 waterPoint=(modelMatrix*vec4(position,1.0)).xyz;
      transformed.z+=waterWave(waterPoint.xz,waterTime)*waveScale;
      vWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vWaterBed=bedHeight;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${common}
      uniform sampler2D waterMirror;uniform mat4 waterMirrorMatrix;uniform float mirrorWeight;uniform vec3 waterSky;uniform vec3 splashCenter;uniform float splashTime;uniform vec2 poolSize;uniform vec2 poolCenter;uniform vec2 impactCenter;uniform float impactAmount;uniform float impactHalfWidth;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
      vec2 slope=waterSlope(vWaterWorld.xz,waterTime)*waveScale;
      float age=waterTime-splashTime;float radius=length(vWaterWorld.xz-splashCenter.xz);
      float ring=sin(radius*16.0-age*13.0)*exp(-pow((radius-age*1.8)*2.5,2.0))*exp(-age*.85)*step(0.0,age);
      slope+=normalize(vWaterWorld.xz-splashCenter.xz+vec2(.0001))*ring*.12;
      vec2 impactDelta=vWaterWorld.xz-impactCenter;impactDelta.x-=clamp(impactDelta.x,-impactHalfWidth,impactHalfWidth);float impactRadius=length(impactDelta);
      slope+=normalize(impactDelta+vec2(.0001))*sin(impactRadius*10.0-waterTime*6.0)*exp(-impactRadius*.65)*impactAmount*.045;
      normal=normalize(mat3(viewMatrix)*vec3(-slope.x,1.0,-slope.y));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float waterDepth=max(0.0,vWaterWorld.y-vWaterBed);
      if(waterDepth<.006)discard;
      float deep=1.0-exp(-waterDepth*.7);
      diffuseColor.rgb=mix(diffuseColor.rgb*1.45,diffuseColor.rgb*.4,deep);
      float shore=1.0-smoothstep(.025,.32,waterDepth);
      float foam=shore*(.35+.65*pow(.5+.5*sin(vWaterWorld.x*8.0+vWaterWorld.z*6.0-waterTime*2.0),3.0))*waveScale;
      vec2 foamDelta=vWaterWorld.xz-impactCenter;foamDelta.x-=clamp(foamDelta.x,-impactHalfWidth,impactHalfWidth);
      foam+=exp(-length(foamDelta)*1.3)*impactAmount*.5;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.7,.78,.72),foam*.6);
      diffuseColor.a=smoothstep(.005,.075,waterDepth)*mix(.34,.91,deep)+foam*.15;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      vec3 waterN=normalize(vec3(-slope.x,1.0,-slope.y))*(gl_FrontFacing?1.0:-1.0);
      vec3 waterV=normalize(cameraPosition-vWaterWorld);
      float fresnel=.025+.62*pow(1.0-max(0.0,dot(waterN,waterV)),5.0);
      vec4 mirrorUv=waterMirrorMatrix*vec4(vWaterWorld,1.0);
      vec2 reflectedUv=mirrorUv.xy/max(.0001,mirrorUv.w)+slope*.014;
      vec2 mirrorEdge=min(reflectedUv,1.0-reflectedUv);
      float inside=smoothstep(.001,.035,min(mirrorEdge.x,mirrorEdge.y))*step(.0001,mirrorUv.w);
      vec3 reflected=mix(waterSky*.58,texture2D(waterMirror,clamp(reflectedUv,.001,.999)).rgb,mirrorWeight*inside);
      outgoingLight=mix(outgoingLight,reflected,fresnel);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `vesper-water-2-${ice}`;
  return material;
}

export function createWaterSurface(game, site) {
  const segments = Math.min(
    48,
    Math.max(12, Math.ceil(Math.max(site.width, site.length) / 0.55)),
  );
  const geometry = new THREE.PlaneGeometry(
      site.width,
      site.length,
      segments,
      segments,
    ),
    p = geometry.attributes.position,
    bed = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++)
    bed[i] =
      site.kind === "ice" || site.sea
        ? site.baseY - (site.sea ? 15 : 0.2)
        : game.groundHeight(site.x + p.getX(i), site.z - p.getY(i));
  geometry.setAttribute("bedHeight", new THREE.BufferAttribute(bed, 1));
  let material;
  if (site.kind === "lava")
    material = moltenMaterial({ value: game.elapsed || 0 }, { value: 1 }, true);
  else material = waterMaterial(game, site);
  let surfaceGeometry = geometry;
  if (site.sea && game.terrainProfile.gallery) {
    const world = geometry
      .clone()
      .rotateX(-Math.PI / 2)
      .translate(site.x, site.baseY, site.z);
    const cut = cutTerrainGeometry(world, game.terrainProfile.gallery.volumes);
    surfaceGeometry = cut
      .translate(-site.x, -site.baseY, -site.z)
      .rotateX(Math.PI / 2);
    if (cut !== world) world.dispose();
    geometry.dispose();
  }
  const mesh = new THREE.Mesh(surfaceGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(site.x, site.baseY, site.z);
  mesh.receiveShadow = true;
  Object.assign(mesh.userData, { ...site, baseY: site.baseY, animated: true });
  game.world.add(mesh);
  game.waterMeshes.push(mesh);
  return mesh;
}
export function buildWaterSurfaces(game) {
  for (const site of game.terrainProfile.waters.filter(
    (s) => s.fall === undefined,
  ))
    createWaterSurface(game, site);
  for (const site of game.terrainProfile.waters.filter(
    (s) => s.fall !== undefined,
  )) {
    const covering = game.waterMeshes.find(
      (w) =>
        w.userData.kind === "water" &&
        Math.abs(w.position.y - site.baseY) < 0.01 &&
        Math.abs(w.position.x - site.x) + site.width / 2 <=
          w.userData.width / 2 &&
        Math.abs(w.position.z - site.z) + site.length / 2 <=
          w.userData.length / 2,
    );
    const water = covering || createWaterSurface(game, site);
    water.userData.waterfallSite = site;
    water.userData.fall = site.fall;
  }
  if (["water", "sky"].includes(game.level.biome)) {
    const extent = game.map.size * 7;
    createWaterSurface(game, {
      id: "sea",
      kind: "water",
      x: extent / 2,
      z: extent / 2,
      width: extent * 3,
      length: extent * 3,
      baseY: game.level.biome === "sky" ? -20 : -2.3,
      depth: 15,
      sea: true,
    });
  }
}
export function updateWaterSurfaces(game, dt) {
  for (const water of game.waterMeshes) {
    const data = water.userData,
      restored =
        data.stage !== undefined &&
        fieldComplete(game.level, game.progress, data.stage);
    const target = game.level.biome === "water" && restored ? 1.8 : 0;
    data.drain =
      (data.drain || 0) + (target - (data.drain || 0)) * Math.min(1, dt * 0.4);
    water.position.y = data.baseY - data.drain;
    const u = water.material.userData.waterUniforms;
    if (u) u.waterTime.value = game.elapsed;
    if (data.kind === "lava") {
      data.cooled =
        restored &&
        EXPEDITIONS[game.level.id][data.stage]?.tasks.some(
          (t) => t.kind === "valve",
        );
      const forge = water.material.userData.forgeUniforms;
      if (forge) {
        forge.forgeTime.value = game.elapsed;
        forge.forgeHeat.value +=
          ((data.cooled ? 0 : 1) - forge.forgeHeat.value) *
          Math.min(1, dt * 0.6);
      } else {
        water.material.emissiveIntensity +=
          ((data.cooled ? 0.03 : 0.6) - water.material.emissiveIntensity) *
          Math.min(1, dt * 0.6);
        water.material.color.lerp(
          new THREE.Color(data.cooled ? 0x383b3b : game.level.water),
          Math.min(1, dt * 0.6),
        );
      }
    }
  }
  updateCoastalWater(game);
}
export function waterSplash(game, position, strength = 1) {
  const sample = waterAt(game, position.x, position.z, position.y);
  if (!sample) return;
  const u = sample.water?.material.userData.waterUniforms;
  if (u) {
    u.splashCenter.value.copy(position);
    u.splashTime.value = game.elapsed;
  }
  game.audio.noiseHit?.(0.014 * strength, 0.25, 1300, position);
}
