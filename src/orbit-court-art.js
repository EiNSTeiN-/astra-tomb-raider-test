import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { flutedColumnGeometry, vaultStoneGeometry } from "./palace-geometry.js";
import { tintOrbitStone } from "./orbit-materials.js";

export function buildOrbitCourtArt(game, helpers) {
  const { add, box, fixed, materials, bronze, orbitSector } = helpers,
    { masonry, paving, recess } = materials,
    h = game.orbitVault,
    art = (h.art = { columns: [], arches: [], lamps: [], supports: [] });
  let serial = 39000;
  const block = (w, height, d, x, y, z, mat = masonry) =>
    add(
      tintOrbitStone(stoneBlockGeometry(w, height, d, serial), serial++),
      mat,
      x,
      y,
      z,
    );
  const polar = (r, a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  const pavingArc = (inner, outer, from, to, rows, parent) => {
    const width = (outer - inner) / rows;
    for (let row = 0; row < rows; row++) {
      const lo = inner + row * width,
        hi = lo + width,
        count = Math.ceil(((to - from) * (lo + hi)) / 3.5),
        step = (to - from) / count,
        joint = 0.012 / lo;
      for (let i = 0; i < count; i++)
        add(
          tintOrbitStone(
            orbitSector(
              lo + 0.012,
              hi - 0.012,
              from + i * step + joint,
              from + (i + 1) * step - joint,
              0.065,
            ),
            serial++,
          ),
          paving,
          0,
          0.006,
          0,
          parent,
          false,
        );
    }
  };
  pavingArc(20.2, 23.78, 0, Math.PI * 2, 3, fixed);
  for (const ring of h.rings)
    for (const [a, b] of ring.arcs)
      pavingArc(ring.inner + 0.18, ring.outer - 0.18, a, b, 2, ring.root);
  for (const rest of h.rests.slice(1))
    block(
      rest.w * 2 - 0.06,
      0.06,
      rest.d * 2 - 0.06,
      rest.x - h.x,
      -0.024,
      rest.z - h.z,
      paving,
    );

  // Staggered retaining masonry shows through the crowns. Its cap remains
  // beneath the bank: it does not create a false landing in the entrance gap.
  for (let course = 0; course < 6; course++) {
    const count = 64,
      step = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const a = (i + (course % 2) * 0.5) * step;
      add(
        tintOrbitStone(
          orbitSector(19.9, 20.42, a + 0.0007, a + step - 0.0007, 1.42),
          serial++,
        ),
        course % 3 ? masonry : recess,
        0,
        -0.42 - course * 1.47,
        0,
        fixed,
        false,
      );
    }
  }

  // Radial girders sit below fall recovery; brackets rise to the three fixed
  // bearing tracks beneath the moving decks.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      p = polar(11.1, a),
      beam = box(17.6, 0.42, 0.48, p.x, -2.9, p.z, bronze);
    beam.rotation.y = -a;
    art.supports.push({ x: p.x, y: -2.9, z: p.z, angle: a, length: 17.6 });
    for (const r of [5.5, 10.5, 15.5]) {
      const q = polar(r, a);
      block(0.66, 1.7, 0.66, q.x, -1.85, q.z, recess);
      block(1.05, 0.2, 1.05, q.x, -0.93, q.z);
    }
  }
  for (const rest of h.rests.slice(1)) {
    const x = rest.x - h.x,
      z = rest.z - h.z;
    for (const [radius, height, y] of [
      [1.25, 0.28, -0.6],
      [0.91, 0.32, -2.2],
      [1.3, 0.4, -8.9],
    ])
      add(
        new THREE.CylinderGeometry(radius, radius, height, 24),
        masonry,
        x,
        y,
        z,
      );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2,
        p = polar(0.85, a),
        brace = box(1.5, 0.32, 0.36, x + p.x, -1.13, z + p.z, bronze);
      brace.rotation.set(0, -a, Math.PI / 4);
    }
  }

  // The broad western break frames the approach and the return bridge.
  // Footprints stay within the existing vault's arrival-recovery boundary.
  const points = new Map(),
    spring = 5.5;
  for (let i = 0; i < 16; i++) {
    if (i === 7 || i === 8) continue;
    const a = ((i + 0.5) * Math.PI) / 8,
      p = polar(23.9, a),
      samples = [-0.65, 0, 0.65].flatMap((dx) =>
        [-0.65, 0, 0.65].map(
          (dz) => game.groundHeight(h.x + p.x + dx, h.z + p.z + dz) - h.y,
        ),
      ),
      foot = Math.min(...samples) - 0.12,
      base = Math.max(0.22, ...samples) + 0.22,
      broken = i === 3 || i === 11,
      top = broken ? 2.75 : spring;
    points.set(i, { ...p, a, broken });
    block(1.35, base - foot, 1.35, p.x, (base + foot) / 2, p.z);
    add(
      tintOrbitStone(flutedColumnGeometry(top - base - 0.18, 0.47), serial++),
      masonry,
      p.x,
      base + 0.18,
      p.z,
    );
    add(
      new THREE.CylinderGeometry(0.62, 0.66, 0.18, 24),
      paving,
      p.x,
      base + 0.09,
      p.z,
    );
    if (!broken) {
      add(
        new THREE.CylinderGeometry(0.67, 0.48, 0.26, 24),
        masonry,
        p.x,
        spring - 0.13,
        p.z,
      );
      block(1.42, 0.28, 1.42, p.x, spring + 0.14, p.z, paving);
    }
    const obstacle = {
      x: h.x + p.x,
      z: h.z + p.z,
      // Movement obstacles store half extents including body clearance.
      w: 1.1,
      d: 1.1,
      h:
        h.y +
        top +
        (broken ? 0 : 0.28) -
        game.groundHeight(h.x + p.x, h.z + p.z),
      orbitVault: true,
    };
    game.obstacles.push(obstacle);
    art.columns.push({ index: i, ...p, base, top, obstacle });
  }
  for (const [i, p] of points) {
    const q = points.get((i + 1) % 16);
    if (!q) continue;
    const span = Math.hypot(q.x - p.x, q.z - p.z) / 2,
      yaw = Math.atan2(-(q.z - p.z), q.x - p.x),
      center = new THREE.Vector3(
        (p.x + q.x) / 2,
        spring + 0.28,
        (p.z + q.z) / 2,
      ),
      complete = !p.broken && !q.broken && i !== 12;
    for (let j = 0; j < 9; j++) {
      // The first voussoirs start at q; the last end at p. Broken bays leave
      // the keystone and unsupported side absent, exposing their cut faces.
      if (!complete && !((j <= 1 && !q.broken) || (j >= 7 && !p.broken)))
        continue;
      const arch = add(
        tintOrbitStone(
          vaultStoneGeometry(
            span - 0.55,
            span + 0.12,
            (j * Math.PI) / 9 + 0.003,
            ((j + 1) * Math.PI) / 9 - 0.003,
            0.84,
          ),
          serial++,
        ),
        j === 4 ? paving : masonry,
        center.x,
        center.y,
        center.z,
        fixed,
        false,
      );
      arch.rotation.y = yaw;
      game.cameraSurfaces?.capture(arch, { small: true });
    }
    art.arches.push({ center, span, yaw, complete });
  }

  game.flames ??= [];
  for (const i of [0, 4, 10, 14]) {
    const column = points.get(i),
      p = polar(22, column.a),
      bracket = box(
        2.1,
        0.11,
        0.14,
        (column.x + p.x) / 2,
        2.78,
        (column.z + p.z) / 2,
        bronze,
      );
    bracket.rotation.y = -column.a;
    add(
      new THREE.CylinderGeometry(0.38, 0.18, 0.26, 20),
      bronze,
      p.x,
      2.8,
      p.z,
    );
    add(
      new THREE.CylinderGeometry(0.27, 0.27, 0.06, 16),
      recess,
      p.x,
      2.91,
      p.z,
    );
    for (let j = 0; j < 4; j++) {
      const q = polar(0.29, (j * Math.PI) / 2);
      box(0.035, 0.62, 0.035, p.x + q.x, 3.14, p.z + q.z, bronze);
    }
    const crown = add(
      new THREE.TorusGeometry(0.31, 0.027, 5, 20),
      bronze,
      p.x,
      3.43,
      p.z,
    );
    crown.rotation.x = Math.PI / 2;
    // buildFireEffects replaces this seed geometry with its shared animated
    // flame shader and services it through the chapter's four nearest lights.
    const flame = add(
      new THREE.ConeGeometry(0.12, 0.45, 6),
      new THREE.MeshStandardMaterial({ color: 0xffb24d, emissive: 0xff7b20 }),
      p.x,
      3.1,
      p.z,
      fixed,
      false,
    );
    flame.userData.animated = flame.userData.orbitLamp = true;
    flame.userData.fireIntensity = 18;
    flame.userData.fireRange = 18;
    game.flames.push(flame);
    const source = {
      id: `orbit-lamp-${i}`,
      kind: "fire",
      x: h.x + p.x,
      y: h.y + 3.1,
      z: h.z + p.z,
      near: 1.5,
      range: 14,
      gain: 0.05,
    };
    h.sources.push(source);
    art.lamps.push({ flame, source });
  }
}
