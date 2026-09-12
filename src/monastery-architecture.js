import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { monasteryRoofGeometry } from "./monastery-roof.js";
import { buildBannerLine } from "./monastery-cloth.js";
import { masonryFoundation } from "./masonry-foundations.js";

export function monasteryPlan(room) {
  const i = room.index % 9;
  const posts = [-5.5, 5.5].flatMap((x) =>
    [-21, -15].map((z) => ({ x, z, width: 1.65, top: 10.8 })),
  );
  for (const side of [-1, 1])
    for (const x of [7.7, 19])
      for (const z of [-22, -17])
        posts.push({ x: side * x, z, width: 1.5, top: 6.35 });
  const galleries = [
    [-1, 1],
    [1],
    [-1],
    [-1, 1],
    [1],
    [-1, 1],
    [-1],
    [1],
    [-1, 1],
  ][i];
  for (const side of galleries)
    for (const z of [-5, 7, 18])
      posts.push({ x: side * 19, z, width: 1.45, top: 5.7 });
  return {
    posts,
    galleries,
    upper: i !== 4,
    wingDamage: [0, 1, 0, 2, 2, 0, 1, 2, 0][i],
    upperRise: [2.7, 2.4, 3, 2.7, 0, 2.4, 3, 2.7, 3.5][i],
  };
}

function colored(geometry, tint = 1) {
  const p = geometry.attributes.position,
    values = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const shade =
      tint *
      (0.94 +
        0.06 *
          Math.sin(p.getX(i) * 0.83 + p.getY(i) * 0.29 + p.getZ(i) * 0.53));
    values[i * 3] = shade;
    values[i * 3 + 1] = shade;
    values[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

export function timberGeometry(w, h, d, seed = 1) {
  const g = stoneBlockGeometry(w, h, d, seed),
    p = g.attributes.position,
    uv = g.attributes.uv,
    axis = w > h && w > d ? "X" : d > h ? "Z" : "Y";
  for (let i = 0; i < p.count; i++) {
    const along = p[`get${axis}`](i),
      across =
        axis === "X"
          ? p.getY(i) + p.getZ(i)
          : axis === "Z"
            ? p.getX(i) + p.getY(i)
            : p.getX(i) + p.getZ(i);
    uv.setXY(i, across * 0.5, along * 0.5);
  }
  return g;
}

export function bellGeometry() {
  const profile = [
    [0.12, 0.35],
    [0.35, 0.3],
    [0.48, 0.05],
    [0.55, -0.5],
    [0.78, -1.1],
    [1.07, -1.48],
    [1.16, -1.54],
    [1.13, -1.7],
    [0.98, -1.7],
    [0.9, -1.48],
    [0.65, -1.1],
    [0.44, -0.45],
    [0.32, 0.04],
    [0.12, 0.13],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 40);
}

export function buildMonasteryArchitecture(game) {
  game.monasteryPatches = [];
  game.monasteryWindSources = {};
  game.monasteryMaterials = null;
  game.monasteryTime = null;
  if (game.level.biome !== "snow") return false;
  game.monasteryTime = { value: 0 };
  const stone = pbrMaterial("temple", 0x838b8e),
    wood = pbrMaterial("monastery-wood", 0x896954),
    plaster = pbrMaterial("monastery-plaster", 0xd9d8cc),
    roof = pbrMaterial("monastery-roof", 0x6b747c),
    snow = pbrMaterial("snow", 0xd9e3ec);
  const red = wood.clone();
  red.color.set(0x835144);
  const shadow = new THREE.MeshStandardMaterial({
    name: "Recessed timber windows",
    color: 0x171b20,
    roughness: 1,
  });
  const bronze = new THREE.MeshStandardMaterial({
    name: "Monastery bell bronze",
    color: 0xc1a779,
    metalness: 0.76,
    roughness: 0.4,
  });
  game.monasteryMaterials = { stone, wood, plaster, roof, snow, bronze };
  for (const m of [stone, wood, plaster, roof, snow, red])
    m.vertexColors = true;
  wood.normalScale.set(0.38, 0.38);
  red.normalScale.set(0.38, 0.38);
  plaster.normalScale.set(0.24, 0.24);
  roof.normalScale.set(0.55, 0.55);
  snow.normalScale.set(0.3, 0.3);
  stone.name = "Monastery stone footings";
  wood.name = "Weathered monastery timber";
  plaster.name = "Monastery whitewash";
  roof.name = "Monastery slate roof";
  snow.name = "Drifted roof snow";
  red.name = "Oxide painted timber";
  let serial = game.level.seed;
  for (const room of game.map.rooms) {
    const x = room.x * 7,
      z = room.z * 7,
      base = game.groundHeight(x, z),
      plan = monasteryPlan(room),
      root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.set(x, base, z);
    detail.position.copy(root.position);
    root.name = `Monastery court ${room.index}`;
    game.world.add(root, detail);
    const ground = (px, pz) => game.groundHeight(x + px, z + pz) - base;
    const foundations = [],
      roofs = [],
      bells = [];
    const add = (
      g,
      mat,
      px,
      py,
      pz,
      angle = 0,
      parent = root,
      capture = false,
      tint = 1,
    ) => {
      if (mat.vertexColors && !g.attributes.color) colored(g, tint);
      const m = new THREE.Mesh(g, mat);
      m.position.set(px, py, pz);
      m.rotation.y = angle;
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      if (capture) game.cameraSurfaces?.capture(m);
      return m;
    };
    const block = (
      w,
      h,
      d,
      mat,
      px,
      py,
      pz,
      angle = 0,
      capture = false,
      parent = root,
    ) =>
      add(
        mat === wood || mat === red
          ? timberGeometry(w, h, d, ++serial)
          : stoneBlockGeometry(w, h, d, ++serial),
        mat,
        px,
        py,
        pz,
        angle,
        parent,
        capture,
      );
    const cameraBox = (w, h, d, px, py, pz, angle = 0) => {
      const g = new THREE.BoxGeometry(w, h, d),
        m = new THREE.Mesh(g, stone);
      m.position.set(px, py, pz);
      m.rotation.y = angle;
      root.add(m);
      game.cameraSurfaces?.capture(m);
      root.remove(m);
      g.dispose();
    };
    const roofAt = (width, depth, rise, px, py, pz, angle = 0, damage = 0) => {
      const options = { width, depth, rise, damage, seed: room.index };
      add(monasteryRoofGeometry(options), roof, px, py, pz, angle, root, true);
      add(
        monasteryRoofGeometry({ ...options, snow: true }),
        snow,
        px,
        py,
        pz,
        angle,
      );
      roofs.push({ options, position: [px, py, pz], angle });
      for (const side of [-1, 1])
        block(
          width,
          0.26,
          0.24,
          wood,
          px + (Math.sin(angle) * side * depth) / 2,
          py + 0.08,
          pz + (Math.cos(angle) * side * depth) / 2,
          angle,
        );
    };
    for (const post of plan.posts) {
      const floor = ground(post.x, post.z),
        foot = post.width + 0.22,
        h = post.top - floor,
        // Seat the timber inside the 1.5 m stone base, allowing for chipped
        // block faces. Keep its upper end at the existing beam joint.
        timberBottom = floor + 1.46,
        timberTop = post.top - 0.15;
      const foundation = masonryFoundation(
        (px, pz) => game.groundHeight(px, pz),
        x + post.x,
        z + post.z,
        foot,
        foot,
        game.terrainProfile?.step,
      );
      if (foundation) {
        foundations.push({ ...foundation, x: post.x, z: post.z });
        // Recessed solid backing closes the small chipped course joints.
        add(
          new THREE.BoxGeometry(
            foot * 0.82,
            foundation.top - foundation.bottom,
            foot * 0.82,
          ),
          stone,
          post.x,
          (foundation.top + foundation.bottom) / 2 - base,
          post.z,
        );
        for (const [index, course] of foundation.courses.entries())
          add(
            stoneBlockGeometry(
              foundation.width,
              course.height,
              foundation.depth,
              game.level.seed +
                room.index * 101 +
                post.x * 13 +
                post.z * 17 +
                index,
            ),
            stone,
            post.x,
            course.y - base,
            post.z,
          );
      }
      game.obstacles.push({
        x: x + post.x,
        z: z + post.z,
        w: foot / 2,
        d: foot / 2,
        h,
        monastery: true,
      });
      const supportBottom = foundation
        ? foundation.bottom - base
        : floor - 0.08;
      cameraBox(
        foot,
        post.top - supportBottom,
        foot,
        post.x,
        (post.top + supportBottom) / 2,
        post.z,
      );
      block(foot, 0.35, foot, stone, post.x, floor + 0.12, post.z);
      for (let row = 0; row < 3; row++)
        block(
          post.width - 0.08,
          0.4,
          post.width - 0.08,
          stone,
          post.x,
          floor + 0.5 + row * 0.4,
          post.z,
        );
      block(
        post.width * 0.67,
        timberTop - timberBottom,
        post.width * 0.67,
        wood,
        post.x,
        (timberBottom + timberTop) / 2,
        post.z,
      );
      block(
        post.width * 1.15,
        0.32,
        post.width * 1.15,
        red,
        post.x,
        post.top - 0.12,
        post.z,
      );
      block(
        post.width * 0.8,
        0.18,
        post.width * 0.8,
        red,
        post.x,
        timberBottom + 0.3,
        post.z,
      );
      const brace = block(
        2.35,
        0.23,
        0.28,
        wood,
        post.x + (post.x > 0 ? -1 : 1) * 0.63,
        post.top - 0.82,
        post.z,
      );
      brace.rotation.z = ((post.x > 0 ? 1 : -1) * Math.PI) / 4;
    }
    // Central bell pavilion: crossbeams carry its roof and its hanging bronze bell.
    for (const pz of [-21, -15]) {
      block(13.3, 0.55, 0.7, wood, 0, 10.45, pz, 0, true);
      block(13.8, 0.24, 1.1, red, 0, 10.78, pz);
    }
    for (const px of [-5.5, 5.5])
      block(0.65, 0.6, 8, wood, px, 10.45, -18, 0, true);
    roofAt(17.4, 12.4, 3.6, 0, 11, -18);
    if (plan.upper) {
      block(6.8, 2.95, 4.7, plaster, 0, 15.22, -18, 0, true);
      for (const px of [-3.25, 3.25])
        for (const pz of [-20.3, -15.7])
          block(0.3, 3.3, 0.3, red, px, 15.35, pz);
      block(7.3, 0.38, 5.2, wood, 0, 16.85, -18, 0, true);
      roofAt(10.2, 8.2, plan.upperRise, 0, 17.05, -18);
      for (const px of [-1.8, 0, 1.8]) {
        block(1.05, 1.65, 0.12, shadow, px, 15.3, -15.57, 0, false, detail);
        for (let bar = 0; bar < 4; bar++)
          block(
            0.09,
            1.8,
            0.16,
            red,
            px - 0.45 + bar * 0.3,
            15.3,
            -15.48,
            0,
            false,
            detail,
          );
      }
      const top = 17.05 + plan.upperRise;
      add(
        new THREE.CylinderGeometry(0.06, 0.3, 0.95, 12),
        bronze,
        0,
        top + 0.55,
        -18,
      );
      add(new THREE.SphereGeometry(0.22, 12, 8), bronze, 0, top + 1.1, -18);
    }
    const bell = new THREE.Group();
    bell.position.set(0, 9.05, -18);
    bell.userData.animated = true;
    root.add(bell);
    add(bellGeometry(), bronze, 0, 0, 0, 0, bell);
    add(
      new THREE.TorusGeometry(0.24, 0.065, 6, 20),
      bronze,
      0,
      0.49,
      0,
      0,
      bell,
    );
    block(0.08, 1.5, 0.08, wood, 0, -0.7, 0, 0, false, bell);
    add(new THREE.SphereGeometry(0.16, 10, 7), bronze, 0, -1.53, 0, 0, bell);
    block(0.1, 0.85, 0.1, wood, 0, 9.92, -18);
    bells.push(bell);
    for (const side of [-1, 1]) {
      const px = side * 13.35,
        damage = side < 0 ? plan.wingDamage : room.index === 5 ? 1 : 0;
      block(12.75, 0.52, 6.35, wood, px, 6.32, -19.5, 0, true);
      block(11.6, 3.55, 5.4, plaster, px, 8.35, -19.5, 0, true);
      for (const zFace of [-22.25, -16.75]) {
        block(12.8, 0.35, 0.4, red, px, 9.96, zFace, 0, true);
        block(12.7, 0.22, 0.42, wood, px, 6.78, zFace);
        for (let window = 0; window < 4; window++) {
          const wx = px - 4.25 + window * 2.82;
          if (damage && window === 0 && zFace === -16.75) continue;
          block(
            1.62,
            1.95,
            0.12,
            shadow,
            wx,
            8.4,
            zFace + (zFace > -20 ? 0.08 : -0.08),
            0,
            false,
            detail,
          );
          for (let bar = 0; bar < 5; bar++)
            block(
              0.11,
              2.13,
              0.2,
              wood,
              wx - 0.78 + bar * 0.39,
              8.4,
              zFace + (zFace > -20 ? 0.18 : -0.18),
              0,
              false,
              detail,
            );
          for (const yy of [7.4, 8.45, 9.4])
            block(
              1.9,
              0.13,
              0.22,
              red,
              wx,
              yy,
              zFace + (zFace > -20 ? 0.2 : -0.2),
              0,
              false,
              detail,
            );
        }
        for (const dx of [-6.15, -2.05, 2.05, 6.15])
          block(0.28, 3.5, 0.32, red, px + dx, 8.25, zFace, 0, true);
      }
      roofAt(14.7, 8.3, 2.15, px, 10.15, -19.5, 0, damage);
    }
    for (const side of plan.galleries) {
      for (const [za, zb] of [
        [-17, -5],
        [-5, 7],
        [7, 18],
      ]) {
        const center = (za + zb) / 2,
          length = zb - za;
        block(0.5, 0.45, length + 0.8, wood, side * 19, 5.58, center, 0, true);
        roofAt(
          length + 1.6,
          5,
          1.2,
          side * 19,
          5.95,
          center,
          Math.PI / 2,
          room.index % 3 === 1 && za === 7 ? 1 : 0,
        );
      }
    }
    const flags = buildBannerLine(
      root,
      new THREE.Vector3(-19, 6.25, -17),
      new THREE.Vector3(19, 6.25, -17),
      game.monasteryTime,
      room.index,
    );
    game.monasteryWindSources[room.index] = {
      x: x - 12,
      y: base + 5.3,
      z: z - 17,
    };
    mergeArchitecture(root);
    mergeArchitecture(detail);
    const detailBounds = new THREE.Box3()
      .setFromObject(detail)
      .getBoundingSphere(new THREE.Sphere());
    game.monasteryPatches.push({
      root,
      detail,
      detailBounds,
      foundations,
      roofs,
      bells,
      flags,
      plan,
      center: new THREE.Vector3(x, base + 6, z),
    });
  }
  return true;
}

export function updateMonasteryArchitecture(game) {
  if (game.monasteryTime) game.monasteryTime.value = game.elapsed;
  for (const patch of game.monasteryPatches || []) {
    const distance = patch.center.distanceTo(game.player.position),
      range = game.store.data.settings.quality === "low" ? 55 : 85;
    patch.detail.visible = distance < range + (patch.detail.visible ? 6 : 0);
    patch.flags.mesh.visible = distance < 155;
    patch.flags.cord.visible = distance < 155;
    for (const bell of patch.bells) {
      bell.visible = distance < 140;
      bell.rotation.z =
        Math.sin(game.elapsed * 0.64 + patch.center.x * 0.2) * 0.018;
    }
  }
}
