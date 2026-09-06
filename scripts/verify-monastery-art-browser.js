// Assisted development review; does not save or complete any objective.
import * as THREE from "three";

export function monasteryView(game, roomIndex = 0, time = 13) {
  const room = game.map.rooms[roomIndex],
    x = room.x * 7,
    z = room.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 14);
  game.elapsed = time;
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(x + 12, y + 8, z + 34);
  game.camera.lookAt(x, y + 9, z - 15);
  game.renderScene(0);
  return {
    camera: game.camera.position.toArray(),
    target: [x, y + 9, z - 15],
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}

export function inspectMonastery(game) {
  game.world.updateMatrixWorld(true);
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
        approach: course
          ? "climb entry and summit"
          : f.yOffset
            ? "raised mechanism"
            : "ground",
        clear:
          points.some((p) =>
            game.canMove(
              p.x,
              p.z,
              summit
                ? summit.y - game.groundHeight(p.x, p.z)
                : f.yOffset
                  ? f.group.position.y - game.groundHeight(p.x, p.z)
                  : 0,
            ),
          ) &&
          (!course || game.canMove(course.entry.x, course.entry.z, 0)),
      };
    });
  const wind = game.monasteryPatches.map((patch, i) => {
    const source = game.soundSources.find((s) => s.id === `ridge-wind-${i}`),
      expected = game.monasteryWindSources[i];
    return {
      id: source?.id,
      position: [source?.x, source?.y, source?.z],
      aligned:
        !!source &&
        new THREE.Vector3(source.x, source.y, source.z).distanceTo(
          new THREE.Vector3(expected.x, expected.y, expected.z),
        ) < 0.001,
      cordAttached: patch.flags.cord.parent === patch.root,
      clothAttached: patch.flags.mesh.parent === patch.root,
    };
  });
  return {
    approaches,
    wind,
    cameraSurfaces: game.cameraSurfaces.count,
    courts: game.monasteryPatches.map((p) => ({
      draws: p.root.children.length,
      roofs: p.roofs.length,
      detailVisible: p.detail.visible,
    })),
    environment: {
      sun: game.sunOffset.toArray(),
      sky: game.daylightSky.material.uniforms.sunPosition.value.toArray(),
      map: !!game.scene.environment,
    },
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      runnable: p.diagnostics?.runnable,
      vertex: p.diagnostics?.vertexShader?.log,
      fragment: p.diagnostics?.fragmentShader?.log,
    })),
  };
}
