import { CAUSEWAY_LANDINGS, causewayRelayDone } from "./echo-causeway-rules.js";

export function drawCausewayMap(canvas, game, full) {
  const h = game.echoCauseway,
    c = canvas.getContext("2d"),
    w = canvas.width,
    height = canvas.height;
  const scale = Math.min((w - 30) / 58, (height - 55) / 69),
    ox = w / 2 - 238 * scale,
    oz = 30 - 213 * scale;
  const x = (v) => ox + v * scale,
    z = (v) => oz + v * scale;
  c.clearRect(0, 0, w, height);
  c.fillStyle = "#131c27";
  c.fillRect(0, 0, w, height);
  c.fillStyle = "#d3dcd7";
  c.font = `${full ? 16 : 11}px Georgia`;
  c.textAlign = "center";
  c.fillText("THE ECHO CAUSEWAY", w / 2, 18);
  c.strokeStyle = "#324657";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x(217), z(273));
  c.lineTo(x(217), z(259));
  c.lineTo(x(252), z(259));
  c.lineTo(x(252), z(224));
  c.stroke();
  c.fillStyle = "#677d89";
  c.fillRect(x(215.7), z(261.9), 2.6 * scale, 12 * scale);
  for (const [i, a] of CAUSEWAY_LANDINGS.entries()) {
    c.fillStyle = causewayRelayDone(game.progress, i) ? "#a4c5c4" : "#677b91";
    c.fillRect(x(a.x - a.w), z(a.z - a.d), a.w * 2 * scale, a.d * 2 * scale);
    c.fillStyle = "#e6d8b6";
    c.font = `${full ? 13 : 9}px sans-serif`;
    c.fillText(
      full
        ? ["A · OUTER", "B · GALLERY", "C · CHAMBER"][i]
        : ["A", "B", "C"][i],
      x(a.x),
      z(a.z - a.d) - 5,
    );
  }
  for (const s of h.stones) {
    c.fillStyle =
      s.phase.warning > 0.1
        ? "#e1ad61"
        : s.phase.amount > 0.98
          ? "#8dccd4"
          : "#344651";
    c.fillRect(x(s.x - 1.8), z(s.z - 1.8), 3.6 * scale, 3.6 * scale);
    c.fillStyle = "#f0eddb";
    c.fillText(String(s.index + 1), x(s.x), z(s.z) + 3);
  }
  const p = game.player.position;
  c.save();
  c.translate(x(p.x), z(p.z));
  c.rotate(-game.yaw);
  c.fillStyle = "#f2cf83";
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 5);
  c.lineTo(0, 3);
  c.lineTo(-4, 5);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = "#d2d9da";
  c.font = `${full ? 12 : 9}px sans-serif`;
  c.fillText("Cyan: raised · Amber: descending", w / 2, height - 9);
}
