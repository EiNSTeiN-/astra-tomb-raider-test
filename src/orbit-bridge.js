import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";
import { mergeArchitecture } from "./visuals.js";
import { ORBIT_BRIDGE } from "./orbit-rules.js";

export function buildOrbitBridge(game, { add, box, bronze, dark }) {
  const h = game.orbitVault,
    root = new THREE.Group(),
    b = ORBIT_BRIDGE;
  h.root.add(root);
  h.returnRoot = root;
  const bridge = (h.bridge = {
    root,
    progress: h.saved.recovered ? 1 : 0,
    panels: [],
  });
  for (let i = 0; i < b.leaves; i++) {
    const panel = new THREE.Group();
    panel.name = `Folding return leaf ${i + 1}`;
    panel.userData.animated = panel.userData.cameraDynamic = true;
    root.add(panel);
    const deck = box(
      b.length,
      0.07,
      b.width,
      b.length / 2,
      -0.035,
      0,
      bronze,
      panel,
    );
    // Large folded leaves need camera obstruction even though their plate is thin.
    game.cameraSurfaces?.capture(deck, { thin: true });
    for (let j = 0; j < 10; j++)
      box(0.42, 0.008, 2.18, 0.25 + j * 0.5, 0.004, 0, dark, panel);
    for (const side of [-1, 1]) {
      box(
        b.length,
        0.13,
        0.09,
        b.length / 2,
        0.035,
        side * 1.205,
        bronze,
        panel,
      );
      for (const x of [0, b.length]) {
        const hinge = add(
          new THREE.CylinderGeometry(0.1, 0.1, 0.19, 16),
          bronze,
          x,
          0,
          side * 1.26,
          panel,
        );
        hinge.rotation.x = Math.PI / 2;
        const pin = add(
          new THREE.CylinderGeometry(0.035, 0.035, 0.24, 12),
          dark,
          x,
          0,
          side * 1.26,
          panel,
        );
        pin.rotation.x = Math.PI / 2;
      }
      for (let j = 0; j <= 10; j++) {
        const rivet = add(
          new THREE.CylinderGeometry(0.023, 0.023, 0.018, 6),
          dark,
          j * 0.5,
          0.109,
          side * 1.205,
          panel,
        );
      }
    }
    bridge.panels.push(panel);
    mergeArchitecture(panel);
  }
  // Fixed cheeks and toothed bearings tie the concertina to the western bank.
  for (const side of [-1, 1]) {
    box(0.7, 0.8, 0.35, b.start, 0.4, side * 1.5, dark, root);
    const gear = add(
      new THREE.CylinderGeometry(0.36, 0.36, 0.14, 32),
      bronze,
      b.start,
      b.top,
      side * 1.7,
      root,
    );
    gear.rotation.x = Math.PI / 2;
    for (let j = 0; j < 16; j++) {
      const a = (j * Math.PI) / 8,
        m = box(
          0.1,
          0.1,
          0.15,
          b.start + Math.cos(a) * 0.36,
          b.top + Math.sin(a) * 0.36,
          side * 1.7,
          bronze,
          root,
        );
      m.rotation.z = a;
    }
    game.obstacles.push({
      x: h.x + b.start,
      z: h.z + side * 1.5,
      w: 0.8,
      d: 0.625,
      h: h.y - game.groundHeight(h.x + b.start, h.z + side * 1.5) + 0.8,
      orbitVault: true,
    });
  }
  bridge.source = {
    id: "orbit-return-bridge",
    kind: "machine",
    x: h.x + b.start,
    y: h.y + b.top,
    z: h.z,
    near: 2,
    range: 32,
    gain: 0.06,
    activity: 0,
  };
  h.sources.push(bridge.source);
  mergeArchitecture(root);
  updateOrbitBridge(game, 0);
}
export function updateOrbitBridge(game, dt) {
  const h = game.orbitVault,
    b = h?.bridge;
  if (!b) return;
  if (h.saved.recovered && !game.paused)
    b.progress = Math.min(1, b.progress + dt / ORBIT_BRIDGE.duration);
  const angle =
    ORBIT_BRIDGE.folded * (1 - THREE.MathUtils.smoothstep(b.progress, 0, 1));
  const dx = ORBIT_BRIDGE.length * Math.cos(angle),
    dy = ORBIT_BRIDGE.length * Math.sin(angle);
  b.panels.forEach((p, i) => {
    p.position.set(
      ORBIT_BRIDGE.start + i * dx,
      ORBIT_BRIDGE.top + (i % 2) * dy,
      0,
    );
    p.rotation.z = i % 2 ? -angle : angle;
  });
  b.source.x = h.x + ORBIT_BRIDGE.start + dx * 4;
  b.source.y = h.y + ORBIT_BRIDGE.top;
  b.source.activity =
    h.saved.recovered && b.progress < 1 && !game.paused ? 0.8 : 0;
  b.root.updateWorldMatrix(true, true);
}
export function orbitBridgeBlocked(game, x, z, y, clearance) {
  const h = game.orbitVault,
    b = h?.bridge;
  if (!b || b.progress >= 1) return false;
  const dx = x - h.x,
    dz = z - h.z;
  // Keep the unfolding corridor clear until all hinges reach their stops.
  if (
    clearance > 0.1 &&
    h.saved.recovered &&
    dx > -22.4 &&
    dx < -2.2 &&
    Math.abs(dz) < 1.7
  )
    return true;
  for (const panel of b.panels) {
    const c = Math.cos(panel.rotation.z),
      s = Math.sin(panel.rotation.z),
      px = dx - panel.position.x,
      py = y - h.y - panel.position.y;
    const from = { x: px * c + py * s, y: -px * s + py * c, z: dz },
      to = { x: from.x + clearance * s, y: from.y + clearance * c, z: dz };
    if (
      boxEntry(
        from,
        to,
        { min: { x: 0, y: -0.07, z: -1.25 }, max: { x: 5, y: 0.01, z: 1.25 } },
        clearance > 0 ? 0.4 : 0,
        true,
      ) !== null
    )
      return true;
  }
  return false;
}
