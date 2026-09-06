import * as THREE from "three";

const noise = /* glsl */ `
float forgeHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float forgeNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(forgeHash(i),forgeHash(i+vec2(1,0)),f.x),
    mix(forgeHash(i+vec2(0,1)),forgeHash(i+vec2(1,1)),f.x),f.y);
}
float forgeCracks(vec2 p) {
  vec2 cell=floor(p), f=fract(p); float first=9.0, second=9.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 o=vec2(float(x),float(y));
    vec2 q=o+vec2(forgeHash(cell+o),forgeHash(cell+o+vec2(31,17)))-f;
    float d=dot(q,q);
    if(d<first){second=first;first=d;}else second=min(second,d);
  }
  return 1.0-smoothstep(.015,.13,second-first);
}`;

export function moltenMaterial(time, heat, surface = false) {
  const material = new THREE.MeshStandardMaterial({
    name: surface ? "Moving lava crust" : "Recessed furnace heat",
    color: 0x393c3c,
    roughness: 0.94,
    emissive: 0xff5b0a,
  });
  const uniforms = { forgeTime: time, forgeHeat: heat };
  material.userData.forgeUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec2 vForgeUv; ${surface ? "attribute float bedHeight; varying float vLavaDepth;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvForgeUv=uv;
      ${surface ? "vLavaDepth=(modelMatrix*vec4(position,1.0)).y-bedHeight;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float forgeTime,forgeHeat; varying vec2 vForgeUv;
      ${surface ? "varying float vLavaDepth;" : ""}\n${noise}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      ${surface ? "if(vLavaDepth<.008)discard;" : ""}
      vec2 forgeUv=vForgeUv*${surface ? "18.0" : "4.0"};
      vec2 drift=vec2(forgeNoise(forgeUv*.4+forgeTime*.018),forgeNoise(forgeUv*.4-forgeTime*.012));
      float crust=forgeNoise(forgeUv*3.0+drift*.4);
      diffuseColor.rgb*=mix(.35,1.3,crust);
      `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `
      float cracks=forgeCracks(forgeUv+drift*.65);
      float flow=forgeNoise(forgeUv+vec2(forgeTime*.045,-forgeTime*.08));
      float hot=pow(clamp(forgeHeat,0.0,1.0),2.0);
      ${
        surface
          ? "float molten=cracks*(.35+.65*flow);"
          : "float molten=mix(.22,.85,flow)+cracks*.35; molten*=smoothstep(0.0,.12,vForgeUv.y);"
      }
      totalEmissiveRadiance=mix(vec3(1.8,.11,.008),vec3(5.8,1.45,.12),flow)*molten*hot;
      `,
      );
  };
  material.customProgramCacheKey = () => `vesper-forge-molten-${surface}-1`;
  return material;
}

// Soft plumes originate inside the hollow flue or coolant outlet. GPU lifetimes
// avoid allocating new particles and stop with the same paused game clock.
export function forgePlume(time, amount, steam = false, seed = 0) {
  const count = steam ? 14 : 24;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = (i + 0.5) / count;
    values[i * 3 + 1] =
      (((Math.sin((i + seed * 29) * 41.3) * 43758.5) % 1) + 1) % 1;
    values[i * 3 + 2] =
      (((Math.sin((i + seed * 17) * 27.9) * 12345.6) % 1) + 1) % 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(values, 3));
  const material = new THREE.ShaderMaterial({
    name: steam ? "Coolant steam" : "Chimney smoke",
    uniforms: {
      time,
      amount,
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    },
    vertexShader: `uniform float time,amount; varying float vAge,vSeed;
      #include <common>
      #include <fog_pars_vertex>
      void main(){
        float age=fract(position.x+time*${steam ? ".12" : ".05"});
        vAge=age;vSeed=position.y;
        float spread=${steam ? ".3+age*1.8" : ".8+age*4.0"};
        vec3 p=vec3((position.y-.5)*spread+age*age*${steam ? "2.0" : "6.0"},
          age*${steam ? "5.5" : "18.0"},(position.z-.5)*spread);
        vec4 mvPosition=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mvPosition;
        gl_PointSize=clamp((${steam ? ".5+age*2.0" : "1.4+age*5.0"})*460.0/max(1.0,-mvPosition.z),1.0,128.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float amount; varying float vAge,vSeed;
      #include <common>
      #include <fog_pars_fragment>
      ${noise}
      void main(){
        float r=length(gl_PointCoord-.5)*2.0;
        float edge=1.0-smoothstep(.25,1.0,r);
        float breakup=.65+.35*forgeNoise(gl_PointCoord*7.0+vSeed*23.0);
        float alpha=edge*breakup*smoothstep(0.0,.07,vAge)*(1.0-smoothstep(.35,1.0,vAge))*amount*${steam ? ".15" : ".19"};
        if(alpha<.002)discard;
        gl_FragColor=vec4(${steam ? "vec3(.36,.39,.4)" : "vec3(.065,.071,.075)"},alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
