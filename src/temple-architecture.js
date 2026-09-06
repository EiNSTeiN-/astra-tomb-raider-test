import * as THREE from "three";
import { random } from "./campaign.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";

// Chamfered blocks use flat faces and narrow bevels, rather than six subdivided
// grids. The disconnected faces retain sharp masonry edges after batching.
export function stoneBlockGeometry(w, h, d, seed = 1) {
  const rng = random(seed),
    half = [w / 2, h / 2, d / 2],
    bevel = Math.min(0.055, w * 0.07, h * 0.13, d * 0.07),
    positions = [],
    normals = [],
    uv = [];
  const face = (points) => {
    const a = new THREE.Vector3(...points[0]),
      b = new THREE.Vector3(...points[1]),
      c = new THREE.Vector3(...points[2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const center = points
      .reduce((sum, p) => sum.add(new THREE.Vector3(...p)), new THREE.Vector3())
      .divideScalar(points.length);
    if (n.dot(center) < 0) {
      points.reverse();
      n.negate();
    }
    const axis = Math.abs(n.x) > 0.7 ? 0 : Math.abs(n.y) > 0.7 ? 1 : 2;
    for (let i = 1; i < points.length - 1; i++)
      for (const p of [points[0], points[i], points[i + 1]]) {
        positions.push(...p);
        normals.push(n.x, n.y, n.z);
        uv.push((axis === 0 ? p[2] : p[0]) / 2, (axis === 1 ? p[2] : p[1]) / 2);
      }
  };
  const corners = new Map();
  // Each corner owns three points, one on each main face. The shared displacement
  // keeps every bevel watertight while slightly chipping the silhouette.
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const sign = [x, y, z],
          chip = [rng(), rng(), rng()].map((v) => (v - 0.5) * bevel * 0.28);
        corners.set(
          sign.join(","),
          sign.map((_, axis) =>
            sign.map(
              (s, k) => s * (half[k] - (axis === k ? 0 : bevel)) + chip[k],
            ),
          ),
        );
      }
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const rest = [0, 1, 2].filter((a) => a !== axis),
        points = [];
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const s = [0, 0, 0];
        s[axis] = sign;
        s[rest[0]] = a;
        s[rest[1]] = b;
        points.push(corners.get(s.join(","))[axis]);
      }
      face(points);
    }
  for (let along = 0; along < 3; along++) {
    const axes = [0, 1, 2].filter((a) => a !== along);
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const s = [0, 0, 0];
        s[axes[0]] = a;
        s[axes[1]] = b;
        s[along] = -1;
        const low = corners.get(s.join(","));
        s[along] = 1;
        const high = corners.get(s.join(","));
        face([low[axes[0]], low[axes[1]], high[axes[1]], high[axes[0]]]);
      }
  }
  for (const points of corners.values()) face([...points]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function templePlan(room) {
  const wings = [
    ["west", "east"],
    ["east"],
    ["west"],
    ["west", "east"],
    ["east"],
    ["west", "east"],
    ["west"],
    ["east"],
    ["west", "east"],
  ][room.index % 9];
  const piers = [-19, -12, -5.5, 5.5, 12, 19].map((x) => ({
    x,
    z: -18,
    width: 2.65,
  }));
  piers.push({ x: -19, z: 18, width: 2.9 }, { x: 19, z: 18, width: 2.9 });
  const spans = [];
  for (let i = 0; i < 5; i++)
    spans.push({
      a: piers[i],
      b: piers[i + 1],
      roof: !(room.index % 3 === 1 && i === 0),
    });
  for (const wing of wings) {
    const x = wing === "west" ? -19 : 19,
      points = [-18, -6, 6, 18].map((z) => ({ x, z, width: 2.65 }));
    piers.push(...points.slice(1, 3));
    for (let i = 0; i < 3; i++)
      spans.push({
        a: points[i],
        b: points[i + 1],
        roof: !(room.index % 3 === 2 && i === 1),
      });
  }
  return {
    piers,
    spans,
    wings,
    shrine: room.index % 3,
    broken: room.index % 3 === 1,
  };
}

// Original botanical relief: recessed borders, rising stems and a lotus rosette.
// It is sculpted geometry, so side lighting reveals the carving's depth.
export function carvedPanelGeometry(w = 1.3, h = 3.4, variant = 0) {
  const p = [],
    uv = [],
    colors = [],
    index = [],
    nx = 30,
    ny = 64;
  for (let iy = 0; iy <= ny; iy++)
    for (let ix = 0; ix <= nx; ix++) {
      const u = ix / nx,
        v = iy / ny,
        x = (u - 0.5) * w,
        y = v * h;
      const edge = Math.min(u, 1 - u, v * 0.6, (1 - v) * 0.6),
        frame = Math.exp(-Math.pow((edge - 0.034) / 0.016, 2));
      const cx = (u - 0.5) * 2,
        cy = (v - 0.62) * 3,
        angle = Math.atan2(cy, cx),
        radius = Math.hypot(cx, cy);
      const petals = 5 + (variant % 3),
        contour = 0.45 + 0.14 * Math.cos(angle * petals),
        lotus = Math.exp(-Math.pow((radius - contour) / 0.075, 2));
      const heart = Math.exp((-radius * radius) / 0.05);
      const stem =
        Math.exp(
          -Math.pow((cx - 0.08 * Math.sin(v * 16 + variant)) / 0.055, 2),
        ) * (v < 0.53 ? Math.sin((v / 0.53) * Math.PI) : 0);
      const leaves =
        Math.max(0, Math.sin(v * 29 + variant)) *
        Math.exp(
          -Math.pow((Math.abs(cx) - 0.21 - 0.12 * Math.sin(v * 12)) / 0.065, 2),
        ) *
        (v < 0.5 ? 1 : 0);
      const carving = Math.max(lotus * 0.8, heart, stem * 0.75, leaves * 0.65),
        recess = edge < 0.015 ? 0 : -0.085;
      const depth = recess + frame * 0.095 + carving * 0.12;
      p.push(x, y, depth);
      uv.push(x / 2, y / 2);
      const shade = 0.68 + frame * 0.13 + carving * 0.25;
      colors.push(shade, shade, shade);
      if (ix < nx && iy < ny) {
        const a = iy * (nx + 1) + ix;
        index.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function weatherStone(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vRuinPosition; varying vec3 vRuinNormal; varying float vRuinHeight;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRuinPosition=(modelMatrix*vec4(position,1.0)).xyz;
      vRuinNormal=normalize(mat3(modelMatrix)*normal); vRuinHeight=position.y;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vRuinPosition; varying vec3 vRuinNormal; varying float vRuinHeight;
      float ruinHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float ruinNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(ruinHash(i),ruinHash(i+vec3(1,0,0)),f.x),mix(ruinHash(i+vec3(0,1,0)),ruinHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(ruinHash(i+vec3(0,0,1)),ruinHash(i+vec3(1,0,1)),f.x),mix(ruinHash(i+vec3(0,1,1)),ruinHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float stoneLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(stoneLuma)*vec3(.96,1.0,.93),.72);
      float macro=ruinNoise(vRuinPosition*.39),grain=ruinNoise(vRuinPosition*3.7);
      float damp=(1.0-smoothstep(.1,3.4,vRuinHeight))*(.35+.65*macro);
      float moss=smoothstep(.56,.72,macro*.75+grain*.25)*(0.27+.6*max(0.0,vRuinNormal.y)+.35*damp);
      diffuseColor.rgb*=mix(.8,1.14,macro)*(1.0-damp*.32);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.17,.075),moss*.57);
    `,
    );
  };
  material.customProgramCacheKey = () => "vesper-weathered-temple-1";
}

export function buildTempleArchitecture(game) {
  if (game.level.biome !== "jungle") return false;
  game.templePatches = [];
  game.templeCaptureGeometry = [];
  const material = pbrMaterial("temple", 0xd5d3bd, 1);
  material.vertexColors = true;
  material.normalScale.set(0.55, 0.55);
  material.roughness = 0.9;
  weatherStone(material);
  game.templeMaterial = material;
  const detailMaterial = material.clone();
  weatherStone(detailMaterial);
  detailMaterial.normalScale.set(0.23, 0.23);
  const rng = random(game.level.seed + 8127),
    white = new THREE.Color();
  let serial = 0;
  for (const room of game.map.rooms) {
    const plan = templePlan(room),
      x = room.x * 7,
      z = room.z * 7,
      base = game.groundHeight(x, z),
      root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    game.world.add(root, detail);
    let blocks = 0,
      triangles = 0;
    const block = (w, h, d, px, py, pz, tint = 1, rotation = 0) => {
      const g = stoneBlockGeometry(w, h, d, ++serial + game.level.seed),
        m = new THREE.Mesh(g, material);
      const positions = g.attributes.position,
        colors = new Float32Array(positions.count * 3);
      const shade = (0.83 + rng() * 0.25) * tint;
      white.setRGB(shade, shade * (0.98 + rng() * 0.025), shade * 0.94);
      for (let i = 0; i < positions.count; i++) {
        const height = positions.getY(i) / h + 0.5,
          weather = 0.86 + 0.14 * height;
        colors[i * 3] = white.r * weather;
        colors[i * 3 + 1] = white.g * weather;
        colors[i * 3 + 2] = white.b * weather;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      m.position.set(px, py, pz);
      m.rotation.y = rotation;
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      blocks++;
      triangles += positions.count / 3;
      return m;
    };
    const cameraBox = (w, h, d, px, py, pz, rotation = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(px, py, pz);
      m.rotation.y = rotation;
      root.add(m);
      game.cameraSurfaces?.capture(m);
      root.remove(m);
      // CameraSurfaces retains the primitive until rebuild; dispose its geometry then.
      game.templeCaptureGeometry ??= [];
      game.templeCaptureGeometry.push(m.geometry);
    };
    const course = (
      width,
      height,
      depth,
      px,
      py,
      pz,
      rotation = 0,
      tint = 1,
    ) => {
      const count = Math.ceil(width / 1.55),
        length = width / count;
      for (let i = 0; i < count; i++) {
        const along = (i + 0.5) * length - width / 2;
        block(
          length - 0.025,
          height - 0.025,
          depth,
          px + along * Math.cos(rotation),
          py,
          pz - along * Math.sin(rotation),
          tint,
          rotation,
        );
      }
    };
    for (const pier of plan.piers) {
      const py = game.groundHeight(x + pier.x, z + pier.z) - base,
        w = pier.width;
      // The broad base sits inside its navigation footprint, and the capital stays
      // at the old bird-perch height on the two forward piers.
      const footprint = w / 2 + 0.13;
      game.obstacles.push({
        x: x + pier.x,
        z: z + pier.z,
        w: footprint,
        d: footprint,
        h: 9.1,
        temple: true,
      });
      cameraBox(w + 0.26, 9.1, w + 0.26, pier.x, py + 4.55, pier.z);
      for (const [width, height, y] of [
        [w + 0.25, 0.3, 0.1],
        [w + 0.1, 0.22, 0.35],
        [w - 0.1, 0.18, 0.55],
      ])
        block(width, height, width, pier.x, py + y, pier.z, 0.78);
      for (let row = 0; row < 12; row++) {
        const h = 0.57,
          yy = py + 0.7 + row * 0.58 + h / 2,
          taper = 1 - row * 0.008;
        const split = row % 2 === 0;
        if (split)
          for (const side of [-1, 1])
            block(
              (w * 0.82 * taper - 0.035) / 2,
              h,
              w * 0.82 * taper,
              pier.x + (side * w * 0.82 * taper) / 4,
              yy,
              pier.z,
              0.98,
            );
        else
          block(
            w * 0.82 * taper,
            h,
            w * 0.82 * taper,
            pier.x,
            yy,
            pier.z,
            0.98,
          );
      }
      for (const [width, height, y] of [
        [w * 0.87, 0.16, 7.72],
        [w * 0.95, 0.2, 7.9],
        [w * 1.02, 0.22, 8.12],
        [w * 1.1, 0.3, 8.39],
        [w * 1.13, 0.38, 8.77],
      ])
        block(width, height, width, pier.x, py + y, pier.z, 0.87);
      const panel = new THREE.Mesh(
        carvedPanelGeometry(w * 0.58, 3.4, room.index),
        detailMaterial,
      );
      panel.position.set(pier.x, py + 2.2, pier.z + w * 0.42 + 0.015);
      panel.receiveShadow = true;
      detail.add(panel);
      // A shallow lintel above each panel protects the carving and catches light.
      block(w * 0.67, 0.16, 0.22, pier.x, py + 5.75, pier.z + w * 0.44, 0.87);
    }
    for (const span of plan.spans) {
      const dx = span.b.x - span.a.x,
        dz = span.b.z - span.a.z,
        length = Math.hypot(dx, dz),
        rotation = -Math.atan2(dz, dx),
        cx = (span.a.x + span.b.x) / 2,
        cz = (span.a.z + span.b.z) / 2;
      const y =
        (game.groundHeight(x + span.a.x, z + span.a.z) +
          game.groundHeight(x + span.b.x, z + span.b.z)) /
          2 -
        base;
      const half = length / 2,
        opening = half - 1.22;
      for (let row = 0; row < 6; row++) {
        const inner = opening * Math.pow(1 - (row + 1) / 6, 0.77),
          outer = half + 0.2,
          width = outer - inner;
        if (!span.roof && row > 2) continue;
        for (const side of [-1, 1]) {
          const along = side * (inner + width / 2),
            px = cx + along * Math.cos(rotation),
            pz = cz - along * Math.sin(rotation);
          course(
            width,
            0.45,
            2.4,
            px,
            y + 6.1 + row * 0.45,
            pz,
            rotation,
            0.88,
          );
          cameraBox(width, 0.45, 2.4, px, y + 6.1 + row * 0.45, pz, rotation);
        }
      }
      if (span.roof) {
        for (const [height, depth, yy] of [
          [0.24, 2.8, 8.78],
          [0.46, 3.0, 9.12],
          [0.16, 3.25, 9.45],
          [0.35, 3.55, 9.71],
        ])
          course(length + 1.1, height, depth, cx, y + yy, cz, rotation, 0.92);
        cameraBox(length + 1.1, 1.2, 3.55, cx, y + 9.35, cz, rotation);
        // Small corbels break the roof line and frame the frieze's recessed slots.
        for (let i = 0; i < Math.floor(length / 0.75); i++) {
          const along = (i + 0.5) * 0.75 - length / 2,
            px = cx + along * Math.cos(rotation),
            pz = cz - along * Math.sin(rotation);
          for (const side of [-1, 1])
            block(
              0.35,
              0.28,
              0.26,
              px + side * Math.sin(rotation) * 1.58,
              y + 9.2,
              pz + side * Math.cos(rotation) * 1.58,
              0.72,
              rotation,
            );
        }
      }
    }
    // A corbelled entrance crown has a layered silhouette and a recessed rosette.
    const crownY = 9.95;
    for (let tier = 0; tier < (room.index === 8 ? 8 : 5); tier++) {
      const width = (room.index === 8 ? 17 : 12) - tier * 1.65,
        height = 0.62;
      course(
        width,
        height,
        4.5 - tier * 0.5,
        0,
        crownY + tier * 0.65,
        -18,
        0,
        0.91,
      );
      course(
        width + 0.35,
        0.13,
        4.8 - tier * 0.5,
        0,
        crownY + tier * 0.65 + 0.36,
        -18,
        0,
        0.74,
      );
    }
    const crown = new THREE.Mesh(
      carvedPanelGeometry(3, 2.8, room.index + 1),
      detailMaterial,
    );
    crown.position.set(0, 9.6, -15.73);
    crown.receiveShadow = true;
    detail.add(crown);
    // Broken blocks stay beside the piers, preserving central routes and stations.
    if (plan.broken)
      for (let i = 0; i < 8; i++) {
        const px = -17 + rng() * 2.5,
          pz = -16 + rng() * 2.5,
          py = game.groundHeight(x + px, z + pz) - base;
        const width = 0.8 + rng() * 0.5,
          height = 0.3 + rng() * 0.3,
          depth = 0.6 + rng() * 0.5,
          angle = rng() * 2;
        block(width, height, depth, px, py + height / 2, pz, 0.8, angle);
        const cos = Math.abs(Math.cos(angle)),
          sin = Math.abs(Math.sin(angle));
        game.obstacles.push({
          x: x + px,
          z: z + pz,
          w: (width * cos + depth * sin) / 2,
          d: (width * sin + depth * cos) / 2,
          h: height,
          climbable: true,
          temple: true,
        });
      }
    mergeArchitecture(root);
    mergeArchitecture(detail);
    game.templePatches.push({
      root,
      detail,
      center: new THREE.Vector3(x, base + 5, z),
      blocks,
      triangles,
      plan,
      detailBounds: new THREE.Box3()
        .setFromObject(detail)
        .getBoundingSphere(new THREE.Sphere()),
    });
  }
  return true;
}

export function updateTempleArchitecture(game) {
  for (const patch of game.templePatches || []) {
    // Structure stays visible for skyline and shadows; fine carvings retire only
    // once they occupy a few pixels, independently of navigation and camera bounds.
    const distance =
      patch.detailBounds.center.distanceTo(game.player.position) -
      patch.detailBounds.radius;
    const range = game.store.data.settings.quality === "low" ? 42 : 70;
    patch.detail.visible = distance < range + (patch.detail.visible ? 6 : 0);
  }
}
