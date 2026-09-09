export function drawPressureMap(canvas, game, full = false) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    t = game.pressureRelay;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#231e1b";
  c.fillRect(0, 0, w, h);
  const scale = Math.min((w - 24) / 48, (h - 44) / 52),
    ox = w / 2,
    oz = h / 2 + 4;
  const point = (x, z) => [ox + (x - t.x) * scale, oz + (z - t.z) * scale];
  c.strokeStyle = "#8f8370";
  c.lineWidth = 1;
  c.strokeRect(ox - 22 * scale, oz - 23 * scale, 44 * scale, 46 * scale);
  const route = [
    t.rests[0],
    t.pistons[0].deck,
    t.pistons[1].deck,
    t.rests[1],
    t.pistons[2].deck,
    t.pistons[3].deck,
    t.rests[2],
    t.pistons[4].deck,
    t.pistons[5].deck,
    t.rests[3],
    t.lift.deck,
  ];
  c.strokeStyle = "#b9a580";
  c.setLineDash([3, 3]);
  c.beginPath();
  route.forEach((d, i) => {
    const p = point(d.x, d.z);
    if (i) c.lineTo(...p);
    else c.moveTo(...p);
  });
  c.stroke();
  c.setLineDash([]);
  for (const [i, d] of t.rests.entries()) {
    const [x, z] = point(d.x, d.z);
    c.fillStyle = i <= t.saved.rest ? "#88a994" : "#56675e";
    c.fillRect(
      x - d.w * scale,
      z - d.d * scale,
      d.w * 2 * scale,
      d.d * 2 * scale,
    );
    if (full) {
      c.fillStyle = "#fff0d0";
      c.font = "11px sans-serif";
      c.textAlign = "center";
      c.fillText(
        `${i === 3 ? "LEDGER" : `VALVE ${i + 1}`} · ${Math.round(d.y - t.y)}m`,
        x,
        z + 4,
      );
    }
  }
  for (const [i, p] of t.pistons.entries()) {
    const [x, z] = point(p.deck.x, p.deck.z);
    c.fillStyle = t.saved.opened > Math.floor(i / 2) ? "#c58b4c" : "#716455";
    c.fillRect(x - 2.1 * scale, z - 2.1 * scale, 4.2 * scale, 4.2 * scale);
    c.fillStyle = "#fff0d0";
    c.textAlign = "center";
    c.font = `${full ? 12 : 9}px sans-serif`;
    c.fillText(String(i + 1), x, z + 3);
    if (full) c.fillText(`${(p.deck.y - t.y).toFixed(1)}m`, x, z + 19);
  }
  const l = point(t.lift.deck.x, t.lift.deck.z);
  c.strokeStyle = "#d4c2a0";
  c.strokeRect(
    l[0] - 2.1 * scale,
    l[1] - 2.1 * scale,
    4.2 * scale,
    4.2 * scale,
  );
  if (full) {
    c.fillStyle = "#d4c2a0";
    c.fillText("RETURN", l[0], l[1] + 4);
  }
  const p = point(game.player.position.x, game.player.position.z);
  c.fillStyle = "#fff6df";
  c.beginPath();
  c.arc(...p, Math.max(2.5, scale * 0.6), 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#dcc9a8";
  c.textAlign = "center";
  c.font = `${full ? 14 : 10}px sans-serif`;
  c.fillText("THE CINDER RELAY", w / 2, full ? 22 : 13);
  if (full) {
    c.font = "11px sans-serif";
    c.fillText(
      "Green: safe gallery · Numbered crowns: moving pistons · Dashed: jumps",
      w / 2,
      h - 14,
    );
  }
}
