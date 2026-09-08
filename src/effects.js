import * as THREE from "three";

export function softParticleMaterial(options) {
  const material = new THREE.PointsMaterial(options);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float radius=length(gl_PointCoord-vec2(0.5))*2.0;
      if(radius>1.0)discard;
      diffuseColor.a*=smoothstep(1.0,0.08,radius);
    `,
    );
  };
  material.customProgramCacheKey = () => "vesper-soft-particles-1";
  return material;
}

export function buildFireEffects(game) {
  game.fireTime = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { time: game.fireTime },
    vertexShader: `varying vec2 vUv; varying float vSeed;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv; vSeed=modelMatrix[3].x*0.23+modelMatrix[3].z*0.17;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying float vSeed;
      #include <common>
      #include <fog_pars_fragment>
      float noise(vec2 p){return sin(p.x*13.0+sin(p.y*7.0))*sin(p.y*11.0+sin(p.x*17.0))*0.5+0.5;}
      void main(){float y=vUv.y; float flow=time*2.5+vSeed;
        float curl=sin(y*9.0-flow)*0.1*y+sin(y*17.0-flow*1.2)*0.04;
        float x=abs(vUv.x-0.5+curl); float width=pow(1.0-y,0.72)*0.42;
        float turbulence=noise(vec2(vUv.x*1.4,y*2.0-time*1.7+vSeed));
        float shape=1.0-smoothstep(width-0.12,width+0.015,x+turbulence*0.055);
        float alpha=shape*smoothstep(0.0,0.12,y)*(1.0-smoothstep(0.77,1.0,y))*0.92;
        float core=(1.0-smoothstep(0.0,0.27,x))*pow(1.0-y,0.6);
        vec3 fire=mix(vec3(2.3,0.29,0.035),vec3(4.8,2.5,0.65),core);
        gl_FragColor=vec4(fire,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  Object.assign(
    material.uniforms,
    THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  );
  for (const flame of game.flames) {
    if (flame.userData.campFire) continue;
    const height = flame.geometry.parameters.height || 1;
    const width =
      (flame.geometry.parameters.radius ||
        flame.geometry.parameters.radiusBottom ||
        0.25) * 3.4;
    flame.geometry.dispose();
    flame.material.dispose();
    flame.geometry = new THREE.PlaneGeometry(width, height);
    flame.material = material;
    flame.castShadow = false;
  }
  game.fireLights = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight(0xffa55c, 0, 15, 2);
    game.world.add(light);
    return light;
  });
}

export function updateFireEffects(game) {
  game.fireTime.value = game.elapsed;
  const visible = [];
  for (const flame of game.flames) {
    if (flame.userData.campFire) {
      const position = flame.getWorldPosition(new THREE.Vector3());
      flame.lookAt(game.camera.position.x, position.y, game.camera.position.z);
    } else flame.lookAt(game.camera.position);
    if (!flame.visible) continue;
    const position = flame.getWorldPosition(new THREE.Vector3());
    const distance = position.distanceTo(game.player.position);
    if (distance < 32) visible.push({ position, distance, flame });
  }
  visible.sort((a, b) => a.distance - b.distance);
  game.fireLights.forEach((light, i) => {
    const source = visible[i];
    light.visible = !!source;
    if (source) {
      light.position.copy(source.position);
      light.distance = source.flame.userData.fireRange ?? 15;
      const time = source.flame.userData.campFire
        ? game.campTime.value
        : game.elapsed;
      light.intensity =
        (source.flame.userData.fireIntensity ?? 14) *
        (1 +
          Math.sin(time * 11 + i * 3) / 7 +
          Math.sin(time * 17 + i) * (1.3 / 14));
    }
  });
}
