import * as THREE from "three";

export function forgeView(game, index = 0, close = false) {
  const room = game.map.rooms[index],
    x = room.x * 7,
    z = room.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 14);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(
    x + (close ? 10 : 12),
    y + (close ? 5 : 7),
    z + (close ? 3 : 33),
  );
  game.camera.lookAt(
    x + (close ? 12 : 0),
    y + (close ? 5 : 6),
    z - (close ? 21 : 10),
  );
  game.renderScene(0);
  return {
    camera: game.camera.position.toArray(),
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}

export function inspectForge(game) {
  const gl = game.renderer.getContext();
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
      };
    });
  return {
    approaches,
    cameraSurfaces: game.cameraSurfaces.count,
    courts: game.forgePatches.map((p) => ({
      index: p.index,
      triangles: p.triangles,
      draws: p.root.children.length,
      state: { ...p.state },
      emitters: game.soundSources
        .filter((s) => s.forgeRoom === p.index)
        .map((s) => ({
          id: s.id,
          activity: s.activity,
          frontClear: game.lineOfSight(
            new THREE.Vector3(s.x, game.groundHeight(s.x, s.z + 8), s.z + 8),
            new THREE.Vector3(s.x, s.y - 1.4, s.z),
          ),
        })),
    })),
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
      log: gl.getProgramInfoLog(p.program),
    })),
  };
}
