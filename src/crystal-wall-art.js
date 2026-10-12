// Blind archive bays echo their chamber's crown and tuning arrangement.
// Their backs stay sealed; these profiles do not add traversable openings.
export function crystalBayContour(stage, radius, bottom, top) {
  const r = radius, h = top - bottom;
  const at = (x, y) => [x * r, bottom + y * h];
  if (stage === 0)
    return [[-r, bottom], [r, bottom], at(1, .64), at(.72, .64),
      at(.72, .82), at(.42, .82), at(.42, 1), at(-.42, 1),
      at(-.42, .82), at(-.72, .82), at(-.72, .64), at(-1, .64)];
  if (stage === 1)
    return [[-r, bottom], [r, bottom], ...Array.from({ length: 25 }, (_, i) => {
      const a = i / 24 * Math.PI;
      return [Math.cos(a) * r, bottom + h * (.58 + Math.sin(a) * .42)];
    })];
  if (stage === 2)
    return [[-r, bottom], [r, bottom], at(.86, .75), at(0, 1), at(-.86, .75)];
  if (stage === 3)
    return [[-r, bottom], [r, bottom], at(1, .42), at(.7, .42),
      at(.7, .7), at(.4, .7), at(.4, .92), at(0, 1),
      at(-.4, .92), at(-.4, .7), at(-.7, .7), at(-.7, .42), at(-1, .42)];
  if (stage === 4)
    return [[-r, bottom], [r, bottom], at(1, .26), at(.54, .74),
      at(0, 1), at(-.54, .74), at(-1, .26)];
  if (stage === 5)
    return [[-r, bottom], [r, bottom], at(1, .7), at(.82, .89),
      at(0, 1), at(-.82, .89), at(-1, .7)];
  if (stage === 6) {
    const right = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return at(Math.cos(t * Math.PI / 2), .58 + t * .42);
    });
    return [[-r, bottom], [r, bottom], ...right,
      ...right.slice(0, -1).toReversed().map(([x, y]) => [-x, y])];
  }
  if (stage === 7)
    return [at(-.68, 0), at(.68, 0), at(1, .12), at(1, .88),
      at(.68, 1), at(-.68, 1), at(-1, .88), at(-1, .12)];
  throw new RangeError('Unknown crystal chamber');
}

// Coordinates are normalized within a bay. The same diagram can be mounted
// on its exterior sealed inset or shallow inner rear panel.
export function crystalBayLines(stage) {
  const paths = [];
  const line = (...points) => paths.push(points);
  const ring = (x, y, rx, ry, count = 24) => line(...Array.from({ length: count + 1 }, (_, i) => {
    const a = i / count * Math.PI * 2;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
  }));
  if (stage === 0) {
    for (const x of [-.3, .3]) line([x, .12], [x, .52]);
    line([-.5, .35], [0, .56], [.5, .35]);
  } else if (stage === 1) {
    for (const y of [.22, .39, .56]) line([-.52, y], [0, y - .07], [.52, y]);
  } else if (stage === 2) {
    for (const sign of [-1, 1]) line([sign * .56, .15], [sign * .2, .33],
      [sign * .49, .52], [0, .71]);
  } else if (stage === 3) {
    for (let i = 0; i < 4; i++) {
      const y = .18 + i * .15, w = .5 - i * .08;
      line([-w, y], [w, y + .045]);
    }
  } else if (stage === 4) {
    for (const x of [-.52, -.26, 0, .26, .52]) line([0, .19], [x, .55]);
  } else if (stage === 5) {
    line([-.55, .16], [-.15, .33], [-.36, .48], [.04, .61]);
    line([.1, .22], [.47, .4], [.25, .61], [.48, .74]);
  } else if (stage === 6) {
    ring(-.2, .4, .34, .17);
    ring(.2, .4, .34, .17);
  } else if (stage === 7) {
    ring(0, .45, .52, .24, 8);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      line([0, .45], [Math.cos(a) * .4, .45 + Math.sin(a) * .18]);
    }
  } else throw new RangeError('Unknown crystal chamber');
  return paths;
}

export function addCrystalBayInlay(stage, radius, bottom, top, cx, bar, material, {
  interior = false,
} = {}) {
  const point = ([x, y]) => {
    const height = bottom + (top - bottom) * y;
    return interior ? [cx + x * radius * .72, 1.45 + (height - 1.2) * .76]
      : [cx + x * radius, height];
  };
  for (const path of crystalBayLines(stage))
    for (let i = 0; i < path.length - 1; i++)
      bar(point(path[i]), point(path[i + 1]), interior ? .032 : .045,
        material, interior ? -.49 : -.045);
}
