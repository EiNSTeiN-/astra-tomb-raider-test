import * as THREE from "three";

// Transparent light has a soft cylindrical profile. Keep the route visible
// without writing an opaque stripe over the explorer or the stone behind it.
export function solarBeamMaterials() {
  return [
    { name: "Solar light core", color: [1.35, 0.9, 0.3], opacity: 0.72 },
    { name: "Solar dust scattering", color: [1, 0.63, 0.2], opacity: 0.12 },
  ].map(({ name, color, opacity }, pass) => {
    const material = new THREE.MeshBasicMaterial({
      name,
      color: new THREE.Color(...color),
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: true,
      blending: pass ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.onBeforeCompile = (shader) => {
      const varyings = "varying vec3 vSolarNormal, vSolarView;";
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${varyings}`)
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vec3 solarNormal = normal;
          #ifdef USE_INSTANCING
            solarNormal = mat3(instanceMatrix) * solarNormal;
          #endif
          vSolarNormal = normalMatrix * solarNormal;
          vSolarView = -mvPosition.xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${varyings}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float solarFacing = clamp(dot(normalize(vSolarNormal), normalize(vSolarView)), 0.0, 1.0);
          diffuseColor.a *= solarFacing * solarFacing;`,
        );
    };
    material.customProgramCacheKey = () => "vesper-solar-light-1";
    return material;
  });
}

export const SOLAR_BEAM_RADII = [0.014, 0.075];
