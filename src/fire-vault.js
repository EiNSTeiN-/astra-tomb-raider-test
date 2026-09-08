import * as THREE from "three";
import {
  VAULT_CELLS,
  VAULT_PORTS,
  VAULT_FIRES,
  normalizeFireVault,
  vaultLinks,
  vaultPorts,
} from "./fire-vault-rules.js";
import {
  stoneBlockGeometry,
  carvedPanelGeometry,
} from "./temple-architecture.js";
import { lotusBowlGeometry } from "./jungle-shrines.js";
import { torchHandsBusy } from "./torch.js";
import {
  beginCausewayWheel,
  syncCausewayHandle,
  causewayWheelMoving,
} from "./fire-vault-motion.js";
import { mergeArchitecture } from "./visuals.js";

export function insideFireVault(game) {
  const v = game.fireVault,
    p = game.player?.position;
  return (
    !!v && !!p && Math.abs(p.x - v.x) < 23 && p.z - v.z > -33 && p.z - v.z < 33
  );
}
function inscription(text, width = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ddcc9b";
  c.font = "600 33px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 64, 490);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  m.userData.animated = true;
  return m;
}
export function buildFireVault(game) {
  game.fireVault = null;
  if (!game.map.fireVault) return;
  const site = game.map.fireVault,
    x = site.x * 7,
    z = site.z * 7,
    y = game.groundHeight(x, z);
  const saved = normalizeFireVault(game.progress.fireVault);
  game.progress.fireVault = saved;
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.name = "Rainkeeper's causeway";
  game.world.add(root);
  const v = (game.fireVault = {
    root,
    x,
    y,
    z,
    saved,
    rotors: [],
    edges: [],
    fires: [],
    controls: [],
    sources: [],
    gate: null,
    open: saved.lit.length === 3 ? 1 : 0,
  });
  v.sources.push({
    id: "vault-drips",
    kind: "drips",
    x: x - 20,
    y: y + 4,
    z,
    gain: 0.14,
    near: 2,
    range: 24,
  });
  const stone = game.templeMaterial || game.stoneMat;
  const bronze = new THREE.MeshStandardMaterial({
    color: 0x81724b,
    metalness: 0.63,
    roughness: 0.72,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x353c32,
    roughness: 1,
  });
  let serial = 1800;
  const mesh = (
    geometry,
    material,
    px,
    py,
    pz,
    parent = root,
    camera = false,
  ) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Array(geometry.attributes.position.count * 3).fill(0.9),
          3,
        ),
      );
    const m = new THREE.Mesh(geometry, material);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    if (camera) game.cameraSurfaces?.capture(m);
    return m;
  };
  const block = (
    w,
    h,
    d,
    px,
    py,
    pz,
    parent = root,
    material = stone,
    camera = false,
  ) =>
    mesh(
      stoneBlockGeometry(w, h, d, serial++),
      material,
      px,
      py,
      pz,
      parent,
      camera,
    );
  const obstacle = (px, pz, w, d, h, climbable = false) => {
    const o = { x: x + px, z: z + pz, w, d, h, climbable, vault: true };
    game.obstacles.push(o);
    return o;
  };
  const platform = (px, pz, w, d, h = 1.92) => {
    block(w, h, d, px, h / 2, pz);
    obstacle(px, pz, w / 2, d / 2, h, true);
    block(w + 0.08, 0.09, d + 0.08, px, h - 0.055, pz, root, bronze);
  };
  // A rain drain in the west wall supplies the local dripping-water voice.
  block(1.3, 0.3, 0.8, -20.5, 3.8, 0, root, stone);
  block(0.65, 0.06, 0.28, -20.17, 3.97, 0, root, bronze);
  const drops = new THREE.BufferGeometry();
  drops.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(36), 3),
  );
  v.drips = new THREE.Points(
    drops,
    new THREE.PointsMaterial({
      color: 0xb6ddd7,
      size: 0.07,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  v.drips.userData.animated = true;
  v.drips.frustumCulled = false;
  root.add(v.drips);
  // A retained pool, entered from the jungle along twelve low stone steps.
  platform(0, -25, 39, 5);
  platform(0, 26, 39, 5);
  for (let i = 0; i < 12; i++) {
    const h = (i + 1) * 0.16;
    platform(-8, -33.5 + i * 0.55, 4, 0.61, h);
  }
  for (const side of [-1, 1]) {
    for (let course = 0; course < 9; course++)
      for (let bay = 0; bay < 10; bay++)
        block(
          1.1,
          0.66,
          5.48,
          side * 21.5,
          0.33 + course * 0.66,
          -24.75 + bay * 5.5,
          root,
          stone,
          true,
        );
    obstacle(side * 21.5, 0, 0.8, 28.1, 6);
    // Moulded caps and reliefs face into the water hall.
    block(1.5, 0.24, 56, side * 21.5, 6.1, 0, root, stone, true);
    for (const pz of [-19, -8, 3, 14, 25]) {
      const panel = mesh(
        carvedPanelGeometry(2.2, 3.6, serial++),
        stone,
        side * 20.84,
        1.6,
        pz,
      );
      panel.rotation.y = (-side * Math.PI) / 2;
    }
  }
  // Tall entry wall with a door over the stair; rear vault has a central gate.
  for (const [pz, door] of [
    [-28, -8],
    [29, 0],
  ]) {
    const ranges = [
      [-22, door - 2.5],
      [door + 2.5, 22],
    ];
    for (const [left, right] of ranges) {
      const bays = Math.ceil((right - left) / 4.8),
        width = (right - left) / bays;
      for (let course = 0; course < 8; course++)
        for (let bay = 0; bay < bays; bay++)
          block(
            width - 0.025,
            0.73,
            1.1,
            left + (bay + 0.5) * width,
            0.375 + course * 0.75,
            pz,
            root,
            stone,
            true,
          );
      obstacle((left + right) / 2, pz, (right - left) / 2 + 0.22, 0.77, 6);
    }
    block(5.7, 0.85, 1.35, door, 5.4, pz, root, stone, true);
    for (const side of [-1, 1]) {
      block(0.25, 3, 1.4, door + side * 2.4, 3.42, pz, root, bronze, true);
      block(0.6, 0.24, 1.55, door + side * 2.4, 4.85, pz, root, stone, true);
    }
    block(44, 0.5, 1.5, 0, 6.1, pz, root, stone, true);
  }
  // Broken roof ribs preserve a view of the jungle canopy and shafts of daylight.
  for (const pz of [-23, -7, 9, 25])
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 4; tier++)
        block(
          3.5,
          0.55,
          1.4,
          side * (20 - tier * 2.35),
          6.5 + tier * 0.45,
          pz,
          root,
          stone,
          true,
        );
    }
  for (const [i, [px, pz]] of VAULT_CELLS.entries()) {
    platform(px, pz, 3.4, 3.4);
    const pivot = new THREE.Group();
    pivot.position.set(px, 1.92, pz);
    pivot.userData.cameraDynamic = true;
    root.add(pivot);
    const rotor = {
      pivot,
      angle: (saved.turns[i] * Math.PI) / 2,
      target: (saved.turns[i] * Math.PI) / 2,
      moving: false,
    };
    v.rotors.push(rotor);
    rotor.source = {
      id: `vault-turn-${i}`,
      kind: "machine",
      x: x + px,
      y: y + 2.4,
      z: z + pz,
      gain: 0.1,
      near: 1.5,
      range: 18,
      activity: 0,
    };
    v.sources.push(rotor.source);
    // Broad engraved arms turn on a safe hub. Connecting spans lower only when
    // the neighbouring sockets face one another; unpaired ends remain raised.
    for (const d of VAULT_PORTS[i]) {
      const arm = new THREE.Group();
      arm.rotation.y = (-d * Math.PI) / 2;
      pivot.add(arm);
      block(1.65, 0.2, 1.5, 0, -0.1, -0.65, arm, bronze);
      for (const p of [-0.34, 0.34]) {
        const mark = block(0.08, 0.025, 0.7, p, 0.015, -0.73, arm, dark);
        mark.rotation.y = p > 0 ? -0.5 : 0.5;
      }
    }
    const control = new THREE.Group();
    control.position.set(px - 0.7, 1.92, pz + 0.65);
    root.add(control);
    block(0.28, 1.1, 0.28, 0, 0.55, 0, control, bronze);
    obstacle(px - 0.7, pz + 0.65, 0.18, 0.18, 3.05);
    const spindle = new THREE.Group();
    spindle.position.y = 1.16;
    spindle.rotation.x = -0.45;
    control.add(spindle);
    // A ratchet returns the grips after release without reversing the crossing.
    const casing = mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16),
      bronze,
      0,
      0,
      -0.14,
      spindle,
    );
    casing.rotation.x = Math.PI / 2;
    const handle = new THREE.Group();
    handle.name = `Crossing ${i + 1} ratchet wheel`;
    spindle.add(handle);
    mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 32), bronze, 0, 0, 0, handle);
    for (const angle of [0, Math.PI / 2])
      block(0.06, 0.65, 0.055, 0, 0, 0, handle, bronze).rotation.z = angle;
    const grips = [-1, 1].map((side) => {
      const grip = new THREE.Object3D();
      grip.position.set(side * 0.23, 0, 0.16);
      grip.name = `${side < 0 ? "Left" : "Right"} crossing wheel grip`;
      handle.add(grip);
      mesh(
        new THREE.CylinderGeometry(0.019, 0.019, 0.2, 16),
        bronze,
        side * 0.23,
        0,
        0.16,
        handle,
      ).rotation.z = Math.PI / 2;
      for (const end of [-1, 1]) {
        const pin = mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10),
          bronze,
          side * 0.23 + end * 0.115,
          0,
          0.08,
          handle,
        );
        pin.rotation.x = Math.PI / 2;
      }
      return grip;
    });
    mergeArchitecture(handle);
    const sign = inscription(String(i + 1), 0.55);
    sign.position.set(0, 0.6, 0.16);
    control.add(sign);
    v.controls.push({
      kind: "turn",
      index: i,
      position: new THREE.Vector3(x + px - 0.7, y + 1.92, z + pz + 0.65),
      handle,
      grips,
    });
    mergeArchitecture(pivot);
    mergeArchitecture(control);
  }
  const candidates = [];
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++)
      if (
        Math.abs(VAULT_CELLS[a][0] - VAULT_CELLS[b][0]) +
          Math.abs(VAULT_CELLS[a][1] - VAULT_CELLS[b][1]) ===
        16
      )
        candidates.push({
          indices: [a, b],
          a: VAULT_CELLS[a],
          b: VAULT_CELLS[b],
        });
  candidates.push(
    { end: "entry", indices: [0], a: [-8, -26], b: VAULT_CELLS[0] },
    { end: "exit", indices: [4], a: VAULT_CELLS[4], b: [-8, 26] },
  );
  for (const edge of candidates) {
    const dx = edge.b[0] - edge.a[0],
      dz = edge.b[1] - edge.a[1],
      length = Math.hypot(dx, dz),
      halves = [];
    for (const half of [0, 1]) {
      const p = half ? edge.b : edge.a,
        group = new THREE.Group(),
        sign = half ? -1 : 1,
        halfLength = length / 2 - 1.7;
      group.position.set(
        p[0] + ((sign * dx) / length) * 1.7,
        1.92,
        p[1] + ((sign * dz) / length) * 1.7,
      );
      group.rotation.y = Math.atan2(dx, dz) + (half ? Math.PI : 0);
      group.userData.cameraDynamic = true;
      root.add(group);
      const leaf = new THREE.Group();
      group.add(leaf);
      const parts = Math.ceil(halfLength / 1.4);
      for (let j = 0; j < parts; j++)
        block(
          2.15,
          0.23,
          halfLength / parts - 0.025,
          0,
          -0.11,
          ((j + 0.5) * halfLength) / parts,
          leaf,
          stone,
          true,
        );
      for (const side of [-1, 1])
        block(
          0.1,
          0.12,
          halfLength,
          side * 1.01,
          0.06,
          halfLength / 2,
          leaf,
          bronze,
        );
      mergeArchitecture(leaf);
      halves.push(leaf);
    }
    v.edges.push({ ...edge, halves, open: false, amount: 0 });
  }
  const addFire = (id, px, pz, always = false) => {
    const group = new THREE.Group();
    group.position.set(px, 1.92, pz);
    root.add(group);
    mesh(
      new THREE.CylinderGeometry(0.3, 0.45, 0.85, 12),
      stone,
      0,
      0.425,
      0,
      group,
    );
    const bowl = mesh(lotusBowlGeometry(), bronze, 0, 0, 0, group);
    bowl.scale.set(0.72, 0.8, 0.72);
    const flame = mesh(
      new THREE.ConeGeometry(0.19, 0.85, 7),
      new THREE.MeshBasicMaterial({ color: 0xffbb66 }),
      0,
      1.53,
      0,
      group,
    );
    flame.userData.vaultFire = id;
    game.flames.push(flame);
    const f = {
      id,
      type: always ? "camp" : "vault-fire",
      fire: flame,
      group,
      position: new THREE.Vector3(x + px, y + 1.92, z + pz),
      always,
    };
    obstacle(px, pz, 0.55, 0.55, 2.77);
    v.fires.push(f);
    return f;
  };
  addFire("entry", -11, -25, true);
  for (const index of VAULT_FIRES) {
    const [px, pz] = VAULT_CELLS[index];
    const f = addFire(index, px + 0.85, pz - 0.65);
    v.controls.push({ kind: "light", index, position: f.position.clone() });
  }
  const tablet = block(1.5, 1.1, 0.3, -5, 2.47, -25, root, stone);
  tablet.rotation.x = -0.1;
  const title = inscription("RAINKEEPER’S CAUSEWAY", 4.3);
  title.rotation.y = Math.PI;
  block(4.6, 0.69, 0.06, -8, 5.4, -28.71, root, dark);
  title.position.set(-8, 5.4, -28.75);
  root.add(title);
  v.controls.push({
    kind: "read",
    position: new THREE.Vector3(x - 5, y + 1.92, z - 25),
  });
  // The three fires release the archive grille. Its rails never obstruct escape.
  const gate = new THREE.Group();
  gate.position.set(0, 1.92, 29);
  gate.userData.cameraDynamic = true;
  root.add(gate);
  for (let i = -4; i <= 4; i++)
    block(0.12, 3.6, 0.15, i * 0.49, 1.8, 0, gate, bronze, true);
  block(4.45, 0.2, 0.22, 0, 3.6, 0, gate, bronze, true);
  v.gate = gate;
  v.gateSource = {
    id: "vault-grille",
    kind: "hoist",
    x: x - 2.7,
    y: y + 3.3,
    z: z + 28.24,
    gain: 0.06,
    near: 2,
    range: 20,
    activity: 0,
  };
  v.sources.push(v.gateSource);
  mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 28), bronze, -2.7, 3.3, 28.24);
  v.gateObstacle = obstacle(0, 29, 2.42, 0.55, 5.7);
  platform(0, 31.7, 6, 4.5);
  platform(0, 29, 6, 1.5);
  block(6, 6, 1, 0, 3, 34, root, stone, true);
  obstacle(0, 34, 3.2, 0.7, 6);
  for (const side of [-1, 1]) {
    block(1, 6, 5, side * 3, 3, 31.7, root, stone, true);
    obstacle(side * 3, 31.7, 0.7, 2.5, 6);
  }
  block(7, 0.45, 6, 0, 6.2, 31.7, root, stone, true);
  block(1.3, 0.9, 0.9, 0, 2.37, 32, root, stone);
  obstacle(0, 32, 0.65, 0.45, 2.82);
  const record = block(0.75, 0.09, 0.5, 0, 2.87, 32, root, bronze);
  record.rotation.y = 0.14;
  record.userData.animated = true;
  v.record = record;
  v.controls.push({
    kind: "record",
    position: new THREE.Vector3(x, y + 1.92, z + 31.3),
  });
  mergeArchitecture(root);
  updateFireVault(game, 0, true);
}
export function updateFireVault(game, dt, initial = false) {
  if (game.paused && !initial) dt = 0;
  const v = game.fireVault;
  if (!v) return;
  const s = v.saved;
  const drops = v.drips.geometry.attributes.position;
  for (let i = 0; i < drops.count; i++) {
    const phase = ((game.elapsed || 0) * 0.85 + i / drops.count) % 1;
    drops.setXYZ(
      i,
      -20 + Math.sin(i * 7) * 0.08,
      3.95 - phase * phase * 2.6,
      Math.cos(i * 9) * 0.1,
    );
  }
  drops.needsUpdate = true;
  v.rotors.forEach((r, i) => {
    r.target = (s.turns[i] * Math.PI) / 2;
    let delta = ((r.target - r.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const op = v.operation?.index === i ? v.operation : null;
    if (op) {
      r.angle = op.startAngle + (op.turn * Math.PI) / 2;
      r.moving = op.turn > 0 && !op.committed;
    } else if (initial || Math.abs(delta) < 0.006) {
      r.angle = r.target;
      r.moving = false;
    } else {
      r.angle += Math.sign(delta) * Math.min(Math.abs(delta), dt * 1.8);
      r.moving = true;
    }
    r.pivot.rotation.y = -r.angle;
    r.source.activity =
      !game.paused && (op ? causewayWheelMoving(op) : r.moving) ? 1 : 0;
    syncCausewayHandle(v.controls[i], op, dt, initial);
  });
  const connected = vaultLinks(s.turns).map((p) => p.join("/"));
  for (const edge of v.edges) {
    const ready =
      edge.end === "entry"
        ? vaultPorts(s.turns, 0).includes(0)
        : edge.end === "exit"
          ? vaultPorts(s.turns, 4).includes(2)
          : connected.includes(edge.indices.join("/"));
    const target =
      ready && !edge.indices.some((i) => v.rotors[i].moving) ? 1 : 0;
    edge.amount = initial
      ? target
      : edge.amount +
        Math.max(-dt * 1.7, Math.min(dt * 1.7, target - edge.amount));
    edge.open = edge.amount > 0.995;
    for (const leaf of edge.halves)
      leaf.rotation.x = -(1 - edge.amount) * Math.PI * 0.47;
  }
  for (const f of v.fires) f.fire.visible = f.always || s.lit.includes(f.id);
  const target = s.lit.length === 3 ? 1 : 0;
  v.open = initial ? target : Math.min(target, v.open + dt * 0.7);
  v.gateSource.activity =
    Math.abs(target - v.open) > 0.001 && !game.paused ? 1 : 0;
  v.gate.position.y = 1.92 - v.open * 4.2;
  v.gateObstacle.h = v.open > 0.98 ? 0 : 5.7;
  v.record.visible = !s.recovered;
  if (!initial && insideFireVault(game) && !s.visited) {
    s.visited = true;
    game.save();
    game.cb.toast?.(
      "Optional tomb · The Rainkeeper’s causeway. Read the tablet beside the entrance fire.",
      6500,
    );
  }
}
export function fireVaultControl(game) {
  const v = game.fireVault;
  if (!v || !game.player || game.swimming || game.diving || !game.grounded)
    return null;
  let closest = null,
    distance = 1.35;
  for (const c of v.controls) {
    if (
      (c.kind === "light" && v.saved.lit.includes(c.index)) ||
      (c.kind === "record" && v.saved.recovered)
    )
      continue;
    const d = game.player.position.distanceTo(c.position);
    if (d < distance) {
      closest = c;
      distance = d;
    }
  }
  return closest;
}
export function fireVaultHint(game) {
  if (game.fireVault?.operation)
    return { key: "E", label: "Turning the crossing · move to let go" };
  const c = fireVaultControl(game);
  if (!c) return null;
  const label =
    c.kind === "turn"
      ? `Turn crossing ${c.index + 1}`
      : c.kind === "light"
        ? "Pass the flame to the sanctuary lamp"
        : c.kind === "read"
          ? "Read the rainkeeper’s crossing tablet"
          : "Recover the rainkeeper’s record";
  return { key: "E", label };
}
export function fireVaultInteract(game) {
  const c = fireVaultControl(game),
    v = game.fireVault;
  if (!c || game.paused) return false;
  if (v.operation) return true;
  if (c.kind === "read") {
    game.cb.fireVault?.(false);
    return true;
  }
  if (c.kind === "turn") {
    if (v.rotors.some((r) => r.moving)) {
      game.cb.toast?.("Let the stone crossings settle.");
      return true;
    }
    beginCausewayWheel(game, c);
    return true;
  }
  if (c.kind === "light") {
    if (!game.progress.torch || torchHandsBusy(game)) {
      game.cb.toast?.(
        "Carry a flame here from the entrance or a burning sanctuary lamp.",
        4500,
      );
      return true;
    }
    v.saved.lit.push(c.index);
    game.audio.tone("field");
    game.save();
    game.cb.toast?.(
      v.saved.lit.length === 3
        ? "Three flames answer. The archive grille is opening on the far bank."
        : `Sanctuary fires · ${v.saved.lit.length} / 3. This lamp can relight your torch.`,
      5000,
    );
    return true;
  }
  if (v.open < 0.98) {
    game.cb.toast?.(
      "The archive remains sealed. Light all three sanctuary lamps.",
    );
    return true;
  }
  v.saved.recovered = true;
  v.record.visible = false;
  game.audio.tone("treasure");
  game.save();
  game.cb.fireVault?.(true);
  return true;
}
export function fireVaultObjective(game) {
  if (!insideFireVault(game)) return null;
  const v = game.fireVault,
    s = v.saved;
  const local = s.recovered
    ? [-8, -32]
    : s.lit.length === 3
      ? [0, 31.3]
      : VAULT_CELLS[VAULT_FIRES.find((i) => !s.lit.includes(i))];
  return {
    text: s.recovered
      ? "Record recovered · Return to the jungle"
      : s.lit.length === 3
        ? "Enter the archive on the far bank"
        : "Turn the crossings and carry fire to three sanctuary lamps",
    target: { x: (v.x + local[0]) / 7, z: (v.z + local[1]) / 7 },
    lit: s.lit.length,
    recovered: s.recovered,
  };
}
