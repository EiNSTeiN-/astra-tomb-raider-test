import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { windMetal, windSurface } from "./wind-art.js";
import { softParticleMaterial } from "./effects.js";
import {
  buildGalleryMachinery,
  updateGalleryMachinery,
} from "./gallery-machinery.js";
import {
  galleryAt,
  gallerySection,
  galleryBellAt,
} from "./sunken-gallery-layout.js";
import { normalizeGallery, GALLERY_RECORD } from "./sunken-gallery-record.js";

function interiorShell(profile) {
  const step = 0.5,
    cells = new Map();
  for (let ix = -72; ix < 0; ix++)
    for (let iz = -6; iz < 108; iz++) {
      const x = profile.origin.x + (ix + 0.5) * step,
        z = profile.origin.z + (iz + 0.5) * step;
      const section = gallerySection(profile, x, z);
      if (section) cells.set(`${ix},${iz}`, { ...section, x, z, ix, iz });
    }
  const positions = [],
    uvs = [];
  const quad = (a, b, c, d, wall = false) => {
    for (const point of [a, b, d, b, c, d]) {
      positions.push(...point);
      uvs.push(
        (wall ? (a[0] === b[0] ? point[2] : point[0]) : point[0]) / 2.7,
        (wall ? point[1] : point[2]) / 2.7,
      );
    }
  };
  for (const cell of cells.values()) {
    const { x, z, floor, ceiling, ix, iz } = cell,
      d = step / 2;
    quad(
      [x - d, floor, z - d],
      [x - d, floor, z + d],
      [x + d, floor, z + d],
      [x + d, floor, z - d],
    );
    quad(
      [x - d, ceiling, z - d],
      [x + d, ceiling, z - d],
      [x + d, ceiling, z + d],
      [x - d, ceiling, z + d],
    );
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = cells.get(`${ix + dx},${iz + dz}`);
      // The eastern end opens into the harbor well through the cut bank.
      if (
        !next &&
        dx === 1 &&
        ix === -5 &&
        Math.abs(z - profile.origin.z) < 2.5
      )
        continue;
      const bands = !next
        ? [[floor, ceiling]]
        : [
            [floor, Math.min(ceiling, next.floor)],
            [Math.max(floor, next.ceiling), ceiling],
          ];
      for (const [lo, hi] of bands) {
        if (hi - lo < 0.001) continue;
        if (dx === 1)
          quad(
            [x + d, lo, z - d],
            [x + d, lo, z + d],
            [x + d, hi, z + d],
            [x + d, hi, z - d],
            true,
          );
        if (dx === -1)
          quad(
            [x - d, lo, z + d],
            [x - d, lo, z - d],
            [x - d, hi, z - d],
            [x - d, hi, z + d],
            true,
          );
        if (dz === 1)
          quad(
            [x + d, lo, z + d],
            [x - d, lo, z + d],
            [x - d, hi, z + d],
            [x + d, hi, z + d],
            true,
          );
        if (dz === -1)
          quad(
            [x - d, lo, z - d],
            [x + d, lo, z - d],
            [x + d, hi, z - d],
            [x - d, hi, z - d],
            true,
          );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSunkenGallery(game) {
  game.sunkenGallery = null;
  const profile = game.terrainProfile.gallery;
  if (!profile) return;
  game.progress.gallery = normalizeGallery(game.progress.gallery);
  const root = new THREE.Group();
  root.name = "Submerged memorial gallery";
  game.world.add(root);
  const gallery = (game.sunkenGallery = {
    root,
    profile,
    solids: [],
    gates: [],
    waterById: new Map(),
    sources: [],
    lights: [],
    outsideWater: [],
    drips: [],
    lift: game.progress.gallery.opened ? 1 : 0,
  });
  gallery.well = game.waterMeshes.find((w) => w.userData.id === "reservoir-1");
  const bronze = windMetal("cast");
  bronze.name = "Patinated air-bell bronze";
  bronze.side = THREE.DoubleSide;
  const trim = windMetal("worn");
  trim.name = "Worn gallery bronze";
  const glass = new THREE.MeshStandardMaterial({
    color: 0x86c9b6,
    emissive: 0x5ebbae,
    emissiveIntensity: 0.3,
    roughness: 0.26,
  });
  const add = (geometry, material, x, y, z, parent = root) => {
    if (material.userData.windMetal) windSurface(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const block = (
    x,
    y,
    z,
    w,
    h,
    d,
    material = game.stoneMat,
    solid = false,
    parent = root,
  ) => {
    const mesh = add(
      stoneBlockGeometry(w, h, d, Math.min(0.07, w * 0.1, h * 0.1, d * 0.1)),
      material,
      x,
      y,
      z,
      parent,
    );
    if (solid)
      gallery.solids.push({
        min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
        max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
      });
    return mesh;
  };
  add(interiorShell(profile), game.darkMat, 0, 0, 0);
  const o = profile.origin;
  // Entry piers, a continuous bronze survey line, and the colonnade's surviving
  // lintels give the route a readable direction even when the view is submerged.
  for (const side of [-1, 1])
    block(
      o.x - 3,
      o.y - 4,
      o.z + side * 2.22,
      0.62,
      3.8,
      0.48,
      game.stoneMat,
      true,
    );
  block(o.x - 3, o.y - 2.22, o.z, 0.8, 0.42, 4.8);
  add(new THREE.SphereGeometry(0.14, 12, 8), glass, o.x - 3.35, o.y - 2.5, o.z);
  const entranceLight = new THREE.PointLight(0x94c7b8, 8, 12, 2);
  entranceLight.position.set(o.x - 3.35, o.y - 2.75, o.z);
  root.add(entranceLight);
  gallery.lights.push(entranceLight);
  for (const [x, z, w, d, y] of [
    [-16, 0, 24, 0.09, -5.94],
    [-29, 6, 0.09, 12, -5.94],
    [-29, 25, 0.09, 20, -7.44],
    [-19, 34, 23, 0.09, -7.44],
    [-8, 44, 0.09, 16, -8.44],
  ])
    block(o.x + x, o.y + y, o.z + z, w, 0.035, d, trim);
  for (const z of [18, 23, 28, 33])
    for (const side of [-1, 1]) {
      const x = o.x - 29 + side * 2.55,
        pz = o.z + z;
      block(x, o.y - 7.2, pz, 1.05, 0.6, 1.05, game.stoneMat, true);
      add(
        new THREE.CylinderGeometry(0.32, 0.43, 3.5, 12),
        game.stoneMat,
        x,
        o.y - 5.15,
        pz,
      );
      gallery.solids.push({
        min: { x: x - 0.44, y: o.y - 7.5, z: pz - 0.44 },
        max: { x: x + 0.44, y: o.y - 3.4, z: pz + 0.44 },
      });
      block(x, o.y - 3.25, pz, 1.15, 0.3, 1.15);
    }
  for (const z of [18, 28, 33])
    block(o.x - 29, o.y - 2.87, o.z + z, 6.4, 0.45, 1.15);
  // Alternating high and low openings in a collapse require vertical swimming.
  block(o.x - 30.2, o.y - 6.35, o.z + 22, 4.1, 2.3, 1.2, game.stoneMat, true);
  block(o.x - 27.8, o.y - 3.5, o.z + 27, 4.1, 2, 1.15, game.stoneMat, true);
  for (const [index, bell] of profile.bells.entries()) {
    const wallTop = bell.ceiling,
      height = wallTop - bell.rim;
    const shell = add(
      new THREE.CylinderGeometry(bell.radius, bell.radius, height, 48, 1, true),
      bronze,
      bell.x,
      bell.rim + height / 2,
      bell.z,
    );
    shell.name = `Air bell ${index + 1} hollow skirt`;
    add(
      new THREE.CylinderGeometry(
        bell.radius + 0.08,
        bell.radius + 0.08,
        0.2,
        48,
      ),
      bronze,
      bell.x,
      bell.ceiling + 0.1,
      bell.z,
    );
    for (const y of [bell.rim + 0.08, bell.ceiling - 0.12, bell.y + 0.15]) {
      const band = add(
        new THREE.TorusGeometry(bell.radius + 0.02, 0.065, 6, 48),
        trim,
        bell.x,
        y,
        bell.z,
      );
      band.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      add(
        new THREE.CylinderGeometry(0.035, 0.035, height - 0.2, 6),
        trim,
        bell.x + Math.cos(angle) * (bell.radius - 0.035),
        bell.rim + height / 2,
        bell.z + Math.sin(angle) * (bell.radius - 0.035),
      );
      add(
        new THREE.SphereGeometry(0.065, 6, 4),
        trim,
        bell.x + Math.cos(angle) * (bell.radius + 0.035),
        bell.ceiling - 0.22,
        bell.z + Math.sin(angle) * (bell.radius + 0.035),
      );
    }
    const water = add(
      new THREE.CircleGeometry(bell.radius - 0.08, 48),
      new THREE.MeshStandardMaterial({
        color: 0x4a8f8b,
        transparent: true,
        opacity: 0.52,
        metalness: 0.3,
        roughness: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      bell.x,
      bell.y,
      bell.z,
    );
    water.rotation.x = -Math.PI / 2;
    water.userData = {
      kind: "gallery-water",
      width: bell.radius * 2,
      length: bell.radius * 2,
    };
    gallery.waterById.set(bell.id, water);
    const lens = add(
      new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24),
      glass,
      bell.x,
      bell.ceiling - 0.05,
      bell.z,
    );
    lens.name = "Phosphor glass lamp";
    const light = new THREE.PointLight(0x94d9c5, 9, 16, 2);
    light.position.set(bell.x, bell.ceiling - 0.3, bell.z);
    root.add(light);
    gallery.lights.push(light);
    const shape = new THREE.Shape();
    shape.moveTo(-6, -5);
    shape.lineTo(6, -5);
    shape.lineTo(6, 5);
    shape.lineTo(-6, 5);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, bell.radius + 0.05, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const outside = add(
      new THREE.ShapeGeometry(shape, 32),
      water.material,
      bell.x,
      gallery.well.position.y,
      bell.z,
    );
    outside.rotation.x = -Math.PI / 2;
    gallery.outsideWater.push({ mesh: outside, bell });
    const source = {
      id: `gallery-${bell.id}`,
      kind: "drips",
      x: bell.x,
      y: bell.y + 0.2,
      z: bell.z,
      near: 1.2,
      range: 18,
      gain: 0.2,
    };
    gallery.sources.push(source);
    game.soundSources.push(source);
    const dropGeometry = new THREE.BufferGeometry();
    dropGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(18), 3),
    );
    const drops = new THREE.Points(
      dropGeometry,
      softParticleMaterial({
        color: 0xb6d8d9,
        size: 0.055,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    drops.frustumCulled = false;
    root.add(drops);
    gallery.drips.push({ drops, bell });
    // A pierced receiver beneath each bell makes its air reservoir visible on approach.
    for (const side of [-1, 1])
      block(bell.x + side * 2.1, o.y - 5.4, bell.z, 0.22, 0.5, 0.22, trim);
  }
  buildGalleryMachinery(game, { add, block, bronze, trim });
  const record = new THREE.Group();
  record.position.copy(profile.record);
  root.add(record);
  gallery.record = record;
  block(
    profile.record.x,
    profile.record.y - 0.6,
    profile.record.z,
    2.2,
    1.1,
    1.2,
    game.stoneMat,
    true,
  );
  add(
    new THREE.CylinderGeometry(0.17, 0.17, 1.25, 20),
    trim,
    0,
    0,
    0,
    record,
  ).rotation.z = Math.PI / 2;
  for (const x of [-0.48, 0.48])
    add(
      new THREE.TorusGeometry(0.18, 0.026, 6, 20),
      bronze,
      x,
      0,
      0,
      record,
    ).rotation.y = Math.PI / 2;
  // A fan of votive plaques surrounds the preserved copper roll.
  for (let i = 0; i < 9; i++)
    block(
      o.x - 13 + i * 1.25,
      o.y - 5.8,
      o.z + 52.65,
      0.92,
      2.1,
      0.12,
      game.stoneMat,
    );
  const memorialLight = new THREE.PointLight(0x88baba, 24, 14, 2);
  memorialLight.position.set(o.x - 8, o.y - 3.1, o.z + 49);
  root.add(memorialLight);
  gallery.lights.push(memorialLight);
  add(
    new THREE.SphereGeometry(0.22, 12, 8),
    glass,
    o.x - 8,
    o.y - 2.8,
    o.z + 49,
  );
  mergeArchitecture(root);
  updateSunkenGallery(game, 0, false);
}

export function updateSunkenGallery(game, dt, observePlayer = true) {
  const gallery = game.sunkenGallery;
  if (!gallery) return;
  updateGalleryMachinery(game, dt);
  gallery.record.visible = !game.progress.gallery.recovered;
  for (const { mesh, bell } of gallery.outsideWater) {
    mesh.position.y = gallery.well.position.y;
    mesh.visible = mesh.position.y < bell.ceiling - 0.08;
  }
  for (const { drops, bell } of gallery.drips) {
    const positions = drops.geometry.attributes.position;
    for (let i = 0; i < 6; i++) {
      const phase = (game.elapsed * 0.55 + i / 6) % 1;
      positions.setXYZ(
        i,
        bell.x + Math.cos(i * 2.4) * 0.3,
        bell.ceiling - 0.2 - (bell.ceiling - 0.2 - bell.y) * phase * phase,
        bell.z + Math.sin(i * 2.4) * 0.3,
      );
    }
    positions.needsUpdate = true;
  }
  if (!observePlayer || !game.player) return;
  const p = game.player.position,
    inside = galleryAt(game, p.x, p.y, p.z);
  if (inside) {
    for (const volume of gallery.profile.volumes)
      if (
        p.x >= volume.min.x &&
        p.x <= volume.max.x &&
        p.z >= volume.min.z &&
        p.z <= volume.max.z &&
        !game.progress.gallery.visited.includes(volume.id)
      )
        game.progress.gallery.visited.push(volume.id);
    const bell = galleryBellAt(game, p.x, p.z);
    if (
      bell &&
      !game.diving &&
      p.y >= bell.y - 0.45 &&
      game.progress.gallery.rest !== bell.id
    ) {
      game.progress.gallery.rest = bell.id;
      game.cb.toast?.(
        "Air bell · catch your breath. Your next reload returns here.",
        4500,
      );
      game.save();
    }
  }
  for (const light of gallery.lights)
    light.visible = inside || p.distanceTo(light.position) < 22;
  if (game.playerLight) {
    game.playerLight.intensity = inside ? 4.5 : 0.45;
    game.playerLight.position.y = inside ? 0.65 : 2;
  }
}

export function galleryHint(game) {
  const gallery = game.sunkenGallery,
    p = game.player?.position;
  if (!gallery || !p) return null;
  const inside = galleryAt(game, p.x, p.y, p.z);
  if (!inside) return null;
  if (
    !game.progress.gallery.opened &&
    p.distanceTo(new THREE.Vector3().copy(gallery.profile.wheel)) < 2.1
  )
    return {
      key: "E",
      label: "Turn the emergency wheel · open the memorial and return passage",
    };
  if (
    game.progress.gallery.opened &&
    !game.progress.gallery.recovered &&
    p.distanceTo(new THREE.Vector3().copy(gallery.profile.record)) < 2.2
  )
    return {
      key: "E",
      label: "Recover the copper roll · The names of the living",
    };
  const bell = galleryBellAt(game, p.x, p.z);
  if (bell && !game.diving)
    return {
      key: "X",
      label: "Air bell · breathe here; dive below the bronze skirt to leave",
    };
  return {
    key: "X / Space",
    label:
      game.diveAir < 10
        ? "Air running low · return to an air bell"
        : "Follow the bronze survey line · swim under an air bell and rise to breathe",
  };
}

export function galleryInteract(game) {
  const gallery = game.sunkenGallery,
    p = game.player.position;
  if (!gallery || !galleryAt(game, p.x, p.y, p.z)) return false;
  const hint = galleryHint(game);
  if (hint?.key !== "E") return true;
  if (!game.progress.gallery.opened) {
    game.progress.gallery.opened = true;
    game.audio.tone("switch");
    game.cb.toast?.(
      "The emergency wheel releases both gates. The memorial and the return passage are opening.",
      5000,
    );
  } else {
    game.progress.gallery.recovered = true;
    game.audio.tone("solve");
    game.cb.toast?.(
      `${GALLERY_RECORD.title} · Saved to your journal. Return through the eastern passage.`,
      5000,
    );
  }
  game.save();
  game.cb.update?.(game.state());
  return true;
}

export function galleryObjective(game) {
  const p = game.player?.position;
  if (!p || !galleryAt(game, p.x, p.y, p.z)) return null;
  return game.progress.gallery.recovered
    ? "Return to the harbor through the eastern passage"
    : game.progress.gallery.opened
      ? "Recover the memorial's copper roll"
      : "Find the emergency wheel beyond the collapsed colonnade";
}

export function restoreGalleryArrival(game) {
  const gallery = game.sunkenGallery;
  if (!gallery || !game.progress.gallery.resume) return;
  const bell = gallery.profile.bells.find(
    (b) => b.id === game.progress.gallery.rest,
  );
  const location = bell || {
    x: gallery.profile.origin.x,
    z: gallery.profile.origin.z + 1.4,
    y: gallery.well.position.y,
  };
  game.player.position.set(location.x, location.y - 0.38, location.z);
  game.swimming = true;
  game.diving = false;
  game.grounded = false;
  game.jumpY = 0;
  game.velocityY = 0;
}

export function captureGallery(game) {
  if (!game.sunkenGallery) return;
  const p = game.player.position;
  game.progress.gallery.resume = !!galleryAt(game, p.x, p.y, p.z);
}
