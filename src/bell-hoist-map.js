import { HOIST_DECK, HOIST_RISE } from "./bell-hoist-rules.js";
export function drawBellHoistMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    tomb = game.bellHoist;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#172327";
  c.fillRect(0, 0, w, h);
  const floor = Math.max(
    0,
    Math.min(
      2,
      Math.round((game.player.position.y - tomb.y - HOIST_DECK) / HOIST_RISE),
    ),
  );
  const floors = full ? [0, 1, 2] : [floor],
    panelW = w / floors.length;
  const scale = Math.min((panelW - 16) / 44, (h - 50) / 57);
  for (const [panel, level] of floors.entries()) {
    const ox = (panel + 0.5) * panelW,
      oz = h / 2 + 8;
    c.strokeStyle = "#809091";
    c.lineWidth = 1;
    c.strokeRect(ox - 20.5 * scale, oz - 26 * scale, 41 * scale, 52 * scale);
    c.fillStyle = "#daceb4";
    c.textAlign = "center";
    c.font = `${full ? 13 : 10}px sans-serif`;
    c.fillText(
      ["GROUND", "MIDDLE GALLERY", "UPPER REFUGE"][level],
      ox,
      full ? 24 : 14,
    );
    const point = (x, z) => [
      ox + (x - tomb.x) * scale,
      oz + (z - tomb.z) * scale,
    ];
    for (const d of tomb.decks) {
      if (
        d.enabled === false ||
        Math.abs(d.y - tomb.y - HOIST_DECK - level * HOIST_RISE) > 0.25
      )
        continue;
      const [x, z] = point(d.x, d.z);
      c.fillStyle =
        d.car != null ? "#c4ab70" : level === 0 ? "#3e4b4b" : "#78857a";
      c.fillRect(
        x - d.w * scale,
        z - d.d * scale,
        d.w * 2 * scale,
        d.d * 2 * scale,
      );
    }
    for (const [i, car] of tomb.cars.entries()) {
      const [x, z] = point(car.deck.x, car.deck.z);
      c.strokeStyle = "#dfcda0";
      c.strokeRect(
        x - car.deck.w * scale,
        z - car.deck.d * scale,
        car.deck.w * 2 * scale,
        car.deck.d * 2 * scale,
      );
      c.fillStyle = "#efe0b9";
      c.font = `${full ? 12 : 9}px sans-serif`;
      c.fillText(i ? "E" : "W", x, z + 3);
    }
    const markers =
      level === 1
        ? [[-12, 14.2, tomb.saved.clapper]]
        : level === 2
          ? [
              [12, -11.4, tomb.saved.bell],
              [-12, -21, tomb.saved.recovered],
            ]
          : [];
    for (const [x, z, done] of markers) {
      const p = point(tomb.x + x, tomb.z + z);
      c.fillStyle = done ? "#97c5a1" : "#e9bd74";
      c.beginPath();
      c.arc(...p, Math.max(2, scale * 0.8), 0, Math.PI * 2);
      c.fill();
    }
    if (level === floor) {
      const p = point(game.player.position.x, game.player.position.z);
      c.fillStyle = "#fff6da";
      c.beginPath();
      c.arc(...p, Math.max(2.5, scale * 0.85), 0, Math.PI * 2);
      c.fill();
    }
  }
  if (full) {
    c.fillStyle = "#b9c4bc";
    c.font = "12px sans-serif";
    c.textAlign = "center";
    c.fillText(
      "W / E: paired lifts · Gold: discovery · White: you",
      w / 2,
      h - 16,
    );
  }
}
