import { InstancedBufferAttribute, Vector2, Vector3, Vector4 } from "three";
import { cameraBodyTargets } from "./camera-body-frame.js";

const declarations = /* glsl */ `
uniform mat4 projectionMatrix;
uniform float foliageFocusEnabled;
uniform vec4 foliageFocusBounds;
uniform vec2 foliageFocusFeather;
uniform float foliageFocusDepth;
uniform vec3 foliageFocusCamera;
varying vec3 vFoliageView;
varying float vFoliageCoverage;
`;
const vertexCoverage = /* glsl */ `
vFoliageView = mvPosition.xyz;
vFoliageCoverage = -1.;
#ifdef USE_INSTANCING
if (foliageInstanceShape.w > 0. && foliageFocusEnabled > .5 && distance(cameraPosition, foliageFocusCamera) < .005) {
  vec3 foliageCenter = (modelViewMatrix * instanceMatrix * vec4(foliageInstanceShape.xyz, 1.)).xyz;
  mat3 foliageTransform = mat3(modelViewMatrix * instanceMatrix);
  float foliageRadius = (foliageInstanceShape.w + .2) * max(length(foliageTransform[0]), max(length(foliageTransform[1]), length(foliageTransform[2])));
  float foliageDepth = -foliageCenter.z;
  vFoliageCoverage = 1.;
  if (foliageDepth - foliageRadius < foliageFocusDepth) {
    vec2 foliageScreen = foliageCenter.xy * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / max(.01, foliageDepth);
    vec2 foliageRadiusScreen = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * foliageRadius / max(.05, foliageDepth - foliageRadius);
    vec2 foliageGap = max(abs(foliageScreen - foliageFocusBounds.xy) - foliageFocusBounds.zw, vec2(0.));
    vFoliageCoverage = smoothstep(1., 1.45, length(foliageGap / foliageRadiusScreen));
    vFoliageCoverage = min(vFoliageCoverage, smoothstep(.35, .85, length(foliageCenter) - foliageRadius));
  }
}
#endif
`;
const coverage = /* glsl */ `
if (foliageFocusEnabled > .5 && distance(cameraPosition, foliageFocusCamera) < .005) {
  float foliageDepth = -vFoliageView.z;
  if (foliageDepth > .01 && (vFoliageCoverage >= 0. || foliageDepth < foliageFocusDepth)) {
    vec2 foliageScreen = vFoliageView.xy * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / foliageDepth;
    vec2 foliageOutside = max(abs(foliageScreen - foliageFocusBounds.xy) - foliageFocusBounds.zw, vec2(0.));
    float foliageCoverage = vFoliageCoverage < 0. ? smoothstep(0., 1., length(foliageOutside / foliageFocusFeather)) : vFoliageCoverage;
    // Close leaves cannot fill the lens even outside the body opening.
    if (vFoliageCoverage < 0.) foliageCoverage = min(foliageCoverage, smoothstep(.35, .85, length(vFoliageView)));
    // Share LOD's pixel pattern so complementary tiers retain one opening.
    float foliageNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
    if (foliageNoise >= foliageCoverage) discard;
  }
}
`;

// One small uniform set belongs to the adventure, not to a material or world.
// Weak array keys avoid retaining retired patch meshes between chapters.
export class FoliageFraming {
  constructor() {
    this.uniforms = {
      foliageFocusEnabled: { value: 0 },
      foliageFocusBounds: { value: new Vector4() },
      foliageFocusFeather: { value: new Vector2(1, 1) },
      foliageFocusDepth: { value: 0 },
      foliageFocusCamera: { value: new Vector3() },
    };
    this.arrays = new WeakMap();
    this.materials = new WeakSet();
    this.point = new Vector3();
    this.view = new Vector3();
  }
  material(material) {
    if (this.materials.has(material)) return;
    this.materials.add(material);
    const previous = material.onBeforeCompile,
      key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float foliageFocusEnabled; uniform vec4 foliageFocusBounds; uniform float foliageFocusDepth; uniform vec3 foliageFocusCamera; varying vec3 vFoliageView; varying float vFoliageCoverage;\n#ifdef USE_INSTANCING\nattribute vec4 foliageInstanceShape;\n#endif",
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\n" + vertexCoverage,
        );
      shader.fragmentShader = declarations + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <alphatest_fragment>",
        "#include <alphatest_fragment>\n" + coverage,
      );
    };
    material.customProgramCacheKey = () => key + "-foliage-focus-1";
    material.needsUpdate = true;
  }
  patches(patches, leafyOnly = false, understoryOnly = false) {
    if (!patches) return;
    let start = this.arrays.get(patches) || 0;
    if (start > patches.length) start = 0;
    for (let i = start; i < patches.length; i++) {
      const patch = patches[i];
      if (
        patch.kind === "rock" ||
        (understoryOnly && !["fern", "shrub"].includes(patch.kind))
      )
        continue;
      const meshes = patch.tiers?.flat() || [];
      if (!patch.tiers)
        for (const root of [patch.root, patch.detail].filter(Boolean))
          root.traverse((mesh) => {
            if (mesh.isMesh) meshes.push(mesh);
          });
      for (const mesh of meshes)
        for (const material of [mesh.material].flat()) {
          if (
            leafyOnly &&
            !(
              material.alphaTest > 0 ||
              /leaves|twig|frond|foliage/i.test(material.name)
            )
          )
            continue;
          this.material(material);
          if (
            mesh.isInstancedMesh &&
            !mesh.geometry.attributes.foliageInstanceShape
          ) {
            const geometry = mesh.geometry;
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            const sphere = geometry.boundingSphere,
              values = new Float32Array(mesh.instanceMatrix.count * 4);
            for (let i = 0; i < mesh.instanceMatrix.count; i++)
              values.set(
                leafyOnly
                  ? [0, 0, 0, -1]
                  : [
                      sphere.center.x,
                      sphere.center.y,
                      sphere.center.z,
                      sphere.radius,
                    ],
                i * 4,
              );
            geometry.setAttribute(
              "foliageInstanceShape",
              new InstancedBufferAttribute(values, 4),
            );
          }
          // The contact override cannot reproduce a view-dependent opening.
          mesh.userData.excludeContact = true;
        }
    }
    this.arrays.set(patches, patches.length);
  }
  update(game) {
    this.patches(game.naturePatches, false, true);
    this.patches(game.forestPatches, true);
    this.patches(game.jungleFringe?.patches, true);
    this.patches(game.palmPatches, true);
    this.patches(game.templePatches, true);
    this.patches(game.grassPatches);
    for (const cover of [
      game.skyMeadow,
      game.snowGroundcover,
      game.desertGroundcover,
      game.meridianGroundcover,
    ])
      this.patches(cover?.patches);
    const u = this.uniforms,
      camera = game.camera,
      rig = game.rig;
    u.foliageFocusEnabled.value = 0;
    if (!rig?.model || !camera || game.avatar?.visible === false) return;
    game.avatar.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    if (!rig.cameraBodyBones) cameraBodyTargets(game);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      far = 0;
    const projection = camera.projectionMatrix.elements;
    for (const { bone, radius } of rig.cameraBodyBones) {
      bone.getWorldPosition(this.point);
      this.view.copy(this.point).applyMatrix4(camera.matrixWorldInverse);
      const depth = -this.view.z,
        margin = radius + 0.12;
      if (depth <= 0.05) return;
      this.point.project(camera);
      const x = (projection[0] * margin) / depth,
        y = (projection[5] * margin) / depth;
      minX = Math.min(minX, this.point.x - x);
      maxX = Math.max(maxX, this.point.x + x);
      minY = Math.min(minY, this.point.y - y);
      maxY = Math.max(maxY, this.point.y + y);
      far = Math.max(far, depth + margin);
    }
    if (![minX, minY, maxX, maxY, far].every(Number.isFinite) || !far) return;
    u.foliageFocusBounds.value.set(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (maxX - minX) / 2,
      (maxY - minY) / 2,
    );
    u.foliageFocusFeather.value.set(
      (projection[0] * 0.16) / far,
      (projection[5] * 0.16) / far,
    );
    u.foliageFocusDepth.value = far;
    u.foliageFocusCamera.value.setFromMatrixPosition(camera.matrixWorld);
    u.foliageFocusEnabled.value = 1;
  }
}
