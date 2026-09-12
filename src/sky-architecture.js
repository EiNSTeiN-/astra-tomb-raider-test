import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { fittedWallGeometry } from "./sky-masonry.js";
import { stoneBlockGeometry } from "./temple-architecture.js";

export function skyCitadelPlan(room) {
  const i = room.index % 10;
  return {
    portal: [7.4, 8.2, 7.8, 8.6, 7.6, 8.4, 8, 7.2, 8.8, 10.2][i],
    towerSide: i % 2 ? -1 : 1,
    tower: [2.2, 3, 1.8, 3.4, 0, 2.8, 3.7, 1.6, 3.2, 4.8][i],
    wings: [
      [-1, 1],
      [1],
      [-1],
      [-1, 1],
      [-1],
      [1],
      [-1, 1],
      [1],
      [-1],
      [-1, 1],
    ][i],
    breakSide: i % 3 === 1 ? -1 : 1,
    wallHeight: [5.5, 6.1, 5.8, 6.3, 5.2, 6, 6.4, 5.6, 6.2, 7.4][i],
  };
}

export function weatherSkyStone(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vCitadelPosition;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vCitadelPosition=(modelMatrix*vec4(position,1.)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vCitadelPosition;
      float citadelHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float citadelNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(citadelHash(i),citadelHash(i+vec3(1,0,0)),f.x),mix(citadelHash(i+vec3(0,1,0)),citadelHash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(citadelHash(i+vec3(0,0,1)),citadelHash(i+vec3(1,0,1)),f.x),mix(citadelHash(i+vec3(0,1,1)),citadelHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(luma)*vec3(1.04,1.02,.96),.88);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.258,.233),.28);
      float broad=citadelNoise(vCitadelPosition*.29);
      float stain=citadelNoise(vCitadelPosition*vec3(1.2,.13,1.2));
      float lichen=smoothstep(.69,.83,citadelNoise(vCitadelPosition*2.1)+broad*.13);
      diffuseColor.rgb*=mix(.78,1.16,broad)*(1.-smoothstep(.68,.9,stain)*.18);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.25,.15),lichen*.42);`,
      );
  };
  material.customProgramCacheKey = () => "vesper-citadel-granite-1";
}

export function buildSkyArchitecture(game) {
  game.skyCitadels = [];
  game.skyBirdPerches = {};
  game.skyMasonry = null;
  if (game.level.biome !== "sky") return false;
  const stone = pbrMaterial("rock", 0xc3c9c4);
  game.skyMasonry = stone;
  stone.name = "Cloud-city fitted granite";
  stone.vertexColors = true;
  stone.normalScale.set(0.32, 0.32);
  weatherSkyStone(stone);
  const trim = pbrMaterial("temple", 0xacaea1);
  trim.name = "Cloud-city dressed lintels";
  trim.normalScale.set(0.22, 0.22);
  weatherSkyStone(trim);
  let serial = game.level.seed + 4200;
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7;
    const base = game.groundHeight(x, z),
      plan = skyCitadelPlan(room);
    const root = new THREE.Group();
    root.position.set(x, base, z);
    root.name = `Cloud citadel ${room.index}`;
    game.world.add(root);
    const patch = {
      root,
      plan,
      stones: 0,
      triangles: 0,
      supports: [],
      niches: [],
    };
    const floor = (px, pz) => game.groundHeight(x + px, z + pz) - base;
    const add = (g, mat, px, py, pz, angle = 0, capture = true) => {
      const m = new THREE.Mesh(g, mat);
      m.position.set(px, py, pz);
      m.rotation.y = angle;
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      patch.stones += g.userData.stones || 1;
      patch.triangles += (g.index?.count || g.attributes.position.count) / 3;
      if (capture) game.cameraSurfaces?.capture(m);
      return m;
    };
    const panel = (polygon, depth, px, py, pz, angle = 0) =>
      add(
        fittedWallGeometry(polygon, depth, ++serial),
        stone,
        px,
        py,
        pz,
        angle,
      );
    const rect = (w, h, d, px, py, pz, angle = 0) =>
      panel(
        [
          [-w / 2, 0],
          [w / 2, 0],
          [w / 2, h],
          [-w / 2, h],
        ],
        d,
        px,
        py,
        pz,
        angle,
      );
    const cap = (w, h, d, px, py, pz, angle = 0) =>
      add(stoneBlockGeometry(w, h, d, ++serial), trim, px, py, pz, angle);
    const obstacle = (w, d, top, px, pz, angle = 0) => {
      const c = Math.abs(Math.cos(angle)),
        s = Math.abs(Math.sin(angle));
      const o = {
        x: x + px,
        z: z + pz,
        w: (w * c + d * s) / 2 + 0.15,
        d: (w * s + d * c) / 2 + 0.15,
        h: top - floor(px, pz),
        skyArchitecture: true,
      };
      game.obstacles.push(o);
      patch.supports.push(o);
    };
    const wall = (width, height, px, pz, angle = 0, broken = false) => {
      const y = floor(px, pz) - 0.28,
        d = 1.55;
      const bottom = 1.4,
        top = 3.4,
        count = Math.max(1, Math.round(width / 3.5));
      const step = width / count;
      rect(width, bottom, d, px, y, pz, angle);
      for (let i = 0; i < count; i++) {
        const cx = (i + 0.5) * step - width / 2;
        const local = (xx, zz = 0) => [
          px + xx * Math.cos(angle) + zz * Math.sin(angle),
          pz - xx * Math.sin(angle) + zz * Math.cos(angle),
        ];
        const at = local(cx);
        // Tapered openings have real reveals and a recessed stone back.
        const lo = 0.69,
          hi = 0.51;
        panel(
          [
            [-step / 2, bottom],
            [-lo, bottom],
            [-hi, top],
            [-step / 2, top],
          ],
          d,
          ...[at[0], y, at[1]],
          angle,
        );
        panel(
          [
            [lo, bottom],
            [step / 2, bottom],
            [step / 2, top],
            [hi, top],
          ],
          d,
          at[0],
          y,
          at[1],
          angle,
        );
        const back = local(cx, -d / 2 + 0.17);
        panel(
          [
            [-lo, bottom],
            [lo, bottom],
            [hi, top],
            [-hi, top],
          ],
          0.28,
          back[0],
          y,
          back[1],
          angle,
        );
        const head = local(cx);
        cap(1.65, 0.3, d + 0.16, head[0], y + top + 0.13, head[1], angle);
        const sill = local(cx, 0.13);
        cap(1.6, 0.18, d + 0.2, sill[0], y + bottom + 0.06, sill[1], angle);
        patch.niches.push({
          x: x + at[0],
          y: base + y + (bottom + top) / 2,
          z: z + at[1],
          angle,
          depth: d,
        });
      }
      // The broken corner is removed through the full wall thickness.
      const drop = broken ? Math.min(1.35, height - top - 0.55) : 0;
      panel(
        [
          [-width / 2, top],
          [width / 2, top],
          [width / 2, height - drop],
          [-width / 2, height],
        ],
        d,
        px,
        y,
        pz,
        angle,
      );
      obstacle(width, d, y + height, px, pz, angle);
      if (!broken) {
        const n = Math.ceil(width / 2);
        for (let i = 0; i < n; i++) {
          const xx = ((i + 0.5) * width) / n - width / 2;
          cap(
            width / n - 0.025,
            0.28,
            d + 0.22,
            px + xx * Math.cos(angle),
            y + height + 0.12,
            pz - xx * Math.sin(angle),
            angle,
          );
        }
      }
      return {
        baseY: y,
        topAt: (along) => y + height - (along / width + 0.5) * drop,
      };
    };
    // Two solid gallery walls flank a broad trapezoidal portal. The east/west
    // court axis and the diagonal discovery paths pass between separate wings.
    const northWalls = new Map();
    for (const side of [-1, 1]) {
      northWalls.set(
        side,
        wall(14.3, plan.wallHeight, side * 12, -18, 0, plan.breakSide === side),
      );
      const py = floor(side * 3.8, -18) - 0.28;
      panel(
        [
          [-1.05, 0],
          [1.05, 0],
          [side > 0 ? 1.05 : 1.75, plan.portal],
          [side > 0 ? -1.75 : -1.05, plan.portal],
        ],
        2.25,
        side * 3.8,
        py,
        -18,
      );
      obstacle(2.2, 2.3, py + plan.portal, side * 3.8, -18);
      cap(2.65, 0.34, 2.7, side * 3.55, py + plan.portal + 0.13, -18);
      const southY = floor(side * 19, 18) - 0.28;
      rect(2.8, 5.4, 2.8, side * 19, southY, 18);
      cap(3.12, 0.32, 3.12, side * 19, southY + 5.54, 18);
      obstacle(3.12, 3.12, southY + 5.7, side * 19, 18);
      if (side === 1)
        game.skyBirdPerches[room.index] = {
          x: x + 19,
          y: base + southY + 5.88,
          surfaceY: base + southY + 5.7,
          z: z + 18,
        };
    }
    const portalY =
      Math.max(floor(-3.8, -18), floor(3.8, -18)) - 0.28 + plan.portal;
    cap(6.6, 0.8, 2.45, 0, portalY + 0.72, -18);
    // A sloping broken pediment and thick side returns give the tall portal
    // depth. Its central opening stays clear for walking and the follow camera.
    panel(
      [
        [-3.25, 0],
        [3.25, 0],
        [2.7, 1.25],
        [0.3, 2.4],
        [-3.25, 1.7],
      ],
      1.8,
      0,
      portalY + 1.13,
      -18,
    );
    for (const side of plan.wings) {
      wall(
        6.3,
        plan.wallHeight - 0.2,
        side * 19,
        -14.85,
        side > 0 ? -Math.PI / 2 : Math.PI / 2,
        plan.breakSide === side,
      );
      wall(
        6.2,
        4.8,
        side * 19,
        14.9,
        side > 0 ? -Math.PI / 2 : Math.PI / 2,
        true,
      );
    }
    if (plan.tower) {
      const tx = plan.towerSide * 14.5,
        bearing = northWalls.get(plan.towerSide),
        ty = bearing.baseY + plan.wallHeight;
      // Fit the full lower edge to the wall's actual broken crown. A small
      // overlap beds the chamfered stones into the backing through its depth.
      const bottom = (dx) =>
        bearing.topAt(tx + dx - plan.towerSide * 12) - ty - 0.045;
      const h = plan.tower;
      panel(
        [
          [-3.1, bottom(-3.1)],
          [3.1, bottom(3.1)],
          [3.1, h * 0.68],
          [0.45, h + 1],
          [-3.1, h * 0.82],
        ],
        1.55,
        tx,
        ty,
        -18,
      );
      for (const side of [-1, 1])
        cap(0.4, 0.38, 2.15, tx + side * 2.7, ty + h * 0.45, -18);
    }
    root.updateMatrixWorld(true);
    mergeArchitecture(root);
    game.skyCitadels.push(patch);
  }
  return true;
}
