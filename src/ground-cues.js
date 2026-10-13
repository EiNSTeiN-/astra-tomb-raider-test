import * as THREE from "three";

// Project the warning into the surfaces already being drawn. A separate flat
// disc can bridge banks, bury itself uphill or hover above an excavated pool.
const capacity = 64;
let generation = 0;
const common = `
varying vec3 vGroundCueWorld;
uniform sampler2D groundCueData;
uniform int groundCueCount;
`;
const vertex = `
vec4 groundCueWorld = vec4(transformed, 1.0);
#ifdef USE_BATCHING
groundCueWorld = batchingMatrix * groundCueWorld;
#endif
#ifdef USE_INSTANCING
groundCueWorld = instanceMatrix * groundCueWorld;
#endif
vGroundCueWorld = (modelMatrix * groundCueWorld).xyz;
`;
const fragment = `
if (groundCueCount > 0) {
  float groundCueUp = inverseTransformDirection(nonPerturbedNormal, viewMatrix).y;
  if (groundCueUp > .35) {
    for (int cue = 0; cue < ${capacity}; cue++) {
      if (cue >= groundCueCount) break;
      float row = (float(cue) + .5) / ${capacity}.0;
      vec4 shape = texture2D(groundCueData, vec2(1.0 / 6.0, row));
      float radial = length(vGroundCueWorld.xz - shape.xy);
      float edge = max(.008, fwidth(radial));
      if (radial < shape.w - edge || radial > shape.z + edge) continue;
      vec4 tint = texture2D(groundCueData, vec2(.5, row));
      vec4 height = texture2D(groundCueData, vec2(5.0 / 6.0, row));
      if (vGroundCueWorld.y < height.x || vGroundCueWorld.y > height.y) continue;
      float band = smoothstep(shape.w - edge, shape.w + edge, radial)
                 * (1.0 - smoothstep(shape.z - edge, shape.z + edge, radial));
      outgoingLight = mix(outgoingLight, tint.rgb * 1.5, band * tint.a);
    }
  }
}
`;

export function projectedRing(inner, outer, material, offset = 0.07) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  const ring = new THREE.Mesh(geometry, material);
  ring.userData.animated = true;
  ring.userData.groundCue = { inner, outer, offset };
  // Keep the existing visible/opacity/scale controls as the cue's source.
  // Its appearance is rendered by receiving surfaces, rather than this mesh.
  material.visible = false;
  return ring;
}

function actor(object) {
  for (let p = object; p; p = p.parent)
    if (p.userData.actor || p.isSkinnedMesh) return true;
  return false;
}

function patchReceivers(game, state) {
  game.world.traverse((object) => {
    if (!object.isMesh || object.userData.excludeContact || actor(object))
      return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        !material?.isMeshStandardMaterial ||
        material.alphaTest > 0 ||
        (material.transparent && !material.userData.waterUniforms) ||
        state.materials.has(material)
      )
        continue;
      const previous = material.onBeforeCompile,
        previousKey = material.customProgramCacheKey,
        defaultKey =
          previousKey === THREE.Material.prototype.customProgramCacheKey;
      const compile = function (shader, renderer) {
        previous.call(this, shader, renderer);
        if (state.retired) return;
        Object.assign(shader.uniforms, state.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\n" + common)
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\n" + vertex,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + common)
          .replace(
            "#include <opaque_fragment>",
            fragment + "\n#include <opaque_fragment>",
          );
      };
      const key = function () {
        return (
          (defaultKey ? previous.toString() : previousKey.call(this)) +
          "|vesper-ground-cues-1"
        );
      };
      state.materials.set(material, { previous, previousKey, compile, key });
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = key;
      material.needsUpdate = true;
    }
  });
  state.scan = false;
}

export function updateGroundCues(game) {
  if (!game.world) return;
  let state = game.groundCues;
  if (!state) {
    const data = new Float32Array(capacity * 12),
      texture = new THREE.DataTexture(
        data,
        3,
        capacity,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    state = game.groundCues = {
      data,
      texture,
      uniforms: {
        groundCueData: { value: texture },
        groundCueCount: { value: 0 },
      },
      materials: new Map(),
      generation: ++generation,
      scan: true,
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      records: [],
    };
    game.visualsReady?.then(
      () => {
        if (game.groundCues === state) state.scan = true;
      },
      () => {},
    );
  }
  if (state.scan) patchReceivers(game, state);
  const records = [];
  const add = (ring, id, range = [-1e5, 4.6], height) => {
    const definition = ring?.userData.groundCue;
    if (!definition || !ring.visible || ring.material.opacity <= 0) return;
    for (let p = ring.parent; p; p = p.parent) if (!p.visible) return;
    ring.getWorldPosition(state.position);
    ring.getWorldScale(state.scale);
    const outer = definition.outer * state.scale.x,
      inner = definition.inner * state.scale.x,
      base = height ?? state.position.y - definition.offset;
    if (outer <= 0) return;
    records.push({
      id,
      x: state.position.x,
      z: state.position.z,
      inner,
      outer,
      minY: base + range[0],
      maxY: base + range[1],
      opacity: ring.material.opacity,
      color: ring.material.color.toArray(),
    });
  };
  for (const e of game.enemies || [])
    if (e.hp > 0)
      add(
        e.warning,
        e.id,
        [-2.6, 2.6],
        ["hunter", "sentry"].includes(e.kind) ? e.aim?.y : e.group?.position.y,
      );
  for (const h of game.hazards || [])
    if (!h.disabled) {
      add(h.marker, h.id);
      add(h.wave, `${h.id}-pulse`, [-1e5, 1.3]);
    }
  if (records.length > capacity)
    throw new Error("Ground cue capacity exceeded");
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    state.data.set(
      [r.x, r.z, r.outer, r.inner, ...r.color, r.opacity, r.minY, r.maxY, 0, 0],
      i * 12,
    );
  }
  state.records = records;
  state.uniforms.groundCueCount.value = records.length;
  if (records.length) state.texture.needsUpdate = true;
}

export function disposeGroundCues(game) {
  const state = game.groundCues;
  if (!state) return;
  state.retired = true;
  state.uniforms.groundCueCount.value = 0;
  state.texture.dispose();
  for (const [material, hooks] of state.materials) {
    if (material.onBeforeCompile === hooks.compile)
      material.onBeforeCompile = hooks.previous;
    if (material.customProgramCacheKey === hooks.key)
      material.customProgramCacheKey = hooks.previousKey;
    else {
      // A later wrapper may retain our old hook and cache key. Retire the hook
      // without removing that wrapper, and force a fresh unprojected program.
      const outerKey = material.customProgramCacheKey;
      material.customProgramCacheKey = function () {
        return outerKey.call(this) + "|ground-cue-retired-" + state.generation;
      };
    }
    material.needsUpdate = true;
  }
  state.materials.clear();
  state.records = [];
  game.groundCues = null;
}
