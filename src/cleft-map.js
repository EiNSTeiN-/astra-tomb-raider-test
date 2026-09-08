import { CLEFT_EDGES, CLEFT_NODES, CLEFT_TERRACES } from "./cleft-rules.js";
export function drawCleftMap(canvas, game, full = false) {
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    c = game.cleft;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#242825";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min((w - 28) / 33, (h - 44) / 23),
    ox = w / 2,
    oy = h - 23;
  const point = (x, y) => [ox + x * scale, oy - y * scale];
  ctx.font = `${full ? 13 : 9}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#d5c09a";
  ctx.fillText("THE CLEFT · WALL ELEVATION", w / 2, full ? 22 : 12);
  for (const e of CLEFT_EDGES) {
    const a = CLEFT_NODES[e.a],
      b = CLEFT_NODES[e.b];
    ctx.strokeStyle = e.leap ? "#e7ac68" : "#64736e";
    ctx.setLineDash(e.leap ? [3, 3] : []);
    ctx.beginPath();
    ctx.moveTo(...point(a.x, a.y));
    ctx.lineTo(...point(b.x, b.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const n of CLEFT_NODES) {
    ctx.fillStyle = game.wallGrip?.node === n.id ? "#fff5d9" : "#c3a875";
    const [x, y] = point(n.x, n.y);
    ctx.fillRect(x - 2, y - 1, 4, 2);
  }
  for (const [i, t] of CLEFT_TERRACES.entries()) {
    const [x, y] = point(t.x - t.w, t.y);
    ctx.fillStyle = i <= c.saved.terrace ? "#8bb59b" : "#afac97";
    ctx.fillRect(x, y, 2 * t.w * scale, 3);
    if (full) {
      ctx.fillStyle = "#cbd2c5";
      ctx.fillText(`${i} · REST`, x + t.w * scale, y + 15);
    }
  }
  ctx.strokeStyle = "#928774";
  ctx.beginPath();
  ctx.moveTo(...point(13, 19.9));
  ctx.lineTo(...point(13, 0.18));
  ctx.stroke();
  const p = game.player.position;
  ctx.fillStyle = "#fff6de";
  ctx.beginPath();
  ctx.arc(...point(p.x - c.x, p.y - c.y + 1), 3, 0, Math.PI * 2);
  ctx.fill();
}
