import * as THREE from "three";

export function forgeSky(sunPosition) {
  const material = new THREE.ShaderMaterial({
    name: "Ash cloud sky",
    uniforms: {
      time: { value: 0 },
      sunPosition: { value: sunPosition.clone().normalize() },
    },
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position;
      vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=clip.xyww;}`,
    fragmentShader: `uniform float time;uniform vec3 sunPosition;varying vec3 vDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float cloud(vec2 p){float s=0.0,w=.5;for(int i=0;i<5;i++){s+=noise(p)*w;p=mat2(.8,.6,-.6,.8)*p*2.04+13.1;w*=.5;}return s;}
      void main(){vec3 d=normalize(vDirection);float h=max(0.0,d.y);
        vec3 color=mix(vec3(.3,.205,.145),vec3(.048,.065,.083),pow(h,.4));
        vec2 uv=d.xz/(h+.26)*1.8+vec2(time*.0007,0.0);
        float ash=smoothstep(.33,.7,cloud(uv));
        float rim=cloud(uv+vec2(.05,-.03));
        color=mix(color,vec3(.027,.031,.036)+vec3(.055,.037,.021)*rim,ash*.82*smoothstep(.0,.18,h));
        float sun=max(0.0,dot(d,sunPosition));
        color+=vec3(.44,.18,.055)*pow(sun,24.0)*(1.0-ash*.85);
        color+=vec3(.7,.31,.1)*smoothstep(.9994,.99985,sun)*(1.0-ash*.94);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 40, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}
