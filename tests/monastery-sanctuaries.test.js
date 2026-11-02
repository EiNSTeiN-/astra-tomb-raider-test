import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Adventure } from "../src/game.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { normalizeSave } from "../src/storage.js";
import { buildFieldGates } from "../src/field-world.js";
import { updateSanctuaryGate } from "../src/sanctuary-gates.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { stationSupport } from "../src/field-station-solids.js";
import { advanceCharacter } from "../src/character-motion.js";
import { MONASTERY_SANCTUARIES } from "../src/monastery-sanctuaries.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[2],
    map = createMap(level),
    terrain = createTerrainProfile(map, level),
    world = new T.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    world,
    terrainProfile: terrain,
    groundHeight: terrain.height,
    walkable: () => true,
    obstacles: [],
    items: [],
    waterMeshes: [],
    flames: [],
    progress: normalizeSave({ version: 1, levels: { frost: { stage: 8 } } })
      .levels.frost,
    player: new T.Group(),
    avatar: new T.Group(),
    grounded: true,
    jumpY: 0,
    velocityY: 0,
    health: 100,
    audio: { tone() {} },
  });
  g.cameraSurfaces = new CameraSurfaces(world);
  for (const f of map.features.filter((f) => f.type === "mechanism")) {
    f.group = new T.Group();
    f.group.position.set(f.x * 7, terrain.height(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    g.items.push(f);
  }
  buildFieldGates(g);
  g.cameraSurfaces.rebuild();
  world.updateMatrixWorld(true);
  t.after(() => {
    const resources = new Set();
    world.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m);
        m.userData.additionalTextures?.forEach((v) => resources.add(v));
        for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    for (const r of resources) r.dispose();
  });
  return g;
}

function parts(record) {
  const groups = new Map(
    record.parts.map((p) => [
      p.id,
      { ...p, triangles: [], bounds: new T.Box3() },
    ]),
  );
  record.root.updateMatrixWorld(true);
  record.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position,
      tag = mesh.geometry.attributes.monasteryPart;
    for (let i = 0; i < p.count; i += 3) {
      const entry = groups.get(tag.getX(i)),
        v = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(p, i + j)
            .applyMatrix4(mesh.matrixWorld),
        );
      for (const point of v) entry.bounds.expandByPoint(point);
      entry.triangles.push(v);
    }
  });
  return [...groups.values()];
}

test("eight monastery rooms retain distinct compositions and closed outward pieces after batching", (t) => {
  const g = fixture(t);
  assert.equal(new Set(MONASTERY_SANCTUARIES.map((s) => s.roof)).size, 8);
  let count = 0;
  for (const gate of g.fieldGates) {
    const r = gate.monasterySanctuary;
    assert.equal(r.walls.length, 3);
    assert(r.root.children.length <= 7);
    for (const part of parts(r)) {
      const edges = new Map();
      let volume = 0;
      const key = (v) =>
        v
          .toArray()
          .map((x) => Math.round(x * 1e5))
          .join(",");
      for (const v of part.triangles) {
        assert(
          new T.Triangle(...v).getArea() > 1e-10,
          `${gate.stage}/${part.kind} degenerate`,
        );
        volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
        for (let j = 0; j < 3; j++) {
          const a = key(v[j]),
            b = key(v[(j + 1) % 3]),
            edge = [a, b].sort().join("|");
          edges.set(edge, (edges.get(edge) || 0) + (a < b ? 1 : -1));
        }
      }
      assert(
        volume > 1e-7,
        `${gate.stage}/${part.kind} outward volume ${volume}`,
      );
      assert(
        [...edges.values()].every((n) => n === 0),
        `${gate.stage}/${part.kind} open seam`,
      );
      count++;
    }
  }
  assert(count > 700);
  t.diagnostic(`${count} closed construction pieces`);
});

test("all painted bays have real recessed depth and camera surfaces meet their delivered fronts", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let count = 0;
  // Isolate the plaster construction from leaves intentionally folded over it.
  for (const gate of g.fieldGates) gate.door.visible = false;
  for (const gate of g.fieldGates)
    for (const wall of gate.monasterySanctuary.walls) {
      const matrix = new T.Matrix4().fromArray(wall.frame);
      matrix.premultiply(gate.root.matrixWorld);
      for (const n of wall.niches)
        for (const f of [0.37, 0.61]) {
          const a = new T.Vector3(
              n.x + n.width * 0.12,
              n.bottom + (n.top - n.bottom) * f,
              -2,
            ).applyMatrix4(matrix),
            b = new T.Vector3(
              n.x + n.width * 0.12,
              n.bottom + (n.top - n.bottom) * f,
              0.5,
            ).applyMatrix4(matrix),
            distance = a.distanceTo(b);
          ray.set(a, b.clone().sub(a).normalize());
          ray.far = distance;
          const hit = ray.intersectObject(
            gate.monasterySanctuary.root,
            true,
          )[0];
          assert(hit);
          assert(
            Math.abs(hit.distance - 1.748) < 2e-5,
            `actual recess ${gate.stage}/${wall.side}: ${hit.distance}`,
          );
          const camera = g.cameraSurfaces.entry(a, b, 0) * distance;
          assert(
            Math.abs(camera - hit.distance) < 2e-5,
            `camera recess ${gate.stage}/${wall.side}: ${camera} / ${hit.distance}`,
          );
          count++;
        }
    }
  assert(count > 150);
  t.diagnostic(`${count} painted-back depth and camera rays`);
});

test("sloped slate and snow retain exact camera and support heights while open roof spaces stay empty", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let surfaces = 0,
    voids = 0,
    slopes = 0;
  for (const gate of g.fieldGates) {
    const r = gate.monasterySanctuary,
      c = gate.root.position;
    for (const dx of [-6.7, -5.5, -4.4, -3.2, -1.6, 0, 1.6, 3.2, 4.4, 5.5, 6.7])
      for (const dz of [-5.8, -4.6, -3.3, -2, -0.8, 0, 0.8, 2.1, 3.5, 4.1]) {
        const a = c.clone().add(new T.Vector3(dx, 18, dz)),
          b = c.clone().add(new T.Vector3(dx, 8, dz));
        ray.set(a, new T.Vector3(0, -1, 0));
        ray.far = 10;
        const hit = ray.intersectObject(r.root, true)[0],
          heights = r.solids
            .map((s) => stationSupport(s, a.x, a.z, Infinity, 0))
            .filter((h) => h !== null),
          support = heights.length ? Math.max(...heights) : null,
          camera = g.cameraSurfaces.entry(a, b, 0) * 10;
        const bodyHeights = r.solids
            .map((s) => stationSupport(s, a.x, a.z, Infinity, 0.55))
            .filter((h) => h !== null),
          bodySupport = bodyHeights.length ? Math.max(...bodyHeights) : null;
        if (hit) {
          assert(support !== null);
          assert(
            Math.abs(support - hit.point.y) < 2e-5,
            `support ${gate.stage} ${dx}/${dz}`,
          );
          assert(
            bodySupport !== null && Math.abs(bodySupport - hit.point.y) < 2e-5,
            `body support ${gate.stage} ${dx}/${dz}`,
          );
          const part =
              r.parts[
                hit.object.geometry.attributes.monasteryPart.getX(hit.face.a)
              ],
            roof = part.category === "roof";
          // Timber retains its conservative box through the <=55 mm bevel.
          assert(
            camera <= hit.distance + 3e-5 &&
              hit.distance - camera < (roof ? 3e-5 : 0.065),
            `camera ${gate.stage} ${dx}/${dz}: ${camera} / ${hit.distance} ${part.kind}`,
          );
          surfaces++;
          if (roof) slopes++;
        } else {
          assert(support === null || support < c.y + 8);
          assert(
            bodySupport === null || bodySupport < c.y + 8,
            `open roof has no invisible standing cap ${gate.stage} ${dx}/${dz}`,
          );
          assert.equal(camera, 10, `empty roof ${gate.stage} ${dx}/${dz}`);
          voids++;
        }
      }
  }
  assert(slopes > 300 && voids > 100);
  assert.equal(surfaces + voids, 880);
  t.diagnostic(
    `${slopes} sloped roof rays, ${surfaces} total surfaces, ${voids} open sky rays`,
  );
});

function bearings(g) {
  const up = new T.Raycaster(),
    down = new T.Raycaster(),
    failures = [];
  let count = 0;
  for (const gate of g.fieldGates) {
    const r = gate.monasterySanctuary,
      c = gate.root.position,
      old = [];
    gate.root.traverse((o) => {
      if (o.isMesh && !o.geometry.attributes.monasteryPart) old.push(o);
    });
    for (const part of parts(r).filter((p) => p.kind === "roof bearing")) {
      const x = (part.bounds.min.x + part.bounds.max.x) / 2,
        z = (part.bounds.min.z + part.bounds.max.z) / 2;
      up.set(new T.Vector3(x, c.y + 7.03, z), new T.Vector3(0, 1, 0));
      up.far = 1;
      const lower = up.intersectObject(r.root, true)[0];
      assert(lower);
      let top = -Infinity;
      for (const offset of [-0.06, 0, 0.06]) {
        down.set(
          new T.Vector3(x, c.y + 7.8, z + offset),
          new T.Vector3(0, -1, 0),
        );
        down.far = 1;
        const hit = down.intersectObjects(old)[0];
        if (hit) top = Math.max(top, hit.point.y);
      }
      const gap = lower.point.y - top;
      if (!Number.isFinite(gap) || gap > 0.002 || gap < -0.4)
        failures.push({ stage: gate.stage, gap });
      count++;
    }
  }
  return { count, failures };
}
test("the new roof bearings enter delivered coping and a raised assembly is rejected", (t) => {
  const g = fixture(t),
    result = bearings(g);
  assert(result.count >= 38);
  assert.deepEqual(result.failures, []);
  const root = g.fieldGates[2].monasterySanctuary.root;
  root.position.y += 0.4;
  g.world.updateMatrixWorld(true);
  try {
    assert(bearings(g).failures.some((f) => f.stage === 2 && f.gap > 0.1));
  } finally {
    root.position.y -= 0.4;
    g.world.updateMatrixWorld(true);
  }
  t.diagnostic(`${result.count} rendered coping contacts`);
});

test("overhead construction clears every moving snow leaf through its entire inward sweep", (t) => {
  const g = fixture(t);
  let poses = 0;
  for (const gate of g.fieldGates) {
    const structure = parts(gate.monasterySanctuary).filter(
      (p) => p.category !== "wall",
    );
    for (let i = 0; i <= 40; i++) {
      gate.amount = i / 40;
      updateSanctuaryGate(g, gate, 0);
      g.world.updateMatrixWorld(true);
      for (const leaf of gate.leaves) {
        const bounds = new T.Box3().setFromObject(leaf.group);
        for (const part of structure)
          assert(
            !bounds.intersectsBox(part.bounds),
            `${gate.stage}/${part.kind} sweep ${i}`,
          );
      }
      poses++;
    }
  }
  assert.equal(poses, 328);
});

test("actual controller landings remain supported and legal on all eight new roof compositions", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster(),
    points = [
      [0, -4.9],
      [0, -3.6],
      [4.4, -0.3],
      [0, -4.1],
      [-3.4, -0.5],
      [0, -0.5],
      [0, -2.8],
      [0, -0.5],
    ];
  for (const gate of g.fieldGates) {
    const c = gate.root.position,
      [dx, dz] = points[gate.stage],
      x = c.x + dx,
      z = c.z + dz;
    ray.set(new T.Vector3(x, c.y + 20, z), new T.Vector3(0, -1, 0));
    ray.far = 13;
    const hit = ray.intersectObject(gate.monasterySanctuary.root, true)[0];
    assert(hit);
    g.player.position.copy(hit.point).add(new T.Vector3(0, 2.3, 0));
    g.jumpY = g.player.position.y - g.groundHeight(x, z);
    g.grounded = false;
    g.velocityY = 0;
    g.airVelocity = null;
    for (let i = 0; i < 180; i++) advanceCharacter(g, new T.Vector3(), 1 / 60);
    assert(
      g.grounded && g.player.position.y > c.y + 8,
      `landing ${gate.stage}: ${g.player.position.toArray()}`,
    );
    assert(
      g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
      `body ${gate.stage}`,
    );
    assert(Math.hypot(g.player.position.x - x, g.player.position.z - z) < 1e-5);
  }
});

test("the light-screen walk carries two boot footprints across the screen, and removing its planks exposes the old unsupported stance", (t) => {
  const g = fixture(t),
    r = g.fieldGates[5].monasterySanctuary,
    c = g.fieldGates[5].root.position,
    ray = new T.Raycaster(),
    angle = 0.65;
  function height(x, z, ignoreWalk) {
    ray.set(new T.Vector3(c.x + x, c.y + 18, c.z + z), new T.Vector3(0, -1, 0));
    ray.far = 10;
    const hit = ray
      .intersectObject(r.root, true)
      .find(
        (h) =>
          !ignoreWalk ||
          r.parts[h.object.geometry.attributes.monasteryPart.getX(h.face.a)]
            .kind !== "service-walk plank",
      );
    return hit?.point.y ?? null;
  }
  function survey(ignoreWalk) {
    let checks = 0,
      unsupported = 0;
    for (const z of [-5.4, -2.7, -0.5, 1, 4.9]) {
      const center = height(0, z, ignoreWalk);
      assert(center !== null);
      for (const side of [-1, 1])
        for (const across of [-0.07, 0, 0.07])
          for (const along of [-0.16, -0.08, 0, 0.08, 0.16]) {
            const x = side * 0.17 + across,
              dx = x * Math.cos(angle) - along * Math.sin(angle),
              dz = x * Math.sin(angle) + along * Math.cos(angle),
              support = height(dx, z + dz, ignoreWalk);
            if (support === null || Math.abs(support - center) > 0.035)
              unsupported++;
            checks++;
          }
    }
    return { checks, unsupported };
  }
  const current = survey(false);
  assert.equal(current.unsupported, 0);
  assert(survey(true).unsupported > 0);
  t.diagnostic(`${current.checks} rendered two-boot bearing samples`);
});
