import * as THREE from "three";
import { waterRipples } from "./water-ripples.js";

// The trapped air pockets share the reservoir's water, with smaller ripples
// sheltered by the bronze skirts. Keep the meniscus geometry fixed so its
// visible height still agrees with the swimming and breathing boundary.
export function galleryWaterMaterial(time) {
  const material = new THREE.MeshPhysicalMaterial({
    name: "Sheltered air-bell water",
    color: 0x4a8f8b,
    roughness: 0.36,
    metalness: 0,
    ior: 1.333,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.galleryWaterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 galleryWaterPoint;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        galleryWaterPoint=(modelMatrix*vec4(transformed,1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float galleryWaterTime;
        varying vec3 galleryWaterPoint;
        ${waterRipples}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        vec2 ripplePoint=galleryWaterPoint.xz*2.5;
        vec2 waterDx=dFdx(ripplePoint);
        vec2 waterDy=dFdy(ripplePoint);
        vec2 slope=waterRipples(ripplePoint,galleryWaterTime,waterDx,waterDy)*1.1;
        vec3 waterNormal=vec3(-slope.x,1.0,-slope.y)*(gl_FrontFacing?1.0:-1.0);
        normal=normalize(mat3(viewMatrix)*waterNormal);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float grazing=1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0);
        diffuseColor.a*=mix(.55,1.0,grazing*grazing*grazing);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "vesper-gallery-water-1";
  return material;
}
