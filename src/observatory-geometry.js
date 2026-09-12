import * as THREE from "three";

// A closed curved panel, including its inner face and the four cut edges.
export function domePanelGeometry(radius, rise, a0, a1, opening = 0.3) {
  const positions = [],
    uv = [],
    indices = [],
    radial = 8,
    rings = 9;
  for (const inner of [false, true])
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i <= radial; i++) {
        const theta = opening + ((Math.PI / 2 - opening) * j) / rings;
        const a = a0 + ((a1 - a0) * i) / radial,
          r = radius - (inner ? 0.18 : 0);
        positions.push(
          Math.cos(a) * Math.sin(theta) * r,
          Math.cos(theta) * (rise - (inner ? 0.18 : 0)),
          Math.sin(a) * Math.sin(theta) * r,
        );
        uv.push((a * radius) / 3, (theta * rise) / 3);
      }
  const sheet = (radial + 1) * (rings + 1);
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i,
        b = a + 1,
        c = b + radial + 1,
        d = a + radial + 1;
      quad(a, d, c, b);
      quad(a + sheet, b + sheet, c + sheet, d + sheet);
    }
  for (let i = 0; i < radial; i++) {
    quad(i, i + 1, i + 1 + sheet, i + sheet);
    const a = rings * (radial + 1) + i;
    quad(a, a + sheet, a + 1 + sheet, a + 1);
  }
  for (let j = 0; j < rings; j++) {
    const a = j * (radial + 1),
      b = a + radial + 1;
    quad(a, a + sheet, b + sheet, b);
    const c = a + radial,
      d = b + radial;
    quad(c, d, d + sheet, c + sheet);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices.reverse());
  g.computeVertexNormals();
  return g;
}

export function patinatedBronze() {
  const m = new THREE.MeshStandardMaterial({
    name: "Engraved observatory bronze",
    color: 0xbfa56b,
    metalness: 0.83,
    roughness: 0.4,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 bronzePosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nbronzePosition=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 bronzePosition;
        float bronzeHash(vec3 p) {
          p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
        }
        float bronzeNoise(vec3 p) {
          vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(bronzeHash(i),bronzeHash(i+vec3(1,0,0)),f.x),mix(bronzeHash(i+vec3(0,1,0)),bronzeHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(bronzeHash(i+vec3(0,0,1)),bronzeHash(i+vec3(1,0,1)),f.x),mix(bronzeHash(i+vec3(0,1,1)),bronzeHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        float bronzeFilteredNoise(vec3 p) {
          float footprint=max(length(dFdx(p)),length(dFdy(p)));
          return mix(bronzeNoise(p),.5,smoothstep(.35,1.1,footprint));
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float bronzeCloud=bronzeFilteredNoise(bronzePosition*.85);
        float bronzeMottle=bronzeFilteredNoise(bronzePosition*6.3);
        float bronzeGrain=bronzeFilteredNoise(bronzePosition*92.);
        float tarnish=smoothstep(.32,.73,bronzeCloud*.7+bronzeMottle*.3);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.085,.18,.14),tarnish*.68);
        diffuseColor.rgb*=mix(.91,1.04,bronzeMottle)*mix(.985,1.015,bronzeGrain);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor=clamp(mix(roughness,.86,tarnish*.9)+(bronzeGrain-.5)*.13,.3,.95);",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "float metalnessFactor=mix(metalness,.18,tarnish*.85);",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float bronzePit=(bronzeGrain-.5)*.0009+smoothstep(.46,.7,bronzeMottle)*.00075;
        vec3 bronzeDx=dFdx(-vViewPosition),bronzeDy=dFdy(-vViewPosition);
        vec3 bronzeR1=cross(bronzeDy,normal),bronzeR2=cross(normal,bronzeDx);
        float bronzeDet=dot(bronzeDx,bronzeR1);
        vec3 bronzeGrad=sign(bronzeDet)*(dFdx(bronzePit)*bronzeR1+dFdy(bronzePit)*bronzeR2);
        normal=normalize(max(abs(bronzeDet),1.e-9)*normal-bronzeGrad);`,
      );
  };
  m.customProgramCacheKey = () => "observatory-bronze-v2";
  return m;
}
