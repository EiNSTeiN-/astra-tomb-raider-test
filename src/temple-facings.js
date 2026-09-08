import * as THREE from "three";
import { random } from "./campaign.js";
import {
  carvedPanelGeometry,
  stoneBlockGeometry,
} from "./temple-architecture.js";

// The facing slabs overlap the original pier body. Their deepest relief lies at
// the slab surface and their raised edges stay inside its navigation footprint.
export function pierFacingPlan(width) {
  return {
    width: width * 0.56,
    height: 3.8,
    bottom: 1.7,
    surface: width * 0.41 + 0.05,
    backing: 0.16,
    footprint: width / 2 + 0.13,
  };
}

function tintGeometry(geometry, value = 1) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i++) colors[i] = value;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function facingGeometry(width, variant) {
  const plan = pierFacingPlan(width);
  const geometry = carvedPanelGeometry(
    plan.width,
    plan.height,
    variant,
    [24, 48],
  );
  // Lift the recess out of the structural block. The old single-sided panels
  // partially intersected the tapered pier near their lower courses.
  geometry.translate(0, 0, 0.095);
  const colors = geometry.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    const shade = THREE.MathUtils.clamp(
      0.43 + (colors.getX(i) - 0.68) * 2.15,
      0.43,
      1.05,
    );
    colors.setXYZ(i, shade, shade, shade);
  }
  return geometry;
}

function taperedRoot(points, radius, seed) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = 48,
    radial = 8;
  const geometry = new THREE.TubeGeometry(
    curve,
    segments,
    radius,
    radial,
    false,
  );
  const p = geometry.attributes.position;
  const rng = random(seed);
  const phase = rng() * 6;
  for (let row = 0; row <= segments; row++) {
    const t = row / segments,
      center = curve.getPointAt(t);
    const taper =
      (0.02 + 0.98 * Math.pow(1 - t, 0.7)) *
      (0.95 + 0.05 * Math.sin(t * 35 + phase));
    for (let ring = 0; ring <= radial; ring++) {
      const i = row * (radial + 1) + ring;
      p.setXYZ(
        i,
        center.x + (p.getX(i) - center.x) * taper,
        center.y + (p.getY(i) - center.y) * taper,
        center.z + (p.getZ(i) - center.z) * taper,
      );
    }
  }
  geometry.computeVertexNormals();
  return tintGeometry(geometry);
}

export function templeGrowthMaterials() {
  const wind = { value: 0 };
  const bark = new THREE.MeshStandardMaterial({
    name: "Temple woody climbers",
    color: 0x64604b,
    roughness: 0.94,
    vertexColors: true,
  });
  bark.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRootUv;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRootUv=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRootUv;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float fibre=.5+.5*sin(vRootUv.y*110.0+sin(vRootUv.x*37.0)*2.0);
        float scars=.5+.5*sin(vRootUv.x*250.0+sin(vRootUv.y*41.0)*5.0);
        diffuseColor.rgb*=.58+.28*fibre+.14*scars;`,
      );
  };
  bark.customProgramCacheKey = () => "vesper-temple-climber-1";
  const leaves = new THREE.MeshStandardMaterial({
    name: "Temple climbing leaves",
    color: 0x5c7738,
    roughness: 0.83,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const leafDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  const bend = (shader) => {
    shader.uniforms.templeTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float templeTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        transformed.x+=sin(templeTime*1.1+position.y*.7+position.z*.23)*uv.y*uv.y*.025;
        transformed.z+=cos(templeTime*.8+position.x*.22)*uv.y*uv.y*.015;`,
      );
  };
  leaves.onBeforeCompile = leafDepth.onBeforeCompile = bend;
  leaves.customProgramCacheKey = leafDepth.customProgramCacheKey = () =>
    "vesper-temple-leaf-wind-1";
  return { bark, leaves, leafDepth, wind };
}

function leafGeometry() {
  // Closed leaf silhouette with a raised midrib, no rectangular alpha card.
  const positions = [
    0, 0, 0, -0.085, 0.12, 0, 0, 0.12, 0.018, 0.085, 0.12, 0, -0.06, 0.24,
    -0.014, 0, 0.24, 0.008, 0.06, 0.24, -0.014, 0, 0.34, -0.035,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0.5, 0, 0, 0.35, 0.5, 0.35, 1, 0.35, 0, 0.7, 0.5, 0.7, 1, 0.7, 0.5, 1],
      2,
    ),
  );
  g.setIndex([
    0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 5, 2, 5, 6, 2, 6, 3, 4, 7, 5, 5, 7, 6,
  ]);
  const colors = [0.6, 0.74, 1.15, 0.7, 0.72, 1.15, 0.67, 0.65].flatMap((v) => [
    v,
    v,
    v,
  ]);
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function addPierFacings(
  detail,
  pier,
  bottom,
  room,
  index,
  material,
  growth,
) {
  const plan = pierFacingPlan(pier.width),
    rng = random(7011 + room.index * 173 + index * 37);
  const offset = new THREE.Vector3(pier.x, bottom, pier.z);
  const solid = (w, h, d, x, y, z, angle, shade = 1) => {
    const g = tintGeometry(
      stoneBlockGeometry(w, h, d, Math.floor(rng() * 100000), 0.026),
      shade,
    );
    const m = new THREE.Mesh(g, material);
    m.position
      .set(x, y, z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      .add(offset);
    m.rotation.y = angle;
    detail.add(m);
  };
  for (let side = 0; side < 4; side++) {
    const angle = (side * Math.PI) / 2;
    solid(
      plan.width + 0.1,
      plan.height + 0.14,
      plan.backing,
      0,
      plan.bottom + plan.height / 2,
      plan.surface - plan.backing / 2,
      angle,
      0.76 + rng() * 0.08,
    );
    const panel = new THREE.Mesh(
      facingGeometry(pier.width, room.index + side + index),
      material,
    );
    panel.position
      .set(0, plan.bottom, plan.surface)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      .add(offset);
    panel.rotation.y = angle;
    detail.add(panel);
    for (const sign of [-1, 1]) {
      solid(
        0.12,
        plan.height + 0.28,
        0.24,
        sign * (plan.width / 2 + 0.11),
        plan.bottom + plan.height / 2,
        plan.surface - 0.025,
        angle,
        0.84,
      );
      solid(
        plan.width + 0.36,
        0.13,
        0.25,
        0,
        plan.bottom + (sign < 0 ? -0.12 : plan.height + 0.12),
        plan.surface - 0.04,
        angle,
        0.89,
      );
    }
    // A carved belt at hand height breaks up otherwise uninterrupted courses.
    for (let n = 0; n < 5; n++)
      solid(
        0.12,
        0.12,
        0.13,
        (n - 2) * 0.29,
        1.15,
        plan.surface - 0.055,
        angle,
        n % 2 ? 0.77 : 0.94,
      );
  }
  const rooted = Math.abs(pier.x) === 19 && (room.index + index) % 4 === 0;
  const roots = [];
  if (rooted) {
    for (let n = 0; n < 5; n++) {
      const points = [];
      const corner = ((n % 4) * Math.PI) / 2 + Math.PI / 4;
      const radius = 0.075 + rng() * 0.055;
      for (let j = 0; j < 10; j++) {
        const y = -0.1 + j * 0.84,
          a = corner + Math.sin(j * 0.65 + n * 0.8) * 0.48;
        const row = Math.max(0, Math.min(11, Math.floor((y - 0.7) / 0.58)));
        let face =
          y < 0.55
            ? pier.width / 2 + 0.01
            : pier.width * 0.41 * (1 - row * 0.008) + radius * 0.35;
        const q = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        const along =
          (Math.min(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) / q) * face;
        if (y > 1.55 && y < 5.75) {
          const facing =
            1 -
            THREE.MathUtils.smoothstep(
              along,
              plan.width / 2 - 0.06,
              plan.width / 2 + 0.22,
            );
          face = THREE.MathUtils.lerp(
            face,
            plan.surface + 0.14 + radius * 0.25,
            facing,
          );
        }
        points.push(
          new THREE.Vector3(
            (Math.cos(a) / q) * face,
            y,
            (Math.sin(a) / q) * face,
          ),
        );
      }
      const geometry = taperedRoot(
        points,
        radius,
        room.index * 113 + index * 11 + n,
      );
      const vertices = geometry.attributes.position;
      for (let v = 0; v < vertices.count; v++)
        if (vertices.getY(v) < 1.8) {
          const bound = plan.footprint - 0.015;
          vertices.setX(
            v,
            THREE.MathUtils.clamp(vertices.getX(v), -bound, bound),
          );
          vertices.setZ(
            v,
            THREE.MathUtils.clamp(vertices.getZ(v), -bound, bound),
          );
        }
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, growth.bark);
      mesh.position.copy(offset);
      detail.add(mesh);
      roots.push({ geometry, offset: offset.clone(), radius });
      for (let j = 3; j < 9; j++)
        for (const side of [-1, 1]) {
          const leaf = new THREE.Mesh(leafGeometry(), growth.leaves);
          const point = points[j];
          leaf.position.copy(point).add(offset);
          leaf.rotation.set(
            0.4 + rng() * 0.6,
            corner + Math.PI / 2,
            side * (0.6 + rng() * 0.4),
          );
          leaf.scale.setScalar(0.7 + rng() * 0.6);
          detail.add(leaf);
        }
    }
  }
  return { plan, rooted, roots };
}
