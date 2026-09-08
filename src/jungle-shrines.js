import * as THREE from "three";
import { random } from "./campaign.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";

// The five relay stops have different surviving crowns. Foundations and piers
// stay outside the two-metre ring used to approach the fire from either side.
export const SHRINE_CROWNS = [
  { name: "Root shrine", heights: [3.35, 2.35], crown: "broken" },
  { name: "Sanctuary beacon", heights: [3.35, 3.35], crown: "arch" },
  { name: "Outer brazier", heights: [2.8, 2.8], crown: "twins" },
  { name: "Raincourt brazier", heights: [2.45, 3.35], crown: "broken" },
  { name: "Inner beacon", heights: [3.55, 3.55], crown: "spire" },
];

export function lotusBowlGeometry() {
  // A continuous cross section includes the underside, outside, rolled lip,
  // inside and floor. The centre is an open basin, not a capped cone.
  const section = [
    [0, 1.06],
    [0.22, 1.06],
    [0.3, 1.1],
    [0.43, 1.16],
    [0.59, 1.3],
    [0.73, 1.47],
    [0.75, 1.5],
    [0.74, 1.53],
    [0.69, 1.53],
    [0.67, 1.47],
    [0.53, 1.3],
    [0.37, 1.2],
    [0.2, 1.17],
    [0, 1.17],
  ];
  const g = new THREE.LatheGeometry(
    section.map((p) => new THREE.Vector2(...p)),
    64,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      r = Math.hypot(x, z);
    if (r < 0.01) continue;
    const flute = 1 + Math.sin(Math.atan2(x, z) * 16) * 0.014;
    p.setXYZ(i, x * flute, p.getY(i), z * flute);
  }
  g.computeVertexNormals();
  return g;
}

function bronzeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: "Weathered relay bronze",
    color: 0xa78348,
    roughness: 0.6,
    metalness: 0.78,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vRelayPoint;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRelayPoint=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vRelayPoint;
        float relayNoise(vec3 p){return .5+.5*sin(p.x*7.3+sin(p.z*11.7))*sin(p.y*13.1+sin(p.x*9.2));}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float patina=smoothstep(.35,.73,relayNoise(vRelayPoint*1.8));
        float pits=relayNoise(vRelayPoint*32.0);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.048,.115,.092),patina*.8);
        diffuseColor.rgb*=.8+.2*pits;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.94,patina);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor*=1.0-patina*.75;`,
      );
  };
  material.customProgramCacheKey = () => "vesper-relay-bronze-1";
  return material;
}

function emberCloud(rng, clock) {
  const positions = [],
    seeds = [];
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2,
      r = rng() * 0.25;
    positions.push(Math.cos(a) * r, 1.35, Math.sin(a) * r);
    seeds.push(rng(), rng());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.3, 0), 1.4);
  const material = new THREE.ShaderMaterial({
    name: "Relay fire sparks",
    uniforms: { time: clock },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `uniform float time; attribute vec2 seed; varying float life;
      void main(){life=fract(time*(.16+seed.y*.13)+seed.x);vec3 p=position;
        p.y+=life*1.8;p.x+=sin(life*8.0+seed.y*12.0)*life*.25;p.z+=cos(life*9.0+seed.x*13.0)*life*.18;
        vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.8+seed.y)*18.0/max(1.0,-mv.z),1.0,4.0);}`,
    fragmentShader: `varying float life;void main(){float r=length(gl_PointCoord-.5)*2.0;
      float a=(1.0-smoothstep(.1,1.0,r))*sin(life*3.14159265)*.55;
      gl_FragColor=vec4(1.0,.3,.055,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  return new THREE.Points(geometry, material);
}

export function buildJungleShrine(game, f, group) {
  if (game.level.id !== "verdant" || f.kind !== "brazier") return false;
  const index = f.stage === 0 ? f.step - 1 : f.step + 2;
  const plan = SHRINE_CROWNS[index];
  const rng = random(game.level.seed + 725 + index * 111);
  const root = new THREE.Group();
  root.name = plan.name + " · carved flame shrine";
  group.add(root);
  const stone = game.templeMaterial || game.stoneMat;
  const bronze = bronzeMaterial();
  const charcoal = new THREE.MeshStandardMaterial({
    name: "Charred resin wood",
    color: 0x28241e,
    roughness: 1,
  });
  const coals = new THREE.MeshStandardMaterial({
    name: "Relay ember bed",
    color: 0x2c2520,
    roughness: 1,
    emissive: 0xc63308,
    emissiveIntensity: 0,
  });
  let serial = 0;
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    if (material.vertexColors && !geometry.attributes.color) {
      const values = new Float32Array(geometry.attributes.position.count * 3);
      const shade = 0.78 + rng() * 0.23;
      for (let i = 0; i < values.length; i += 3)
        values.set([shade, shade, shade * 0.96], i);
      geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const block = (w, h, d, x, y, z) =>
    add(stoneBlockGeometry(w, h, d, ++serial + index * 100), stone, x, y, z);
  const lathe = (section, material = stone, segments = 32) =>
    add(
      new THREE.LatheGeometry(
        section.map((p) => new THREE.Vector2(...p)),
        segments,
      ),
      material,
    );
  const collision = (x, z, w, d, h) =>
    game.obstacles.push({
      x: group.position.x + x,
      z: group.position.z + z,
      w,
      d,
      h,
      shrine: f.id,
    });
  // Separate moulded courses make a heavy pedestal with actual contact shadows.
  block(1.85, 0.2, 1.85, 0, 0.08, 0);
  block(1.59, 0.14, 1.59, 0, 0.24, 0);
  lathe(
    [
      [0.73, 0.31],
      [0.67, 0.35],
      [0.54, 0.42],
      [0.49, 0.88],
      [0.59, 0.96],
      [0.61, 1.02],
      [0.35, 1.07],
    ],
    stone,
    8,
  );
  lathe(
    [
      [0.62, 0.93],
      [0.65, 0.98],
      [0.65, 1.02],
      [0.58, 1.06],
    ],
    bronze,
    32,
  );
  add(lotusBowlGeometry(), bronze);
  collision(0, 0, 1.05, 1.05, 1.53);

  // Small rosettes occupy each face of the octagonal drum.
  for (let side = 0; side < 8; side++) {
    const a = (side * Math.PI) / 4,
      panel = add(
        carvedPanelGeometry(0.28, 0.42, index, [12, 18]),
        stone,
        Math.sin(a) * 0.61,
        0.45,
        Math.cos(a) * 0.61,
      );
    panel.rotation.y = a;
  }
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      points = [];
    for (let k = 0; k < 6; k++) {
      const t = k / 5,
        r = 0.39 + t * 0.29;
      points.push(
        new THREE.Vector3(Math.sin(a) * r, 1.15 + t * 0.31, Math.cos(a) * r),
      );
    }
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        8,
        0.016,
        5,
        false,
      ),
      bronze,
    );
  }
  // Open rings with visible attachment lugs hang below the bowl's lip.
  for (const side of [-1, 1]) {
    const ring = add(
      new THREE.TorusGeometry(0.15, 0.028, 7, 24),
      bronze,
      side * 0.67,
      1.24,
      0,
    );
    ring.rotation.y = Math.PI / 2;
    add(new THREE.SphereGeometry(0.049, 8, 6), bronze, side * 0.69, 1.42, 0);
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2,
      r = rng() * 0.34;
    const ember = add(
      new THREE.IcosahedronGeometry(0.07 + rng() * 0.065, 1),
      coals,
      Math.cos(a) * r,
      1.23,
      Math.sin(a) * r,
    );
    ember.scale.set(1, 0.45, 1);
  }
  for (let i = 0; i < 5; i++) {
    const log = add(
      new THREE.CylinderGeometry(0.035, 0.052, 0.56 + rng() * 0.13, 7, 3),
      charcoal,
      (rng() - 0.5) * 0.21,
      1.24 + i * 0.022,
      (rng() - 0.5) * 0.21,
    );
    log.rotation.set(Math.PI / 2, 0, i * 1.9);
    log.rotation.y = (rng() - 0.5) * 0.2;
  }
  // Piers have recessed floral panels, chamfered masonry joints and stepped caps.
  for (const [i, side] of [-1, 1].entries()) {
    const x = side * 2.7,
      z = -1.5,
      h = plan.heights[i];
    block(1.02, 0.2, 1.03, x, 0.1, z);
    block(0.84, 0.2, 0.87, x, 0.3, z);
    const count = Math.ceil((h - 0.6) / 0.34),
      course = (h - 0.6) / count;
    for (let row = 0; row < count; row++) {
      const y = 0.4 + (row + 0.5) * course;
      block(0.68, course - 0.018, 0.5, x, y, z);
      for (const edge of [-1, 1])
        block(0.1, course - 0.018, 0.72, x + edge * 0.29, y, z);
    }
    // Backing stays behind the recessed carving; narrow jambs protect its edges.
    const panelHeight = Math.min(1.8, h - 0.9);
    block(0.68, 0.14, 0.72, x, 0.52, z);
    block(0.68, 0.14, 0.72, x, 0.68 + panelHeight, z);
    block(0.86, 0.16, 0.9, x, h - 0.13, z);
    block(1.02, 0.14, 1.02, x, h + 0.02, z);
    for (const facing of [-1, 1]) {
      const panel = add(
        carvedPanelGeometry(0.47, Math.min(1.8, h - 0.9), index + i, [18, 40]),
        stone,
        x,
        0.6,
        z + facing * 0.371,
      );
      panel.rotation.y = facing < 0 ? Math.PI : 0;
    }
    collision(x, z, 0.66, 0.66, h + 0.1);
    // Camera capture uses the whole shaft, avoiding gaps between short courses.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.86, h, 0.9), stone);
    proxy.position.set(x, h / 2, z);
    root.add(proxy);
    game.cameraSurfaces?.capture(proxy);
    root.remove(proxy);
    game.templeCaptureGeometry ??= [];
    game.templeCaptureGeometry.push(proxy.geometry);
  }
  const crownBlock = (w, h, d, x, y, z = -1.5) => {
    const mesh = block(w, h, d, x, y, z);
    game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  if (plan.crown === "broken") {
    const side = plan.heights[0] > plan.heights[1] ? -1 : 1;
    for (let row = 0; row < 3; row++)
      crownBlock(
        2.6 - row * 0.5,
        0.22,
        0.85,
        side * (1.95 + row * 0.12),
        3.62 + row * 0.22,
      );
    const stump = block(
      0.72,
      0.45,
      0.73,
      -side * 2.7,
      plan.heights[side < 0 ? 1 : 0] + 0.27,
      -1.5,
    );
    stump.rotation.z = side * 0.04;
  } else if (plan.crown === "twins") {
    for (const side of [-1, 1])
      for (let row = 0; row < 4; row++)
        block(
          0.86 - row * 0.17,
          0.2,
          0.88 - row * 0.17,
          side * 2.7,
          3.03 + row * 0.2,
          -1.5,
        );
  } else {
    const base = plan.heights[0] + 0.25;
    for (const side of [-1, 1])
      for (let row = 0; row < 3; row++)
        crownBlock(
          1.36 + row * 0.42,
          0.24,
          0.86,
          side * (2.32 - row * 0.35),
          base + row * 0.24,
        );
    crownBlock(2.32, 0.28, 0.88, 0, base + 0.72);
    crownBlock(2.64, 0.13, 1.02, 0, base + 0.925);
    if (plan.crown === "spire")
      for (let row = 0; row < 5; row++)
        crownBlock(
          1.22 - row * 0.19,
          0.22,
          0.83 - row * 0.1,
          0,
          base + 1.11 + row * 0.22,
        );
  }
  mergeArchitecture(root);
  // The animated fuel remains separate from static stone/bronze batches.
  const clock = { value: 0 },
    sparks = emberCloud(rng, clock);
  sparks.visible = false;
  group.add(sparks);
  const fire = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.1, 7),
    new THREE.MeshBasicMaterial({ color: 0xffbb6a, toneMapped: false }),
  );
  fire.position.y = 1.95;
  fire.visible = false;
  group.add(fire);
  f.fire = fire;
  game.flames.push(fire);
  f.core = new THREE.Group();
  group.add(f.core);
  f.shrine = { index, root, coals, sparks, clock };
  return true;
}

export function updateJungleShrine(game, f, done) {
  if (!f.shrine) return;
  const { coals, sparks, clock } = f.shrine;
  clock.value = game.elapsed;
  coals.emissiveIntensity = done
    ? 0.65 + Math.sin(game.elapsed * 3.1 + f.shrine.index) * 0.09
    : 0;
  sparks.visible =
    done && f.group.position.distanceTo(game.player.position) < 40;
}
