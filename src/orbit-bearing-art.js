import * as THREE from "three";
import { campTube } from "./camp-geometry.js";
import { mergeArchitecture } from "./visuals.js";

export function buildOrbitBearing(game, c, { add, box, bronze, dark, label }) {
  const h = game.orbitVault,
    d = h.rests[c.index + 1],
    frame = new THREE.Group(),
    // The lunar landing lies beneath the return crossing; keep its instrument
    // beside the centre lane while retaining a supported stance on the pad.
    offsetZ = c.index === 1 ? -1 : 0;
  frame.name = "Cartographer’s bearing instrument";
  frame.position.set(d.x - h.x + 0.85, 0, d.z - h.z + offsetZ);
  frame.rotation.y = -Math.PI / 2;
  h.root.add(frame);
  c.hardware = frame;
  const block = (w, t, d, x, y, z, mat = bronze, parent = frame) =>
    box(w, t, d, x, y, z, mat, parent);
  const pin = (
    r,
    length,
    x,
    y,
    z,
    mat = bronze,
    parent = frame,
    axis = "z",
    sides = 16,
  ) => {
    const m = add(
      new THREE.CylinderGeometry(r, r, length, sides),
      mat,
      x,
      y,
      z,
      parent,
    );
    if (axis !== "y") m.rotation[axis === "x" ? "z" : "x"] = Math.PI / 2;
    return m;
  };
  block(0.64, 0.1, 0.62, 0, 0.05, -0.3);
  block(0.42, 0.84, 0.4, 0, 0.51, -0.3, dark);
  block(0.56, 0.12, 0.52, 0, 0.99, -0.3);
  for (const x of [-0.25, 0.25])
    for (const z of [-0.52, -0.08])
      pin(0.025, 0.025, x, 0.114, z, bronze, frame, "y", 6);
  pin(0.14, 0.5, 0, 1.16, -0.16, bronze);
  const wheel = new THREE.Group();
  wheel.name = "Quarter-turn bearing wheel";
  wheel.position.set(0, 1.16, 0);
  wheel.rotation.x = -0.3;
  wheel.userData.animated = true;
  frame.add(wheel);
  c.wheel = wheel;
  c.turn = 0;
  add(new THREE.TorusGeometry(0.36, 0.043, 8, 40), bronze, 0, 0, 0, wheel);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    add(
      campTube(
        [
          [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0],
          [Math.cos(a + 0.17) * 0.23, Math.sin(a + 0.17) * 0.23, 0.018],
          [Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0],
        ],
        0.022,
        8,
      ),
      bronze,
      0,
      0,
      0,
      wheel,
    );
  }
  pin(0.105, 0.13, 0, 0, 0, dark, wheel);
  pin(0.044, 0.045, 0, 0, 0.09, bronze, wheel, "z", 6);
  c.grips = [-1, 1].map((side) => {
    const g = new THREE.Object3D();
    g.position.set(side * 0.23, 0, 0.16);
    wheel.add(g);
    pin(0.019, 0.2, side * 0.23, 0, 0.16, dark, wheel, "x");
    for (const end of [-1, 1]) {
      pin(0.014, 0.14, side * 0.23 + end * 0.087, 0, 0.07, bronze, wheel);
      pin(
        0.024,
        0.018,
        side * 0.23 + end * 0.109,
        0,
        0.16,
        bronze,
        wheel,
        "x",
        12,
      );
    }
    return g;
  });
  const plaque = label(["EARTH", "MOON", "STAR"][c.index], 1.1);
  plaque.position.set(0, 1.9, -0.27);
  frame.add(plaque);
  block(1.17, 0.34, 0.08, 0, 1.9, -0.32, dark);
  for (const x of [-0.23, 0.23]) block(0.045, 0.96, 0.045, x, 1.43, -0.35);
  const gauge = add(
    new THREE.TorusGeometry(0.2, 0.025, 6, 32),
    bronze,
    0,
    0.6,
    -0.077,
    frame,
  );
  c.pointer = block(0.018, 0.25, 0.022, 0, 0.6, -0.04, game.glowMat);
  c.pointer.userData.animated = true;
  c.solid = {
    x: d.x + 1.15,
    z: d.z + offsetZ,
    w: 0.76,
    d: 0.77,
    h: h.y - game.groundHeight(d.x + 1.15, d.z + offsetZ) + 1.1,
    orbitVault: true,
  };
  game.obstacles.push(c.solid);
  c.source = {
    id: `orbit-bearing-${c.index}`,
    kind: "machine",
    x: d.x + 0.85 - 0.2,
    y: h.y + 1.16,
    z: d.z + offsetZ,
    near: 1.5,
    range: 12,
    gain: 0.035,
    activity: 0,
  };
  h.sources.push(c.source);
  mergeArchitecture(wheel);
  mergeArchitecture(frame);
}
