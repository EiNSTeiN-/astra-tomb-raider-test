// Isolated development fixtures, not a campaign playthrough.
import * as THREE from "three";
import { updateFireVault } from "/src/fire-vault.js";

export function placeVaultObserver(game, x, z, height = 1.92) {
  const v = game.fireVault;
  game.player.position.set(v.x + x, v.y + height, v.z + z);
  Object.assign(game, {
    grounded: true,
    swimming: false,
    diving: false,
    velocityY: 0,
    jumpY: height,
    climb: null,
    dodge: null,
    airVelocity: null,
  });
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
}

export async function inspectVaultAudio(game) {
  const v = game.fireVault,
    audio = game.audio;
  game.setPaused(false);
  await audio.ctx.resume();
  await Promise.all(
    ["fire", "machine", "hoist", "drips"].map((k) => audio.loadBuffer(k)),
  );
  const mix = async () => {
    audio.lastSpatial = -Infinity;
    game.updateAudio();
    await new Promise((r) => setTimeout(r, 150));
    audio.lastSpatial = -Infinity;
    game.updateAudio();
    return audio.debug();
  };
  const fires = v.fires.map((f) => {
    const s = game.soundSources.find((s) => s.vaultFire === f.id);
    return {
      id: f.id,
      error: f.fire
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(s.x, s.y, s.z)),
    };
  });
  placeVaultObserver(game, 7.3, -15.35);
  const cold = await mix();
  game.interact();
  updateFireVault(game, 0.15);
  const moving = await mix();
  game.setPaused(true);
  const angle = v.rotors[1].angle;
  updateFireVault(game, 5);
  const paused = {
    before: angle,
    after: v.rotors[1].angle,
    activity: v.rotors[1].source.activity,
  };
  game.setPaused(false);
  for (let i = 0; i < 150; i++) updateFireVault(game, 1 / 60);
  const settled = await mix();
  v.saved.lit = [1, 3, 5];
  placeVaultObserver(game, -2.7, 26);
  updateFireVault(game, 0.15);
  const opening = await mix();
  for (let i = 0; i < 150; i++) updateFireVault(game, 1 / 60);
  const open = await mix();
  placeVaultObserver(game, 7.3, -15.35);
  const burning = await mix();
  game.setPaused(true);
  return { fires, cold, moving, paused, settled, opening, open, burning };
}

export function observeVaultDisposal(game) {
  const geometries = new Set(),
    materials = new Set(),
    disposed = { geometries: 0, materials: 0 };
  game.fireVault.root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const g of geometries)
    g.addEventListener("dispose", () => disposed.geometries++);
  for (const m of materials)
    m.addEventListener("dispose", () => disposed.materials++);
  return {
    expected: { geometries: geometries.size, materials: materials.size },
    disposed,
  };
}
