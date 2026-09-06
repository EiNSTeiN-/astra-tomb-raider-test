import * as THREE from "three";

// Geometry disposal does not release a mesh's separate instanceMatrix and
// instanceColor buffers. Three.js listens for the InstancedMesh dispose event.
export function disposeInstanceBuffers(scene) {
  let count = 0;
  scene.traverse((object) => {
    if (object.isInstancedMesh) {
      object.dispose();
      count++;
    }
  });
  return count;
}

function coverageShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float instanceCoverage; varying float vInstanceCoverage;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvInstanceCoverage = instanceCoverage;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying float vInstanceCoverage;",
    )
    .replace(
      "#include <alphatest_fragment>",
      `#include <alphatest_fragment>
      float lodNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (vInstanceCoverage >= 0.0 ? lodNoise >= vInstanceCoverage : lodNoise < 1.0 + vInstanceCoverage) discard;`,
    );
}

export function lodMaterial(material) {
  if (material.userData.instanceLod) return material;
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    coverageShader(shader);
  };
  material.customProgramCacheKey = () => key + "-instance-lod-1";
  material.userData.instanceLod = true;
  return material;
}

// A wrapper shares immutable vertex/index buffers but owns its per-instance
// coverage attribute. Each patch can crossfade without copying the source mesh.
function patchGeometry(source, capacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes))
    geometry.setAttribute(name, attribute);
  geometry.groups = source.groups.map((group) => ({ ...group }));
  geometry.setAttribute(
    "instanceCoverage",
    new THREE.InstancedBufferAttribute(
      new Float32Array(capacity).fill(1),
      1,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  return geometry;
}

export function createLodPatch(
  world,
  sources,
  matrices,
  positions,
  { castShadow = true, wind, colors, planar = false } = {},
) {
  const tiers = sources.map((parts) =>
    parts.map(({ geometry, material }) => {
      const mesh = new THREE.InstancedMesh(
        patchGeometry(geometry, matrices.length),
        lodMaterial(material),
        matrices.length,
      );
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      colors?.forEach((color, i) => mesh.setColorAt(i, color));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.visible = false;
      mesh.name = `${material.name || "Vegetation"} LOD`;
      const depth = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: material.map,
        alphaMap: material.alphaMap,
        alphaTest: material.alphaTest,
        side: material.side,
      });
      if (wind && /leaves|twig/.test(material.name)) wind(depth);
      mesh.customDepthMaterial = lodMaterial(depth);
      world.add(mesh);
      return mesh;
    }),
  );
  return {
    tiers,
    matrices,
    positions,
    colors,
    planar,
    states: null,
    counts: sources.map(() => 0),
  };
}

export function selectLod(distance, ranges, previous, hysteresis = 2) {
  if (previous == null)
    return ranges.findIndex((range) => distance < range) === -1
      ? ranges.length
      : ranges.findIndex((range) => distance < range);
  let tier = previous;
  while (tier < ranges.length && distance > ranges[tier] + hysteresis) tier++;
  while (tier > 0 && distance < ranges[tier - 1] - hysteresis) tier--;
  return tier;
}

export function updateLodPatch(
  patch,
  observer,
  ranges,
  dt = 0,
  hysteresis = 2,
) {
  let changed = !patch.states || patch.ranges !== ranges.join(",");
  const settingsChanged = changed;
  patch.ranges = ranges.join(",");
  patch.states ||= patch.positions.map(() => ({
    tier: null,
    from: null,
    blend: 1,
  }));
  for (let i = 0; i < patch.positions.length; i++) {
    const state = patch.states[i];
    const next = selectLod(
      patch.planar
        ? Math.hypot(
            patch.positions[i].x - observer.x,
            patch.positions[i].z - observer.z,
          )
        : patch.positions[i].distanceTo(observer),
      ranges,
      settingsChanged ? null : state.tier,
      hysteresis,
    );
    if (next !== state.tier) {
      state.from = state.blend < 0.5 ? state.from : state.tier;
      state.tier = next;
      state.blend =
        state.from == null || state.from === next || dt === 0 || settingsChanged
          ? 1
          : 0;
      changed = true;
    }
    if (state.blend < 1) {
      state.blend = dt === 0 ? 1 : Math.min(1, state.blend + dt / 0.3);
      changed = true;
    }
  }
  if (!changed) return;
  const counts = patch.tiers.map(() => 0);
  const place = (tier, matrix, coverage, color) => {
    if (tier == null || tier >= patch.tiers.length) return;
    const index = counts[tier]++;
    for (const mesh of patch.tiers[tier]) {
      mesh.setMatrixAt(index, matrix);
      if (color) mesh.setColorAt(index, color);
      mesh.geometry.attributes.instanceCoverage.setX(index, coverage);
    }
  };
  patch.states.forEach((state, i) => {
    const matrix = patch.matrices[i];
    const color = patch.colors?.[i];
    if (state.blend < 1) {
      place(state.from, matrix, 1 - state.blend, color);
      place(state.tier, matrix, -Math.max(0.000001, state.blend), color);
    } else place(state.tier, matrix, 1, color);
  });
  patch.counts = counts;
  patch.tiers.forEach((tier, i) =>
    tier.forEach((mesh) => {
      mesh.count = counts[i];
      mesh.visible = counts[i] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.instanceCoverage.needsUpdate = true;
    }),
  );
}
