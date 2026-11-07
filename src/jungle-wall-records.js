import * as THREE from "three";
import { materialTextureLoader } from "./asset-loading.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

export const JUNGLE_RECORD_NAMES = [
  "Dawn beacons",
  "Root gatehouse",
  "Rain garden",
  "Keeper's vigil",
  "Eastern lens",
  "Hanging crossing",
  "Beacon chain",
  "Heart seal",
];

export function jungleRecordPlan(stage, length = 13) {
  if (!Number.isInteger(stage) || !JUNGLE_RECORD_NAMES[stage])
    throw new RangeError("Unknown jungle record");
  const width = length - 1.5,
    height = width / 3,
    bottom = 1.25;
  return {
    stage,
    name: JUNGLE_RECORD_NAMES[stage],
    length,
    width,
    height,
    bottom,
    top: bottom + height,
    rear: -0.3,
    face: -0.52,
    frameFront: -0.7,
    crown: stage % 3,
  };
}

export function jungleRecordMaterial(source) {
  const material = source.clone(),
    atlas = materialTextureLoader().load(
      "/assets/textures/jungle-records-atlas.webp",
    );
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  material.name = "Jungle painted trial records";
  material.userData.additionalTextures = [atlas];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.jungleRecordAtlas = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 jungleRecordCoord; varying vec4 vJungleRecordCoord;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvJungleRecordCoord=jungleRecordCoord;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D jungleRecordAtlas; varying vec4 vJungleRecordCoord;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 story=clamp(vJungleRecordCoord.xy,0.,1.);
        float stage=floor(vJungleRecordCoord.z+.5);
        vec2 cell=vec2(mod(stage,2.),3.-floor(stage*.5));
        vec2 atlasUv=(cell*vec2(784.,272.)+vec2(8.5)+story*vec2(767.,255.))/vec2(1568.,1088.);
        vec3 painting=texture2D(jungleRecordAtlas,atlasUv).rgb;
        float edge=min(min(story.x,1.-story.x),min(story.y,1.-story.y));
        float paint=.9*smoothstep(0.,.018,edge)*vJungleRecordCoord.w;
        diffuseColor.rgb=mix(diffuseColor.rgb,painting,paint);
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-jungle-painted-records-1";
  return material;
}

// A closed plaster-bearing stone slab, with a lightly uneven painted front.
// The back lies in the retained wall core, and all edge returns are plain stone.
export function jungleRecordGeometry(plan, segments = [48, 16]) {
  const { width: w, height: h, stage } = plan,
    [nx, ny] = segments,
    positions = [],
    uv = [],
    story = [],
    indices = [];
  const vertex = (x, y, z, mask = 0) => {
    const id = positions.length / 3;
    positions.push(x, y, z);
    uv.push(x / 2, y / 2);
    story.push(x / w + 0.5, y / h, stage, mask);
    return id;
  };
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * w,
        y = (j / ny) * h,
        ripple = Math.sin(x * 2.7 + stage) * Math.sin(y * 3.1) * 0.005;
      vertex(x, y, 0.02 + ripple, 1);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + nx + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const border = [];
  for (let i = 0; i < nx; i++) border.push(i);
  for (let j = 0; j < ny; j++) border.push(j * (nx + 1) + nx);
  for (let i = nx; i > 0; i--) border.push(ny * (nx + 1) + i);
  for (let j = ny; j > 0; j--) border.push(j * (nx + 1));
  const back = border.map((a) =>
      vertex(positions[a * 3], positions[a * 3 + 1], -0.2),
    ),
    center = vertex(0, h / 2, -0.2);
  for (let i = 0; i < border.length; i++) {
    const next = (i + 1) % border.length,
      a = border[i],
      b = border[next];
    indices.push(center, back[next], back[i]);
    const fa = vertex(...positions.slice(a * 3, a * 3 + 3)),
      fb = vertex(...positions.slice(b * 3, b * 3 + 3)),
      ba = vertex(positions[a * 3], positions[a * 3 + 1], -0.2),
      bb = vertex(positions[b * 3], positions[b * 3 + 1], -0.2);
    indices.push(fa, ba, bb, fa, bb, fb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute(
    "jungleRecordCoord",
    new THREE.Float32BufferAttribute(story, 4),
  );
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

export function buildJungleWallRecord(stage, length, m, add) {
  const plan = jungleRecordPlan(stage, length),
    frames = [],
    { width: w, height: h, bottom, top } = plan;
  let seed = 47201 + stage * 811;
  m.jungleRecord ??= jungleRecordMaterial(m.trim);
  const picture = add(
    jungleRecordGeometry(plan),
    m.jungleRecord,
    0,
    bottom,
    -0.5,
  );
  picture.rotation.y = Math.PI;
  const block = (width, height, depth, x, y, z) => {
    const geometry = stoneBlockGeometry(width, height, depth, seed++, 0.018);
    geometry.computeBoundingBox();
    frames.push({
      min: geometry.boundingBox.min
        .clone()
        .add(new THREE.Vector3(x, y, z))
        .toArray(),
      max: geometry.boundingBox.max
        .clone()
        .add(new THREE.Vector3(x, y, z))
        .toArray(),
    });
    add(geometry, m.trim, x, y, z);
  };
  const course = (width, height, y, depth = 0.34, z = -0.49) => {
    // The retained wall core seals the fine dressed joints. Every stone's back
    // embeds into that core rather than being carried by a single corner.
    const count = Math.ceil(width / 1.45),
      step = width / count;
    for (let i = 0; i < count; i++)
      block(step - 0.014, height, depth, (i + 0.5) * step - width / 2, y, z);
  };
  course(w + 0.56, 0.2, bottom - 0.13);
  course(w + 0.68, 0.12, bottom - 0.27, 0.4);
  course(w + 0.5, 0.2, top + 0.13);
  course(w + 0.7, 0.12, top + 0.28, 0.42);
  for (const sign of [-1, 1])
    for (let row = 0; row < 6; row++)
      block(
        0.24,
        h / 6 - 0.012,
        0.3,
        sign * (w / 2 + 0.14),
        bottom + ((row + 0.5) * h) / 6,
        -0.49,
      );
  // Modest unequal caps retain the open court and the existing 7m wall height.
  if (plan.crown === 0) {
    course(w * 0.54, 0.16, top + 0.43, 0.3);
    course(w * 0.3, 0.14, top + 0.58, 0.28);
  } else if (plan.crown === 1) {
    for (const sign of [-1, 1]) {
      block(1.24, 0.18, 0.32, sign * (w / 2 - 0.45), top + 0.44, -0.47);
      block(0.72, 0.16, 0.28, sign * (w / 2 - 0.45), top + 0.6, -0.47);
    }
  } else {
    for (const x of [-w * 0.32, 0, w * 0.32])
      block(0.8, 0.2, 0.3, x, top + 0.45, -0.48);
  }
  return {
    ...plan,
    frames,
    panel: {
      x: 0,
      y: bottom,
      z: -0.5,
      front: -0.525,
      back: -0.3,
      width: w,
      height: h,
    },
  };
}
