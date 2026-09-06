import * as THREE from "three";

export function observatorySky(sunPosition, progress) {
  const material = new THREE.ShaderMaterial({
    name: "Eclipsed meridian sky",
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      dawn: { value: Number(!!progress.completed) },
      sunPosition: { value: sunPosition.clone().normalize() },
    },
    vertexShader: `varying vec3 direction;void main(){direction=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `uniform vec3 sunPosition;uniform float time,dawn;varying vec3 direction;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec3 d=normalize(direction);float h=max(0.,d.y);
        vec3 color=mix(vec3(.105,.083,.091),vec3(.009,.017,.038),pow(h,.45));
        color=mix(color,mix(vec3(.34,.2,.12),vec3(.06,.12,.2),pow(h,.5)),dawn*.7);
        vec2 skyUv=vec2(atan(d.z,d.x)/6.2831853+.5,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
        vec2 grid=skyUv*vec2(900.,450.),cell=floor(grid),p=fract(grid)-.5;
        float star=step(.9965,hash(cell))*exp(-dot(p,p)*140.)*(.6+.4*hash(cell+31.));
        color+=vec3(.6,.73,1.)*star*smoothstep(0.,.2,h)*(1.-dawn*.85);
        float band=pow(max(0.,1.-abs(dot(d,normalize(vec3(.2,.7,.6))))),28.);
        color+=vec3(.018,.017,.031)*band*(1.-dawn);
        vec3 side=normalize(cross(sunPosition,vec3(0.,1.,0.)));
        float separation=length(d-sunPosition),radius=.043;
        float moon=length(d-normalize(sunPosition+side*(.001+dawn*.075)));
        float disk=1.-smoothstep(radius-.0005,radius+.0005,separation);
        float occult=1.-smoothstep(radius*.99-.0005,radius*.99+.0005,moon);
        float angle=atan(dot(d-sunPosition,side),d.y-sunPosition.y);
        float corona=exp(-abs(separation-radius)*70.)*(.45+.13*sin(angle*11.+sin(angle*5.+time*.02)));
        color+=vec3(.68,.46,.23)*corona*(1.-occult)*(.8-dawn*.3);
        color+=vec3(3.2,2.1,.9)*disk*(1.-occult);
        color=mix(color,vec3(.003,.005,.01),occult);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
  mesh.frustumCulled = false;
  return mesh;
}
