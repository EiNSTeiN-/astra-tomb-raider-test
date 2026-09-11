import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import {
  SHUTTER_SITE,
  SHUTTER_STATIONS,
  SHUTTER_SPANS,
} from "./shutter-house-rules.js";

function inscription(text, width) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ead5a6";
  c.font = "600 38px Georgia";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, 64, 990);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 8),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
}
export function buildShutterStation(game, f, group) {
  if (f.shutterHeight === undefined) return false;
  const y = game.groundHeight(SHUTTER_SITE.x, SHUTTER_SITE.z) + f.shutterHeight;
  f.yOffset = y - game.groundHeight(f.x * 7, f.z * 7);
  group.position.y = y;
  game.box(1.25, 0.8, 0.65, game.darkMat, 0, 0.4, 0, group);
  game.box(1.4, 0.15, 0.8, game.goldMat, 0, 0.85, 0, group);
  const wheel = (f.core = new THREE.Group());
  wheel.position.set(0, 1.35, 0.12);
  wheel.userData.animated = true;
  group.add(wheel);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.065, 8, 24),
    game.goldMat,
  );
  wheel.add(rim);
  for (let i = 0; i < 6; i++) {
    const m = game.box(0.045, 0.96, 0.045, game.goldMat, 0, 0, 0, wheel);
    m.rotation.z = (i * Math.PI) / 3;
  }
  for (let i = 0; i < 3; i++)
    game.box(0.12, 0.12, 0.1, game.goldMat, (i - 1) * 0.24, 0.68, 0.4, group);
  const label = inscription(SHUTTER_STATIONS[f.step].label, 2.1);
  label.position.set(0, 2.05, 0.15);
  group.add(label);
  return true;
}
export function buildShutterArt(game, h) {
  const { root } = h,
    wood = game.monasteryMaterials?.wood || game.stoneMat,
    stone = game.monasteryMaterials?.stone || game.stoneMat,
    snow = game.monasteryMaterials?.snow || game.stoneMat,
    bronze = game.goldMat;
  const cloth = new THREE.MeshStandardMaterial({
    color: 0xb58f52,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  let serial = 84000;
  function add(geometry, mat, x, y, z, parent = root, camera = true) {
    if (mat.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Array(geometry.attributes.position.count * 3).fill(0.94),
          3,
        ),
      );
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (camera) game.cameraSurfaces?.capture(mesh);
    return mesh;
  }
  const block = (
    w,
    ht,
    d,
    x,
    y,
    z,
    mat = stone,
    parent = root,
    camera = true,
  ) =>
    add(
      mat === wood
        ? timberGeometry(w, ht, d, ++serial)
        : stoneBlockGeometry(w, ht, d, ++serial),
      mat,
      x,
      y,
      z,
      parent,
      camera,
    );
  const solid = (x, z, w, d, bottom, top) => {
    const s = {
      x: h.x + x,
      z: h.z + z,
      w: w / 2,
      d: d / 2,
      bottom: h.y + bottom,
      top: h.y + top,
    };
    h.solids.push(s);
    return s;
  };
  function deck(x, z, w, d, y, mat = wood) {
    block(w, 0.24, d, x, y - 0.12, z, mat);
    const surface = {
      x: h.x + x,
      z: h.z + z,
      w: w / 2,
      d: d / 2,
      y: h.y + y,
      thickness: 0.24,
    };
    h.decks.push(surface);
    return surface;
  }
  function pier(x, z, top) {
    const bottom = game.groundHeight(h.x + x, h.z + z) - h.y - 0.16;
    block(0.6, top - bottom, 0.6, x, (top + bottom) / 2, z, stone);
    solid(x, z, 0.6, 0.6, bottom, top);
    block(0.8, 0.14, 0.8, x, top - 0.07, z, snow);
  }
  function landing(x, z, y) {
    deck(x, z, 4.6, 4.6, y, stone);
    for (const dx of [-1.9, 1.9])
      for (const dz of [-1.9, 1.9]) pier(x + dx, z + dz, y - 0.24);
    // The outer windbreak leaves the north/south stair approaches open.
    const side = Math.sign(x);
    if (x > 0 && z === -20) {
      for (const dz of [-1.5, 1.5]) {
        block(0.25, 2.5, 0.6, x + side * 1.95, y + 1.25, z + dz, wood);
        solid(x + side * 1.95, z + dz, 0.25, 0.6, y, y + 2.5);
      }
      block(0.25, 0.25, 3.6, x + side * 1.95, y + 2.375, z, wood);
      solid(x + side * 1.95, z, 0.25, 3.6, y + 2.25, y + 2.5);
    } else {
      block(0.25, 2.5, 3.6, x + side * 1.95, y + 1.25, z, wood);
      solid(x + side * 1.95, z, 0.25, 3.6, y, y + 2.5);
    }
    block(2.3, 0.18, 4.1, x + side * 1.05, y + 2.65, z, snow);
    const roof = block(2.5, 0.24, 4.3, x + side * 1.05, y + 2.5, z, wood);
    roof.rotation.z = side * 0.12;
  }
  function stairs(x, start, end, bottom, top, width = 2.6) {
    const n = Math.ceil((top - bottom) / 0.16),
      run = (start - end) / n;
    for (let i = 1; i <= n; i++) {
      const y = bottom + ((top - bottom) * i) / n,
        z = start - (i - 0.5) * run;
      deck(x, z, width, Math.abs(run) + 0.014, y);
      block(
        width,
        0.035,
        0.07,
        x,
        y + 0.018,
        z + (Math.sign(run) * Math.abs(run)) / 2,
        bronze,
        root,
        false,
      );
    }
    for (const side of [-1, 1]) {
      const railEnd = x === 18 && side === -1 ? 0.88 : 1;
      const a = new THREE.Vector3(
          x + side * (width / 2 + 0.08),
          bottom + 1,
          start,
        ),
        b = new THREE.Vector3(
          a.x,
          bottom + (top - bottom) * railEnd + 1,
          start + (end - start) * railEnd,
        ),
        delta = b.clone().sub(a);
      const m = block(
        0.1,
        delta.length(),
        0.1,
        ...a.clone().add(b).multiplyScalar(0.5).toArray(),
        wood,
        root,
        false,
      );
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      game.cameraSurfaces?.capture(m);
      for (let i = 0; i <= n * railEnd; i += 4) {
        const t = i / n,
          z = start + (end - start) * t,
          y = bottom + (top - bottom) * t;
        block(0.1, 1.1, 0.1, a.x, y + 0.55, z, wood);
        solid(a.x, z, 0.12, Math.abs(run) * 4 + 0.1, y + 0.88, y + 1.12);
      }
    }
  }
  stairs(-12, 14, 6, 0.05, 3.6);
  landing(-12, 4, 3.6);
  for (const [i, s] of SHUTTER_SPANS.entries()) {
    const halfGap = 1.2;
    for (const [a, b] of [
      [-10, s.gap - halfGap],
      [s.gap + halfGap, 10],
    ]) {
      // Individual cross-laid planks and longitudinal beams expose each real gap.
      const n = Math.ceil((b - a) / 0.5),
        dx = (b - a) / n;
      for (let j = 0; j < n; j++)
        deck(a + (j + 0.5) * dx, s.z, dx + 0.008, 2.5, s.height);
      for (const side of [-1, 1])
        block(
          b - a,
          0.28,
          0.2,
          (a + b) / 2,
          s.height - 0.32,
          s.z + side * 1.05,
          wood,
        );
      for (const x of [a + 0.45, b - 0.45]) pier(x, s.z, s.height - 0.5);
      block(
        0.09,
        0.035,
        2.4,
        a + 0.06,
        s.height + 0.022,
        s.z,
        bronze,
        root,
        false,
      );
      block(
        0.09,
        0.035,
        2.4,
        b - 0.06,
        s.height + 0.022,
        s.z,
        bronze,
        root,
        false,
      );
    }
    const target = SHUTTER_STATIONS[i];
    landing(target.x, target.z, target.height);
    // The wind inlet has timber louvers, a braced frame and a visible linkage.
    const faceZ = s.z - s.direction * 3.4,
      frame = new THREE.Group();
    frame.position.set(0, s.height, faceZ);
    frame.userData.animated = true;
    root.add(frame);
    const slats = [];
    for (const x of [-6.3, 6.3]) {
      pier(x, faceZ, s.height + 3.9);
      block(0.18, 0.2, 0.9, x, s.height + 0.3, faceZ, bronze);
    }
    block(13.4, 0.34, 0.65, 0, s.height + 3.8, faceZ, wood);
    block(13.7, 0.16, 0.95, 0, s.height + 4.03, faceZ, snow);
    for (let j = 0; j < 8; j++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.38 + j * 0.43, 0);
      pivot.userData.animated = true;
      frame.add(pivot);
      block(12, 0.43, 0.13, 0, 0, 0, wood, pivot);
      for (const x of [-5.6, 5.6])
        block(0.08, 0.45, 0.17, x, 0, 0, bronze, pivot, false);
      mergeArchitecture(pivot);
      slats.push(pivot);
    }
    h.louvers.push(slats);
    const crank = new THREE.Vector3(
        target.x,
        target.height + 1.35,
        target.z + 0.12,
      ),
      drive = new THREE.Vector3(
        target.x < 0 ? -6.25 : 6.25,
        s.height + 1.6,
        faceZ,
      );
    const cable = add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          crank,
          new THREE.Vector3(crank.x, s.height + 0.3, faceZ),
          drive,
        ]),
        20,
        0.025,
        6,
        false,
      ),
      bronze,
      0,
      0,
      0,
      root,
      false,
    );
    cable.name = "Shutter drive cable";
    h.sources.push({
      id: `shutter-wind-${i}`,
      kind: "wind",
      x: h.x,
      y: h.y + s.height + 1.8,
      z: h.z + faceZ + s.direction * 0.6,
      gain: 0.09,
      near: 2,
      range: 29,
      activity: 1,
    });
    h.sources.push({
      id: `shutter-drive-${i}`,
      kind: "hoist",
      x: h.x + crank.x,
      y: h.y + crank.y,
      z: h.z + crank.z,
      gain: 0.06,
      near: 2,
      range: 21,
      activity: 0,
    });
    for (const x of [-8, 8]) {
      block(0.055, 1.9, 0.055, x, s.height + 0.95, s.z - 1.6, bronze);
      const geometry = new THREE.PlaneGeometry(0.34, 1.5, 1, 9);
      geometry.translate(0, -0.75, 0);
      const ribbon = add(
        geometry,
        cloth,
        x,
        s.height + 1.8,
        s.z - 1.6,
        root,
        false,
      );
      ribbon.userData.animated = true;
      h.ribbons.push({
        mesh: ribbon,
        rest: geometry.attributes.position.array.slice(),
        index: i,
        side: x,
      });
    }
  }
  stairs(12, 2, -6, 3.6, 6.6);
  landing(12, -8, 6.6);
  stairs(-12, -10, -18, 6.6, 9.6);
  landing(-12, -20, 9.6);
  // A separate eastern service stair is reached when the chamber latch drops.
  stairs(18, 14, -20, 0.05, 9.6, 2.5);
  deck(18, -20, 2.5, 4.5, 9.6);
  for (const z of [-19, -10, 0, 10])
    pier(18, z, 0.05 + ((14 - z) / 34) * 9.55 - 0.3);
  const leaf = new THREE.Group();
  leaf.position.set(14, -0.12 + 9.6, -20);
  leaf.userData.animated = true;
  root.add(leaf);
  block(4, 0.24, 2.5, 2, 0, 0, wood, leaf);
  h.returnLeaf = leaf;
  const returnDeck = {
    x: h.x + 16,
    z: h.z - 20,
    w: 2,
    d: 1.25,
    y: h.y + 9.6,
    thickness: 0.24,
    enabled: false,
  };
  h.decks.push(returnDeck);
  h.returnDeck = returnDeck;
  mergeArchitecture(leaf);
  const text = inscription("SHUTTER HOUSE · BRACE WITH B · JUMP THE BREAKS", 8);
  text.position.set(-5, 2, 14.5);
  root.add(text);
  block(8.5, 0.8, 0.2, -5, 2, 14.35, wood);
  for (const x of [-8.7, -1.3]) pier(x, 14.35, 1.6);
  mergeArchitecture(root);
}
