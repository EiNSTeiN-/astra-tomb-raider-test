import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";

import { TIDE_ARCHIVE } from "./tide-archive-records.js";

export function archiveProgress(game) {
  return TIDE_ARCHIVE.filter((record) =>
    game.progress.archive?.includes(record.id),
  );
}

export function buildTideArchive(game) {
  game.tideArchive = [];
  if (game.level.biome !== "water") return;
  game.progress.archive ??= [];
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
  const bubbleMaterial = new THREE.MeshBasicMaterial({
    color: 0xbbdfe1,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const bubbleGeometry = new THREE.SphereGeometry(0.035, 6, 4);
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
    const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, 20);
    bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bubbles.frustumCulled = false;
    game.world.add(bubbles);
    const buoy = new THREE.Group();
    buoy.position.set(x, water.position.y, z);
    add(
      new THREE.TorusGeometry(0.46, 0.1, 8, 28),
      bronze,
      0,
      0.08,
      0,
      buoy,
    ).rotation.x = Math.PI / 2;
    add(
      new THREE.CylinderGeometry(0.045, 0.06, 1.1, 8),
      gold,
      0,
      0.62,
      0,
      buoy,
    );
    for (let mark = 0; mark <= index; mark++)
      add(
        new THREE.TorusGeometry(0.11, 0.025, 5, 16),
        gold,
        0,
        0.48 + mark * 0.12,
        0,
        buoy,
      ).rotation.x = Math.PI / 2;
    game.world.add(buoy);
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
      source,
      water,
      position: new THREE.Vector3(x, base + 1.3, z),
    });
  }
  updateTideArchive(game);
}

export function updateTideArchive(game) {
  const matrix = new THREE.Matrix4();
  for (const site of game.tideArchive || []) {
    const found = game.progress.archive?.includes(site.record.id);
    site.tablet.visible = !found;
    site.buoy.position.y =
      site.water.position.y + Math.sin(game.elapsed * 1.1) * 0.025;
    site.buoy.visible = !found;
    site.source.activity = found ? 0 : 1;
    site.bubbles.visible =
      !found &&
      site.position.distanceTo(game.player?.position || site.position) < 50;
    for (let i = 0; i < 20; i++) {
      const height = Math.max(0, site.water.position.y - site.source.y);
      const t = (game.elapsed * 0.24 + i / 20) % 1;
      const scale = 0.6 + t * 1.3;
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(
        site.source.x + Math.sin(i * 17 + t * 4) * 0.22,
        site.source.y + t * height,
        site.source.z + Math.cos(i * 11 + t * 3) * 0.22,
      );
      site.bubbles.setMatrixAt(i, matrix);
    }
    site.bubbles.instanceMatrix.needsUpdate = true;
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
        label: `${site.record.well} · Dive beneath the bronze float; follow the bubbles`,
      }
    : null;
}
