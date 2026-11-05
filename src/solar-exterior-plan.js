const rectangle = (left, right, back, front) => [
  [left, back],
  [right, back],
  [right, front],
  [left, front],
];
const scaleAbout = (poly, x, z, scale) =>
  poly.map(([px, pz]) => [x + (px - x) * scale, z + (pz - z) * scale]);

export const SOLAR_EXTERIOR_STYLES = [
  "Battered balance pylons",
  "Western dawn wing",
  "Aqueduct buttresses",
  "Splayed noon shoulders",
  "Octagonal ephemeris tower",
  "Western shadow keep",
  "Faceted light-well apse",
  "Staggered relay wings",
  "Stepped sepulchre",
];

// The room and its forward optical field keep their coordinates. The new
// footprints occupy the outside of the old side/back walls, forming different
// buildings and changing the pockets through which the outer court is crossed.
export function solarExteriorPlan(stage) {
  if (!SOLAR_EXTERIOR_STYLES[stage])
    throw new RangeError("Unknown solar exterior");
  const plans = [],
    add = (name, footprint, upper, height) =>
      plans.push({ id: plans.length, name, footprint, upper, height }),
    wing = (side, z, depth, reach, topReach, height, name) => {
      let foot = rectangle(6.9, 6.9 + reach, z - depth / 2, z + depth / 2),
        top = rectangle(
          6.9,
          6.9 + topReach,
          z - depth / 2 + 0.12,
          z + depth / 2 - 0.12,
        );
      if (side < 0) {
        foot = foot.map(([x, z]) => [-x, z]).reverse();
        top = top.map(([x, z]) => [-x, z]).reverse();
      }
      add(name, foot, top, height);
    };
  switch (stage) {
    case 0:
      for (const side of [-1, 1]) {
        wing(side, -0.6, 11.4, 3.0, 1.55, 7.65, "balance shoulder");
        wing(side, 4.45, 3.7, 3.65, 2.4, 9.45, "entrance pylon");
      }
      break;
    case 1:
      wing(-1, -0.3, 12.0, 3.8, 2.1, 8.15, "dawn western wing");
      wing(1, -4.2, 4.2, 2.65, 1.7, 5.6, "rear eastern shoulder");
      wing(1, 3.9, 4.5, 2.9, 1.5, 7.05, "front eastern shoulder");
      break;
    case 2:
      for (const side of [-1, 1])
        for (const [i, z] of [-4.5, 0, 4.5].entries())
          wing(side, z, 3.0, 3.2, 1.0, [6.6, 7.35, 6.6][i], "vault buttress");
      break;
    case 3:
      for (const side of [-1, 1])
        wing(side, 0, 13.2, 4.45, 1.25, 6.8, "raking noon wall");
      break;
    case 4: {
      const radius = 2.9 / Math.cos(Math.PI / 8),
        octagon = Array.from({ length: 8 }, (_, i) => {
          const a = Math.PI / 8 + (i * Math.PI) / 4;
          return [-9.8 + Math.cos(a) * radius, -4 + Math.sin(a) * radius];
        });
      add(
        "ephemeris tower",
        octagon,
        scaleAbout(octagon, -6.9, -4, 0.83),
        11.8,
      );
      for (const [z, h, reach] of [
        [-4.5, 3.6, 3.4],
        [0, 5.2, 2.9],
        [4.3, 6.8, 2.4],
      ])
        wing(1, z, 3.1, reach, reach * 0.6, h, "eastern ephemeris terrace");
      break;
    }
    case 5:
      wing(-1, -0.2, 12.0, 3.8, 2.4, 8.05, "shadow western wing");
      wing(-1, -4.9, 4.6, 4.1, 2.6, 10.1, "shadow rear keep");
      wing(1, -3.9, 4.5, 2.6, 1.35, 3.35, "broken eastern wing");
      wing(1, 3.6, 4.7, 2.9, 1.6, 5.1, "eastern remnant");
      break;
    case 6: {
      const apse = [
        [-6.9, -6.65],
        [-8.7, -7.1],
        [-5.9, -9.5],
        [0, -10.6],
        [5.9, -9.5],
        [8.7, -7.1],
        [6.9, -6.65],
      ];
      add("faceted rear apse", apse, scaleAbout(apse, 0, -6.65, 0.9), 7.5);
      for (const side of [-1, 1])
        wing(side, -1.6, 9.8, 2.35, 1.25, 6.65, "light-well side shoulder");
      break;
    }
    case 7:
      for (const [z, h] of [
        [-4.5, 6.0],
        [0, 8.7],
        [4.5, 7.15],
      ])
        wing(-1, z, 3.1, 3.3, 1.8, h, "relay western bay");
      wing(1, -0.5, 11.4, 4.0, 2.15, 5.6, "relay eastern wing");
      break;
    case 8: {
      for (const side of [-1, 1]) {
        wing(side, -0.1, 13.0, 4.35, 2.4, 7.25, "sepulchre battered side");
        wing(side, 4.55, 3.5, 4.7, 2.8, 9.0, "sepulchre entrance flank");
      }
      const back = [
        [-6.9, -6.65],
        [-6.3, -10.3],
        [6.3, -10.3],
        [6.9, -6.65],
      ];
      add(
        "sepulchre rear terrace",
        back,
        scaleAbout(back, 0, -6.65, 0.88),
        6.25,
      );
      break;
    }
  }
  return plans;
}
