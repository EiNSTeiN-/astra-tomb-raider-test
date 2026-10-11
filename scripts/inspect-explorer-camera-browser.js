import * as THREE from "three";

// Independent posed-surface rays. This measures geometric occlusion by the
// supplied opaque scenery, not the controller's arm or its collision bounds.
export function inspectExplorerCamera(
  game,
  obstructors,
  columns = 32,
  rows = 48,
) {
  if (![columns, rows].every((n) => Number.isInteger(n) && n > 0))
    throw Error("Positive integer sampling dimensions are required");
  if (
    obstructors.some(
      (mesh) => !mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh,
    )
  )
    throw Error(
      "Obstructors must be static meshes with delivered world transforms",
    );
  game.avatar.updateWorldMatrix(true, false);
  game.rig.model.updateMatrixWorld(true);
  game.camera.updateMatrixWorld(true);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    body = [],
    geometries = [],
    bounds = new THREE.Box3(),
    point = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    report = { rays: 0, bodyRays: 0, blocked: 0, invalid: 0, witnesses: [] };
  try {
    game.avatar.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.attributes.position,
        vertices = new Float32Array(position.count * 3),
        geometry = new THREE.BufferGeometry();
      geometries.push(geometry);
      for (let i = 0; i < position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        if (!point.toArray().every(Number.isFinite)) report.invalid++;
        vertices.set(point.toArray(), i * 3);
        bounds.expandByPoint(point);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      body.push(new THREE.Mesh(geometry, material));
    });
    if (!body.length || bounds.isEmpty() || report.invalid)
      throw Error("A finite visible explorer is required");
    const screen = new THREE.Box2();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(game.camera);
          screen.expandByPoint(new THREE.Vector2(p.x, p.y));
        }
    screen.min.clampScalar(-1, 1);
    screen.max.clampScalar(-1, 1);
    const scenery = obstructors
      .filter((mesh) => {
        for (let node = mesh; node; node = node.parent)
          if (!node.visible) return false;
        return true;
      })
      .map((mesh) => {
        mesh.updateWorldMatrix(true, false);
        const proxy = new THREE.Mesh(mesh.geometry, material);
        proxy.matrixAutoUpdate = false;
        proxy.matrix.copy(mesh.matrixWorld);
        proxy.updateMatrixWorld(true);
        proxy.name = mesh.material?.name || mesh.name;
        return proxy;
      });
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const ndc = new THREE.Vector2(
          THREE.MathUtils.lerp(screen.min.x, screen.max.x, (x + 0.5) / columns),
          THREE.MathUtils.lerp(screen.min.y, screen.max.y, (y + 0.5) / rows),
        );
        ray.setFromCamera(ndc, game.camera);
        ray.far = Infinity;
        report.rays++;
        const hit = ray.intersectObjects(body, false)[0];
        if (!hit) continue;
        report.bodyRays++;
        ray.far = Math.max(0, hit.distance - 0.015);
        const obstruction = ray.intersectObjects(scenery, false)[0];
        if (!obstruction) continue;
        report.blocked++;
        if (report.witnesses.length < 12)
          report.witnesses.push({
            ndc: ndc.toArray(),
            point: hit.point.toArray(),
            object: obstruction.object.name,
            distance: obstruction.distance,
          });
      }
    report.fraction = report.bodyRays ? report.blocked / report.bodyRays : null;
    return report;
  } finally {
    for (const geometry of geometries) geometry.dispose();
    material.dispose();
  }
}
