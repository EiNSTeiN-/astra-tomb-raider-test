// Three structural bays on each elevation; unequal enclosed/open fronts make
// the paired wings read as lodges, workshops, archives and open cloisters.
const COURTS = [
  [
    ["Pilgrim lodging", "shutters", [0, 1], [0, 2]],
    ["Arrival veranda", "arches", [1], [0, 1, 2]],
  ],
  [
    ["Echo cloister", "arches", [1], [0, 2]],
    ["Valley record house", "paired", [0, 2], [1, 2]],
  ],
  [
    ["Scroll gallery", "transoms", [0, 2], [0, 1, 2]],
    ["Listening veranda", "lattice", [1], [0, 2]],
  ],
  [
    ["Stair lodge", "paired", [1, 2], [0, 1]],
    ["Voice gallery", "arches", [0], [0, 2]],
  ],
  [
    ["Broken western lodge", "shutters", [0, 2], [1, 2]],
    ["Memory cloister", "sunwheel", [1], [0, 2]],
  ],
  [
    ["Weavers' gallery", "lattice", [0, 1], [0, 2]],
    ["Wind workshop", "transoms", [0, 2], [1]],
  ],
  [
    ["Summit shelter", "slits", [1], [0, 1, 2]],
    ["Watch gallery", "paired", [0, 2], [1, 2]],
  ],
  [
    ["Scripture store", "stacked", [0, 1, 2], [0, 2]],
    ["Archive veranda", "arches", [1], [0, 1, 2]],
  ],
  [
    ["Bell store", "transoms", [0, 2], [0, 1]],
    ["Observatory cloister", "sunwheel", [1], [0, 2]],
  ],
];
const GALLERIES = [
  [-1, 1],
  [1],
  [-1],
  [-1, 1],
  [1],
  [-1, 1],
  [-1],
  [1],
  [-1, 1],
];
export function monasteryGallerySides(index) {
  return [...GALLERIES[index % 9]];
}
export function monasteryGalleryRoofPlan(za, zb) {
  const length = zb - za,
    front = -19.5 + 6.35 / 2 - 0.04,
    skirt = za === -17 ? front - (za - 0.8) : 0;
  return {
    width: length + 1.6 - skirt,
    depth: 5,
    rise: 1.2,
    y: 5.95,
    z: (za + zb) / 2 + skirt / 2,
    angle: Math.PI / 2,
  };
}
export const WING_FLOOR = 6.58;
export function monasteryWingPlan(index, side) {
  const [name, style, front, back] = COURTS[index % 9][side < 0 ? 0 : 1],
    foot = -side * 6,
    lip = side * 4.9,
    holeInner = -side * 4.9,
    gallery = monasteryGallerySides(index).includes(side);
  return {
    name,
    style,
    front: gallery ? front.filter((b) => b !== (side < 0 ? 0 : 2)) : [...front],
    back: [...back],
    gallery: gallery ? { x: side * 4.15, width: 1.6 } : null,
    side,
    floor: WING_FLOOR,
    foot,
    lip,
    hole: [Math.min(holeInner, lip), Math.max(holeInner, lip)],
    width: 12.75,
    depth: 6.35,
    opening: 2.4,
    rampWidth: 1.7,
    loop: [
      [side * 5.65, 0],
      [side * 5.65, 2],
      [-side * 5.65, 2],
      [-side * 5.65, -2],
      [side * 5.65, -2],
      [side * 5.65, 0],
    ],
  };
}
