import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";
import { stationMeshSolid } from "./field-station-solids.js";

// Close the dressed joints and attach the tall plaque without consuming the
// caller's masonry or weathering seeds. Existing arcades and rubble stay intact.
export function buildTempleCrownSupport(game, options) {
  const {
    room,
    root,
    material,
    blockGeometry,
    crownY,
    roof,
    bodyParts,
    panel,
  } = options;
  let parts = 0,
    triangles = 0;
  const core = (width, height, depth, y, z = -18) => {
    const geometry = blockGeometry(
      width,
      height,
      depth,
      game.level.seed + 90001 + room.index * 101 + parts,
      0.029,
    );
    const p = geometry.attributes.position,
      colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const weather = 0.86 + 0.14 * (p.getY(i) / height + 0.5);
      colors.set([0.82 * weather, 0.805 * weather, 0.77 * weather], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    bodyParts.push(mesh);
    parts++;
    triangles += p.count / 3;
  };
  for (let tier = 0; tier < (room.index === 8 ? 8 : 5); tier++) {
    core(
      (room.index === 8 ? 17 : 12) - tier * 1.65 - 0.1,
      0.74,
      4.4 - tier * 0.5,
      crownY + tier * 0.65 + 0.03,
    );
  }
  // A seated vertical stele carries the carving where the pediment steps back.
  // Its deepest recess is 5 mm outside the closed backing, with the border
  // safely inside the stele's bevels. The body remains when detail is culled.
  core(3.25, 2.94, 3.7, crownY + 1.15, -17.5);
  panel.position.set(0, crownY - 0.26, -15.56);

  const placements = bodyParts.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
    return { geometry: mesh.geometry, matrices: [mesh.matrixWorld] };
  });
  const kernel = new TriangleSolids(placements, { layeredSupport: true });
  const bounds = new THREE.Box3();
  for (const shape of kernel.solids) bounds.union(shape.bounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const feature = { id: `temple-crown-${room.index}` };
  const solid = {
    x: center.x,
    z: center.z,
    w: (bounds.max.x - bounds.min.x) / 2,
    d: (bounds.max.z - bounds.min.z) / 2,
    h: bounds.max.y - game.groundHeight(center.x, center.z),
    fieldStation: feature.id,
    templeCrown: true,
    bodyPadding: 0.4,
    supportRadius: 0,
    supportable: true,
    bodySupport: true,
    bounds,
    triangles: kernel,
  };
  game.obstacles.push(solid);
  const contact = stationMeshSolid(game, feature, panel, {
    supportRadius: 0,
    bodySupport: false,
    layeredSupport: true,
  });
  contact.templeCrown = true;
  contact.node = panel.parent;
  return { parts, triangles, roof, bounds, solid };
}
