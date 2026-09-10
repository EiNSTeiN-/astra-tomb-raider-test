import * as THREE from "three";
import { supportAt } from "./character-motion.js";
import { waterAt } from "./hydrology.js";

const SEGMENTS = 6;

function patchGeometry() {
  const geometry = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(
    "strength",
    new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count),
      1,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.index.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

// A small approximation of the ambient light blocked by each boot. Unlike a
// sun shadow it has no light direction; it follows actual skinned sole samples.
// The grid conforms to supports and omits triangles spanning a missing deck or
// abrupt ledge, so the patch cannot bridge empty space beside the player.
export function fitFootContact(geometry, points, support) {
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
  const position = geometry.attributes.position,
    uv = geometry.attributes.uv,
    strength = geometry.attributes.strength,
    valid = [];
  for (let i = 0; i < position.count; i++) {
    const u = (uv.getX(i) * 2 - 1) * length,
      v = (uv.getY(i) * 2 - 1) * width,
      x = center.x + forward.x * u + side.x * v,
      z = center.z + forward.y * u + side.y * v,
      height = support(x, z);
    valid[i] = height !== null && Math.abs(height - floor) < 0.18;
    position.setXYZ(i, x, (valid[i] ? height : floor) + 0.004, z);
    strength.setX(i, valid[i] ? opacity : 0);
  }
  let count = 0;
  const index = geometry.index;
  for (let y = 0; y < SEGMENTS; y++)
    for (let x = 0; x < SEGMENTS; x++) {
      const a = y * (SEGMENTS + 1) + x,
        b = a + SEGMENTS + 1,
        c = b + 1,
        d = a + 1;
      for (const triangle of [
        [a, d, b],
        [b, d, c],
      ]) {
        if (!triangle.every((i) => valid[i])) continue;
        const heights = triangle.map((i) => position.getY(i));
        if (Math.max(...heights) - Math.min(...heights) > 0.1) continue;
        for (const i of triangle) index.setX(count++, i);
      }
    }
  geometry.setDrawRange(0, count);
  position.needsUpdate = strength.needsUpdate = index.needsUpdate = true;
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
    const support = (x, z) => {
      const floor = supportAt(g, x, z, root.y + 0.45).height,
        water = waterAt(g, x, z, root.y + 0.45);
      if (Math.abs(floor - root.y) > 0.5 || (water && water.y > floor + 0.025))
        return null;
      return floor;
    };
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
