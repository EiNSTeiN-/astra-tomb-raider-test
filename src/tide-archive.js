import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import {
  archiveBubbleMaterial,
  createArchiveBubbles,
  updateArchiveBubbles,
} from "./archive-bubbles.js";

import { TIDE_ARCHIVE } from "./tide-archive-records.js";
import { stationSolid } from "./field-station-solids.js";

export function archiveProgress(game) {
  return TIDE_ARCHIVE.filter((record) =>
    game.progress.archive?.includes(record.id),
  );
}

export function buildTideArchive(game) {
  game.tideArchive = [];
  if (game.level.biome !== "water") return;
  game.progress.archive ??= [];
  game.obstacles ??= [];
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x7a9a89,
    metalness: 0.62,
    roughness: 0.56,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd9bf7c,
    metalness: 0.58,
    roughness: 0.32,
    emissive: 0x51411a,
    emissiveIntensity: 0.14,
  });
  const bubbleMaterial = archiveBubbleMaterial();
  const wells = game.waterMeshes.filter((w) =>
    w.userData.id?.startsWith("reservoir-"),
  );
  for (const [index, water] of wells.entries()) {
    const record = TIDE_ARCHIVE[index];
    const x = water.position.x,
      z = water.position.z;
    const base = game.groundHeight(x, z);
    const root = new THREE.Group();
    root.name = `Tidekeeper archive · ${record.well}`;
    root.position.set(x, base, z);
    game.world.add(root);
    const add = (geometry, material, px, py, pz, parent = root) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // A stepped survey bench and banded sealed case. Open approaches on all four
    // sides leave a vertical escape path, even after the reservoir is drained.
    add(stoneBlockGeometry(2.2, 0.24, 1.65, 0.04), game.stoneMat, 0, 0.1, 0);
    add(stoneBlockGeometry(1.65, 0.2, 1.1, 0.035), game.stoneMat, 0, 0.31, 0);
    const caseMesh = add(
      new THREE.CylinderGeometry(0.32, 0.32, 1.22, 20),
      bronze,
      0,
      0.75,
      0,
    );
    caseMesh.rotation.z = Math.PI / 2;
    game.cameraSurfaces?.capture(caseMesh);
    for (const px of [-0.53, 0.53]) {
      const band = add(
        new THREE.TorusGeometry(0.327, 0.035, 6, 24),
        gold,
        px,
        0.75,
        0,
      );
      band.rotation.y = Math.PI / 2;
    }
    const tablet = new THREE.Group();
    root.add(tablet);
    add(stoneBlockGeometry(1.02, 0.055, 0.44, 0.014), gold, 0, 1.08, 0, tablet);
    // Carved concentric soundings distinguish each recovered piece without text
    // textures or a glowing pickup column obscuring the submerged architecture.
    for (let ring = 0; ring <= index; ring++) {
      const mesh = add(
        new THREE.TorusGeometry(0.07 + ring * 0.021, 0.007, 4, 24),
        bronze,
        0,
        1.112,
        0,
        tablet,
      );
      mesh.rotation.x = Math.PI / 2;
    }
    root.remove(tablet);
    mergeArchitecture(root);
    root.add(tablet);
    game.obstacles?.push({ x, z, w: 1.1, d: 0.82, h: 1.12, climbable: false });
    const bubbles = createArchiveBubbles(bubbleMaterial);
    game.world.add(bubbles);
    const buoy = new THREE.Group();
    buoy.name = `${record.well} sounding float`;
    // Keep the sounding marker beside the dive/bubble axis, where it cannot
    // occupy the head and backpack of a resurfacing explorer.
    buoy.position.set(
      x,
      water.position.y,
      z + Math.min(3, water.userData.length / 4),
    );
    buoy.userData.cameraDynamic = true;
    const floatRing = add(
      new THREE.TorusGeometry(0.46, 0.1, 8, 28),
      bronze,
      0,
      0.08,
      0,
      buoy,
    );
    floatRing.rotation.x = Math.PI / 2;
    game.cameraSurfaces?.capture(floatRing, { small: true, cylinderAxis: "z" });
    const staff = add(
      new THREE.CylinderGeometry(0.045, 0.06, 1.1, 8),
      gold,
      0,
      0.62,
      0,
      buoy,
    );
    game.cameraSurfaces?.capture(staff, {
      small: true,
      thin: true,
      cylinderAxis: "y",
    });
    for (let mark = 0; mark <= index; mark++) {
      const collar = add(
        new THREE.TorusGeometry(0.11, 0.025, 5, 16),
        gold,
        0,
        0.48 + mark * 0.12,
        0,
        buoy,
      );
      collar.rotation.x = Math.PI / 2;
      game.cameraSurfaces?.capture(collar, {
        small: true,
        thin: true,
        cylinderAxis: "z",
      });
    }
    game.world.add(buoy);
    const floatFeature = { id: `archive-float-${record.id}` },
      floatSolids = [
        stationSolid(
          game,
          floatFeature,
          buoy,
          [1.12, 0.2, 1.12],
          [0, 0.08, 0],
          { radius: 0.56, bodyPadding: 0.35, support: false, node: buoy },
        ),
        stationSolid(
          game,
          floatFeature,
          buoy,
          [0.27, 1.1, 0.27],
          [0, 0.62, 0],
          { radius: 0.135, bodyPadding: 0.35, support: false, node: buoy },
        ),
      ];
    const source = {
      id: `archive-bubbles-${index}`,
      kind: "bubbles",
      x,
      y: base + 1.1,
      z,
      activity: 1,
    };
    game.soundSources.push(source);
    game.tideArchive.push({
      record,
      root,
      tablet,
      bubbles,
      buoy,
      floatSolids,
      source,
      water,
      position: new THREE.Vector3(x, base + 1.3, z),
    });
  }
  updateTideArchive(game);
}

export function updateTideArchive(game) {
  for (const site of game.tideArchive || []) {
    const found = game.progress.archive?.includes(site.record.id);
    site.tablet.visible = !found;
    const y = site.water.position.y + Math.sin(game.elapsed * 1.1) * 0.025,
      delta = y - site.buoy.position.y;
    site.buoy.position.y = y;
    for (const solid of site.floatSolids) {
      solid.bounds.min.y += delta;
      solid.bounds.max.y += delta;
      solid.h += delta;
    }
    site.buoy.visible = !found;
    site.source.activity = found ? 0 : 1;
    site.bubbles.visible =
      !found &&
      site.position.distanceTo(game.player?.position || site.position) < 50;
    updateArchiveBubbles(site, game.elapsed);
  }
}

export function nearbyArchive(game) {
  if (!game.diving) return null;
  return (
    game.tideArchive?.find(
      (site) =>
        !game.progress.archive?.includes(site.record.id) &&
        site.position.distanceTo(game.player.position) < 1.65,
    ) || null
  );
}

export function archiveInteract(game) {
  const site = nearbyArchive(game);
  if (!site) return false;
  game.progress.archive.push(site.record.id);
  const count = archiveProgress(game).length;
  game.audio.tone(count === 5 ? "solve" : "collect");
  game.cb.toast?.(
    `${site.record.title} · Tidekeeper's atlas ${count} / 5. Saved to your journal; surface to read.`,
    5000,
  );
  updateTideArchive(game);
  game.save();
  game.cb.update?.(game.state());
  return true;
}

export function archiveHint(game) {
  const near = nearbyArchive(game);
  if (near) return { key: "E", label: `Recover ${near.record.title}` };
  if (
    game.level.biome !== "water" ||
    game.diving ||
    game.carrying ||
    game.diveAir < 10
  )
    return null;
  const site = game.tideArchive?.find(
    (s) =>
      !game.progress.archive?.includes(s.record.id) &&
      Math.hypot(
        s.position.x - game.player.position.x,
        s.position.z - game.player.position.z,
      ) < 9,
  );
  return site
    ? {
        key: "X",
        label: `${site.record.well} · Dive beside the bronze float; follow the bubbles`,
      }
    : null;
}
