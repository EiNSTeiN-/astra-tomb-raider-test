import * as THREE from "three";

export function archiveBubbleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      attribute float bubbleLife;
      varying vec2 vBubbleUv;
      varying float vBubbleAlpha;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vBubbleUv=uv*2.0-1.0;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        float diameter=length(instanceMatrix[0].xyz);
        // Face each render camera, including the water reflection camera.
        mvPosition.xy+=position.xy*diameter;
        vBubbleAlpha=smoothstep(0.0,.08,bubbleLife)
          *(1.0-smoothstep(.87,1.0,bubbleLife))
          *smoothstep(.12,.5,-mvPosition.z);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vBubbleUv;
      varying float vBubbleAlpha;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float radius=length(vBubbleUv);
        float aa=max(fwidth(radius),.008);
        float edge=1.0-smoothstep(1.0-aa,1.0+aa,radius);
        if(edge<=0.0)discard;
        float shell=exp(-pow((radius-.84)/.10,2.0));
        float inner=exp(-pow((radius-.65)/.13,2.0));
        float highlight=exp(-dot(vBubbleUv-vec2(-.3,.5),vBubbleUv-vec2(-.3,.5))*105.0);
        float lower=1.0-smoothstep(-.7,.15,vBubbleUv.y);
        vec3 color=mix(vec3(.30,.51,.53),vec3(.77,.91,.88),shell*(1.0-lower*.5));
        color=mix(color,vec3(.98,1.0,.96),highlight);
        float alpha=(.025+shell*.44+inner*lower*.09+highlight*.38)*edge*vBubbleAlpha;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

export function createArchiveBubbles(material = archiveBubbleMaterial()) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute(
    "bubbleLife",
    new THREE.InstancedBufferAttribute(new Float32Array(20), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const bubbles = new THREE.InstancedMesh(geometry, material, 20);
  bubbles.name = "Tidekeeper rising bubbles";
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  return bubbles;
}

const matrix = new THREE.Matrix4();

export function updateArchiveBubbles(site, elapsed) {
  const height = Math.max(0, site.water.position.y - site.source.y - 0.08),
    // Keep the cycle independent of drainage so elapsed time cannot rephase
    // the whole column when the surface moves. Only its visible top changes.
    cycleHeight = Math.max(
      0.1,
      (site.water.userData?.baseY ?? site.water.position.y) -
        site.source.y -
        0.08,
    ),
    life = site.bubbles.geometry.getAttribute("bubbleLife");
  for (let i = 0; i < site.bubbles.count; i++) {
    const seed = ((i * 17 + 11) % 23) / 23,
      speed = 0.72 + seed * 0.3,
      t = ((elapsed * speed) / cycleHeight + i / 20) % 1,
      rise = t * cycleHeight,
      diameter = (0.038 + seed * 0.036) * (0.8 + t * 0.65);
    matrix.makeScale(diameter, diameter, diameter);
    matrix.setPosition(
      site.source.x + Math.sin(i * 17 + t * 4) * 0.22,
      site.source.y + Math.min(height, rise),
      site.source.z + Math.cos(i * 11 + t * 3) * 0.22,
    );
    site.bubbles.setMatrixAt(i, matrix);
    life.setX(i, height > 0 ? Math.min(1, rise / height) : 0);
  }
  life.needsUpdate = true;
  site.bubbles.instanceMatrix.needsUpdate = true;
}
