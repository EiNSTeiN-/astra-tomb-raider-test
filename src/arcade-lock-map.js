import { ARCADE_FIELDS, arcadeDone } from "./arcade-lock-rules.js";

export function drawArcadeLockMap(canvas, game, full) {
  const h = game.arcadeLock,
    c = canvas.getContext("2d"),
    w = canvas.width,
    height = canvas.height,
    scale = Math.min((w - 28) / 78, (height - 70) / 52),
    ox = w / 2 - 56 * scale,
    oz = height / 2 - 219 * scale,
    x = (v) => ox + v * scale,
    z = (v) => oz + v * scale;
  c.clearRect(0, 0, w, height);
  c.fillStyle = "#12292c";
  c.fillRect(0, 0, w, height);
  c.textAlign = "center";
  c.fillStyle = "#e5d6ae";
  c.font = `${full ? 16 : 11}px Georgia`;
  c.fillText("THE SUNKEN ARCADE", w / 2, 18);
  c.fillStyle = "#2e6c77";
  c.fillRect(x(62.5), z(206), 11 * scale, 22 * scale);
  for (const d of h.decks) {
    c.fillStyle = d.pontoon ? "#eac47e" : d.y - h.y > 6 ? "#a2bcb0" : "#748c87";
    c.fillRect(x(d.x - d.w), z(d.z - d.d), 2 * d.w * scale, 2 * d.d * scale);
  }
  c.strokeStyle = h.inspection === 1 ? "#83c3a4" : "#db925e";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x(82.3), z(204.8));
  c.lineTo(x(85.7), z(204.8));
  c.stroke();
  c.strokeStyle = h.exit === 1 ? "#83c3a4" : "#db925e";
  c.beginPath();
  c.moveTo(x(26.1), z(220));
  c.lineTo(x(29.9), z(220));
  c.stroke();
  c.font = `${full ? 12 : 9}px sans-serif`;
  for (const [i, f] of ARCADE_FIELDS.entries()) {
    c.fillStyle = arcadeDone(game.progress, i) ? "#98cfaf" : "#ffd285";
    c.fillRect(x(f.x) - 3, z(f.z) - 3, 6, 6);
    c.fillText(String(i + 1), x(f.x), z(f.z) - 8);
  }
  if (full) {
    c.fillStyle = "#d0d8c6";
    c.fillText("INSPECTION", x(63), z(196));
    c.fillText("RETURN", x(28), z(249));
    c.fillText("ENTRY", x(89), z(222));
    c.fillText("CALL", x(60), z(213));
    c.fillText("CALL", x(77), z(213));
  }
  const p = game.player.position;
  c.save();
  c.translate(x(p.x), z(p.z));
  c.rotate(-game.yaw);
  c.fillStyle = "#fff8de";
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 5);
  c.lineTo(0, 3);
  c.lineTo(-4, 5);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = "#d5daca";
  c.font = `${full ? 12 : 9}px sans-serif`;
  c.fillText(
    `Water ${Math.round(h.saved.level * 100)}% · Gold: pontoon`,
    w / 2,
    height - 10,
  );
}
