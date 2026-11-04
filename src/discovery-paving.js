import * as THREE from "three";
import { pavingMaterial } from "./station-yards.js";
import { inEchoGallery } from "./echo-gallery-rules.js";
import { inOrbitVault } from "./orbit-rules.js";

export function polygonArea(points) {
  return (
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}

export function pavingSeparated(a, b, margin = 0.025) {
  for (const points of [a, b])
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        q = points[(i + 1) % points.length],
        length = Math.hypot(q[0] - p[0], q[1] - p[1]),
        x = (q[1] - p[1]) / length,
        z = (p[0] - q[0]) / length,
        pa = a.map((v) => v[0] * x + v[1] * z),
        pb = b.map((v) => v[0] * x + v[1] * z);
      if (
        Math.max(...pa) + margin <= Math.min(...pb) ||
        Math.max(...pb) + margin <= Math.min(...pa)
      )
        return true;
    }
  return false;
}

export function discoveryPavingAllowed(game, points) {
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    x = (minX + maxX) / 2,
    z = (minZ + maxZ) / 2,
    r = Math.hypot(maxX - minX, maxZ - minZ) / 2;
  if (
    inEchoGallery(game.map, x, z, r + 0.1) ||
    inOrbitVault(game.map, x, z, r + 0.1)
  )
    return false;
  if (
    game.terrainProfile.waters.some(
      (w) =>
        minX < w.x + w.width / 2 + 0.1 &&
        maxX > w.x - w.width / 2 - 0.1 &&
        minZ < w.z + w.length / 2 + 0.1 &&
        maxZ > w.z - w.length / 2 - 0.1,
    )
  )
    return false;
  let low = Infinity,
    high = -Infinity;
  for (const [px, pz] of [...points, [x, z]]) {
    if (!game.canMove(px, pz, 0)) return false;
    const h = game.groundHeight(px, pz);
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  return high - low <= 0.4;
}

// Clip each delivered terrain triangle against the four footprint half-planes.
// Heights interpolate on that triangle, including its internal grid diagonal.
export function discoveryInlayGeometry(profile, footprint) {
  const points =
    polygonArea(footprint) > 0 ? footprint : [...footprint].reverse();
  if (points.length !== 4 || Math.abs(polygonArea(points)) < 1e-6)
    throw Error("Invalid discovery paving footprint");
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    scale = Math.max(0.1, Math.min(maxX - minX, maxZ - minZ)),
    edges = points.map((p, i) => {
      const q = points[(i + 1) % 4],
        dx = q[0] - p[0],
        dz = q[1] - p[1],
        length = Math.hypot(dx, dz);
      return { x: p[0], z: p[1], nx: -dz / length, nz: dx / length };
    }),
    distance = (e, p) => (p[0] - e.x) * e.nx + (p[2] - e.z) * e.nz,
    position = [],
    uv = [],
    inlay = [],
    planes = [];
  for (
    let z = Math.floor(minZ / profile.step) * profile.step;
    z < maxZ;
    z += profile.step
  )
    for (
      let x = Math.floor(minX / profile.step) * profile.step;
      x < maxX;
      x += profile.step
    ) {
      const d = profile.step,
        a = [x, profile.height(x, z), z],
        b = [x, profile.height(x, z + d), z + d],
        c = [x + d, profile.height(x + d, z + d), z + d],
        e = [x + d, profile.height(x + d, z), z];
      for (let polygon of [
        [a, b, e],
        [b, c, e],
      ]) {
        for (const edge of edges) {
          const out = [];
          for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i],
              q = polygon[(i + 1) % polygon.length],
              dp = distance(edge, p),
              dq = distance(edge, q);
            if (dp >= 0) out.push(p);
            if (dp >= 0 !== dq >= 0) {
              const t = dp / (dp - dq);
              out.push(p.map((v, j) => v + (q[j] - v) * t));
            }
          }
          polygon = out;
        }
        for (let i = 1; i < polygon.length - 1; i++) {
          const tri = [polygon[0], polygon[i], polygon[i + 1]];
          if (
            Math.abs(
              (tri[1][0] - tri[0][0]) * (tri[2][2] - tri[0][2]) -
                (tri[1][2] - tri[0][2]) * (tri[2][0] - tri[0][0]),
            ) < 1e-10
          )
            continue;
          for (const p of tri) {
            position.push(p[0], p[1] + 0.003, p[2]);
            uv.push(p[0] / 5, p[2] / 5);
            inlay.push(0.5, 0.5, 1);
            planes.push(...edges.map((e) => distance(e, p) / scale));
          }
        }
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("inlayUv", new THREE.Float32BufferAttribute(inlay, 3));
  geometry.setAttribute(
    "discoveryEdge",
    new THREE.Float32BufferAttribute(planes, 4),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function discoveryPavingMaterial(biome, map) {
  const material = pavingMaterial(
      biome,
      map,
      biome === "jungle" ? "stone" : undefined,
    ),
    parent = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.name = "Regional discovery floor fragments";
  material.vertexColors = true;
  material.color.setHex(0xffffff);
  material.onBeforeCompile = (shader) => {
    parent(shader);
    shader.vertexShader =
      "attribute vec4 discoveryEdge; varying vec4 vDiscoveryEdge;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvDiscoveryEdge=discoveryEdge;",
    );
    shader.fragmentShader =
      "varying vec4 vDiscoveryEdge;\n" + shader.fragmentShader;
    const original =
      "vec2 edgePair = min(vInlayUv.xy, 1.0 - vInlayUv.xy);\n      float edge = min(min(edgePair.x, edgePair.y), vInlayUv.z);";
    if (!shader.fragmentShader.includes(original))
      throw Error("Missing discovery edge shader hook");
    shader.fragmentShader = shader.fragmentShader.replace(
      original,
      "float edge=min(min(vDiscoveryEdge.x,vDiscoveryEdge.y),min(vDiscoveryEdge.z,vDiscoveryEdge.w));",
    );
    // Opaque surviving stone with a worn, shaded bevel. This changes relief
    // normals only; the inset's support remains on the actual ground surface.
    shader.fragmentShader = shader.fragmentShader.replace(
      "edge) * .84;",
      "edge);",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clearcoat_normal_fragment_begin>",
      /* glsl */ `
      float discoveryRelief=.012*smoothstep(.01,max(.13,fwidth(edge)*1.5),edge);
      vec3 discoveryDx=dFdx(-vViewPosition),discoveryDy=dFdy(-vViewPosition);
      vec3 discoveryR1=cross(discoveryDy,nonPerturbedNormal),discoveryR2=cross(nonPerturbedNormal,discoveryDx);
      float discoveryDet=dot(discoveryDx,discoveryR1);
      vec3 discoveryGrad=sign(discoveryDet)*(dFdx(discoveryRelief)*discoveryR1+dFdy(discoveryRelief)*discoveryR2);
      normal=normalize(normal-discoveryGrad/max(abs(discoveryDet),1e-8));
      #include <clearcoat_normal_fragment_begin>`,
    );
  };
  material.customProgramCacheKey = () => key + "|discovery-polygon-edges-v2";
  return material;
}
