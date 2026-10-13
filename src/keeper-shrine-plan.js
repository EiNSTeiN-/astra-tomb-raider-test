// Authored pockets in the delivered jungle courts. The first reader keeps its
// entrance position; later shrines move out of the procession's centre line.
const layouts = [
  { x: 0, z: 17, style: "lectern", sign: 0, tilt: 0.9, approach: 2.1 },
  { x: -10, z: 24, style: "root-portal", sign: 1, tilt: 0, approach: 2 },
  { x: 8, z: 20, style: "rain-register", sign: 2, tilt: 0, approach: 2 },
  { x: 10, z: 24, style: "garden-altar", sign: 2, tilt: 0.65, approach: 2.1 },
  { x: -10, z: 22, style: "witness-screen", sign: 0, tilt: 0, approach: 2 },
  { x: 10, z: 26, style: "moon-canopy", sign: 3, tilt: 0, approach: 2 },
  { x: 10, z: 24, style: "oath-pediment", sign: 1, tilt: 0, approach: 2 },
  { x: -12, z: 24, style: "heart-shrine", sign: 3, tilt: 0, approach: 2 },
];

export function keeperShrinePlan(stage) {
  const layout = layouts[stage];
  if (!layout) throw new RangeError(`Unknown keeper shrine ${stage}`);
  return {
    ...layout,
    width: 5.2,
    depth: layout.tilt ? 2.4 : 1.3,
  };
}

export function keeperShrineReserved(stage, x, z, padding = 0) {
  if (!layouts[stage]) return false;
  const plan = keeperShrinePlan(stage);
  return (
    (Math.abs(x - plan.x) < plan.width / 2 + padding &&
      Math.abs(z - plan.z) < plan.depth / 2 + padding) ||
    (Math.abs(x - plan.x) < 1.1 + padding &&
      z > plan.z + plan.depth / 2 - padding &&
      z < plan.z + plan.approach + 1.5 + padding)
  );
}
