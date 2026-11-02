import * as THREE from "three";

// One closed skin avoids the intersecting, five-sided tubes of the old loop.
// Twelve turns of three plies fit the same 0.2184 m outer envelope.
export function braidedRingGeometry(segments = 288, sides = 24, relief = 0.07) {
  const position = [],
    normal = [],
    uv = [],
    indices = [],
    radius = 0.18,
    thickness = 0.04,
    along = new THREE.Vector3(),
    across = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    // Duplicate seam attributes exactly, while allowing the UVs to wrap.
    const u = ((i % segments) / segments) * Math.PI * 2,
      su = Math.sin(u),
      cu = Math.cos(u);
    for (let j = 0; j <= sides; j++) {
      const v = ((j % sides) / sides) * Math.PI * 2,
        sv = Math.sin(v),
        cv = Math.cos(v),
        phase = 3 * v - 36 * u,
        r = thickness * (0.96 - relief + relief * Math.cos(phase)),
        du = 36 * thickness * relief * Math.sin(phase),
        dv = -3 * thickness * relief * Math.sin(phase),
        radial = radius + r * cv;
      position.push(radial * su, radial * cu, r * sv);
      along.set(
        du * cv * su + radial * cu,
        du * cv * cu - radial * su,
        du * sv,
      );
      across.set(
        (dv * cv - r * sv) * su,
        (dv * cv - r * sv) * cu,
        dv * sv + r * cv,
      );
      n.crossVectors(across, along).normalize();
      normal.push(n.x, n.y, n.z);
      uv.push(i / segments, j / sides);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j,
          b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Closed three-ply bell rope";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function bellRopeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x99896b,
    roughness: 0.96,
  });
  material.name = "Monastery hemp";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vHempUv;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHempUv=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vHempUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float fiberPhase=6.2831853*(vHempUv.y*42.-vHempUv.x*504.);
        float fiberDetail=1.-smoothstep(1.,3.,fwidth(fiberPhase));
        float fibers=sin(fiberPhase)*fiberDetail;
        float wear=sin(6.2831853*vHempUv.x*7.)*sin(6.2831853*vHempUv.y*3.);
        diffuseColor.rgb*=.94+.045*fibers+.025*wear;
      `,
      );
  };
  material.customProgramCacheKey = () => "vesper-bell-hemp-1";
  return material;
}

export function buildBellRopeLoop(materials) {
  // All 32 loops share three immutable buffers. Every tier stays attached so
  // the existing chapter traversal also disposes tiers that were never drawn.
  materials.ropeLoops ??= [
    braidedRingGeometry(),
    braidedRingGeometry(192, 18),
    // Less relief prevents undersampled diagonal ridges in Performance mode.
    braidedRingGeometry(144, 12, 0.035),
  ];
  const loop = new THREE.Group();
  loop.name = "Braided hemp loop";
  loop.userData.bellRopeLoop = true;
  loop.userData.detail = 0;
  materials.ropeLoops.forEach((geometry, i) => {
    const mesh = new THREE.Mesh(geometry, materials.rope);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = i === 0;
    loop.add(mesh);
  });
  return loop;
}

const loopPosition = new THREE.Vector3(),
  cameraPosition = new THREE.Vector3();
export function updateBellRopeDetail(loop, camera, quality = "high") {
  if (!loop || !camera) return;
  const distance = loop
      .getWorldPosition(loopPosition)
      .distanceTo(camera.getWorldPosition(cameraPosition)),
    previous = loop.userData.detail;
  let detail = distance < 12 ? 0 : distance < 28 ? 1 : 2;
  // Eight percent hysteresis keeps ordinary camera sway from changing tiers.
  if (detail > previous && distance < [12, 28][previous] * 1.08)
    detail = previous;
  if (detail < previous && distance > [12, 28][previous - 1] * 0.92)
    detail = previous;
  detail = Math.max(
    detail,
    quality === "low" ? 2 : quality === "medium" ? 1 : 0,
  );
  loop.children.forEach((mesh, i) => {
    mesh.visible = i === detail;
  });
  loop.userData.detail = detail;
}
