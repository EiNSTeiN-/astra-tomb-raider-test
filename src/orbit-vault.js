import * as THREE from "three";
import {
  ORBIT_RINGS,
  ORBIT_RESTS,
  normalizeOrbit,
  orbitAngle,
  orbitDeckAt,
  orbitAnchor,
  inOrbitVault,
} from "./orbit-rules.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { buildOrbitBearing } from "./orbit-bearing-art.js";
import { beginOrbitBearing, syncOrbitBearing } from "./orbit-motion.js";
import {
  buildOrbitBridge,
  updateOrbitBridge,
  orbitBridgeBlocked,
} from "./orbit-bridge.js";

export function orbitSector(inner, outer, from, to, thickness = 0.35) {
  const points = [],
    uv = [],
    steps = Math.ceil(((to - from) * outer) / 1.1);
  const at = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  const tri = (a, b, c, coords) => {
    for (const [i, p] of [a, b, c].entries()) {
      points.push(...p);
      uv.push(...(coords?.[i] || [p[0] / 4, p[2] / 4]));
    }
  };
  const quad = (a, b, c, d, coords) => {
    tri(a, b, c, coords?.slice(0, 3));
    tri(a, c, d, coords && [coords[0], coords[2], coords[3]]);
  };
  // The crown uses planar paving. Cut edges unwrap along arc length and height;
  // reusing the crown's coordinates there collapses the UVs into a stripe.
  const wall = (u, v) => [u / 4, v / 4];
  for (let i = 0; i < steps; i++) {
    const a = from + ((to - from) * i) / steps,
      b = from + ((to - from) * (i + 1)) / steps,
      ia = at(inner, a, 0),
      ib = at(inner, b, 0),
      oa = at(outer, a, 0),
      ob = at(outer, b, 0),
      la = at(inner, a, -thickness),
      lb = at(inner, b, -thickness),
      ra = at(outer, a, -thickness),
      rb = at(outer, b, -thickness);
    quad(ia, ib, ob, oa);
    quad(la, ra, rb, lb);
    quad(ia, la, lb, ib, [
      wall(inner * a, 0),
      wall(inner * a, -thickness),
      wall(inner * b, -thickness),
      wall(inner * b, 0),
    ]);
    quad(oa, ob, rb, ra, [
      wall(outer * a, 0),
      wall(outer * b, 0),
      wall(outer * b, -thickness),
      wall(outer * a, -thickness),
    ]);
    if (!i)
      quad(ia, oa, ra, la, [
        wall(inner, 0),
        wall(outer, 0),
        wall(outer, -thickness),
        wall(inner, -thickness),
      ]);
    if (i === steps - 1)
      quad(ib, lb, rb, ob, [
        wall(inner, 0),
        wall(inner, -thickness),
        wall(outer, -thickness),
        wall(outer, 0),
      ]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function label(text, width = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#e9d49a";
  c.font = "bold 38px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 64, 500);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
    }),
  );
}
export function buildOrbitVault(game) {
  game.orbitVault = null;
  const site = game.map.orbitVault;
  if (!site) return;
  const x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x + 23, z) + 0.18,
    root = new THREE.Group(),
    fixed = new THREE.Group(),
    saved = normalizeOrbit(game.progress.orbitVault);
  root.name = "The Cartographer’s Orrery";
  root.position.set(x, y, z);
  root.add(fixed);
  game.world.add(root);
  game.progress.orbitVault = saved;
  const h = (game.orbitVault = {
    x,
    y,
    z,
    root,
    saved,
    anchor: saved.rest,
    operation: null,
    rings: [],
    rests: [],
    controls: [],
    sources: [],
    bank: { orbitBank: true },
    hub: { orbitHub: true },
    returnDeck: { orbitReturn: true },
  });
  const stone = game.stoneMat,
    bronze = patinatedBronze(),
    dark = game.darkMat;
  let serial = 23000;
  const add = (geometry, mat, px, py, pz, parent = fixed, camera = true) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const box = (w, t, d, px, py, pz, mat = stone, parent = fixed) =>
    add(stoneBlockGeometry(w, t, d, serial++), mat, px, py, pz, parent);
  const sector = (
    inner,
    outer,
    a,
    b,
    mat,
    py = 0,
    parent = fixed,
    t = 0.35,
  ) => {
    const count = Math.ceil((b - a) / 0.12);
    for (let i = 0; i < count; i++)
      add(
        orbitSector(
          inner,
          outer,
          a + ((b - a) * i) / count,
          a + ((b - a) * (i + 1)) / count,
          t,
        ),
        mat,
        0,
        py,
        0,
        parent,
      );
  };
  sector(20, 24, 0, Math.PI * 2, stone);
  add(orbitSector(20, 20.18, 0, Math.PI * 2, 0.08), bronze, 0, 0.015, 0);
  add(orbitSector(23.8, 24, 0, Math.PI * 2, 0.08), bronze, 0, 0.015, 0);
  // The deep drum, bearing tracks and centre shaft support the moving crowns.
  add(
    new THREE.CylinderGeometry(19.6, 19.6, 9.4, 80, 1, true),
    dark,
    0,
    -5,
    0,
    fixed,
    false,
  );
  add(new THREE.CylinderGeometry(2.5, 2.9, 10, 32), stone, 0, -5, 0);
  add(new THREE.CylinderGeometry(0.6, 1, 1.2, 20), bronze, 0, 0.6, 0);
  game.obstacles.push({
    x,
    z,
    w: 1.35,
    d: 1.35,
    h: y - game.groundHeight(x, z) + 1.2,
    orbitVault: true,
  });
  for (let n = 0; n < 48; n++) {
    const a = (n * Math.PI) / 24,
      r = 22.7;
    const mark = box(
      0.07,
      0.03,
      n % 4 === 0 ? 0.9 : 0.35,
      Math.cos(a) * r,
      0.04,
      Math.sin(a) * r,
      bronze,
    );
    mark.rotation.y = Math.PI / 2 - a;
  }
  for (const [index, config] of ORBIT_RINGS.entries()) {
    const moving = new THREE.Group();
    moving.userData.cameraDynamic = moving.userData.animated = true;
    root.add(moving);
    const ring = {
      ...config,
      index,
      root: moving,
      angle: saved.angles[index],
      orbitRing: true,
    };
    h.rings.push(ring);
    for (const [a, b] of config.arcs) {
      sector(config.inner, config.outer, a, b, stone, 0, moving);
      for (const r of [config.inner, config.outer - 0.16])
        add(orbitSector(r, r + 0.16, a, b, 0.08), bronze, 0, 0.015, 0, moving);
      const divisions = Math.ceil((b - a) / 0.15);
      for (let j = 0; j <= divisions; j++) {
        const angle = a + ((b - a) * j) / divisions,
          r = (config.inner + config.outer) / 2;
        const joint = box(
          config.outer - config.inner,
          0.04,
          0.055,
          Math.cos(angle) * r,
          0.02,
          Math.sin(angle) * r,
          bronze,
          moving,
        );
        joint.rotation.y = -angle;
      }
      for (const a0 of [a, b]) {
        const r = (config.inner + config.outer) / 2,
          edge = box(
            config.outer - config.inner,
            0.05,
            0.17,
            Math.cos(a0) * r,
            0.03,
            Math.sin(a0) * r,
            game.glowMat,
            moving,
          );
        edge.rotation.y = -a0;
      }
    }
    // Rails and rollers sit beneath each deck, leaving the entire top walkable.
    sector(
      config.inner + 0.35,
      config.inner + 0.65,
      0,
      Math.PI * 2,
      bronze,
      -0.8,
      fixed,
      0.32,
    );
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6,
        r = config.inner + 0.5;
      const wheel = add(
        new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12),
        bronze,
        Math.cos(a) * r,
        -0.55,
        Math.sin(a) * r,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.rotation.y = -a;
    }
    const source = {
      id: `orbit-ring-${index}`,
      kind: "machine",
      x,
      y: y + 0.6,
      z,
      near: 2,
      range: 30,
      gain: 0.06,
      activity: 0,
    };
    h.sources.push(source);
    ring.source = source;
  }
  for (const [index, r] of ORBIT_RESTS.entries()) {
    const d = { ...r, x: x + r.x, z: z + r.z, y, orbitRest: index };
    h.rests.push(d);
    box(r.w * 2, 0.4, r.d * 2, r.x, -0.2, r.z);
    if (index) {
      add(new THREE.CylinderGeometry(0.72, 1.05, 9.5, 12), stone, r.x, -5, r.z);
      const control = {
        kind: "bearing",
        index: index - 1,
        position: new THREE.Vector3(d.x - 0.35, y, d.z),
      };
      h.controls.push(control);
      buildOrbitBearing(game, control, { add, box, bronze, dark, label });
      const plaque = label(["EARTH", "MOON", "STAR"][index - 1], 1.5);
      plaque.rotation.x = -Math.PI / 2;
      plaque.position.set(r.x, 0.07, r.z - 0.95);
      fixed.add(plaque);
    }
  }
  box(0.8, 1.1, 0.6, -22, 0.55, -3.7, dark);
  game.obstacles.push({
    x: x - 22,
    z: z - 3.7,
    w: 0.8,
    d: 0.7,
    h: y - game.groundHeight(x - 22, z - 3.7) + 1.1,
    orbitVault: true,
  });
  const title = label("THE CARTOGRAPHER’S ORRERY", 4.2);
  title.position.set(-22, 2, -3.4);
  fixed.add(title);
  const text = label("EARTH → MOON → STAR", 2.2);
  text.position.set(-22, 1.1, -3.34);
  fixed.add(text);
  h.controls.unshift({
    kind: "guide",
    position: new THREE.Vector3(x - 22, y, z - 2.4),
  });
  h.controls.push({
    kind: "record",
    position: new THREE.Vector3(x, y, z + 1.9),
  });
  const chart = add(new THREE.CircleGeometry(0.78, 32), bronze, 0, 1.22, 0);
  chart.rotation.x = -Math.PI / 2;
  for (const r of [0.25, 0.48, 0.7])
    add(
      new THREE.TorusGeometry(r, 0.018, 6, 48),
      game.glowMat,
      0,
      1.23,
      0,
    ).rotation.x = Math.PI / 2;
  buildOrbitBridge(game, { add, box, bronze, dark });
  mergeArchitecture(fixed);
  for (const r of h.rings) mergeArchitecture(r.root);
  updateOrbitVault(game, 0, true);
}

export function orbitBlocked(game, x, z, y, clearance = 1.8) {
  if (orbitBridgeBlocked(game, x, z, y, clearance)) return true;
  const d = orbitDeckAt(game, x, z);
  return !!d && y < d.height - 0.4 && y + clearance > d.height - 0.35;
}
export function orbitOccludes(game, from, to) {
  const h = game.orbitVault;
  if (!h) return false;
  for (const height of [h.y - 0.35, h.y, h.y + 0.18]) {
    const dy = to.y - from.y;
    if (Math.abs(dy) < 1e-8) continue;
    const t = (height - from.y) / dy;
    if (t <= 0 || t >= 1) continue;
    if (
      orbitDeckAt(
        game,
        from.x + (to.x - from.x) * t,
        from.z + (to.z - from.z) * t,
      )
    )
      return true;
  }
  return false;
}
export function updateOrbitVault(game, dt, initial = false) {
  const h = game.orbitVault;
  if (!h) return;
  if (game.paused) dt = 0;
  updateOrbitBridge(game, dt);
  const p = game.player?.position,
    standing = p && game.grounded ? orbitDeckAt(game, p.x, p.z, p.y) : null;
  for (const r of h.rings) {
    const running = h.saved.started && h.saved.aligned === r.index,
      delta = running ? Math.max(0, dt) * r.speed : 0;
    r.angle = orbitAngle(r.angle + delta);
    r.root.rotation.y = -r.angle;
    if (
      !initial &&
      delta &&
      standing?.surface === r &&
      Math.abs(p.y - h.y) < 0.24 &&
      !game.climb
    ) {
      const dx = p.x - h.x,
        dz = p.z - h.z,
        c = Math.cos(delta),
        s = Math.sin(delta),
        nx = h.x + dx * c - dz * s,
        nz = h.z + dx * s + dz * c;
      if (game.canMove(nx, nz, p.y - game.groundHeight(nx, nz))) {
        p.x = nx;
        p.z = nz;
        if (game.avatar) game.avatar.rotation.y -= delta;
      }
      game.jumpY = p.y - game.groundHeight(p.x, p.z);
    }
    const a = r.angle + (r.arcs[0][0] + r.arcs[0][1]) / 2,
      rad = (r.inner + r.outer) / 2;
    r.source.x = h.x + Math.cos(a) * rad;
    r.source.z = h.z + Math.sin(a) * rad;
    r.source.activity = running && !game.paused ? 0.6 : 0;
  }
  for (const c of h.controls)
    if (c.wheel) {
      syncOrbitBearing(game, c, dt, initial);
      c.pointer.rotation.z = (-c.turn * Math.PI) / 2;
    }
  if (initial || game.paused || !p) return;
  let changed = false;
  if (standing?.surface === h.bank) h.anchor = 0;
  if (inOrbitVault(game.map, p.x, p.z) && !h.saved.visited) {
    h.saved.visited = true;
    changed = true;
    game.cb.toast?.(
      "Discovered · The Cartographer’s Orrery. Read the tablet on the western landing.",
      5000,
    );
  }
  if (game.grounded && Math.abs(p.y - h.y) < 0.25)
    for (const [i, d] of h.rests.entries()) {
      if (
        Math.abs(p.x - d.x) > d.w - 0.2 ||
        Math.abs(p.z - d.z) > d.d - 0.2 ||
        i > h.saved.aligned + 1
      )
        continue;
      h.anchor = i;
      if (i > h.saved.rest) {
        h.saved.rest = i;
        changed = true;
        game.cb.toast?.(`${d.name} · Safe landing recorded`, 3500);
      }
    }
  if (changed) game.save();
}
export function recoverOrbitFall(game) {
  const h = game.orbitVault,
    p = game.player?.position;
  if (!h || !p || !inOrbitVault(game.map, p.x, p.z) || p.y >= h.y - 2) return;
  const a = orbitAnchor(h);
  p.set(a.x, a.y, a.z);
  game.grounded = true;
  game.velocityY = 0;
  game.jumpY = a.y - game.groundHeight(a.x, a.z);
  game.fallPeak = a.y;
  game.airVelocity = null;
  game.damage?.(8);
  game.save();
  game.cb.toast?.(
    "A fall into the instrument well returns you to your last safe landing.",
    4500,
  );
}
export function orbitControl(game) {
  const h = game.orbitVault;
  if (
    !h ||
    game.paused ||
    !game.grounded ||
    game.climb ||
    game.dodge ||
    game.swimming
  )
    return null;
  const p = game.player.position;
  return (
    h.controls.find(
      (c) =>
        p.distanceTo(c.position) < 1.4 &&
        (!game.lineOfSight || game.lineOfSight(p, c.position)),
    ) || null
  );
}
export function orbitHint(game) {
  if (game.orbitVault?.operation)
    return {
      key: "WASD / SPACE",
      label: game.orbitVault.operation.committed
        ? "Bearing calibrated · releasing grips"
        : "Turning bearing · move or jump to cancel",
    };
  const c = orbitControl(game);
  if (!c) return null;
  const s = game.orbitVault.saved;
  return {
    key: "E",
    label:
      c.kind === "guide"
        ? s.started
          ? "Read the cartographers’ tablet"
          : "Read the tablet and start the earthly ring"
        : c.kind === "record"
          ? s.aligned === 3
            ? "Recover the return chart"
            : "Calibrate all three bearings first"
          : s.aligned > c.index
            ? "Bearing calibrated"
            : s.aligned === c.index && s.started
              ? `Calibrate the ${ORBIT_RINGS[c.index].name.toLowerCase()} bearing`
              : "Calibrate the earlier bearing first",
  };
}
export function orbitInteract(game) {
  if (game.orbitVault?.operation) return true;
  const c = orbitControl(game);
  if (!c) return false;
  const h = game.orbitVault,
    s = h.saved;
  s.visited = true;
  if (c.kind === "guide") {
    s.started = true;
    game.save();
    game.cb.orbitGuide?.();
  } else if (
    c.kind === "bearing" &&
    s.started &&
    s.aligned === c.index &&
    s.rest >= c.index + 1
  ) {
    beginOrbitBearing(game, c);
  } else if (c.kind === "record" && s.aligned === 3) {
    s.recovered = true;
    game.audio.tone("collect");
    game.save();
    game.cb.orbitRecord?.();
  }
  updateOrbitVault(game, 0);
  return true;
}
export function orbitObjective(game) {
  const h = game.orbitVault,
    p = game.player?.position;
  if (!h || !p || !inOrbitVault(game.map, p.x, p.z)) return null;
  return {
    step: h.saved.recovered ? 4 : h.saved.aligned,
    text: !h.saved.started
      ? "Start the orrery from its western tablet"
      : h.saved.recovered
        ? h.bridge.progress < 1
          ? "Wait for the return bridge to unfold"
          : "Cross the return bridge to the western landing"
        : h.saved.aligned === 3
          ? "Recover the cartographers’ return chart"
          : `Reach and calibrate the ${ORBIT_RINGS[h.saved.aligned].name.toLowerCase()} bearing`,
  };
}
