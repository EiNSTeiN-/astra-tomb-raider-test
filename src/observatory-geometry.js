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
        float bronzeHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
        float bronzeNoise(vec3 p) {
          vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(bronzeHash(i),bronzeHash(i+vec3(1,0,0)),f.x),mix(bronzeHash(i+vec3(0,1,0)),bronzeHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(bronzeHash(i+vec3(0,0,1)),bronzeHash(i+vec3(1,0,1)),f.x),mix(bronzeHash(i+vec3(0,1,1)),bronzeHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float tarnish=smoothstep(.38,.7,bronzeNoise(bronzePosition*.8)*.65+bronzeNoise(bronzePosition*3.7)*.25+bronzeNoise(bronzePosition*14.)*.1);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.24,.2),tarnish*.6);
        diffuseColor.rgb*=.93+.07*sin(bronzePosition.y*80.+bronzePosition.x*14.);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor=mix(roughness,.76,tarnish*.7);",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "float metalnessFactor=mix(metalness,.28,tarnish*.8);",
      );
  };
  m.customProgramCacheKey = () => "observatory-bronze-v1";
  return m;
}
