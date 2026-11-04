import * as THREE from "three";

// Compare the delivered draw corners, including cut triangles and their world
// transform. This does not read the height field or the fitting implementation.
export function inspectTerrainNormals(game, witnessLimit = 32) {
  const point = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    face = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    report = {
      faces: 0,
      corners: 0,
      opposing: 0,
      invalid: 0,
      degenerate: 0,
      minimumDot: 1,
      maximumLengthError: 0,
      witnesses: [],
    };
  for (const mesh of game.terrainMeshes) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal,
      index = mesh.geometry.index,
      count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
      for (let j = 0; j < 3; j++)
        point[j].fromBufferAttribute(p, ids[j]).applyMatrix4(mesh.matrixWorld);
      face.crossVectors(
        ab.subVectors(point[1], point[0]),
        ac.subVectors(point[2], point[0]),
      );
      report.faces++;
      if (!Number.isFinite(face.lengthSq())) {
        report.invalid++;
        continue;
      }
      if (face.lengthSq() < 1e-20) {
        report.degenerate++;
        continue;
      }
      face.normalize();
      for (let j = 0; j < 3; j++) {
        normal.fromBufferAttribute(n, ids[j]);
        report.corners++;
        const length = normal.length();
        if (!Number.isFinite(length) || length < 1e-8) {
          report.invalid++;
          continue;
        }
        report.maximumLengthError = Math.max(
          report.maximumLengthError,
          Math.abs(1 - length),
        );
        // terrainMaterial delivers mat3(modelMatrix) * normal to this varying.
        normal.transformDirection(mesh.matrixWorld);
        const dot = normal.dot(face);
        report.minimumDot = Math.min(report.minimumDot, dot);
        if (dot < -1e-6) {
          report.opposing++;
          if (report.witnesses.length < witnessLimit)
            report.witnesses.push({
              point: point[j].toArray(),
              dot,
              normal: normal.toArray(),
              face: face.toArray(),
            });
        }
      }
    }
  }
  return report;
}

export function verifyTerrainNormals(game) {
  const accepted = inspectTerrainNormals(game),
    saved = [];
  if (accepted.opposing || accepted.invalid || accepted.degenerate)
    throw Error("Invalid terrain shading: " + JSON.stringify(accepted));
  try {
    const seen = new Set();
    for (const mesh of game.terrainMeshes) {
      const n = mesh.geometry.attributes.normal;
      if (seen.has(n)) continue;
      seen.add(n);
      saved.push([n, n.array.slice()]);
      for (let i = 0; i < n.count; i++)
        n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
      n.needsUpdate = true;
    }
    const reversed = inspectTerrainNormals(game);
    if (reversed.opposing !== accepted.corners)
      throw Error("Reversed terrain control missed draw corners");
    return { accepted, reversedOpposing: reversed.opposing };
  } finally {
    for (const [n, bytes] of saved) {
      n.array.set(bytes);
      n.needsUpdate = true;
    }
  }
}
