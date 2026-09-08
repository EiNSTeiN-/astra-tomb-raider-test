import * as THREE from "three";

const noise = /* glsl */ `
float fireHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fireNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fireHash(i),fireHash(i+vec2(1,0)),f.x),mix(fireHash(i+vec2(0,1)),fireHash(i+vec2(1)),f.x),f.y);}
float fireFbm(vec2 p){return fireNoise(p)*.57+fireNoise(p*2.03+17.0)*.28+fireNoise(p*4.11-9.0)*.15;}
`;
const output = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
`;
function material(options) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    ...options,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...options.uniforms,
    },
  });
}
export function campEffectsMaterials(time) {
  const fire = material({
    name: "Camp turbulent flame",
    side: THREE.DoubleSide,
    uniforms: { time },
    vertexShader: /* glsl */ `varying vec2 vUv;varying float seed;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;seed=modelMatrix[3].x*.17+modelMatrix[3].z*.23;
        vec4 mvPosition=modelViewMatrix*vec4(position,1);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float time;varying vec2 vUv;varying float seed;
      #include <common>
      #include <fog_pars_fragment>
      ${noise}
      void main(){vec2 p=vec2((vUv.x-.5)*2.0,vUv.y);float t=time+seed;
        float flow=fireFbm(vec2(p.x*4.5,p.y*4.0-t*2.9));
        float curl=(fireFbm(vec2(p.y*3.0-t*.8,t*.12))-.5)*p.y*.5;
        float x=p.x+curl;
        float tongues=.12*sin(x*19.0+t*2.0)+.08*sin(x*31.0-t*3.5);
        float envelope=1.0-abs(x)*1.32-p.y+(flow-.5)*.54+tongues*p.y;
        float edge=max(fwidth(envelope)*1.2,.024);
        float density=smoothstep(-edge,.12,envelope)*smoothstep(0.0,.13,p.y);
        density*=1.0-smoothstep(.87,1.0,p.y);
        float core=clamp(envelope*.95+(1.0-p.y)*.3,0.0,1.0);
        vec3 color=mix(vec3(1.8,.075,.006),vec3(3.3,.85,.065),smoothstep(.08,.58,core));
        color=mix(color,vec3(4.0,2.5,.85),smoothstep(.6,.97,core));
        gl_FragColor=vec4(color,density*.88);
        ${output}
      }`,
  });
  const pixelScale = { value: 700 };
  const particle = (smoke) =>
    material({
      name: smoke ? "Camp drifting smoke" : "Camp rising sparks",
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { time, pixelScale },
      defines: smoke ? { CAMP_SMOKE: 1 } : {},
      vertexShader: /* glsl */ `uniform float time,pixelScale;attribute vec4 cycle;varying float life,seed;
      #include <common>
      #include <fog_pars_vertex>
      void main(){seed=cycle.y;life=fract(time/cycle.x+cycle.y);vec3 p=position;
        #ifdef CAMP_SMOKE
          p.y+=life*2.7;p.x+=life*life*.55+sin(life*5.0+seed*23.0)*life*.2;
          p.z+=sin(life*4.0+seed*41.0)*life*.22;float size=.24+life*.66;
        #else
          p.y+=life*(1.3+cycle.z);p.x+=sin(life*8.0+seed*43.0)*life*.15;
          p.z+=cos(life*9.0+seed*17.0)*life*.14;float size=.013+cycle.w*.014;
        #endif
        vec4 mvPosition=modelViewMatrix*vec4(p,1);gl_Position=projectionMatrix*mvPosition;
        gl_PointSize=clamp(size*pixelScale/max(.1,-mvPosition.z),1.0,150.0);
        #include <fog_vertex>
      }`,
      fragmentShader: /* glsl */ `varying float life,seed;
      #include <common>
      #include <fog_pars_fragment>
      ${noise}
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.0;
        #ifdef CAMP_SMOKE
          float cloud=fireFbm(p*5.0+vec2(seed*37.0,life*1.2));
          float alpha=(1.0-smoothstep(.35,1.0,r))*(.45+cloud*.55)*sin(life*3.14159265)*.095;
          gl_FragColor=vec4(mix(vec3(.27,.255,.23),vec3(.48,.46,.42),life),alpha);
        #else
          float alpha=(1.0-smoothstep(.1,1.0,r))*smoothstep(0.0,.07,life)*(1.0-life);
          gl_FragColor=vec4(mix(vec3(4.0,1.3,.16),vec3(1.2,.1,.005),life),alpha*.85);
        #endif
        ${output}
      }`,
    });
  return { fire, smoke: particle(true), sparks: particle(false), pixelScale };
}
export function campParticles(material, rng, smoke) {
  const count = smoke ? 12 : 24,
    position = [],
    cycle = [];
  for (let i = 0; i < count; i++) {
    position.push(
      (rng() - 0.5) * 0.48,
      0.24 + rng() * 0.08,
      (rng() - 0.5) * 0.4,
    );
    cycle.push(
      smoke ? 4.5 + rng() * 2 : 1.1 + rng() * 1.5,
      rng(),
      rng(),
      rng(),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("cycle", new THREE.Float32BufferAttribute(cycle, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 2);
  return new THREE.Points(geometry, material);
}
export function campAshMaterial() {
  const m = new THREE.MeshStandardMaterial({
    name: "Camp scattered ash",
    color: 0x393530,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vAshUv;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvAshUv=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vAshUv;\n" + noise,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float grit=fireNoise(vAshUv*67.0),cloud=fireFbm(vAshUv*9.0);
        float radius=length(vAshUv-.5)*2.0;
        diffuseColor.rgb*=.4+grit*.9;
        diffuseColor.a*= (1.0-smoothstep(.57,.98,radius+cloud*.13))*(.55+cloud*.35);`,
      );
  };
  m.customProgramCacheKey = () => "vesper-camp-ash-1";
  return m;
}
