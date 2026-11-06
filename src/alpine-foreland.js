import * as THREE from "three";
import { desertNoise } from "./desert-geology.js";
import {
  alpineDeclarations,
  alpineDetailDeclarations,
  alpineColorLayer,
  alpineNormalLayer,
  alpineHazeLayer,
} from "./alpine-shader.js";

const TAU = Math.PI * 2;
const cross = (a, b) => a.x * b.z - a.z * b.x;
const angleOf = (x, z, center) =>
  (Math.atan2(z - center, x - center) + TAU) % TAU;

// Read the delivered boundary, including every terrain-grid break. Keeping
// those vertices avoids a straight chord across an intervening high/low sample.
function terrainEdge(profile, meshes) {
  const extent = profile.extent,
    center = extent / 2,
    found = new Map();
  for (const mesh of meshes) {
    const a = mesh.geometry.attributes;
    for (let i = 0; i < a.position.count; i++) {
      const x = a.position.getX(i),
        z = a.position.getZ(i);
      if (x !== 0 && x !== extent && z !== 0 && z !== extent) continue;
      const key = `${x},${z}`;
      if (found.has(key)) continue;
      found.set(key, {
        angle: angleOf(x, z, center),
        x,
        y: a.position.getY(i),
        z,
        normal: [a.normal.getX(i), a.normal.getY(i), a.normal.getZ(i)],
        court: a.court.getX(i),
        trail: a.trail.getX(i),
        snowRock: a.snowRock.getX(i),
      });
    }
  }
  const points = [...found.values()].sort((a, b) => a.angle - b.angle);
  if (points.length !== (profile.width - 1) * 4 || points[0].angle !== 0)
    throw Error("Foreland requires the complete delivered square terrain edge");
  return [...points, { ...points[0], angle: TAU }];
}

// Intersect a radial line with the actual polygon edge, rather than a smooth
// circle. Its height therefore lies on the same straight delivered segment.
function ringPoint(points, angle, center) {
  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].angle <= angle) lo = mid;
    else hi = mid;
  }
  const a = points[lo],
    b = points[hi],
    u = { x: Math.cos(angle), z: Math.sin(angle) },
    p = { x: a.x - center, z: a.z - center },
    d = { x: b.x - a.x, z: b.z - a.z },
    t = THREE.MathUtils.clamp(-cross(p, u) / cross(d, u), 0, 1);
  return { x: a.x + d.x * t, y: a.y + (b.y - a.y) * t, z: a.z + d.z * t };
}

// A zipper joins unequal rings without adding collinear boundary vertices.
// Both real terrain and range edges retain their original segmentation.
function joinRings(index, inner, outer) {
  let i = 0,
    j = 0;
  while (i < inner.length - 1 || j < outer.length - 1) {
    if (
      j === outer.length - 1 ||
      (i < inner.length - 1 && inner[i + 1].angle <= outer[j + 1].angle)
    ) {
      index.push(inner[i].index, inner[i + 1].index, outer[j].index);
      i++;
    } else {
      index.push(inner[i].index, outer[j + 1].index, outer[j].index);
      j++;
    }
  }
}

export function alpineForelandGeometry(profile, terrainMeshes, mountain) {
  const center = profile.extent / 2,
    inner = terrainEdge(profile, terrainMeshes),
    a = mountain.attributes,
    segments = mountain.userData.segments,
    outer = Array.from({ length: segments + 1 }, (_, i) => ({
      angle: (i * TAU) / segments,
      x: a.position.getX(i),
      y: a.position.getY(i),
      z: a.position.getZ(i),
      normal: [a.normal.getX(i), a.normal.getY(i), a.normal.getZ(i)],
      court: 0,
      trail: 0,
      snowRock: 0,
    })),
    candidates = [...inner.slice(0, -1), ...outer.slice(0, -1)]
      .map((p) => p.angle)
      .sort((a, b) => a - b),
    angles = candidates.filter(
      (v, i) => i === 0 || v - candidates[i - 1] > 1e-6,
    ),
    p = [],
    uv = [],
    court = [],
    trail = [],
    snowRock = [],
    foreland = [],
    index = [],
    rings = 32;
  angles.push(TAU);
  const add = (point, t) => {
    const n = p.length / 3;
    p.push(point.x, point.y, point.z);
    uv.push(point.x / 4, point.z / 4);
    court.push(point.court || 0);
    trail.push(point.trail || 0);
    snowRock.push(point.snowRock || 0);
    foreland.push(t);
    return { angle: point.angle, index: n };
  };
  const first = inner.map((point) => add(point, 0));
  let previous = first;
  // Smooth a densely sampled periodic edge field. Widely spaced convolution
  // taps alias the one-cell terrain detail into regularly spaced radial ribs.
  const samples = 2048,
    angularStep = TAU / samples;
  const raw = Array.from({ length: samples }, (_, i) => {
    const angle = i * angularStep,
      near = ringPoint(inner, angle, center),
      radius = Math.hypot(near.x - center, near.z - center),
      inside = profile.surfaceHeight(
        near.x - Math.cos(angle) * profile.step,
        near.z - Math.sin(angle) * profile.step,
      );
    return { height: near.y, slope: (near.y - inside) / profile.step, radius };
  });
  const field = raw.map((point, i) => {
    const sigma = 15 / (point.radius * angularStep),
      span = Math.ceil(sigma * 3);
    let height = 0,
      slope = 0,
      weight = 0;
    for (let j = -span; j <= span; j++) {
      const w = Math.exp(-0.5 * (j / sigma) ** 2),
        p = raw[(i + j + samples) % samples];
      height += p.height * w;
      slope += p.slope * w;
      weight += w;
    }
    return {
      height: height / weight,
      slope: THREE.MathUtils.clamp(slope / weight, -0.35, 0.35),
    };
  });
  const shoulder = (angle) => {
    angle = ((angle % TAU) + TAU) % TAU;
    const k = angle / angularStep,
      i = Math.floor(k),
      f = k - i,
      a = field[i],
      b = field[(i + 1) % samples];
    return {
      angle,
      near: ringPoint(inner, angle, center),
      far: ringPoint(outer, angle, center),
      height: THREE.MathUtils.lerp(a.height, b.height, f),
      slope: THREE.MathUtils.lerp(a.slope, b.slope, f),
    };
  };
  const heightAt = ({ near, far, height, slope }, t, x, z) => {
    const t2 = t * t,
      t3 = t2 * t,
      length = Math.hypot(far.x - near.x, far.z - near.z),
      detailT = Math.min(1, (t * length) / 20),
      detail = (near.y - height) * (1 - detailT * detailT * (3 - 2 * detailT)),
      envelope = Math.sin(Math.PI * t) ** 2,
      warp = (desertNoise(x * 0.016, z * 0.019, 1049) - 0.5) * 26,
      broad = desertNoise((x + warp) * 0.016, z * 0.019, 1171),
      incision = Math.abs(
        desertNoise((x + warp) * 0.031, z * 0.027, 1259) * 2 - 1,
      ),
      fine = desertNoise(x * 0.061, (z + warp) * 0.053, 1361) - 0.5;
    return (
      (2 * t3 - 3 * t2 + 1) * height +
      (t3 - 2 * t2 + t) * length * slope +
      (-2 * t3 + 3 * t2) * far.y +
      detail +
      envelope * ((broad - 0.5) * 20 - incision * incision * 8 + fine * 1.5)
    );
  };
  const shoulders = angles.map(shoulder);
  // Sample the same field at a fixed world-space distance. Lighting must not
  // depend on the narrow triangles needed to retain both boundary grids.
  const sampleHeight = (angle, radius) => {
    const s = shoulder(angle),
      nearRadius = Math.hypot(s.near.x - center, s.near.z - center),
      length = Math.hypot(s.far.x - s.near.x, s.far.z - s.near.z),
      t = THREE.MathUtils.clamp((radius - nearRadius) / length, 0, 1);
    return heightAt(
      s,
      t,
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
    );
  };
  const fieldNormal = (angle, x, z) => {
    const radius = Math.hypot(x - center, z - center),
      d = 0.75,
      da = d / radius,
      radial =
        (sampleHeight(angle, radius + d) - sampleHeight(angle, radius - d)) /
        (2 * d),
      tangent =
        (sampleHeight(angle + da, radius) - sampleHeight(angle - da, radius)) /
        (2 * d),
      nx = radial * Math.cos(angle) - tangent * Math.sin(angle),
      nz = radial * Math.sin(angle) + tangent * Math.cos(angle),
      length = Math.hypot(nx, 1, nz);
    return [-nx / length, 1 / length, -nz / length];
  };
  const normalsData = inner.flatMap((point) => point.normal);
  for (let r = 1; r < rings; r++) {
    const t = (r / rings) ** 1.35,
      row = shoulders.map((s) => {
        const { angle, near, far } = s,
          x = THREE.MathUtils.lerp(near.x, far.x, t),
          z = THREE.MathUtils.lerp(near.z, far.z, t),
          y = heightAt(s, t, x, z);
        normalsData.push(...fieldNormal(angle, x, z));
        return add({ angle, x, y, z, snowRock: 1 }, t);
      });
    joinRings(index, previous, row);
    previous = row;
  }
  const last = outer.map((point) => add(point, 1));
  joinRings(index, previous, last);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("court", new THREE.Float32BufferAttribute(court, 1));
  geometry.setAttribute("trail", new THREE.Float32BufferAttribute(trail, 1));
  geometry.setAttribute(
    "snowRock",
    new THREE.Float32BufferAttribute(snowRock, 1),
  );
  geometry.setAttribute(
    "foreland",
    new THREE.Float32BufferAttribute(foreland, 1),
  );
  geometry.setIndex(index);
  normalsData.push(...outer.flatMap((point) => point.normal));
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normalsData, 3),
  );
  const normals = geometry.attributes.normal;
  for (const [row, source] of [
    [first, inner],
    [last, outer],
  ])
    row.forEach((point, i) => normals.setXYZ(point.index, ...source[i].normal));
  // Copy the periodic seam exactly after float conversion.
  for (let r = 1; r < rings; r++) {
    const start = first.length + (r - 1) * angles.length,
      end = start + angles.length - 1,
      n = new THREE.Vector3()
        .fromBufferAttribute(normals, start)
        .add(new THREE.Vector3().fromBufferAttribute(normals, end))
        .normalize();
    normals.setXYZ(start, n.x, n.y, n.z);
    normals.setXYZ(end, n.x, n.y, n.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    innerCount: first.length,
    outerStart: last[0].index,
    outerCount: last.length,
    segments: angles.length - 1,
    rings,
  };
  return geometry;
}

export function alpineForelandMaterial(terrain, rock, haze, extent) {
  // Material.clone serializes userData, including the shared texture uniforms.
  // A prototype view copies all render settings without duplicating those maps.
  const template = Object.create(terrain);
  template.userData = {};
  const material = new THREE.MeshStandardMaterial().copy(template);
  material.name = "Snow shoulders and eroded alpine foreland";
  material.defines = { ...terrain.defines };
  material.userData = {
    ...terrain.userData,
    additionalTextures: [
      ...terrain.userData.additionalTextures,
      rock.map,
      rock.normalMap,
    ],
  };
  const uniforms = terrain.userData.terrainUniforms,
    boundaryIce = uniforms.frozenCenters?.value.some((center, i) => {
      const shape = uniforms.frozenShapes.value[i],
        radius = Math.max(shape.z, shape.w) * 1.12;
      return (
        center.x - radius <= 0 ||
        center.y - radius <= 0 ||
        center.x + radius >= extent ||
        center.y + radius >= extent
      );
    });
  if (!boundaryIce) delete material.defines.FROZEN_PATCH_COUNT;
  material.onBeforeCompile = (shader) => {
    terrain.onBeforeCompile(shader);
    shader.uniforms.alpineHaze = { value: haze };
    shader.uniforms.forelandRockMap = { value: rock.map };
    shader.uniforms.forelandRockNormal = { value: rock.normalMap };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float foreland; varying float vForeland, vForelandClip;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvForeland=foreland;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vForelandClip=gl_Position.z+gl_Position.w;
        float backgroundDepth=.2+.75*(max(0.,gl_Position.w)/(max(0.,gl_Position.w)+700.));
        gl_Position.z=gl_Position.w*backgroundDepth;`,
      );
    const declarations = alpineDeclarations
      .replace("varying vec3 vAlpinePosition, vAlpineNormal;", "")
      .replace("varying float vAlpineClip;", "")
      .replace("varying float vAlpineDeposit;", "");
    const color = alpineColorLayer
      .replaceAll("vAlpinePosition", "vTerrainPosition")
      .replaceAll("vAlpineNormal", "vTerrainNormal")
      .replaceAll("vAlpineDeposit", "0.")
      .replaceAll("alpineSample(map,", "alpineSample(forelandRockMap,");
    const normal = alpineNormalLayer.replaceAll(
      "alpineSample(normalMap,",
      "alpineSample(forelandRockNormal,",
    );
    const hazeLayer = alpineHazeLayer
      .replaceAll("vAlpinePosition", "vTerrainPosition")
      .replace("air);", "air*forelandBlend);");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        declarations +
          "\nvarying float vForeland, vForelandClip; uniform sampler2D forelandRockMap, forelandRockNormal;",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(vForelandClip<0.)discard;",
      )
      .replace("#include <normalmap_pars_fragment>", alpineDetailDeclarations);
    // The terrain callback expands these chunks; append at their actual next
    // standard-shader boundaries so both appearances retain their own maps.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float forelandBlend=smoothstep(.06,.86,vForeland);`,
      )
      .replace(
        "#include <alphamap_fragment>",
        `vec3 forelandLandColor=diffuseColor.rgb;
        diffuseColor.rgb=vec3(1.);
        ${color}
        diffuseColor.rgb=mix(forelandLandColor,diffuseColor.rgb,forelandBlend);
        #include <alphamap_fragment>`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `roughnessFactor=mix(roughnessFactor,.95,forelandBlend);
        #include <metalnessmap_fragment>`,
      );
    // Start the terrain normal from the same unperturbed normal as the far
    // rock, then blend their completed detail fields rather than compounding.
    const terrainNormalStart = "vec3 earthN =";
    shader.fragmentShader = shader.fragmentShader
      .replace(
        terrainNormalStart,
        "vec3 forelandBaseNormal=normal;\n" + terrainNormalStart,
      )
      .replace(
        "#include <clearcoat_normal_fragment_begin>",
        `vec3 forelandLandNormal=normal;
        normal=forelandBaseNormal;
        ${normal}
        normal=normalize(mix(forelandLandNormal,normal,forelandBlend));
        #include <clearcoat_normal_fragment_begin>`,
      )
      .replace(
        "#include <envmap_physical_pars_fragment>",
        THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll(
          "* envMapIntensity;",
          "* envMapIntensity * mix(1.,.45,smoothstep(.06,.86,vForeland));",
        ),
      )
      .replace("#include <opaque_fragment>", hazeLayer)
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
        #else
          float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
        #endif
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor*(1.-forelandBlend));
        #endif`,
      );
  };
  material.customProgramCacheKey = () =>
    terrain.customProgramCacheKey() + "-alpine-foreland-2-exposed-beds";
  return material;
}
