import * as THREE from "three";

// Assisted arrival checks at ground approaches and supported traversal ledges.
// Returns explicit omissions; this is not a traversal or gameplay completion test.
export function inspectCameraArrivals(game) {
  const saved = {
      position: game.player.position.clone(),
      camera: game.camera.position.clone(),
      rotation: game.camera.quaternion.clone(),
      yaw: game.yaw,
      pitch: game.pitch,
      avatar: game.avatar.rotation.y,
      visible: game.avatar.visible,
      progressPosition: game.progress.position,
      progressCamera: game.progress.camera,
    },
    records = [];
  const inspect = (id, point, next, kind) => {
    game.player.position.set(
      point.x,
      point.y ?? game.groundHeight(point.x, point.z),
      point.z,
    );
    game.progress.position = { x: point.x, z: point.z };
    game.progress.camera = null;
    game.restoreCamera(next);
    const target = game.player.position
      .clone()
      .add(new THREE.Vector3(0, 1.3, 0));
    records.push({
      id,
      kind,
      point: game.player.position.toArray(),
      distance: game.camera.position.distanceTo(target),
      visible: game.avatar.visible,
      space: game.cameraSpace(game.camera.position),
      entry: game.cameraSurfaces.entry(target, game.camera.position),
      yaw: game.yaw,
      pitch: game.pitch,
    });
  };
  try {
    for (const feature of game.map.features.filter((f) =>
      ["field", "mechanism", "camp"].includes(f.type),
    )) {
      const course = game.traversalCourses?.find((c) => c.id === feature.id),
        candidates = course?.entry ? [course.entry] : [];
      for (const radius of [2.4, 3.6, 5, 7, 10])
        for (let i = 0; i < 24; i++)
          candidates.push({
            x: feature.x * 7 + Math.sin((i * Math.PI) / 12) * radius,
            z: feature.z * 7 + Math.cos((i * Math.PI) / 12) * radius,
          });
      const point = candidates.find((p) =>
        game.canMove(
          p.x,
          p.z,
          p.y == null ? 0 : p.y - game.groundHeight(p.x, p.z),
        ),
      );
      if (point) inspect(feature.id, point, feature, "approach");
      else records.push({ id: feature.id, kind: "approach", skipped: true });
    }
    for (const course of game.traversalCourses || [])
      for (const [index, ledge] of course.ledges.entries()) {
        if (
          !game.canMove(
            ledge.x,
            ledge.z,
            ledge.y - game.groundHeight(ledge.x, ledge.z),
          )
        ) {
          records.push({
            id: `${course.id}/${index}`,
            kind: "ledge",
            skipped: true,
          });
          continue;
        }
        inspect(
          `${course.id}/${index}`,
          ledge,
          { x: course.entry.x / 7, z: course.entry.z / 7 },
          "ledge",
        );
      }
  } finally {
    game.player.position.copy(saved.position);
    game.camera.position.copy(saved.camera);
    game.camera.quaternion.copy(saved.rotation);
    game.camera.updateMatrixWorld();
    game.yaw = saved.yaw;
    game.pitch = saved.pitch;
    game.avatar.rotation.y = saved.avatar;
    game.avatar.visible = saved.visible;
    game.progress.position = saved.progressPosition;
    game.progress.camera = saved.progressCamera;
  }
  return records;
}
