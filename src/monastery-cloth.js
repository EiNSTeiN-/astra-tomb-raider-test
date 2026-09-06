import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const CLOTH_LIMITS = { sideways: 0.42, lift: 0.045 };
export function clothDisplacement(x, u, v, time) {
  const free = Math.pow(1 - v, 1.7);
  return {
    z:
      (Math.sin(time * 2.3 + x * 0.7 + u * 4 + v * 5) * 0.16 +
        Math.sin(time * 0.71 + x * 0.13) * 0.26) *
      free,
    y: Math.sin(time * 1.6 + x * 0.8 + v * 3) * 0.045 * free,
  };
}

function clothShader(material, time) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.monasteryTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float monasteryTime; varying vec2 vFlagUv;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vFlagUv=uv;
      float freeCloth=pow(1.0-uv.y,1.7);
      transformed.z+=(sin(monasteryTime*2.3+position.x*.7+uv.x*4.0+uv.y*5.0)*.16+sin(monasteryTime*.71+position.x*.13)*.26)*freeCloth;
      transformed.y+=sin(monasteryTime*1.6+position.x*.8+uv.y*3.0)*.045*freeCloth;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFlagUv;")
      .replace(
        "#include <alphatest_fragment>",
        `#include <alphatest_fragment>
      float tornHem=fract(sin(floor(vFlagUv.x*23.0)*12.9898)*43758.5453)*.075;
      if(vFlagUv.y<tornHem)discard;
    `,
      );
    if (!material.isMeshDepthMaterial)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float ring=1.0-smoothstep(.011,.025,abs(length((vFlagUv-vec2(.5,.61))*vec2(1.0,.85))-.23));
      float rules=(1.0-smoothstep(.012,.02,abs(fract(vFlagUv.y*12.0)-.5)))*step(vFlagUv.y,.31)*step(.12,vFlagUv.x)*step(vFlagUv.x,.88);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.31,.21),max(ring*.48,rules*.35));
      diffuseColor.rgb*=.87+.13*sin(vFlagUv.x*160.0)*sin(vFlagUv.y*180.0);
    `,
      );
  };
  material.customProgramCacheKey = () => "vesper-monastery-cloth-1";
}

export function buildBannerLine(root, a, b, time, phase = 0) {
  const count = 25,
    colors = [0x986459, 0xc1a269, 0x688997, 0x77876a, 0xc5bfab],
    parts = [],
    anchors = [];
  const linePoint = (t) =>
    a
      .clone()
      .lerp(b, t)
      .add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 1.1, 0));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count,
      anchor = linePoint(t),
      width = 0.84 + (i % 3) * 0.06,
      height = 1.18 + (i % 4) * 0.035;
    const g = new THREE.PlaneGeometry(width, height, 8, 12);
    g.translate(anchor.x, anchor.y - height / 2, anchor.z);
    const color = new THREE.Color(colors[(i + phase) % colors.length]),
      values = new Float32Array(g.attributes.position.count * 3);
    for (let j = 0; j < values.length; j += 3) {
      values[j] = color.r;
      values[j + 1] = color.g;
      values[j + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(values, 3));
    parts.push(g);
    anchors.push(anchor);
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.boundingBox.expandByVector(
    new THREE.Vector3(0, CLOTH_LIMITS.lift, CLOTH_LIMITS.sideways),
  );
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
    new THREE.Sphere(),
  );
  const material = new THREE.MeshStandardMaterial({
    name: "Weathered monastery cloth",
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.95,
    flatShading: true,
    alphaTest: 0.1,
  });
  clothShader(material, time);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.animated = true;
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
  });
  clothShader(depth, time);
  mesh.customDepthMaterial = depth;
  root.add(mesh);
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 21 }, (_, i) => linePoint(i / 20)),
  );
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 36, 0.025, 5, false),
    new THREE.MeshStandardMaterial({ color: 0x655844, roughness: 1 }),
  );
  cord.castShadow = true;
  cord.userData.animated = true;
  root.add(cord);
  return { mesh, cord, anchors, a, b };
}
