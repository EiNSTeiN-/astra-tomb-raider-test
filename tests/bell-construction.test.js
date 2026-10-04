import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { bellGeometry } from "../src/monastery-architecture.js";
import { supportAt } from "../src/character-motion.js";
import { gateLeafBounds } from "../src/gate-designs.js";
import {
  buildBellPlatform,
  buildBellFrame,
  buildBellFittings,
  positionBellWrap,
  buildBellTablet,
} from "../src/bell-rack-art.js";

function fixture(t) {
  const level = LEVELS[2],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    materials = Object.fromEntries(
      ["wood", "stone", "snow", "bronze", "rope"].map((name) => [
        name,
        new THREE.MeshStandardMaterial({
          vertexColors: ["wood", "stone", "snow"].includes(name),
          side: THREE.DoubleSide,
        }),
      ]),
    ),
    game = {
      level,
      map,
      world,
      terrainProfile: profile,
      groundHeight: profile.height,
      obstacles: [],
      stoneMat: materials.stone,
      monasteryMaterials: materials,
      cameraSurfaces: new CameraSurfaces(world),
    };
  t.after(() => {
    world.traverse((o) => o.geometry?.dispose());
    Object.values(materials).forEach((m) => m.dispose());
  });
  return { game, materials };
}

// Match the delivered terrain's grid, diagonal, vertex heights and winding.
function terrainPatch(game, x, z) {
  const step = game.terrainProfile.step,
    sx = Math.floor(x / step) * step - 7 * step,
    sz = Math.floor(z / step) * step - 7 * step,
    geometry = new THREE.PlaneGeometry(14 * step, 14 * step, 14, 14);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(sx + 7 * step, 0, sz + 7 * step);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, game.groundHeight(position.getX(i), position.getZ(i)));
  const mesh = new THREE.Mesh(geometry, game.stoneMat);
  game.world.add(mesh);
  return mesh;
}

test("every bell-rack lower footing vertex has rendered support and the seven landings keep their fixed floor height", (t) => {
  const { game, materials } = fixture(t),
    ray = new THREE.Raycaster();
  let checks = 0,
    landings = 0;
  for (const feature of game.map.features.filter(
    (f) => f.type === "mechanism",
  )) {
    const x = feature.x * 7,
      z = feature.z * 7 + (feature.stage === 0 ? 12 : 0),
      ground = game.groundHeight(x, z),
      rise = feature.stage ? 2.8 + (feature.stage % 3) * 0.3 : 0,
      root = new THREE.Group();
    root.position.set(x, ground + rise, z);
    game.world.add(root);
    const site = {
        root,
        stage: feature.stage,
        feature,
        furniture: { id: `bell-${feature.stage}` },
      },
      terrain = terrainPatch(game, x, z),
      supports = [terrain];
    if (rise) {
      supports.push(buildBellPlatform(game, feature, x, ground, z, rise).root);
      landings++;
    }
    const { feet } = buildBellFrame(game, site, materials);
    game.world.updateMatrixWorld(true);
    for (const foot of feet) {
      const p = foot.geometry.attributes.position;
      foot.geometry.computeBoundingBox();
      const bottom = foot.geometry.boundingBox.min.y;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > bottom + 0.035) continue;
        const point = new THREE.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(foot.matrixWorld);
        ray.set(
          new THREE.Vector3(point.x, root.position.y + 0.5, point.z),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObjects(supports, true)[0];
        assert(
          hit && point.y - hit.point.y < 0.005,
          `unsupported foot in rack ${feature.stage + 1}`,
        );
        if (rise)
          assert(
            Math.abs(
              supportAt(game, point.x, point.z).height - root.position.y,
            ) < 1e-6,
          );
        checks++;
      }
    }
  }
  assert.equal(landings, 7);
  assert(checks > 500);
  game.world.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material.vertexColors) return;
    const color = mesh.geometry.attributes.color;
    // Terrain has its own shader. New construction must supply vertex color.
    if (mesh.geometry.type === "PlaneGeometry") return;
    assert(color && color.count === mesh.geometry.attributes.position.count);
    for (const value of color.array) assert(value > 0.9 && value <= 1);
  });
});

test("all raised lesson stands clear the complete inward door sweep, including the movement margin", (t) => {
  const { game, materials } = fixture(t);
  for (let stage = 1; stage <= 7; stage++) {
    const root = new THREE.Group(),
      site = { root, stage, furniture: { id: `bell-${stage}` } };
    game.world.add(root);
    buildBellTablet(game, site, materials, new THREE.Group());
    for (let i = 0; i <= 200; i++)
      for (const side of [-1, 1]) {
        const leaf = gateLeafBounds(side, i / 200);
        for (const solid of site.furniture.stationSolids)
          assert(
            leaf.x + leaf.w + 0.25 <= solid.bounds.min.x ||
              leaf.x - leaf.w - 0.25 >= solid.bounds.max.x ||
              leaf.z + leaf.d + 0.25 <= solid.bounds.min.z ||
              leaf.z - leaf.d - 0.25 >= solid.bounds.max.z,
            `door/stand conflict at stage ${stage}, pose ${i}`,
          );
      }
  }
});

test("all four ringing bell shells clear the actual timber posts and braces throughout the swing", (t) => {
  const { game, materials } = fixture(t),
    root = new THREE.Group();
  game.world.add(root);
  const frame = buildBellFrame(
      game,
      { root, stage: 1, furniture: { id: "bell-frame" } },
      materials,
    ),
    shell = bellGeometry(),
    inverse = new THREE.Matrix4(),
    point = new THREE.Vector3();
  game.world.updateMatrixWorld(true);
  let minimum = Infinity;
  for (const member of [...frame.posts, ...frame.braces]) {
    member.geometry.computeBoundingBox();
    inverse.copy(member.matrixWorld).invert();
    for (let bell = 0; bell < 4; bell++) {
      const scale = 0.55 - bell * 0.045,
        x = (bell - 1.5) * 1.4;
      for (let angle = -0.26; angle <= 0.26001; angle += 0.013) {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(x, 4.05, -1.25),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            angle,
          ),
          new THREE.Vector3(scale, scale, scale),
        );
        for (let i = 0; i < shell.attributes.position.count; i++) {
          point
            .fromBufferAttribute(shell.attributes.position, i)
            .applyMatrix4(matrix)
            .applyMatrix4(inverse);
          minimum = Math.min(
            minimum,
            member.geometry.boundingBox.distanceToPoint(point),
          );
        }
      }
    }
  }
  shell.dispose();
  assert(minimum > 0.05, `bell touches a timber member: ${minimum} m`);
});

test("the moving rope remains tangent to the delivered sheave and clears its spindle and groove surface", (t) => {
  const { game, materials } = fixture(t),
    root = new THREE.Group();
  game.world.add(root);
  const { pulley, wrap } = buildBellFittings(
      game,
      { root, stage: 1 },
      -2.1,
      materials,
    ),
    hinge = new THREE.Group(),
    bell = { hinge, wrap },
    ray = new THREE.Raycaster(),
    matrix = new THREE.Matrix4();
  hinge.position.set(-2.1, 4.05, -1.25);
  game.world.updateMatrixWorld(true);
  let checks = 0;
  for (const angle of [-0.26, -0.13, 0, 0.13, 0.26]) {
    const start = new THREE.Vector3(0, -0.6, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), angle)
        .add(hinge.position),
      tangent = positionBellWrap(bell, start),
      radius = tangent.clone().sub(pulley.position);
    assert(Math.abs(radius.length() - 0.158) < 1e-8);
    assert(Math.abs(start.clone().sub(tangent).dot(radius)) < 1e-8);
    for (let instance = 0; instance < wrap.count; instance++) {
      wrap.getMatrixAt(instance, matrix);
      const p = wrap.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(matrix)
            .applyMatrix4(wrap.matrixWorld),
          outward = point.clone().sub(pulley.position).setX(0).normalize();
        ray.set(
          point.clone().addScaledVector(outward, 0.01),
          outward.clone().negate(),
        );
        const hit = ray.intersectObject(pulley)[0];
        assert(
          hit && hit.distance >= 0.01 - 1e-5,
          "rope enters the bronze groove",
        );
        assert(
          Math.hypot(point.y - 4.29, point.z - 0.9) > 0.135,
          "rope enters the axle",
        );
        checks++;
      }
    }
  }
  assert.equal(checks, 2400);
});
