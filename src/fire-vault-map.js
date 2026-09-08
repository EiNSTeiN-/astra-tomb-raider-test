import { VAULT_CELLS, VAULT_FIRES, vaultPorts } from "./fire-vault-rules.js";
export function drawFireVaultMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    v = game.fireVault;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#12221f";
  c.fillRect(0, 0, w, h);
  const scale = Math.min((w - 24) / 48, (h - 20) / 70),
    ox = w / 2,
    oz = h / 2;
  const point = ([x, z]) => [ox + x * scale, oz + z * scale];
  c.fillStyle = "#284f4c";
  c.fillRect(ox - 20.7 * scale, oz - 23.5 * scale, 41.4 * scale, 47 * scale);
  c.strokeStyle = "#776a4b";
  c.lineWidth = 3;
  c.strokeRect(ox - 21.5 * scale, oz - 28 * scale, 43 * scale, 57 * scale);
  for (const edge of v.edges) {
    const a = point(edge.a),
      b = point(edge.b);
    c.strokeStyle = edge.open ? "#d8c491" : "#44534a";
    c.lineWidth = (edge.open ? 2.1 : 0.6) * scale;
    c.beginPath();
    c.moveTo(...a);
    c.lineTo(...b);
    c.stroke();
  }
  VAULT_CELLS.forEach((cell, i) => {
    const [x, y] = point(cell);
    c.fillStyle = "#b09c72";
    c.beginPath();
    c.arc(x, y, 1.8 * scale, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e9dbb9";
    c.lineWidth = Math.max(1, 0.4 * scale);
    for (const d of vaultPorts(v.saved.turns, i)) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(
        x + Math.sin((d * Math.PI) / 2) * 3.6 * scale,
        y - Math.cos((d * Math.PI) / 2) * 3.6 * scale,
      );
      c.stroke();
    }
    if (full) {
      c.fillStyle = "#f2e7ca";
      c.font = `${Math.max(10, scale * 1.5)}px sans-serif`;
      c.textAlign = "center";
      c.fillText(String(i + 1), x, y - 4 * scale);
    }
    if (VAULT_FIRES.includes(i)) {
      c.fillStyle = v.saved.lit.includes(i) ? "#ffb75d" : "#728f90";
      c.beginPath();
      c.arc(x + 2.6 * scale, y - 1.8 * scale, 1.1 * scale, 0, Math.PI * 2);
      c.fill();
    }
  });
  const [px, py] = point([
    game.player.position.x - v.x,
    game.player.position.z - v.z,
  ]);
  c.fillStyle = "#fff8d8";
  c.beginPath();
  c.arc(px, py, Math.max(2, 0.8 * scale), 0, Math.PI * 2);
  c.fill();
  const [rx, ry] = point([0, 31.3]);
  c.fillStyle = v.saved.recovered ? "#87bba3" : "#afc4c7";
  c.fillRect(rx - 2, ry - 2, 4, 4);
}
