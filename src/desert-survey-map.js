import {
  SURVEY_LOOKOUTS,
  SURVEY_MONUMENTS,
  SURVEY_DOORS,
  SURVEY_COURT,
  surveyDone,
} from "./desert-survey-rules.js";

export function drawDesertSurveyMap(canvas, game, full) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    scale = Math.min((w - 35) / 200, (h - 80) / 124),
    x = (v) => w / 2 + (v - 303) * scale,
    z = (v) => h / 2 + (v - 267) * scale;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#30291f";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#e5d6ae";
  c.textAlign = "center";
  c.font = `${full ? 16 : 11}px Georgia`;
  c.fillText("A DOOR IN THE DUNES", w / 2, 20);
  c.strokeStyle = "#71634c";
  c.lineWidth = 4;
  c.beginPath();
  for (const [i, p] of [
    [371, 224],
    [385, 266],
    [343, 259],
    [322, 252],
    [317, 291],
    [343, 294],
  ].entries())
    i ? c.lineTo(x(p[0]), z(p[1])) : c.moveTo(x(p[0]), z(p[1]));
  c.stroke();
  c.font = `${full ? 12 : 9}px sans-serif`;
  for (const [i, p] of SURVEY_LOOKOUTS.entries()) {
    const done = surveyDone(game.progress, i),
      target = SURVEY_MONUMENTS[i];
    if (done) {
      c.strokeStyle = i ? "#94c7be" : "#eac681";
      c.lineWidth = 1.5;
      c.setLineDash([5, 3]);
      c.beginPath();
      c.moveTo(x(p.x), z(p.z));
      c.lineTo(x(target.x), z(target.z));
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(x(target.x), z(target.z), 3, 0, Math.PI * 2);
      c.fill();
      if (full) c.fillText(target.name, x(target.x), z(target.z) + 18);
    }
    c.fillStyle = done ? "#9fcaac" : "#ffd28b";
    c.fillRect(x(p.x) - 4, z(p.z) - 4, 8, 8);
    c.fillText(`LOOKOUT ${i + 1}`, x(p.x), z(p.z) - 12);
  }
  if (surveyDone(game.progress, 1)) {
    c.strokeStyle = "#e8d1a0";
    c.beginPath();
    c.ellipse(
      x(SURVEY_COURT.x),
      z(SURVEY_COURT.z),
      19 * scale,
      10 * scale,
      0,
      0,
      Math.PI * 2,
    );
    c.stroke();
    for (const p of SURVEY_DOORS) {
      c.fillStyle = "#c7b38c";
      c.fillRect(x(p.x) - 3, z(p.z) - 2, 6, 4);
    }
    if (full) {
      c.fillStyle = "#f2dcad";
      c.fillText("SEARCH THE THREE SEALS", x(295), z(269));
    }
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
  c.fillStyle = "#e5d6ae";
  c.fillText(
    surveyDone(game.progress, 1)
      ? "Recorded signs: CROWN → SUN"
      : surveyDone(game.progress, 0)
        ? "Recorded sign: CROWN"
        : "Record a bearing to chart its line",
    w / 2,
    h - 14,
  );
}
