// Independent delivered-buffer queries for the ten perimeter assemblies.
import * as THREE from "three";
import { closedMeshReader } from "./inspect-explorer-solids-browser.js";

export function arcadePartMeshes(patch) {
  patch.root.updateWorldMatrix(true, true);
  const positions = new Map(patch.parts.map((part) => [part.id, []]));
  patch.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position,
      tag = mesh.geometry.attributes.arcadePart,
      index = mesh.geometry.index;
    if (!tag) throw Error("Missing delivered arcade part tags");
    for (let i = 0; i < (index?.count ?? p.count); i++) {
      const j = index ? index.getX(i) : i,
        v = new THREE.Vector3()
          .fromBufferAttribute(p, j)
          .applyMatrix4(mesh.matrixWorld);
      positions.get(tag.getX(j)).push(...v.toArray());
    }
  });
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    meshes = new Map();
  for (const part of patch.parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions.get(part.id), 3),
    );
    geometry.computeBoundingBox();
    meshes.set(part.id, new THREE.Mesh(geometry, material));
  }
  return {
    meshes,
    dispose() {
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      material.dispose();
    },
  };
}

export function inspectArcadeBearings(game, { raiseHeads = 0 } = {}) {
  const report = {
    courts: 0,
    bearings: 0,
    queries: 0,
    contacts: 0,
    failures: [],
    styles: [],
  };
  for (const [room, patch] of game.desertPatches.entries()) {
    const delivered = arcadePartMeshes(patch);
    report.courts++;
    report.styles.push(patch.plan.style);
    try {
      const readers = new Map();
      for (const pier of patch.plan.piers) {
        const key = `${pier.x},${pier.z}`;
        readers.set(
          key,
          closedMeshReader(
            patch.parts
              .filter((p) => p.pier === key && p.kind !== "perch seat")
              .map((p) => delivered.meshes.get(p.id)),
          ),
        );
      }
      for (const part of patch.parts.filter((p) => p.foot)) {
        const span = patch.plan.spans[part.span],
          mesh = delivered.meshes.get(part.id),
          p = mesh.geometry.attributes.position,
          minimum = mesh.geometry.boundingBox.min.y,
          samples = [];
        for (let i = 0; i < p.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(p, i),
            b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
            c = new THREE.Vector3().fromBufferAttribute(p, i + 2),
            n = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
          if (n.y > -0.15) continue;
          for (let u = 0; u <= 8; u++)
            for (let v = 0; v <= 8 - u; v++) {
              const point = a
                .clone()
                .multiplyScalar(1 - (u + v) / 8)
                .addScaledVector(b, u / 8)
                .addScaledVector(c, v / 8);
              if (point.y <= minimum + 0.14) {
                point.y += raiseHeads;
                samples.push(point);
              }
            }
        }
        for (const side of part.side ? [part.side] : [-1, 1]) {
          const end = side < 0 ? span.a : span.b,
            key = `${end.x},${end.z}`,
            read = readers.get(key);
          let contacts = 0;
          for (const point of samples) {
            report.queries++;
            if ((read(point) ?? 0) > 0.001) contacts++;
          }
          report.bearings++;
          report.contacts += contacts;
          if (contacts < 3)
            report.failures.push({
              room,
              span: part.span,
              pier: key,
              queries: samples.length,
              contacts,
            });
        }
      }
    } finally {
      delivered.dispose();
    }
  }
  return report;
}
