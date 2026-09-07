import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture, pbrMaterial } from "./visuals.js";
import { windMetal, windSurface } from "./wind-art.js";

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
      (game.level.biome === "jungle" && game.templeMaterial) || game.stoneMat,
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
  return { stone, timber, metal, rope };
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
  ) => {
    const g = stoneBlockGeometry(w, h, d, ++serial);
    if (flat) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++)
        if (p.getY(i) > h / 2 - 0.015) p.setY(i, h / 2);
    }
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
    const ground = game.groundHeight(ledge.x, ledge.z),
      top = base + ledge.h,
      height = top - ground,
      width = ledge.w * 2,
      depth = ledge.d * 2;
    const core = block(
      width - 0.34,
      height - 0.18,
      depth - 0.34,
      ledge.x,
      ground + (height - 0.18) / 2,
      ledge.z,
      materials.stone,
      fixed,
      0.7,
    );
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
    for (let row = 0; row < rows; row++) {
      const y = ground + (row + 0.5) * rowH,
        recess = row > 1 && row < rows - 2 ? style.inset : 0.03;
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
          );
          if (face % 2) piece.rotation.y = Math.PI / 2;
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
    // The final slab has an exact flat top at the physical support height.
    block(
      width,
      0.18,
      depth,
      ledge.x,
      top - 0.09,
      ledge.z,
      materials.stone,
      fixed,
      1.04,
      true,
    );
    for (const side of [-1, 1]) {
      block(
        0.065,
        0.025,
        depth - 0.34,
        ledge.x + side * (ledge.w - 0.17),
        top + 0.008,
        ledge.z,
        materials.metal,
        detail,
        0.95,
      );
      // Recessed carved panels and their paired borders break up tall faces.
      if (height > 3.7) {
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
    piers.push({ top, width, depth, height });
  }

  const backZ = plan.pivotLocalZ - 3,
    top = plan.pivot.h + 0.6;
  for (const x of [-12.8, 7.8]) {
    const p = plan.transform(x, backZ),
      ground = game.groundHeight(p.x, p.z),
      foot = ground - base;
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
  mergeArchitecture(swing);
  mergeArchitecture(yoke);
  boltGeometry.dispose();
  return { fixed, detail, swing, piers };
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
