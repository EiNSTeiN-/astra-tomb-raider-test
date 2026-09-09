import * as THREE from "three";
import { campTube } from "./camp-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { PRESSURE_LEVER } from "./pressure-motion.js";

// The center lane remains clear for boarding. Every grip sits to the right of
// a supported operating stance, on the same moving frame as its return car.
export function buildPressureLevers(
  game,
  { add, box, solid, sign, materials },
) {
  const h = game.pressureRelay;
  const { metal, bronze, ram, recess, warning } = materials;
  for (const c of h.controls.filter(
    (c) => c.kind === "call" || c.kind === "lift",
  )) {
    const onboard = c.kind === "lift",
      frame = new THREE.Group();
    frame.name = onboard
      ? "Return car pull lever"
      : `${c.stop ? "Dispatch" : "Intake"} lift call lever`;
    const px = c.position.x - h.x,
      pz = c.position.z - h.z;
    // Keep the lower landing hardware clear of the eastern stone pier.
    const offsetX = !onboard && c.stop === 0 ? -0.45 : 0.65;
    const floor =
      !onboard && c.stop === 0
        ? game.groundHeight(c.position.x, c.position.z) - h.y
        : c.position.y - h.y;
    frame.position.set(
      onboard ? offsetX : px + offsetX,
      onboard ? 0 : floor,
      onboard ? -0.56 : pz - 0.56,
    );
    (onboard ? h.lift.root : h.root).add(frame);
    c.hardware = frame;
    const block = (w, t, d, x, y, z, mat = metal, capture = false) =>
      box(w, t, d, x, y, z, mat, frame, capture);
    const pin = (
      r,
      length,
      x,
      y,
      z,
      mat = bronze,
      parent = frame,
      axis = "y",
      sides = 12,
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
    block(0.5, 0.06, 0.42, 0, 0.03, 0, bronze, true);
    const housing = block(0.28, 0.65, 0.28, 0, 0.37, 0, metal);
    game.cameraSurfaces?.capture(housing, { small: true });
    block(0.34, 0.08, 0.34, 0, 0.72, 0, bronze, true);
    for (const x of [-0.19, 0.19])
      for (const z of [-0.145, 0.145])
        pin(0.024, 0.018, x, 0.069, z, ram, frame, "y", 6);
    for (const x of [-0.105, 0.105])
      for (const y of [0.19, 0.55])
        pin(0.016, 0.015, x, y, 0.147, bronze, frame, "z", 6);
    block(0.24, 0.2, 0.012, 0, 0.38, 0.15, recess);
    const label = sign(onboard ? "RETURN" : "CALL", 0.24);
    label.position.set(0, 0.39, 0.158);
    frame.add(label);
    for (const side of [-1, 1]) {
      block(
        0.09,
        0.19,
        0.15,
        side * 0.16,
        0.81,
        PRESSURE_LEVER.pivotForward,
        metal,
      );
      pin(
        0.071,
        0.046,
        side * 0.215,
        0.78,
        PRESSURE_LEVER.pivotForward,
        bronze,
        frame,
        "x",
        20,
      );
      pin(
        0.025,
        0.06,
        side * 0.24,
        0.78,
        PRESSURE_LEVER.pivotForward,
        ram,
        frame,
        "x",
        6,
      );
    }
    pin(0.037, 0.45, 0, 0.78, PRESSURE_LEVER.pivotForward, ram, frame, "x", 16);
    // A fixed quadrant and end stops describe the fore/aft travel of the lever.
    const arc = Array.from({ length: 17 }, (_, i) => {
      const a = PRESSURE_LEVER.readyAngle + (i / 16) * PRESSURE_LEVER.travel;
      return [
        -0.16,
        0.78 + Math.cos(a) * 0.36,
        PRESSURE_LEVER.pivotForward + Math.sin(a) * 0.36,
      ];
    });
    add(campTube(arc, 0.018, 24), bronze, 0, 0, 0, frame);
    for (const a of [
      PRESSURE_LEVER.readyAngle,
      PRESSURE_LEVER.readyAngle + PRESSURE_LEVER.travel,
    ]) {
      const y = 0.78 + Math.cos(a) * 0.36,
        z = PRESSURE_LEVER.pivotForward + Math.sin(a) * 0.36;
      pin(0.038, 0.1, -0.13, y, z, warning, frame, "x", 10);
      add(
        campTube(
          [
            [-0.16, 0.78, PRESSURE_LEVER.pivotForward],
            [-0.16, y, z],
          ],
          0.014,
          3,
        ),
        metal,
        0,
        0,
        0,
        frame,
      );
    }
    const lever = new THREE.Group();
    lever.name = "Spring-return pull handle";
    lever.position.set(0, 0.78, PRESSURE_LEVER.pivotForward);
    lever.userData.animated = true;
    frame.add(lever);
    c.lever = lever;
    c.turn = 0;
    pin(0.024, 0.44, 0, 0.22, 0, bronze, lever, "y", 16);
    pin(0.019, 0.2, 0, 0.44, 0, recess, lever, "x", 16);
    for (const side of [-1, 1])
      pin(0.024, 0.018, side * 0.109, 0.44, 0, bronze, lever, "x", 12);
    c.grip = new THREE.Object3D();
    c.grip.name = "Right hand lift lever grip";
    c.grip.position.y = 0.44;
    lever.add(c.grip);
    if (onboard) {
      c.arrows = [0, 1].map((i) => {
        const arrow = add(
          new THREE.ConeGeometry(0.047, 0.11, 3),
          warning,
          0,
          0.51,
          0.175,
          frame,
        );
        arrow.rotation.z = i * Math.PI;
        arrow.userData.animated = true;
        return arrow;
      });
    }
    const collider = solid(
      px + offsetX,
      floor + 0.47,
      pz - 0.56,
      0.5,
      0.94,
      0.42,
    );
    c.solid = collider;
    if (onboard) h.art.movingSolids.push({ collider, bottom: 0, top: 0.94 });
    c.source = {
      id: onboard ? "relay-car-lever" : `relay-call-${c.stop}`,
      kind: "hoist",
      x: c.position.x + offsetX,
      y: h.y + floor + 0.78,
      z: c.position.z - 0.56,
      near: 1.5,
      range: 10,
      gain: 0.025,
      activity: 0,
    };
    h.sources.push(c.source);
    mergeArchitecture(lever);
    mergeArchitecture(frame);
  }
}
