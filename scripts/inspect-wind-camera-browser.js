// Static camera inspection; repositioning here does not demonstrate traversal.
import * as THREE from "three";
import { constrainCamera } from "../src/camera-collision.js";
import { updateWindCourts } from "../src/wind-courts.js";
import {
  windCameraStandoff,
  windCameraSpace,
  frameWindControl,
} from "../src/wind-camera.js";

const offsetFor = (yaw, pitch) =>
  new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * 5.3,
    Math.sin(pitch) * 5.3 + 0.2,
    Math.cos(yaw) * Math.cos(pitch) * 5.3,
  );

export function inspectWindCameraClearance(game) {
  if (!game.windSites?.length) throw Error("Load the sky chapter first");
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const original = game.player.position.clone(),
    ray = new THREE.Raycaster(),
    samples = [],
    violations = [];
  try {
    for (const site of game.windSites) {
      for (const control of [
        site.tablet,
        ...site.nodes.map((node) => node.control).filter(Boolean),
      ]) {
        game.player.position.copy(control.group.position);
        updateWindCourts(game, 0);
        game.world.updateMatrixWorld(true);
        const chest = game.player.position
            .clone()
            .add(new THREE.Vector3(0, 1.3, 0)),
          standoff = windCameraStandoff(game),
          target = chest.clone().add(new THREE.Vector3(0, 0, standoff)),
          meshes = [];
        for (const other of game.windSites)
          other.root.traverseVisible((object) => {
            if (
              object.isMesh &&
              object.material.isMeshStandardMaterial &&
              !object.material.transparent
            )
              meshes.push(object);
          });
        for (let orbit = 0; orbit < 8; orbit++) {
          const yaw = 2.2 + (orbit * Math.PI) / 4,
            desired = target.clone().add(offsetFor(yaw, 0.13)),
            camera = constrainCamera(
              target,
              desired,
              game.cameraSurfaces,
              (point) => windCameraSpace(game, point, chest, standoff),
            ),
            direction = camera.clone().sub(target),
            length = direction.length();
          ray.set(target, direction.normalize());
          ray.far = Math.max(0, length - 0.001);
          const hit = ray.intersectObjects(meshes, false)[0],
            sample = {
              control: control.id,
              orbit,
              arm: length,
              clear: windCameraSpace(game, camera, chest, standoff),
              castingEntry: game.cameraSurfaces.entry(target, camera, 0),
              actorEntry: game.cameraSurfaces.entry(chest, camera, 0),
              hit: hit
                ? { mesh: hit.object.name, distance: hit.distance }
                : null,
            };
          samples.push(sample);
          if (!sample.clear || sample.castingEntry < 0.999 || hit)
            violations.push(sample);
        }
      }
    }
  } finally {
    game.player.position.copy(original);
    updateWindCourts(game, 0);
  }
  return { samples, violations };
}

export function windCameraView(
  game,
  stage,
  index,
  yaw = 2.2,
  pitch = 0.13,
  guide = false,
) {
  const site = game.windSites[stage],
    control = index < 0 ? site?.tablet : site?.nodes[index]?.control;
  if (!control) throw Error("Choose a wind tablet or working handwheel");
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  game.player.position.copy(control.group.position);
  game.yaw = yaw;
  game.pitch = pitch;
  game.updateDecorations(0);
  const guided = guide && index >= 0 && frameWindControl(game);
  game.updateCamera(10);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    control: control.id,
    player: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    arm: game.camera.position.distanceTo(game.cameraFollowTarget),
    requested: { yaw, pitch },
    guided,
    yaw: game.yaw,
    pitch: game.pitch,
    coverage: game.rig.visibility.uniform.value,
    bodyClear:
      game.cameraSurfaces.entry(
        game.player.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
        game.camera.position,
        0,
      ) >= 0.999,
    quality: game.store.data.settings.quality,
    linked: game.renderer.info.programs.every((program) =>
      gl.getProgramParameter(program.program, gl.LINK_STATUS),
    ),
    calls: game.renderer.info.render.calls,
    triangles: game.renderer.info.render.triangles,
    image: game.renderer.domElement.toDataURL("image/png"),
  };
}
