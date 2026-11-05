import { desertScatterMaterial } from "./desert-scatter-material.js";

// Borrow the terrain's existing sandstone maps. Broad iron-stained beds and
// fine cross-bedding read at different distances; the actual ledges are geometry.
export function desertOutcropMaterial(terrain) {
  const material = desertScatterMaterial(terrain),
    compile = material.onBeforeCompile;
  material.name = "Wind-eroded sandstone";
  material.onBeforeCompile = (shader) => {
    compile(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "stoneColor*=vec3(1.12,1.01,.85)*(.9+strata*.12);",
      `float outcropBed=stoneP.y*1.6+sin(stoneP.x*.11+stoneP.z*.09)*.55;
      float outcropStain=smoothstep(.73,.98,.5+.5*sin(outcropBed));
      float crossBed=.5+.5*sin(stoneP.y*14.+stoneP.x*.36+sin(stoneP.z*.19)*1.8);
      float crossFade=1.-smoothstep(.25,1.,fwidth(outcropBed*8.75));
      stoneColor*=mix(vec3(1.07,.98,.85),vec3(.72,.57,.42),outcropStain*.6);
      stoneColor*=.97+crossBed*crossFade*.06;`,
    );
  };
  material.customProgramCacheKey = () => "vesper-desert-outcrop-1";
  return material;
}
