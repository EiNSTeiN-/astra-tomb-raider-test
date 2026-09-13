import * as THREE from "three";
import {
  stationYardPlan,
  yardRouteClear,
  yardTraversalClear,
} from "./station-yard-plan.js";
import { terrainInlayGeometry } from "./terrain-inlay.js";
import { footprintMinimum } from "./masonry-foundations.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { STATION_STYLES } from "./field-station-art.js";
import { stationSolid } from "./field-station-solids.js";
import { mergeArchitecture, pbrMaterial } from "./visuals.js";

function pavingMaterial(biome) {
  const name =
    {
      jungle: "moss",
      desert: "sandstone-wall",
      water: "palace-mosaic",
      volcano: "forge-paving",
    }[biome] || "stone";
  const material = pbrMaterial(name);
  material.name = "Worn court paving";
  material.vertexColors = true;
  material.transparent = true;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  material.normalScale.setScalar(0.55);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec3 inlayUv; varying vec3 vInlayUv; varying vec2 vPavingUv;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvInlayUv = inlayUv; vPavingUv = uv;",
    );
    shader.fragmentShader =
      /* glsl */ `
      varying vec3 vInlayUv;
      varying vec2 vPavingUv;
      float inlayHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float inlayNoise(vec2 p) {
        vec2 c = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(inlayHash(c), inlayHash(c + vec2(1, 0)), f.x),
          mix(inlayHash(c + vec2(0, 1)), inlayHash(c + vec2(1, 1)), f.x), f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      /* glsl */ `
      #include <map_fragment>
      vec2 edgePair = min(vInlayUv.xy, 1.0 - vInlayUv.xy);
      float edge = min(min(edgePair.x, edgePair.y), vInlayUv.z);
      float wear = inlayNoise(vPavingUv * 43.0) * .065
        + inlayNoise(vPavingUv * 117.0) * .025;
      float width = max(fwidth(edge), .015);
      diffuseColor.a *= smoothstep(wear, wear + width + .045, edge) * .84;
      diffuseColor.rgb *= mix(.84, 1.0, smoothstep(.04, .15, edge - wear));
    `,
    );
  };
  material.customProgramCacheKey = () => "worn-court-paving-v1";
  return material;
}

function waterReserved(game, box) {
  return game.terrainProfile.waters.some(
    (w) =>
      Math.abs(box.x - w.x) < box.w / 2 + w.width / 2 + 0.5 &&
      Math.abs(box.z - w.z) < box.d / 2 + w.length / 2 + 0.5,
  );
}

export function yardPieceAllowed(game, box) {
  if (
    !yardRouteClear(game.map, box) ||
    !yardTraversalClear(game.traversalCourses, box) ||
    waterReserved(game, box)
  )
    return false;
  for (const dx of [-box.w / 2, 0, box.w / 2])
    for (const dz of [-box.d / 2, 0, box.d / 2]) {
      if (!game.canMove(box.x + dx, box.z + dz, 0)) return false;
      if (
        Math.abs(
          game.groundHeight(box.x + dx, box.z + dz) -
            game.groundHeight(box.x, box.z),
        ) > 0.3
      )
        return false;
    }
  return !game.obstacles.some(
    (o) =>
      Math.abs(box.x - o.x) < box.w / 2 + o.w + 0.2 &&
      Math.abs(box.z - o.z) < box.d / 2 + o.d + 0.2 &&
      (o.bounds?.max.y ?? game.groundHeight(o.x, o.z) + o.h) >
        game.groundHeight(box.x, box.z) + 0.05,
  );
}

export function buildStationYards(game) {
  game.stationYards = [];
  const stone = game.stoneMat.clone(),
    dark = game.darkMat.clone(),
    metal = patinatedBronze();
  stone.name = "Field court dressed stone";
  stone.normalScale.setScalar(0.38);
  dark.name = "Field court recessed masonry";
  dark.color.copy(stone.color).multiplyScalar(0.54);
  metal.color.setHex(STATION_STYLES[game.level.biome].metal);
  metal.roughness = 0.6;
  for (const m of [stone, dark, metal]) m.vertexColors = true;
  const paving = pavingMaterial(game.level.biome),
    inlay = paving.clone();
  inlay.name = "Worn court border";
  inlay.onBeforeCompile = paving.onBeforeCompile;
  inlay.customProgramCacheKey = paving.customProgramCacheKey;

  for (const f of game.items.filter((f) => f.stationSolids && !f.yOffset)) {
    const plan = stationYardPlan(game.level, f),
      root = new THREE.Group();
    root.name = plan.style.name;
    root.position.copy(f.group.position);
    game.world.add(root);
    const yard = { id: f.id, root, plan, pieces: [], paving: [], modules: 0 };
    f.yard = yard;
    game.stationYards.push(yard);
    paving.color.setHex(plan.style.paving);
    inlay.color.copy(paving.color).multiplyScalar(0.88);
    let seed = game.level.seed + f.stage * 237 + f.step * 57;
    const add = (geometry, m, x = 0, y = 0, z = 0) => {
      const colors =
        geometry.attributes.color?.array ||
        new Float32Array(geometry.attributes.position.count * 3).fill(1);
      const tone =
        m === stone ? 0.85 + (Math.sin(++seed * 31.7) + 1) * 0.075 : 1;
      for (let i = 0; i < colors.length; i++) colors[i] *= tone;
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geometry, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      if (m !== paving && m !== inlay)
        game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
      return mesh;
    };
    const block = (w, h, d, m, x, y, z) =>
      add(stoneBlockGeometry(w, h, d, ++seed, 0.035), m, x, y, z);
    const solid = (w, h, d, x, y, z) => {
      const o = stationSolid(game, f, root, [w, h, d], [x, y, z]);
      o.stationYard = f.id;
      return o;
    };
    const pieceBlock = (w, h, d, m, x, y, z) => {
      block(w, h, d, m, x, y, z);
      solid(w, h, d, x, y, z);
    };
    const bar = (a, b, r = 0.024, m = metal) => {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b),
        delta = to.clone().sub(from);
      const mesh = add(
        new THREE.CylinderGeometry(r, r, delta.length(), 6),
        m,
        ...from.add(to).multiplyScalar(0.5).toArray(),
      );
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
    };
    const dial = (x, y, z, r) => {
      add(new THREE.TorusGeometry(r, 0.022, 6, 24), metal, x, y, z);
      const n = plan.style.crown === "solar" ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        bar(
          [x + Math.sin(a) * r * 0.67, y + Math.cos(a) * r * 0.67, z],
          [x + Math.sin(a) * r * 0.93, y + Math.cos(a) * r * 0.93, z],
          0.014,
        );
      }
    };
    const masonry = (p, bottom, top) => {
      const height = top - bottom,
        n = Math.max(1, Math.ceil(height / 0.42));
      add(
        new THREE.BoxGeometry(p.w * 0.91, height, p.d * 0.91),
        dark,
        p.x,
        (bottom + top) / 2,
        p.z,
      );
      for (let i = 0; i < n; i++)
        block(
          p.w,
          height / n - 0.009,
          p.d,
          stone,
          p.x,
          bottom + ((i + 0.5) * height) / n,
          p.z,
        );
      solid(p.w, height, p.d, p.x, (bottom + top) / 2, p.z);
    };
    for (const module of plan.modules) {
      if (yard.modules >= plan.target) break;
      // Validate against the existing world before constructing this module;
      // its masonry wings deliberately meet and overlap their corner pier.
      const accepted = module.pieces.filter((p) =>
        yardPieceAllowed(game, {
          ...p,
          x: p.x + root.position.x,
          z: p.z + root.position.z,
        }),
      );
      if (!accepted.some((p) => p.kind === "pier" || p.kind === "wall"))
        continue;
      yard.modules++;
      for (const p of accepted) {
        const wx = p.x + root.position.x,
          wz = p.z + root.position.z;
        const ground = game.groundHeight(wx, wz) - root.position.y;
        const bottom =
          footprintMinimum(
            game.groundHeight.bind(game),
            wx,
            wz,
            p.w,
            p.d,
            game.terrainProfile.step,
          ) -
          root.position.y -
          0.14;
        yard.pieces.push({ ...p, bottom, ground });
        if (p.kind === "wall" || p.kind === "pier") {
          masonry(p, bottom, ground + p.h);
          if (p.kind === "wall") {
            block(
              p.w,
              0.09,
              p.d,
              plan.style.crown === "iron" ? metal : dark,
              p.x,
              ground + p.h - 0.045,
              p.z,
            );
            // Interrupted cap ties and repaired stone joints.
            const alongX = p.w > p.d,
              count = alongX ? 5 : 4;
            for (let i = 0; i < count; i++) {
              const t = (i / (count - 1) - 0.5) * 0.83;
              block(
                alongX ? 0.045 : p.w,
                0.04,
                alongX ? p.d : 0.045,
                metal,
                p.x + (alongX ? t * p.w : 0),
                ground + p.h - 0.04,
                p.z + (alongX ? 0 : t * p.d),
              );
            }
          } else {
            block(p.w, 0.14, p.d, dark, p.x, ground + p.h - 0.07, p.z);
            const reliefH = Math.min(1.3, p.h - 0.42),
              cy = ground + 0.25 + reliefH / 2;
            for (const face of [-1, 1]) {
              block(
                p.w * 0.63,
                reliefH,
                0.035,
                dark,
                p.x,
                cy,
                p.z + face * (p.d / 2 - 0.015),
              );
              if (plan.style.crown === "lotus") {
                const panel = add(
                  carvedPanelGeometry(
                    p.w * 0.54,
                    reliefH * 0.94,
                    f.stage,
                    [14, 26],
                  ).scale(1, 1, 0.22),
                  stone,
                  p.x,
                  cy - reliefH * 0.47,
                  p.z + face * (p.d / 2 + 0.0212),
                );
                if (face < 0) panel.rotation.y = Math.PI;
              } else if (["solar", "orbital"].includes(plan.style.crown))
                dial(p.x, cy, p.z + face * (p.d / 2 - 0.005), p.w * 0.24);
              else if (plan.style.crown === "shell")
                for (let i = 0; i < 7; i++) {
                  const a = -1.05 + (i * 2.1) / 6;
                  bar(
                    [p.x, cy - reliefH * 0.35, p.z + (face * p.d) / 2],
                    [
                      p.x + Math.sin(a) * p.w * 0.26,
                      cy + Math.cos(a) * reliefH * 0.34,
                      p.z + (face * p.d) / 2,
                    ],
                    0.017,
                  );
                }
              else if (plan.style.crown === "iron")
                for (let i = 0; i < 3; i++) {
                  block(
                    p.w * 0.55,
                    0.05,
                    0.04,
                    metal,
                    p.x,
                    cy - reliefH * 0.32 + i * reliefH * 0.32,
                    p.z + face * (p.d / 2 - 0.02),
                  );
                }
              else {
                const points =
                  plan.style.crown === "prism"
                    ? [
                        [0, -0.43],
                        [-0.22, 0],
                        [0, 0.43],
                        [0.22, 0],
                        [0, -0.43],
                      ]
                    : plan.style.crown === "wing"
                      ? [
                          [-0.26, 0.2],
                          [0, -0.22],
                          [0.26, 0.2],
                          [0, 0],
                          [-0.26, 0.2],
                        ]
                      : [
                          [-0.27, -0.22],
                          [0, 0.3],
                          [0.27, -0.22],
                          [-0.27, -0.22],
                        ];
                for (let i = 1; i < points.length; i++)
                  bar(
                    [
                      p.x + points[i - 1][0],
                      cy + points[i - 1][1],
                      p.z + (face * p.d) / 2,
                    ],
                    [
                      p.x + points[i][0],
                      cy + points[i][1],
                      p.z + (face * p.d) / 2,
                    ],
                    0.023,
                  );
              }
            }
          }
        } else if (p.kind === "bench") {
          for (const side of [-1, 1])
            pieceBlock(
              0.48,
              ground + 0.5 - bottom,
              0.83,
              stone,
              p.x + side * 0.79,
              (bottom + ground + 0.5) / 2,
              p.z,
            );
          pieceBlock(p.w, 0.16, p.d, stone, p.x, ground + p.h - 0.08, p.z);
          block(
            p.w * 0.9,
            0.036,
            p.d * 0.8,
            dark,
            p.x,
            ground + p.h - 0.018,
            p.z,
          );
        } else if (p.kind === "channel" || p.kind === "bin") {
          pieceBlock(
            p.w,
            ground + 0.12 - bottom,
            p.d,
            dark,
            p.x,
            (bottom + ground + 0.12) / 2,
            p.z,
          );
          for (const side of [-1, 1]) {
            pieceBlock(
              p.w,
              0.5,
              0.18,
              stone,
              p.x,
              ground + 0.37,
              p.z + side * (p.d / 2 - 0.09),
            );
            pieceBlock(
              0.18,
              0.5,
              p.d,
              stone,
              p.x + side * (p.w / 2 - 0.09),
              ground + 0.37,
              p.z,
            );
          }
          if (p.kind === "bin")
            for (let i = 0; i < 7; i++) {
              const lump = add(
                new THREE.DodecahedronGeometry(0.19, 0),
                dark,
                p.x + ((i % 4) - 1.5) * 0.41,
                ground + 0.26,
                p.z + (i < 4 ? -0.18 : 0.2),
              );
              lump.scale.y = 0.65;
            }
        } else {
          masonry({ ...p, h: 0.4 }, bottom, ground + 0.4);
          const first = root.children.length;
          block(p.w * 0.62, 0.72, 0.25, stone, p.x, ground + 0.72, p.z);
          dial(p.x, ground + 0.75, p.z + 0.125, 0.23);
          // The dial and its spokes share the tablet's tilt and front plane.
          const pivot = new THREE.Vector3(p.x, ground + 0.72, p.z),
            tilt = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(1, 0, 0),
              -0.14,
            );
          for (const mesh of root.children.slice(first)) {
            mesh.position.sub(pivot).applyQuaternion(tilt).add(pivot);
            mesh.quaternion.premultiply(tilt);
          }
          solid(p.w * 0.62, 0.75, 0.39, p.x, ground + 0.72, p.z);
        }
      }
    }
    for (const tile of plan.paving) {
      const box = {
        ...tile,
        x: root.position.x + tile.x,
        z: root.position.z + tile.z,
      };
      if (waterReserved(game, box)) continue;
      if (
        ![-1, 0, 1].every((s) =>
          [-1, 0, 1].every((t) =>
            game.canMove(box.x + (s * box.w) / 2, box.z + (t * box.d) / 2, 0),
          ),
        )
      )
        continue;
      const geometry = terrainInlayGeometry(
        game.terrainProfile,
        box,
        root.position,
        tile.chip,
      );
      const mesh = add(geometry, tile.accent ? inlay : paving);
      mesh.castShadow = false;
      yard.paving.push(box);
    }
    mergeArchitecture(root);
    // The common batcher defaults to casting shadows. Surface inlays must not
    // shadow their own underlying floor after their individual meshes merge.
    for (const mesh of root.children)
      if (mesh.material === paving || mesh.material === inlay)
        mesh.castShadow = false;
  }
}
