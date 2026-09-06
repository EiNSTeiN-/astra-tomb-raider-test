// Development-only diagnostics. Call with a prepared desert expedition.
import * as THREE from "three";

export function inspectDesert(game) {
  game.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const birds = game.birds.map(({ bird }) => {
    const p = bird.position;
    ray.set(
      new THREE.Vector3(p.x, p.y + 0.1, p.z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObjects(
      game.desertPatches.map((p) => p.root),
      true,
    )[0];
    const source = game.soundSources.find(
      (s) => s.kind === "birds" && s.x === p.x && s.z === p.z,
    );
    return {
      position: p.toArray(),
      supportY: hit?.point.y,
      sourceY: source?.y,
      gap: hit ? p.y - hit.point.y : null,
    };
  });
  const approaches = game.map.features
    .filter((f) => f.type !== "guardian")
    .map((f) => {
      const course = game.traversalCourses.find((c) => c.id === f.id);
      const summit = course?.ledges.at(-1);
      const points = Array.from({ length: 24 }, (_, i) => ({
        x: f.x * 7 + Math.cos((i / 24) * Math.PI * 2) * 2.1,
        z: f.z * 7 + Math.sin((i / 24) * Math.PI * 2) * 2.1,
      }));
      return {
        id: f.id,
        approach: course ? "climb entry and summit" : "ground",
        clear:
          points.some((p) =>
            game.canMove(
              p.x,
              p.z,
              summit ? summit.y - game.groundHeight(p.x, p.z) : 0,
            ),
          ) &&
          (!course || game.canMove(course.entry.x, course.entry.z, 0)),
      };
    });
  return {
    birds,
    approaches,
    cameraSurfaces: game.cameraSurfaces.count,
    courts: game.desertPatches.map((p) => ({
      blocks: p.blocks,
      triangles: p.triangles,
      draws: p.root.children.length,
      detailVisible: p.detail.visible,
    })),
    palms: game.palmPatches.map((p) => p.counts),
    environment: {
      sun: game.sunOffset.toArray(),
      sky: game.daylightSky.material.uniforms.sunPosition.value.toArray(),
      map: !!game.scene.environment,
    },
  };
}

export function desertView(game, roomIndex = 0) {
  const room = game.map.rooms[roomIndex],
    x = room.x * 7,
    z = room.z * 7,
    y = game.groundHeight(x, z);
  // Move only this assisted review's observer/camera; do not call save().
  game.player.position.set(x, y, z + 14);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(x + 12, y + 6, z + 30);
  game.camera.lookAt(x, y + 5, z - 12);
  game.renderScene(0);
  return {
    camera: game.camera.position.toArray(),
    target: [x, y + 5, z - 12],
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}
