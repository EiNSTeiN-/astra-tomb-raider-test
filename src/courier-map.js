import { COURIER_STOPS, COURIER_Z } from "./courier-rules.js";
export function drawCourierMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    f = game.courierFerry;
  const scale = (w - 32) / 245,
    x = (v) => 16 + (v - 80) * scale,
    z = (v) => h * 0.48 + (v - COURIER_Z) * scale;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#172431";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "#c2b089";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x(126), z(14));
  c.lineTo(x(315), z(14));
  c.stroke();
  c.strokeStyle = "#818f83";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x(84), z(28));
  c.lineTo(x(84), z(14));
  c.lineTo(x(126), z(14));
  c.stroke();
  c.textAlign = "center";
  c.font = `${full ? 14 : 10}px sans-serif`;
  for (const [i, stop] of COURIER_STOPS.entries()) {
    c.fillStyle = i <= f.saved.post ? "#86b89c" : "#d1af71";
    c.fillRect(x(stop - 7), z(18), 14 * scale, 8 * scale);
    c.fillText(
      i === 0 ? "HOME" : `${i}${i <= f.saved.post ? " ✓" : ""}`,
      x(stop),
      z(26) + 20,
    );
    if (full && i)
      c.fillText(`${i} missing tread${i > 1 ? "s" : ""}`, x(stop), z(26) + 42);
  }
  c.fillStyle = "#f0d99e";
  c.fillRect(x(f.x) - 4, z(14) - 4, 8, 8);
  const p = game.player.position;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(x(p.x), z(p.z), 3, 0, Math.PI * 2);
  c.fill();
  c.textAlign = "left";
  c.fillStyle = "#e2dbc9";
  c.font = `${full ? 15 : 9}px sans-serif`;
  c.fillText("N ↑   THE COURIER ROAD", 12, 22);
  c.fillText(
    `${f.saved.post} / 3 dispatches · ${f.docked == null ? "in transit" : "dock " + f.docked}`,
    12,
    h - 16,
  );
  if (full) {
    c.fillText(
      `Wind: ${f.wind >= 0 ? "southerly" : "northerly"} · trim ${Math.round(f.trim * 100)}%`,
      12,
      55,
    );
    c.fillText("A / D trim  ·  Space furl / brake  ·  E release", 12, 82);
    c.fillText("Stable wind", x(126), h * 0.48 - 28);
    c.fillText("Reversing wind →", x(218), h * 0.48 - 28);
  }
}
