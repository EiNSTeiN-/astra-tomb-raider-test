import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { prepareGardenGeometry } from "./rain-garden-art.js";
import { windMetal } from "./wind-art.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";

// Broad damp and moss variation is interpolated from the masonry vertices.
// The credited color/normal/roughness maps supply the close surface detail.
export function sunStoneMaterial(source) {
  const material = source.clone();
  material.name = "Weathered garden masonry";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSunStone;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 gardenWorld=(modelMatrix*vec4(position,1.0)).xyz;
        float gardenPatch=.5+.5*sin(gardenWorld.x*.83+sin(gardenWorld.z*.63)*1.8)*sin(gardenWorld.z*.71+gardenWorld.y*.23);
        float gardenDamp=1.-smoothstep(2.3,5.3,gardenWorld.y);
        float gardenTop=max(0.,normalize(mat3(modelMatrix)*normal).y);
        vSunStone=vec3(gardenPatch,gardenDamp,gardenTop);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSunStone;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float gardenLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(gardenLuma)*vec3(.96,1.,.93),.72);
        float gardenMoss=smoothstep(.52,.83,vSunStone.x)*(.22+.48*vSunStone.z+.28*vSunStone.y);
        diffuseColor.rgb*=mix(.8,1.08,vSunStone.x)*(1.-vSunStone.y*.22);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.095,.15,.047),gardenMoss*.52);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+gardenMoss*.12,.6,1.);",
      );
  };
  material.customProgramCacheKey = () => "sun-masonry-weather-1";
  return material;
}
// Owned by the current world, so another chapter gets a fresh material set.
export function sunConstructionMaterials(game) {
  return (game.world.userData.sunConstructionMaterials ||= {
    stone: sunStoneMaterial(game.templeMaterial || game.stoneMat),
    bronze: windMetal("cast"),
    iron: windMetal("iron"),
    worn: windMetal("worn"),
    wood: pbrMaterial("monastery-wood", 0xaca287, 0.75),
    rope: pbrMaterial("bark", 0xafa084, 1),
  });
}
export function sunRopeGeometry(a, b, radius = 0.035, sag = 0.075) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    middle = start.clone().add(end).multiplyScalar(0.5);
  middle.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
  const geometry = new THREE.TubeGeometry(curve, 16, radius, 6, false),
    uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setX(i, uv.getX(i) * start.distanceTo(end) * 2);
  return geometry;
}
export function sunLashingGeometry() {
  const points = [];
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 6,
      c = Math.cos(angle),
      s = Math.sin(angle);
    points.push(
      new THREE.Vector3(
        0.083 * Math.sign(c) * Math.cbrt(Math.abs(c)),
        0.96 + (i / 48) * 0.19,
        0.083 * Math.sign(s) * Math.cbrt(Math.abs(s)),
      ),
    );
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    48,
    0.015,
    5,
    false,
  );
}
export function sunArchStone(inner, outer, start, arc, depth) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, start, start + arc, false);
  shape.absarc(0, 0, inner, start + arc, start, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 3,
  }).translate(0, 0, -depth / 2);
}
export function sunPierCourses(base, top) {
  const start = base + 0.42,
    end = top - 0.88,
    count = Math.max(1, Math.ceil((end - start) / 0.46)),
    height = (end - start) / count;
  return Array.from({ length: count }, (_, i) => ({
    y: start + (i + 0.5) * height,
    height: height - 0.012,
    width: 1.69 - (i / count) * 0.13,
    split: i % 2,
  }));
}
function builder(parent, materials) {
  let seed = 51600;
  const add = (g, m, x = 0, y = 0, z = 0, root = parent) => {
    const mesh = new THREE.Mesh(prepareGardenGeometry(g, m), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const block = (w, h, d, x, y, z, m = materials.wood, root = parent) =>
    add(
      m === materials.wood
        ? timberGeometry(w, h, d, ++seed)
        : stoneBlockGeometry(w, h, d, ++seed, 0.018),
      m,
      x,
      y,
      z,
      root,
    );
  const pin = (radius, depth, x, y, z, m = materials.iron, root = parent) => {
    const mesh = add(
      new THREE.CylinderGeometry(radius, radius, depth, 6),
      m,
      x,
      y,
      z,
      root,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  return { add, block, pin };
}
export function buildSunWinch(game, group, label, lettering) {
  const m = sunConstructionMaterials(game),
    { add, block, pin } = builder(group, m);
  block(1.24, 0.15, 0.65, 0, 0.075, 0, m.stone);
  for (let i = 0; i < 3; i++)
    block(1.12, 0.213, 0.57, 0, 0.265 + i * 0.217, 0, m.stone);
  block(1.38, 0.14, 0.79, 0, 0.865, 0, m.stone);
  block(1.24, 0.028, 0.67, 0, 0.95, 0, m.iron);
  for (const x of [-0.18, 0.18]) {
    block(0.075, 0.43, 0.28, x, 1.165, -0.095, m.iron);
    block(0.22, 0.065, 0.4, x, 0.997, -0.095, m.bronze);
    for (const z of [-0.235, 0.035])
      pin(0.028, 0.03, x, 0.997, z, m.worn).rotation.x = 0;
  }
  pin(0.13, 0.33, 0, 1.35, -0.095, m.iron);
  const wheel = new THREE.Group();
  wheel.name = "Cast bronze handwheel";
  wheel.position.set(0, 1.35, 0.12);
  wheel.rotation.z = Math.PI / 4;
  wheel.userData.animated = true;
  group.add(wheel);
  for (const z of [-0.02, 0.02])
    add(new THREE.TorusGeometry(0.379, 0.026, 8, 40), m.bronze, 0, 0, z, wheel);
  pin(0.105, 0.13, 0, 0, 0, m.worn, wheel);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const spoke = block(
      0.055,
      0.285,
      0.045,
      Math.sin(angle) * 0.215,
      Math.cos(angle) * 0.215,
      0,
      m.bronze,
      wheel,
    );
    spoke.rotation.z = -angle;
    pin(
      0.019,
      0.035,
      Math.sin(angle) * 0.347,
      Math.cos(angle) * 0.347,
      0.041,
      m.worn,
      wheel,
    );
  }
  // These grip locations, radii and axes match the delivered hand pose.
  const grips = [-1, 1].map((side) => {
    const grip = new THREE.Object3D();
    grip.position.set(side * 0.23, 0, 0.16);
    wheel.add(grip);
    const bar = add(
      new THREE.CylinderGeometry(0.019, 0.019, 0.2, 16),
      m.iron,
      0,
      0,
      0,
      grip,
    );
    bar.rotation.z = Math.PI / 2;
    for (const x of [-0.1, 0.1])
      block(0.025, 0.04, 0.16, side * 0.23 + x, 0, 0.08, m.bronze, wheel);
    return grip;
  });
  const gearbox = new THREE.Group();
  gearbox.position.set(0, 0, -0.205);
  wheel.add(gearbox);
  pin(0.205, 0.055, 0, 0, 0, m.iron, gearbox);
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8,
      tooth = block(
        0.048,
        0.053,
        0.066,
        Math.cos(angle) * 0.215,
        Math.sin(angle) * 0.215,
        0,
        m.bronze,
        gearbox,
      );
    tooth.rotation.z = angle;
  }
  // A small readable tablet is fixed to the plinth, below the working hands.
  block(1.18, 0.315, 0.048, 0, 0.53, 0.308, m.iron);
  for (const y of [0.382, 0.678])
    block(1.18, 0.018, 0.014, 0, y, 0.339, m.bronze);
  for (const x of [-0.568, 0.568]) {
    block(0.019, 0.315, 0.015, x, 0.53, 0.339, m.bronze);
    for (const y of [0.415, 0.645]) pin(0.015, 0.014, x, y, 0.351, m.worn);
  }
  const panel = lettering(label, 1.11);
  panel.position.set(0, 0.53, 0.347);
  group.add(panel);
  for (const root of [gearbox, wheel]) mergeArchitecture(root);
  return { wheel, grips, group };
}
export function buildSunTruss({
  add,
  block,
  beam,
  root,
  length,
  width,
  wood,
  metal,
  rope,
}) {
  const half = length / 2,
    low = -1.08,
    top = -0.31;
  for (const side of [-1, 1]) {
    const z = side * width;
    beam([-half, low, z], [half, low, z], 0.19, wood, root);
    const count = Math.ceil(length / 2.6),
      run = length / count;
    for (let i = 0; i < count; i++) {
      const x = -half + i * run;
      beam(
        [x, i % 2 ? low : top, z],
        [x + run, i % 2 ? top : low, z],
        0.145,
        wood,
        root,
      );
      const plate = block(
        0.27,
        0.2,
        0.035,
        x,
        i % 2 ? low : top,
        z + side * 0.105,
        metal,
        root,
      );
      plate.name = "Truss joint strap";
      for (const dx of [-0.075, 0.075]) {
        const bolt = add(
          new THREE.CylinderGeometry(0.023, 0.023, 0.045, 6),
          metal,
          x + dx,
          i % 2 ? low : top,
          z + side * 0.133,
          root,
        );
        bolt.rotation.x = Math.PI / 2;
      }
    }
  }
  // Cross ties keep the two trusses connected under the plank deck.
  for (let x = -half + 1.2; x < half; x += 3)
    beam([x, -0.82, -width], [x, -0.82, width], 0.13, wood, root);
}
export function buildSunRail({ add, block, root, side, wood, rope, metal }) {
  for (const end of [-1, 1]) {
    const xs = [3.5, 6, 9, 12].map((x) => end * x);
    for (let i = 0; i < xs.length - 1; i++)
      add(
        sunRopeGeometry(
          [xs[i], 1.06, side * 1.5],
          [xs[i + 1], 1.06, side * 1.5],
          0.043,
          0.13,
        ),
        rope,
        0,
        0,
        0,
        root,
      );
    for (const x of xs) {
      block(0.18, 0.075, 0.19, x, 0.065, side * 1.5, metal, root);
      add(sunLashingGeometry(), rope, x, 0, side * 1.5, root);
    }
  }
}
