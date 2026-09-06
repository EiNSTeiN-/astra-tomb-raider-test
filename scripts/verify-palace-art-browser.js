import * as THREE from "three";

// Development review only: the camera helper changes the observer without saving.
export function palaceView(game, roomIndex = 0) {
  const room = game.map.rooms[roomIndex],
    x = room.x * 7,
    z = room.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 14);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(x + 12, y + 7, z + 33);
  game.camera.lookAt(x, y + 6, z - 10);
  game.renderScene(0);
  return {
    camera: game.camera.position.toArray(),
    target: [x, y + 6, z - 10],
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}

export function inspectPalace(game) {
  game.world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  const birds = game.birds.map(({ bird }) => {
    const p = bird.position;
    ray.ray.origin.set(p.x, p.y + 0.1, p.z);
    const hit = ray.intersectObjects(
      game.palacePatches.map((p) => p.root),
      true,
    )[0];
    const source = game.soundSources.find(
      (s) => s.kind === "birds" && s.x === p.x && s.z === p.z,
    );
    return {
      position: p.toArray(),
      supportGap: hit ? p.y - hit.point.y : null,
      sourceY: source?.y,
    };
  });
  const approaches = game.map.features
    .filter((f) => f.type !== "guardian")
    .map((f) => {
      const course = game.traversalCourses.find((c) => c.id === f.id),
        summit = course?.ledges.at(-1);
      const points = Array.from({ length: 24 }, (_, i) => ({
        x: f.x * 7 + Math.cos((i / 24) * Math.PI * 2) * 2.1,
        z: f.z * 7 + Math.sin((i / 24) * Math.PI * 2) * 2.1,
      }));
      return {
        id: f.id,
        clear:
          points.some((p) =>
            game.canMove(
              p.x,
              p.z,
              summit ? summit.y - game.groundHeight(p.x, p.z) : 0,
            ),
          ) &&
          (!course || game.canMove(course.entry.x, course.entry.z, 0)),
        approach: course ? "entry and summit" : "ground",
      };
    });
  const gl = game.renderer.getContext();
  return {
    birds,
    approaches,
    cameraSurfaces: game.cameraSurfaces.count,
    trees: game.woodland.length,
    courts: game.palacePatches.map((p) => ({
      draws: p.root.children.length,
      triangles: p.triangles,
      detail: p.detail.visible,
    })),
    environment: {
      sun: game.sunOffset.toArray(),
      sky: game.daylightSky.material.uniforms.sunPosition.value.toArray(),
      map: !!game.scene.environment,
    },
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
      log: gl.getProgramInfoLog(p.program),
    })),
  };
}
