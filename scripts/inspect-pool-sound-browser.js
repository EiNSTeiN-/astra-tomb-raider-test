import * as THREE from "three";

// Independent delivery check: raycast the actual sheet and interpolate its
// shader bed at the live emitter. This does not call the placement helper.
export function inspectPoolSounds(game) {
  const ray = new THREE.Raycaster(),
    direction = new THREE.Vector3(0, -1, 0);
  return game.soundSources
    .filter((s) => s.waterIndex !== undefined)
    .map((source) => {
      const water = game.waterMeshes[source.waterIndex];
      water.updateMatrixWorld(true);
      ray.set(
        new THREE.Vector3(source.x, water.position.y + 2, source.z),
        direction,
      );
      const hit = ray.intersectObject(water)[0],
        p = water.geometry.attributes.position,
        beds = water.geometry.attributes.bedHeight;
      let renderedDepth = null;
      if (hit && beds) {
        const triangle = new THREE.Triangle(
            ...[hit.face.a, hit.face.b, hit.face.c].map((i) =>
              new THREE.Vector3().fromBufferAttribute(p, i),
            ),
          ),
          barycentric = triangle.getBarycoord(
            water.worldToLocal(hit.point.clone()),
            new THREE.Vector3(),
          );
        renderedDepth =
          water.position.y -
          (barycentric.x * beds.getX(hit.face.a) +
            barycentric.y * beds.getX(hit.face.b) +
            barycentric.z * beds.getX(hit.face.c));
      }
      const voice = game.audio.voices.get(source.id);
      return {
        id: source.id,
        site: water.userData.id,
        kind: source.kind,
        source: {
          x: source.x,
          y: source.y,
          z: source.z,
          activity: source.activity,
        },
        surfaceY: water.position.y,
        floorDepth: water.position.y - game.groundHeight(source.x, source.z),
        renderedDepth,
        voice:
          voice && !voice.loading
            ? {
                distance: voice.distance,
                gain: voice.gain,
                blocked: voice.blocked,
                panner: {
                  x: voice.panner.positionX.value,
                  y: voice.panner.positionY.value,
                  z: voice.panner.positionZ.value,
                },
              }
            : null,
      };
    });
}
