import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

// Coordinates are relative to the original waterfall's x/baseY/z reference.
// The channel's open front meets the falling curtain at y=7.05, z=-3.15.
export function spillwayGeometry(seed = 0, footings = []) {
  const parts = [],
    blocks = [];
  function add(g, x, y, z, shade = 1) {
    if (g.index) {
      const old = g;
      g = old.toNonIndexed();
      old.dispose();
    }
    g.translate(x, y, z);
    const p = g.attributes.position,
      n = g.attributes.normal;
    const uv = new Float32Array(p.count * 2),
      color = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / 2.5;
      uv[i * 2 + 1] = (Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i)) / 2.5;
      const variation =
        shade *
        (0.96 + 0.04 * Math.sin(p.getX(i) * 8.7 + p.getY(i) * 4.1 + seed));
      color.set([variation, variation, variation], i * 3);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(color, 3));
    parts.push(g);
  }
  function block(x, y, z, w, h, d, shade = 1, bevel = 0.018) {
    blocks.push({ x, y, z, w, h, d });
    add(
      new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 6, h / 6, d / 6)),
      x,
      y,
      z,
      shade,
    );
  }
  // Recessed backing closes mortar joints, while individual courses form the
  // exposed sides. Alternating bonds avoid a stack of continuous vertical seams.
  block(0, 3.35, -4.6, 5.25, 6.8, 1.75, 0.56, 0.01);
  // The rear courses support a real header reservoir, giving the cascade
  // depth and a service face instead of a freestanding thin water wall.
  add(new THREE.BoxGeometry(5.25, 6.96, 2.04), 0, 3.45, -6.46, 0.66);
  for (let row = 0; row < 9; row++) {
    const edges =
      row % 2 ? [-2.65, -1.4, 0.3, 1.8, 2.65] : [-2.65, -0.9, 0.9, 2.65];
    for (let i = 0; i < edges.length - 1; i++)
      add(
        stoneBlockGeometry(
          edges[i + 1] - edges[i] - 0.014,
          0.741,
          2.08,
          seed + row * 19 + i,
          0.018,
        ),
        (edges[i] + edges[i + 1]) / 2,
        0.332 + row * 0.755,
        -6.46,
        0.86 + (row % 3) * 0.045,
      );
  }
  for (let row = 0; row < 9; row++) {
    const edges =
      row % 2 ? [-2.65, -1.9, -0.45, 1, 2.65] : [-2.65, -1.2, 0.3, 1.8, 2.65];
    for (let i = 0; i < edges.length - 1; i++)
      block(
        (edges[i] + edges[i + 1]) / 2,
        0.332 + row * 0.755,
        -4.6,
        edges[i + 1] - edges[i] - 0.014,
        0.741,
        1.8,
        0.88 + 0.12 * Math.sin(row * 3 + i * 7 + seed) ** 2,
      );
  }
  // Inset fluted jambs flank the falling sheet; their maximum face is the
  // original solid's face, so ornament does not project into the approach.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 8; row++)
      block(side * 2.41, 0.37 + row * 0.8, -3.765, 0.44, 0.77, 0.13, 1.03);
    for (const dx of [-0.105, 0.105])
      block(side * 2.41 + dx, 3.21, -3.696, 0.026, 6.33, 0.008, 0.39, 0.001);
    block(side * 2.4, 0.16, -3.82, 0.48, 0.3, 0.24, 0.91);
    block(side * 2.4, 6.52, -3.84, 0.49, 0.25, 0.28, 1.08);
  }
  // A shallow upper trough has a recessed bed, raised sides/back and a lower
  // front sill. Water can reach the sill without intersecting the capstone.
  block(0, 6.82, -4.3, 5.8, 0.14, 2.3, 0.85);
  // Three open feed mouths join the supplied reservoir to the overflow trough.
  for (const [a, b] of [
    [-2.9, -1.98],
    [-1.42, -0.28],
    [0.28, 1.42],
    [1.98, 2.9],
  ])
    block((a + b) / 2, 7.04, -5.33, b - a, 0.42, 0.24, 0.96);
  block(0, 7.21, -5.33, 5.8, 0.08, 0.24, 1.03);
  block(0, 6.86, -5.33, 5.8, 0.06, 0.24, 0.78);
  for (const mouth of [-1.7, 0, 1.7]) {
    block(mouth, 7.163, -5.315, 0.58, 0.025, 0.26, 0.87, 0.003);
    for (const dx of [-0.14, 0.14])
      block(mouth + dx, 7.03, -5.3, 0.018, 0.28, 0.04, 0.43, 0.003);
  }
  for (const side of [-1, 1]) {
    block(side * 2.66, 7.04, -4.24, 0.48, 0.42, 2.18, 0.99);
    for (let i = 0; i < 3; i++)
      block(side * 2.66, 7.22, -5.0 + i * 0.73, 0.48, 0.06, 0.71, 1.1, 0.007);
  }
  for (const x of [-1.55, 0, 1.55])
    block(x, 6.96, -3.27, 0.84, 0.14, 0.32, 0.94, 0.012);
  // Three lower spill notches take the flow; raised crests keep the intervening
  // masonry dry instead of producing a single rectangular sheet of white water.
  for (const [a, b] of [
    [-2.6, -1.97],
    [-1.13, -0.42],
    [0.42, 1.13],
    [1.97, 2.6],
  ])
    block((a + b) / 2, 7.04, -3.27, b - a, 0.3, 0.32, 0.96, 0.012);
  // Low basin banks retain the exact old climbable bounds and top height.
  for (const side of [-1, 1]) {
    block(side * 2.8, 0.05, -1.5, 0.52, 0.45, 6.48, 0.58, 0.008);
    for (let i = 0; i < 5; i++) {
      const z = -4.1 + i * 1.3;
      block(side * 2.8, 0.078, z, 0.55, 0.505, 1.285, 0.88 + (i % 2) * 0.06);
      block(side * 2.8, 0.45, z, 0.55, 0.25, 1.285, 1.04, 0.025);
    }
  }
  // Deep shared reservoirs need visible foundations below the original basin
  // rim. Broad courses continue the existing solid collision volume to ground.
  for (const f of footings) {
    if (f.bottom >= f.top) continue;
    const rows = Math.ceil((f.top - f.bottom) / 1.15);
    const height = (f.top - f.bottom) / rows;
    for (let row = 0; row < rows; row++)
      block(
        f.x,
        f.bottom + (row + 0.5) * height,
        f.z,
        f.w,
        height,
        f.d,
        0.74 + (row % 3) * 0.035,
        0.008,
      );
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, blocks };
}

export function buildSpillwayArt(game, index, x, y, z) {
  const root = new THREE.Group();
  root.name = "Carved waterfall spillway";
  root.position.set(x, y, z);
  game.world.add(root);
  const footings = [
    { x: 0, z: -5.58, w: 5.28, d: 3.74, top: -0.03 },
    ...[-1, 1].map((side) => ({
      x: side * 2.8,
      z: -1.5,
      w: 0.53,
      d: 6.48,
      top: -0.14,
    })),
  ].map((f) => ({
    ...f,
    bottom:
      footprintMinimum(
        (px, pz) => game.groundHeight(px, pz),
        x + f.x,
        z + f.z,
        f.w,
        f.d,
        game.terrainProfile?.step,
      ) -
      y -
      0.18,
  }));
  const { geometry, blocks } = spillwayGeometry(
    game.level.seed + index * 19,
    footings,
  );
  const source =
      (game.level.biome === "jungle" && game.templeMaterial) ||
      (game.level.biome === "sky" && game.skyMasonry) ||
      game.stoneMat,
    material = source.clone();
  material.name = "Wet spillway stone";
  material.vertexColors = true;
  material.roughness = 0.86;
  const previous = source.onBeforeCompile,
    key = source.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSpillway;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSpillway=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSpillway;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float runoff=.6+.4*sin(vSpillway.x*31.+sin(vSpillway.x*13.)*3.);
        float wetFace=smoothstep(-4.,-3.7,vSpillway.z)*(1.-smoothstep(2.08,2.5,abs(vSpillway.x)));
        float wetBank=(1.-smoothstep(.12,.4,abs(abs(vSpillway.x)-2.5)))*(1.-smoothstep(.25,.6,vSpillway.y));
        float wet=max(wetFace*runoff,wetBank);
        diffuseColor.rgb*=mix(vec3(1.),vec3(.43,.54,.44),wet*.65);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.34,wet*.7);",
      );
  };
  material.customProgramCacheKey = () => key + "-spillway-wet-1";
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "Bonded spillway masonry";
  root.add(mesh);
  return { root, mesh, blocks, footings };
}
