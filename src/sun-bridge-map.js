import {
  SUN_LANDINGS,
  SUN_FIELDS,
  sunDone,
  sunWorld,
} from "./sun-bridge-rules.js";

export function drawSunBridgeMap(canvas, game, full) {
  const h = game.sunBridge,
    c = canvas.getContext("2d"),
    w = canvas.width,
    height = canvas.height,
    scale = Math.min((w - 30) / 64, (height - 60) / 52),
    ox = w / 2 - 2 * scale,
    oz = height / 2 + 4 * scale,
    x = (v) => ox + v * scale,
    z = (v) => oz + v * scale;
  c.clearRect(0, 0, w, height);
  c.fillStyle = "#18251f";
  c.fillRect(0, 0, w, height);
  c.textAlign = "center";
  c.fillStyle = "#e5d6ae";
  c.font = `${full ? 16 : 11}px Georgia`;
  c.fillText("THE HANGING GARDEN", w / 2, 18);
  c.fillStyle = "#748578";
  for (const d of SUN_LANDINGS)
    c.fillRect(x(d.x - d.w / 2), z(d.z - d.d / 2), d.w * scale, d.d * scale);
  c.fillRect(x(-25.4), z(2), 2.8 * scale, 14 * scale);
  if (h.returned > 0) {
    c.strokeStyle = h.returned === 1 ? "#b1c79d" : "#d3a664";
    c.lineWidth = 2 * scale;
    c.beginPath();
    c.moveTo(x(-10), z(-14));
    c.lineTo(x(16), z(-14));
    c.stroke();
  }
  for (const b of h.bridges) {
    const a = sunWorld(b, -12, 0),
      end = sunWorld(b, 12, 0);
    c.strokeStyle = b.motion
      ? "#e7ad60"
      : b.index && !sunDone(game.progress, 1)
        ? "#485650"
        : "#b6c599";
    c.lineWidth = 2.5 * scale;
    c.beginPath();
    c.moveTo(x(a.x - h.x), z(a.z - h.z));
    c.lineTo(x(end.x - h.x), z(end.z - h.z));
    c.stroke();
    c.fillStyle = "#b09a68";
    c.beginPath();
    c.arc(x(b.x - h.x), z(b.z - h.z), 2.1 * scale, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#16211a";
    c.font = `${full ? 13 : 9}px sans-serif`;
    c.fillText(b.index ? "B" : "A", x(b.x - h.x), z(b.z - h.z) + 4);
  }
  c.font = `${full ? 12 : 9}px sans-serif`;
  for (const [i, f] of SUN_FIELDS.entries()) {
    c.fillStyle = sunDone(game.progress, i) ? "#98cfaf" : "#f1c777";
    c.fillRect(x(f.x) - 3, z(f.z) - 3, 6, 6);
    c.fillText(String(i + 1), x(f.x), z(f.z) - 7);
  }
  if (full) {
    c.fillStyle = "#cad1b9";
    c.fillText("6 m", x(-10), z(-18));
    c.fillText("9.2 m", x(-17), z(-28));
    c.fillText("6 m", x(16), z(-18));
    c.fillText("ENTRY", x(-24), z(19));
  }
  const p = game.player.position;
  c.save();
  c.translate(x(p.x - h.x), z(p.z - h.z));
  c.rotate(-game.yaw);
  c.fillStyle = "#fff7dc";
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 5);
  c.lineTo(0, 3);
  c.lineTo(-4, 5);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = "#d8d9be";
  c.font = `${full ? 12 : 9}px sans-serif`;
  c.fillText("A / B: turn 90° · Amber: moving", w / 2, height - 10);
}
