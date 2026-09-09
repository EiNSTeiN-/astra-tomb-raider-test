import { ORBIT_RESTS } from "./orbit-rules.js";
export function drawOrbitMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    v = game.orbitVault,
    scale = Math.min(w - 24, h - 42) / 52,
    ox = w / 2,
    oz = h / 2 + 5;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#191d25";
  c.fillRect(0, 0, w, h);
  const band = (inner, outer, a, b, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(ox, oz, outer * scale, a, b);
    c.arc(ox, oz, inner * scale, b, a, true);
    c.closePath();
    c.fill();
  };
  band(20, 24, 0, Math.PI * 2, "#706a5d");
  for (const r of v.rings) {
    for (const [a, b] of r.arcs)
      band(
        r.inner,
        r.outer,
        a + r.angle,
        b + r.angle,
        v.saved.aligned > r.index
          ? "#799e8e"
          : ["#bb9560", "#a9b7c9", "#b5a3cc"][r.index],
      );
    if (full && v.saved.started && v.saved.aligned === r.index) {
      c.strokeStyle = "#f4e6c5";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(ox, oz, (r.outer + 1) * scale, r.angle, r.angle + 0.4);
      c.stroke();
      c.font = "17px Georgia";
      c.fillStyle = "#f4e6c5";
      c.fillText(
        r.speed > 0 ? "↻" : "↺",
        ox + (r.outer + 1) * scale * Math.cos(r.angle + 0.4),
        oz + (r.outer + 1) * scale * Math.sin(r.angle + 0.4),
      );
    }
  }
  c.font = `${full ? 13 : 9}px sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const [i, d] of ORBIT_RESTS.entries()) {
    c.fillStyle = i <= v.saved.rest ? "#96c3ad" : "#7b938b";
    c.fillRect(
      ox + (d.x - d.w) * scale,
      oz + (d.z - d.d) * scale,
      d.w * 2 * scale,
      d.d * 2 * scale,
    );
    c.fillStyle = "#fff4d7";
    c.fillText(i ? String(i) : "E", ox + d.x * scale, oz + d.z * scale);
  }
  if (v.saved.recovered) {
    c.fillStyle = "#d8ba78";
    c.fillRect(ox - 22 * scale, oz - 1.25 * scale, 22 * scale, 2.5 * scale);
  }
  c.fillStyle = "#ead19a";
  c.beginPath();
  c.arc(ox, oz, 2.5 * scale, 0, Math.PI * 2);
  c.fill();
  const p = game.player.position;
  c.fillStyle = "#fff9e8";
  c.beginPath();
  c.arc(ox + (p.x - v.x) * scale, oz + (p.z - v.z) * scale, 3, 0, Math.PI * 2);
  c.fill();
  c.font = `${full ? 14 : 9}px Georgia`;
  c.fillStyle = "#e6d4ae";
  c.fillText("THE CARTOGRAPHER’S ORRERY", w / 2, 14);
  c.font = `${full ? 12 : 9}px sans-serif`;
  c.fillText(
    full
      ? "N ↑   1 Earth · 2 Moon · 3 Star · Green: safe landings"
      : "N ↑   EARTH → MOON → STAR",
    w / 2,
    h - 12,
  );
}
