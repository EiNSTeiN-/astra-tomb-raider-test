import * as THREE from "three";
import { leafClusters } from "./leaf-clusters.js";

export function leafRegions(attribute) {
  const regions = new Map();
  // The fitted-card format stores four identical bounds per leaf.
  for (let i = 0; i < attribute.count; i += 4) {
    const r = [
      attribute.getX(i),
      attribute.getY(i),
      attribute.getZ(i),
      attribute.getW(i),
    ];
    regions.set(r.join(","), r);
  }
  return [...regions.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function atlasGeometry(regions) {
  const positions = [],
    uv = [],
    bounds = [],
    indices = [];
  for (const r of regions) {
    const start = positions.length / 3;
    for (const [u, v] of [
      [r[0], r[1]],
      [r[2], r[1]],
      [r[2], r[3]],
      [r[0], r[3]],
    ]) {
      positions.push(u * 2 - 1, v * 2 - 1, 0);
      uv.push(u, v);
      bounds.push(...r);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("_leaf_bounds", new THREE.Float32BufferAttribute(bounds, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Bake once per jungle load. Half-float targets retain linear color precision;
// ordinary material sampling then replaces the per-fragment cluster searches.
export function bakeLeafClusters(renderer, source, mask, attribute) {
  const size = 1024,
    regions = leafRegions(attribute),
    geometry = atlasGeometry(regions);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4);
  camera.position.z = 1;
  const card = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial(),
    1,
  );
  card.setMatrixAt(0, new THREE.Matrix4());
  card.frustumCulled = false;
  scene.add(card);
  const empty = card.material,
    targets = [],
    tiers = {};
  const target = (mips) =>
    new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    });
  const scratch = target(false);
  const bleedScene = new THREE.Scene(),
    quad = new THREE.PlaneGeometry(2, 2);
  const bleed = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    uniforms: {
      sourceMap: { value: scratch.texture },
      step: { value: 1 / size },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D sourceMap; uniform float step; varying vec2 vUv;
      void main(){vec4 center=texture2D(sourceMap,vUv),best=center;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
        vec4 s=texture2D(sourceMap,vUv+vec2(float(x),float(y))*step*2.);
        if(s.a>best.a)best=s;
      }gl_FragColor=vec4(best.rgb,center.a);}`,
  });
  bleedScene.add(new THREE.Mesh(quad, bleed));
  const previous = {
    target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    shadowAuto: renderer.shadowMap.autoUpdate,
    shadowNeed: renderer.shadowMap.needsUpdate,
  };
  let complete = false;
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0, 0);
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    for (const tiles of [2, 4]) {
      const tier = {};
      for (const [role, map] of [
        ["map", source.map],
        ["normalMap", source.normalMap],
        ["roughnessMap", source.roughnessMap],
      ]) {
        const material = new THREE.MeshBasicMaterial({
          map,
          alphaMap: mask,
          side: THREE.DoubleSide,
          blending: THREE.NoBlending,
          toneMapped: false,
          depthTest: false,
          depthWrite: false,
        });
        leafClusters(material, tiles);
        const compile = material.onBeforeCompile,
          key = material.customProgramCacheKey();
        material.onBeforeCompile = function (shader, r) {
          compile.call(this, shader, r);
          if (role !== "map")
            shader.fragmentShader = shader.fragmentShader.replace(
              "diffuseColor.rgb *= .9 + leafBest.w * .15;",
              role === "normalMap"
                ? `vec3 leafNormal=diffuseColor.rgb*2.-1.;
              leafNormal.xy=transpose(leafTurn)*leafNormal.xy;
              diffuseColor.rgb=normalize(leafNormal)*.5+.5;`
                : "",
            );
        };
        material.customProgramCacheKey = () => key + "-bake-" + role;
        card.material = material;
        try {
          renderer.setRenderTarget(scratch);
          renderer.clear();
          renderer.render(scene, camera);
          const baked = target(true);
          targets.push(baked);
          baked.texture.name = `Jungle ${tiles}×${tiles} leaf clusters ${role}`;
          baked.texture.colorSpace =
            role === "map" ? THREE.LinearSRGBColorSpace : THREE.NoColorSpace;
          baked.texture.anisotropy = 8;
          baked.texture.wrapS = baked.texture.wrapT = THREE.RepeatWrapping;
          renderer.setRenderTarget(baked);
          renderer.clear();
          renderer.render(bleedScene, camera);
          // Scene retirement already disposes material textures. Release their
          // backing framebuffer at that same ownership boundary.
          baked.texture.addEventListener("dispose", () => baked.dispose());
          tier[role] = baked.texture;
        } finally {
          material.dispose();
        }
      }
      tiers[tiles] = tier;
    }
    complete = true;
    return {
      tiers,
      targets,
      regions,
      size,
      bytes: (6 * size * size * 8 * 4) / 3,
    };
  } finally {
    renderer.setRenderTarget(previous.target);
    renderer.setClearColor(previous.clear, previous.alpha);
    renderer.autoClear = previous.autoClear;
    renderer.shadowMap.autoUpdate = previous.shadowAuto;
    renderer.shadowMap.needsUpdate = previous.shadowNeed;
    scratch.dispose();
    bleed.dispose();
    quad.dispose();
    geometry.dispose();
    card.dispose();
    empty.dispose();
    if (!complete) targets.forEach((t) => t.dispose());
  }
}
