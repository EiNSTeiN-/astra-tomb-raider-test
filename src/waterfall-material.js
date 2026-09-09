import * as THREE from "three";

export const waterfallNoise = `float fallHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fallNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fallHash(i),fallHash(i+vec2(1,0)),f.x),mix(fallHash(i+vec2(0,1)),fallHash(i+vec2(1,1)),f.x),f.y);}
float fallFbm(vec2 p){return fallNoise(p)*.57+fallNoise(p*2.07+3.1)*.29+fallNoise(p*4.31+7.7)*.14;}`;

export function curtainMaterial(time, height, seed, level) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time,
      height,
      seed: { value: seed },
      waterTint: {
        value: new THREE.Color(level.water).lerp(
          new THREE.Color(0xb4cdc4),
          0.52,
        ),
      },
      foamTint: {
        value: new THREE.Color(level.sky).lerp(new THREE.Color(0xe5eee8), 0.72),
      },
    },
    vertexShader: `uniform float time;uniform float seed;varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec3 p=position;float drop=1.-uv.y;
        p.x*=1.+drop*.035;
        p.z+=.10+.07*sqrt(drop)+sin(drop*16.-time*5.+seed+uv.x*8.)*.023*drop;
        vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform float height;uniform float seed;uniform vec3 waterTint;uniform vec3 foamTint;varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      ${waterfallNoise}
      void main(){vec2 p=vUv;float drop=1.-p.y;
        // Constant texture phase follows the free-fall travel time, so streaks
        // stretch as the water accelerates and still meet a drained basin.
        float travel=(sqrt(1.44+19.62*drop*height)-1.2)/9.81;
        float clock=(travel-time)*5.;
        float streams=fallFbm(vec2(p.x*15.+seed,clock));
        float fine=fallFbm(vec2(p.x*49.+seed,clock*3.1));
        float lanes=fallNoise(vec2(p.x*17.+seed,.7));
        float gaps=smoothstep(.12,.44,lanes+streams*.16);
        float broken=mix(1.,gaps,smoothstep(.03,.65,drop)*.86);
        float edge=smoothstep(0.,.025+streams*.045,p.x)*smoothstep(0.,.025+streams*.045,1.-p.x);
        float foam=smoothstep(.35,.82,streams*.52+fine*.48);
        float foot=smoothstep(.68,1.,drop);
        float alpha=edge*broken*(.13+foam*.58+foot*.11);
        vec3 color=mix(waterTint*.62,foamTint,foam*.85+foot*.12);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export function impactMaterial(time, level) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time,
      foamTint: {
        value: new THREE.Color(level.sky).lerp(new THREE.Color(0xe5eee8), 0.7),
      },
    },
    vertexShader: `varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform vec3 foamTint;varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      ${waterfallNoise}
      void main(){vec2 p=(vUv-.5)*vec2(5.4,2.4);float x=max(0.,abs(p.x)-1.85);
        float r=length(vec2(x,p.y*1.6));float n=fallFbm(vec2(p.x*6.,p.y*7.-time*1.4));
        float core=(1.-smoothstep(.1,.68,r))*(.12+smoothstep(.25,.7,n)*.36);
        float rings=pow(.5+.5*sin(r*20.-time*4.),5.)*exp(-r*3.)*.17;
        float edge=smoothstep(0.,.08,vUv.x)*smoothstep(0.,.08,1.-vUv.x)*smoothstep(0.,.1,vUv.y)*smoothstep(0.,.1,1.-vUv.y);
        gl_FragColor=vec4(foamTint,(core+rings)*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export function flumeMaterial(time, level) {
  const m = new THREE.MeshStandardMaterial({
    color: level.water,
    roughness: 0.24,
    metalness: 0.05,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.flumeTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFlume;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFlume=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float flumeTime; varying vec2 vFlume;\n${waterfallNoise}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        float ripple=sin(vFlume.x*43.+sin(vFlume.y*13.+flumeTime)*2.+vFlume.y*15.+flumeTime*3.);
        normal=normalize(normal+vec3(.04*cos(vFlume.x*21.),ripple*.06,0.));`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float rim=1.-smoothstep(0.,.25,vFlume.y);
        float froth=smoothstep(.55,.82,fallFbm(vec2(vFlume.x*31.,vFlume.y*17.+flumeTime*1.4)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.69,.64),froth*(.07+rim*.3));`,
      );
  };
  m.customProgramCacheKey = () => "spillway-channel-1";
  return m;
}
