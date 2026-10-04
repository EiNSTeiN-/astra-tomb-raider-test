import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { timberGeometry } from "./monastery-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { mergeArchitecture } from "./visuals.js";
import { stationSolid } from "./field-station-solids.js";

export const BELL_PLATFORM_WIDTH = 7.6;
export const BELL_POST_X = 3.3;
export const BELL_GRIP_JOIN = 0.22;
export const BELL_ROPE_RADIUS = 0.158;
export const BELL_ROPE_Z = 0.9 + BELL_ROPE_RADIUS;
export const BELL_TABLET_Z = -2.35;

const wrapMatrix = new THREE.Matrix4(),
  wrapAxis = new THREE.Vector3(0, 1, 0),
  wrapRotation = new THREE.Quaternion(),
  wrapFirst = new THREE.Vector3(),
  wrapLast = new THREE.Vector3(),
  wrapDelta = new THREE.Vector3(),
  wrapScale = new THREE.Vector3(1, 1, 1);

function construction(game, root, seed) {
  const add = (geometry, material, x, y, z, capture = false, parent = root) => {
    const position = geometry.attributes.position;
    if (material.vertexColors && !geometry.attributes.color) {
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const shade =
          0.97 +
          0.03 *
            Math.sin(
              position.getX(i) * 0.83 + position.getY(i) * 0.29 + seed * 0.73,
            );
        colors.set([shade, shade, shade], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    if (material.map && geometry.type === "BoxGeometry") {
      const normal = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i++)
        uv.setXY(
          i,
          (Math.abs(normal.getX(i)) > 0.5
            ? position.getZ(i)
            : position.getX(i)) / 2,
          (Math.abs(normal.getY(i)) > 0.5
            ? position.getZ(i)
            : position.getY(i)) / 2,
        );
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (capture) game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  const block = (
    w,
    h,
    d,
    material,
    x,
    y,
    z,
    wood = false,
    capture = false,
    parent = root,
  ) =>
    add(
      wood
        ? timberGeometry(w, h, d, ++seed)
        : stoneBlockGeometry(w, h, d, ++seed, 0.02),
      material,
      x,
      y,
      z,
      capture,
      parent,
    );
  const beam = (a, b, w, d, material) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start),
      center = start.clone().add(end).multiplyScalar(0.5);
    const mesh = block(
      w,
      delta.length(),
      d,
      material,
      center.x,
      center.y,
      center.z,
      true,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    game.cameraSurfaces?.capture(mesh);
    return mesh;
  };
  return { add, block, beam };
}

// The fixed floor height and front mantle remain the same. The wider masonry
// carries the complete feet and gives the swinging outer bell room beside its post.
export function buildBellPlatform(game, feature, x, y, z, height) {
  const root = new THREE.Group();
  root.name = `Bell landing ${feature.stage + 1}`;
  root.position.set(x, y, z);
  game.world.add(root);
  const stone = game.monasteryMaterials?.stone || game.stoneMat,
    wood = game.monasteryMaterials?.wood || game.stoneMat,
    { add, block } = construction(
      game,
      root,
      game.level.seed + feature.stage * 137,
    ),
    bottom =
      Math.min(
        y,
        footprintMinimum(
          (px, pz) => game.groundHeight(px, pz),
          x,
          z,
          BELL_PLATFORM_WIDTH,
          6,
          game.terrainProfile?.step,
        ),
      ) -
      y -
      0.18;
  // A sealed core sits behind the courses and has an exact, flat support plane.
  add(
    new THREE.BoxGeometry(
      BELL_PLATFORM_WIDTH - 0.06,
      height - 0.18 - bottom,
      5.94,
    ),
    stone,
    0,
    (height - 0.18 + bottom) / 2,
    0,
    true,
  );
  const rows = Math.ceil((height - bottom - 0.2) / 0.46),
    rowHeight = (height - bottom - 0.2) / rows;
  for (let row = 0; row < rows; row++) {
    const py = bottom + (row + 0.5) * rowHeight;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const w = BELL_PLATFORM_WIDTH / 6;
        block(
          w - 0.012,
          rowHeight - 0.012,
          0.12,
          stone,
          -BELL_PLATFORM_WIDTH / 2 + (i + 0.5) * w,
          py,
          side * 2.935,
        );
      }
      for (let i = 0; i < 5; i++)
        block(
          0.12,
          rowHeight - 0.012,
          1.188,
          stone,
          side * 3.735,
          py,
          -2.4 + i * 1.2,
        );
    }
  }
  add(
    new THREE.BoxGeometry(BELL_PLATFORM_WIDTH, 0.2, 6),
    stone,
    0,
    height - 0.1,
    0,
    true,
  );
  // Narrow timber runners embed in the stone behind the existing bronze rungs.
  for (const px of [-0.54, 0.54])
    block(
      0.12,
      height - 0.27,
      0.12,
      wood,
      px,
      (height - 0.27) / 2 + 0.12,
      2.98,
      true,
    );
  game.obstacles.push({
    x,
    z,
    w: BELL_PLATFORM_WIDTH / 2,
    d: 3,
    h: height,
    climbable: true,
  });
  feature.bellLanding = {
    root,
    width: BELL_PLATFORM_WIDTH,
    depth: 6,
    height,
    bottom: bottom + y,
  };
  mergeArchitecture(root, 2);
  return feature.bellLanding;
}

export function buildBellFrame(game, site, materials) {
  const { wood, bronze, stone, snow } = materials,
    { add, block, beam } = construction(
      game,
      site.root,
      game.level.seed + site.stage * 211,
    ),
    feet = [],
    posts = [],
    braces = [];
  for (const sign of [-1, 1]) {
    const x = sign * BELL_POST_X,
      floor =
        site.stage === 0
          ? footprintMinimum(
              (px, pz) => game.groundHeight(px, pz),
              site.root.position.x + x,
              site.root.position.z - 1.25,
              0.72,
              0.72,
              game.terrainProfile?.step,
            ) -
            site.root.position.y -
            0.12
          : -0.02;
    const foot = block(
      0.72,
      0.28 - floor,
      0.72,
      stone,
      x,
      (floor + 0.28) / 2,
      -1.25,
    );
    feet.push(foot);
    block(0.53, 0.13, 0.53, stone, x, 0.31, -1.25);
    const post = block(0.32, 4.64, 0.4, wood, x, 2.57, -1.25, true, true);
    posts.push(post);
    stationSolid(
      game,
      site.furniture,
      site.root,
      [0.74, 4.92 - floor, 0.74],
      [x, (floor + 4.92) / 2, -1.25],
      { support: false },
    );
    braces.push(
      beam([x, 3.68, -1.25], [sign * 2.54, 4.64, -1.25], 0.16, 0.22, wood),
    );
    for (const py of [0.49, 4.7]) {
      block(0.37, 0.12, 0.45, bronze, x, py, -1.25);
      const peg = add(
        new THREE.CylinderGeometry(0.048, 0.048, 0.05, 8),
        bronze,
        x,
        py,
        -1.0,
      );
      peg.rotation.x = Math.PI / 2;
    }
  }
  block(7.24, 0.38, 0.56, wood, 0, 4.7, -1.25, true, true);
  block(7.4, 0.13, 0.74, wood, 0, 4.93, -1.25, true);
  block(7.32, 0.045, 0.7, snow, 0, 5.01, -1.25);
  return { feet, posts, braces };
}

export function buildBellFittings(game, site, x, materials) {
  const { wood, bronze, rope } = materials,
    { add, block } = construction(
      game,
      site.root,
      game.level.seed + site.stage * 71,
    );
  // Fixed bearing cheeks and a through-pin carry the existing suspension ring.
  for (const sign of [-1, 1])
    block(0.055, 0.36, 0.31, bronze, x + sign * 0.19, 4.54, -1.25);
  const pin = add(
    new THREE.CylinderGeometry(0.038, 0.038, 0.49, 10),
    bronze,
    x,
    4.37,
    -1.25,
  );
  pin.rotation.z = Math.PI / 2;
  block(0.14, 0.16, 2.22, wood, x, 4.49, -0.23, true);
  // The forward sheave turns on a real axle between cheeks below the timber.
  for (const sign of [-1, 1])
    block(0.055, 0.32, 0.33, bronze, x + sign * 0.105, 4.41, 0.9);
  const axle = add(
    new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10),
    bronze,
    x,
    4.29,
    0.9,
  );
  axle.rotation.z = Math.PI / 2;
  const profile = [
    [0.036, -0.055],
    [0.17, -0.055],
    [0.17, -0.027],
    [0.145, -0.017],
    [0.138, 0],
    [0.145, 0.017],
    [0.17, 0.027],
    [0.17, 0.055],
    [0.036, 0.055],
    [0.036, -0.055],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pulley = add(
    new THREE.LatheGeometry(profile, 28),
    bronze,
    x,
    4.29,
    0.9,
  );
  pulley.rotation.z = Math.PI / 2;
  const wrap = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1, 6),
    rope,
    12,
  );
  wrap.position.set(x, 4.29, 0.9);
  wrap.userData.animated = true;
  wrap.castShadow = wrap.receiveShadow = true;
  // Every tangent fits within this small conservative bound during ringing.
  wrap.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.25);
  site.root.add(wrap);
  return { pulley, wrap };
}

// Tangent from the moving clapper to the grooved sheave, then over its crown
// to a vertical front fall. The rope avoids the spindle throughout the swing.
export function positionBellWrap(bell, start) {
  const y = start.y - 4.29,
    z = start.z - 0.9,
    d = Math.hypot(y, z),
    r = BELL_ROPE_RADIUS,
    along = (r * r) / d,
    across = r * Math.sqrt(1 - (r * r) / (d * d)),
    ty = (along * y) / d - (across * z) / d,
    tz = (along * z) / d + (across * y) / d,
    angle = Math.atan2(ty, tz);
  if (Math.abs(angle - (bell.wrapAngle ?? Infinity)) > 1e-7) {
    for (let i = 0; i < bell.wrap.count; i++) {
      const a = (angle * i) / bell.wrap.count,
        b = (angle * (i + 1)) / bell.wrap.count,
        first = wrapFirst.set(0, r * Math.sin(a), r * Math.cos(a)),
        last = wrapLast.set(0, r * Math.sin(b), r * Math.cos(b)),
        delta = wrapDelta.copy(last).sub(first),
        length = delta.length();
      wrapRotation.setFromUnitVectors(wrapAxis, delta.normalize());
      wrapMatrix.compose(
        first.add(last).multiplyScalar(0.5),
        wrapRotation,
        wrapScale.set(1, length, 1),
      );
      bell.wrap.setMatrixAt(i, wrapMatrix);
    }
    bell.wrap.instanceMatrix.needsUpdate = true;
    bell.wrapAngle = angle;
  }
  return new THREE.Vector3(bell.hinge.position.x, 4.29 + ty, 0.9 + tz);
}

export function braidedRingGeometry(radius = 0.18, thickness = 0.04) {
  const strands = [];
  for (let strand = 0; strand < 3; strand++) {
    const points = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2,
        twist = t * 12 + (strand * Math.PI * 2) / 3,
        r = radius + Math.cos(twist) * thickness * 0.42;
      points.push(
        new THREE.Vector3(
          Math.sin(t) * r,
          Math.cos(t) * r,
          Math.sin(twist) * thickness * 0.42,
        ),
      );
    }
    strands.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, true),
        96,
        thickness * 0.54,
        5,
        true,
      ),
    );
  }
  const geometry = mergeGeometries(strands);
  strands.forEach((g) => g.dispose());
  return geometry;
}

export function buildBellGrip(game, site, x, materials, name) {
  const { wood, rope, bronze } = materials,
    grip = new THREE.Group();
  grip.position.set(x, 1.3, BELL_ROPE_Z);
  site.root.add(grip);
  const { add, block } = construction(
    game,
    grip,
    game.level.seed + site.stage * 31,
  );
  add(braidedRingGeometry(), rope, 0, 0, 0);
  const handle = add(
    new THREE.CylinderGeometry(0.027, 0.033, 0.3, 10),
    wood,
    0,
    0,
    0,
  );
  handle.rotation.z = Math.PI / 2;
  // Lash the running rope to the loop crown; its lower end meets this binding.
  for (let i = 0; i < 3; i++) {
    const tie = add(
      new THREE.TorusGeometry(0.029, 0.009, 5, 12),
      rope,
      0,
      0.18 + i * 0.023,
      0,
    );
    tie.rotation.x = Math.PI / 2;
  }
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6), rope, 0, -0.265, 0);
  block(0.76, 0.23, 0.05, wood, 0, -0.39, 0, true);
  for (const px of [-0.32, 0.32]) {
    const nail = add(
      new THREE.CylinderGeometry(0.018, 0.018, 0.025, 7),
      bronze,
      px,
      -0.39,
      0.032,
    );
    nail.rotation.x = Math.PI / 2;
  }
  name.position.set(0, -0.39, 0.029);
  grip.add(name);
  mergeArchitecture(grip, 2);
  return grip;
}

export function buildBellTablet(game, site, materials, inscription) {
  const { stone, bronze } = materials,
    { block } = construction(
      game,
      site.root,
      game.level.seed + site.stage * 23,
    ),
    head = new THREE.Group(),
    x = (site.stage % 3 === 2 ? -1 : 1) * 2.5;
  // Keep the lesson behind the frame, outside the inward-opening door sweep.
  head.position.set(x, 0.88, BELL_TABLET_Z);
  head.rotation.x = -0.22;
  site.root.add(head);
  block(0.57, 0.16, 0.54, stone, x, 0.06, BELL_TABLET_Z);
  block(0.34, 0.58, 0.3, stone, x, 0.36, BELL_TABLET_Z);
  block(1.28, 0.78, 0.22, stone, 0, 0, 0, false, true, head);
  for (const x of [-0.61, 0.61])
    block(0.055, 0.69, 0.028, bronze, x, 0, 0.117, false, false, head);
  inscription.position.set(0, 0, 0.113);
  head.add(inscription);
  mergeArchitecture(head, 2);
  stationSolid(
    game,
    site.furniture,
    site.root,
    [1.32, 1.32, 0.6],
    [x, 0.64, BELL_TABLET_Z],
    { support: false },
  );
  return head;
}
