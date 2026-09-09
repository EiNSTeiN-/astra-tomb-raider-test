import * as THREE from "three";
import { boxEntry } from "./camera-collision.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { quartzGeometry } from "./cavern-geometry.js";
import { cavernRock, mineralMaterial } from "./cavern-material.js";
import { mergeArchitecture } from "./visuals.js";
import {
  ECHO_STONES,
  ECHO_ORDER,
  echoCell,
  echoCellAt,
  echoWalls,
  echoEnvelope,
  inEchoGallery,
  normalizeEcho,
} from "./echo-gallery-rules.js";

function inscription(text, width) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#b5ded9";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 38px Georgia";
  c.fillText(text, 256, 64, 500);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
    }),
  );
}

export function buildEchoGallery(game) {
  game.echoGallery = null;
  if (!game.map.echoGallery) return;
  const y = game.groundHeight(21, 56),
    root = new THREE.Group(),
    fixed = new THREE.Group(),
    saved = normalizeEcho(game.progress.echoGallery);
  root.name = "The Listening Gallery";
  root.position.y = y;
  root.add(fixed);
  game.world.add(root);
  game.progress.echoGallery = saved;
  const h = (game.echoGallery = {
    root,
    y,
    saved,
    nodes: [],
    doors: [],
    controls: [],
    sources: [],
  });
  const rock = cavernRock(),
    bronze = game.goldMat,
    dark = game.darkMat;
  let serial = 19000;
  const add = (geometry, material, x, py, z, parent = fixed, camera = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, py, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (w, t, d, x, py, z, material = rock, parent = fixed) =>
    add(stoneBlockGeometry(w, t, d, serial++), material, x, py, z, parent);
  const obstacle = (x, z, w, d, height) => {
    const o = {
      x,
      z,
      w: w / 2 + 0.4,
      d: d / 2 + 0.4,
      h: height,
      echoGallery: true,
    };
    game.obstacles.push(o);
    return o;
  };
  // The chambers sit within the existing continuous cavern, under its wet vault.
  // Low paving is seated below the sampled floor; it never changes the support.
  for (let i = 0; i < 32; i++) {
    const p = echoCell(i);
    block(6.9, 0.24, 6.9, p.x, -0.14, p.z, dark);
    for (const side of [-1, 1]) {
      block(0.16, 0.08, 5.5, p.x + side * 2.65, -0.005, p.z, bronze);
      block(5.5, 0.08, 0.16, p.x, -0.005, p.z + side * 2.65, bronze);
    }
  }
  for (const wall of echoWalls()) {
    if (!wall.after) {
      for (let row = 0; row < 4; row++)
        block(wall.w, 1.7, wall.d, wall.x, 0.85 + row * 1.7, wall.z);
      block(wall.w + 0.16, 0.2, wall.d + 0.16, wall.x, 6.8, wall.z, dark);
      obstacle(wall.x, wall.z, wall.w, wall.d, 6.9);
    } else {
      const moving = new THREE.Group();
      moving.userData.animated = true;
      moving.userData.cameraDynamic = true;
      root.add(moving);
      block(wall.w, 6.8, wall.d, wall.x, 3.4, wall.z, dark, moving);
      const vertical = wall.w < wall.d;
      for (const offset of [-2.4, 0, 2.4])
        block(
          vertical ? 0.16 : 0.24,
          6.5,
          vertical ? 0.24 : 0.16,
          wall.x + (vertical ? 0 : offset),
          3.4,
          wall.z + (vertical ? offset : 0),
          bronze,
          moving,
        );
      const sign = inscription(`${wall.after} · MEMORY RELEASE`, 3.5);
      sign.position.set(
        wall.x + (vertical ? 0.4 : 0),
        2.5,
        wall.z + (vertical ? 0 : 0.4),
      );
      sign.rotation.y = vertical ? Math.PI / 2 : 0;
      moving.add(sign);
      const source = {
        id: `echo-door-${wall.after}`,
        kind: "machine",
        x: wall.x,
        y: y + 3.4,
        z: wall.z,
        near: 1.5,
        range: 15,
        gain: 0.06,
        activity: 0,
      };
      h.sources.push(source);
      h.doors.push({
        ...wall,
        root: moving,
        source,
        opening: saved.fragments >= wall.after ? 7.2 : 0,
      });
    }
  }
  // Bronze-lined entrance, with a tablet on its southern side, clear of the aisle.
  for (const z of [62.7, 70.3]) {
    block(1.2, 7.8, 1.2, 35, 3.9, z);
    block(1.55, 0.3, 1.55, 35, 7.65, z, bronze);
  }
  block(1.5, 0.8, 8.8, 35, 8, 66.5);
  const title = inscription("THE LISTENING GALLERY", 6.4);
  title.position.set(35.77, 7.9, 66.5);
  title.rotation.y = Math.PI / 2;
  fixed.add(title);
  block(1.1, 1.25, 0.7, 39.5, 0.58, 71.4, dark);
  obstacle(39.5, 71.4, 1.1, 0.7, 1.25);
  const tablet = inscription("II → I → III", 1.6);
  tablet.position.set(39.5, 1.2, 70.95);
  tablet.rotation.y = Math.PI;
  fixed.add(tablet);
  const beacon = add(
    new THREE.OctahedronGeometry(0.17),
    game.glowMat,
    39.5,
    2.2,
    71.4,
  );
  h.controls.push({
    kind: "tablet",
    position: new THREE.Vector3(39.5, y, 69.7),
    beacon,
  });
  const entranceLight = new THREE.PointLight(0xd6b989, 8, 14, 2);
  entranceLight.position.set(39.5, 2.3, 70.5);
  root.add(entranceLight);
  for (const [index, stone] of ECHO_STONES.entries()) {
    const p = echoCell(stone.cell),
      x = p.x - 1.6,
      z = p.z - 1.45,
      color = new THREE.Color(
        [0x86bbcc, 0xb79ddd, 0x8598a0, 0x8cd0b9, 0x9b96a6][index],
      ),
      restoration = { value: 0.6 },
      material = mineralMaterial(color, restoration),
      markMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        metalness: 0.15,
        roughness: 0.26,
      });
    block(1.6, 0.3, 1.6, x, 0.12, z, dark);
    add(new THREE.CylinderGeometry(0.45, 0.72, 0.9, 12), rock, x, 0.7, z);
    add(
      new THREE.TorusGeometry(0.5, 0.055, 8, 24),
      bronze,
      x,
      1.12,
      z,
    ).rotation.x = Math.PI / 2;
    const crystal = add(
      quartzGeometry(0.44, 1.65, index + 0.17),
      material,
      x,
      1.13,
      z,
    );
    crystal.userData.animated = true;
    obstacle(x, z, 1.2, 1.2, 2.8);
    const plaque = inscription(
      `${"I".repeat(stone.count)} · ${stone.count} PULSES`,
      2.25,
    );
    plaque.position.set(x, 1.15, z + 0.79);
    fixed.add(plaque);
    // Individual inset marks are readable without waiting for a flash or tone.
    const marks = [];
    for (let n = 0; n < stone.count; n++)
      marks.push(
        add(
          new THREE.SphereGeometry(0.055, 8, 6),
          markMaterial,
          x + (n - (stone.count - 1) / 2) * 0.22,
          0.5,
          z + 0.72,
          fixed,
          false,
        ),
      );
    const source = {
      id: `echo-stone-${index}`,
      kind: `echo${stone.count}`,
      x,
      // Project the audible face past the mount's solid collision envelope.
      // The crystal's own pedestal must not trigger the obstruction filter.
      y: y + 2.2,
      z: z + 1.15,
      near: 1.5,
      range: 24,
      gain: 0.4,
      activity: 1,
      phaseSync: true,
    };
    h.sources.push(source);
    const light = new THREE.PointLight(color, 0, 9, 2);
    light.position.set(x, 2, z + 0.65);
    root.add(light);
    const control = {
      kind: "stone",
      index,
      position: new THREE.Vector3(x, y, p.z + 0.5),
    };
    h.controls.push(control);
    h.nodes.push({
      index,
      stone,
      crystal,
      marks,
      material,
      markMaterial,
      restoration,
      source,
      light,
      control,
    });
  }
  mergeArchitecture(fixed);
  updateEchoGallery(game, 0, true);
}

export function echoBlocked(game, x, z, y, clearance = 1.8) {
  return (game.echoGallery?.doors || []).some(
    (d) =>
      Math.abs(x - d.x) < d.w / 2 + 0.4 &&
      Math.abs(z - d.z) < d.d / 2 + 0.4 &&
      y < game.echoGallery.y + d.opening + 6.8 &&
      y + clearance > game.echoGallery.y + d.opening,
  );
}
export function echoOccludes(game, from, to) {
  return (game.echoGallery?.doors || []).some(
    (d) =>
      boxEntry(
        from,
        to,
        {
          min: {
            x: d.x - d.w / 2,
            y: game.echoGallery.y + d.opening,
            z: d.z - d.d / 2,
          },
          max: {
            x: d.x + d.w / 2,
            y: game.echoGallery.y + d.opening + 6.8,
            z: d.z + d.d / 2,
          },
        },
        0,
        true,
      ) !== null,
  );
}
export function updateEchoGallery(game, dt, initial = false) {
  const h = game.echoGallery;
  if (!h) return;
  if (game.paused) dt = 0;
  const time =
    game.audio?.ctx?.state === "running"
      ? game.audio.ctx.currentTime
      : game.elapsed || 0;
  for (const node of h.nodes) {
    const collected = ECHO_ORDER.slice(0, h.saved.fragments).includes(
      node.index,
    );
    node.source.activity = collected ? 0 : 1;
    node.material.emissiveIntensity = collected
      ? 0.14
      : 0.35 + echoEnvelope(node.stone.count, time) * 1.8;
    node.markMaterial.emissiveIntensity = node.material.emissiveIntensity;
    node.restoration.value = collected
      ? 0.12
      : 0.6 + echoEnvelope(node.stone.count, time) * 0.4;
    node.light.intensity = collected
      ? 0
      : 0.8 + echoEnvelope(node.stone.count, time) * 2;
    node.light.visible =
      !!game.player &&
      node.control.position.distanceTo(game.player.position) < 16;
  }
  for (const d of h.doors) {
    const target = h.saved.fragments >= d.after ? 7.2 : 0;
    d.opening = initial
      ? target
      : Math.min(target, d.opening + Math.max(0, dt) * 2.4);
    d.root.position.y = d.opening;
    d.source.y = h.y + d.opening + 3.4;
    d.source.activity = !game.paused && d.opening < target ? 0.7 : 0;
  }
  if (initial || game.paused || !game.player) return;
  const p = game.player.position;
  if (!inEchoGallery(game.map, p.x, p.z)) return;
  let changed = false;
  if (!h.saved.visited) {
    h.saved.visited = true;
    changed = true;
    game.cb.toast?.(
      "Discovered · The Listening Gallery. Read the entrance tablet; follow two pulses first.",
      5500,
    );
  }
  const cell = echoCellAt(p.x, p.z);
  if (cell !== null && !h.saved.charted.includes(cell)) {
    h.saved.charted.push(cell);
    h.saved.charted.sort((a, b) => a - b);
    changed = true;
  }
  if (changed) game.save();
}
export function echoControl(game) {
  if (
    !game.echoGallery ||
    game.paused ||
    !game.grounded ||
    game.climb ||
    game.dodge ||
    game.swimming
  )
    return null;
  const p = game.player.position;
  return (
    game.echoGallery.controls.find(
      (c) =>
        p.distanceTo(c.position) < 1.8 &&
        (!game.lineOfSight || game.lineOfSight(p, c.position)),
    ) || null
  );
}
export function echoHint(game) {
  const c = echoControl(game);
  if (!c) return null;
  const h = game.echoGallery,
    n = c.kind === "stone" ? h.nodes[c.index] : null;
  return {
    key: "E",
    label: n
      ? ECHO_ORDER.slice(0, h.saved.fragments).includes(c.index)
        ? `${n.stone.name} · memory already recorded`
        : `${n.stone.count} pulses · listen to ${n.stone.name.toLowerCase()}`
      : h.saved.fragments === 3
        ? "Join the three memories at the entrance tablet"
        : "Read the listening gallery tablet",
  };
}
export function echoInteract(game) {
  const c = echoControl(game);
  if (!c) return false;
  const h = game.echoGallery,
    s = h.saved;
  s.visited = true;
  if (c.kind === "tablet") {
    if (s.fragments === 3 && !s.recovered) {
      s.recovered = true;
      game.audio.tone("collect");
    }
    game.save();
    game.cb.echoGuide?.();
    return true;
  }
  if (ECHO_ORDER[s.fragments] === c.index) {
    const fragment = s.fragments++;
    game.save();
    game.audio.tone("collect");
    game.cb.echoFragment?.(fragment);
  } else {
    const collected = ECHO_ORDER.slice(0, s.fragments).includes(c.index);
    game.cb.toast?.(
      collected
        ? "This memory is in your journal. Follow the next voice."
        : s.fragments === 3
          ? "All three memories are recorded. Return to the entrance tablet."
          : `This is a different echo. Seek ${ECHO_STONES[ECHO_ORDER[s.fragments]].count} pulses; the count is engraved below each stone.`,
      4500,
    );
  }
  return true;
}
export function echoObjective(game) {
  const p = game.player?.position,
    h = game.echoGallery;
  if (!h || !p || !inEchoGallery(game.map, p.x, p.z)) return null;
  return {
    step: h.saved.recovered ? 4 : h.saved.fragments,
    text: h.saved.recovered
      ? "Leave the listening gallery through the eastern doorway"
      : h.saved.fragments === 3
        ? "Join the three memories at the entrance tablet"
        : `Follow ${ECHO_STONES[ECHO_ORDER[h.saved.fragments]].count} pulses and record the voice`,
  };
}
