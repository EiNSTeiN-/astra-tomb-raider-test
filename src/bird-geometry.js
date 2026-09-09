import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original fictional songbirds share a small articulated anatomy. The colors,
// crest, bill and tail distinguish the four habitats without adding asset loads.
export const BIRD_PALETTES = {
  jungle: {
    back: 0x52614e,
    breast: 0xa99b70,
    wing: 0x344b43,
    tip: 0x222e2c,
    face: 0x9ca879,
    bill: 0x403c2b,
    tail: 1.2,
    crest: 0,
  },
  desert: {
    back: 0x9e825e,
    breast: 0xd6bd91,
    wing: 0x735d46,
    tip: 0x423c34,
    face: 0xdfc9a0,
    bill: 0x4c4337,
    tail: 0.85,
    crest: 4,
  },
  water: {
    back: 0x657b86,
    breast: 0xd2d5cd,
    wing: 0x435c6a,
    tip: 0x293a48,
    face: 0xa9bcc0,
    bill: 0x474849,
    tail: 1.05,
    crest: 0,
  },
  sky: {
    back: 0x969c9b,
    breast: 0xd9c8a0,
    wing: 0x5b646d,
    tip: 0x303942,
    face: 0xd8dcd3,
    bill: 0x45413a,
    tail: 0.95,
    crest: 2,
  },
};

function tint(g, color, vary) {
  const base = new THREE.Color(color),
    p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = vary ? vary(base.clone(), p.getX(i), p.getY(i), p.getZ(i)) : base;
    colors.set(c.toArray(), i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

// Closed feather with a raised central shaft and tapered, curved tip.
function feather(length, width, bend = 0.015, segments = 10) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = Math.max(0.001, Math.pow(Math.sin(Math.PI * t), 0.65) * width);
    for (const [x, y] of [
      [-w, 0],
      [0, 0.006],
      [w, 0],
      [0, -0.003],
    ]) {
      positions.push(x, y + bend * t * t, -length * t);
      uvs.push(x / (width * 2) + 0.5, t);
    }
    if (i < segments)
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k,
          b = i * 4 + ((k + 1) % 4);
        indices.push(a, a + 4, b, b, a + 4, b + 4);
      }
  }
  indices.push(0, 1, 2, 0, 2, 3);
  const last = segments * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function birdGeometry(biome, detailed = true) {
  const p = BIRD_PALETTES[biome],
    parts = {};
  const n = detailed ? 24 : 12,
    rings = detailed ? 16 : 8;
  const add = (
    part,
    g,
    color,
    position = [0, 0, 0],
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    vary,
  ) => {
    tint(g, color, vary);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      ),
    );
    (parts[part] ||= []).push(g);
  };
  const sphere = (part, color, position, scale, rotation, vary) =>
    add(
      part,
      new THREE.SphereGeometry(1, n, rings),
      color,
      position,
      scale,
      rotation,
      vary,
    );
  sphere(
    "body",
    p.back,
    [0, 0.035, -0.015],
    [0.103, 0.126, 0.22],
    [-0.28, 0, 0],
    (c, x, y, z) =>
      c.lerp(
        new THREE.Color(p.breast),
        THREE.MathUtils.smoothstep(z - y * 0.6, -0.3, 0.85),
      ),
  );
  sphere(
    "head",
    p.back,
    [0, 0.025, 0.02],
    [0.076, 0.078, 0.088],
    [0.12, 0, 0],
    (c, x, y, z) =>
      c.lerp(
        new THREE.Color(p.face),
        THREE.MathUtils.smoothstep(z - y, -0.3, 0.9),
      ),
  );
  // Bill tapers forward, with a separated lower mandible and dark mouth seam.
  const billLength =
    biome === "water" ? 0.105 : biome === "desert" ? 0.087 : 0.068;
  add(
    "head",
    new THREE.ConeGeometry(0.026, billLength, detailed ? 12 : 6),
    p.bill,
    [0, 0.023, 0.094 + billLength * 0.44],
    [1, 1, 0.6],
    [Math.PI / 2, 0, 0],
  );
  add(
    "jaw",
    new THREE.ConeGeometry(0.021, billLength * 0.87, 8),
    p.bill,
    [0, -0.007, billLength * 0.43],
    [1, 1, 0.4],
    [Math.PI / 2, 0, 0],
  );
  for (const s of [-1, 1]) {
    sphere("head", p.face, [s * 0.064, 0.047, 0.05], [0.005, 0.014, 0.017]);
    sphere("eyes", 0x090d0b, [s * 0.069, 0.05, 0.053], [0.004, 0.009, 0.01]);
    if (detailed)
      sphere(
        "eyes",
        0xb9b8aa,
        [s * 0.0725, 0.053, 0.056],
        [0.0007, 0.0014, 0.001],
      );
    for (let i = 0; i < p.crest; i++)
      add(
        "head",
        feather(0.067 + i * 0.007, 0.009, 0.012, 6),
        i % 2 ? p.tip : p.back,
        [s * 0.008, 0.093, 0.022 - i * 0.013],
        [1, 1, 1],
        [0.35, s * 0.11, 0],
      );
    sphere(
      "wing" + s,
      p.back,
      [s * 0.005, -0.008, -0.08],
      [0.016, 0.069, 0.115],
      [-0.22, 0, s * 0.12],
    );
    for (let i = 0; i < (detailed ? 7 : 3); i++) {
      const t = i / (detailed ? 6 : 2);
      add(
        "wing" + s,
        feather(0.25 - t * 0.055, 0.02, 0.012, detailed ? 10 : 4),
        p.wing,
        [
          s * (0.023 + 0.003 * Math.sin(t * Math.PI)),
          0.047 - t * 0.105,
          0.012 - t * 0.025,
        ],
        [1, 1, 1],
        [-0.2, -s * (0.035 + t * 0.08), (-s * Math.PI) / 2],
        (c, x, y, z) =>
          c.lerp(
            new THREE.Color(p.tip),
            THREE.MathUtils.smoothstep(-z, 0.17, 0.25),
          ),
      );
      if (detailed)
        add(
          "wing" + s,
          feather(0.135, 0.017, 0.008, 6),
          p.back,
          [s * 0.035, 0.047 - t * 0.099, 0.05],
          [1, 1, 1],
          [-0.25, -s * 0.05, (-s * Math.PI) / 2],
        );
    }
    // Feet stay planted while the upper body breathes and looks around.
    const leg = new THREE.CylinderGeometry(
      0.009,
      0.006,
      0.11,
      detailed ? 8 : 5,
    );
    add(
      "feet",
      leg,
      0x70604b,
      [s * 0.047, -0.116, 0.014],
      [1, 1, 1],
      [0.24, 0, 0],
    );
    for (const toe of detailed ? [-1, 0, 1, 2] : [0, 2]) {
      const back = toe === 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.047, -0.163, 0.005),
        new THREE.Vector3(
          s * 0.047 + (back ? 0 : toe * 0.016),
          -0.172,
          back ? -0.028 : 0.038,
        ),
        new THREE.Vector3(
          s * 0.047 + (back ? 0 : toe * 0.028),
          -0.176,
          back ? -0.055 : 0.068 - Math.abs(toe) * 0.008,
        ),
      ]);
      add(
        "feet",
        new THREE.TubeGeometry(curve, detailed ? 8 : 3, 0.004, 4, false),
        0x73624b,
      );
    }
  }
  for (let i = 0; i < (detailed ? 6 : 3); i++) {
    const t = i / (detailed ? 5 : 2) - 0.5;
    add(
      "tail",
      feather(
        (0.26 - Math.abs(t) * 0.035) * p.tail,
        detailed ? 0.022 : 0.035,
        0.025,
        detailed ? 12 : 5,
      ),
      p.wing,
      [t * 0.09, 0, 0],
      [1, 1, 1],
      [-0.15, -t * 0.25, 0],
      (c, x, y, z) =>
        c.lerp(
          new THREE.Color(p.tip),
          THREE.MathUtils.smoothstep(-z, 0.15, 0.26),
        ),
    );
  }
  return Object.fromEntries(
    Object.entries(parts).map(([name, pieces]) => {
      const geometries = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
      const geometry = mergeGeometries(geometries);
      if (name === "eyes") geometry.translate(0, -0.05, 0);
      for (const g of new Set([...pieces, ...geometries])) g.dispose();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return [name, geometry];
    }),
  );
}

export function birdMaterials() {
  const feathers = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
  });
  feathers.name = "Regional bird plumage";
  feathers.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float strand = vUv.y*1400.0+abs(vUv.x-.5)*170.0;
      float barb = sin(strand)*.018*(1.0-smoothstep(.5,3.0,fwidth(strand)));
      diffuseColor.rgb *= .99+barb;`,
    );
  };
  feathers.defines = { USE_UV: "" };
  feathers.customProgramCacheKey = () => "vesper-bird-plumage-1";
  const eyes = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.19,
  });
  eyes.name = "Bird eyes";
  return { feathers, eyes };
}
