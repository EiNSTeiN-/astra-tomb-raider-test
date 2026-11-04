import * as THREE from "three";
import { RoofCamera } from "./roof-camera.js";
import { stationAssemblySolid } from "./field-station-solids.js";

function timberSurface(material, timber) {
  if (!material.map || !timber.map || !timber.normalMap || !timber.roughnessMap)
    return;
  // These enumerable texture handles join the existing material teardown.
  // Material.clone() ignores them, avoiding texture serialization in userData.
  material.roofTimberMap = timber.map;
  material.roofTimberNormal = timber.normalMap;
  material.roofTimberRoughness = timber.roughnessMap;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      roofTimberMap: { value: material.roofTimberMap },
      roofTimberNormal: { value: material.roofTimberNormal },
      roofTimberRoughness: { value: material.roofTimberRoughness },
      roofTimberTint: { value: timber.color },
      roofTimberNormalScale: { value: timber.normalScale },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float roofLining; varying float vRoofLining;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRoofLining=roofLining;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vRoofLining;
        uniform sampler2D roofTimberMap, roofTimberNormal, roofTimberRoughness;
        uniform vec3 roofTimberTint;
        uniform vec2 roofTimberNormalScale;`,
      )
      .replace(
        "#include <map_fragment>",
        `if(vRoofLining>.5){
          diffuseColor.rgb=texture2D(roofTimberMap,vMapUv).rgb*roofTimberTint;
        }else{
          #include <map_fragment>
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        THREE.ShaderChunk.roughnessmap_fragment.replace(
          "texture2D( roughnessMap, vRoughnessMapUv )",
          "(vRoofLining>.5?texture2D(roofTimberRoughness,vRoughnessMapUv):texture2D(roughnessMap,vRoughnessMapUv))",
        ),
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps
          .replaceAll(
            "texture2D( normalMap, vNormalMapUv )",
            "(vRoofLining>.5?texture2D(roofTimberNormal,vNormalMapUv):texture2D(normalMap,vNormalMapUv))",
          )
          .replace(
            "mapN.xy *= normalScale;",
            "mapN.xy *= mix(normalScale,roofTimberNormalScale,vRoofLining);",
          ),
      );
  };
  material.customProgramCacheKey = () => "vesper-timber-roof-1";
  material.needsUpdate = true;
}

function clip(polygon, x, keepRight) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = (a.x - x) * (keepRight ? 1 : -1),
      db = (b.x - x) * (keepRight ? 1 : -1);
    if (da >= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0))
      result.push(a.clone().lerp(b, da / (da - db)));
  }
  return result;
}

// Clip the actual delivered underside triangles into narrow timber strips.
// Their upper faces meet the roof exactly, including hips and broken corners.
// Joined polygons form closed strips. Internal sides cancel; only real exposed
// boundaries need walls. Gaps between strips remain empty.
export function roofBattenGeometry(
  roof,
  { spacing = 1.2, width = 0.12, depth = 0.13 } = {},
) {
  const p = roof.attributes.position,
    index = roof.index,
    vertex = (i) =>
      new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i) : i),
    positions = [],
    uv = [],
    normal = [],
    edges = new Map(),
    bounds = new THREE.Box3().setFromBufferAttribute(p),
    center = (bounds.min.x + bounds.max.x) / 2;
  let cells = 0;
  const key = (v) =>
    v
      .toArray()
      .map((n) => Math.round(n * 1e5))
      .join(",");
  const triangle = (a, b, c) => {
    const n = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3()),
      vertical = Math.abs(n.y) < 1e-6,
      alongX = Math.abs(n.z) >= Math.abs(n.x);
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      normal.push(n.x, n.y, n.z);
      // Grain follows the long Z direction of each strip, including its sides.
      uv.push((vertical && alongX ? v.x : v.z) / 2, (vertical ? v.y : v.x) / 2);
    }
  };
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) => vertex(i + j));
    if (new THREE.Triangle(...v).getNormal(new THREE.Vector3()).y >= -1e-6)
      continue;
    const min = Math.min(...v.map((p) => p.x)),
      max = Math.max(...v.map((p) => p.x));
    for (
      let k = Math.ceil((min - center - width / 2) / spacing);
      k <= Math.floor((max - center + width / 2) / spacing);
      k++
    ) {
      const x = center + k * spacing;
      if (
        x - width / 2 < bounds.min.x + 0.05 ||
        x + width / 2 > bounds.max.x - 0.05
      )
        continue;
      let polygon = clip(clip(v, x - width / 2, true), x + width / 2, false);
      polygon = polygon.filter(
        (a, j) =>
          a.distanceToSquared(polygon[(j + 1) % polygon.length]) > 1e-14,
      );
      if (polygon.length < 3) continue;
      const area = polygon
        .slice(1, -1)
        .reduce(
          (sum, b, j) =>
            sum + new THREE.Triangle(polygon[0], b, polygon[j + 2]).getArea(),
          0,
        );
      if (area < 1e-8) continue;
      // Input underside winding points down; reverse it for the timber's top.
      const top = [...polygon].reverse(),
        bottom = top.map((v) => v.clone().add(new THREE.Vector3(0, -depth, 0)));
      for (let j = 1; j < top.length - 1; j++) {
        triangle(top[0], top[j], top[j + 1]);
        triangle(bottom[0], bottom[j + 1], bottom[j]);
      }
      for (let j = 0; j < top.length; j++) {
        const a = top[j],
          b = top[(j + 1) % top.length],
          id = [key(a), key(b)].sort().join("|");
        if (edges.has(id)) edges.delete(id);
        else edges.set(id, [a, b]);
      }
      cells++;
    }
  }
  for (const [a, b] of edges.values()) {
    const belowA = a.clone().add(new THREE.Vector3(0, -depth, 0)),
      belowB = b.clone().add(new THREE.Vector3(0, -depth, 0));
    triangle(a, belowA, belowB);
    triangle(a, belowB, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.userData = { cells, spacing, width, depth };
  return geometry;
}

export function dressMonasteryRoof(
  game,
  deck,
  snow,
  wood,
  { emit = null, physical = "all" } = {},
) {
  const geometry = deck.geometry,
    n = geometry.attributes.normal;
  geometry.setAttribute(
    "roofLining",
    new THREE.Float32BufferAttribute(
      Array.from({ length: n.count }, (_, i) => (n.getY(i) <= 0 ? 1 : 0)),
      1,
    ),
  );
  timberSurface(deck.material, wood);
  const battenGeometry = roofBattenGeometry(geometry);
  let battens;
  if (emit) battens = emit(battenGeometry);
  else {
    if (wood.vertexColors)
      battenGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(battenGeometry.attributes.position.count * 3).fill(
            1,
          ),
          3,
        ),
      );
    battens = new THREE.Mesh(battenGeometry, wood);
    deck.parent.add(battens);
  }
  battens.position.copy(deck.position);
  battens.quaternion.copy(deck.quaternion);
  battens.scale.copy(deck.scale);
  battens.castShadow = battens.receiveShadow = true;
  for (const mesh of [deck, snow, battens].filter(Boolean)) {
    const camera = game.cameraSurfaces,
      captured = camera?.pending?.find((e) => e.mesh === mesh);
    mesh.userData.cameraKernel =
      captured?.kernel || new RoofCamera(mesh.geometry);
    if (!captured) camera?.capture(mesh, { small: true, thin: true });
  }
  if (physical) {
    const meshes =
        physical === "all" ? [deck, snow, battens].filter(Boolean) : [battens],
      solid = stationAssemblySolid(
        game,
        { id: "monastery-roof-timber" },
        meshes,
        { bodyPadding: 0.55, supportRadius: 0 },
      );
    solid.groundingSlope = true;
    solid.roofTimber = true;
    deck.roofSupportSolid = solid;
  }
  game.monasteryRoofTimber ??= [];
  game.monasteryRoofTimber.push({
    cells: battenGeometry.userData.cells,
    triangles: battenGeometry.attributes.position.count / 3,
    source: deck.parent.name,
    position: deck.position.toArray(),
    physical,
  });
  return battens;
}
