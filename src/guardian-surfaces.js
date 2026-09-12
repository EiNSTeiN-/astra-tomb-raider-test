import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// A closed casting with a raised crown, chamfered skirt and flat underside.
// Squared corners and unequal front/back lips distinguish it from a sphere.
export function guardianPauldronGeometry(detail, layer = 0, side = 1) {
  const count = detail ? 20 : 10,
    width = 0.335 - layer * 0.017,
    depth = 0.325 - layer * 0.014,
    rings = detail
      ? [
          [0, 0.135],
          [0.38, 0.135],
          [0.7, 0.087],
          [0.9, 0.016],
          [1, -0.025],
          [1, -0.072],
          [0.94, -0.11],
          [0, -0.11],
        ]
      : [
          [0, 0.135],
          [0.7, 0.087],
          [1, -0.025],
          [1, -0.072],
          [0.94, -0.11],
          [0, -0.11],
        ],
    points = [],
    indices = [];
  for (const [radius, y] of rings)
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count,
        u = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** 0.65,
        v = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.65,
        x = u * width * radius,
        z = v * depth * radius;
      points.push(
        x,
        y - (z / depth) * 0.025 - Math.max(0, (side * x) / width) * 0.018,
        z,
      );
    }
  for (let row = 0; row < rings.length - 1; row++)
    for (let i = 0; i < count; i++) {
      const a = row * count + i,
        b = row * count + ((i + 1) % count),
        c = a + count,
        d = b + count;
      if (row !== rings.length - 2) indices.push(a, d, c);
      if (row !== 0) indices.push(a, b, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(indices);
  const welded = mergeVertices(g, 1e-6);
  g.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.userData.guardianPauldron = true;
  return welded;
}

// Authored surfaces keep wear coordinates in the bind pose, before the rigid
// bones move them. The data is interpolated with the same vertices as the skin.
export function guardianSurfaceData(geometry) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal;
  const values = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i),
      y = p.getY(i),
      x = p.getX(i),
      z = p.getZ(i);
    // Downward ledges collect dirt; the lower feet receive a separate deposit.
    const recess = Math.max(0, -ny) * 0.7;
    const foot = THREE.MathUtils.smoothstep(0.35 - y, 0, 0.24);
    values[i * 2] = Math.min(1, recess + foot * 0.38);
    values[i * 2 + 1] =
      Math.max(0, ny) * (0.75 + 0.25 * Math.sin(x * 17 + z * 11) ** 2);
  }
  geometry.setAttribute(
    "guardianSurface",
    new THREE.Float32BufferAttribute(values, 2),
  );
  return geometry;
}

const NOISE = `
varying vec3 vGuardianStone;
varying vec2 vGuardianSurface;
float guardianHash(vec3 p) {
  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float guardianNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(guardianHash(i),guardianHash(i+vec3(1,0,0)),f.x),mix(guardianHash(i+vec3(0,1,0)),guardianHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(guardianHash(i+vec3(0,0,1)),guardianHash(i+vec3(1,0,1)),f.x),mix(guardianHash(i+vec3(0,1,1)),guardianHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`;

export function weatherGuardianMaterial(material, biome, metal = false) {
  const damp = ["jungle", "water", "sky"].includes(biome),
    sea = biome === "water",
    ash = biome === "volcano" || biome === "eclipse";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 guardianSurface; varying vec3 vGuardianStone; varying vec2 vGuardianSurface;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGuardianStone=position;vGuardianSurface=guardianSurface;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + NOISE)
      .replace(
        "#include <map_fragment>",
        `
      #ifdef USE_MAP
        vec4 stoneSample=texture2D(map,vMapUv);
        float stoneGrain=dot(stoneSample.rgb,vec3(.2126,.7152,.0722));
        diffuseColor*=vec4(vec3(stoneGrain),stoneSample.a);
      #endif
      float broad=guardianNoise(vGuardianStone*3.7);
      float mottling=guardianNoise(vGuardianStone*18.);
      float recess=vGuardianSurface.x;
      float exposed=vGuardianSurface.y;
      vec3 footprint=fwidth(vGuardianStone*155.);
      float grainFade=1.-smoothstep(.4,1.3,max(footprint.x,max(footprint.y,footprint.z)));
      float grain=mix(.5,guardianNoise(vGuardianStone*155.),grainFade);
      float oxide=clamp(smoothstep(.33,.7,broad*.68+mottling*.32)*${damp ? ".91" : ".65"}+recess*.4-exposed*.15,0.,.95);
      ${
        metal
          ? `
        vec3 tarnish=${ash ? "vec3(.115,.105,.095)" : sea ? "vec3(.045,.115,.085)" : damp ? "vec3(.045,.085,.045)" : "vec3(.2,.145,.085)"};
        diffuseColor.rgb=mix(diffuseColor.rgb,tarnish,oxide);
        diffuseColor.rgb*=mix(.77,1.12,mottling)*(.96+.08*grain);
      `
          : `
        diffuseColor.rgb*=mix(.73,1.07,broad)*(.97+.06*grain);
        ${damp ? `diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,.67,.43),oxide*.48);` : ""}
        ${sea ? "diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.55,.44),smoothstep(.65,.8,mottling)*exposed*.2);" : ""}
      `
      }
      diffuseColor.rgb*=1.-recess*.28;
      `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor=clamp(${metal ? "mix(.46,.96,oxide)+(grain-.5)*.14" : "roughnessFactor+(grain-.5)*.05+recess*.04"},.28,.99);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        ${metal ? "metalnessFactor=mix(.86,.14,oxide);" : ""}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float pit=(grain-.5)*${metal ? ".0011" : ".0015"}+smoothstep(.55,.75,mottling)*${metal ? ".0013" : ".0008"};
        vec3 stoneDx=dFdx(-vViewPosition),stoneDy=dFdy(-vViewPosition);
        vec3 stoneR1=cross(stoneDy,normal),stoneR2=cross(normal,stoneDx);
        float stoneDet=dot(stoneDx,stoneR1);
        vec3 stoneGrad=sign(stoneDet)*(dFdx(pit)*stoneR1+dFdy(pit)*stoneR2);
        normal=normalize(max(abs(stoneDet),1.e-9)*normal-stoneGrad);
      `,
      );
  };
  material.customProgramCacheKey = () => `guardian-surface-${biome}-${metal}-2`;
}
