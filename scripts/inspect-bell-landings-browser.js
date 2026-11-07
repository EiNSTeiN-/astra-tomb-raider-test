// Assisted construction review. Uses the actual bell deck rather than roof support;
// does not persist the prepared pose or complete an objective.
import * as T from "three";
import { supportAt } from "../src/character-motion.js";
import { updateAtmosphere } from "../src/atmosphere.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { animateExplorer } from "../src/explorer.js";

export function bellLandingView(g, index, kind = "base") {
  const gate = g.fieldGates[index],
    site = g.bellSites[index],
    landing = site.feature.bellLanding;
  if (!landing) return { blocked: true, reason: "No raised landing" };
  gate.amount = 1;
  updateSanctuaryGate(g, gate, 0);
  const c = gate.root.position,
    deck = landing.root.position.y + landing.height,
    maxY = kind === "deck" ? deck + 0.05 : c.y + 1;
  const target = new T.Vector3(
    c.x - 0.5,
    kind === "deck" ? deck + 0.02 : c.y + landing.height * 0.5,
    c.z + (kind === "deck" ? -1 : -0.6),
  );
  let stance;
  const candidates =
    kind === "deck"
      ? [
          [1.5, 2.2],
          [-1.5, 2.2],
          [0, 2.2],
        ]
      : [
          [4.8, -4.8],
          [-4.8, -4.8],
          [4.8, 4.8],
          [-4.8, 4.8],
        ];
  for (const [dx, dz] of candidates) {
    const x = c.x + dx,
      z = c.z + dz,
      feet = supportAt(g, x, z, maxY).height,
      eye = new T.Vector3(x, feet + 2.05, z);
    if (
      feet > maxY + 0.2 ||
      (kind === "deck" && feet < deck - 0.02) ||
      !g.canMove(x, z, feet - g.groundHeight(x, z)) ||
      !g.cameraSpace(eye)
    )
      continue;
    stance = { eye, feet };
    break;
  }
  if (!stance) return { blocked: true, index, kind };
  g.player.position.set(stance.eye.x, stance.feet, stance.eye.z);
  g.jumpY = stance.feet - g.groundHeight(stance.eye.x, stance.eye.z);
  g.velocityY = 0;
  g.grounded = true;
  g.keys.clear();
  g.touchMove = { x: 0, z: 0 };
  g.avatar.visible = false;
  g.camera.position.copy(stance.eye);
  g.camera.lookAt(target);
  g.camera.fov = kind === "deck" ? 74 : 72;
  g.camera.updateProjectionMatrix();
  g.camera.updateMatrixWorld();
  updateAtmosphere(g, g.player.position);
  g.updateDecorations(0);
  return {
    index,
    kind,
    eye: stance.eye.toArray(),
    target: target.toArray(),
    feet: stance.feet,
    deckY: deck,
    positionLegal: g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
    cameraLegal: g.cameraSpace(g.camera.position),
  };
}

// Prepare normal follow-camera input checks at the already supported deck
// position. A courtyard-floor reset would put the character inside the landing.
export function bellLandingController(g) {
  const { x, y, z } = g.player.position,
    yaw = g.yaw,
    pitch = g.pitch;
  g.jumpY = y - g.groundHeight(x, z);
  g.velocityY = 0;
  g.grounded = true;
  g.keys.clear();
  g.touchMove = g.moveVelocity = { x: 0, z: 0 };
  g.actualMoveSpeed = 0;
  g.swimming = g.diving = g.crouching = g.aiming = false;
  g.climb = g.ropeRide = g.zipRide = g.campEscape = g.airVelocity = null;
  g.aimUntil = 0;
  g.avatar.visible = true;
  g.avatar.rotation.set(0, yaw + Math.PI, 0);
  g.rig.mixer.stopAllAction();
  g.rig.actions.Idle.reset().play();
  g.rig.state = "Idle";
  g.rig.grounding = undefined;
  g.rig.crouchBlend = 0;
  for (let i = 0; i < 40; i++) animateExplorer(g, 1 / 60, false, false);
  g.cameraBodyRecovery = g.cameraContactRecovery = g.cameraFollowTarget = null;
  g.restoreCamera({ x: x / 7, z: z / 7 }, { yaw, pitch });
  for (let i = 0; i < 30; i++) g.updateCamera(0.1);
  g.updateDecorations(0);
  g.player.updateWorldMatrix(true, true);
  return { feet: g.player.position.y, expectedFeet: y };
}
