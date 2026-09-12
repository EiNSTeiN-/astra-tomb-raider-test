import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  vaultStoneGeometry,
  flutedColumnGeometry,
  shellReliefGeometry,
  vaultCellPresent,
} from "./palace-geometry.js";
import { weatherPalaceStone } from "./palace-material.js";
import { addMasonryFooting } from "./masonry-footings.js";

export function palacePlan(room) {
  const i = room.index % 10;
  const galleries = [
    [-1, 1],
    [-1],
    [1],
    [-1, 1],
    [],
    [1],
    [-1],
    [-1, 1],
    [1],
    [-1, 1],
  ][i];
  const columns = [-19, -6.5, 6.5, 19].flatMap((x) =>
    [-24, -12].map((z) => ({ x, z, width: 2.45 })),
  );
  for (const side of galleries)
    for (const z of [-4.5, 4.5, 13.5, 22.5])
      columns.push({ x: side * 19, z, width: 2.1 });
  return {
    columns,
    galleries,
    damage: [0, 1, 2, 3, 2, 1, 3, 1, 0, 3][i],
    spring: i === 9 ? 7 : 6.2,
  };
}

function toneGeometry(geometry, seed) {
  const p = geometry.attributes.position,
    values = new Float32Array(p.count * 3);
  const tint =
    0.89 + (0.1 * (((Math.sin(seed * 17.13) * 43758.5) % 1) + 1)) / 2;
  for (let i = 0; i < p.count; i++) {
    const shade =
      tint *
      (0.96 +
        0.04 * Math.sin(p.getX(i) * 0.4 + p.getY(i) * 0.73 + p.getZ(i) * 0.5));
    values[i * 3] = shade;
    values[i * 3 + 1] = shade * 0.994;
    values[i * 3 + 2] = shade * 0.98;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

export function buildPalaceArchitecture(game) {
  game.palacePatches = [];
  game.palaceBirdPerches = {};
  if (game.level.biome !== "water") return false;
  const stone = game.stoneMat.clone(),
    plaster = pbrMaterial("palace-plaster", 0xadb8ac),
    dark = game.darkMat.clone();
  for (const m of [stone, plaster, dark]) {
    m.vertexColors = true;
    weatherPalaceStone(m);
  }
  plaster.normalScale.set(0.35, 0.35);
  plaster.name = "Weathered blue vault plaster";
  let serial = game.level.seed;
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7,
      base = game.groundHeight(x, z),
      plan = palacePlan(room);
    const root = new THREE.Group(),
      detail = new THREE.Group();
    root.name = `Drowned palace court ${room.index}`;
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    game.world.add(root, detail);
    const add = (
      geometry,
      material,
      px,
      py,
      pz,
      angle = 0,
      parent = root,
      capture = false,
    ) => {
      if (material.vertexColors) toneGeometry(geometry, ++serial);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = angle;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      if (capture) game.cameraSurfaces?.capture(mesh);
      return mesh;
    };
    const block = (
      w,
      h,
      d,
      mat,
      px,
      py,
      pz,
      angle = 0,
      parent = root,
      capture = false,
    ) =>
      add(
        stoneBlockGeometry(w, h, d, ++serial),
        mat,
        px,
        py,
        pz,
        angle,
        parent,
        capture,
      );
    const capture = (geometry, px, py, pz, angle = 0) => {
      const mesh = new THREE.Mesh(geometry, stone);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = angle;
      root.add(mesh);
      game.cameraSurfaces?.capture(mesh);
      root.remove(mesh);
      geometry.dispose();
    };
    const foundations = [];
    for (const column of plan.columns) {
      const { x: px, z: pz, width } = column,
        ground = game.groundHeight(x + px, z + pz) - base;
      const top = plan.spring,
        shaftHeight = top - ground - 1.3;
      const radius = width * 0.365;
      const foundation = addMasonryFooting(game, root, {
        x: px,
        z: pz,
        width,
        material: dark,
        blockGeometry: stoneBlockGeometry,
        seed: game.level.seed + room.index * 101 + px * 13 + pz * 17,
        color: [0.85, 0.845, 0.833],
      });
      if (foundation) foundations.push(foundation);
      game.obstacles.push({
        x: x + px,
        z: z + pz,
        w: width / 2,
        d: width / 2,
        h: top - ground + 0.36,
        palace: true,
      });
      const bottom = foundation
        ? Math.min(ground - 0.2, foundation.bottom - base)
        : ground - 0.2;
      capture(
        new THREE.BoxGeometry(width, top + 0.2 - bottom, width),
        px,
        (top + 0.2 + bottom) / 2,
        pz,
      );
      block(width, 0.36, width, dark, px, ground + 0.12, pz);
      for (const [r, h, dy] of [
        [radius * 1.2, 0.22, 0.41],
        [radius * 1.12, 0.18, 0.6],
      ])
        add(
          new THREE.CylinderGeometry(r, r, h, 32),
          stone,
          px,
          ground + dy,
          pz,
        );
      add(
        flutedColumnGeometry(shaftHeight, radius),
        stone,
        px,
        ground + 0.69,
        pz,
      );
      add(
        new THREE.CylinderGeometry(radius * 1.16, radius * 0.9, 0.28, 32),
        stone,
        px,
        top - 0.46,
        pz,
      );
      block(width * 0.94, 0.28, width * 0.94, stone, px, top - 0.17, pz);
      block(width * 1.1, 0.24, width * 1.1, stone, px, top + 0.09, pz);
      block(
        width * 0.87,
        0.19,
        0.055,
        plaster,
        px,
        top - 0.13,
        pz + width * 0.48,
        0,
        detail,
      );
      // Two scrolls and a shallow shell carving on the capital's public face.
      for (const side of [-1, 1]) {
        const scroll = add(
          new THREE.TorusGeometry(0.26, 0.07, 6, 24, Math.PI * 1.7),
          stone,
          px + side * radius * 0.78,
          top - 0.45,
          pz + radius * 0.9,
          0,
          detail,
        );
        scroll.rotation.z = side < 0 ? 0.2 : Math.PI - 0.2;
      }
      add(
        shellReliefGeometry(width * 0.57),
        stone,
        px,
        top - 0.51,
        pz + width * 0.48,
        0,
        detail,
      );
    }
    const arch = (ax, az, bx, bz, depth = 1.35, spring = plan.spring) => {
      const length = Math.hypot(bx - ax, bz - az),
        angle = -Math.atan2(bz - az, bx - ax),
        inner = length / 2 - 1.05,
        outer = length / 2 + 0.2,
        parts = 17;
      for (let i = 0; i < parts; i++) {
        const a = (i / parts) * Math.PI + 0.004,
          b = ((i + 1) / parts) * Math.PI - 0.004;
        add(
          vaultStoneGeometry(inner, outer, a, b, depth),
          stone,
          (ax + bx) / 2,
          spring,
          (az + bz) / 2,
          angle,
          root,
          false,
        );
      }
      for (let i = 0; i < parts;) {
        const end = parts - i === 3 ? parts : Math.min(parts, i + 2);
        capture(
          vaultStoneGeometry(
            inner,
            outer,
            (i / parts) * Math.PI,
            (end / parts) * Math.PI,
            depth,
          ),
          (ax + bx) / 2,
          spring,
          (az + bz) / 2,
          angle,
        );
        i = end;
      }
    };
    const vaults = [];
    for (const [bay, [ax, bx]] of [
      [-19, -6.5],
      [-6.5, 6.5],
      [6.5, 19],
    ].entries()) {
      const center = (ax + bx) / 2,
        inner = (bx - ax) / 2 - 1.05,
        outer = (bx - ax) / 2 + 0.04;
      const damage = bay === 1 ? plan.damage : (room.index + bay) % 4;
      arch(ax, -12, bx, -12);
      arch(ax, -24, bx, -24);
      const rows = 6,
        rowDepth = 12 / rows;
      for (let row = 0; row < rows; row++)
        for (let sector = 0; sector < 24; sector++) {
          if (!vaultCellPresent(sector, row, damage)) continue;
          const a = (sector / 24) * Math.PI + 0.003,
            b = ((sector + 1) / 24) * Math.PI - 0.003,
            pz = -24 + (row + 0.5) * rowDepth;
          add(
            vaultStoneGeometry(
              inner + 0.06,
              outer,
              (sector / 24) * Math.PI,
              ((sector + 1) / 24) * Math.PI,
              rowDepth,
              2,
            ),
            stone,
            center,
            plan.spring,
            pz,
          );
          // Surviving blue plaster follows the intrados, with irregular bare areas.
          if (
            (((Math.sin((sector + row * 37 + room.index * 113) * 17.13) *
              43758.5453) %
              1) +
              1) %
              1 >
            0.12
          )
            add(
              vaultStoneGeometry(
                inner + 0.015,
                inner + 0.045,
                a,
                b,
                rowDepth - 0.055,
                2,
              ),
              plaster,
              center,
              plan.spring,
              pz,
            );
        }
      // Capture consecutive surviving depth runs, keeping skylights open without
      // one camera volume for every decorative masonry block.
      for (let sector = 0; sector < 24;) {
        let end = Math.min(24, sector + 2);
        for (let row = 0; row < rows; row++)
          if (
            vaultCellPresent(sector, row, damage) !==
            vaultCellPresent(end - 1, row, damage)
          )
            end = sector + 1;
        let first = -1;
        for (let row = 0; row <= rows; row++) {
          const present = row < rows && vaultCellPresent(sector, row, damage);
          if (present && first < 0) first = row;
          if (!present && first >= 0) {
            capture(
              vaultStoneGeometry(
                inner,
                outer,
                (sector / 24) * Math.PI,
                (end / 24) * Math.PI,
                (row - first) * rowDepth,
                2,
              ),
              center,
              plan.spring,
              -24 + ((first + row) * rowDepth) / 2,
            );
            first = -1;
          }
        }
        sector = end;
      }
      vaults.push({ center, inner, outer, damage, depth: 12 });
    }
    // Longitudinal arches support the vault edges and covered side passages.
    for (const px of [-19, -6.5, 6.5, 19]) arch(px, -24, px, -12, 1.25);
    for (const side of plan.galleries) {
      const stops = [-12, -4.5, 4.5, 13.5, 22.5];
      for (let j = 1; j < stops.length; j++) {
        arch(side * 19, stops[j - 1], side * 19, stops[j], 1.25);
        const length = stops[j] - stops[j - 1],
          roofY = plan.spring + length / 2 + 0.5;
        // Narrow entablature caps the arcade; the open arches remain walkable.
        block(
          2.1,
          0.44,
          length + 0.3,
          stone,
          side * 19,
          roofY,
          (stops[j] + stops[j - 1]) / 2,
          0,
          root,
          true,
        );
        block(
          2.32,
          0.16,
          length + 0.48,
          dark,
          side * 19,
          roofY + 0.28,
          (stops[j] + stops[j - 1]) / 2,
        );
      }
    }
    // A visible bracket provides the bird and its emitter with the same support.
    const perchZ = plan.galleries.includes(1) ? 22.5 : -12;
    const perch = block(1.1, 0.3, 0.8, stone, 20.1, plan.spring + 0.34, perchZ);
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x + 20.3, base + plan.spring + 2, z + perchZ),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(perch)[0];
    game.palaceBirdPerches[room.index] = {
      x: x + 20.3,
      y: hit?.point.y ?? base + plan.spring + 0.49,
      z: z + perchZ,
    };
    mergeArchitecture(root);
    mergeArchitecture(detail);
    const triangles = root.children.reduce(
      (sum, m) =>
        sum +
        (m.geometry
          ? (m.geometry.index?.count ?? m.geometry.attributes.position.count) /
            3
          : 0),
      0,
    );
    game.palacePatches.push({
      root,
      detail,
      plan,
      foundations,
      vaults,
      triangles,
      center: new THREE.Vector3(x, base + 6, z),
    });
  }
  return true;
}

export function updatePalaceArchitecture(game) {
  for (const patch of game.palacePatches || []) {
    const distance = patch.center.distanceTo(game.player.position),
      range = game.store.data.settings.quality === "low" ? 48 : 80;
    patch.detail.visible = distance < range + (patch.detail.visible ? 5 : 0);
  }
}
