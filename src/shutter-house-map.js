import {
  SHUTTER_STATIONS,
  SHUTTER_SPANS,
  shutterGust,
  shutterDone,
} from "./shutter-house-rules.js";
export function drawShutterMap(canvas, game, full) {
  const h = game.shutterHouse,
    c = canvas.getContext("2d"),
    w = canvas.width,
    ht = canvas.height,
    scale = Math.min((w - 35) / 42, (ht - 55) / 44),
    ox = w / 2 - 2 * scale,
    oz = 28 + 24 * scale;
  const x = (v) => ox + v * scale,
    z = (v) => oz + v * scale;
  c.clearRect(0, 0, w, ht);
  c.fillStyle = "#17252e";
  c.fillRect(0, 0, w, ht);
  c.textAlign = "center";
  c.fillStyle = "#e1ded0";
  c.font = `${full ? 16 : 11}px Georgia`;
  c.fillText("THE ROOM OF WIND", w / 2, 18);
  const rect = (px, pz, ww, dd, color) => {
    c.fillStyle = color;
    c.fillRect(x(px - ww / 2), z(pz - dd / 2), ww * scale, dd * scale);
  };
  for (const [i, s] of SHUTTER_SPANS.entries()) {
    const gust = shutterGust(i, h.time, h.saved.turns[i]),
      color =
        gust.warning > 0.1
          ? "#e2b976"
          : gust.strength > 0.1
            ? "#78abb9"
            : "#839399";
    rect((-10 + s.gap - 1.2) / 2, s.z, s.gap - 1.2 + 10, 2.5, color);
    rect((10 + s.gap + 1.2) / 2, s.z, 10 - s.gap - 1.2, 2.5, color);
    for (const side of [-12, 12]) rect(side, s.z, 4.6, 4.6, "#9ba9a7");
    const station = SHUTTER_STATIONS[i];
    rect(
      station.x,
      station.z,
      2.2,
      2.2,
      shutterDone(game.progress, i) ? "#9ac295" : "#d7bb7b",
    );
    c.fillStyle = "#efe7cf";
    c.font = `${full ? 13 : 9}px sans-serif`;
    c.fillText(
      `${i + 1} · ${h.saved.turns[i]}/3`,
      x(station.x),
      z(station.z) + 4 * scale,
    );
    if (gust.strength > 0.1 || gust.warning > 0.1) {
      c.fillStyle = color;
      c.fillText(
        gust.direction > 0 ? "↓ ↓ ↓" : "↑ ↑ ↑",
        x(0),
        z(s.z) + 5 * scale,
      );
    }
    c.fillStyle = "#c3d0d1";
    c.fillText(`+${s.height} m`, x(-3), z(s.z) - 3 * scale);
  }
  rect(-12, 10, 2.6, 8, "#73858b");
  rect(12, -2, 2.6, 8, "#73858b");
  rect(-12, -14, 2.6, 8, "#73858b");
  rect(18, -3, 2.5, 34, "#73858b");
  rect(16, -20, 4, 2.5, shutterDone(game.progress, 2) ? "#9ac295" : "#403f3a");
  const p = game.player.position;
  c.fillStyle = "#fff3c3";
  c.beginPath();
  c.arc(x(p.x - h.x), z(p.z - h.z), full ? 5 : 3, 0, Math.PI * 2);
  c.fill();
  c.font = `${full ? 12 : 9}px sans-serif`;
  c.fillText("Amber: gust warning · B: brace", w / 2, ht - 9);
}
