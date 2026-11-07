import * as THREE from "three";
import { materialTextureLoader } from "./asset-loading.js";

export const COASTAL_MOSAIC_ATLAS = "/assets/art/coastal-mosaic-atlas.webp";

// Interpolate the delivered front's straight edges, rather than evaluating a
// smoother vault above them. The field remains inside its supporting masonry.
export function coastalPedimentGeometry(stage, contour) {
  const bottom = Math.fround(8.58),
    left = -6.18,
    right = 6.18;
  const heightAt = (x) => {
    const i = contour.findIndex((p) => p[0] >= x),
      a = contour[Math.max(0, i - 1)],
      b = contour[Math.max(0, i)];
    return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-9, b[0] - a[0]);
  };
  const profile = [
    [left, heightAt(left) - 0.22],
    ...contour
      .filter(([x]) => x > left && x < right)
      .map(([x, y]) => [x, y - 0.22]),
    [right, heightAt(right) - 0.22],
  ].map((p) => p.map(Math.fround));
  const polygon = [
    [profile[0][0], bottom],
    [profile.at(-1)[0], bottom],
    ...profile.slice().reverse(),
  ];
  const height = Math.max(...profile.map((p) => p[1])) - bottom,
    shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(...p)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.106,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // A mortar bed embeds in the continuous backing behind the dressed face.
  geometry.translate(0, 0, 7.22);
  geometry.computeBoundingBox();
  const cameraPlanes = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      x = (b[1] - a[1]) / length,
      y = (a[0] - b[0]) / length;
    return [x, y, 0, Math.max(...polygon.map((p) => x * p[0] + y * p[1]))];
  });
  cameraPlanes.push(
    [0, 0, -1, -geometry.boundingBox.min.z],
    [0, 0, 1, geometry.boundingBox.max.z],
  );
  const data = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) data.set([height, stage, bottom], i);
  geometry.setAttribute("mosaicData", new THREE.BufferAttribute(data, 3));
  return {
    geometry,
    cameraPlanes,
    stage,
    bottom,
    height,
    profile,
    artWidth: height * 3,
  };
}

export function coastalPedimentMaterial() {
  const map = materialTextureLoader().load(COASTAL_MOSAIC_ATLAS);
  map.name = "Original maritime narrative atlas";
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    name: "Maritime glass and limestone mosaic",
    map,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 mosaicData;\nvarying vec2 vMosaicPosition;\nvarying vec3 vMosaicData;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMosaicPosition=position.xy;vMosaicData=mosaicData;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vMosaicPosition;
varying vec3 vMosaicData;
float mosaicHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
`,
      )
      .replace(
        "#include <map_fragment>",
        `
// Physical tile spacing is independent of each differently shaped pediment.
float mosaicTile=.032;
vec2 mosaicBase=vMosaicPosition/mosaicTile;
vec2 mosaicWarp=.10*vec2(sin(mosaicBase.y*.91+.3*sin(mosaicBase.x*.72)),sin(mosaicBase.x*.83+.4*sin(mosaicBase.y*.61)));
float mosaicRow=floor(mosaicBase.y+mosaicWarp.y);
float mosaicOffset=.45*mosaicHash(vec2(mosaicRow,17.0));
vec2 mosaicGrid=mosaicBase+mosaicWarp+vec2(mosaicOffset,0.0);
vec2 mosaicCell=floor(mosaicGrid),mosaicF=fract(mosaicGrid);
float mosaicPixel=max(fwidth(mosaicGrid.x),fwidth(mosaicGrid.y));
float mosaicDetail=1.0-smoothstep(.22,.85,mosaicPixel);
vec2 mosaicCenter=(mosaicCell+vec2(.5)-vec2(mosaicOffset,0.0)-mosaicWarp)*mosaicTile;
vec2 mosaicPoint=mix(vMosaicPosition,mosaicCenter,mosaicDetail);
// A categorical index must survive perspective interpolation at row boundaries.
float mosaicH=vMosaicData.x,mosaicStage=floor(vMosaicData.y+.5),mosaicBottom=vMosaicData.z;
vec2 mosaicArt=vec2(.5+mosaicPoint.x/(3.0*mosaicH),(mosaicPoint.y-mosaicBottom)/mosaicH);
vec2 mosaicPanel=vec2(mod(mosaicStage,3.0),2.0-floor(mosaicStage/3.0))/3.0;
vec2 mosaicInset=vec2(2.0)/vec2(2172.0,724.0);
vec2 mosaicSampleUv=clamp(mosaicPanel+mosaicArt/3.0,mosaicPanel+mosaicInset,mosaicPanel+vec2(1.0/3.0)-mosaicInset);
${THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "mosaicSampleUv")}
// The shallowest vaults carry wave bands beside an undistorted central scene.
float mosaicY=mosaicPoint.y-mosaicBottom;
float mosaicWave=mosaicY-.17*sin(mosaicPoint.x*1.3);
vec3 mosaicWing=vec3(.029,.088,.205);
mosaicWing=mix(mosaicWing,vec3(.14,.29,.27),1.0-smoothstep(.06,.10,abs(mosaicWave-.43)));
mosaicWing=mix(mosaicWing,vec3(.77,.66,.44),1.0-smoothstep(.025,.07,abs(mosaicWave-.27)));
mosaicWing=mix(mosaicWing,vec3(.77,.66,.44),1.0-smoothstep(.025,.07,abs(mosaicWave-.61)));
float mosaicPicture=step(0.0,mosaicArt.x)*step(mosaicArt.x,1.0);
diffuseColor.rgb=mix(mosaicWing,diffuseColor.rgb,mosaicPicture);
float mosaicFrame=1.0-smoothstep(.025,.065,abs(abs(mosaicPoint.x)-1.5*mosaicH));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.32,.10),mosaicFrame);
float mosaicEdge=min(min(mosaicF.x,1.0-mosaicF.x),min(mosaicF.y,1.0-mosaicF.y));
float mosaicRandom=mosaicHash(mosaicCell+vec2(mosaicStage*103.0,31.0));
vec2 mosaicCorner=mix(mosaicF,vec2(1.0)-mosaicF,step(vec2(.5),vec2(mosaicHash(mosaicCell+81.0),mosaicHash(mosaicCell+127.0))));
float mosaicCut=(mosaicCorner.x+mosaicCorner.y-.12-.14*mosaicHash(mosaicCell+51.0))*.7071;
mosaicEdge=min(mosaicEdge,mix(1.0,mosaicCut,step(.78,mosaicRandom)));
float mosaicAa=min(.25,max(.0001,mosaicPixel*.6));
float mosaicInterior=smoothstep(.025-mosaicAa,.055+mosaicAa,mosaicEdge);
float mosaicMissing=smoothstep(.982,.992,mosaicRandom);
mosaicInterior*=1.0-mosaicMissing;
diffuseColor.rgb*=mix(1.0,.88+.16*mosaicRandom,mosaicDetail);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.25,.235,.19),mosaicDetail*(1.0-mosaicInterior)*.88);
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor=mix(.81,mix(.97,.60+.20*mosaicRandom,mosaicInterior),mosaicDetail);
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
float mosaicRelief=smoothstep(.025,.17,mosaicEdge)*.0008*(1.0-mosaicMissing)*mosaicDetail;
vec3 mosaicQ0=dFdx(-vViewPosition),mosaicQ1=dFdy(-vViewPosition);
vec3 mosaicR0=cross(mosaicQ1,normal),mosaicR1=cross(normal,mosaicQ0);
float mosaicDet=dot(mosaicQ0,mosaicR0);
vec3 mosaicGrad=dFdx(mosaicRelief)*mosaicR0+dFdy(mosaicRelief)*mosaicR1;
normal=normalize(normal-sign(mosaicDet)*mosaicGrad/max(abs(mosaicDet),1e-8)*smoothstep(1e-10,1e-7,abs(mosaicDet)));
`,
      );
  };
  material.customProgramCacheKey = () => "vesper-maritime-mosaic-3";
  return material;
}
