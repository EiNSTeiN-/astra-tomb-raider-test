import * as THREE from "three";
import { random } from "./campaign.js";
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.07+3.1)*.3+noise(p*4.31+7.7)*.15;}`;
function curtainMaterial(time, seed) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time,
      seed: { value: seed },
    },
    vertexShader: `uniform float time;uniform float seed;varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec3 p=position;p.x*=mix(1.07,.94,uv.y);p.z+=(1.0-uv.y)*.18+sin(uv.y*13.0-time*5.0+seed+uv.x*7.0)*.04;
        vec4 mvPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform float seed;varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      ${noise}
      void main(){vec2 p=vUv;float speed=time*1.9+seed;
        float streams=fbm(vec2(p.x*19.0,p.y*2.0+speed));
        float broken=fbm(vec2(p.x*47.0,p.y*8.0+speed*3.2));
        float edge=smoothstep(0.0,.06+streams*.07,p.x)*smoothstep(0.0,.06+streams*.07,1.0-p.x);
        float aerated=smoothstep(.34,.76,streams*.55+broken*.45);
        float foot=pow(1.0-p.y,4.0);
        float alpha=edge*(.16+aerated*.48+foot*.19)*smoothstep(0.0,.025,p.y);
        vec3 color=mix(vec3(.21,.34,.30),vec3(.77,.86,.79),aerated*.75+foot*.25);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return material;
}
function spray(time, seed, mist = false) {
  const count = mist ? 22 : 150,
    rng = random(seed),
    data = new Float32Array(count * 4),
    positions = new Float32Array(count * 3);
  for (let i = 0; i < data.length; i++) data[i] = rng();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(data, 4));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time,
      mist: { value: mist ? 1 : 0 },
    },
    vertexShader: `uniform float time;uniform float mist;attribute vec4 seed;varying float vLife;
      #include <common>
      #include <fog_pars_vertex>
      void main(){float life=fract(time/(.8+seed.z*.8)+seed.w),t=life*(.8+seed.z*.8);vLife=life;
        vec3 p=vec3((seed.x-.5)*4.25+(seed.z-.5)*t*.65,.12+(1.4+seed.y*1.8)*t-2.3*t*t,seed.y*.25+t*(.25+seed.z*.6));
        if(mist>.5)p=vec3((seed.x-.5)*4.0+t*.3,.2+life*(.5+seed.y*.9),seed.z*.7+life*.7);
        vec4 mvPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;
        gl_PointSize=clamp(mix(.035+seed.y*.035,.45+seed.y*.8,mist)*480.0/max(1.0,-mvPosition.z),1.0,64.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float mist;varying float vLife;
      #include <common>
      #include <fog_pars_fragment>
      void main(){float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;
        float alpha=smoothstep(1.0,.12,r)*sin(vLife*3.14159)*mix(.45,.075,mist);
        gl_FragColor=vec4(vec3(.73,.84,.79),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}
export function buildWaterfall(game, index, basin) {
  const site = basin.userData.waterfallSite || basin.userData;
  const x = site.x,
    z = site.z + 0.6,
    y = site.baseY - 0.12,
    group = new THREE.Group(),
    time = { value: 0 };
  game.world.add(group);
  game.box(5.3, 7.1, 1.8, game.stoneMat, x, y + 3.5, z - 4.6);
  game.box(5.8, 0.5, 2.3, game.stoneMat, x, y + 7, z - 4.3);
  game.obstacles.push({
    x,
    z: z - 4.6,
    w: 2.65,
    d: 0.9,
    h: y + 7.1 - game.groundHeight(x, z - 4.6),
  });
  for (const side of [-1, 1]) {
    const px = x + side * 2.8,
      pz = z - 1.5;
    game.box(0.55, 0.75, 6.5, game.stoneMat, px, y + 0.2, pz);
    game.obstacles.push({
      x: px,
      z: pz,
      w: 0.275,
      d: 3.25,
      h: y + 0.575 - game.groundHeight(px, pz),
      climbable: true,
    });
  }
  let curtain;
  const curtains = [],
    sprays = [];
  for (let layer = 0; layer < 2; layer++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 6.9, 18, 32),
      curtainMaterial(time, index * 3 + layer * 9),
    );
    mesh.position.set(x, y + 3.6, z - 3.25 - layer * 0.09);
    group.add(mesh);
    curtain ??= mesh;
    curtains.push(mesh);
  }
  for (const mist of [false, true]) {
    const cloud = spray(
      time,
      game.level.seed + index * 71 + (mist ? 11 : 0),
      mist,
    );
    cloud.position.set(x, basin.position.y, z - 3.08);
    group.add(cloud);
    sprays.push(cloud);
  }
  const u = basin.material.userData.waterUniforms;
  u.impactCenter.value.set(x, z - 3.08);
  u.impactAmount.value = 1;
  game.waterfallEffects ??= [];
  game.waterfallEffects.push({
    group,
    index,
    basin,
    top: y + 7.05,
    curtains,
    sprays,
    time,
    center: new THREE.Vector3(x, y + 3, z - 3.25),
  });
  return { curtain, emitter: { x, y: y + 2, z: z - 3.25 } };
}
export function updateWaterfalls(game) {
  for (const f of game.waterfallEffects || []) {
    f.time.value = game.elapsed;
    const bottom = f.basin.position.y;
    for (const c of f.curtains) {
      c.scale.y = (f.top - bottom) / 6.9;
      c.position.y = (f.top + bottom) / 2;
    }
    for (const p of f.sprays) p.position.y = bottom;
    f.group.visible =
      f.center.distanceTo(game.player.position) <
      (game.store.data.settings.quality === "low" ? 70 : 105);
  }
}
