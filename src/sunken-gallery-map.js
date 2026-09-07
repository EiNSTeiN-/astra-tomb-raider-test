export function drawGalleryMap(canvas, game, full) {
  const profile = game.terrainProfile.gallery,
    p = game.player.position,
    c = canvas.getContext("2d");
  const w = canvas.width,
    h = canvas.height,
    scale = full ? Math.min((w - 45) / 40, (h - 70) / 58) : 3;
  const ox = full
    ? w / 2 - (profile.origin.x - 18) * scale
    : w / 2 - p.x * scale;
  const oz = full ? 35 - (profile.origin.z - 3) * scale : h / 2 - p.z * scale;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#10262c";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#31515a";
  for (const volume of profile.volumes)
    if (game.progress.gallery.visited.includes(volume.id))
      c.fillRect(
        ox + volume.min.x * scale,
        oz + volume.min.z * scale,
        (volume.max.x - volume.min.x) * scale,
        (volume.max.z - volume.min.z) * scale,
      );
  for (const bell of profile.bells) {
    if (
      !game.progress.gallery.visited.includes(
        bell.id === "bell-a" ? "first-bell-room" : "second-bell-room",
      )
    )
      continue;
    c.strokeStyle = "#e4c885";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(
      ox + bell.x * scale,
      oz + bell.z * scale,
      bell.radius * scale,
      0,
      Math.PI * 2,
    );
    c.stroke();
    if (full) {
      c.fillStyle = "#eedcac";
      c.font = "12px sans-serif";
      c.fillText("AIR", ox + bell.x * scale - 10, oz + bell.z * scale + 4);
    }
  }
  for (const gate of profile.gates) {
    c.strokeStyle = game.progress.gallery.opened ? "#83bda8" : "#c19562";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ox + (gate.x - gate.width / 2) * scale, oz + gate.z * scale);
    c.lineTo(ox + (gate.x + gate.width / 2) * scale, oz + gate.z * scale);
    c.stroke();
  }
  c.save();
  c.translate(ox + p.x * scale, oz + p.z * scale);
  c.rotate(-game.yaw);
  c.fillStyle = "#fff3c6";
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(-4, 4);
  c.lineTo(0, 2);
  c.lineTo(4, 4);
  c.closePath();
  c.fill();
  c.restore();
  if (full) {
    c.fillStyle = "#ecdcb1";
    c.font = "14px sans-serif";
    c.fillText("MEMORIAL GALLERY · bronze circles mark air bells", 18, h - 20);
  }
}
