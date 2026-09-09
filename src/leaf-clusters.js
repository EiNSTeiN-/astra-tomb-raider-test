import { ShaderChunk } from "three";

// Used only by the initial atlas bake, never the per-frame foliage materials.
// A sampled, enlarged leaf is too conspicuous against the sky. Keep its card
// but fill it with a small cluster from the same atlas. Four neighboring cells
// allow leaves to overlap cell borders without clipping into a visible grid.
export function leafClusters(material, tiles) {
  material.userData.leafTiles = tiles;
  if (tiles <= 1) return;
  const previous = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.leafTiles = { value: tiles };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 _leaf_bounds;
        varying vec4 vLeafBounds;
        varying vec2 vLeafCardUv;
        varying float vLeafSeed;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vLeafBounds = _leaf_bounds;
        vLeafCardUv = (uv - _leaf_bounds.xy) / (_leaf_bounds.zw - _leaf_bounds.xy);
        vLeafSeed = dot(_leaf_bounds.xy, vec2(131.2, 341.7))
          + dot(instanceMatrix[3].xz, vec2(.173, .317));`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform float leafTiles;
      varying vec4 vLeafBounds;
      varying vec2 vLeafCardUv;
      varying float vLeafSeed;
      float leafHash(vec2 p) {
        vec3 q = fract(vec3(p.x, p.y, p.x) * vec3(.1031, .1030, .0973) + vLeafSeed * .017);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      mat2 leafRotation(float noise) {
        const vec2 turns[8] = vec2[8](vec2(1.,0.), vec2(.70710678,.70710678),
          vec2(0.,1.), vec2(-.70710678,.70710678), vec2(-1.,0.),
          vec2(-.70710678,-.70710678), vec2(0.,-1.), vec2(.70710678,-.70710678));
        vec2 d = turns[min(7, int(noise * 8.))];
        return mat2(d.x, -d.y, d.y, d.x);
      }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphamap_pars_fragment>",
      `#include <alphamap_pars_fragment>
      vec4 leafSample(vec2 grid, vec2 cell, vec2 dx, vec2 dy) {
        if (any(lessThan(cell, vec2(0.))) || any(greaterThanEqual(cell, vec2(leafTiles)))) return vec4(0.);
        float noise = leafHash(cell);
        float radius = length((cell + .5) / leafTiles - .5) * 2.;
        if (radius > .96 + noise * .22 || noise < .025) return vec4(0.);
        vec2 center = cell + .5 + (vec2(leafHash(cell + 19.), leafHash(cell + 37.)) - .5) * .56;
        mat2 turn = leafRotation(noise);
        float size = .84 + noise * .2;
        vec2 point = turn * (grid - center) / size + .5;
        if (any(lessThan(point, vec2(0.))) || any(greaterThan(point, vec2(1.)))) return vec4(0.);
        vec2 span = vLeafBounds.zw - vLeafBounds.xy;
        vec2 tex = mix(vLeafBounds.xy, vLeafBounds.zw, point);
        // Explicit gradients avoid false coarse mips where random cells meet.
        float coverage = textureGrad(alphaMap, tex, turn * dx / size * span, turn * dy / size * span).g;
        return vec4(tex, coverage, noise);
      }`,
    );
    const sampleChunk = (chunk, sampler, uv) =>
      ShaderChunk[chunk].replaceAll(
        `texture2D( ${sampler}, ${uv} )`,
        `textureGrad( ${sampler}, leafTexUv, leafMapDx, leafMapDy )`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      vec2 leafGrid = vLeafCardUv * leafTiles;
      vec2 leafDx = dFdx(vLeafCardUv) * leafTiles, leafDy = dFdy(vLeafCardUv) * leafTiles;
      vec2 leafBase = floor(leafGrid - .5);
      vec4 leafBest = vec4(0.);
      for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
        vec4 sampleLeaf = leafSample(leafGrid, leafBase + vec2(float(x), float(y)), leafDx, leafDy);
        if (sampleLeaf.z > leafBest.z) leafBest = sampleLeaf;
      }
      if (leafBest.z <= 0.) discard;
      vec2 leafTexUv = leafBest.xy;
      mat2 leafTurn = leafRotation(leafBest.w);
      vec2 leafSpan = (vLeafBounds.zw - vLeafBounds.xy) / (.84 + leafBest.w * .2);
      vec2 leafMapDx = leafTurn * leafDx * leafSpan, leafMapDy = leafTurn * leafDy * leafSpan;
      ${sampleChunk("map_fragment", "map", "vMapUv")}
      diffuseColor.rgb *= .9 + leafBest.w * .15;
    `,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <alphamap_fragment>", "diffuseColor.a *= leafBest.z;")
      .replace(
        "#include <roughnessmap_fragment>",
        sampleChunk("roughnessmap_fragment", "roughnessMap", "vRoughnessMapUv"),
      )
      .replace(
        "#include <normal_fragment_maps>",
        sampleChunk(
          "normal_fragment_maps",
          "normalMap",
          "vNormalMapUv",
        ).replace(
          "mapN.xy *= normalScale;",
          "mapN.xy = transpose(leafTurn) * mapN.xy; mapN.xy *= normalScale;",
        ),
      );
  };
  material.customProgramCacheKey = () => key + "-leaf-clusters-3-" + tiles;
}
