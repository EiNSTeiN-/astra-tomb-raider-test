import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { Adventure } from "../src/game.js";
import { buildFieldGates } from "../src/field-world.js";
import { CameraSurfaces, constrainCamera } from "../src/camera-collision.js";
import { stationEntry } from "../src/field-station-solids.js";
import {
  crystalEnclosurePlan,
  crystalEnclosureSegments,
  CRYSTAL_ENCLOSURE_FLOOR_GLSL,
} from "../src/crystal-enclosure-plan.js";

function contains(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

test("all eight chamber plans retain the original working core and front gate shoulders", () => {
  const plans = Array.from({ length: 8 }, (_, i) => crystalEnclosurePlan(i));
  assert.equal(new Set(plans.map((p) => JSON.stringify(p.points))).size, 8);
  for (const p of plans) {
    for (let x = -6.4; x < 6.5; x += 0.4)
      for (let z = -6.4; z < 6.9; z += 0.4)
        assert(contains(p.points, x, z), `core removed ${p.stage}/${x}/${z}`);
    const segments = crystalEnclosureSegments(p.stage);
    for (const side of [-1, 1])
      for (let z = 0.3; z < 6.5; z += 0.3)
        assert(
          segments.some(
            (s) =>
              Math.abs(s.x - side * 6.5) < 1e-6 &&
              Math.abs(Math.cos(s.angle)) < 1e-6 &&
              Math.abs(z - s.z) <= s.length / 2,
          ),
          "front gate shoulder moved",
        );
    assert(segments.every((s) => s.length > 0.5 && Number.isFinite(s.angle)));
  }
});

test("generated paving expressions handle negative coordinates and concave wings without internal seams", () => {
  // Evaluate the generated scalar expressions themselves. A malformed
  // subtraction such as p.y--6.5 fails here as it does in the fragment compiler.
  const source = CRYSTAL_ENCLOSURE_FLOOR_GLSL;
  const body = source.slice(source.indexOf("float archiveChamberEdge"));
  const statements = body
    .slice(body.indexOf("{") + 1, body.lastIndexOf("}"))
    .replace(/\b(?:float|bool)\s+/g, "let ")
    .replace(/\b(min|max|sqrt)\(/g, "Math.$1(");
  const evaluate = new Function(
    "p",
    "stage",
    "archiveEdgeSquared",
    "vec2",
    statements,
  );
  const distance = (p, a, b) => {
    const ex = b[0] - a[0],
      ez = b[1] - a[1],
      vx = p.x - a[0],
      vz = p.y - a[1];
    const t = Math.min(
      1,
      Math.max(0, (vx * ex + vz * ez) / (ex * ex + ez * ez)),
    );
    return (vx - t * ex) ** 2 + (vz - t * ez) ** 2;
  };
  let queries = 0;
  for (let stage = 1; stage < 8; stage++) {
    const points = crystalEnclosurePlan(stage).points;
    for (let x = -12.17; x < 12; x += 0.37)
      for (let z = -12.11; z < 8; z += 0.37) {
        const result = evaluate({ x, y: z }, stage, distance, (x, y) => [x, y]);
        assert(Number.isFinite(result));
        assert.equal(
          result < 0.25,
          contains(points, x, z),
          `paving differs from room ${stage}/${x}/${z}`,
        );
        queries++;
      }
    for (const [x, z] of [
      [0, 0],
      [0, -5.8],
      [-5, -5],
      [5, -5],
    ])
      assert(
        evaluate({ x, y: z }, stage, distance, (x, y) => [x, y]) < -0.3,
        "internal floor seam",
      );
  }
  assert(queries > 20000);
});

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[6],
    map = createMap(level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: createTerrainProfile(map, level),
    world,
    obstacles: [],
    items: map.features.filter((f) => f.type === "mechanism"),
    progress: { completed: false, field: [], stage: 0 },
    elapsed: 0,
    player: new THREE.Group(),
    audio: { noiseHit() {} },
    cameraSurfaces: new CameraSurfaces(world),
  });
  buildFieldGates(game);
  world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set();
    world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  });
  return game;
}

function insideRenderedMeshes(meshes, point) {
  const direction = new THREE.Vector3(1, 0.173, 0.211).normalize();
  const ray = new THREE.Raycaster(point, direction);
  const normalMatrix = new THREE.Matrix3();
  let winding = 0;
  for (const mesh of meshes) {
    const material = mesh.material,
      oldSide = material.side;
    let hits;
    try {
      material.side = THREE.DoubleSide;
      hits = ray.intersectObject(mesh, false);
    } finally {
      material.side = oldSide;
    }
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const seen = new Set();
    for (const hit of hits) {
      const sign = Math.sign(
        hit.face.normal.clone().applyMatrix3(normalMatrix).dot(direction),
      );
      const key = `${hit.distance.toFixed(5)}/${sign}`;
      if (!seen.has(key)) {
        winding += sign;
        seen.add(key);
      }
    }
  }
  return winding > 0;
}

test("delivered enclosure barriers match sight/audio rays, retain core lanes and protect display crouch transitions", (t) => {
  const g = fixture(t),
    ray = new THREE.Raycaster();
  g.cameraSurfaces.rebuild();
  let rays = 0,
    stances = 0,
    cases = 0;
  for (const gate of g.fieldGates) {
    if (!gate.enclosure) continue;
    for (const [a, b] of [
      [
        [0, 2, -3],
        [0, 2, 3],
      ],
      [
        [-3, 2, -3],
        [3, 2, 3],
      ],
      [
        [3, 2, -3],
        [-3, 2, 3],
      ],
    ]) {
      const focus = gate.root.position.clone().add(new THREE.Vector3(...a));
      const desired = gate.root.position.clone().add(new THREE.Vector3(...b));
      assert(
        constrainCamera(
          focus,
          desired,
          g.cameraSurfaces,
          () => true,
        ).distanceTo(desired) < 1e-6,
        "merged masonry bounds fill an empty camera aisle",
      );
    }
    const meshes = gate.enclosure.root.children.filter((o) => o.isMesh);
    for (const s of gate.enclosure.segments)
      for (const t of [0.2, 0.5, 0.8]) {
        const offset = (t - 0.5) * s.length;
        const x = gate.root.position.x + s.x + Math.cos(s.angle) * offset;
        const z = gate.root.position.z + s.z - Math.sin(s.angle) * offset;
        const y = g.groundHeight(x, z) + 0.9;
        const outward = new THREE.Vector3(
          Math.sin(s.angle),
          0,
          Math.cos(s.angle),
        );
        const from = new THREE.Vector3(x, y, z).addScaledVector(outward, 2),
          to = new THREE.Vector3(x, y, z).addScaledVector(outward, -2);
        ray.set(from, to.clone().sub(from).normalize());
        ray.far = 4;
        const hit = ray.intersectObjects(meshes, false)[0];
        assert(hit, "gap in enclosing masonry");
        const entries = gate.enclosure.feature.stationSolids
          .map((o) => stationEntry(o, from, to))
          .filter((v) => v !== null);
        assert(
          entries.length > 0,
          "rendered wall absent from sight/audio queries",
        );
        const entry = Math.min(...entries);
        assert(
          entry === 0
            ? insideRenderedMeshes(meshes, from)
            : Math.abs(entry - hit.distance / 4) < 1e-5,
          `physical wall differs: stage=${gate.stage} wall=${JSON.stringify(s)} sample=${t} entry=${Math.min(...entries)} render=${hit.distance / 4} from=${from.toArray()}`,
        );
        rays++;
      }
    for (const [cx, cz] of gate.enclosure.plan.cases) {
      const [nx, nz] = cz < -6.5 ? [0, 1] : [-Math.sign(cx), 0];
      for (const crouching of [false, true]) {
        g.crouching = crouching;
        // The delivered-body observer reproduced knee entry at this accepted
        // 0.9m stance. Both states now reject it; crouching at a standing edge
        // must not require a separate relocation after the pose has begun.
        assert(!g.canMove(gate.root.position.x + cx + nx * 0.9,
          gate.root.position.z + cz + nz * 0.9, 0), "old knee-contact stance accepted");
        assert(g.canMove(gate.root.position.x + cx + nx * 1.25,
          gate.root.position.z + cz + nz * 1.25, 0), "display approach lost");
      }
      cases++;
    }
    g.crouching = false;
    for (let dx = -4.8; dx <= 4.8; dx += 1.2)
      for (let dz = -4.8; dz <= 4.8; dz += 1.2) {
        assert(
          g.canMove(gate.root.position.x + dx, gate.root.position.z + dz, 0),
          "old core lane obstructed",
        );
        stances++;
      }
  }
  assert(rays > 100 && stances > 400 && cases === 14);
});
