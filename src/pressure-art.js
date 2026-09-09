import * as THREE from "three";
import { PRESSURE_DECKS, PRESSURE_PISTONS } from "./pressure-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { campTube } from "./camp-geometry.js";
import { mergeArchitecture } from "./visuals.js";

export const RELAY_RAM_LENGTH = 4.65;
export const RELAY_CABLE_TOP = 29.4;

export function buildPressureArt(game, { add, solid, sign, materials }) {
  const h = game.pressureRelay,
    root = h.root;
  const { stone, paving, metal, bronze, ram, warning, recess } = materials;
  const art = (h.art = {
    materials,
    panels: [],
    paving: [],
    rams: [],
    gauges: [],
    rollers: [],
    furniture: [],
    movingSolids: [],
  });
  let serial = 27000;
  const block = (
    w,
    t,
    d,
    x,
    y,
    z,
    mat = metal,
    parent = root,
    capture = false,
  ) =>
    add(
      Math.min(w, t, d) < 0.04
        ? new THREE.BoxGeometry(w, t, d)
        : stoneBlockGeometry(w, t, d, serial++, 0.026),
      mat,
      x,
      y,
      z,
      parent,
      capture,
    );
  const pin = (
    r,
    length,
    x,
    y,
    z,
    mat = bronze,
    parent = root,
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
  const ring = (r, tube, x, y, z, mat = bronze, parent = root, axis = "y") => {
    const m = add(
      new THREE.TorusGeometry(r, tube, 6, 32),
      mat,
      x,
      y,
      z,
      parent,
    );
    if (axis !== "z") m.rotation[axis === "y" ? "x" : "y"] = Math.PI / 2;
    return m;
  };
  const beam = (
    a,
    b,
    width,
    depth,
    mat = metal,
    parent = root,
    capture = false,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start),
      center = start.clone().add(end).multiplyScalar(0.5);
    const mesh = block(
      width,
      delta.length(),
      depth,
      ...center.toArray(),
      mat,
      parent,
      capture,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const remove = (mesh) => {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  };
  const clear = (group) => {
    for (const mesh of [...group.children]) {
      if (mesh.geometry) remove(mesh);
    }
  };
  const bolts = (
    radius,
    y,
    parent = root,
    mat = bronze,
    count = 12,
    size = 0.045,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pin(
        size,
        0.045,
        Math.cos(a) * radius,
        y,
        Math.sin(a) * radius,
        mat,
        parent,
        "y",
        6,
      );
    }
  };
  // Recessed joints sit over a closed foundation. The cool aisle and landing
  // heights remain exactly where the movement controller expects them.
  remove(h.floorMesh);
  delete h.floorMesh;
  block(44, 0.24, 46, 0, -0.17, 0, recess);
  for (let iz = 0; iz < 23; iz++)
    for (let ix = 0; ix < 22; ix++) {
      const x = -21 + ix * 2,
        z = -22 + iz * 2;
      if (x > -17 && x < 11 && z > -22 && z < 12) continue;
      block(1.965, 0.11, 1.965, x, -0.055, z, paving);
      art.paving.push({ x, z, y: 0 });
    }
  for (const x of [-17.1, 11.1])
    block(0.18, 0.035, 34.2, x, 0.0175, -5, bronze);
  for (const z of [-22.1, 12.1])
    block(28.2, 0.035, 0.18, -3, 0.0175, z, bronze);
  // Cast blocks replace monolithic walls, within the original solid envelope.
  for (const wall of h.walls) {
    remove(wall.mesh);
    const alongX = wall.w > wall.d,
      length = alongX ? wall.w : wall.d;
    const rows = Math.ceil(wall.t / 1.05),
      step = wall.t / rows,
      columns = Math.ceil(length / 2.8),
      span = length / columns;
    block(
      wall.w - 0.06,
      wall.t - 0.02,
      wall.d - 0.06,
      wall.x,
      wall.y,
      wall.z,
      recess,
    );
    for (let row = 0; row < rows; row++) {
      const boundaries = [-length / 2];
      for (let c = 1; c < columns + 1; c++) {
        const at = -length / 2 + (c - (row % 2) * 0.5) * span;
        if (at < length / 2 - 0.02) boundaries.push(at);
      }
      boundaries.push(length / 2);
      for (let c = 0; c < boundaries.length - 1; c++) {
        const a = boundaries[c],
          b = boundaries[c + 1],
          middle = (a + b) / 2;
        block(
          alongX ? b - a - 0.028 : wall.w,
          step - 0.028,
          alongX ? wall.d : b - a - 0.028,
          wall.x + (alongX ? middle : 0),
          wall.y - wall.t / 2 + (row + 0.5) * step,
          wall.z + (alongX ? 0 : middle),
          stone,
        );
      }
    }
  }
  for (const pier of h.piers) {
    remove(pier.mesh);
    block(1.28, 27, 1.28, pier.x, 13.3, pier.z, recess);
    for (let course = 0; course < 20; course++) {
      const height = 27 / 20;
      block(
        1.4,
        height - 0.025,
        1.4,
        pier.x,
        -0.2 + (course + 0.5) * height,
        pier.z,
        stone,
      );
      if (course % 4 === 0) {
        block(
          1.43,
          0.09,
          1.43,
          pier.x,
          -0.2 + course * height + 0.1,
          pier.z,
          bronze,
        );
        for (const side of [-1, 1])
          pin(
            0.065,
            0.04,
            pier.x + side * 0.45,
            -0.2 + course * height + 0.1,
            pier.z + 0.735,
            metal,
            root,
            "z",
            6,
          );
      }
    }
    // Knee brackets stay above the highest gallery's head clearance.
    for (const side of [-1, 1]) {
      const z = THREE.MathUtils.clamp(pier.z + side * 2.5, -21, 21);
      if (z !== pier.z)
        beam([pier.x, 24.8, pier.z], [pier.x, 27.3, z], 0.2, 0.23, metal);
    }
  }
  delete h.walls;
  delete h.piers;

  const deckSkin = (d, parent, local = false) => {
    if (d.mesh) {
      remove(d.mesh);
      delete d.mesh;
    }
    const group = new THREE.Group();
    group.position.set(
      local ? 0 : d.x - h.x,
      local ? 0 : d.y - h.y,
      local ? 0 : d.z - h.z,
    );
    parent.add(group);
    block(d.w * 2, 0.328, d.d * 2, 0, -0.186, 0, recess, group);
    const nx = Math.ceil((d.w * 2) / 1.3),
      nz = Math.ceil((d.d * 2) / 1.3),
      sx = (d.w * 2) / nx,
      sz = (d.d * 2) / nz;
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const x = -d.w + (ix + 0.5) * sx,
          z = -d.d + (iz + 0.5) * sz;
        block(sx - 0.025, 0.22, sz - 0.025, x, -0.11, z, metal, group);
        art.panels.push({ parent: group, x, z, y: 0 });
        // Actual shallow tread ribs and fasteners catch the low foundry light.
        for (const offset of [-0.21, 0.21]) {
          const tread = block(
            0.24,
            0.009,
            0.032,
            x + offset,
            0.0045,
            z,
            bronze,
            group,
          );
          tread.rotation.y = (ix + iz) % 2 ? -0.65 : 0.65;
        }
        for (const side of [-1, 1])
          pin(
            0.018,
            0.008,
            x + side * (sx / 2 - 0.085),
            0.004,
            z - sz / 2 + 0.08,
            bronze,
            group,
            "y",
            6,
          );
      }
    for (const side of [-1, 1]) {
      block(
        d.w * 2,
        0.31,
        0.075,
        0,
        -0.155,
        side * (d.d - 0.04),
        bronze,
        group,
      );
      block(
        0.075,
        0.31,
        d.d * 2,
        side * (d.w - 0.04),
        -0.155,
        0,
        bronze,
        group,
      );
    }
    mergeArchitecture(group);
    return group;
  };
  for (const d of h.rests) deckSkin(d, root);
  for (const [i, car] of h.pistons.entries()) {
    const p = PRESSURE_PISTONS[i];
    // Existing captured proxies retain full shaft/crown collision. The visible
    // shaft becomes a fixed pressure housing and a ram of constant length.
    clear(car.root);
    delete car.collar;
    delete car.deck.mesh;
    clear(car.shaft);
    remove(car.base);
    delete car.base;
    deckSkin(car.deck, car.root, true);
    const housing = new THREE.Group();
    housing.position.set(p.x, 0, p.z);
    root.add(housing);
    const fixedTop = Math.max(0.12, p.low - 0.75);
    pin(1.045, fixedTop, 0, fixedTop / 2, 0, metal, housing, "y", 32);
    for (let joint = 0.16; joint < fixedTop - 0.1; joint += 2.1) {
      pin(1.095, 0.14, 0, joint, 0, bronze, housing, "y", 32);
      bolts(1.07, joint + 0.09, housing, bronze, 12, 0.022);
    }
    const footTop = Math.min(0.14, p.low - 0.025);
    pin(1.09, 0.16, 0, footTop - 0.08, 0, metal, housing, "y", 32);
    bolts(1.07, footTop + 0.012, housing, bronze, 10, 0.018);
    ring(0.885, 0.045, 0, fixedTop + 0.018, 0, bronze, housing);
    for (let rib = 0; rib < 8; rib++) {
      const a = (rib / 8) * Math.PI * 2;
      if (fixedTop > 0.7)
        block(
          0.06,
          fixedTop - 0.28,
          0.08,
          Math.cos(a) * 1.02,
          fixedTop / 2,
          Math.sin(a) * 1.02,
          bronze,
          housing,
        );
    }
    mergeArchitecture(housing);
    const rod = pin(
      0.775,
      RELAY_RAM_LENGTH,
      0,
      -0.55 - RELAY_RAM_LENGTH / 2,
      0,
      ram,
      car.root,
      "y",
      48,
    );
    rod.name = `Pressure ram ${i + 1}`;
    art.rams.push({ mesh: rod, car: i, fixedTop });
    // The flanged crown keeps its center of mass above the same collision shaft.
    const profile = [
      [0.77, -0.76],
      [1.28, -0.76],
      [1.52, -0.65],
      [1.52, -0.49],
      [1.28, -0.43],
      [1.15, -0.35],
      [0.77, -0.35],
      [0.77, -0.76],
    ];
    add(
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        40,
      ),
      metal,
      0,
      0,
      0,
      car.root,
    );
    for (const side of [-1, 1]) {
      block(3.94, 0.15, 0.22, 0, -0.37, side * 1.4, metal, car.root);
      for (const x of [-1.5, -0.5, 0.5, 1.5])
        pin(0.04, 0.04, x, -0.285, side * 1.4, bronze, car.root, "y", 6);
    }
    bolts(1.36, -0.455, car.root, bronze, 16);
    const number = sign(String(i + 1), 0.8);
    number.position.set(0, -0.24, 2.145);
    car.root.add(number);
    // Ochre edge blocks identify crossing lips without closing the jump lanes.
    for (const e of [-1, 1])
      for (let j = -2; j <= 2; j++) {
        block(0.3, 0.012, 0.1, j * 0.66, 0.006, e * 2.03, warning, car.root);
        block(0.1, 0.012, 0.3, e * 2.03, 0.006, j * 0.66, warning, car.root);
      }
    mergeArchitecture(car.root);
    // A cast elbow gives the existing plume and hiss a visible, open outlet.
    const outlet = new THREE.Group();
    outlet.position.set(p.x + 1.6, 0.6, p.z);
    root.add(outlet);
    add(
      campTube(
        [
          [0, -0.48, 0],
          [0, -0.24, 0],
          [0.09, -0.09, 0],
          [0.18, 0, 0],
        ],
        0.13,
        10,
      ),
      metal,
      0,
      0,
      0,
      outlet,
    );
    ring(0.155, 0.028, 0.18, 0, 0, bronze, outlet, "x");
    pin(0.118, 0.006, 0.183, 0, 0, recess, outlet, "x", 20);
    // Outlet remains centered at the authored source; the nozzle points up into
    // that emitter, with its short feed set behind it.
    outlet.position.x -= 0.18;
    mergeArchitecture(outlet);
  }

  // Pedestal cladding, gauges, rounded spokes and gate stems clarify operation.
  for (const c of h.controls.filter(
    (c) => c.kind === "valve" || c.kind === "record",
  )) {
    const d = PRESSURE_DECKS[c.bank],
      x = d.x + 1,
      z = d.z - 1.15,
      plaqueLift = c.kind === "valve" ? 0.17 : 0;
    block(0.72, 0.1, 0.68, x, d.y + 0.57, z, bronze);
    block(2.04, 0.39, 0.065, x, d.y + 1.65 + plaqueLift, z - 0.045, metal);
    for (const side of [-1, 1]) {
      block(
        0.05,
        0.94 + plaqueLift,
        0.05,
        x + side * 0.25,
        d.y + 1.02 + plaqueLift / 2,
        z - 0.32,
        metal,
      );
      block(
        0.05,
        0.03,
        0.29,
        x + side * 0.25,
        d.y + 1.48 + plaqueLift,
        z - 0.1975,
        metal,
      );
    }
    for (const side of [-1, 1])
      pin(
        0.034,
        0.025,
        x + side * 0.92,
        d.y + 1.65 + plaqueLift,
        z,
        bronze,
        root,
        "z",
        6,
      );
    if (!c.wheel) continue;
    clear(c.wheel);
    c.wheel.position.y += 0.16;
    c.wheel.rotation.x = -0.3;
    ring(0.36, 0.043, 0, 0, 0, bronze, c.wheel, "z");
    for (let spoke = 0; spoke < 6; spoke++) {
      const a = (spoke / 6) * Math.PI * 2;
      add(
        campTube(
          [
            [Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0],
            [Math.cos(a + 0.17) * 0.22, Math.sin(a + 0.17) * 0.22, 0.018],
            [Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0],
          ],
          0.022,
          8,
        ),
        bronze,
        0,
        0,
        0,
        c.wheel,
      );
    }
    pin(0.105, 0.13, 0, 0, 0, metal, c.wheel, "z", 12);
    pin(0.044, 0.045, 0, 0, 0.09, bronze, c.wheel, "z", 6);
    c.grips = [-1, 1].map((side) => {
      const grip = new THREE.Object3D();
      grip.position.set(side * 0.23, 0, 0.16);
      grip.name = `${side < 0 ? "Left" : "Right"} pressure wheel grip`;
      c.wheel.add(grip);
      pin(0.019, 0.2, side * 0.23, 0, 0.16, recess, c.wheel, "x", 16);
      for (const end of [-1, 1])
        pin(
          0.014,
          0.14,
          side * 0.23 + end * 0.115,
          0,
          0.08,
          bronze,
          c.wheel,
          "z",
          10,
        );
      return grip;
    });
    const origin = c.wheel.getWorldPosition(new THREE.Vector3());
    c.source = {
      id: `relay-valve-${c.bank}`,
      kind: "hoist",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      near: 1.5,
      range: 12,
      gain: 0.035,
      activity: 0,
    };
    h.sources.push(c.source);
    mergeArchitecture(c.wheel);
    const spindle = new THREE.Group();
    spindle.position.copy(c.wheel.position);
    spindle.rotation.x = c.wheel.rotation.x;
    root.add(spindle);
    pin(0.09, 0.45, 0, 0, -0.24, ram, spindle, "z", 16);
    pin(0.23, 0.22, 0, 0, -0.39, metal, spindle, "z", 24);
    block(0.12, 0.52, 0.16, x, d.y + 0.8, z - 0.42, bronze);
    const gauge = new THREE.Group();
    gauge.position.set(x - 0.57, d.y + 1.03, z - 0.01);
    root.add(gauge);
    pin(0.19, 0.06, 0, 0, 0, bronze, gauge, "z", 32);
    pin(0.161, 0.008, 0, 0, 0.035, recess, gauge, "z", 32);
    for (let mark = 0; mark < 9; mark++) {
      const a = -Math.PI * 0.8 + mark * Math.PI * 0.2;
      const m = block(
        0.009,
        0.024,
        0.008,
        Math.sin(a) * 0.136,
        Math.cos(a) * 0.136,
        0.043,
        warning,
        gauge,
      );
      m.rotation.z = -a;
    }
    const needle = new THREE.Group();
    needle.position.z = 0.054;
    gauge.add(needle);
    block(0.014, 0.13, 0.009, 0, 0.049, 0, warning, needle);
    pin(0.022, 0.017, 0, 0, 0, bronze, needle, "z", 10);
    art.gauges.push({ root: needle, bank: c.bank });
    mergeArchitecture(gauge);
  }

  // Riveted guides and attached rollers give the return car a physical drive.
  deckSkin(h.lift.deck, h.lift.root, true);
  for (const side of [-1, 1]) {
    const x = side * 2.25;
    block(0.13, 2.65, 0.15, x, 1.325, 0, metal, h.lift.root, true);
    const collider = solid(
      16 + x,
      h.lift.root.position.y + 1.325,
      -8,
      0.13,
      2.65,
      0.15,
    );
    art.movingSolids.push({ collider, bottom: 0, top: 2.65 });
    for (const py of [0.45, 2.05]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * 2.18, py, 0);
      h.lift.root.add(wheel);
      pin(0.2, 0.13, 0, 0, 0, bronze, wheel, "z", 24);
      ring(0.17, 0.026, 0, 0, 0.055, recess, wheel, "z");
      for (let bolt = 0; bolt < 6; bolt++) {
        const a = (bolt * Math.PI) / 3;
        pin(
          0.019,
          0.02,
          Math.cos(a) * 0.1,
          Math.sin(a) * 0.1,
          0.08,
          ram,
          wheel,
          "z",
          6,
        );
      }
      mergeArchitecture(wheel);
      art.rollers.push({ root: wheel, side });
    }
    beam([x, 1.75, 0], [side * 0.95, 2.67, 0], 0.1, 0.15, bronze, h.lift.root);
    for (let y = 1; y < 26; y += 1.9)
      block(0.44, 0.15, 0.15, 16 + side * 2.5, y, -8, bronze);
    block(0.24, 3.9, 0.24, 16 + side * 2.5, 27.9, -8, metal, root, true);
  }
  block(4.65, 0.2, 0.22, 0, 2.65, 0, metal, h.lift.root, true);
  ring(0.16, 0.035, 0, 2.8, 0, bronze, h.lift.root, "z");
  const cable = add(
    new THREE.CylinderGeometry(0.029, 0.029, 1, 8),
    recess,
    16,
    0,
    -8,
  );
  cable.userData.animated = true;
  art.cable = cable;
  const sheave = new THREE.Group();
  sheave.position.set(16.6, RELAY_CABLE_TOP, -8);
  root.add(sheave);
  const rotor = new THREE.Group();
  sheave.add(rotor);
  art.rotor = rotor;
  for (const z of [-0.055, 0.055]) {
    ring(0.6, 0.043, 0, 0, z, bronze, rotor, "z");
    for (let spoke = 0; spoke < 8; spoke++) {
      const a = (spoke * Math.PI) / 4;
      beam(
        [Math.cos(a) * 0.1, Math.sin(a) * 0.1, z],
        [Math.cos(a) * 0.57, Math.sin(a) * 0.57, z],
        0.044,
        0.06,
        metal,
        rotor,
      );
    }
  }
  pin(0.14, 0.32, 0, 0, 0, bronze, rotor, "z", 20);
  for (const z of [-0.21, 0.21])
    block(0.43, 0.55, 0.12, 0, 0, z, metal, sheave);
  const upperRun = Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI - ((i / 24) * Math.PI) / 2;
    return [16.6 + 0.6 * Math.cos(a), RELAY_CABLE_TOP + 0.6 * Math.sin(a), -8];
  });
  upperRun.push([18.5, 30, -8]);
  add(campTube(upperRun, 0.029, 40), recess, 0, 0, 0);
  block(5.7, 0.3, 0.5, 16, 29.12, -8, metal, root, true);
  for (const side of [-1, 1])
    beam(
      [16 + side * 2.5, 27.5, -8],
      [16 + side * 1.1, 29.05, -8],
      0.16,
      0.2,
      bronze,
    );
  mergeArchitecture(rotor);
  mergeArchitecture(sheave);
  mergeArchitecture(h.lift.root);

  // The dispatch canopy and refuge cargo make the ledger's story visible.
  // Cantilevered supports leave every gallery and approach clear.
  for (const x of [10.5, 14, 17.5]) {
    beam([x, 27.453, -19.6], [x, 28.457, -14.65], 0.14, 0.2, metal, root, true);
    beam([x, 27.453, -19.6], [21, 27.3, -21], 0.12, 0.17, metal);
  }
  for (let panel = 0; panel < 12; panel++) {
    const x = 9.8 + (panel + 0.5) * 0.7;
    const roof = block(0.69, 0.11, 5.2, x, 28.1, -17.1, metal, root, true);
    roof.rotation.x = -0.2;
    const seam = block(0.05, 0.05, 5.2, x - 0.32, 28.18, -17.1, bronze);
    seam.rotation.x = -0.2;
  }
  const jarMat = new THREE.MeshStandardMaterial({
    name: "Relay fired clay jars",
    color: 0x997d55,
    roughness: 0.91,
  });
  const profile = [
    [0, 0],
    [0.2, 0],
    [0.27, 0.08],
    [0.32, 0.3],
    [0.3, 0.5],
    [0.15, 0.65],
    [0.13, 0.77],
    [0.17, 0.79],
    [0.17, 0.83],
    [0.105, 0.83],
    [0.105, 0.73],
    [0.1, 0.69],
    [0, 0.69],
  ];
  const cargo = new THREE.Group();
  cargo.position.set(12.2, 24.2, -17.6);
  art.cargo = cargo;
  root.add(cargo);
  block(2.7, 0.13, 0.85, 0, 0.065, 0, metal, cargo);
  for (const x of [-0.9, 0, 0.9]) {
    add(
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        24,
      ),
      jarMat,
      x,
      0.13,
      0,
      cargo,
    );
    ring(0.29, 0.018, x, 0.4, 0, bronze, cargo);
    pin(0.14, 0.06, x, 0.98, 0, stone, cargo, "y", 12);
  }
  art.furniture.push(solid(12.2, 24.2 + 0.56, -17.6, 2.7, 1.12, 0.85));
  const cargoBounds = block(
    2.7,
    1.12,
    0.85,
    12.2,
    24.76,
    -17.6,
    metal,
    root,
    true,
  );
  remove(cargoBounds);
  mergeArchitecture(cargo);
  const chest = (x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    root.add(g);
    block(1.65, 0.78, 1.02, 0, 0.39, 0, paving, g);
    for (const side of [-1, 1]) {
      block(0.1, 0.82, 1.07, side * 0.58, 0.41, 0, metal, g);
      ring(0.09, 0.019, side * 0.55, 0.53, -0.54, bronze, g, "z");
    }
    block(1.74, 0.12, 1.1, 0, 0.84, 0, metal, g);
    block(0.12, 0.24, 0.06, 0, 0.71, -0.58, bronze, g);
    for (const x of [-0.74, 0.74])
      for (const z of [-0.45, 0.45])
        pin(0.032, 0.025, x, 0.91, z, bronze, g, "y", 6);
    art.furniture.push(solid(x, y + 0.46, z, 1.8, 0.94, 1.2));
    mergeArchitecture(g);
  };
  chest(18.1, 0.18, 12.7);
  chest(-19, 0, 17);
  const tablet = new THREE.Group();
  tablet.position.set(19.5, 0.18, 8.65);
  root.add(tablet);
  block(0.6, 0.82, 0.46, 0, 0.41, 0, stone, tablet);
  block(0.68, 0.08, 0.52, 0, 0.84, 0, bronze, tablet);
  const face = new THREE.Group();
  face.position.set(0, 1.03, 0.1);
  face.rotation.x = -0.25;
  tablet.add(face);
  block(0.76, 0.38, 0.065, 0, 0, 0, metal, face);
  const label = sign("CREW'S TABLET", 0.7);
  label.position.set(0, 0.07, 0.04);
  face.add(label);
  for (let row = 0; row < 3; row++)
    block(0.5, 0.008, 0.006, 0, -0.04 - row * 0.035, 0.036, bronze, face);
  art.furniture.push(solid(19.5, 0.18 + 0.65, 8.65, 0.8, 1.3, 0.56));
  mergeArchitecture(face);
  mergeArchitecture(tablet);
  // Labels receive physical backing; the overhead entry title sits on its lintel.
  h.entrySign.position.set(22.74, 5.8, 10);
  block(0.1, 1.05, 4.2, 22.68, 5.8, 10, metal);
  for (const y of [5.46, 6.14])
    for (const z of [8.15, 11.85])
      pin(0.045, 0.06, 22.77, y, z, bronze, root, "x", 6);
  // Two hot-bed accents participate in the forge's existing fixed light pool.
  art.heatLights = [
    new THREE.Vector3(h.x + 7, h.y + 0.55, h.z + 5),
    new THREE.Vector3(h.x - 7, h.y + 0.55, h.z - 9),
  ];
  for (const deck of h.decks) delete deck.mesh;
  updatePressureArt(h);
}

export function updatePressureArt(h) {
  const a = h.art;
  if (!a) return;
  const carY = h.lift.root.position.y,
    bottom = carY + 2.8,
    length = RELAY_CABLE_TOP - bottom;
  a.cable.position.y = bottom + length / 2;
  a.cable.scale.y = length;
  a.rotor.rotation.z = -carY / 0.6;
  for (const roller of a.rollers)
    roller.root.rotation.z = (-roller.side * carY) / 0.2;
  for (const { collider, bottom, top } of a.movingSolids) {
    collider.bottom = h.y + carY + bottom;
    collider.top = h.y + carY + top;
  }
  for (const g of a.gauges) {
    const i = g.bank * 2,
      p = PRESSURE_PISTONS[i],
      height = h.pistons[i].root.position.y;
    g.root.rotation.z =
      h.saved.opened > g.bank
        ? -0.8 + ((height - p.low) / (p.high - p.low)) * 1.6
        : 1.5;
  }
}
