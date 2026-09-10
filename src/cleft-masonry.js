import * as THREE from "three";
import { random } from "./campaign.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  archStoneGeometry,
  solarPanelGeometry,
} from "./desert-architecture.js";
import { mergeArchitecture } from "./visuals.js";

// The survey face is the surviving front of a roofless building. Its rear
// galleries and buttresses occupy the quarry pad, leaving the climbing face
// and the southern approach open. All coordinates here are local to the cleft.
export function buildCleftMasonry(game, c, stone, dark) {
  const root = new THREE.Group();
  root.name = "Ruined survey house masonry";
  c.root.add(root);
  const rng = random(9137);
  let serial = 9400;
  const ground = (x, z) => game.groundHeight(c.x + x, c.z + z) - c.y;
  function add(geometry, material, x, y, z, angle = 0, tint = 1) {
    const count = geometry.attributes.position.count,
      colors = new Float32Array(count * 3),
      shade = (0.78 + rng() * 0.22) * tint;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade * 0.98;
      colors[i * 3 + 2] = shade * 0.94;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  function box(
    w,
    h,
    d,
    x,
    y,
    z,
    material = stone,
    angle = 0,
    tint = 1,
    backed = 0,
  ) {
    const geometry = stoneBlockGeometry(w, h, d, serial++);
    // Facing stones below the broken roof have a continuous core behind them.
    // Omit only whole triangles buried in that core; keep the exposed face,
    // bevels and side returns. Roof fragments retain their complete geometry.
    if (backed) {
      const p = geometry.attributes.position,
        keep = [];
      for (let i = 0; i < p.count; i += 3) {
        const buried = [0, 1, 2].every((j) =>
          backed > 0 ? p.getZ(i + j) < -0.12 : p.getZ(i + j) > 0.15,
        );
        if (!buried) keep.push(i, i + 1, i + 2);
      }
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const data = new Float32Array(keep.length * attribute.itemSize);
        for (let i = 0; i < keep.length; i++)
          for (let j = 0; j < attribute.itemSize; j++)
            data[i * attribute.itemSize + j] =
              attribute.array[keep[i] * attribute.itemSize + j];
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(data, attribute.itemSize),
        );
      }
    }
    return add(geometry, material, x, y, z, angle, tint);
  }
  function solid(w, h, d, x, y, z) {
    c.solids.push({
      x: c.x + x,
      z: c.z + z,
      w: w / 2,
      d: d / 2,
      bottom: c.y + y - h / 2,
      top: c.y + y + h / 2,
    });
    const geometry = new THREE.BoxGeometry(w, h, d),
      proxy = new THREE.Mesh(geometry, stone);
    proxy.position.set(x, y, z);
    root.add(proxy);
    game.cameraSurfaces?.capture(proxy, { small: true, thin: true });
    root.remove(proxy);
    geometry.dispose();
  }
  function pier(x, z, w, d, top, start = null) {
    const floor =
        Math.min(
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => ground(x + (sx * w) / 2, z + (sz * d) / 2)),
          ),
        ) - 0.25,
      bottom = start ?? floor,
      height = top - bottom,
      rows = Math.ceil(height / 0.79),
      step = height / rows;
    solid(w, height, d, x, bottom + height / 2, z);
    for (let row = 0; row < rows; row++) {
      const y = bottom + (row + 0.5) * step;
      if (row % 2)
        for (const side of [-1, 1])
          box(w / 2 - 0.025, step - 0.025, d, x + (side * w) / 4, y, z);
      else box(w, step - 0.025, d, x, y, z);
    }
    box(w + 0.18, 0.24, d + 0.18, x, top + 0.08, z, dark);
    solid(w + 0.18, 0.24, d + 0.18, x, top + 0.08, z);
  }
  function arch(x, spring, z, half, depth, angle = 0, broken = false) {
    for (const side of [-1, 1])
      for (let i = 0; i < 10; i++) {
        if (broken && i > (side < 0 ? 6 : 3)) continue;
        const mesh = add(
          archStoneGeometry(
            half,
            0.66,
            depth,
            side,
            i / 10 + 0.002,
            (i + 1) / 10 - 0.002,
          ),
          stone,
          x,
          spring,
          z,
          angle,
        );
        mesh.updateMatrix();
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox
            .clone()
            .applyMatrix4(mesh.matrix),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        solid(size.x, size.y, size.z, center.x, center.y, center.z);
      }
  }

  // Deep joints, staggered block lengths and missing upper courses break the
  // outline. Backing is divided by column to follow the surviving roofline.
  const tops = [
    22.8, 23.3, 22.8, 22.1, 21.3, 21.7, 22.2, 22.7, 21.2, 21.8, 22.6, 23.2,
  ];
  for (let col = 0; col < 12; col++) {
    const x = -13.75 + col * 2.5,
      top = tops[col];
    box(2.5, top + 0.3, 2, x, (top - 0.3) / 2, -1.3, dark);
    solid(2.5, top + 0.3, 2.8, x, (top - 0.3) / 2, -1.3);
  }
  for (const face of [1, -1])
    for (let row = 0; row < 32; row++) {
      const y = 0.36 + row * 0.73;
      let x = -15;
      for (let col = 0; x < 14.99; col++) {
        const width = Math.min(
            15 - x,
            col === 0 && row % 2 ? 1.1 : 1.8 + rng() * 1.1,
          ),
          center = x + width / 2,
          top = tops[Math.min(11, Math.floor((center + 15) / 2.5))],
          fracture =
            (x < -4.5 && x + width > -5.5 && y > 4.3 && y < 6.8) ||
            (x < 1.15 && x + width > 0.25 && y > 10.4 && y < 12.2) ||
            (x < -0.4 && x + width > -1.4 && y > 16.8);
        if (y + 0.36 <= top && (!fracture || face < 0))
          box(
            width - 0.032,
            0.7,
            face > 0 ? 0.48 : 0.38,
            center,
            y,
            face > 0 ? -0.21 - rng() * 0.035 : -2.43,
            stone,
            0,
            face > 0 ? 1 : 0.9,
            y < 20 ? face : 0,
          );
        x += width;
      }
    }

  // The side piers thicken toward their buried bases. The right buttress stays
  // behind the return rope, and neither side reaches the southern approach.
  for (const side of [-1, 1]) {
    // Each tier begins at the previous shoulder, rather than rebuilding a
    // complete pier inside every wider lower tier.
    pier(side * 15.7, -0.575, 3.8, 6.85, 3.2);
    pier(side * 15.55, -1.05, 3.5, 5.9, 7.4, 3.18);
    pier(side * 15.4, -1.375, 3.2, 5.25, 11.9, 7.38);
    pier(side * 15.2, -1.8, 2.7, 4.4, side < 0 ? 24.0 : 23.5, 11.88);
    // A side gallery is open at ground level beneath its springing stones.
    pier(side * 15.2, -9.1, 2.7, 2.7, side < 0 ? 18.0 : 19.5);
    arch(side * 15.2, 15.5, -5.3, 2.5, 2.35, Math.PI / 2, side > 0);
  }

  // Rear arcades leave a walkable court behind the survey face. Missing crowns
  // and unequal pier heights reveal the depth from the climb and distant sand.
  for (const [x, top] of [
    [-6, 18],
    [4.6, 19.5],
  ])
    pier(x, -9.1, 2.6, 2.7, top);
  arch(-10.6, 18, -9.1, 3.25, 2.4, 0, true);
  arch(-0.7, 18, -9.1, 4.0, 2.4);
  arch(9.9, 19.5, -9.1, 3.95, 2.4, 0, true);

  // Tall blind bays on the unused outer portions of the face provide relief
  // without projecting into the handhold routes or the summit balcony.
  for (const x of [-12.3, 11.5]) {
    const bottom = x < 0 ? 8.3 : 9.4,
      height = 5.0;
    box(2.5, height, 0.15, x, bottom + height / 2, 0.06, dark, 0, 0.76);
    add(
      solarPanelGeometry(1.8, 3.4, x < 0 ? 1 : 2),
      stone,
      x,
      bottom + 0.45,
      0.17,
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++)
        box(0.35, 0.7, 0.42, x + side * 1.42, bottom + 0.35 + i * 0.72, 0.04);
    // The thin frame is purely relief on the existing solid face.
    for (const side of [-1, 1])
      for (let i = 0; i < 8; i++)
        add(
          archStoneGeometry(
            1.24,
            0.28,
            0.4,
            side,
            i / 8 + 0.003,
            (i + 1) / 8 - 0.003,
          ),
          stone,
          x,
          bottom + height,
          0.04,
        );
    box(3.2, 0.24, 0.48, x, bottom - 0.15, 0.04);
    solid(3.2, height + 2.2, 0.48, x, bottom + (height + 1.66) / 2, 0.04);
  }

  // Broken parapet fragments and exposed cross-wall sockets suggest the floors
  // that once connected the face to the rear gallery. They remain behind it.
  for (const col of [0, 2, 7, 11]) {
    const x = -13.75 + col * 2.5,
      top = tops[col] + 0.1;
    box(2.3, 0.32, 2.5, x, top, -1.25, dark);
    box(1.45, 0.7, 1.9, x - 0.3, top + 0.48, -1.4);
    solid(2.3, 1.18, 2.5, x, top + 0.43, -1.25);
  }
  for (const y of [5.6, 11.6, 17.6])
    for (const x of [-11.5, -4, 3.5, 11]) {
      box(0.9, 0.7, 0.32, x, y, -2.4, dark, 0, 0.7);
      box(1.15, 0.18, 0.8, x, y - 0.43, -2.55);
    }
  mergeArchitecture(root);
  return root;
}
