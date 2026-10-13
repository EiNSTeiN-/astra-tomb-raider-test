import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";

// Intermediate bearings shape the galleries; the north facade and forward
// bird-perch piers keep their original positions. Coordinates stay inside the
// existing carved courts, with room for a body beside each outer footing.
const GALLERIES = [
  {
    style: "flared-porch",
    west: [
      [21, -7],
      [21, 7],
    ],
    east: [
      [21, -7],
      [21, 7],
    ],
  },
  {
    style: "inward-sun-gallery",
    east: [
      [15, -7],
      [15, 5],
    ],
  },
  {
    style: "root-dogleg",
    west: [
      [15, -8],
      [21, 6],
    ],
  },
  {
    style: "rain-court",
    west: [
      [16, -6],
      [16, 6],
    ],
    east: [
      [17, -9],
      [21, 6],
    ],
  },
  {
    style: "tapered-garden",
    east: [
      [20, -9],
      [16, 8],
    ],
  },
  {
    style: "unequal-witnesses",
    west: [
      [21, -8],
      [16, 6],
    ],
    east: [
      [16, -6],
      [21, 7],
    ],
  },
  {
    style: "moon-bend",
    west: [
      [17, -5],
      [14, 7],
    ],
  },
  {
    style: "oath-dogleg",
    east: [
      [14, -5],
      [18, 8],
    ],
  },
  {
    style: "broad-heart-court",
    west: [
      [21, -8],
      [21, 8],
    ],
    east: [
      [20, -7],
      [21, 7],
    ],
  },
];

export function templeGalleryPlan(index) {
  const profile = GALLERIES[index];
  if (!profile) throw new RangeError(`Unknown jungle temple gallery ${index}`);
  return {
    style: profile.style,
    wings: ["west", "east"]
      .filter((side) => profile[side])
      .map((side) => ({
        side,
        bearings: profile[side].map(([x, z]) => ({
          x: side === "west" ? -x : x,
          z,
          width: 2.65,
          gallery: true,
        })),
      })),
  };
}

// Copy the union of closed construction pieces before material batching.
// Separate shafts, foundation courses, facing backs and roof stones retain
// their openings. A gallery's broad box never fills its empty walking bays.
export function buildTempleGallerySolid(game, room, wing, meshes) {
  const placements = [...new Set(meshes)].map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return { geometry: mesh.geometry, matrices: [mesh.matrixWorld] };
  });
  const triangles = new TriangleSolids(placements, { layeredSupport: true });
  const bounds = new THREE.Box3();
  for (const piece of triangles.solids) bounds.union(piece.bounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const solid = {
    x: center.x,
    z: center.z,
    w: (bounds.max.x - bounds.min.x) / 2,
    d: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - game.groundHeight(center.x, center.z),
    fieldStation: `temple-gallery-${room.index}-${wing}`,
    templeGallery: true,
    bodyPadding: 0.6,
    supportRadius: 0,
    supportable: true,
    bodySupport: true,
    bounds,
    triangles,
  };
  game.obstacles.push(solid);
  return solid;
}
