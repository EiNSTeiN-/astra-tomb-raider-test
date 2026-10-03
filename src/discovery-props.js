import * as THREE from "three";
import { discoveryPlacement } from "./discovery-placement.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { monasteryRoofGeometry } from "./monastery-roof.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { campMaterials } from "./camp-materials.js";
import { stationSolid } from "./field-station-solids.js";
import { mergeArchitecture, pbrMaterial } from "./visuals.js";
import { propSupportHeight } from "./prop-support.js";

export const DISCOVERY_STYLES = Object.freeze({
  jungle: {
    note: "Waterkeeper's tablet",
    cache: "Reedwood coffer",
    trim: 0x809868,
  },
  desert: {
    note: "Surveyor's scroll",
    cache: "Painted sandstone casket",
    trim: 0xad7756,
  },
  snow: {
    note: "Pilgrim's scripture",
    cache: "Monastery travel chest",
    trim: 0x9e4740,
  },
  water: { note: "Tidal ledger", cache: "Harbor strongbox", trim: 0x538f91 },
  volcano: {
    note: "Foundry register",
    cache: "Riveted iron safe",
    trim: 0x8e6850,
  },
  sky: {
    note: "Windward chart",
    cache: "Canvas courier trunk",
    trim: 0x74877b,
  },
  crystal: {
    note: "Harmonic slate",
    cache: "Hexagonal archive case",
    trim: 0x9e8dbe,
  },
  eclipse: {
    note: "Meridian star plate",
    cache: "Orbital reliquary",
    trim: 0x929fbc,
  },
});

function materials(game) {
  const camp = (game.campMaterials ??= campMaterials(game.level.biome)),
    stone = game.stoneMat.clone(),
    dark = game.darkMat.clone(),
    bronze = patinatedBronze(),
    trim = new THREE.MeshStandardMaterial({
      color: DISCOVERY_STYLES[game.level.biome].trim,
      roughness: 0.8,
    }),
    paper = new THREE.MeshStandardMaterial({ color: 0xd1bd8f, roughness: 1 }),
    ink = new THREE.MeshStandardMaterial({ color: 0x544735, roughness: 1 });
  stone.name = "Discovery worn masonry";
  stone.normalScale.setScalar(0.4);
  dark.name = "Discovery recessed masonry";
  dark.color.copy(stone.color).multiplyScalar(0.48);
  bronze.name = "Discovery patinated fittings";
  const roof =
    game.level.biome === "snow"
      ? pbrMaterial("monastery-roof", 0x81766a)
      : null;
  return { ...camp, stone, dark, bronze, trim, paper, ink, roof };
}

export function buildDiscoveryProp(game, f, m) {
  const p = f.discovery,
    root = f.group,
    construction = new THREE.Group(),
    payload = new THREE.Group(),
    biome = game.level.biome,
    treasure = f.type === "treasure";
  root.add(construction, payload);
  construction.rotation.y = payload.rotation.y = p.stance.yaw;
  f.core = payload;
  f.discoveryStyle = DISCOVERY_STYLES[biome][treasure ? "cache" : "note"];
  let serial = game.level.seed + Number(f.id.split("-")[1]) * 139;
  const add = (
    geo,
    mat,
    x = 0,
    y = 0,
    z = 0,
    parent = construction,
    solid = false,
  ) => {
    if (mat.vertexColors) {
      const tone = mat === m.stone ? 0.9 + Math.sin(++serial) * 0.05 : 1;
      geo.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geo.attributes.position.count * 3).fill(tone),
          3,
        ),
      );
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.discoverySolid = solid;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z, parent = construction, solid = false) =>
    add(
      stoneBlockGeometry(w, h, d, ++serial, 0.018),
      mat,
      x,
      y,
      z,
      parent,
      solid,
    );
  const ring = (r, tube, mat, x, y, z, parent = construction) =>
    add(new THREE.TorusGeometry(r, tube, 6, 32), mat, x, y, z, parent);
  const cylinder = (
    r,
    h,
    mat,
    x,
    y,
    z,
    sides = 12,
    parent = construction,
    solid = false,
  ) =>
    add(
      new THREE.CylinderGeometry(r, r, h, sides),
      mat,
      x,
      y,
      z,
      parent,
      solid,
    );

  // Bury the foundation across its entire footprint, including grid slopes.
  const bottom = p.bottom - p.y,
    baseTop = 0.16;
  box(1.74, baseTop - bottom, 1.5, m.dark, 0, (baseTop + bottom) / 2, 0);
  box(1.8, 0.15, 1.56, m.stone, 0, 0.14, 0, construction, true);
  for (const x of [-0.63, 0, 0.63])
    box(0.59, 0.075, 1.38, m.stone, x, 0.235, 0, construction, true);

  if (treasure) {
    const hex = biome === "crystal",
      orbital = biome === "eclipse",
      wood = ["jungle", "snow", "sky"].includes(biome),
      shell = wood ? m.wood : biome === "volcano" ? m.metal : m.stone;
    if (hex || orbital) {
      cylinder(0.65, 0.7, shell, 0, 0.63, 0, hex ? 6 : 16, construction, true);
      cylinder(0.68, 0.09, m.bronze, 0, 0.31, 0, hex ? 6 : 16);
      cylinder(
        0.68,
        0.09,
        m.bronze,
        0,
        0.98,
        0,
        hex ? 6 : 16,
        construction,
        true,
      );
      if (orbital) {
        const lid = add(
          new THREE.SphereGeometry(
            0.62,
            20,
            10,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ),
          m.bronze,
          0,
          1.02,
          0,
        );
        lid.scale.y = 0.34;
        lid.userData.discoverySolid = true;
        ring(0.43, 0.025, m.trim, 0, 1.12, 0.1).rotation.x = Math.PI / 2;
      } else {
        cylinder(0.61, 0.11, m.dark, 0, 1.07, 0, 6, construction, true);
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          box(
            0.055,
            0.6,
            0.055,
            m.bronze,
            Math.sin(a) * 0.65,
            0.64,
            Math.cos(a) * 0.65,
          );
        }
      }
    } else {
      for (const x of [-0.53, 0.53])
        for (const z of [-0.36, 0.36])
          box(0.19, 0.19, 0.19, m.dark, x, 0.35, z);
      box(1.35, 0.64, 0.95, shell, 0, 0.74, 0, construction, true);
      box(1.43, 0.15, 1.03, shell, 0, 1.15, 0, construction, true);
      for (const x of [-0.47, 0.47]) {
        box(0.075, 0.75, 0.045, m.bronze, x, 0.78, 0.495);
        box(0.075, 0.045, 1.07, m.bronze, x, 1.25, 0);
        for (const y of [0.48, 1.02])
          add(new THREE.SphereGeometry(0.025, 6, 4), m.bronze, x, y, 0.522);
      }
      box(
        0.62,
        0.32,
        0.025,
        biome === "sky" ? m.cloth : m.trim,
        0,
        0.79,
        0.491,
      );
      box(0.1, 0.22, 0.055, m.bronze, 0, 1.12, 0.54);
      ring(0.09, 0.02, m.bronze, 0, 0.84, 0.53);
      if (wood)
        for (const y of [0.58, 0.81, 1.02])
          box(1.1, 0.012, 0.018, m.dark, 0, y, -0.485);
      if (biome === "water")
        for (const x of [-0.7, 0.7])
          ring(0.13, 0.025, m.bronze, x, 0.85, 0).rotation.y = Math.PI / 2;
    }
    // Collect the contents resting on the lid. Leave the solid case behind.
    const lidHeight = hex ? 1.125 : orbital ? 1.215 : 1.225;
    box(0.38, 0.065, 0.31, m.leather, 0.13, lidHeight + 0.03, 0.09, payload);
    for (const x of [0.02, 0.23])
      cylinder(0.08, 0.025, m.bronze, x, lidHeight + 0.075, 0.09, 12, payload);
  } else {
    const timber = ["snow", "sky"].includes(biome),
      foundry = biome === "volcano",
      table = timber ? m.wood : foundry ? m.metal : m.stone;
    if (["crystal", "eclipse"].includes(biome)) {
      cylinder(
        0.43,
        0.68,
        m.dark,
        0,
        0.61,
        0,
        biome === "crystal" ? 6 : 12,
        construction,
        true,
      );
      cylinder(0.56, 0.1, m.bronze, 0, 0.31, 0, 12);
      if (biome === "eclipse") {
        for (const x of [-0.53, 0.53])
          ring(0.25, 0.035, m.bronze, x, 0.66, 0).rotation.y = Math.PI / 2;
      } else {
        for (const x of [-0.58, 0.58]) {
          const crystal = add(
            new THREE.ConeGeometry(0.12, 0.42, 5),
            m.trim,
            x,
            0.47,
            -0.26,
          );
          crystal.rotation.z = x * 0.3;
        }
      }
    } else {
      for (const x of [-0.51, 0.51])
        for (const z of [-0.32, 0.32])
          box(0.17, 0.685, 0.17, table, x, 0.6125, z, construction, true);
      box(1.05, 0.11, 0.72, m.dark, 0, 0.36, 0);
      for (const x of [-0.54, 0.54])
        box(0.085, 0.12, 0.78, m.bronze, x, 0.7, 0);
    }
    box(1.35, 0.13, 1.0, table, 0, 1.015, 0, construction, true);
    box(1.24, 0.035, 0.87, m.trim, 0, 1.095, 0, construction, true);
    const document = new THREE.Group();
    payload.add(document);
    document.position.set(0, 1.14, 0);
    document.rotation.y = ((Number(f.id.split("-")[1]) % 3) - 1) * 0.16;
    const papyrus = ["desert", "sky"].includes(biome),
      book = ["snow", "water"].includes(biome);
    if (papyrus) {
      box(0.76, 0.025, 0.63, m.paper, 0, 0, 0, document);
      for (const x of [-0.4, 0.4])
        cylinder(0.055, 0.68, m.paper, x, 0.042, 0, 12, document).rotation.x =
          Math.PI / 2;
    } else if (book) {
      box(0.86, 0.07, 0.63, m.leather, 0, 0, 0, document);
      for (const x of [-0.21, 0.21])
        box(0.39, 0.035, 0.58, m.paper, x, 0.053, 0, document);
      box(0.025, 0.04, 0.62, m.trim, 0, 0.053, 0, document);
    } else {
      box(
        0.79,
        0.07,
        0.63,
        foundry || biome === "eclipse" ? m.bronze : m.dark,
        0,
        0,
        0,
        document,
      );
      for (const x of [-0.35, 0.35])
        for (const z of [-0.265, 0.265])
          cylinder(0.022, 0.009, m.bronze, x, 0.041, z, 8, document);
    }
    for (let i = 0; i < 6; i++) {
      const length = 0.24 + ((i + Number(f.id.split("-")[1])) % 3) * 0.055;
      for (const x of book ? [-0.22, 0.22] : [0])
        box(
          length,
          0.005,
          0.012,
          papyrus || book ? m.ink : m.bronze,
          x,
          book ? 0.074 : 0.044,
          -0.2 + i * 0.077,
          document,
        );
    }
    if (biome === "snow") {
      for (const x of [-0.7, 0.7])
        box(0.09, 0.81, 0.09, m.wood, x, 1.48, -0.44, construction, true);
      add(
        monasteryRoofGeometry({ width: 1.8, depth: 1.3, rise: 0.22 }),
        m.roof || m.trim,
        0,
        1.88,
        -0.08,
      ).userData.discoverySolid = true;
      box(1.52, 0.06, 0.12, m.wood, 0, 1.86, -0.44);
    }
    if (biome === "jungle")
      for (const x of [-0.49, 0.49])
        for (let i = 0; i < 5; i++) {
          const petal = add(
            new THREE.SphereGeometry(0.055, 8, 5),
            m.bronze,
            x + Math.sin(i * 1.256) * 0.06,
            1.135,
            0.27 + Math.cos(i * 1.256) * 0.06,
          );
          petal.scale.set(0.65, 0.25, 1);
        }
    if (biome === "water")
      for (let i = 0; i < 7; i++)
        box(
          0.12,
          0.12,
          0.025,
          i % 2 ? m.bronze : m.trim,
          -0.52 + i * 0.17,
          0.94,
          0.513,
        );
    if (foundry)
      for (const x of [-0.58, 0.58])
        for (const z of [-0.39, 0.39])
          cylinder(0.032, 0.014, m.bronze, x, 1.096, z, 6);
  }

  root.updateMatrixWorld(true);
  construction.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.userData.discoverySolid) return;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox
        .clone()
        .applyMatrix4(mesh.matrixWorld),
      size = bounds.getSize(new THREE.Vector3()),
      centre = bounds.getCenter(new THREE.Vector3());
    stationSolid(
      game,
      f,
      { position: new THREE.Vector3() },
      size.toArray(),
      centre.toArray(),
      { surfaceHeight: propSupportHeight(mesh) },
    );
    game.cameraSurfaces.capture(mesh, { small: true, thin: true });
  });
  mergeArchitecture(construction);
  mergeArchitecture(payload.children[0] || payload);
  payload.visible = !game.progress.found.includes(f.id);
  f.marker.visible = payload.visible;
}

export function buildDiscoveryProps(game) {
  const m = materials(game);
  for (const f of game.items) {
    if (!["note", "treasure"].includes(f.type)) continue;
    const p = discoveryPlacement(game, f);
    if (!p)
      throw new Error(`No clear discovery site: ${game.level.id}/${f.id}`);
    f.discovery = p;
    f.x = p.x / 7;
    f.z = p.z / 7;
    f.group.position.set(p.x, p.y, p.z);
    buildDiscoveryProp(game, f, m);
  }
}

export function discoveryReachable(game, feature, player) {
  if (Math.abs(player.y - feature.group.position.y) > 1.25) return false;
  return game.lineOfSight(
    new THREE.Vector3(player.x, player.y + 1.45, player.z),
    new THREE.Vector3(
      feature.group.position.x,
      feature.group.position.y + 1.45,
      feature.group.position.z,
    ),
    0,
    0,
  );
}
