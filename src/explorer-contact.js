import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { waterAt } from "./hydrology.js";

const SEGMENTS = 6;
const REFINEMENTS = 3;
const MAX_VERTICES = SEGMENTS * SEGMENTS * 2 * 4 ** REFINEMENTS * 3;
const OFFSET = 0.004;

function patchGeometry() {
  // Fixed capacity bounds refinement and avoids reallocating GPU buffers during
  // movement. Only the populated range is drawn; two patches own these buffers.
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of [
    ["position", 3],
    ["uv", 2],
    ["strength", 1],
  ])
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(
        new Float32Array(MAX_VERTICES * size),
        size,
      ).setUsage(THREE.DynamicDrawUsage),
    );
  geometry.setIndex(
    new THREE.BufferAttribute(
      Uint16Array.from({ length: MAX_VERTICES }, (_, i) => i),
      1,
    ),
  );
  geometry.setDrawRange(0, 0);
  return geometry;
}

// A small approximation of the ambient light blocked by each boot. Unlike a
// sun shadow it has no light direction; it follows actual skinned sole samples.
// The grid conforms to supports and omits triangles spanning a missing deck or
// abrupt ledge, so the patch cannot bridge empty space beside the player.
export function fitFootContact(geometry, points, support, terrainSupport) {
  const center = new THREE.Vector3();
  for (const p of points) center.add(p);
  center.multiplyScalar(1 / points.length);
  let xx = 0,
    zz = 0,
    xz = 0;
  for (const p of points) {
    const x = p.x - center.x,
      z = p.z - center.z;
    xx += x * x;
    zz += z * z;
    xz += x * z;
  }
  const angle = Math.atan2(2 * xz, xx - zz) / 2,
    forward = new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
    side = new THREE.Vector2(-forward.y, forward.x);
  let length = 0,
    width = 0,
    clearance = Infinity;
  for (const p of points) {
    const x = p.x - center.x,
      z = p.z - center.z;
    length = Math.max(length, Math.abs(x * forward.x + z * forward.y));
    width = Math.max(width, Math.abs(x * side.x + z * side.y));
    const floor = support(p.x, p.z);
    if (floor !== null) clearance = Math.min(clearance, p.y - floor);
  }
  const opacity =
    0.36 * (1 - THREE.MathUtils.smoothstep(clearance, 0.025, 0.24));
  const floor = support(center.x, center.z);
  geometry.setDrawRange(0, 0);
  if (!Number.isFinite(clearance) || opacity <= 0 || floor === null)
    return false;
  length += 0.12 + Math.max(0, clearance) * 0.3;
  width += 0.1 + Math.max(0, clearance) * 0.3;
  // Compare heights with the nearby plane, rather than with a constant center
  // height. A continuous steep bank is not an abrupt ledge. When one side of a
  // derivative crosses a step, retain the gentler side's local continuation.
  const derivative = (dx, dz) => {
    const before = support(center.x - dx, center.z - dz),
      after = support(center.x + dx, center.z + dz),
      span = Math.hypot(dx, dz),
      a = before === null ? null : (floor - before) / span,
      b = after === null ? null : (after - floor) / span;
    if (a === null) return b || 0;
    if (b === null) return a;
    return Math.abs(a - b) * span < 0.025
      ? (a + b) / 2
      : Math.abs(a) < Math.abs(b)
        ? a
        : b;
  };
  const dx = derivative(0.03, 0),
    dz = derivative(0, 0.03),
    position = geometry.attributes.position,
    uv = geometry.attributes.uv,
    strength = geometry.attributes.strength;
  const sample = (u, v, terrainOnly = false) => {
    const x = center.x + forward.x * u + side.x * v,
      z = center.z + forward.y * u + side.y * v,
      terrain = terrainSupport?.(x, z),
      height = terrainOnly ? terrain : support(x, z),
      continuation = floor + dx * (x - center.x) + dz * (z - center.z);
    return {
      x,
      z,
      u,
      v,
      height,
      terrain:
        terrain !== undefined &&
        terrain !== null &&
        height !== null &&
        Math.abs(height - terrain) < 0.000001,
      valid: height !== null && Math.abs(height - continuation) < 0.18,
    };
  };
  const grid = Array.from({ length: SEGMENTS + 1 }, (_, y) =>
    Array.from({ length: SEGMENTS + 1 }, (_, x) =>
      sample(
        ((x * 2) / SEGMENTS - 1) * length,
        (1 - (y * 2) / SEGMENTS) * width,
      ),
    ),
  );
  let count = 0;
  const emit = (triangle, depth = 0) => {
    if (!triangle.every((p) => p.valid)) return;
    // Interpolating across a terrain diagonal can put a patch face below the
    // ground even when all its vertices fit. Read edges and face interior, and
    // refine only that bend. Discontinuous/missing support never gets bridged.
    // These three corners already passed the full support query. If they all
    // lie on terrain, refine against its exact planes directly. A raised deck
    // retains full support queries. Any object between terrain samples still
    // depth-occludes the underlying ground patch.
    const terrainOnly = triangle.every((p) => p.terrain),
      middle = [
        [0, 1],
        [1, 2],
        [2, 0],
      ].map(([a, b]) =>
        sample(
          (triangle[a].u + triangle[b].u) / 2,
          (triangle[a].v + triangle[b].v) / 2,
          terrainOnly,
        ),
      ),
      face = sample(
        triangle.reduce((sum, p) => sum + p.u, 0) / 3,
        triangle.reduce((sum, p) => sum + p.v, 0) / 3,
        terrainOnly,
      );
    if (!middle.every((p) => p.valid) || !face.valid) return;
    const errors = middle.map(
      (p, i) =>
        p.height - (triangle[i].height + triangle[(i + 1) % 3].height) / 2,
    );
    errors.push(
      face.height - triangle.reduce((sum, p) => sum + p.height, 0) / 3,
    );
    if (errors.some((error) => Math.abs(error) > 0.002)) {
      if (depth >= REFINEMENTS) return;
      const [a, b, c] = triangle,
        [ab, bc, ca] = middle;
      for (const child of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ])
        emit(child, depth + 1);
      return;
    }
    for (const p of triangle) {
      position.setXYZ(count, p.x, p.height + OFFSET, p.z);
      uv.setXY(count, (p.u / length + 1) / 2, (p.v / width + 1) / 2);
      strength.setX(count++, opacity);
    }
  };
  for (let y = 0; y < SEGMENTS; y++)
    for (let x = 0; x < SEGMENTS; x++) {
      const a = grid[y][x],
        b = grid[y + 1][x],
        c = grid[y + 1][x + 1],
        d = grid[y][x + 1];
      emit([a, d, b]);
      emit([b, d, c]);
    }
  geometry.setDrawRange(0, count);
  for (const attribute of [position, uv, strength]) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
  return count > 0;
}

export class ExplorerContact {
  constructor(game) {
    this.game = game;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      vertexShader: /* glsl */ `
        attribute float strength;
        varying vec2 contactUv;
        varying float contactStrength;
        void main() {
          contactUv=uv*2.0-1.0;
          contactStrength=strength;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 contactUv;
        varying float contactStrength;
        void main() {
          float falloff=max(0.0,1.0-dot(contactUv,contactUv));
          gl_FragColor=vec4(0.0,0.0,0.0,
            contactStrength*falloff*falloff);
        }
      `,
    });
    this.meshes = [0, 1].map(() => {
      const mesh = new THREE.Mesh(patchGeometry(), this.material);
      mesh.name = "Explorer ambient foot contact";
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.userData.excludeContact = true;
      game.scene.add(mesh);
      return mesh;
    });
  }

  update() {
    const g = this.game,
      state = g.rig?.grounding;
    for (const mesh of this.meshes) mesh.visible = false;
    if (
      !state?.active ||
      !g.grounded ||
      g.swimming ||
      g.climb ||
      g.ropeRide ||
      g.zipRide ||
      g.dodge
    )
      return;
    g.avatar.updateWorldMatrix(true, false);
    g.rig.model.updateMatrixWorld(true);
    const root = g.player.position;
    const dryHeight = (x, z, floor) => {
      const water = waterAt(g, x, z, root.y + 0.45);
      if (Math.abs(floor - root.y) > 0.5 || (water && water.y > floor + 0.025))
        return null;
      return floor;
    };
    const support = (x, z) =>
        dryHeight(x, z, supportAt(g, x, z, root.y + 0.45).height),
      terrainSupport = (x, z) => dryHeight(x, z, g.groundHeight(x, z));
    for (const [i, foot] of state.feet.entries()) {
      const points = foot.indices.map((index) =>
        foot.shoe
          .getVertexPosition(index, new THREE.Vector3())
          .applyMatrix4(foot.shoe.matrixWorld),
      );
      this.meshes[i].visible = fitFootContact(
        this.meshes[i].geometry,
        points,
        support,
        terrainSupport,
      );
    }
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.material.dispose();
  }
}
