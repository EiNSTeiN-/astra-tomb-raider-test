import {
  echoCell,
  echoWalls,
  ECHO_STONES,
  ECHO_ORDER,
} from "./echo-gallery-rules.js";
export function drawEchoMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    g = game.echoGallery,
    s = g.saved,
    scale = Math.min((w - 32) / 44, (h - 40) / 62),
    ox = w / 2 - 25 * scale,
    oz = h / 2 - 56 * scale,
    x = (v) => ox + v * scale,
    z = (v) => oz + v * scale;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#141923";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#799398";
  for (const i of s.charted) {
    const p = echoCell(i);
    c.fillRect(x(p.x - 3.5), z(p.z - 3.5), 7 * scale, 7 * scale);
  }
  c.fillStyle = "#51666c";
  c.fillRect(x(35), z(63), 10 * scale, 7 * scale);
  c.lineWidth = Math.max(1, 0.45 * scale);
  for (const a of echoWalls()) {
    if (!s.charted.includes(a.a) && !s.charted.includes(a.b)) continue;
    c.strokeStyle = a.after
      ? s.fragments >= a.after
        ? "#96d7bd"
        : "#d3af7b"
      : "#171e28";
    c.setLineDash(a.after && s.fragments >= a.after ? [2, 3] : []);
    c.beginPath();
    if (a.w > a.d) {
      c.moveTo(x(a.x - a.w / 2), z(a.z));
      c.lineTo(x(a.x + a.w / 2), z(a.z));
    } else {
      c.moveTo(x(a.x), z(a.z - a.d / 2));
      c.lineTo(x(a.x), z(a.z + a.d / 2));
    }
    c.stroke();
  }
  c.setLineDash([]);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `600 ${full ? 16 : 10}px Georgia`;
  for (const [i, n] of ECHO_STONES.entries())
    if (s.charted.includes(n.cell)) {
      const p = echoCell(n.cell),
        collected = ECHO_ORDER.slice(0, s.fragments).includes(i);
      c.fillStyle = collected ? "#acdcb8" : "#eddfc2";
      c.fillText(collected ? "✓" : `${n.count}`, x(p.x), z(p.z));
    }
  c.fillStyle = "#e5c48a";
  c.fillRect(x(39.5) - 2, z(71.4) - 2, 4, 4);
  const p = game.player.position;
  c.save();
  c.translate(x(p.x), z(p.z));
  c.rotate(-game.yaw);
  c.fillStyle = "#fff8e5";
  c.beginPath();
  c.moveTo(0, -5);
  c.lineTo(-3.5, 4);
  c.lineTo(3.5, 4);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = "#d0dad8";
  c.textAlign = "left";
  c.font = `${full ? 13 : 9}px sans-serif`;
  c.fillText("N ↑   THE LISTENING GALLERY", 10, 13);
  c.fillText(`${s.fragments} / 3 voices · eastern exit →`, 10, h - 10);
}
