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
import { SOLAR_SANCTUARIES } from "../src/solar-sanctuaries.js";

function fixture(t) {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[1],
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
    progress: normalizeSave({ version: 1, levels: { sands: { stage: 9 } } })
      .levels.sands,
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
      tag = mesh.geometry.attributes.solarSanctuaryPart;
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

test("nine sanctuary compositions retain closed outward construction after material batching", (t) => {
  const g = fixture(t);
  assert.equal(new Set(SOLAR_SANCTUARIES.map((s) => s.roof)).size, 9);
  let pieces = 0;
  for (const gate of g.fieldGates) {
    const r = gate.solarSanctuary;
    assert(r);
    assert.equal(r.walls.length, 3);
    assert(r.root.children.length <= 4);
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
          `${gate.stage}/${part.kind}: nondegenerate`,
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
        `${gate.stage}/${part.kind}: outward volume ${volume}`,
      );
      assert(
        [...edges.values()].every((n) => n === 0),
        `${gate.stage}/${part.kind}: closed edges ${JSON.stringify([...edges].filter((e) => e[1] !== 0).slice(0, 6))}`,
      );
      pieces++;
    }
  }
  assert(pieces > 1000);
  t.diagnostic(`${pieces} closed construction pieces`);
});

test("recessed inner walls and perforated crowns retain their actual camera depth and empty apertures", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let queries = 0;
  for (const gate of g.fieldGates) {
    const r = gate.solarSanctuary,
      c = gate.root.position;
    for (const wall of r.walls) {
      const matrix = new T.Matrix4().fromArray(wall.frame);
      matrix.setPosition(new T.Vector3().setFromMatrixPosition(matrix).add(c));
      const point = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(matrix);
      for (const n of wall.niches)
        for (const t of [0.35, 0.55]) {
          const x = n.x + n.radius * 0.21,
            y = n.bottom + (n.top - n.bottom) * t,
            a = point(x, y, -2),
            b = point(x, y, 0.5),
            distance = a.distanceTo(b);
          ray.set(a, b.clone().sub(a).normalize());
          ray.far = distance;
          const hit = ray.intersectObject(r.root, true)[0];
          assert(hit);
          const camera = g.cameraSurfaces.entry(a, b, 0) * distance;
          assert(
            Math.abs(camera - hit.distance) < 2e-5,
            `recess ${gate.stage}/${wall.side}: camera ${camera}, stone ${hit.distance}`,
          );
          assert(
            hit.distance > 1.6 && hit.distance < 1.8,
            "recess remains behind its projecting frame",
          );
          queries++;
        }
    }
    if ([2, 6, 7].includes(gate.stage)) {
      const xs =
          gate.stage === 2
            ? [-4.5, 0, 4.5]
            : gate.stage === 6
              ? [-4.2, 0, 4.2]
              : [-4.8, -1.6, 1.6, 4.8],
        y = gate.stage === 7 ? 9.8 : 10.2;
      for (const x of xs) {
        const a = c.clone().add(new T.Vector3(x, y, 8)),
          b = c.clone().add(new T.Vector3(x, y, 5.7));
        ray.set(a, new T.Vector3(0, 0, -1));
        ray.far = 2.3;
        assert.equal(
          ray.intersectObject(r.root, true).length,
          0,
          "actual crown aperture is open",
        );
        assert.equal(
          g.cameraSurfaces.entry(a, b, 0),
          1,
          "camera does not fill the crown aperture",
        );
        queries++;
      }
    }
  }
  assert(queries > 120);
  t.diagnostic(`${queries} inner-wall and crown camera rays`);
});

test("new roof support agrees with delivered stone and leaves each authored skylight empty", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster();
  let surfaces = 0,
    voids = 0;
  for (const gate of g.fieldGates) {
    const r = gate.solarSanctuary,
      c = gate.root.position;
    for (const dx of [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8])
      for (const dz of [
        -5.4, -4.8, -3.9, -3.4, -1.9, -0.6, 0, 2.4, 3.6, 4.8, 5.3,
      ]) {
        const a = c.clone().add(new T.Vector3(dx, 20, dz)),
          b = c.clone().add(new T.Vector3(dx, 7, dz));
        ray.set(a, new T.Vector3(0, -1, 0));
        ray.far = 13;
        const hit = ray.intersectObject(r.root, true)[0],
          contacts = r.solids
            .map((solid) => stationSupport(solid, a.x, a.z, Infinity, 0))
            .filter((height) => height !== null),
          support = contacts.length ? Math.max(...contacts) : null,
          camera = g.cameraSurfaces.entry(a, b, 0) * 13;
        if (hit) {
          assert(support !== null);
          assert(Math.abs(hit.point.y - support) < 2e-5);
          assert(
            Math.abs(camera - hit.distance) < 2e-5,
            `roof ${gate.stage} ${dx}/${dz}: camera ${camera}, render ${hit.distance}, hitY ${hit.point.y - c.y}`,
          );
          surfaces++;
        } else {
          assert(support === null || support < c.y + 7);
          assert.equal(camera, 13);
          voids++;
        }
      }
  }
  assert(surfaces > 150 && voids > 150);
  assert.equal(surfaces + voids, 693);
  t.diagnostic(`${surfaces} roof surfaces and ${voids} open sky rays`);
});

test("delivered roof and crown bounds clear both shutter descent and counterweight travel", (t) => {
  const g = fixture(t);
  let poses = 0;
  for (const gate of g.fieldGates) {
    const construction = parts(gate.solarSanctuary).filter((p) =>
      /roof|vault|canopy|corbel course|entrance/.test(p.kind),
    );
    for (let i = 0; i <= 32; i++) {
      gate.amount = i / 32;
      updateSanctuaryGate(g, gate, 0);
      g.world.updateMatrixWorld(true);
      for (const actor of [gate.door, ...gate.weights]) {
        const moving = new T.Box3().setFromObject(actor);
        for (const part of construction)
          assert(
            !part.bounds.intersectsBox(moving),
            `${gate.stage}/${part.kind} overlaps moving shutter or weight at ${i}/32`,
          );
      }
      poses++;
    }
  }
  assert.equal(poses, 297);
});

function bearings(g) {
  const up = new T.Raycaster(),
    down = new T.Raycaster(),
    failures = [];
  let contacts = 0;
  for (const gate of g.fieldGates) {
    const r = gate.solarSanctuary,
      c = gate.root.position,
      old = [];
    gate.root.traverse((o) => {
      if (o.isMesh && !o.geometry.attributes.solarSanctuaryPart) old.push(o);
    });
    for (const side of [-1, 1])
      for (const dz of [-5.4, -4.8, -3.4, -1.9, 0, 2.4, 3.6, 4.8, 5.3]) {
        const x = c.x + side * 6.4,
          z = c.z + dz;
        up.set(new T.Vector3(x, c.y + 7.1, z), new T.Vector3(0, 1, 0));
        up.far = 0.4;
        const lower = up.intersectObject(r.root, true)[0];
        if (!lower) continue;
        let support = -Infinity;
        // A bonded roof can bridge a narrow coping joint. Inspect nearby real
        // stone inside the bearing, rather than requiring mortar to carry it.
        for (const offset of [-0.06, 0, 0.06]) {
          down.set(
            new T.Vector3(x, c.y + 7.35, z + offset),
            new T.Vector3(0, -1, 0),
          );
          down.far = 0.5;
          const hit = down.intersectObjects(old)[0];
          if (hit) support = Math.max(support, hit.point.y);
        }
        const gap = lower.point.y - support;
        if (!Number.isFinite(gap) || gap > 0.001 || gap < -0.03)
          failures.push({ stage: gate.stage, side, dz, gap });
        contacts++;
      }
  }
  return { contacts, failures };
}

test("roof springs and corbels bear on delivered coping, with a raised-structure negative control", (t) => {
  const g = fixture(t),
    survey = bearings(g);
  assert(survey.contacts > 60);
  assert.deepEqual(survey.failures, []);
  const roof = g.fieldGates[2].solarSanctuary.root;
  roof.position.y += 0.1;
  g.world.updateMatrixWorld(true);
  try {
    assert(bearings(g).failures.some((f) => f.stage === 2 && f.gap > 0.08));
  } finally {
    roof.position.y -= 0.1;
    g.world.updateMatrixWorld(true);
  }
  t.diagnostic(`${survey.contacts} independent roof/coping bearing contacts`);
});

test("roof landings retain a clear body on flat beams and the sloping noon roof", (t) => {
  const g = fixture(t),
    ray = new T.Raycaster(),
    points = [
      [0, -3.4],
      [0, -3.9],
      [0, 0],
      [4, 0],
      [0, -0.4],
      [-4.5, 0],
      [6.25, 0],
      [3.2, 0],
      [4.9, 0],
    ];
  for (const gate of g.fieldGates) {
    const c = gate.root.position,
      [dx, dz] = points[gate.stage],
      x = c.x + dx,
      z = c.z + dz;
    ray.set(new T.Vector3(x, c.y + 20, z), new T.Vector3(0, -1, 0));
    ray.far = 14;
    const hit = ray.intersectObject(gate.solarSanctuary.root, true)[0];
    assert(hit);
    const start = hit.point.clone().add(new T.Vector3(0, 2.3, 0));
    g.player.position.copy(start);
    g.jumpY = start.y - g.groundHeight(x, z);
    g.grounded = false;
    g.velocityY = 0;
    g.airVelocity = null;
    for (let i = 0; i < 180; i++) advanceCharacter(g, new T.Vector3(), 1 / 60);
    assert(
      g.grounded && g.player.position.y > c.y + 7,
      `roof landing ${gate.stage}: ${g.player.position.toArray()}`,
    );
    assert(
      g.canMove(g.player.position.x, g.player.position.z, g.jumpY),
      `roof body ${gate.stage}`,
    );
    assert(
      Math.hypot(g.player.position.x - x, g.player.position.z - z) < 1e-5,
      `roof landing preserves ${gate.stage} position`,
    );
    if (gate.stage === 3)
      assert(
        Math.abs(g.player.position.y - hit.point.y) < 1e-5,
        "the sloping roof retains its real root floor",
      );
  }
});

// Read the new roof and retained coping from their delivered draw coordinates.
// An earlier apse cap cut through the coping and exposed narrow fragments.
test("the rear apse roof clears retained coping without exposing stone seams", (t) => {
  const g = fixture(t),
    gate = g.fieldGates[6],
    exterior = gate.solarExterior,
    inverse = gate.root.matrixWorld.clone().invert(),
    roofFaces = [],
    oldFaces = [];
  let cap = -Infinity;
  const local = (mesh, p, i) =>
    new T.Vector3()
      .fromBufferAttribute(p, i)
      .applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse);
  exterior.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const { position: p, solarExteriorPart: id } = mesh.geometry.attributes;
    for (let i = 0; i < p.count; i++)
      if (id.getX(i) === 0) cap = Math.max(cap, local(mesh, p, i).y);
  });
  exterior.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const { position: p, solarExteriorPart: id } = mesh.geometry.attributes;
    for (let i = 0; i < p.count; i += 3) {
      if (id.getX(i) !== 0) continue;
      const q = [0, 1, 2].map((j) => local(mesh, p, i + j));
      if (q.every((v) => Math.abs(v.y - cap) < 1e-5)) roofFaces.push(q);
    }
  });
  gate.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (let p = mesh; p; p = p.parent) if (p === exterior.root) return;
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3)
      oldFaces.push(
        [0, 1, 2].map((j) => local(mesh, p, index ? index.getX(i + j) : i + j)),
      );
  });
  assert(roofFaces.length >= 5, "actual polygonal roof triangles");
  const cutsAt = (y) => {
    const triangles = roofFaces.map(
      (q) => new T.Triangle(...q.map((v) => new T.Vector3(v.x, y, v.z))),
    );
    let cuts = 0;
    for (const q of oldFaces)
      for (let k = 0; k < 3; k++) {
        const a = q[k],
          b = q[(k + 1) % 3];
        if ((a.y - y) * (b.y - y) >= 0) continue;
        const p = a.clone().lerp(b, (y - a.y) / (b.y - a.y));
        if (triangles.some((t) => t.containsPoint(p))) cuts++;
      }
    return cuts;
  };
  const ray = new T.Raycaster();
  let covered = 0;
  for (const q of oldFaces) {
    if (
      !q.every(
        (p) =>
          p.y >= 6.99 &&
          p.y <= 7.28 &&
          Math.abs(p.x) <= 6.7 &&
          p.z >= -7.03 &&
          p.z <= -5.97,
      )
    )
      continue;
    for (const point of q) {
      const target = gate.root.localToWorld(point.clone()),
        from = target.clone().add(new T.Vector3(0, 0, 2));
      ray.set(from, new T.Vector3(0, 0, -1));
      ray.near = 0;
      ray.far = 2;
      const hit = ray.intersectObject(exterior.root, true)[0];
      assert(
        hit && hit.distance < 1.98,
        "the retained coping must be enclosed behind the new architrave",
      );
      covered++;
    }
  }
  assert(covered > 100, "sample actual retained coping faces");
  assert.equal(cutsAt(cap), 0, "retained coping cannot slice through the roof");
  assert(
    cutsAt(7.12) > 0,
    "the preceding cap height reproduces the exposed seams",
  );
});
