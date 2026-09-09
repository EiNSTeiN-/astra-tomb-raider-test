import * as THREE from "three";
import { random } from "./campaign.js";
import { buildSpillwayArt } from "./spillway-art.js";
import {
  curtainMaterial,
  impactMaterial,
  flumeMaterial,
  waterfallNoise,
} from "./waterfall-material.js";

function spray(time, seed, mist = false) {
  const count = mist ? 24 : 192,
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
      pixelHeight: { value: 800 },
    },
    vertexShader: `uniform float time;uniform float mist;uniform float pixelHeight;attribute vec4 seed;varying float vLife;
      #include <common>
      #include <fog_pars_vertex>
      void main(){float velocity=1.8+seed.y*2.4;float duration=2.*velocity/9.81;
        float life=fract(time/duration+seed.w),t=life*duration;vLife=life;
        vec3 p=vec3((seed.x-.5)*4.5+(seed.x-.5)*t*.8,.035+velocity*t-4.905*t*t,seed.z*.2+t*(.35+seed.z*.55));
        if(mist>.5){life=fract(time/(2.3+seed.z)+seed.w);vLife=life;
          p=vec3((seed.x-.5)*4.6+life*.2,.08+life*(.3+seed.y*.6),seed.z*.2+life*.4);}
        vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
        float diameter=mix(.025+seed.y*.03,.35+seed.y*.6,mist);
        gl_PointSize=clamp(diameter*pixelHeight*.5*projectionMatrix[1][1]/max(1.,-mvPosition.z),1.,64.);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float mist;varying float vLife;
      #include <common>
      #include <fog_pars_fragment>
      ${waterfallNoise}
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
        float grain=fallNoise(gl_PointCoord*7.+vLife*2.);
        float alpha=(1.-smoothstep(.05,1.,r))*sin(vLife*3.14159)*mix(.42,.085,mist);
        alpha*=mix(1.,.55+grain*.65,mist);
        gl_FragColor=vec4(vec3(.68,.8,.74),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material),
    viewport = new THREE.Vector4();
  points.frustumCulled = false;
  points.onBeforeRender = (renderer) => {
    // Reflections render into a smaller target than the main canvas.
    renderer.getCurrentViewport(viewport);
    material.uniforms.pixelHeight.value = viewport.w;
  };
  return points;
}

export function buildWaterfall(game, index, basin) {
  const site = basin.userData.waterfallSite || basin.userData,
    x = site.x,
    z = site.z + 0.6,
    y = site.baseY - 0.12,
    group = new THREE.Group(),
    time = { value: 0 },
    height = { value: 6.9 };
  group.name = "Waterfall flow and spray";
  game.world.add(group);
  // Preserve the existing navigation and pre-batching camera bounds. The new
  // masonry replaces their visible geometry, including an open overflow top.
  const collider = (w, h, d, px, py, pz) => {
    const proxy = game.box(w, h, d, game.stoneMat, px, py, pz);
    proxy.removeFromParent();
    proxy.geometry.dispose();
  };
  collider(5.3, 7.1, 1.8, x, y + 3.5, z - 4.6);
  collider(5.8, 0.5, 2.3, x, y + 7, z - 4.3);
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
    collider(0.55, 0.75, 6.5, px, y + 0.2, pz);
    game.obstacles.push({
      x: px,
      z: pz,
      w: 0.275,
      d: 3.25,
      h: y + 0.575 - game.groundHeight(px, pz),
      climbable: true,
    });
  }
  const art = buildSpillwayArt(game, index, x, y, z);
  const flume = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.03),
    flumeMaterial(time, game.level),
  );
  flume.rotation.x = -Math.PI / 2;
  flume.position.set(x, y + 7.05, z - 4.165);
  flume.receiveShadow = true;
  group.add(flume);
  let curtain;
  const curtains = [],
    sprays = [];
  for (let layer = 0; layer < 2; layer++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 6.9, 18, 32),
      curtainMaterial(time, height, index * 3 + layer * 9, game.level),
    );
    mesh.position.set(x, y + 3.6, z - 3.25 - layer * 0.06);
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
  const impact = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.4),
    impactMaterial(time, game.level),
  );
  impact.rotation.x = -Math.PI / 2;
  impact.position.set(x, basin.position.y + 0.035, z - 3.08);
  group.add(impact);
  const u = basin.material.userData.waterUniforms;
  u.impactCenter.value.set(x, z - 3.08);
  u.impactAmount.value = 1;
  u.impactHalfWidth.value = 2.15;
  game.waterfallEffects ??= [];
  game.waterfallEffects.push({
    group,
    index,
    basin,
    top: y + 7.05,
    curtains,
    sprays,
    impact,
    flume,
    art,
    time,
    height,
    center: new THREE.Vector3(x, y + 3, z - 3.25),
  });
  return { curtain, emitter: { x, y: y + 2, z: z - 3.25 } };
}

export function updateWaterfalls(game) {
  for (const f of game.waterfallEffects || []) {
    f.time.value = game.elapsed;
    const bottom = f.basin.position.y;
    f.height.value = f.top - bottom;
    for (const c of f.curtains) {
      c.scale.y = f.height.value / 6.9;
      c.position.y = (f.top + bottom) / 2;
    }
    for (const p of f.sprays) p.position.y = bottom;
    f.impact.position.y = bottom + 0.035;
    f.group.visible =
      f.center.distanceTo(game.player.position) <
      (game.store.data.settings.quality === "low" ? 70 : 105);
  }
}
