import { poseCleft } from "./cleft-pose.js";
import { CROUCH_DROP } from "./stealth.js";
import * as THREE from "three";
import { updateTorch, poseTorch } from "./torch.js";
import { cableHands } from "./return-cable.js";
import { poseCableGrip, restoreCableGrip } from "./hand-grip.js";
import { galleryWheelBrace, poseGalleryWheel } from "./gallery-wheel.js";
import { poseCausewayWheel } from "./fire-vault-motion.js";
import { posePressureOperation } from "./pressure-motion.js";
import { poseOrbitBearing } from "./orbit-motion.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { poseHands, poseFeet } from "./pose.js";
import { groundExplorer } from "./explorer-grounding.js";
import { galleryAt, galleryBellAt } from "./sunken-gallery-layout.js";

function equipmentSurface(material) {
  const canvas = /canvas|bottle/.test(material.name);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 equipmentPoint;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nequipmentPoint=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 equipmentPoint;
      float gearNoise(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float thread=sin(equipmentPoint.x*3600.0)*sin(equipmentPoint.y*3600.0)*sin(equipmentPoint.z*3600.0);
      float grain=gearNoise(floor(equipmentPoint*1700.0));
      float wear=sin(equipmentPoint.y*44.0+sin(equipmentPoint.x*31.0))*sin(equipmentPoint.z*38.0);
      diffuseColor.rgb*= ${canvas ? ".92+thread*.035+grain*.09+wear*.055" : ".94+grain*.09+wear*.025"};`,
      );
  };
  material.customProgramCacheKey = () => `vesper-equipment-${canvas}`;
}
function sidearm(game) {
  const group = new THREE.Group();
  group.userData.actor = true;
  const steel = new THREE.MeshStandardMaterial({
    color: 0x484b47,
    metalness: 0.75,
    roughness: 0.36,
  });
  const grip = new THREE.MeshStandardMaterial({
    color: 0x352e28,
    roughness: 0.82,
  });
  const part = (size, p, mat) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 1, 0.005), mat);
    mesh.position.set(...p);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  part([0.037, 0.045, 0.185], [0, 0.03, 0.06], steel);
  part([0.032, 0.077, 0.044], [0, -0.017, 0.011], grip).rotation.x = -0.18;
  part([0.044, 0.008, 0.016], [0, 0.057, 0.12], steel);
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.021, 0.003, 6, 16),
    steel,
  );
  guard.rotation.y = Math.PI / 2;
  guard.position.set(0, -0.005, 0.049);
  group.add(guard);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, 0.158);
  group.add(muzzle);
  group.visible = false;
  game.world.add(group);
  return { group, muzzle };
}
export async function loadExplorer(game) {
  const player = game.player,
    avatar = game.avatar;
  const gltf = await new GLTFLoader(game.assetBatch?.manager).loadAsync(
    "/assets/characters/vesper.glb",
  );
  if (game.player !== player) {
    gltf.scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    return;
  }
  const model = gltf.scene;
  // The delivery asset is already in metres, faces +Z and has soles at zero.
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    o.material.envMapIntensity = 0.65;
    if (o.material.name.startsWith("Equipment ")) equipmentSurface(o.material);
    if (o.material.name === "Skin") {
      o.material.roughness = 0.59;
      o.material.envMapIntensity = 0.4;
    }
  });
  const materials = new Set();
  for (const child of [...avatar.children]) {
    child.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) materials.add(o.material);
    });
    avatar.remove(child);
  }
  materials.forEach((m) => m.dispose());
  avatar.add(model);
  const mixer = new THREE.AnimationMixer(model),
    actions = {};
  for (const clip of gltf.animations)
    actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  mixer.update(0.1);
  game.rig = { model, mixer, actions, state: "Idle", weapon: sidearm(game) };
  game.renderOnce = true;
}

export function explorerGait(game, moving, sprinting) {
  if (
    !moving ||
    game.swimming ||
    game.climb ||
    game.ropeRide ||
    (game.zipRide && !game.zipRide.approach) ||
    !game.grounded
  )
    return { name: "Idle", rate: 1 };
  const requestedSpeed = Math.hypot(
    game.moveVelocity?.x || 0,
    game.moveVelocity?.z || 0,
  );
  const speed = game.blockGrip
    ? requestedSpeed
    : (game.actualMoveSpeed ?? requestedSpeed);
  if (!game.blockGrip && speed < 0.12) return { name: "Idle", rate: 1 };
  if (game.blockGrip)
    return {
      name: "Walk",
      rate:
        Math.max(0.25, Math.min(1.25, speed / 2.4)) *
        (game.blockGrip.move?.pull ? -1 : 1),
    };
  return sprinting
    ? { name: "Run", rate: 1.5 }
    : speed > 4.3
      ? { name: "Run", rate: 1 }
      : { name: "Walk", rate: Math.max(0.75, Math.min(1.6, speed / 2.4)) };
}
export function animateExplorer(game, dt, moving, sprinting) {
  updateTorch(game);
  const rig = game.rig;
  if (!rig) return;
  restoreCableGrip(game);
  const gait = explorerGait(game, moving, sprinting);
  if (gait.name !== rig.state) {
    const action = rig.actions[gait.name];
    action.reset().setEffectiveWeight(1).play();
    rig.actions[rig.state]?.crossFadeTo(action, 0.18, true);
    rig.state = gait.name;
  }
  rig.actions[gait.name].setEffectiveTimeScale(gait.rate);
  rig.mixer.update(dt);
  rig.crouchBlend = THREE.MathUtils.damp(
    rig.crouchBlend || 0,
    game.crouching ? 1 : 0,
    14,
    dt,
  );
  if (
    !game.grounded ||
    game.swimming ||
    game.climb ||
    game.ropeRide ||
    game.zipRide
  )
    rig.crouchBlend = 0;
  const hanging = !!game.ropeRide || !!(game.zipRide && !game.zipRide.approach);
  rig.hangLift = hanging
    ? 0.4
    : game.wallGrip
      ? 0.4
      : (rig.hangLift || 0) * Math.exp(-dt * 14);
  game.avatar.position.y = rig.hangLift;
  game.avatar.position.x = 0;
  game.avatar.position.z = 0;
  rig.model.rotation.x = rig.crouchBlend * 0.12;
  rig.weapon.group.visible = false;
  if (game.blockGrip) {
    rig.model.rotation.x = 0.14;
    game.avatar.rotation.y = Math.atan2(
      game.blockGrip.axis[0],
      game.blockGrip.axis[1],
    );
  } else if (
    game.grounded &&
    !game.swimming &&
    !game.climb &&
    !hanging &&
    game.aimUntil > game.elapsed &&
    !game.carrying &&
    !game.dodge
  )
    game.avatar.rotation.y = (game.aimYaw ?? game.yaw) + Math.PI;
  groundExplorer(game, dt, moving, sprinting);
  const rotation = game.avatar.getWorldQuaternion(new THREE.Quaternion());
  const point = (x, y, z) =>
    new THREE.Vector3(x, y, z)
      .applyQuaternion(rotation)
      .add(game.player.position);
  if (!game.swimming) {
    rig.bellFloat = undefined;
    rig.wheelBrace = 0;
  }
  if (game.swimming) {
    const p = game.player.position;
    const floating =
      !game.diving &&
      galleryAt(game, p.x, p.y, p.z) &&
      galleryBellAt(game, p.x, p.z);
    rig.bellFloat = THREE.MathUtils.damp(
      rig.bellFloat ?? (floating ? 1 : 0),
      floating ? 1 : 0,
      6,
      dt,
    );
    rig.wheelBrace = Math.max(
      galleryWheelBrace(game),
      (rig.wheelBrace || 0) - dt * 5,
    );
    const float = Math.max(rig.bellFloat, rig.wheelBrace);
    rig.model.rotation.x = 1.25 - 1.13 * float;
    game.avatar.position.y -= 1.05 * float;
    const offset = new THREE.Vector3(0, 0, -0.65 * (1 - float)).applyQuaternion(
      rotation,
    );
    game.avatar.position.x = offset.x;
    game.avatar.position.z = offset.z;
    poseHands(
      game,
      [1, -1].map((side, i) => {
        const phase = game.elapsed * 4 + i * Math.PI;
        return point(
          side * (0.38 + 0.18 * Math.cos(phase)),
          THREE.MathUtils.lerp(
            0.27 + 0.13 * Math.sin(phase),
            0.05 + 0.025 * Math.sin(phase),
            float,
          ),
          THREE.MathUtils.lerp(0.6 + 0.48 * Math.sin(phase), 0.12, float),
        );
      }),
    );
    poseFeet(
      game,
      [1, -1].map((side, i) =>
        point(
          side * 0.12,
          -0.15 - float + 0.09 * Math.sin(game.elapsed * 7 + i * Math.PI),
          THREE.MathUtils.lerp(-0.7, 0.1, float),
        ),
      ),
    );
    poseGalleryWheel(game);
  } else if (game.wallGrip) {
    poseCleft(game);
  } else if (game.ropeRide || (game.zipRide && !game.zipRide.approach)) {
    const handles = cableHands(game);
    if (!poseCableGrip(game, handles))
      poseHands(
        game,
        handles ||
          game.player.position.clone().add(new THREE.Vector3(0, 2.15, 0)),
      );
    poseFeet(game, [point(0.12, 0.16, 0.02), point(-0.12, 0.28, 0.05)]);
  } else if (game.climb) {
    const c = game.climb,
      t = Math.min(1, c.time / 0.85),
      direction = c.end.clone().sub(c.start).setY(0).normalize();
    rig.model.rotation.x = 0.16 * Math.sin(t * Math.PI);
    const edge = c.start.clone().addScaledVector(direction, 0.75);
    edge.y = c.end.y + 0.045;
    const release = THREE.MathUtils.smoothstep(t, 0.65, 1);
    poseHands(
      game,
      [1, -1].map((side) =>
        edge
          .clone()
          .add(new THREE.Vector3(side * 0.2, 0, 0).applyQuaternion(rotation))
          .lerp(point(side * 0.22, 0.62, 0.25), release),
      ),
    );
    poseFeet(game, [
      point(0.12, 0.15, -0.16),
      point(-0.12, 0.42 * Math.sin(t * Math.PI), 0.18),
    ]);
  } else if (!game.grounded) {
    poseHands(game, [point(0.44, 1.08, 0.12), point(-0.44, 1.17, 0.07)]);
    poseFeet(game, [point(0.12, 0.12, 0.01), point(-0.12, 0.22, 0.02)]);
  } else if (game.aimUntil > game.elapsed && !game.carrying && !game.dodge) {
    const gripHeight = 1.34 - CROUCH_DROP * rig.crouchBlend;
    const angle = (game.aimYaw ?? game.yaw) + Math.PI;
    game.avatar.rotation.y = angle;
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const recoil =
      Math.max(0, 1 - (game.elapsed - (game.lastShot ?? -1)) / 0.13) * 0.045;
    const elevation =
      game.aiming && game.aimPoint
        ? THREE.MathUtils.clamp(
            Math.atan2(
              game.aimPoint.y - game.player.position.y - gripHeight,
              Math.hypot(
                game.aimPoint.x - game.player.position.x,
                game.aimPoint.z - game.player.position.z,
              ),
            ),
            -0.9,
            0.8,
          )
        : 0;
    const grip = point(
      -0.16,
      gripHeight + Math.sin(elevation) * 0.46 + recoil,
      Math.cos(elevation) * 0.46 - recoil,
    );
    poseHands(game, [
      point(
        0.02,
        gripHeight + Math.sin(elevation) * 0.52 + recoil,
        Math.cos(elevation) * 0.52 - recoil,
      ),
      grip,
    ]);
    rig.weapon.group.visible = true;
    rig.weapon.group.position.copy(grip);
    rig.weapon.group.rotation.set(-recoil * 2, angle, 0);
    if (game.aiming && game.aimPoint) rig.weapon.group.lookAt(game.aimPoint);
  } else if (
    rig.crouchBlend > 0.01 &&
    !game.carrying &&
    !game.dodge &&
    !game.blockGrip
  ) {
    const b = rig.crouchBlend;
    poseHands(
      game,
      [1, -1].map((side, i) =>
        point(
          side * 0.24,
          0.88 - b * 0.06,
          0.15 +
            b * 0.25 +
            (moving ? Math.sin(game.elapsed * 5 + i * Math.PI) * 0.08 : 0),
        ),
      ),
      [new THREE.Vector3(0.35, -1, -0.5), new THREE.Vector3(-0.35, -1, -0.5)],
    );
  }
  poseCausewayWheel(game);
  posePressureOperation(game);
  poseOrbitBearing(game);
  poseTorch(game);
  rig.model.updateWorldMatrix(true, true);
}
