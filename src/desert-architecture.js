import * as THREE from "three";
import { random } from "./campaign.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

// The court's two crossing axes and the sanctuary approach remain open. Structure
// occupies the perimeter; each room gets an authored gallery and ruin pattern.
export function desertPlan(room) {
  // Leave the northwest cache of court three clear without moving the arcade
  // toward its camp. The gallery shares this shifted corner support.
  const rearZ = -18;
  const wings = [
    [-1, 1],
    [-1],
    [1],
    [-1, 1],
    [1],
    [-1],
    [-1, 1],
    [1],
    [-1],
    [-1, 1],
  ][room.index % 10];
  const piers = [-19, -11, -5, 5, 11, 19].map((x) => ({
    x: room.index === 3 && x === -19 ? -17.5 : x,
    z: rearZ,
    width: 2.6,
  }));
  const spans = piers.slice(0, -1).map((a, i) => ({
    a,
    b: piers[i + 1],
    broken: room.index % 3 === 2 && i === 0,
  }));
  piers.push(
    { x: -19, z: 18, width: 3.1, perch: true },
    { x: 19, z: 18, width: 3.1, perch: true },
  );
  for (const side of wings) {
    const points = [rearZ, -6, 6, 18].map((z) => ({
      x: side * 19,
      z,
      width: 2.6,
    }));
    points[0] = piers[side < 0 ? 0 : 5];
    piers.push(...points.slice(1, 3));
    for (let i = 0; i < 3; i++)
      spans.push({
        a: points[i],
        b: points[i + 1],
        broken: room.index % 4 === 1 && i === 2,
      });
  }
  return {
    piers,
    spans,
    wings,
    spring: [6.4, 6.8, 6.1, 7.2, 6.4, 5.9, 6.8, 6.1, 7.2, 7.5][room.index % 10],
  };
}

export function pointedArchHeight(halfWidth, x) {
  const u = Math.min(1, Math.abs(x) / halfWidth);
  return halfWidth * Math.sqrt(Math.max(0, 2.56 - (0.6 + u) ** 2));
}

// A complete voussoir, including beveled front/back edges. Its UVs stay in metres
// so a small arch and a monumental portal share the same sandstone grain scale.
export function archStoneGeometry(halfWidth, thickness, depth, side, from, to) {
  const edge = (radius, t) =>
    new THREE.Vector2(
      side * radius * (1 - t),
      pointedArchHeight(radius, radius * (1 - t)),
    );
  const points = [
    edge(halfWidth, from),
    edge(halfWidth + thickness, from),
    edge(halfWidth + thickness, to),
    edge(halfWidth, to),
  ];
  const shape = new THREE.Shape(points);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 0.06,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.03,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2 + 0.03);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return g;
}

export function solarPanelGeometry(width, height, variant = 0) {
  const p = [],
    uv = [],
    colors = [],
    indices = [],
    nx = 40,
    ny = 40;
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const u = x / nx,
        v = y / ny,
        cx = (u - 0.5) * 2,
        cy = (v - 0.5) * 2;
      const r = Math.hypot(cx, cy),
        a = Math.atan2(cy, cx),
        border = Math.min(u, 1 - u, v, 1 - v);
      const ring = Math.exp(-Math.pow((r - 0.68) / 0.045, 2)),
        inner = Math.exp(-Math.pow((r - 0.25) / 0.055, 2));
      const rays =
        Math.max(0, Math.cos(a * (12 + (variant % 3) * 2))) ** 10 *
        Math.exp(-Math.pow((r - 0.46) / 0.18, 4));
      const rim = Math.exp(-Math.pow((border - 0.035) / 0.014, 2));
      const relief = Math.max(ring, inner, rays * 0.9, rim);
      p.push((cx * width) / 2, v * height, -0.085 + relief * 0.14);
      uv.push((u * width) / 2, (v * height) / 2);
      const shade = 0.7 + relief * 0.29;
      colors.push(shade, shade, shade);
      if (x < nx && y < ny) {
        const i = y * (nx + 1) + x;
        indices.push(i, i + 1, i + nx + 1, i + 1, i + nx + 2, i + nx + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function weatherDesertStone(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vDesertStone, vDesertNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvDesertStone = (modelMatrix * vec4(position,1.0)).xyz; vDesertNormal = normalize(mat3(modelMatrix)*normal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vDesertStone, vDesertNormal;
      float desertGrain(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 39.425)))*43758.5453); }
    `,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float band = sin(vDesertStone.y*2.1 + sin(vDesertStone.x*.23)*1.8 + sin(vDesertStone.z*.17));
      float stain = .5 + .5*sin(vDesertStone.x*.37 + sin(vDesertStone.z*.31)*2.0);
      diffuseColor.rgb *= .89 + band*.045 + stain*.12;
      float dust = max(0.0, vDesertNormal.y)*(.1 + stain*.14);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.64,.48,.28), dust);
    `,
      );
  };
  material.customProgramCacheKey = () => "vesper-desert-stone-1";
}

export function buildDesertArchitecture(game) {
  game.desertPatches = [];
  game.desertBirdPerches = {};
  if (game.level.biome !== "desert") return false;
  const material = pbrMaterial("sandstone", 0xffe9c5);
  material.name = "Weathered sandstone masonry";
  material.vertexColors = true;
  material.normalScale.set(0.45, 0.45);
  weatherDesertStone(material);
  const detailMaterial = material.clone();
  detailMaterial.name = "Carved solar sandstone";
  detailMaterial.normalScale.set(0.18, 0.18);
  weatherDesertStone(detailMaterial);
  const bronze = new THREE.MeshStandardMaterial({
    name: "Aged solar bronze",
    color: 0xbc8e4b,
    metalness: 0.78,
    roughness: 0.33,
  });
  const rng = random(game.level.seed + 5207);
  let serial = 0;
  for (const room of game.map.rooms) {
    const plan = desertPlan(room),
      x = room.x * 7,
      z = room.z * 7,
      base = game.groundHeight(x, z);
    const root = new THREE.Group(),
      detail = new THREE.Group();
    root.name = `Sandstone court ${room.index}`;
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    game.world.add(root, detail);
    const ground = (px, pz) => game.groundHeight(x + px, z + pz) - base;
    let triangles = 0,
      blocks = 0;
    const add = (
      geometry,
      px,
      py,
      pz,
      angle = 0,
      tint = 1,
      capture = false,
    ) => {
      const count = geometry.attributes.position.count,
        colors = new Float32Array(count * 3),
        shade = (0.83 + rng() * 0.2) * tint;
      for (let i = 0; i < count; i++) {
        colors[i * 3] = shade;
        colors[i * 3 + 1] = shade * 0.98;
        colors[i * 3 + 2] = shade * 0.93;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const m = new THREE.Mesh(geometry, material);
      m.position.set(px, py, pz);
      m.rotation.y = angle;
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      blocks++;
      triangles += (geometry.index?.count || count) / 3;
      if (capture) game.cameraSurfaces?.capture(m);
      return m;
    };
    const block = (w, h, d, px, py, pz, angle = 0, tint = 1, capture = false) =>
      add(
        stoneBlockGeometry(w, h, d, ++serial + game.level.seed),
        px,
        py,
        pz,
        angle,
        tint,
        capture,
      );
    const cameraBox = (w, h, d, px, py, pz, angle = 0) => {
      if (!game.cameraSurfaces) return;
      const geometry = new THREE.BoxGeometry(w, h, d),
        mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = angle;
      root.add(mesh);
      game.cameraSurfaces.capture(mesh);
      root.remove(mesh);
      // capture() has already cloned the local bounds; this proxy is never drawn.
      geometry.dispose();
    };
    const panel = (w, h, px, py, pz, angle = 0) => {
      const m = new THREE.Mesh(
        solarPanelGeometry(w, h, room.index),
        detailMaterial,
      );
      m.position.set(px, py, pz);
      m.rotation.y = angle;
      m.receiveShadow = true;
      detail.add(m);
    };
    const spanBlock = (span, along, py, w, h, d, tint = 1, capture = false) => {
      const angle = -Math.atan2(span.b.z - span.a.z, span.b.x - span.a.x);
      return block(
        w,
        h,
        d,
        (span.a.x + span.b.x) / 2 + along * Math.cos(angle),
        py,
        (span.a.z + span.b.z) / 2 - along * Math.sin(angle),
        angle,
        tint,
        capture,
      );
    };
    for (const pier of plan.piers) {
      const py = ground(pier.x, pier.z),
        width = pier.width,
        top = pier.perch ? 9.1 : plan.spring + 0.15;
      game.obstacles.push({
        x: x + pier.x,
        z: z + pier.z,
        w: (width + 0.25) / 2,
        d: (width + 0.25) / 2,
        h: top,
        desert: true,
      });
      cameraBox(
        width + 0.25,
        top + 0.06,
        width + 0.25,
        pier.x,
        py + (top - 0.06) / 2,
        pier.z,
      );
      if (pier.perch && pier.x > 0)
        game.desertBirdPerches[room.index] = {
          x: x + pier.x,
          y: base + py + top,
          z: z + pier.z,
        };
      block(
        width + 0.25,
        0.4,
        width + 0.25,
        pier.x,
        py + 0.14,
        pier.z,
        0,
        0.82,
      );
      const count = Math.ceil((top - 1.1) / 0.65),
        h = (top - 1.1) / count;
      for (let row = 0; row < count; row++) {
        const w = width * (1 - row * 0.009);
        if (row % 2)
          for (const side of [-1, 1])
            block(
              w / 2 - 0.025,
              h - 0.018,
              w,
              pier.x + (side * w) / 4,
              py + 0.5 + (row + 0.5) * h,
              pier.z,
              0,
              1,
            );
        else
          block(
            w,
            h - 0.018,
            w,
            pier.x,
            py + 0.5 + (row + 0.5) * h,
            pier.z,
            0,
            1,
          );
      }
      block(
        width * 0.98,
        0.23,
        width * 0.98,
        pier.x,
        py + top - 0.49,
        pier.z,
        0,
        0.86,
      );
      block(
        width + 0.18,
        0.42,
        width + 0.18,
        pier.x,
        py + top - 0.21,
        pier.z,
        0,
        0.92,
      );
      panel(width * 0.58, 2.5, pier.x, py + 2, pier.z + width * 0.5 + 0.025);
    }
    for (const span of plan.spans) {
      const length = Math.hypot(span.b.x - span.a.x, span.b.z - span.a.z),
        half = length / 2 - 1.25,
        thickness = 0.62;
      const angle = -Math.atan2(span.b.z - span.a.z, span.b.x - span.a.x),
        cx = (span.a.x + span.b.x) / 2,
        cz = (span.a.z + span.b.z) / 2;
      const py =
        (ground(span.a.x, span.a.z) + ground(span.b.x, span.b.z)) / 2 +
        plan.spring;
      const parts = 12;
      for (const side of [-1, 1])
        for (let i = 0; i < parts; i++) {
          if (span.broken && i > (side < 0 ? 6 : 3)) continue;
          add(
            archStoneGeometry(
              half,
              thickness,
              2.35,
              side,
              i / parts + 0.002,
              (i + 1) / parts - 0.002,
            ),
            cx,
            py,
            cz,
            angle,
            i % 3 === 0 ? 0.86 : 1,
            true,
          );
        }
      if (span.broken) continue;
      const top = py + pointedArchHeight(half + thickness, 0) + 0.65;
      // Fill only above the arch curve. Adjacent masonry courses share one
      // camera bound per column; the voussoirs retain their curved outline.
      const columns = Math.ceil(length / 1.4),
        cw = length / columns;
      for (let col = 0; col < columns; col++) {
        const along = (col + 0.5) * cw - length / 2;
        const curveX = Math.max(0, Math.abs(along) - cw / 2);
        const bottom =
          Math.abs(along) - cw / 2 < half + thickness
            ? py + pointedArchHeight(half + thickness, curveX)
            : py;
        const rows = Math.max(0, Math.floor((top - bottom) / 0.57));
        if (rows)
          cameraBox(
            cw - 0.018,
            rows * 0.57,
            2.25,
            cx + along * Math.cos(angle),
            top - (rows * 0.57) / 2,
            cz - along * Math.sin(angle),
            angle,
          );
        for (let row = 0; row < rows; row++)
          spanBlock(
            span,
            along,
            top - (row + 0.5) * 0.57,
            cw - 0.018,
            0.55,
            2.25,
            0.95,
          );
      }
      const pieces = Math.ceil(length / 1.4);
      cameraBox(length, 0.58, 3.15, cx, top + 0.245, cz, angle);
      for (let i = 0; i < pieces; i++) {
        const along = ((i + 0.5) * length) / pieces - length / 2;
        spanBlock(
          span,
          along,
          top + 0.12,
          length / pieces - 0.018,
          0.3,
          2.9,
          0.86,
        );
        spanBlock(
          span,
          along,
          top + 0.4,
          length / pieces - 0.018,
          0.25,
          3.15,
          1,
        );
        if (i % 2 === room.index % 2)
          spanBlock(span, along, top + 0.95, 0.8, 0.88, 2.55, 0.96, true);
      }
      if (span.b.x === 19 && span.b.z === 18) {
        block(0.7, 0.25, 0.7, 19, top + 0.65, 18);
        game.desertBirdPerches[room.index] = {
          x: x + 19,
          y: base + top + 0.775,
          z: z + 18,
        };
      }
      if (span.a.x === -5 && span.b.x === 5) {
        block(4.4, 2.7, 1.35, cx, top + 1.9, cz, 0, 1, true);
        block(4.8, 0.3, 1.85, cx, top + 3.35, cz, 0, 0.84, true);
        panel(3.65, 2.25, cx, top + 0.75, cz + 0.69);
        const sundial = new THREE.Mesh(
          new THREE.TorusGeometry(0.79, 0.08, 6, 36),
          bronze,
        );
        sundial.position.set(cx, top + 1.95, cz + 0.83);
        detail.add(sundial);
      }
    }
    mergeArchitecture(root);
    mergeArchitecture(detail);
    const detailBounds = new THREE.Box3()
      .setFromObject(detail)
      .getBoundingSphere(new THREE.Sphere());
    game.desertPatches.push({
      root,
      detail,
      plan,
      blocks,
      triangles,
      detailBounds,
    });
  }
  return true;
}

export function updateDesertArchitecture(game) {
  const range = game.store.data.settings.quality === "low" ? 45 : 80;
  for (const patch of game.desertPatches || []) {
    const distance =
      patch.detailBounds.center.distanceTo(game.player.position) -
      patch.detailBounds.radius;
    patch.detail.visible = distance < range + (patch.detail.visible ? 6 : 0);
  }
}
