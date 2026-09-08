// Development-only assisted movement checks. Use disposable progress and stop
// the animation loop. Callers supply native E/T/Space input between these legs.
import { updateFireVault, fireVaultControl } from "/src/fire-vault.js";
import { updateTorch } from "/src/torch.js";
import { VAULT_CELLS } from "/src/fire-vault-rules.js";

export function vaultTick(game, count = 1) {
  for (let i = 0; i < count; i++) {
    game.elapsed += 1 / 60;
    game.updatePlayer(1 / 60);
    updateFireVault(game, 1 / 60);
    updateTorch(game);
  }
}

export function vaultPosition(game) {
  const p = game.player.position,
    v = game.fireVault;
  return {
    local: [p.x - v.x, p.y - v.y, p.z - v.z],
    swimming: game.swimming,
    grounded: game.grounded,
    torch: game.progress.torch,
    health: game.health,
    control: fireVaultControl(game)?.kind,
    index: fireVaultControl(game)?.index,
  };
}

export async function vaultMove(
  game,
  points,
  { dry = false, flame = false } = {},
) {
  const v = game.fireVault,
    start = game.elapsed;
  game.yaw = 0;
  let swam = false;
  for (const [x, z] of points) {
    let reached = false;
    for (let frame = 0; frame < 1800; frame++) {
      const dx = v.x + x - game.player.position.x,
        dz = v.z + z - game.player.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.08) {
        reached = true;
        break;
      }
      const strength = Math.min(0.66, d * 4);
      game.touchMove = { x: (dx / d) * strength, z: (dz / d) * strength };
      vaultTick(game);
      swam ||= game.swimming;
      if (dry && (game.swimming || game.player.position.y < v.y + 1.87))
        throw new Error(
          `Left dry crossing to ${x},${z}: ${JSON.stringify(vaultPosition(game))}`,
        );
      if (flame && !game.progress.torch) throw new Error("Lost carried flame");
      if (frame % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reached)
      throw new Error(
        `Blocked to ${x},${z}: ${JSON.stringify(vaultPosition(game))}`,
      );
  }
  game.touchMove = { x: 0, z: 0 };
  vaultTick(game, 2);
  return {
    ...vaultPosition(game),
    swam,
    simulatedSeconds: game.elapsed - start,
  };
}

export async function vaultSwimToHub(game, index) {
  const [x, z] = VAULT_CELLS[index];
  // Approach a corner so raised bridge leaves do not mask the ledge.
  const side = x < 0 ? -1 : 1;
  const report = await vaultMove(game, [
    [side * 14, z + 4],
    [x + side * 2.8, z + 2.8],
  ]);
  if (!game.swimming) throw new Error(`Expected swimming at hub ${index + 1}`);
  game.yaw = 0;
  game.touchMove = { x: -side * 0.7, z: -0.7 };
  return report;
}

export async function vaultLeaveHub(game, index) {
  const [x, z] = VAULT_CELLS[index],
    side = x < 0 ? -1 : 1;
  return vaultMove(game, [
    [x + side * 3, z + 3],
    [side * 14, z + 4],
  ]);
}
