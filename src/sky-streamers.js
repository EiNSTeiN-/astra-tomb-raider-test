import * as THREE from "three";
import { bridgeDeckY, spanCoordinates } from "./sky-bridge-rules.js";

export function skyStreamerMaterial() {
  const m = new THREE.MeshStandardMaterial({
    name: "Bridge wind streamers",
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vStreamerUv;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvStreamerUv=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vStreamerUv;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float weave=sin(vStreamerUv.x*620.)*sin(vStreamerUv.y*180.);
      float fade=1.-smoothstep(.4,1.8,max(fwidth(vStreamerUv.x*620.),fwidth(vStreamerUv.y*180.)));
      diffuseColor.rgb*=.94+.06*weave*fade;`,
      );
  };
  m.customProgramCacheKey = () => "vesper-sky-streamer-1";
  return m;
}

export function buildSkyStreamers(bridge, material) {
  const length = spanCoordinates(bridge, bridge.bx, bridge.bz).length,
    anchors = [],
    segments = 20,
    positions = [],
    uvs = [],
    colors = [],
    indices = [];
  for (const side of [-1, 1])
    for (const s of [2, length / 2, length - 2]) {
      anchors.push({
        x: side * 2.55,
        y: bridgeDeckY(bridge, s) - bridge.ay + 1.5,
        z: s,
      });
      const offset = positions.length / 3;
      for (let i = 0; i <= segments; i++)
        for (let j = 0; j < 2; j++) {
          const u = i / segments,
            color = new THREE.Color(
              u > 0.78 || (u > 0.22 && u < 0.32) ? 0xad6951 : 0xe4d5ae,
            );
          positions.push(0, 0, 0);
          uvs.push(u, j);
          colors.push(color.r, color.g, color.b);
          if (i < segments && j === 0) {
            const a = offset + i * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
          }
        }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${bridge.id} warning streamers`;
  mesh.userData.animated = true;
  mesh.castShadow = mesh.receiveShadow = true;
  bridge.root.add(mesh);
  bridge.streamers = { mesh, anchors, segments, time: 0 };
  updateSkyStreamers(bridge, 0);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 3;
}

export function updateSkyStreamers(bridge, time) {
  const h = bridge.streamers;
  if (!h || !h.mesh.visible) return;
  h.time = time;
  const gust = bridge.gust,
    lift = Math.max(gust?.strength || 0, (gust?.warning || 0) * 0.45),
    direction = gust?.direction || 1,
    positions = h.mesh.geometry.attributes.position;
  for (const [index, anchor] of h.anchors.entries())
    for (let i = 0; i <= h.segments; i++)
      for (let j = 0; j < 2; j++) {
        const u = i / h.segments,
          phase = time * 5 + index * 0.65 - u * 10;
        positions.setXYZ(
          index * (h.segments + 1) * 2 + i * 2 + j,
          anchor.x + direction * u * 1.7 * (0.1 + lift * 0.9),
          anchor.y -
            u * 1.7 * (0.85 - lift * 0.78) +
            Math.sin(phase) * u * 0.075 * lift,
          anchor.z +
            (j - 0.5) * 0.32 * (1 - u * 0.28) +
            Math.sin(phase * 1.2) * u * 0.11 * lift,
        );
      }
  positions.needsUpdate = true;
  h.mesh.geometry.computeVertexNormals();
}
