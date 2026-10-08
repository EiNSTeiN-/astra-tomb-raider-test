import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture, pbrMaterial } from "./visuals.js";
import { windMetal, windSurface } from "./wind-art.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { buildSkyClimbingPier } from "./sky-climbing-piers.js";
import { buildJungleClimbingPier } from "./jungle-climbing-piers.js";
import { buildDesertClimbingPier } from "./desert-climbing-piers.js";
import {
  buildSnowClimbingPier,
  indexSnowPierGeometry,
} from "./snow-climbing-piers.js";

// Local materials retain the chapter's masonry treatment. The dimensions here
// describe the visible shell; the course plan remains the traversal authority.
export const CLIMBING_STYLES = {
  jungle: { row: 0.52, block: 1.03, timber: 0xaaa48b, bands: 3, inset: 0.14 },
  desert: { row: 0.68, block: 1.38, timber: 0xc2ae84, bands: 2, inset: 0.1 },
  snow: { row: 0.43, block: 0.93, timber: 0x806b5d, bands: 3, inset: 0.18 },
  water: { row: 0.59, block: 1.22, timber: 0x929b88, bands: 3, inset: 0.1 },
  volcano: {
    row: 0.75,
    block: 1.32,
    timber: 0x999b96,
    bands: 2,
    inset: 0.16,
    iron: true,
  },
  sky: { row: 0.62, block: 1.1, timber: 0xb8ad97, bands: 4, inset: 0.16 },
  crystal: {
    row: 0.82,
    block: 1.5,
    timber: 0xa49dad,
    bands: 2,
    inset: 0.12,
    iron: true,
  },
  eclipse: {
    row: 0.57,
    block: 1.23,
    timber: 0xac9b77,
    bands: 4,
    inset: 0.1,
    iron: true,
  },
};

export function climbingMaterials(game) {
  const style = CLIMBING_STYLES[game.level.biome],
    original =
      (game.level.biome === "jungle" && game.templeMaterial) ||
      (game.level.biome === "snow" && game.monasteryMaterials?.stone) ||
      (game.level.biome === "sky" && game.skyMasonry) ||
      (game.level.biome === "crystal" && game.cavernMeshes?.[0]?.material) ||
      (game.level.biome === "eclipse" && game.observatoryMaterials?.stone) ||
      game.stoneMat,
    stone = original.clone();
  stone.name = "Climbing pier masonry";
  stone.vertexColors = true;
  stone.onBeforeCompile = original.onBeforeCompile;
  stone.customProgramCacheKey = original.customProgramCacheKey;
  const timber = pbrMaterial(
    style.iron ? "forge-metal" : "monastery-wood",
    style.timber,
  );
  timber.name = style.iron ? "Hoist ironwork" : "Hoist timber";
  timber.vertexColors = true;
  timber.metalness = style.iron ? 0.7 : 0;
  timber.normalScale.set(0.3, 0.3);
  const metal = windMetal("worn");
  metal.name = "Hoist weathered bronze fittings";
  metal.vertexColors = true;
  metal.roughness = 0.63;
  const rope = new THREE.MeshStandardMaterial({
    name: "Hoist fibre",
    color: 0xa69574,
    roughness: 0.97,
    vertexColors: true,
  });
  const materials = { stone, timber, metal, rope };
  if (game.level.biome === "snow") {
    for (const [key, asset, color] of [
      ["plaster", "monastery-plaster", 0xd9d8cc],
      ["snow", "snow", 0xd9e3ec],
    ]) {
      const original = game.monasteryMaterials?.[key];
      materials[key] = original ? original.clone() : pbrMaterial(asset, color);
      materials[key].vertexColors = true;
      materials[key].name = `Climbing monastery ${key}`;
    }
  }
  return materials;
}

function shade(geometry, value = 1) {
  const count = geometry.attributes.position.count;
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(count * 3).fill(value),
      3,
    ),
  );
  return geometry;
}

// The flat top keeps a simple closed outline. Slightly tapered lower edges
// seat in the recessed bed without the extra bevel faces of a wall ashlar.
function flagGeometry(width, height, depth) {
  const g = new THREE.BoxGeometry(width, height, depth),
    p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) {
      p.setX(i, p.getX(i) * (1 - 0.02 / width));
      p.setZ(i, p.getZ(i) * (1 - 0.02 / depth));
    }
    uv.setXY(
      i,
      (Math.abs(n.getX(i)) > 0.7 ? p.getZ(i) : p.getX(i)) / 2,
      (Math.abs(n.getY(i)) > 0.7 ? p.getZ(i) : p.getY(i)) / 2,
    );
  }
  g.computeVertexNormals();
  return g;
}

// Wall ashlars have a closed core immediately behind their front bevels.
// Keep the exposed chipped face and discard surfaces buried in that core.
function facingGeometry(width, height, depth, seed) {
  const g = stoneBlockGeometry(width, height, depth, seed),
    normal = g.attributes.normal,
    attributes = Object.entries(g.attributes),
    values = attributes.map(() => []);
  for (let i = 0; i < normal.count; i += 3) {
    if (normal.getZ(i) <= 0.1) continue;
    for (let a = 0; a < attributes.length; a++) {
      const attribute = attributes[a][1];
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < attribute.itemSize; k++)
          values[a].push(attribute.array[(i + j) * attribute.itemSize + k]);
    }
  }
  for (let a = 0; a < attributes.length; a++)
    g.setAttribute(
      attributes[a][0],
      new THREE.Float32BufferAttribute(values[a], attributes[a][1].itemSize),
    );
  return g;
}

export function buildClimbingArt(game, plan, base, root, materials) {
  const style = CLIMBING_STYLES[game.level.biome],
    fixed = new THREE.Group(),
    detail = new THREE.Group();
  root.add(fixed, detail);
  let serial = game.level.seed + plan.stage * 113;
  const mesh = (geometry, material, x, y, z, parent = fixed, tint = 1) => {
    if (!geometry.attributes.color) shade(geometry, tint);
    if (material.userData.windMetal) windSurface(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const block = (
    w,
    h,
    d,
    x,
    y,
    z,
    material = materials.stone,
    parent = fixed,
    tint = 1,
    flat = false,
    facing = false,
  ) => {
    const seed = ++serial,
      g = flat
        ? flagGeometry(w, h, d)
        : facing
          ? facingGeometry(w, h, d, seed)
          : stoneBlockGeometry(w, h, d, seed);
    return mesh(g, material, x, y, z, parent, tint);
  };
  const span = (a, b, w, d, material = materials.timber, parent = fixed) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      center = av.clone().add(bv).multiplyScalar(0.5),
      beam = block(
        w,
        av.distanceTo(bv),
        d,
        center.x,
        center.y,
        center.z,
        material,
        parent,
      );
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bv.sub(av).normalize(),
    );
    game.cameraSurfaces?.capture(beam);
    return beam;
  };
  const local = (x, y, z) => {
    const p = plan.transform(x, z);
    return [p.x, base + y, p.z];
  };
  const boltGeometry = shade(
    new THREE.CylinderGeometry(0.058, 0.075, 0.045, 6).rotateX(Math.PI / 2),
  );
  const bolt = (x, y, z, angle = 0) => {
    const b = mesh(
      boltGeometry.clone(),
      materials.metal,
      x,
      y,
      z,
      detail,
      0.86,
    );
    b.rotation.y = angle;
  };
  const piers = [];
  for (const ledge of plan.ledges) {
    const top = base + ledge.h,
      width = ledge.w * 2,
      depth = ledge.d * 2,
      ground =
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          ledge.x,
          ledge.z,
          width,
          depth,
          game.terrainProfile?.step,
        ) - 0.18,
      height = top - ground;
    // One full pier proxy preserves the camera's solid envelope through joints.
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      materials.stone,
    );
    proxy.position.set(ledge.x, ground + height / 2, ledge.z);
    fixed.add(proxy);
    game.cameraSurfaces?.capture(proxy);
    fixed.remove(proxy);
    proxy.geometry.dispose();
    const capHeight = 0.18 + style.bands * 0.13,
      wallHeight = height - capHeight,
      rows = Math.min(10, Math.max(1, Math.ceil(wallHeight / style.row))),
      rowH = wallHeight / rows;
    const recessAt = (row) => (row > 1 && row < rows - 2 ? style.inset : 0.03);
    let regionalFacade;
    if (["sky", "jungle", "desert", "snow"].includes(game.level.biome)) {
      const build =
        game.level.biome === "sky"
          ? buildSkyClimbingPier
          : game.level.biome === "jungle"
            ? buildJungleClimbingPier
            : game.level.biome === "desert"
              ? buildDesertClimbingPier
              : buildSnowClimbingPier;
      regionalFacade = build({
        ledge,
        width,
        depth,
        ground,
        wallHeight,
        seed: game.level.seed + plan.stage * 113 + ledge.index * 997,
        materials,
        fixed,
        detail,
        mesh,
        style,
        facingGeometry,
      });
      // Keep all later paving, frame and bearing seeds stable.
      for (let row = 0; row < rows; row++)
        for (let face = 0; face < 4; face++)
          serial +=
            Math.ceil((face % 2 ? depth : width) / style.block) + (row % 2);
    } else {
      // Fit the backing to the widened foot/head courses and recessed middle.
      // At most three closed blocks carry every horizontal mortar joint; using
      // one narrow centre core left the ends of the wider joints open to the sky.
      for (let first = 0; first < rows;) {
        const recess = recessAt(first);
        let end = first + 1;
        while (end < rows && recessAt(end) === recess) end++;
        mesh(
          new THREE.BoxGeometry(
            width - recess * 2 - 0.01,
            (end - first) * rowH + 0.02,
            depth - recess * 2 - 0.01,
          ),
          materials.stone,
          ledge.x,
          ground + ((first + end) * rowH) / 2,
          ledge.z,
          fixed,
          0.7,
        );
        first = end;
      }
      for (let row = 0; row < rows; row++) {
        const y = ground + (row + 0.5) * rowH,
          recess = recessAt(row);
        for (let face = 0; face < 4; face++) {
          const along = face % 2 ? depth : width,
            count = Math.ceil(along / style.block),
            step = along / count;
          // Alternate bonds use half-stones at each end, with backed mortar seams.
          const ends =
            row % 2
              ? [
                  0,
                  ...Array.from({ length: count }, (_, i) => (i + 0.5) * step),
                  along,
                ]
              : Array.from({ length: count + 1 }, (_, i) => i * step);
          for (let i = 1; i < ends.length; i++) {
            const u = (ends[i] + ends[i - 1]) / 2 - along / 2,
              v = (face % 2 ? width : depth) / 2 - 0.13 - recess,
              x = face % 2 ? (face === 1 ? v : -v) : u,
              z = face % 2 ? u : face === 0 ? v : -v;
            const piece = block(
              ends[i] - ends[i - 1] - 0.018,
              rowH - 0.016,
              0.27,
              ledge.x + x,
              y,
              ledge.z + z,
              materials.stone,
              fixed,
              0.86 + ((row * 7 + i * 11 + face * 3) % 9) * 0.027,
              false,
              true,
            );
            piece.rotation.y =
              face === 0
                ? 0
                : face === 1
                  ? Math.PI / 2
                  : face === 2
                    ? Math.PI
                    : -Math.PI / 2;
          }
        }
      }
    }
    for (let band = 0; band < style.bands; band++) {
      const inset = (style.bands - 1 - band) * 0.055;
      block(
        width - inset,
        0.12,
        depth - inset,
        ledge.x,
        top - 0.18 - (band + 0.5) * 0.13,
        ledge.z,
        materials.stone,
        fixed,
        0.85 + band * 0.06,
      );
    }
    // Chamfered coping courses need bearing at their outer edges as well as
    // the recessed central core. A continuous inset bed closes the sightline
    // through each joint without changing the visible stepped profile.
    const bearingInset = (style.bands - 1) * 0.055 + 0.01,
      bearingHeight = style.bands * 0.13;
    mesh(
      new THREE.BoxGeometry(
        width - bearingInset,
        bearingHeight + 0.08,
        depth - bearingInset,
      ),
      materials.stone,
      ledge.x,
      top - 0.18 - bearingHeight / 2,
      ledge.z,
      fixed,
      0.7,
    );
    // A full bed fills the complete standing square, including the old empty
    // chamfered corners. Individual bonded flags retain tapered lower
    // edges, with flat tops and narrow joints 5 mm below the walking surface.
    mesh(
      new THREE.BoxGeometry(width, 0.175, depth),
      materials.stone,
      ledge.x,
      top - 0.0925,
      ledge.z,
      fixed,
      0.7,
    );
    const capRows = Math.ceil(depth / style.block),
      capColumns = Math.ceil(width / style.block),
      capDepth = depth / capRows,
      capWidth = width / capColumns;
    for (let row = 0; row < capRows; row++) {
      const ends =
        row % 2
          ? [
              0,
              ...Array.from(
                { length: capColumns },
                (_, i) => (i + 0.5) * capWidth,
              ),
              width,
            ]
          : Array.from({ length: capColumns + 1 }, (_, i) => i * capWidth);
      for (let i = 1; i < ends.length; i++)
        block(
          ends[i] - ends[i - 1] - 0.014,
          0.18,
          capDepth - 0.014,
          ledge.x + (ends[i] + ends[i - 1]) / 2 - width / 2,
          top - 0.09,
          ledge.z + (row + 0.5) * capDepth - depth / 2,
          materials.stone,
          fixed,
          1 + ((row * 3 + i * 7 + ledge.index) % 5) * 0.016,
          true,
        );
    }
    for (const side of [-1, 1]) {
      // Seat the ledge marker in the full paving bed. The old raised strip
      // entered crouched boot soles; its new upper face is only 2 mm proud.
      // Retain the construction seed sequence for all following stone pieces.
      serial++;
      mesh(
        new THREE.BoxGeometry(0.065, 0.007, depth - 0.34),
        materials.metal,
        ledge.x + side * (ledge.w - 0.17),
        top - 0.0015,
        ledge.z,
        detail,
        0.95,
      );
      // Recessed carved panels and their paired borders break up tall faces.
      if (
        height > 3.7 &&
        ["sky", "jungle", "desert", "snow"].includes(game.level.biome)
      )
        serial += 8;
      else if (height > 3.7) {
        const y = top - 2.0,
          z = ledge.z + side * (ledge.d - style.inset - 0.015);
        block(0.86, 1.72, 0.045, ledge.x, y, z, materials.stone, detail, 0.68);
        for (const x of [-0.53, 0.53])
          block(
            0.09,
            1.88,
            0.085,
            ledge.x + x,
            y,
            z,
            materials.stone,
            detail,
            1.06,
          );
        for (const dy of [-0.92, 0.92])
          block(
            1.15,
            0.09,
            0.085,
            ledge.x,
            y + dy,
            z,
            materials.stone,
            detail,
            1.06,
          );
        for (let mark = 0; mark < 3; mark++) {
          const glyph = block(
            0.23 + mark * 0.08,
            0.045,
            0.055,
            ledge.x,
            y + (mark - 1) * 0.34,
            z + side * 0.045,
            materials.metal,
            detail,
            0.7,
          );
          glyph.rotation.z = ((mark % 2 ? -1 : 1) * Math.PI) / 4;
        }
      }
    }
    piers.push({
      top,
      width,
      depth,
      height,
      bottom: ground,
      capRows,
      capColumns,
      ...(regionalFacade && {
        [`${game.level.biome}Facade`]: regionalFacade,
      }),
    });
  }

  const backZ = plan.pivotLocalZ - 3,
    top = plan.pivot.h + 0.6,
    footings = [];
  for (const x of [-12.8, 7.8]) {
    const p = plan.transform(x, backZ),
      ground = game.groundHeight(p.x, p.z),
      foot = ground - base;
    const footing = {
      bottom:
        footprintMinimum(
          (x, z) => game.groundHeight(x, z),
          p.x,
          p.z,
          0.96,
          0.96,
          game.terrainProfile?.step,
        ) - 0.18,
      top: ground + 0.035,
    };
    mesh(
      new THREE.BoxGeometry(0.9, footing.top - footing.bottom, 0.9),
      materials.stone,
      p.x,
      (footing.top + footing.bottom) / 2,
      p.z,
      fixed,
      0.7,
    );
    const courses = Math.ceil((footing.top - footing.bottom) / 0.44),
      courseHeight = (footing.top - footing.bottom) / courses;
    for (let row = 0; row < courses; row++)
      block(
        0.96,
        courseHeight + 0.018,
        0.96,
        p.x,
        footing.bottom + (row + 0.5) * courseHeight,
        p.z,
        materials.stone,
        fixed,
        0.83,
      );
    footings.push({ x: p.x, z: p.z, ground, footing });
    block(0.96, 0.34, 0.96, p.x, ground + 0.17, p.z, materials.stone);
    for (let row = 0; row < 4; row++)
      block(
        0.84,
        0.36,
        0.84,
        p.x,
        ground + 0.52 + row * 0.36,
        p.z,
        materials.stone,
        fixed,
        0.9 + row * 0.025,
      );
    // The lower stone bearing is smaller than the ordinary camera threshold.
    // Retain its finite envelope after the individual pieces are batched.
    const bottom = footing?.bottom ?? ground - 0.015,
      proxy = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, ground + 1.78 - bottom, 0.96),
        materials.stone,
      );
    proxy.position.set(p.x, (ground + 1.78 + bottom) / 2, p.z);
    fixed.add(proxy);
    game.cameraSurfaces?.capture(proxy, { small: true });
    fixed.remove(proxy);
    proxy.geometry.dispose();
    span(local(x, foot + 1.75, backZ), local(x, top + 2.25, backZ), 0.63, 0.63);
    for (let y = foot + 2; y < top + 1; y += 2.1) {
      const pos = local(x, y, backZ),
        band = block(0.71, 0.16, 0.71, ...pos, materials.metal, detail, 0.76);
      band.rotation.y = -plan.angle;
      const b = local(x, y, backZ + 0.38);
      bolt(...b, -plan.angle);
    }
    for (const direction of [x < 0 ? 1 : -1]) {
      span(
        local(x, top - 3, backZ),
        local(x + direction * 2.7, top, backZ),
        0.28,
        0.32,
      );
    }
  }
  // Two chords and a Warren truss carry the span. The short forward jib has
  // paired diagonal stays, keeping the pendulum envelope entirely clear below.
  for (const y of [top, top + 2.2])
    span(local(-13.8, y, backZ), local(8.8, y, backZ), 0.43, 0.6);
  for (let i = 0; i < 8; i++) {
    const x = -12.8 + i * 2.575;
    span(
      local(x, top + (i % 2 ? 2.2 : 0), backZ),
      local(x + 2.575, top + (i % 2 ? 0 : 2.2), backZ),
      0.22,
      0.35,
    );
    const p = local(x, top + (i % 2 ? 2.2 : 0), backZ + 0.33);
    block(0.48, 0.48, 0.06, ...p, materials.metal, detail, 0.7).rotation.y =
      -plan.angle;
    bolt(...local(x, top + (i % 2 ? 2.2 : 0), backZ + 0.38), -plan.angle);
  }
  for (const dx of [-0.38, 0.38]) {
    span(
      local(-2.5 + dx, top, backZ),
      local(-2.5 + dx, top, plan.pivotLocalZ + 0.2),
      0.24,
      0.32,
    );
    span(
      local(-2.5 + dx, top + 2.2, backZ),
      local(-2.5 + dx, top + 0.1, plan.pivotLocalZ),
      0.18,
      0.22,
    );
  }
  span(
    local(-3.15, top, plan.pivotLocalZ),
    local(-1.85, top, plan.pivotLocalZ),
    0.25,
    0.85,
  );
  // Fixed bearing cheeks attach to the crosshead; the eye swivels about their
  // axle, following the rope without moving its suspension point.
  const yoke = new THREE.Group();
  yoke.position.set(plan.pivot.x, base + plan.pivot.h, plan.pivot.z);
  yoke.rotation.y = -plan.angle;
  root.add(yoke);
  const swing = new THREE.Group();
  yoke.add(swing);
  for (const side of [-1, 1]) {
    block(0.13, 0.85, 0.14, 0, 0.22, side * 0.29, materials.metal, yoke);
    const cheek = mesh(
      new THREE.LatheGeometry(
        [
          [0, -0.045],
          [0.28, -0.045],
          [0.33, -0.025],
          [0.33, 0.025],
          [0.28, 0.045],
          [0, 0.045],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        24,
      ).rotateX(Math.PI / 2),
      materials.metal,
      0,
      0,
      side * 0.29,
      yoke,
      0.8,
    );
    cheek.castShadow = true;
  }
  mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.8, 12).rotateX(Math.PI / 2),
    materials.metal,
    0,
    0,
    0,
    yoke,
    0.8,
  );
  mesh(
    new THREE.TorusGeometry(0.16, 0.045, 8, 24),
    materials.rope,
    0,
    -0.17,
    0,
    swing,
  );
  mergeArchitecture(fixed);
  mergeArchitecture(detail);
  if (game.level.biome === "snow") {
    indexSnowPierGeometry(fixed);
    indexSnowPierGeometry(detail);
  }
  mergeArchitecture(swing);
  mergeArchitecture(yoke);
  boltGeometry.dispose();
  return { fixed, detail, swing, piers, footings };
}

export function updateClimbingArt(course) {
  if (!course.art) return;
  course.art.swing.rotation.z = course.angle;
  if (course.sound)
    course.sound.activity = Math.min(
      1,
      Math.max(0, Math.abs(course.omega) - 0.025) * 0.7,
    );
}
