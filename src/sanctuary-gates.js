import * as THREE from "three";
import { GATE_DESIGNS, gateEase, gateLeafBounds } from "./gate-designs.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import {
  vaultStoneGeometry,
  flutedColumnGeometry,
  shellReliefGeometry,
} from "./palace-geometry.js";
import { monasteryRoofGeometry } from "./monastery-roof.js";
import { timberGeometry } from "./monastery-architecture.js";
import { forgeGearGeometry } from "./forge-geometry.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { fieldComplete } from "./expeditions.js";
import { softParticleMaterial } from "./effects.js";
import { weatherSkyStone } from "./sky-architecture.js";
import { windMetal, windSurface } from "./wind-art.js";
import { buildSluiceFoundation } from "./sluice-foundations.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { CHAMBER_WALL_BIOMES, buildChamberWall } from "./chamber-walls.js";
import {
  skyGateWallGeometry,
  skyTimberSurface,
  weatherGateTimber,
  buildSkyGateLeaf,
  buildSkyGateJamb,
  buildSkyGateCrown,
} from "./sky-gate-art.js";

export function gateMaterials(level) {
  const design = GATE_DESIGNS[level.biome];
  const wall = pbrMaterial(design.wall, design.tint),
    trim = pbrMaterial(design.trim, design.trimTint);
  wall.name = `${design.name}: masonry`;
  trim.name = `${design.name}: dressed edges`;
  wall.normalScale.set(0.42, 0.42);
  trim.normalScale.set(0.4, 0.4);
  if (level.biome === "sky") {
    wall.vertexColors = true;
    wall.normalScale.set(0.32, 0.32);
    trim.normalScale.set(0.22, 0.22);
    weatherSkyStone(wall);
    weatherSkyStone(trim);
  }
  const metal =
    level.biome === "volcano"
      ? pbrMaterial("forge-metal", 0xb9beb5)
      : level.biome === "sky"
        ? windMetal()
        : patinatedBronze();
  metal.name = `${design.name}: weathered fittings`;
  const wood = ["snow", "sky"].includes(level.biome)
    ? pbrMaterial(
        "monastery-wood",
        level.biome === "snow" ? 0x85624a : 0xb7a48a,
      )
    : null;
  if (level.biome === "sky") {
    wood.normalScale.set(0.38, 0.38);
    weatherGateTimber(wood);
  }
  const roof =
    level.biome === "snow" ? pbrMaterial("monastery-roof", 0x7b8089) : null;
  const snow = level.biome === "snow" ? pbrMaterial("snow", 0xe1e6e9) : null;
  const dark = new THREE.MeshStandardMaterial({
    color: level.biome === "water" ? 0x285053 : 0x252d2d,
    roughness: 0.85,
    metalness: 0.3,
  });
  const inlay = new THREE.MeshStandardMaterial({
    color: level.biome === "crystal" ? 0x7a829f : 0x779ea5,
    emissive: level.biome === "crystal" ? 0x3a346a : 0x142c2a,
    emissiveIntensity: 0.45,
    roughness: 0.38,
    metalness: 0.3,
  });
  const seal = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  const chamberInset = CHAMBER_WALL_BIOMES.has(level.biome)
    ? pbrMaterial(
        level.biome === "water" ? "palace-plaster" : design.wall,
        level.biome === "water"
          ? 0x85aaa6
          : level.biome === "jungle"
            ? 0x858c68
            : level.biome === "volcano"
              ? 0x454b49
              : level.biome === "crystal"
                ? 0x55697d
                : 0x4d6979,
      )
    : null;
  if (chamberInset) {
    chamberInset.name = `${design.name}: recessed chamber panels`;
    chamberInset.normalScale.set(0.3, 0.3);
  }
  const dust = softParticleMaterial({
    color:
      level.biome === "snow"
        ? 0xdce6e9
        : level.biome === "volcano"
          ? 0xa6a39a
          : 0xbaa991,
    size: 0.17,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
  });
  return {
    design,
    wall,
    trim,
    metal,
    wood,
    roof,
    snow,
    dark,
    inlay,
    chamberInset,
    seal,
    dust,
  };
}

export function buildSanctuaryGate(game, feature, materials) {
  const m = materials,
    design = m.design,
    x = feature.x * 7,
    z = feature.z * 7,
    y = game.groundHeight(x, z);
  const root = new THREE.Group(),
    detail = new THREE.Group(),
    door = new THREE.Group();
  root.position.set(x, y, z);
  root.name = `${design.name} ${feature.stage + 1}`;
  root.add(detail, door);
  game.world.add(root);
  door.position.z = 6.5;
  door.userData.cameraDynamic = true;
  const open =
    game.progress.completed ||
    fieldComplete(game.level, game.progress, feature.stage);
  const gate = {
    stage: feature.stage,
    feature,
    root,
    detail,
    door,
    design,
    open,
    amount: open ? 1 : 0,
    motion: 0,
    leaves: [],
    wheels: [],
    weights: [],
    sources: [],
    foundations: [],
    seals: null,
    obstacle: { x, z: z + 6.5, w: 6.5, d: 0.9, h: open ? 0 : 7.5 },
  };
  let serial = game.level.seed + feature.stage * 557;
  const add = (
    geometry,
    material,
    px,
    py,
    pz,
    parent = root,
    capture = false,
  ) => {
    // Shared batches must have the same attributes; the relief's color data is
    // unnecessary for these materials, whose surface color comes from maps.
    if (geometry.attributes.color && !material.vertexColors)
      geometry.deleteAttribute("color");
    if (material.userData.windMetal) windSurface(geometry);
    if (design.panel === "lattice" && material === m.wood)
      skyTimberSurface(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (capture) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (
    w,
    h,
    d,
    material,
    px,
    py,
    pz,
    parent = root,
    capture = false,
  ) =>
    add(
      material === m.wood
        ? timberGeometry(w, h, d, ++serial)
        : stoneBlockGeometry(w, h, d, ++serial),
      material,
      px,
      py,
      pz,
      parent,
      capture,
    );
  const cameraBox = (w, h, d, px, py, pz, parent = root) => {
    const mesh = add(
      new THREE.BoxGeometry(w, h, d),
      m.wall,
      px,
      py,
      pz,
      parent,
      true,
    );
    parent.remove(mesh);
    mesh.geometry.dispose();
  };
  const line = (a, b, r, material, parent = root) => {
    const delta = b.clone().sub(a),
      mesh = add(
        new THREE.CylinderGeometry(r, r, delta.length(), 6),
        material,
        0,
        0,
        0,
        parent,
      );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const regionalWalls = CHAMBER_WALL_BIOMES.has(game.level.biome);
  gate.walls = [];
  // Regional chambers retain the gate's footprint and working space.
  for (const side of [-1, 0, 1]) {
    const back = side === 0,
      length = back ? 13.0 : 13.8;
    const point = (t) => ({ x: back ? t : side * 6.5, z: back ? -6.5 : t });
    let floor = 0;
    for (let i = 0; i <= 12; i++) {
      const p = point(-length / 2 + (i * length) / 12);
      floor = Math.min(floor, game.groundHeight(x + p.x, z + p.z) - y - 0.12);
    }
    const center = point(0);
    if (regionalWalls)
      floor = Math.min(
        floor,
        footprintMinimum(
          (px, pz) => game.groundHeight(px, pz),
          x + center.x,
          z + center.z,
          back ? length : 1.6,
          back ? 1.6 : length,
          game.terrainProfile?.step || 1.75,
        ) -
          y -
          0.18,
      );
    if (floor < -0.05) {
      if (design.panel === "sluice")
        gate.foundations.push(
          buildSluiceFoundation(
            game,
            root,
            m.trim,
            {
              x: center.x,
              z: center.z,
              width: back ? length : regionalWalls ? 1.6 : 0.9,
              depth: back ? (regionalWalls ? 1.6 : 0.9) : length,
            },
            ++serial,
          ),
        );
      else
        block(
          back ? length : regionalWalls ? 1.6 : 0.9,
          -floor + 0.13,
          back ? (regionalWalls ? 1.6 : 0.9) : length,
          m.trim,
          center.x,
          (floor + 0.13) / 2,
          center.z,
          root,
          regionalWalls,
        );
    }
    if (design.panel === "lattice") {
      const angle = back ? Math.PI : (side * Math.PI) / 2;
      const wall = add(
        skyGateWallGeometry(length, floor, serial++),
        m.wall,
        center.x,
        0,
        center.z,
      );
      wall.rotation.y = angle;
      for (const offset of wall.geometry.userData.niches) {
        const nx = center.x + offset * Math.cos(angle),
          nz = center.z - offset * Math.sin(angle);
        for (const [height, width, py] of [
          [0.2, 1.45, 1.65],
          [0.28, 1.45, 4.78],
        ]) {
          const stone = block(width, height, 0.96, m.trim, nx, py, nz);
          stone.rotation.y = angle;
        }
      }
    } else if (regionalWalls)
      gate.walls.push(buildChamberWall(game, gate, m, { length, side, floor }));
    else
      for (let row = 0; row < 7; row++) {
        const start = -length / 2,
          end = length / 2,
          offset = row % 2 ? 1.15 : 0;
        for (let a = start - offset; a < end; a += 2.3) {
          const lo = Math.max(start, a),
            hi = Math.min(end, a + 2.3),
            p = point((lo + hi) / 2);
          if (hi - lo < 0.1) continue;
          block(
            back ? hi - lo - 0.025 : 0.82,
            0.965,
            back ? 0.82 : hi - lo - 0.025,
            row === 0 ? m.trim : m.wall,
            p.x,
            row + 0.5,
            p.z,
          );
        }
      }
    for (let a = -length / 2; a < length / 2; a += 2.3) {
      const hi = Math.min(length / 2, a + 2.3),
        p = point((a + hi) / 2);
      block(
        back ? hi - a - 0.025 : 1.0,
        0.25,
        back ? 1.0 : hi - a - 0.025,
        m.trim,
        p.x,
        7.13,
        p.z,
        root,
        regionalWalls,
      );
    }
    if (m.snow)
      block(
        back ? length : 0.96,
        0.12,
        back ? 0.96 : length,
        m.snow,
        center.x,
        7.32,
        center.z,
      );
    if (!regionalWalls)
      cameraBox(
        back ? length : 1.0,
        7.38 - floor,
        back ? 1.0 : length,
        center.x,
        (floor + 7.38) / 2,
        center.z,
      );
    game.obstacles.push({
      x: x + center.x,
      z: z + center.z,
      w: back ? 7.2 : 0.85,
      d: back ? 0.85 : 7.2,
      h: 7.5,
    });
  }
  // The jambs carry their lintels, drive axles, tracks and visible counterweights.
  for (const side of [-1, 1]) {
    if (design.panel === "sluice") {
      const footing = buildSluiceFoundation(
        game,
        root,
        m.trim,
        { x: side * 6.5, z: 6.65, width: 1.7, depth: 2.2 },
        game.level.seed + feature.stage * 557 + side * 1009,
      );
      gate.foundations.push(footing);
      // The fluted face and its footing extend beyond the thin side wall.
      game.obstacles.push({
        x: x + footing.x,
        z: z + footing.z,
        w: footing.width / 2,
        d: footing.depth / 2,
        h: y + 8.5 - game.groundHeight(x + footing.x, z + footing.z),
      });
    }
    if (design.panel === "lattice") buildSkyGateJamb({ side, m, add, block });
    else
      for (let row = 0; row < 8; row++)
        block(
          1.48,
          row === 0 ? 1.05 : 0.98,
          1.55,
          m.trim,
          side * 6.5,
          row + 0.55,
          6.5,
        );
    block(1.7, 0.3, 1.78, m.trim, side * 6.5, 8.35, 6.5);
    cameraBox(1.7, 8.5, 1.8, side * 6.5, 4.25, 6.5);
    if (design.panel === "sluice")
      add(flutedColumnGeometry(7.55, 0.57), m.trim, side * 6.5, 0.45, 7.05);
    for (const yy of [1.0, 3.4, 6.8])
      block(0.95, 0.22, 0.2, m.metal, side * 6.5, yy, 7.38);
    const wheel = new THREE.Group();
    wheel.position.set(side * 6.5, 3.4, 7.55);
    root.add(wheel);
    // Scale the complete profile: the forge generator's tooth depth is fixed,
    // so a directly tiny radius would cut the rim through its hub opening.
    const driveGeometry = forgeGearGeometry(1.74, 14, 0.48);
    driveGeometry.scale(1 / 3, 1 / 3, 1 / 3);
    add(driveGeometry, m.metal, 0, 0, 0, wheel);
    add(
      new THREE.TorusGeometry(0.24, 0.055, 6, 18),
      m.metal,
      0,
      0,
      0.12,
      wheel,
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      line(
        new THREE.Vector3(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.08),
        new THREE.Vector3(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.08),
        0.035,
        m.metal,
        wheel,
      );
    }
    mergeArchitecture(wheel);
    gate.wheels.push(wheel);
    add(
      new THREE.CylinderGeometry(0.12, 0.12, 0.55, 10),
      m.metal,
      side * 6.5,
      3.4,
      7.5,
    ).rotation.x = Math.PI / 2;
    if (design.motion === "sink") {
      for (const dx of [-0.48, 0.48])
        block(0.12, 6.5, 0.17, m.metal, side * 6.5 + dx, 4, 7.38);
      const weight = new THREE.Group();
      weight.position.set(side * 6.5, 1.2, 7.36);
      weight.userData.cameraDynamic = true;
      root.add(weight);
      block(0.72, 1.35, 0.25, m.trim, 0, 0, 0, weight);
      block(0.78, 0.18, 0.29, m.metal, 0, 0.5, 0, weight);
      block(0.78, 0.18, 0.29, m.metal, 0, -0.5, 0, weight);
      mergeArchitecture(weight);
      gate.weights.push(weight);
      const chain = line(
        new THREE.Vector3(side * 6.5, 1.2, 7.32),
        new THREE.Vector3(side * 6.5, 8.2, 7.32),
        0.035,
        m.metal,
      );
      // The chain slides behind its weight in the covered jamb guide.
      chain.userData.animated = true;
    }
    const source = {
      id: `gate-drive-${feature.stage}-${side}`,
      kind: ["snow", "sky"].includes(game.level.biome) ? "rope" : "machine",
      x: x + side * 6.5,
      y: y + 3.4,
      z: z + 7.85,
      near: 2,
      range: 34,
      gain: design.motion === "sink" ? 0.45 : 0.28,
      rate: 0.74 + (feature.stage % 4) * 0.035,
      gateStage: feature.stage,
      activity: 0,
    };
    gate.sources.push(source);
  }
  block(
    12.9,
    0.35,
    1.1,
    design.panel === "lattice" ? m.wood : m.trim,
    0,
    7.65,
    6.5,
    root,
    true,
  );
  if (design.crown === "wind") {
    buildSkyGateCrown({ m, add, block, root, detail });
  } else if (design.crown === "arch") {
    for (let i = 0; i < 15; i++) {
      const a = (i * Math.PI) / 15 + 0.006,
        b = ((i + 1) * Math.PI) / 15 - 0.006;
      const geometry = vaultStoneGeometry(6.25, 6.95, a, b, 1.55, 3);
      geometry.scale(1, 0.36, 1);
      add(geometry, m.trim, 0, 7.9, 6.5, root, true);
    }
    if (design.panel === "sluice")
      add(shellReliefGeometry(2.15), m.trim, 0, 10.15, 7.32, detail);
    else {
      const crest = add(
        new THREE.TorusGeometry(
          design.panel === "sun" ? 0.8 : 0.66,
          0.11,
          8,
          40,
        ),
        m.metal,
        0,
        10.0,
        7.28,
        detail,
      );
      if (design.panel === "sun")
        add(
          new THREE.SphereGeometry(0.55, 20, 12),
          m.metal,
          0,
          10.0,
          7.2,
          detail,
        ).scale.z = 0.2;
    }
  } else if (design.crown === "roof") {
    block(15.1, 0.65, 1.95, m.wood, 0, 8.2, 6.5, root, true);
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++)
        block(
          1.6 - i * 0.28,
          0.22,
          1.65,
          m.wood,
          side * (5.9 - i * 0.22),
          7.65 - i * 0.24,
          6.5,
        );
    const roofOptions = {
      width: 16.1,
      depth: 3.9,
      rise: 1.2,
      seed: feature.stage,
      damage: feature.stage === 4 ? 1 : 0,
    };
    add(monasteryRoofGeometry(roofOptions), m.roof, 0, 8.65, 6.5, root, true);
    add(
      monasteryRoofGeometry({ ...roofOptions, snow: true }),
      m.snow,
      0,
      8.65,
      6.5,
    );
  } else if (design.crown === "corbel") {
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++)
        block(
          1.85,
          0.43,
          1.65,
          m.trim,
          side * (5.85 - i * 0.86),
          8.07 + i * 0.4,
          6.5,
          root,
          true,
        );
    block(3.8, 0.48, 1.85, m.trim, 0, 10.4, 6.5, root, true);
    add(
      carvedPanelGeometry(1.7, 2.2, feature.stage % 3),
      m.wall,
      0,
      8.0,
      7.39,
      detail,
    );
  } else if (design.crown === "angular") {
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++)
        block(
          1.8,
          0.58,
          1.6,
          m.trim,
          side * (5.7 - i * 1.0),
          8.0 + i * 0.43,
          6.5,
          root,
          true,
        );
    block(3.5, 0.6, 1.8, m.trim, 0, 10.25, 6.5, root, true);
    for (let i = 0; i < 5; i++) {
      const gem = add(
        new THREE.IcosahedronGeometry(0.38, 0),
        m.inlay,
        (i - 2) * 0.65,
        10.6 - Math.abs(i - 2) * 0.15,
        6.7,
        detail,
      );
      gem.scale.y = 1.55;
    }
  } else if (design.crown === "forge") {
    block(14.4, 0.75, 1.9, m.metal, 0, 8.4, 6.5, root, true);
    for (const side of [-1, 1]) {
      const gear = add(
        forgeGearGeometry(1.05, 20, 0.3),
        m.metal,
        side * 5.65,
        9.1,
        6.8,
      );
      gear.userData.animated = true;
      gate.wheels.push(gear);
    }
    block(9, 0.42, 1.2, m.trim, 0, 9.15, 6.5, root, true);
  } else {
    for (let i = 0; i < 3; i++)
      block(
        14.1 - i * 0.9,
        0.4,
        1.65 + i * 0.12,
        m.trim,
        0,
        8.0 + i * 0.4,
        6.5,
        root,
        true,
      );
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++)
        block(
          0.3,
          0.72,
          0.26,
          m.metal,
          side * (4.4 + i * 0.6),
          8.4 + i * 0.1,
          7.45,
          detail,
        );
  }
  // Descending slabs disappear into a narrow, framed floor slot.
  if (design.motion === "sink") {
    block(12.45, 0.045, 0.85, m.dark, 0, 0.025, 6.5);
    for (const side of [-1, 1])
      block(12.7, 0.065, 0.1, m.metal, 0, 0.05, 6.5 + side * 0.52);
    game.obstacles.push(gate.obstacle);
  }
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.x = side * 6.2;
    leaf.userData.cameraDynamic = true;
    door.add(leaf);
    const cx = -side * 3.1,
      bodyMaterial = ["relief", "crystal"].includes(design.panel)
        ? m.wall
        : design.panel === "timber"
          ? m.wood
          : m.metal;
    if (design.panel !== "lattice")
      block(6.15, 7.4, 0.48, bodyMaterial, cx, 3.7, 0, leaf);
    cameraBox(6.2, 7.4, 0.6, cx, 3.7, 0, leaf);
    const leafDetail = new THREE.Group();
    leaf.add(leafDetail);
    if (design.panel === "lattice") {
      buildSkyGateLeaf({
        gate,
        leaf,
        side,
        cx,
        m,
        add,
        block,
        detail: leafDetail,
      });
    } else if (design.panel === "timber") {
      for (let i = 0; i < 8; i++)
        block(
          0.72,
          7.25,
          0.17,
          m.wood,
          cx + (i - 3.5) * 0.755,
          3.7,
          0.32,
          leaf,
        );
      for (const xx of [-2.85, 2.85])
        block(0.2, 7.4, 0.42, m.wood, cx + xx, 3.7, 0.12, leaf);
      for (const yy of [1.0, 3.7, 6.4]) {
        block(6.05, 0.22, 0.2, m.metal, cx, yy, 0.46, leaf);
        for (let i = 0; i < 8; i++)
          add(
            new THREE.SphereGeometry(0.065, 8, 5),
            m.metal,
            cx + (i - 3.5) * 0.75,
            yy,
            0.58,
            leafDetail,
          );
      }
      const brace = block(0.18, 7.9, 0.17, m.metal, cx, 3.7, 0.47, leaf);
      brace.rotation.z = side * Math.atan(5.5 / 5.6);
    } else if (design.panel === "relief") {
      add(
        carvedPanelGeometry(4.75, 5.6, (feature.stage + (side + 1) / 2) % 3),
        m.trim,
        cx,
        0.9,
        0.37,
        leafDetail,
      );
      for (const xx of [-2.65, 2.65])
        block(0.19, 6.3, 0.19, m.trim, cx + xx, 3.7, 0.36, leaf);
      for (const yy of [0.57, 6.83])
        block(5.5, 0.19, 0.19, m.trim, cx, yy, 0.36, leaf);
    } else if (design.panel === "sun") {
      add(
        new THREE.TorusGeometry(1.7, 0.105, 8, 48),
        m.metal,
        cx,
        3.95,
        0.42,
        leafDetail,
      );
      add(
        new THREE.SphereGeometry(0.78, 24, 16),
        m.metal,
        cx,
        3.95,
        0.43,
        leafDetail,
      ).scale.z = 0.2;
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const ray = block(
          0.12,
          0.85,
          0.12,
          m.metal,
          cx + Math.sin(a) * 1.4,
          3.95 + Math.cos(a) * 1.4,
          0.45,
          leafDetail,
        );
        ray.rotation.z = -a;
      }
      for (const yy of [0.85, 6.7])
        for (let i = 0; i < 7; i++)
          block(
            0.32,
            0.35,
            0.14,
            m.trim,
            cx + (i - 3) * 0.67,
            yy,
            0.37,
            leafDetail,
          );
    } else if (design.panel === "sluice") {
      for (const yy of [1.4, 3.7, 6.0]) {
        block(4.9, 1.55, 0.09, m.dark, cx, yy, 0.285, leaf);
        const points = Array.from(
          { length: 17 },
          (_, i) =>
            new THREE.Vector3(
              cx - 2.25 + (i * 4.5) / 16,
              yy + Math.sin((i * Math.PI) / 4) * 0.3,
              0.41,
            ),
        );
        add(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            40,
            0.065,
            6,
            false,
          ),
          m.inlay,
          0,
          0,
          0,
          leafDetail,
        );
      }
      for (const xx of [-2.75, 2.75])
        block(0.18, 7.25, 0.18, m.metal, cx + xx, 3.7, 0.4, leaf);
    } else if (design.panel === "forge") {
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          const px = cx + (col - 1) * 1.82,
            py = 1.35 + row * 2.2;
          block(1.5, 1.5, 0.09, m.dark, px, py, 0.29, leaf);
          for (let vent = 0; vent < 4; vent++)
            block(
              1.35,
              0.08,
              0.13,
              m.metal,
              px,
              py + (vent - 1.5) * 0.29,
              0.4,
              leafDetail,
            );
        }
      for (const yy of [0.3, 7.1])
        for (let i = 0; i < 8; i++)
          add(
            new THREE.SphereGeometry(0.075, 8, 5),
            m.metal,
            cx + (i - 3.5) * 0.76,
            yy,
            0.37,
            leafDetail,
          );
    } else if (design.panel === "crystal") {
      for (let branch = 0; branch < 4; branch++) {
        const points = Array.from(
          { length: 7 },
          (_, i) =>
            new THREE.Vector3(
              cx +
                (branch - 1.5) * 1.05 +
                Math.sin(i * 2 + branch + feature.stage) * 0.45,
              0.55 + i * 1.03,
              0.35,
            ),
        );
        add(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            24,
            0.055 + branch * 0.006,
            5,
            false,
          ),
          m.inlay,
          0,
          0,
          0,
          leafDetail,
        );
      }
      for (let i = 0; i < 5; i++) {
        const gem = add(
          new THREE.IcosahedronGeometry(0.24, 0),
          m.inlay,
          cx + Math.sin(i * 2 + feature.stage) * 1.8,
          1.1 + i * 1.25,
          0.4,
          leafDetail,
        );
        gem.scale.set(0.7, 1.6, 0.6);
      }
    } else {
      for (let ring = 0; ring < 3; ring++) {
        const orbit = add(
          new THREE.TorusGeometry(0.9 + ring * 0.6, 0.055, 6, 56),
          m.metal,
          cx,
          3.75,
          0.37 + ring * 0.035,
          leafDetail,
        );
        orbit.scale.y = 0.66 + ring * 0.12;
        orbit.rotation.z = (ring - 1) * 0.48;
        const a = feature.stage * 0.8 + ring * 1.7 + side;
        add(
          new THREE.SphereGeometry(0.13, 12, 8),
          m.inlay,
          cx + Math.cos(a) * (ring * 0.6 + 0.9),
          3.75 + Math.sin(a) * (ring * 0.6 + 0.9) * 0.8,
          0.52,
          leafDetail,
        );
      }
      for (let i = 0; i < 7; i++)
        add(
          new THREE.OctahedronGeometry(0.08),
          m.metal,
          cx + Math.sin(i * 13 + feature.stage) * 2.5,
          0.75 + i * 0.96,
          0.39,
          leafDetail,
        );
    }
    const handle = add(
      new THREE.TorusGeometry(0.25, 0.055, 7, 24),
      m.metal,
      cx - side * 2.2,
      3.45,
      0.55,
      leafDetail,
    );
    block(0.22, 0.4, 0.28, m.metal, cx - side * 2.2, 3.7, 0.4, leafDetail);
    mergeArchitecture(leaf);
    mergeArchitecture(leafDetail);
    const obstacle = { x: 0, z: 0, w: 0, d: 0, h: 7.5 };
    if (design.motion === "hinge") game.obstacles.push(obstacle);
    gate.leaves.push({ side, group: leaf, detail: leafDetail, obstacle });
  }
  block(2.6, 0.5, 0.16, m.metal, 0, 7.95, 7.15);
  gate.seals = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    m.seal,
    3,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 3; i++) {
    dummy.position.set((i - 1) * 0.7, 7.95, 7.3);
    dummy.scale.set(1, 1, 0.42);
    dummy.updateMatrix();
    gate.seals.setMatrixAt(i, dummy.matrix);
    gate.seals.setColorAt(i, new THREE.Color(0.08, 0.09, 0.08));
  }
  root.add(gate.seals);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3),
  );
  gate.dust = new THREE.Points(dustGeometry, m.dust);
  gate.dust.frustumCulled = false;
  root.add(gate.dust);
  mergeArchitecture(root);
  mergeArchitecture(detail);
  updateSanctuaryGate(game, gate, 0);
  return gate;
}

export function updateSanctuaryGate(game, gate, dt) {
  const before = gate.amount;
  gate.open =
    game.progress.completed ||
    fieldComplete(game.level, game.progress, gate.stage);
  gate.amount +=
    (Number(gate.open) - gate.amount) * Math.min(1, Math.max(0, dt) * 1.5);
  if (Math.abs(Number(gate.open) - gate.amount) < 0.0001)
    gate.amount = Number(gate.open);
  gate.motion = Math.abs(gate.amount - before) / Math.max(0.001, dt);
  const eased = gateEase(gate.amount),
    c = gate.root.position;
  if (gate.design.motion === "sink") {
    gate.door.position.y = -7.65 * eased;
    gate.obstacle.h = Math.max(
      0,
      c.y + 7.4 + gate.door.position.y - game.groundHeight(c.x, c.z + 6.5),
    );
    gate.weights.forEach((w) => (w.position.y = 1.2 + 5.5 * eased));
  } else {
    gate.obstacle.h = gate.amount > 0.94 ? 0 : 7.5;
    for (const leaf of gate.leaves) {
      const b = gateLeafBounds(leaf.side, gate.amount);
      leaf.group.rotation.y = b.angle;
      Object.assign(leaf.obstacle, {
        x: c.x + b.x,
        z: c.z + b.z,
        // Match the character clearance already included in the side walls.
        w: b.w + 0.25,
        d: b.d + 0.25,
        h: Math.max(0, c.y + 7.4 - game.groundHeight(c.x + b.x, c.z + b.z)),
      });
    }
  }
  gate.door.visible = gate.design.motion === "hinge" || gate.amount < 1;
  gate.wheels.forEach(
    (wheel, i) => (wheel.rotation.z = (i % 2 ? -1 : 1) * eased * Math.PI * 5),
  );
  let restored = gate.open
    ? 3
    : [0, 1, 2].filter((i) =>
        game.progress.field.includes(`field-${gate.stage}-${i}`),
      ).length;
  for (let i = 0; i < 3; i++)
    gate.seals.setColorAt(
      i,
      i < restored
        ? new THREE.Color(1.6, 1.05, 0.35)
        : new THREE.Color(0.08, 0.09, 0.08),
    );
  gate.seals.instanceColor.needsUpdate = true;
  const near =
    !game.player ||
    gate.root.position.distanceTo(game.player.position) <
      (gate.detail.visible ? 100 : 90);
  gate.detail.visible = near;
  gate.leaves.forEach((l) => (l.detail.visible = near));
  gate.dust.visible = near && gate.motion > 0.004;
  if (gate.dust.visible) {
    const p = gate.dust.geometry.attributes.position,
      t = game.elapsed || 0;
    for (let i = 0; i < p.count; i++) {
      const age = (i * 0.618 + t * 0.5) % 1;
      p.setXYZ(
        i,
        Math.sin(i * 17.13) * 5.9,
        0.08 + age * 0.7,
        6.5 + Math.cos(i * 11) * 0.35 + age * 0.45,
      );
    }
    p.needsUpdate = true;
  }
  if (before < 0.995 && gate.amount >= 0.995 && dt > 0)
    game.audio?.noiseHit?.(
      0.018,
      0.35,
      240,
      new THREE.Vector3(c.x, c.y + 1.2, c.z + 7.8),
    );
}
