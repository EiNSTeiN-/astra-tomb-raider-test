import * as THREE from "three";

export const CLOUD_BANK_FLOOR = -34;
export const CLOUD_BANK_RISE = 23;

const cloudNoise = `
float cloudHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);}
float cloudFbm(vec2 p){float f=0.,w=.5;for(int i=0;i<5;i++){f+=w*cloudNoise(p);p=mat2(.8,.6,-.6,.8)*p*2.03+vec2(17.7,9.2);w*=.5;}return f;}
`;

export function cloudCitySky(sunPosition) {
  const material = new THREE.ShaderMaterial({
    name: "Andean blue sky and high cloud",
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      sunPosition: { value: sunPosition.clone().normalize() },
    },
    vertexShader: `varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `varying vec3 vDirection;uniform float time;uniform vec3 sunPosition;
    ${cloudNoise}
    void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);
      vec3 color=mix(vec3(.38,.53,.62),vec3(.045,.125,.24),pow(h,.55));
      vec2 p=d.xz/(h+.23)*2.1+vec2(time*.0006,time*.0002);
      vec2 warp=vec2(cloudNoise(p*.7),cloudNoise(p*.7+23.))*1.3;
      float density=cloudFbm(p+warp);
      float cloud=smoothstep(.44,.7,density)*smoothstep(.005,.12,h);
      float facing=cloudFbm(p+warp+normalize(sunPosition.xz)*.13);
      float edge=clamp((density-facing)*6.+.6,0.,1.);
      vec3 cloudColor=mix(vec3(.29,.39,.46),vec3(.93,.91,.82),edge);
      color=mix(color,cloudColor,cloud*.94);
      float wisps=smoothstep(.56,.77,cloudFbm(p*vec2(.5,3.1)+35.));
      color=mix(color,vec3(.72,.78,.8),wisps*.18*smoothstep(.15,.45,h));
      float sun=max(0.,dot(d,sunPosition));
      color+=vec3(.48,.37,.22)*pow(sun,48.)*(1.-cloud*.8);
      color+=vec3(5.,4.4,3.5)*smoothstep(.999975,.99999,sun)*(1.-cloud*.98);
      color=mix(vec3(.35,.48,.51),color,smoothstep(-.18,.02,d.y));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
  sky.name = "Cloud-city sky";
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  return sky;
}

const ridgePeaks = [
  [
    [0.18, 115, 0.2],
    [1.06, 155, 0.24],
    [2.7, 100, 0.18],
    [4.05, 170, 0.25],
    [5.4, 95, 0.21],
  ],
  [
    [0.55, 180, 0.18],
    [1.6, 245, 0.2],
    [3.1, 180, 0.28],
    [4.8, 240, 0.21],
    [5.8, 190, 0.19],
  ],
  [
    [0.15, 320, 0.17],
    [1.23, 280, 0.22],
    [2.35, 300, 0.16],
    [3.8, 290, 0.23],
    [5.15, 310, 0.2],
  ],
];
export function andeanHeight(angle, across, layer) {
  const a = angle + layer * 0.19;
  let peak =
    [160, 400, 650][layer] +
    [80, 130, 240][layer] * Math.pow(Math.abs(Math.sin(a * 5 + 0.4)), 4);
  for (const [center, height, width] of ridgePeaks[layer]) {
    const distance = Math.atan2(
      Math.sin(angle - center),
      Math.cos(angle - center),
    );
    peak += height * Math.exp(-Math.pow(distance / width, 2));
  }
  const crest = 0.39 + 0.055 * Math.sin(a * 7) + 0.022 * Math.cos(a * 13);
  const flank = Math.max(
    0,
    across < crest ? across / crest : (1 - across) / (1 - crest),
  );
  const ribs =
    (Math.abs(Math.sin(a * 61 + across * 5)) * 0.075 +
      Math.abs(Math.sin(a * 127 - across * 8)) * 0.025) *
    Math.sin(Math.PI * flank);
  return (
    [-125, -160, -210][layer] + Math.max(0, Math.pow(flank, 1.24) - ribs) * peak
  );
}

export function andeanGeometry(extent, layer) {
  const segments = 384,
    rings = 28,
    radius = extent * [0.93, 1.55, 2.25][layer],
    width = [250, 410, 650][layer];
  const positions = [],
    indices = [];
  for (let r = 0; r <= rings; r++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        t = r / rings,
        d = radius + t * width;
      positions.push(
        extent / 2 + Math.cos(a) * d,
        andeanHeight(a, t, layer),
        extent / 2 + Math.sin(a) * d,
      );
      if (r < rings && i < segments) {
        const n = r * (segments + 1) + i;
        indices.push(
          n,
          n + 1,
          n + segments + 1,
          n + 1,
          n + segments + 2,
          n + segments + 1,
        );
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const n = geometry.attributes.normal;
  for (let r = 0; r <= rings; r++) {
    const a = r * (segments + 1),
      b = a + segments,
      normal = new THREE.Vector3()
        .fromBufferAttribute(n, a)
        .add(new THREE.Vector3().fromBufferAttribute(n, b))
        .normalize();
    n.setXYZ(a, ...normal.toArray());
    n.setXYZ(b, ...normal.toArray());
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { segments, rings, radius, width, layer };
  return geometry;
}

function ridgeMaterial(game, layer) {
  return new THREE.ShaderMaterial({
    name: `Andean ridge ${layer}`,
    depthWrite: false,
    uniforms: {
      rock: { value: game.darkMat.map },
      sunDirection: { value: game.sunOffset.clone().normalize() },
      layer: { value: layer },
    },
    vertexShader: `varying vec3 vRidge,vNormal;void main(){vRidge=(modelMatrix*vec4(position,1.)).xyz;vNormal=normal;
      vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vec4(p.xy,p.w*.9999,p.w);}`,
    fragmentShader: `varying vec3 vRidge,vNormal;uniform sampler2D rock;uniform vec3 sunDirection;uniform float layer;
      void main(){vec3 n=normalize(vNormal),w=pow(abs(n),vec3(4.));w/=max(.001,w.x+w.y+w.z);
        vec3 p=vRidge*.026;
        vec3 grain=texture2D(rock,p.zy).rgb*w.x+texture2D(rock,p.xz).rgb*w.y+texture2D(rock,p.xy).rgb*w.z;
        float strata=.5+.5*sin(vRidge.y*.063+sin(vRidge.x*.032)*2.+sin(vRidge.z*.024));
        vec3 color=grain*vec3(.42,.44,.41)*(.85+.15*strata);
        float forest=smoothstep(.12,.68,n.y)*(1.-smoothstep(170.,370.,vRidge.y));
        color=mix(color,vec3(.043,.074,.035)*(.8+.2*strata),forest);
        float snow=smoothstep(350.+layer*130.,430.+layer*140.,vRidge.y)*smoothstep(.35,.84,n.y);
        color=mix(color,vec3(.69,.77,.81),snow);
        color*=.3+.85*max(0.,dot(n,sunDirection));
        float haze=1.-exp(-distance(vRidge,cameraPosition)*(.00035+layer*.00015));
        haze=max(haze,(1.-smoothstep(-70.,90.,vRidge.y))*.83);
        color=mix(color,vec3(.38,.5,.57),haze);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function cloudBank(game, time) {
  const extent = game.map.size * 7;
  const geometry = new THREE.PlaneGeometry(extent * 7, extent * 7, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(extent / 2, CLOUD_BANK_FLOOR, extent / 2);
  const material = new THREE.ShaderMaterial({
    name: "Drifting valley cloud bank",
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time,
      cloudRise: { value: CLOUD_BANK_RISE },
      sunDirection: { value: game.sunOffset.clone().normalize() },
    },
    vertexShader: `varying vec3 vCloud;uniform float time,cloudRise;
      ${cloudNoise}
      void main(){vec3 p=position;float density=cloudNoise(p.xz*.008+vec2(time*.00035,0.));
        p.y+=sqrt(smoothstep(.22,.85,density))*cloudRise;
        vCloud=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        gl_Position.z=min(gl_Position.z,gl_Position.w*.9997);}`,
    fragmentShader: `varying vec3 vCloud;uniform float time;uniform vec3 sunDirection;
      ${cloudNoise}
      void main(){vec2 p=vCloud.xz*.009+vec2(time*.0008,time*.00022);
        float f=cloudFbm(p),shadow=cloudFbm(p+normalize(sunDirection.xz)*.2);
        vec3 cloudNormal=normalize(cross(dFdx(vCloud),dFdy(vCloud)));
        if(cloudNormal.y<0.)cloudNormal=-cloudNormal;
        float light=clamp(.3+.6*max(0.,dot(cloudNormal,sunDirection))+(f-shadow)*1.5,0.,1.);
        vec3 color=mix(vec3(.28,.41,.46),vec3(.85,.88,.87),light);
        float farFade=1.-exp(-distance(vCloud,cameraPosition)*.0011);
        color=mix(color,vec3(.38,.5,.56),farFade*.7);
        float opacity=mix(.68,.97,smoothstep(.28,.65,f));
        gl_FragColor=vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Clouds below the sky bridges";
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  mesh.userData.excludeContact = true;
  return mesh;
}

export function buildCloudCity(game) {
  const group = new THREE.Group(),
    time = { value: 0 };
  group.name = "Andean ranges and valley cloud";
  for (let layer = 2; layer >= 0; layer--) {
    const mesh = new THREE.Mesh(
      andeanGeometry(game.map.size * 7, layer),
      ridgeMaterial(game, layer),
    );
    mesh.name = `Andean range ${layer}`;
    mesh.renderOrder = -10 - layer * 10;
    mesh.frustumCulled = false;
    mesh.userData.excludeContact = true;
    group.add(mesh);
  }
  const bank = cloudBank(game, time);
  group.add(bank);
  game.world.add(group);
  // The cloud bank conceals the distant water backdrop. The small visible
  // reservoirs retain their usual surfaces, reflections and positioned audio.
  for (const water of game.waterMeshes || [])
    if (water.userData.sea) water.visible = false;
  game.cloudCity = { group, time, bank };
}
