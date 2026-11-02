import * as THREE from "three";
import { materialTextureLoader } from "./asset-loading.js";

// One shared original atlas supplies eight painted histories. Normal and
// roughness maps still come from the monastery's existing physical whitewash.
export function monasteryMuralMaterial(source) {
  const material = source.clone(),
    atlas = materialTextureLoader().load(
      "/assets/textures/monastery-records-atlas.webp",
    );
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  material.name = "Monastery painted fresco records";
  material.roughness = 0.96;
  // Uniform-only textures must join the existing chapter teardown traversal.
  material.userData.additionalTextures = [atlas];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.monasteryAtlas = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 muralCoord; varying vec4 vMuralCoord;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMuralCoord=muralCoord;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec4 vMuralCoord; uniform sampler2D monasteryAtlas;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 story=clamp(vMuralCoord.xy,0.,1.);
        float stage=floor(vMuralCoord.z+.5);
        vec2 cell=vec2(mod(stage,2.),3.-floor(stage*.5));
        // Sample pixel centres inside each 768 x 256 cell. Eight copied edge
        // pixels isolate neighboring stories through ordinary mip filtering.
        vec2 atlasUv=(cell*vec2(784.,272.)+vec2(8.5)+story*vec2(767.,255.))/vec2(1568.,1088.);
        vec3 fresco=texture2D(monasteryAtlas,atlasUv).rgb;
        float brushWear=.79+.035*sin(story.x*53.+sin(story.y*11.));
        diffuseColor.rgb=mix(diffuseColor.rgb,fresco,brushWear*vMuralCoord.w);
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-monastery-fresco-atlas-1";
  return material;
}

// All bays in a wall reveal successive portions of one panorama. The inner
// face points toward -Z, so its horizontal coordinates read in reverse X.
export function muralCoordinates(geometry, { stage, x, y, length }) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    values = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++)
    values.set(
      [
        0.5 - (p.getX(i) + x) / length,
        (p.getY(i) + y - 1.25) / (stage === 6 ? 5.2 : 4.85),
        stage,
        n.getZ(i) < -0.9 ? 1 : 0,
      ],
      i * 4,
    );
  geometry.setAttribute("muralCoord", new THREE.BufferAttribute(values, 4));
  return geometry;
}
