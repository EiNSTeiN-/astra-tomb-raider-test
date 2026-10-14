// Every later room contains the original working core. Front wall lines and
// drive positions stay fixed; extensions begin behind those gate shoulders.
const profiles = [
  {
    name: "Guide-light chamber",
    points: [
      [6.5, 6.9],
      [6.5, -6.5],
      [-6.5, -6.5],
      [-6.5, 6.9],
    ],
    cases: [],
  },
  {
    name: "Echo apsis",
    points: [
      [6.5, 6.9],
      [6.5, -6.5],
      [3.2, -9.5],
      [-3.2, -9.5],
      [-6.5, -6.5],
      [-6.5, 6.9],
    ],
    cases: [[0, -8.65, 0, 4.4]],
  },
  {
    name: "Opposed reading wings",
    points: [
      [6.5, 6.9],
      [6.5, -1],
      [10, -1],
      [10, -6.5],
      [-10, -6.5],
      [-10, -1],
      [-6.5, -1],
      [-6.5, 6.9],
    ],
    cases: [
      [9.1, -3.7, Math.PI / 2, 3.7],
      [-9.1, -3.7, -Math.PI / 2, 3.7],
    ],
  },
  {
    name: "Long ascending gallery",
    points: [
      [6.5, 6.9],
      [6.5, -10.5],
      [-6.5, -10.5],
      [-6.5, 6.9],
    ],
    cases: [
      [-3.6, -9.65, 0, 3.7],
      [3.6, -9.65, 0, 3.7],
    ],
  },
  {
    name: "Flared violet archive",
    points: [
      [6.5, 6.9],
      [6.5, 0],
      [9.5, -4],
      [9.5, -7.5],
      [-9.5, -7.5],
      [-9.5, -4],
      [-6.5, 0],
      [-6.5, 6.9],
    ],
    cases: [
      [-4.3, -6.65, 0, 3.7],
      [4.3, -6.65, 0, 3.7],
    ],
  },
  {
    name: "Broken western store",
    points: [
      [6.5, 6.9],
      [6.5, -6.5],
      [-6.5, -6.5],
      [-6.5, -7.5],
      [-10.5, -7.5],
      [-10.5, -2],
      [-6.5, -2],
      [-6.5, 6.9],
    ],
    cases: [[-9.6, -4.8, -Math.PI / 2, 3.5]],
  },
  {
    name: "Heart reading crossing",
    points: [
      [6.5, 6.9],
      [6.5, -2],
      [9, -2],
      [9, -5],
      [6.5, -5],
      [6.5, -6.5],
      [4, -6.5],
      [4, -11],
      [-4, -11],
      [-4, -6.5],
      [-6.5, -6.5],
      [-6.5, -5],
      [-9, -5],
      [-9, -2],
      [-6.5, -2],
      [-6.5, 6.9],
    ],
    cases: [
      [0, -10.15, 0, 5.5],
      [8.1, -3.5, Math.PI / 2, 1.8],
      [-8.1, -3.5, -Math.PI / 2, 1.8],
    ],
  },
  {
    name: "Faceted prism archive",
    points: [
      [6.5, 6.9],
      [6.5, 0],
      [10, -3.5],
      [10, -7],
      [6.5, -10.5],
      [-6.5, -10.5],
      [-10, -7],
      [-10, -3.5],
      [-6.5, 0],
      [-6.5, 6.9],
    ],
    cases: [
      [0, -9.65, 0, 5.3],
      [9.1, -5.2, Math.PI / 2, 2.1],
      [-9.1, -5.2, -Math.PI / 2, 2.1],
    ],
  },
];

export function crystalEnclosurePlan(stage) {
  const p = profiles[stage];
  if (!p) throw new RangeError("Unknown crystal enclosure");
  return {
    stage,
    name: p.name,
    points: p.points.map((v) => [...v]),
    cases: p.cases.map((v) => [...v]),
  };
}

export function crystalEnclosureSegments(stage) {
  const plan = crystalEnclosurePlan(stage);
  return plan.points.slice(0, -1).map((p, i) => {
    const q = plan.points[i + 1],
      dx = q[0] - p[0],
      dz = q[1] - p[1];
    return {
      x: (p[0] + q[0]) / 2,
      z: (p[1] + q[1]) / 2,
      length: Math.hypot(dx, dz),
      angle: Math.atan2(-dz, dx),
    };
  });
}

// Generate the material footprint from the same authored perimeter as the
// masonry. Use outer-edge distance and winding so concave reading wings do
// not acquire artificial seams along a triangulation's internal diagonals.
function floorShader() {
  const number = (n) => `(${n.toFixed(6)})`;
  const vector = (p) => `vec2(${number(p[0])}, ${number(p[1])})`;
  let source = `
float archiveEdgeSquared(vec2 p, vec2 a, vec2 b) {
  vec2 e = b-a, v = p-a;
  vec2 d = v-e*clamp(dot(v,e)/dot(e,e),0.0,1.0);
  return dot(d,d);
}
float archiveChamberEdge(vec2 p, int stage) {
  if(stage==0) return 100000.0;
`;
  for (let stage = 1; stage < profiles.length; stage++) {
    const points = profiles[stage].points;
    const minX = Math.min(...points.map((p) => p[0]));
    const maxX = Math.max(...points.map((p) => p[0]));
    const minZ = Math.min(...points.map((p) => p[1]));
    const maxZ = Math.max(...points.map((p) => p[1]));
    source += `if(stage==${stage}) {
      float boxEdge=max(max(${number(minX)}-p.x,p.x-${number(maxX)}),max(${number(minZ)}-p.y,p.y-${number(maxZ)}));
      if(boxEdge>.6) return boxEdge;
      float distanceSquared=1e12; bool inside=false;
    `;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      source += `distanceSquared=min(distanceSquared,archiveEdgeSquared(p,${vector(a)},${vector(b)}));\n`;
      if (a[1] !== b[1]) {
        const slope = (b[0] - a[0]) / (b[1] - a[1]);
        source += `if(((${number(a[1])}>p.y)!=(${number(b[1])}>p.y)) && p.x<${number(a[0])}+(p.y-${number(a[1])})*${number(slope)}) inside=!inside;\n`;
      }
    }
    source +=
      "return (inside?-1.0:1.0)*sqrt(max(distanceSquared,1e-8))+.25;\n}\n";
  }
  return source + "return 100000.0;\n}\n";
}

export const CRYSTAL_ENCLOSURE_FLOOR_GLSL = floorShader();
