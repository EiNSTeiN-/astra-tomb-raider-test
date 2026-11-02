import * as THREE from "three";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationMeshSolid, stationSupport } from "./field-station-solids.js";
import { NATURE_BODY_RADIUS } from "./nature-rock-solids.js";

const smooth = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

// A level stone sill meets the door's original lower edge. Its approaches
// descend into the soil; the outer bed remains buried across the whole span.
export function meridianThresholdGeometry(game, gate) {
  const c = gate.root.position,
    half = gate.halfWidth + 0.8,
    flatHalf = gate.halfWidth - 0.2,
    near = 0.8,
    far = 10.1,
    nx = Math.ceil((half * 2) / 0.25),
    nz = Math.ceil((far - near) / 0.25),
    positions = [],
    indices = [];
  let raised = 0;
  for (let x = -flatHalf; x <= flatHalf; x += 0.25)
    for (const z of [6.25, 6.5, 6.75])
      raised = Math.max(raised, c.y - game.groundHeight(c.x + x, c.z + z));
  if (raised < 0.04) return null;
  const bottom =
    footprintMinimum(
      (x, z) => game.groundHeight(x, z),
      c.x,
      c.z + (near + far) / 2,
      half * 2,
      far - near,
      game.terrainProfile?.step,
    ) -
    c.y -
    0.24;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = -half + (i / nx) * half * 2,
        z = near + (j / nz) * (far - near),
        soil = game.groundHeight(c.x + x, c.z + z) - c.y,
        weight =
          smooth((half - Math.abs(x)) / (half - flatHalf)) *
          smooth((z - near) / 3) *
          smooth((far - z) / 3),
        // Rising soil covers the sill; hidden construction must not create a
        // higher bound across the neighboring counterweight board.
        top = Math.min(0, soil * (1 - weight) - 0.03 * (1 - weight));
      positions.push(x, top, z);
    }
  const row = nx + 1;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * row + i,
        b = a + 1,
        d = a + row,
        c = d + 1;
      indices.push(a, d, b, b, d, c);
    }
  const rim = [];
  for (let i = 0; i <= nx; i++) rim.push(i);
  for (let j = 1; j <= nz; j++) rim.push(j * row + nx);
  for (let i = nx - 1; i >= 0; i--) rim.push(nz * row + i);
  for (let j = nz - 1; j > 0; j--) rim.push(j * row);
  const lower = rim.map((index) => {
    const next = positions.length / 3;
    positions.push(positions[index * 3], bottom, positions[index * 3 + 2]);
    return next;
  });
  const center = positions.length / 3;
  positions.push(0, bottom, (near + far) / 2);
  for (let i = 0; i < rim.length; i++) {
    const next = (i + 1) % rim.length;
    indices.push(rim[i], rim[next], lower[next], rim[i], lower[next], lower[i]);
    indices.push(center, lower[i], lower[next]);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i)),
      axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
    uv[i * 2] = (axis === 0 ? p.getZ(i) : p.getX(i)) / 2;
    uv[i * 2 + 1] = (axis === 1 ? p.getZ(i) : p.getY(i)) / 2;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, raised, bottom: bottom + c.y, half, near, far };
}

export function buildMeridianThreshold(game, gate, material) {
  if (game.level.biome !== "eclipse") return null;
  const fitted = meridianThresholdGeometry(game, gate);
  if (!fitted) return null;
  const root = new THREE.Group(),
    mesh = new THREE.Mesh(fitted.geometry, material);
  root.name = `Meridian doorway threshold ${gate.stage}`;
  root.add(mesh);
  gate.root.add(root);
  mesh.castShadow = mesh.receiveShadow = true;
  const solid = stationMeshSolid(
    game,
    { id: `meridian-threshold-${gate.stage}` },
    mesh,
    {
      support: true,
      supportRadius: 0,
      groundingSlope: true,
      bodyPadding: 0.4,
    },
  );
  solid.meridianThreshold = true;
  game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
  return (gate.threshold = { ...fitted, root, mesh, solid });
}

// Older open-door saves stood on the original soil. Keep their position when
// the new threshold occupies it, provided its current standing surface is clear.
export function restoreMeridianThresholdArrival(game) {
  const saved = game.progress.position,
    p = game.player.position;
  if (!saved || Math.hypot(saved.x - p.x, saved.z - p.z) > 1e-6) return false;
  const ground = game.groundHeight(p.x, p.z),
    savedY = ground + (Number.isFinite(saved.height) ? saved.height : 0),
    occupiedY = Math.max(p.y, savedY);
  for (const gate of game.fieldGates || []) {
    const solid = gate.threshold?.solid;
    if (!solid) continue;
    const height = stationSupport(
      solid,
      p.x,
      p.z,
      Infinity,
      NATURE_BODY_RADIUS,
    );
    if (
      height === null ||
      height <= occupiedY + 0.015 ||
      height - occupiedY > 1.6 ||
      !game.canMove(p.x, p.z, height - ground)
    )
      continue;
    p.y = height;
    game.jumpY = height - ground;
    // Traversal and the later asset-arrival pass read this same saved position.
    // Correct its elevation before either can search around the occupied soil.
    saved.height = game.jumpY;
    game.velocityY = 0;
    game.grounded = true;
    game.fallPeak = height;
    game.campEscape = null;
    return true;
  }
  return false;
}
