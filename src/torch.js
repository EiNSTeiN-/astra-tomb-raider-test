import * as THREE from "three";
import { poseCylinderGrip } from "./hand-grip.js";
import { carryingComponent, currentFieldTask } from "./expeditions.js";

export function needsCarriedFlame(level, feature) {
  return level.id === "verdant" && feature?.kind === "brazier";
}

export function torchHandsBusy(game) {
  return !!(
    game.blockGrip ||
    game.fireVault?.operation ||
    game.pressureRelay?.operation ||
    game.orbitVault?.operation ||
    game.climb ||
    game.ropeRide ||
    game.zipRide ||
    game.dodge ||
    carryingComponent(game.level, game.progress) ||
    game.aimUntil > game.elapsed
  );
}

// Use the source's real flame position. Cold braziers and fires beyond a wall
// cannot ignite a torch merely because their map coordinates are close.
export function torchFireSource(game) {
  if (game.level.id !== "verdant" || !game.player) return null;
  let nearest = null,
    distance = 3;
  for (const f of [...game.items, ...(game.fireVault?.fires || [])]) {
    const lit =
      f.type === "camp" ||
      (f.type === "vault-fire" &&
        game.progress.fireVault?.lit.includes(f.id)) ||
      (f.type === "field" &&
        f.kind === "brazier" &&
        (f.stage < game.progress.stage || game.progress.field.includes(f.id)));
    if (!lit || !f.fire) continue;
    const p = f.fire.getWorldPosition(new THREE.Vector3());
    const hand = game.player.position
      .clone()
      .add(new THREE.Vector3(0, 1.25, 0));
    const d = hand.distanceTo(p);
    if (d >= distance) continue;
    if (
      game.lineOfSight &&
      !game.lineOfSight(
        game.player.position,
        p.clone().add(new THREE.Vector3(0, -1.4, 0)),
      )
    )
      continue;
    nearest = f;
    distance = d;
  }
  return nearest;
}

export function extinguishTorch(game, message) {
  if (!game.progress.torch) return false;
  game.progress.torch = false;
  if (game.torch) {
    game.torch.root.visible = game.torch.flame.visible = false;
    game.torch.source.activity = 0;
  }
  if (message) game.cb.toast?.(message, 4500);
  game.save();
  return true;
}

export function useTorch(game) {
  if (game.level.id !== "verdant" || game.paused || game.health <= 0)
    return false;
  if (game.progress.torch)
    return extinguishTorch(
      game,
      "Torch put out · relight it at a camp or a burning brazier.",
    );
  if (!game.grounded || game.swimming || game.diving || torchHandsBusy(game)) {
    game.cb.toast?.("Stand on dry ground with free hands to light your torch.");
    return false;
  }
  if (!torchFireSource(game)) {
    game.cb.toast?.(
      "Bring your torch close to a campfire or a burning brazier, then press T / Torch.",
      5000,
    );
    return false;
  }
  game.progress.torch = true;
  game.cb.toast?.(
    "Torch lit · carry its flame to the braziers. Swimming and actions needing both hands put it out.",
    6500,
  );
  game.audio.tone("field");
  updateTorch(game);
  game.save();
  game.renderOnce = true;
  game.cb.update?.(game.state());
  return true;
}

export function torchHint(game) {
  if (game.level.id !== "verdant" || game.swimming || torchHandsBusy(game))
    return null;
  if (game.progress.torch && needsCarriedFlame(game.level, game.nearest))
    return { key: "E", label: `Pass the flame · ${game.nearest.label}` };
  if (!game.progress.torch && torchFireSource(game))
    return { key: "T / Torch", label: "Light your torch from this fire" };
  if (
    !game.progress.torch &&
    needsCarriedFlame(game.level, currentFieldTask(game.level, game.progress))
  )
    return {
      key: "T / Torch",
      label: "Bring fire from a camp or a lit brazier · swimming puts it out",
    };
  return null;
}

export function buildTorch(game) {
  game.torch = null;
  if (game.level.id !== "verdant") return;
  const root = new THREE.Group();
  root.name = "Carried resin torch";
  root.userData.actor = true;
  root.visible = false;
  game.world.add(root);
  const wood = new THREE.MeshStandardMaterial({
    color: 0x55412b,
    roughness: 0.95,
  });
  const wrap = new THREE.MeshStandardMaterial({
    color: 0xaaa082,
    roughness: 0.98,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x726348,
    metalness: 0.68,
    roughness: 0.68,
  });
  const part = (geometry, material, y) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // The shaft matches the existing 38 mm hand-grip calibration.
  part(new THREE.CylinderGeometry(0.019, 0.019, 0.68, 16), wood, 0.02);
  part(new THREE.CylinderGeometry(0.054, 0.035, 0.16, 14), wrap, 0.36);
  for (const y of [-0.25, 0.27, 0.3, 0.41])
    part(
      new THREE.CylinderGeometry(
        y < 0.3 ? 0.025 : 0.055,
        y < 0.3 ? 0.025 : 0.055,
        0.018,
        16,
      ),
      metal,
      y,
    );
  const flame = part(
    new THREE.ConeGeometry(0.085, 0.43, 7),
    new THREE.MeshBasicMaterial({ color: 0xffb45b }),
    0.61,
  );
  flame.visible = false;
  flame.userData.fireIntensity = 2.8;
  flame.userData.fireRange = 7;
  game.flames.push(flame);
  const source = {
    id: "carried-torch",
    kind: "fire",
    x: 0,
    y: 0,
    z: 0,
    near: 0.5,
    range: 9,
    gain: 0.09,
    activity: 0,
  };
  game.soundSources.push(source);
  game.torch = { root, flame, source };
}

export function updateTorch(game) {
  if (!game.torch) return;
  if (game.progress.torch && (game.swimming || game.diving))
    extinguishTorch(
      game,
      "The water put out your torch. Relight it at a camp or a burning brazier.",
    );
  else if (game.progress.torch && (torchHandsBusy(game) || game.health <= 0))
    extinguishTorch(
      game,
      "Torch put out to free both hands · relight it at a fire when ready.",
    );
  const { root, flame, source } = game.torch;
  root.visible = flame.visible = game.progress.torch === true;
  source.activity = game.progress.torch && !game.paused ? 1 : 0;
  if (!game.progress.torch || !game.player || !game.avatar) return;
  const rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion());
  const grip = new THREE.Vector3(0.44, 1.28, 0.3)
    .applyQuaternion(rotation)
    .add(game.player.position);
  root.position.copy(grip);
  root.quaternion.copy(rotation);
  root.updateWorldMatrix(true, true);
  const p = flame.getWorldPosition(new THREE.Vector3());
  Object.assign(source, { x: p.x, y: p.y, z: p.z });
}

export function poseTorch(game) {
  if (!game.torch || !game.progress.torch) return;
  updateTorch(game);
  if (!game.progress.torch) return;
  const rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion());
  poseCylinderGrip(
    game,
    [game.torch.root.position, null],
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
  );
}
