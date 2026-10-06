import * as THREE from "three";
import { stationSolid } from "./field-station-solids.js";
import { footprintMinimum } from "./masonry-foundations.js";

export function fitCipherPedestal(game, template, x, y, z) {
  template.computeBoundingBox();
  const size = template.boundingBox.getSize(new THREE.Vector3()),
    bottom = Math.min(
      0,
      footprintMinimum(
        (px, pz) => game.groundHeight(px, pz),
        x,
        z,
        size.x,
        size.z,
        game.terrainProfile?.step,
      ) -
        y -
        0.025,
    ),
    geometry = template.clone(),
    position = geometry.attributes.position,
    uv = geometry.attributes.uv,
    points = template.parameters.points,
    density = 1 / ((points.length - 1) * (points[2].y - points[1].y));
  // Bury the complete bottom below its terrain cells, retaining the shaped
  // upper pedestal and the skirt's original vertical texture density.
  for (let i = 0; i < position.count; i++)
    if (position.getY(i) < 0.0001) {
      uv.setY(i, uv.getY(i) + (bottom - position.getY(i)) * density);
      position.setY(i, bottom);
    }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// The spindle's old body box ends behind the bronze handwheel. Register the
// delivered drive separately so walking cannot put the explorer inside it.
export function addCipherDriveSolid(game, feature, root, body, wheel, shaft) {
  const box = new THREE.Box3();
  for (const mesh of [wheel, shaft]) {
    mesh.geometry.computeBoundingBox();
    mesh.updateMatrix();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));
  }
  const size = box.getSize(new THREE.Vector3()),
    center = box.getCenter(new THREE.Vector3()).add(body.position);
  return stationSolid(game, feature, root, size.toArray(), center.toArray(), {
    // Keep the supported handwheel stance clear, with a body margin around
    // the drive. The wheel is not a landing or mantle target.
    bodyPadding: 0.32,
    support: false,
  });
}
