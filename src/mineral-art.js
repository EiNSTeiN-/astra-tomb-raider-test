import * as THREE from "three";

// The narrow corner faces catch light while the main shaft faces stay planar.
// Every termination fits inside the original radius/height collision envelope.
export function quartzGeometry(radius, height, phase = 0) {
  const corners = Array.from({ length: 6 }, (_, i) => {
    const a =
      (i * Math.PI) / 3 + phase + Math.sin(i * 2.31 + phase * 11) * 0.023;
    const r = radius * (0.972 + Math.sin(i * 1.79 + phase * 17) * 0.022);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const outline = corners.flatMap((p, i) =>
    [-1, 1].map((side) => {
      const neighbor = corners[(i + side + 6) % 6],
        bevel = 0.045 + (Math.sin(i * 2.7 + phase * 5) + 1) * 0.008;
      return {
        x: p[0] + (neighbor[0] - p[0]) * bevel,
        z: p[1] + (neighbor[1] - p[1]) * bevel,
        shoulder: height * (0.735 + Math.sin(i * 1.97 + phase * 13) * 0.045),
      };
    }),
  );
  const tip = [radius * 0.14, height, -radius * 0.11];
  const rings = [
    outline.map((p) => [p.x * 0.95, 0, p.z * 0.95]),
    outline.map((p) => [p.x, height * 0.035, p.z]),
    outline.map((p) => [p.x, p.shoulder, p.z]),
    outline.map((p) => {
      const t = (height * 0.987 - p.shoulder) / (height - p.shoulder);
      return [
        p.x + (tip[0] - p.x) * t,
        height * 0.987,
        p.z + (tip[2] - p.z) * t,
      ];
    }),
  ];
  const positions = [],
    uv = [],
    coordinates = [],
    sizes = [];
  const triangle = (...points) => {
    for (const p of points) {
      positions.push(...p);
      uv.push(p[0] / radius, p[1] / height);
      coordinates.push(...p, phase);
      sizes.push(radius, height);
    }
  };
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    triangle([0, 0, 0], rings[0][i], rings[0][j]);
    for (let r = 0; r < rings.length - 1; r++) {
      const a = rings[r][i],
        b = rings[r][j],
        c = rings[r + 1][i],
        d = rings[r + 1][j];
      triangle(a, c, b);
      triangle(b, c, d);
    }
    triangle(rings.at(-1)[i], tip, rings.at(-1)[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // Preserve each crystal's art coordinates and thickness through static batching.
  geometry.setAttribute(
    "mineralCoord",
    new THREE.Float32BufferAttribute(coordinates, 4),
  );
  geometry.setAttribute(
    "mineralShape",
    new THREE.Float32BufferAttribute(sizes, 2),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Keep the pooled point source clear of its crystal and housing. A shared
// root-height offset can put it directly on a terminal facet. Leave room for
// inverse-square falloff above the glossy tips as well as geometric separation.
export function mineralLightPosition(center, objects) {
  const bounds = new THREE.Box3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    bounds.expandByObject(object);
  }
  if (bounds.isEmpty())
    throw new Error("A mineral light needs visible geometry.");
  return new THREE.Vector3(center.x, bounds.max.y + 3, center.z);
}

const declarations = /* glsl */ `
uniform float restoration;
varying vec4 vMineralCoord;
varying vec2 vMineralShape;
float mineralHash(vec3 p) {
  p=fract(p*.1031); p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float mineralNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(mineralHash(i),mineralHash(i+vec3(1,0,0)),f.x),
    mix(mineralHash(i+vec3(0,1,0)),mineralHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(mineralHash(i+vec3(0,0,1)),mineralHash(i+vec3(1,0,1)),f.x),
    mix(mineralHash(i+vec3(0,1,1)),mineralHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;

const surface = /* glsl */ `
vec3 mineralP=vMineralCoord.xyz;
float mineralSeed=vMineralCoord.w*17.;
float mineralCloud=mineralNoise(mineralP*vec3(.9,.25,.9)+mineralSeed)*.7;
mineralCloud+=mineralNoise(mineralP*vec3(3.2,.8,3.2)+mineralSeed+9.)*.2;
mineralCloud+=mineralNoise(mineralP*7.1+mineralSeed+17.)*.1;
mineralCloud=smoothstep(.49,.79,mineralCloud);
vec3 mineralQ=mineralP/vec3(vMineralShape.x,vMineralShape.y,vMineralShape.x);
// One sparse internal cleavage, rather than repeating bright sinusoidal bands.
float mineralPlane=mineralQ.y-(.32+.22*fract(mineralSeed*.73))
  +mineralQ.x*.13-mineralQ.z*.08;
mineralPlane+=(mineralNoise(mineralQ*2.1+mineralSeed)-.5)*.035;
float mineralAA=max(.0003,fwidth(mineralPlane));
float mineralFracture=(1.-smoothstep(.0008+mineralAA,.0035+mineralAA,abs(mineralPlane)))
  *smoothstep(.45,.7,mineralNoise(mineralQ*4.3+mineralSeed));
float mineralBase=1.-smoothstep(.01,.24,mineralP.y/vMineralShape.y);
float mineralStrataPhase=mineralP.y*92.+mineralNoise(mineralP*3.)*.7;
float mineralStrata=sin(mineralStrataPhase)*(1.-smoothstep(.7,2.6,fwidth(mineralStrataPhase)));
float mineralEtch=mineralStrata*.00065+mineralFracture*.00005;
vec3 mineralBody=mix(vec3(.82,.87,.92),vec3(1.06,1.07,1.08),mineralCloud*.7+mineralFracture*.12);
mineralBody*=mix(1.,.58,mineralBase);
mineralBody*=1.+mineralStrata*.007;
diffuseColor.rgb*=mineralBody;
`;

export function mineralMaterial(color, restoration) {
  const tint = new THREE.Color(color);
  const material = new THREE.MeshPhysicalMaterial({
    name: "Clouded quartz with etched facets",
    color: new THREE.Color(0xffffff).lerp(tint, 0.38),
    emissive: tint,
    emissiveIntensity: 0.38,
    roughness: 0.11,
    metalness: 0,
    ior: 1.46,
    transmission: 0.68,
    thickness: 1,
    attenuationColor: tint.clone().lerp(new THREE.Color(0xffffff), 0.38),
    attenuationDistance: 3.1,
    clearcoat: 0.45,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.35,
  });
  material.userData.mineralRestoration = restoration;
  const optics = { shaders: new Set(), targets: new Set() };
  material.userData.mineralOptics = optics;
  // Three's public sampler texture holds a renderTarget back-reference. Record
  // each camera's target before the next draw updates the shared uniforms.
  material.onBeforeRender = () => collectTargets(optics);
  material.addEventListener("dispose", () => {
    optics.shaders.clear();
    optics.targets.clear();
  });
  material.onBeforeCompile = (shader) => {
    optics.shaders.add(shader.uniforms);
    shader.uniforms.restoration = restoration;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 mineralCoord; attribute vec2 mineralShape; varying vec4 vMineralCoord; varying vec2 vMineralShape;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMineralCoord=mineralCoord; vMineralShape=mineralShape;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + declarations)
      .replace("#include <map_fragment>", surface)
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor=clamp(roughness+mineralCloud*.1+mineralFracture*.1+mineralBase*.18,.08,.55);",
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        vec3 mineralDx=dFdx(-vViewPosition), mineralDy=dFdy(-vViewPosition);
        vec3 mineralR1=cross(mineralDy,normal), mineralR2=cross(normal,mineralDx);
        float mineralDet=dot(mineralDx,mineralR1);
        normal=normalize(max(abs(mineralDet),.000001)*normal-sign(mineralDet)*
          (dFdx(mineralEtch)*mineralR1+dFdy(mineralEtch)*mineralR2));
      `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        float mineralRim=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
        totalEmissiveRadiance*=(.12+mineralRim*.35+mineralFracture*.06)*(.4+restoration*.85);
      `,
      )
      .replace(
        "#include <transmission_fragment>",
        THREE.ShaderChunk.transmission_fragment
          .replace(
            "material.transmission = transmission;",
            "material.transmission = transmission * (1.-mineralCloud*.22-mineralFracture*.1-mineralBase*.28);",
          )
          .replace(
            "material.thickness = thickness;",
            "material.thickness = thickness * vMineralShape.x * 1.7;",
          ),
      );
  };
  material.customProgramCacheKey = () => "vesper-quartz-optics-2";
  return material;
}

function collectTargets(optics) {
  for (const uniforms of optics.shaders) {
    const target = uniforms.transmissionSamplerMap?.value?.renderTarget;
    if (target) optics.targets.add(target);
  }
}

export function mineralTransmissionTargets(scene) {
  const targets = new Set();
  scene?.traverse((object) => {
    for (const material of [object.material].flat()) {
      const optics = material?.userData.mineralOptics;
      if (!optics) continue;
      collectTargets(optics);
      for (const target of optics.targets) targets.add(target);
    }
  });
  return targets;
}

export function disposeMineralTransmission(scene) {
  for (const target of mineralTransmissionTargets(scene)) target.dispose();
  scene?.traverse((object) => {
    for (const material of [object.material].flat()) {
      const optics = material?.userData.mineralOptics;
      if (!optics) continue;
      for (const uniforms of optics.shaders)
        if (uniforms.transmissionSamplerMap)
          uniforms.transmissionSamplerMap.value = null;
      optics.targets.clear();
    }
  });
}
