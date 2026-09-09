import * as THREE from "three";

const noise = /* glsl */ `
float relayHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float relayNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(relayHash(i),relayHash(i+vec3(1,0,0)),f.x),mix(relayHash(i+vec3(0,1,0)),relayHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(relayHash(i+vec3(0,0,1)),relayHash(i+vec3(1,0,1)),f.x),mix(relayHash(i+vec3(0,1,1)),relayHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

function finish(material, name, kind) {
  material.name = name;
  material.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vRelayPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRelayPosition=position;",
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vRelayPosition;\n" + noise,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grain=relayNoise(vRelayPosition*26.0);
        float oxidation=smoothstep(.34,.72,relayNoise(vRelayPosition*2.6)*.7+grain*.3);
        ${
          kind === "ram"
            ? `
          float machining=relayNoise(vRelayPosition*vec3(7.,190.,7.));
          diffuseColor.rgb*=.77+machining*.23;`
            : `diffuseColor.rgb=mix(diffuseColor.rgb,${kind === "bronze" ? "vec3(.07,.12,.095)" : "vec3(.16,.078,.038)"},oxidation*.65);
          diffuseColor.rgb*=.7+grain*.3;`
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,${kind === "ram" ? ".45" : ".94"},oxidation*.55);`,
      );
  };
  material.customProgramCacheKey = () => `vesper-relay-${kind}-1`;
  return material;
}

export function pressureMaterials(game) {
  let furnaceMetal;
  game.forgePatches?.[0]?.root.traverse((o) => {
    if (o.material?.name === "Corroded furnace steel")
      furnaceMetal = o.material;
  });
  const metal = finish(
    furnaceMetal?.clone() || new THREE.MeshStandardMaterial(),
    "Relay heat-worn iron",
    "iron",
  );
  metal.color.set(0xb1b7b5);
  metal.metalness = 0.82;
  metal.roughness = 0.72;
  metal.normalScale.set(0.5, 0.5);
  const bronze = finish(
    new THREE.MeshStandardMaterial({
      color: 0x9b8963,
      metalness: 0.72,
      roughness: 0.57,
    }),
    "Relay aged bronze",
    "bronze",
  );
  const ram = finish(
    new THREE.MeshStandardMaterial({
      color: 0xb5babc,
      metalness: 0.92,
      roughness: 0.26,
    }),
    "Relay machined ram",
    "ram",
  );
  const stone = game.darkMat.clone();
  stone.name = "Relay dressed basalt";
  stone.color.set(0x94938e);
  const paving = (game.stoneMat || game.darkMat).clone();
  paving.name = "Relay fitted paving";
  paving.color.set(0x9b9282);
  const warning = new THREE.MeshStandardMaterial({
    name: "Relay worn ochre markings",
    color: 0xb29959,
    roughness: 0.88,
    metalness: 0.18,
  });
  const recess = new THREE.MeshStandardMaterial({
    name: "Relay cast recesses",
    color: 0x252a29,
    roughness: 0.87,
    metalness: 0.32,
  });
  return { stone, paving, metal, bronze, ram, warning, recess };
}

export function pressureSlagMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: "Relay fractured cooling slag",
    color: 0x3f403c,
    roughness: 0.97,
    emissive: 0xff4b12,
  });
  material.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSlagPoint;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSlagPoint=position;",
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSlagPoint;\n" + noise,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 q=vSlagPoint.xy*1.5,cell=floor(q),f=fract(q);
        float first=9.,second=9.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 o=vec2(float(x),float(y));
          vec2 r=o+vec2(relayHash(vec3(cell+o,0.)),relayHash(vec3(cell+o,31.)))-f;
          float d=dot(r,r);if(d<first){second=first;first=d;}else second=min(second,d);
        }
        float aa=min(.12,fwidth(second-first));
        float fissure=(1.-smoothstep(.008,.055+aa,second-first))*.047/(.047+aa);
        float grit=relayNoise(vSlagPoint*19.);
        diffuseColor.rgb*=.3+grit*.95;
        diffuseColor.rgb*=1.-fissure*.6;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "totalEmissiveRadiance=vec3(2.1,.16,.012)*fissure*(.22+.78*relayNoise(vSlagPoint*1.3));",
      );
  };
  material.customProgramCacheKey = () => "vesper-relay-slag-2";
  return material;
}
