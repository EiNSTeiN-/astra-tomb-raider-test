import { EXPEDITIONS } from "./expeditions.js";

// Derive machinery from the existing saved objectives, including older saves
// which recorded a completed sector without retaining each individual field ID.
export function forgeState(progress, roomIndex) {
  const stage = roomIndex - 1;
  const mission = EXPEDITIONS.embers[stage];
  if (!mission) return { heat: 0.35, motion: 0.22, steam: 0 };
  const done = (task) =>
    stage < progress.stage || !!progress.field?.includes(task.id);
  const fraction = mission.tasks.filter(done).length / mission.tasks.length;
  const complete = mission.tasks.every(done);
  const delivered = mission.tasks.some((t) => t.kind === "delivery" && done(t));
  let heat,
    motion = 0.3,
    steam = 0;
  switch (stage) {
    case 0:
      heat = 1 - fraction * 0.9;
      steam = fraction * 0.75;
      break;
    case 1:
      heat = delivered ? 1 : 0.045;
      motion = delivered ? 0.5 : 0;
      break;
    case 2:
      heat = 1 - fraction * 0.8;
      steam = fraction;
      motion = 0.65 - fraction * 0.5;
      break;
    case 3:
      heat = 0.55;
      motion = delivered ? 0.85 : 0;
      break;
    case 4:
      heat = 1 - fraction * 0.65;
      motion = complete ? 0.5 : 0.2;
      steam = fraction * 0.4;
      break;
    case 5:
      heat = 0.06 + fraction * 0.9;
      motion = fraction * 0.7;
      break;
    case 6:
      heat = delivered ? 0.16 : 0.85;
      steam = delivered ? 0.85 : 0;
      break;
    case 7:
      heat = 1 - fraction * 0.92;
      steam = fraction;
      motion = 0.65 - fraction * 0.5;
      break;
  }
  return { heat, motion, steam };
}
