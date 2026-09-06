import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// These coordinates survive static merging and instancing. Oxidation stays on
// its casting when a duct or wheel rotates rather than sliding through it.
export function windSurface(geometry, cavity = 0) {
  if (!geometry.attributes.windCoord)
    geometry.setAttribute("windCoord", geometry.attributes.position.clone());
  if (!geometry.attributes.windCavity)
    geometry.setAttribute(
      "windCavity",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(cavity),
        1,
      ),
    );
  return geometry;
}

export function windMetal(finish = "cast") {
  const values = {
    cast: [0x8e6a48, 0.78, 0.4, 0.64],
    worn: [0xb28f58, 0.84, 0.32, 0.23],
    iron: [0x39413b, 0.62, 0.58, 0.2],
  }[finish];
  const material = new THREE.MeshStandardMaterial({
    name: `Wind engine ${finish} metal`,
    color: values[0],
    metalness: values[1],
    roughness: values[2],
  });
  material.userData.windMetal = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windPatinaAmount = { value: values[3] };
    shader.uniforms.windPatinaColor = { value: new THREE.Color(0x37594d) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 windCoord; attribute float windCavity; varying vec3 vWindCoord; varying float vWindCavity;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWindCoord=windCoord; vWindCavity=windCavity;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWindCoord; varying float vWindCavity;
        uniform float windPatinaAmount; uniform vec3 windPatinaColor;
        float windHash(vec3 p) {
          p=fract(p*.1031); p+=dot(p,p.yzx+33.33);
          return fract((p.x+p.y)*p.z);
        }
        float windNoise(vec3 p) {
          vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(windHash(i),windHash(i+vec3(1,0,0)),f.x),
                         mix(windHash(i+vec3(0,1,0)),windHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(windHash(i+vec3(0,0,1)),windHash(i+vec3(1,0,1)),f.x),
                         mix(windHash(i+vec3(0,1,1)),windHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float castMottle=windNoise(vWindCoord*5.3)*.64+windNoise(vWindCoord*21.7)*.36;
        float oxide=clamp(smoothstep(.34,.7,castMottle)*windPatinaAmount+vWindCavity*.48,0.,.94);
        vec3 footprint=fwidth(vWindCoord*140.);
        float grainFade=1.-smoothstep(.35,1.3,max(footprint.x,max(footprint.y,footprint.z)));
        float grain=mix(.5,windNoise(vWindCoord*140.),grainFade);
        diffuseColor.rgb=mix(diffuseColor.rgb,windPatinaColor,oxide);
        diffuseColor.rgb*=mix(.86,1.12,castMottle)*(.96+.08*grain)*(1.-vWindCavity*.3);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=clamp(mix(roughnessFactor,.86,oxide)+(grain-.5)*.14,.22,.94);",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.18,oxide);",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float castHeight=(grain-.5)*.0007+smoothstep(.63,.84,castMottle)*.0008;
        vec3 windDx=dFdx(-vViewPosition), windDy=dFdy(-vViewPosition);
        vec3 windR1=cross(windDy,normal), windR2=cross(normal,windDx);
        float windDet=dot(windDx,windR1);
        vec3 windGradient=sign(windDet)*(dFdx(castHeight)*windR1+dFdy(castHeight)*windR2);
        normal=normalize(max(abs(windDet),1.e-12)*normal-windGradient);`,
      );
  };
  material.customProgramCacheKey = () => "wind-casting-v1";
  return material;
}

function join(parts, key, metal = true) {
  const expanded = parts.map((g) => {
    if (metal) windSurface(g);
    return g.index ? g.toNonIndexed() : g.clone();
  });
  const result = mergeGeometries(expanded);
  expanded.forEach((g) => g.dispose());
  parts.forEach((g) => g.dispose());
  result.userData.windKey = key;
  return result;
}
const lathe = (profile, segments = 40) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
const roundBox = (w, h, d, radius = 0.012) =>
  new RoundedBoxGeometry(w, h, d, 2, radius);
const bolt = (radius, depth) =>
  new THREE.CylinderGeometry(radius, radius, depth, 6).rotateX(Math.PI / 2);

function stoneCoordinates(source) {
  const geometry = source.toNonIndexed(),
    p = geometry.attributes.position,
    uv = geometry.attributes.uv,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  // Project each carved face at one texture repeat per metre. Lathe UVs squash
  // the whole stone map into a narrow band along these shallow foundations.
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(c.sub(a));
    const axis =
      Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z))
        ? "y"
        : Math.abs(n.x) > Math.abs(n.z)
          ? "x"
          : "z";
    for (let j = i; j < i + 3; j++)
      uv.setXY(
        j,
        axis === "x" ? p.getZ(j) : p.getX(j),
        axis === "y" ? p.getZ(j) : p.getY(j),
      );
  }
  source.dispose();
  return geometry;
}

// Outer skin, inner skin and annular lips form a closed wall with an open bore.
// Inward normals and extra cavity oxidation make each mouth readable from below.
export function windDuctGeometry(curve) {
  const outer = windSurface(new THREE.TubeGeometry(curve, 32, 0.24, 24, false)),
    inner = windSurface(new THREE.TubeGeometry(curve, 32, 0.185, 24, false), 1),
    normals = inner.attributes.normal,
    index = inner.index;
  for (let i = 0; i < normals.count; i++)
    normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  const parts = [outer, inner];
  for (const t of [0, 1]) {
    const direction = curve.getTangent(t).multiplyScalar(t ? 1 : -1),
      position = [],
      normal = [],
      uv = [],
      indices = [];
    // Copy the tube's transported end frame exactly. Reconstructing a ring
    // from a tangent can leave a hairline crack at a curved casting's mouth.
    for (const tube of [outer, inner])
      for (let j = 0; j <= 24; j++) {
        const p = new THREE.Vector3().fromBufferAttribute(
          tube.attributes.position,
          t * 32 * 25 + j,
        );
        position.push(...p.toArray());
        normal.push(...direction.toArray());
        uv.push(j / 24, tube === inner ? 0 : 1);
      }
    const a = new THREE.Vector3().fromArray(position, 0),
      b = new THREE.Vector3().fromArray(position, 3),
      c = new THREE.Vector3().fromArray(position, 26 * 3);
    const reverse = b.sub(a).cross(c.sub(a)).dot(direction) < 0;
    for (let j = 0; j < 24; j++) {
      const triangle = [j, j + 1, j + 26, j, j + 26, j + 25];
      if (reverse) triangle.reverse();
      indices.push(...triangle);
    }
    const ring = new THREE.BufferGeometry();
    ring.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(position, 3),
    );
    ring.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    ring.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    ring.setIndex(indices);
    parts.push(ring);
  }
  const geometry = join(parts, "hollow-duct");
  geometry.userData.windPart = "duct";
  return geometry;
}

export function windArtKit() {
  const plinth = lathe(
    [
      [0, 0.01],
      [0.95, 0.01],
      [1.02, 0.06],
      [1.02, 0.13],
      [0.96, 0.19],
      [0.82, 0.19],
      [0.82, 0.25],
      [0.76, 0.3],
      [0, 0.3],
    ],
    12,
  );
  const shell = lathe([
    [0, 0.25],
    [0.61, 0.25],
    [0.65, 0.29],
    [0.65, 0.34],
    [0.58, 0.39],
    [0.56, 1.14],
    [0.6, 1.2],
    [0.65, 1.22],
    [0.65, 1.27],
    [0, 1.27],
  ]);
  const ribs = [shell];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ribs.push(roundBox(0.055, 0.62, 0.035).translate(0, 0.8, 0.576).rotateY(a));
  }
  const housing = join(ribs, "bearing-housing");
  const cap = lathe([
    [0, 1.27],
    [0.64, 1.27],
    [0.69, 1.29],
    [0.72, 1.32],
    [0.72, 1.36],
    [0.69, 1.39],
    [0.57, 1.39],
    [0.57, 1.44],
    [0.53, 1.47],
    [0, 1.47],
  ]);
  const capParts = [cap];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    capParts.push(
      new THREE.CylinderGeometry(0.028, 0.028, 0.033, 6).translate(
        Math.sin(a) * 0.63,
        1.403,
        Math.cos(a) * 0.63,
      ),
    );
  }
  const crown = join(capParts, "bearing-crown");
  const wheelParts = [
    new THREE.TorusGeometry(0.31, 0.036, 10, 48),
    lathe(
      [
        [0, -0.055],
        [0.065, -0.055],
        [0.085, -0.025],
        [0.085, 0.025],
        [0.06, 0.06],
        [0, 0.06],
      ],
      24,
    ).rotateX(Math.PI / 2),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    wheelParts.push(
      roundBox(0.034, 0.23, 0.045, 0.01).translate(0, 0.17, 0).rotateZ(a),
    );
  }
  const wheel = join(wheelParts, "handwheel");
  const flangeParts = [
    lathe(
      [
        [0.237, -0.045],
        [0.282, -0.045],
        [0.316, -0.026],
        [0.316, 0.026],
        [0.282, 0.045],
        [0.237, 0.045],
        [0.237, -0.045],
      ],
      32,
    ).rotateX(Math.PI / 2),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    for (const side of [-1, 1])
      flangeParts.push(
        bolt(0.022, 0.018).translate(
          Math.cos(a) * 0.288,
          Math.sin(a) * 0.288,
          side * 0.044,
        ),
      );
  }
  const flange = join(flangeParts, "duct-flange");
  const bearing = lathe(
    [
      [0, -0.04],
      [0.14, -0.04],
      [0.18, -0.01],
      [0.18, 0.045],
      [0.14, 0.065],
      [0, 0.065],
    ],
    32,
  ).rotateX(Math.PI / 2);
  const panel = roundBox(1.1, 0.3, 0.07, 0.025);
  panel.userData.windKey = "nameplate";
  const fixedParts = [];
  for (const side of [-1, 1]) {
    fixedParts.push(
      roundBox(0.08, 0.68, 0.065, 0.012)
        .rotateZ(side * 0.6)
        .translate(side * 0.17, 1.09, 0.96),
    );
    for (const end of [-1, 1]) {
      const x = side * 0.17 - end * Math.sin(side * 0.6) * 0.28,
        y = 1.09 + end * Math.cos(0.6) * 0.28;
      fixedParts.push(
        bolt(0.031, 0.025).translate(x, y, 1.007),
        new THREE.CylinderGeometry(0.046, 0.046, 0.28, 12)
          .rotateX(Math.PI / 2)
          .translate(x, y, 0.815),
      );
    }
  }
  const brace = join(fixedParts, "fixed-bearing-brace").translate(0, 0, -0.25);
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 0.2);
  shape.quadraticCurveTo(-0.23, 0.6, -0.15, 0.92);
  shape.quadraticCurveTo(-0.02, 0.99, 0.14, 0.89);
  shape.quadraticCurveTo(0.22, 0.55, 0.045, 0.2);
  shape.closePath();
  const vane = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.009,
    bevelThickness: 0.009,
    curveSegments: 10,
  });
  vane.translate(0, 0, -0.0175);
  const vp = vane.attributes.position;
  for (let i = 0; i < vp.count; i++)
    vp.setZ(i, vp.getZ(i) + vp.getX(i) * (0.25 + vp.getY(i) * 0.55));
  vane.scale(0.915, 0.915, 1);
  vane.computeVertexNormals();
  const fanParts = [];
  for (let i = 0; i < 6; i++)
    fanParts.push(vane.clone().rotateZ((i * Math.PI) / 3));
  vane.dispose();
  const vanes = join(fanParts, "turbine-vanes");
  const hub = lathe(
    [
      [0, -0.13],
      [0.19, -0.13],
      [0.23, -0.1],
      [0.23, 0.09],
      [0.18, 0.16],
      [0.08, 0.2],
      [0, 0.2],
    ],
    32,
  ).rotateX(Math.PI / 2);
  const frameParts = [
    new THREE.TorusGeometry(1, 0.09, 10, 64),
    new THREE.TorusGeometry(1, 0.028, 8, 64).translate(0, 0, 0.09),
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    frameParts.push(
      bolt(0.033, 0.055).translate(Math.sin(a), Math.cos(a), 0.088),
    );
  }
  const frame = join(frameParts, "turbine-frame");
  const backParts = [];
  for (let i = 0; i < 4; i++)
    backParts.push(
      roundBox(0.055, 0.93, 0.06)
        .translate(0, 0.5, -0.22)
        .rotateZ((i * Math.PI) / 2),
    );
  const spider = join(backParts, "turbine-spider");
  return {
    plinth: stoneCoordinates(plinth),
    housing,
    crown,
    wheel,
    flange,
    bearing,
    panel,
    brace,
    vanes,
    hub,
    frame,
    spider,
  };
}
