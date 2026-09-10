// The coastal field repair is a water-driven pump with a controllable return
// line. Values are gauge marks, not a simulation of a specified real machine.
export const PUMP_FIELD = "field-2-2";
export const PUMP_BAND = [36, 46];
export const PUMP_SETTLE_SECONDS = 5;
export function pumpPartsReady(progress) {
  return ["field-2-0", "field-2-1"].every((id) => progress.field?.includes(id));
}
export function pumpComplete(progress) {
  return progress.stage > 2 || !!progress.field?.includes(PUMP_FIELD);
}
export function normalizeCoralPump(value, progress) {
  if (pumpComplete(progress)) {
    const candidate = {
      installed: true,
      intake: value?.intake,
      bypass: value?.bypass,
    };
    return Number.isInteger(candidate.intake) &&
      candidate.intake >= 0 &&
      candidate.intake <= 3 &&
      Number.isInteger(candidate.bypass) &&
      candidate.bypass >= 0 &&
      candidate.bypass <= 3 &&
      pumpInBand(candidate, pumpPressureTarget(candidate))
      ? candidate
      : { installed: true, intake: 2, bypass: 0 };
  }
  const installed = pumpPartsReady(progress) && value?.installed === true;
  const detent = (v, fallback) =>
    Number.isInteger(v) && v >= 0 && v <= 3 ? v : fallback;
  return {
    installed,
    intake: installed ? detent(value.intake, 0) : 0,
    bypass: installed ? detent(value.bypass, 3) : 3,
  };
}
export function pumpPressureTarget(saved) {
  return saved.installed
    ? Math.max(0, saved.intake * 22 - saved.bypass * 14)
    : 0;
}
export function pumpInBand(saved, pressure) {
  return (
    saved.installed &&
    saved.intake >= 2 &&
    pressure >= PUMP_BAND[0] &&
    pressure <= PUMP_BAND[1]
  );
}
export function advancePump(pump, dt) {
  const target = pumpPressureTarget(pump.saved);
  // A transient sweep through the band is insufficient: the actual selected
  // equilibrium must be in range as well as the needle, for five continuous s.
  pump.pressure += (target - pump.pressure) * (1 - Math.exp(-dt * 0.85));
  const stable =
    pumpInBand(pump.saved, pump.pressure) && pumpInBand(pump.saved, target);
  pump.stable = stable ? Math.min(PUMP_SETTLE_SECONDS, pump.stable + dt) : 0;
  return pump.stable >= PUMP_SETTLE_SECONDS;
}
