import * as THREE from "three";

export function cavernView(game, index = 0, close = false) {
  const r = game.map.rooms[index],
    x = r.x * 7,
    z = r.z * 7,
    y = game.groundHeight(x, z);
  game.player.position.set(x, y, z + 8);
  game.updateCamera(1);
  game.updateDecorations(0);
  game.camera.position.set(
    x + (close ? 10 : 20),
    y + (close ? 5 : 8),
    z + (close ? -2 : 28),
  );
  game.camera.lookAt(
    x + (close ? 14 : 0),
    y + (close ? 3 : 5),
    z + (close ? -12 : -7),
  );
  game.renderScene(0);
  return {
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
  };
}

export function inspectCaverns(game) {
  const gl = game.renderer.getContext();
  const approaches = game.map.features
    .filter((f) => f.type !== "guardian")
    .map((f) => {
      const course = game.traversalCourses.find((c) => c.id === f.id),
        summit = course?.ledges.at(-1);
      return {
        id: f.id,
        clear:
          Array.from({ length: 24 }, (_, i) => ({
            x: f.x * 7 + Math.cos((i / 24) * Math.PI * 2) * 2.1,
            z: f.z * 7 + Math.sin((i / 24) * Math.PI * 2) * 2.1,
          })).some((p) =>
            game.canMove(
              p.x,
              p.z,
              summit ? summit.y - game.groundHeight(p.x, p.z) : f.yOffset || 0,
            ),
          ) &&
          (!course || game.canMove(course.entry.x, course.entry.z, 0)),
      };
    });
  return {
    approaches,
    chunks: game.cavernMeshes.length,
    camera: game.cameraSurfaces.count,
    clusters: game.cavernPatches.reduce((n, p) => n + p.centers.length, 0),
    lights: game.cavernLights.length,
    emitters: game.soundSources
      .filter((s) => s.cavernRoom !== undefined)
      .map((s) => ({
        id: s.id,
        activity: s.activity,
        frontClear: game.lineOfSight(
          new THREE.Vector3(
            s.x + s.faceX * 4,
            game.groundHeight(s.x + s.faceX * 4, s.z + s.faceZ * 4),
            s.z + s.faceZ * 4,
          ),
          new THREE.Vector3(s.x, s.y - 1.4, s.z),
        ),
      })),
    drips: game.cavernDrips.sites.map((s) => ({
      id: s.id,
      top: s.top,
      floor: s.floor,
      ring: s.ring.position.y,
      source: game.soundSources.find((source) => source.id === s.id)?.y,
    })),
    programs: game.renderer.info.programs.map((p) => ({
      name: p.name,
      linked: gl.getProgramParameter(p.program, gl.LINK_STATUS),
      log: gl.getProgramInfoLog(p.program),
    })),
  };
}
