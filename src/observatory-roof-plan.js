// A family of bronze roofs, with a distinct crown for each celestial court.
const crowns = [
  ["Wayfarer canopy", 4.2, 0.6, 0.5, 0.3],
  ["Witness crown", 6.7, 1.15, 0.3, 0.28],
  ["Earth-axis spire", 7.4, 0.9, -0.3, 0.28],
  ["Lunar lantern", 7.0, 0.55, 0.8, 0.39],
  ["Sevenfold crown", 6.3, 0.72, 0.2, 0.31],
  ["Solar fan", 4.5, 0.64, 0.2, 0.32],
  ["Horizon crown", 6.8, 1.3, 0.7, 0.29],
  ["Star-chart lantern", 7.0, 1.1, 0.6, 0.36],
  ["Echo canopy", 4.4, 0.5, 0.4, 0.34],
  ["Pressure collar", 5.6, 0.9, 1.2, 0.3],
  ["Atlas cupola", 8.0, 0.68, 0, 0.29],
];
export function observatoryRoofPlan(index) {
  const [name, rise, exponent, shoulder, opening] =
    crowns[index % crowns.length];
  return { name, rise, exponent, shoulder, opening, rings: 24, radial: 12 };
}
export function roofHeight(rise, opening, theta, profile) {
  if (!profile) return Math.cos(theta) * rise;
  const t = Math.max(
    0,
    Math.min(1, (1 - Math.sin(theta)) / (1 - Math.sin(opening))),
  );
  return (
    rise * Math.pow(t, profile.exponent) +
    profile.shoulder * Math.sin(Math.PI * t)
  );
}

export function roofFrame(radius, rise, opening, theta, profile) {
  const low = Math.max(opening, theta - 0.00001),
    high = Math.min(Math.PI / 2, theta + 0.00001),
    dy =
      roofHeight(rise, opening, high, profile) -
      roofHeight(rise, opening, low, profile),
    dr = (Math.sin(high) - Math.sin(low)) * radius,
    length = Math.hypot(dr, dy);
  return {
    radius: Math.sin(theta) * radius,
    height: roofHeight(rise, opening, theta, profile),
    normalRadius: -dy / length,
    normalY: dr / length,
  };
}
