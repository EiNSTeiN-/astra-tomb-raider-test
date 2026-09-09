import * as THREE from "three";
import { andeanGeometry } from "./andean-geology.js";
export { andeanGeometry, andeanHeight } from "./andean-geology.js";

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

function ridgeMaterial(game, layer) {
  return new THREE.ShaderMaterial({
    name: `Andean ridge ${layer}`,
    depthWrite: true,
    uniforms: {
      rock: { value: game.darkMat.map },
      rockNormal: { value: game.darkMat.normalMap || game.darkMat.map },
      hasRockNormal: { value: game.darkMat.normalMap ? 1 : 0 },
      sunDirection: { value: game.sunOffset.clone().normalize() },
      layer: { value: layer },
    },
    vertexShader: `attribute vec2 ridgeLight;varying vec2 vRidgeLight;varying vec3 vRidge,vNormal;
      void main(){vRidge=(modelMatrix*vec4(position,1.)).xyz;vNormal=normal;vRidgeLight=ridgeLight;
      vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
      float backgroundDepth=.2+.75*(max(0.,p.w)/(max(0.,p.w)+700.));
      gl_Position=vec4(p.xy,p.w*backgroundDepth,p.w);}`,
    fragmentShader: `varying vec3 vRidge,vNormal;varying vec2 vRidgeLight;
      uniform sampler2D rock,rockNormal;uniform vec3 sunDirection;uniform float layer,hasRockNormal;
      ${cloudNoise}
      vec3 relief(vec2 uv,vec3 n){
        vec3 q0=dFdx(vRidge),q1=dFdy(vRidge);vec2 st0=dFdx(uv),st1=dFdy(uv);
        vec3 a=cross(q1,n),b=cross(n,q0),t=a*st0.x+b*st1.x,bt=a*st0.y+b*st1.y;
        float scale=inversesqrt(max(.000001,max(dot(t,t),dot(bt,bt))));
        vec3 detail=texture2D(rockNormal,uv).xyz*2.-1.;detail.xy*=.58*hasRockNormal;
        detail.z=mix(1.,detail.z,hasRockNormal);
        return normalize(t*scale*detail.x+bt*scale*detail.y+n*detail.z);
      }
      vec3 fractureNormal(float height,vec3 n){
        vec3 q0=dFdx(vRidge),q1=dFdy(vRidge),a=cross(q1,n),b=cross(n,q0);
        float determinant=dot(q0,a);
        vec3 gradient=sign(determinant)*(dFdx(height)*a+dFdy(height)*b);
        return normalize(max(.000001,abs(determinant))*n-gradient);
      }
      void main(){vec3 n=normalize(vNormal),w=pow(abs(n),vec3(4.));w/=max(.001,w.x+w.y+w.z);
        vec3 p=vRidge*.31;
        vec3 grain=texture2D(rock,p.zy).rgb*w.x+texture2D(rock,p.xz).rgb*w.y+texture2D(rock,p.xy).rgb*w.z;
        vec3 detailN=normalize(relief(p.zy,n)*w.x+relief(p.xz,n)*w.y+relief(p.xy,n)*w.z);
        float broad=cloudFbm(vRidge.xz*.008+vec2(vRidge.y*.004,layer*17.));
        float broken=cloudFbm(vRidge.zy*.12)*w.x+cloudFbm(vRidge.xz*.12)*w.y+cloudFbm(vRidge.xy*.12)*w.z;
        vec3 fractureN=fractureNormal(broken*5.,n);
        float phase=vRidge.y*.19+vRidge.x*.009-vRidge.z*.014+broad*18.+broken*3.;
        float strata=smoothstep(.08,.35,abs(sin(phase)));
        strata=mix(strata,1.,smoothstep(.5,2.,fwidth(phase)));
        float gray=dot(grain,vec3(.2126,.7152,.0722));
        float detailFade=1.-smoothstep(280.,750.,distance(vRidge,cameraPosition));
        vec3 color=mix(vec3(.12,.16,.17),vec3(.27,.23,.18),smoothstep(.24,.73,broad));
        color*=mix(.55,1.3,smoothstep(.2,.72,broken))*(.95+.05*strata);
        color*=mix(vec3(1.),mix(grain,vec3(gray),.8)*1.8,.12+detailFade*.14);
        detailN=normalize(mix(fractureN,detailN,.15+detailFade*.2));
        float forest=smoothstep(.38,.84,n.y)*(1.-smoothstep(90.,300.,vRidge.y))
          *smoothstep(.23,.58,broken)*(.65+.35*vRidgeLight.y);
        color=mix(color,vec3(.036,.065,.031)*(.75+broken*.55),forest*.85);
        float snowLine=270.+layer*85.+broad*70.;
        float snow=smoothstep(snowLine,snowLine+85.,vRidge.y)
          *smoothstep(.18+broken*.3,.78,n.y+(1.-vRidgeLight.y)*.4);
        color=mix(color,vec3(.73,.81,.85)*(.87+.13*broken),snow);
        detailN=normalize(mix(detailN,n,snow*.8));
        float direct=max(0.,dot(detailN,sunDirection))*vRidgeLight.x;
        vec3 ambient=vec3(.16,.21,.26)*vRidgeLight.y*(.7+.3*n.y);
        color*=ambient+vec3(1.1,1.04,.89)*direct;
        float haze=1.-exp(-distance(vRidge,cameraPosition)*(.00023+layer*.00008));
        haze=max(haze,(1.-smoothstep(-75.,70.,vRidge.y))*.83);
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
      andeanGeometry(game.map.size * 7, layer, game.sunOffset),
      ridgeMaterial(game, layer),
    );
    mesh.name = `Andean range ${layer}`;
    mesh.renderOrder = -10 - layer * 10;
    mesh.frustumCulled = false;
    mesh.userData.excludeContact = true;
    // These ranges render before the playable world. Give their overlapping
    // faces a full-precision depth interval, then clear only that depth after
    // the last opaque range. Their color remains behind all gameplay geometry,
    // including objects close to the camera's far plane and water reflections.
    if (layer === 0) mesh.onAfterRender = (renderer) => renderer.clearDepth();
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
