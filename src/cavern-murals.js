import * as THREE from "three";
import { materialTextureLoader } from "./asset-loading.js";

// The eight histories share one original painting atlas. Keep the existing
// recessed limestone's grain and roughness; only its painted face changes.
export function cavernMuralMaterial(source) {
  const material = source.clone(),
    atlas = materialTextureLoader().load(
      "/assets/textures/cavern-records-atlas.webp",
    );
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  material.name = "Cavern painted memory records";
  material.roughness = 0.96;
  material.userData.additionalTextures = [atlas];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cavernAtlas = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 cavernMuralCoord; varying vec4 vCavernMuralCoord;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCavernMuralCoord=cavernMuralCoord;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec4 vCavernMuralCoord; uniform sampler2D cavernAtlas;",
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec2 story=clamp(vCavernMuralCoord.xy,0.,1.);
        float stage=floor(vCavernMuralCoord.z+.5);
        vec2 cell=vec2(mod(stage,4.),1.-floor(stage/4.));
        // Pixel-centre bounds and copied gutters keep the portrait stories
        // separate without altering the existing stone UVs or normal maps.
        vec2 atlasUv=(cell*vec2(330.,643.)+vec2(8.5)+story*vec2(313.,626.))/vec2(1320.,1286.);
        vec3 fresco=texture2D(cavernAtlas,atlasUv).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,fresco,.9*vCavernMuralCoord.w);
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-cavern-fresco-atlas-1";
  return material;
}

// Paint the actual closed inset, including a reversed horizontal coordinate
// on the inner -Z face. Crop narrower bays instead of squeezing the figures.
// Side returns and the embedded back retain plain stone.
export function cavernMuralCoordinates(
  geometry,
  { stage, radius, bottom, top, center = 0, interior = false },
) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    aspect = (2 * radius) / (top - bottom),
    uSpan = Math.min(1, aspect / 0.5),
    vSpan = Math.min(1, 0.5 / aspect),
    values = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++)
    values.set(
      [
        0.5 +
          ((p.getX(i) - center) / (2 * radius)) * uSpan * (interior ? -1 : 1),
        0.5 + ((p.getY(i) - bottom) / (top - bottom) - 0.5) * vSpan,
        stage,
        (interior ? -n.getZ(i) : n.getZ(i)) > 0.9 ? 1 : 0,
      ],
      i * 4,
    );
  geometry.setAttribute(
    "cavernMuralCoord",
    new THREE.BufferAttribute(values, 4),
  );
  return geometry;
}
