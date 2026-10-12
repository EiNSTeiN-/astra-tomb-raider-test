import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import { safeArrival, supportAt } from "../src/character-motion.js";
import { TriangleSolids } from "../src/triangle-solids.js";
import { toggleCrouch } from "../src/stealth.js";
import { buildFieldGates } from "../src/field-world.js";
import {
  buildResonanceCourts,
  updateResonanceCourts,
} from "../src/resonance-courts.js";
import {
  RESONATOR_FRAMES,
  resonatorStaveGeometry,
  resonatorFootingGeometry,
} from "../src/resonator-frames.js";

function closed(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position,
    edges = new Map();
  let volume = 0,
    faces = 0;
  const key = (v) =>
    v
      .toArray()
      .map((n) => n.toFixed(5))
      .join(",");
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(p, i + j),
    );
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-14) continue;
    volume += a.dot(b.clone().cross(c)) / 6;
    faces++;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const e = [key(u), key(v)].sort().join("|");
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  assert(volume > 0, "outward closed casting");
  assert(
    [...edges.values()].every((n) => n === 2),
    "no open seam or cap",
  );
  if (g !== geometry) g.dispose();
  return faces;
}

test("all eight frame families have closed finite staves and capped terrain footings", () => {
  assert.equal(new Set(RESONATOR_FRAMES.map((s) => s.name)).size, 8);
  assert.equal(new Set(RESONATOR_FRAMES.map((s) => JSON.stringify(s))).size, 8);
  for (const style of RESONATOR_FRAMES)
    for (const g of [
      resonatorStaveGeometry(style.angles[0], style.height),
      resonatorFootingGeometry(style, -0.4),
    ]) {
      try {
        assert(g.attributes.position.array.every(Number.isFinite));
        assert(g.attributes.normal.array.every(Number.isFinite));
        assert(closed(g) > 20);
      } finally {
        g.dispose();
      }
    }
});

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ fillText() {}, clearRect() {} }),
    }),
  };
  t.after(() => (globalThis.document = previous));
  const level = LEVELS[6],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    items: map.features.filter((f) => f.type === "mechanism"),
    obstacles: [],
    progress: { completed: true, stage: 8, field: [] },
    player: new THREE.Group(),
    elapsed: 0,
    darkMat: new THREE.MeshStandardMaterial(),
    goldMat: new THREE.MeshStandardMaterial(),
    glowMat: new THREE.MeshStandardMaterial(),
    cameraSurfaces: new CameraSurfaces(world),
    audio: { noiseHit() {} },
    sense: 0,
  });
  game.cavernProfile = createCavernProfile(map, terrainProfile);
  for (const f of game.items) {
    f.group = new THREE.Group();
    f.group.position.set(f.x * 7, game.groundHeight(f.x * 7, f.z * 7), f.z * 7);
    world.add(f.group);
    f.core = new THREE.Object3D();
    f.group.add(f.core);
  }
  buildFieldGates(game);
  buildResonanceCourts(game);
  world.updateMatrixWorld(true);
  const geos = new Set(),
    mats = new Set(),
    textures = new Set();
  world.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      mats.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  t.after(() => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const tx of textures) tx.dispose();
  });
  return game;
}

test("33 delivered frames retain buried foundations, turning clearance, mounted plates and legal controls", (t) => {
  const game = fixture(t),
    point = new THREE.Vector3(),
    ray = new THREE.Raycaster();
  let roots = 0,
    footingQueries = 0,
    turningSections = 0,
    vertices = 0,
    sourceTriangles = 0,
    bytes = 0;
  let legContacts = 0;
  for (const site of game.resonanceSites)
    for (const n of site.nodes) {
      roots++;
      assert.equal(n.frame.style, RESONATOR_FRAMES[site.stage]);
      for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI) / 32,
          x = n.center.x + Math.cos(a) * 1.1,
          z = n.center.z + Math.sin(a) * 1.1;
        assert(
          n.center.y + n.frame.bottom <= game.groundHeight(x, z) - 0.1799,
          "buried outer footing",
        );
        footingQueries++;
      }
      const frameMeshes = n.frame.root.children;
      const style = n.frame.style;
      if (style.steps) {
        const tips = style.angles.map((angle) => {
          ray.set(
            n.center
              .clone()
              .add(
                new THREE.Vector3(
                  Math.cos(angle) * 0.78,
                  8,
                  -Math.sin(angle) * 0.78,
                ),
              ),
            new THREE.Vector3(0, -1, 0),
          );
          ray.far = Infinity;
          const hit = ray.intersectObjects(frameMeshes, false)[0];
          assert(hit, "a stepped stave has a delivered top surface");
          return Math.round((hit.point.y - n.center.y) * 1000);
        });
        assert.equal(
          new Set(tips).size,
          3,
          "the ascending frame must have three distinct tip heights",
        );
      }
      if (style.hood || style.arch || style.crossed)
        for (const side of [-1, 1]) {
          if (style.hood && side === 1) continue;
          for (const sign of [-1, 1]) {
            const x = n.center.x + (style.crossed ? side * 0.84 : sign * 0.825),
              z = n.center.z + (style.crossed ? sign * 0.825 : side * 0.84),
              floor = game.groundHeight(x, z);
            ray.set(
              new THREE.Vector3(x, floor - 2, z),
              new THREE.Vector3(0, 1, 0),
            );
            ray.far = Infinity;
            const contacts = ray.intersectObjects(frameMeshes, false);
            assert(
              contacts.length,
              "delivered hoop leg has a closed buried end",
            );
            assert(
              contacts[0].point.y <= floor - 0.17,
              "a hoop leg cannot hover above its sloping floor",
            );
            legContacts++;
          }
        }
      for (const mesh of frameMeshes) {
        const g = mesh.geometry,
          p = g.attributes.position;
        sourceTriangles += (g.index?.count ?? p.count) / 3;
        for (const a of Object.values(g.attributes))
          bytes += a.array.byteLength;
        bytes += g.index?.array.byteLength ?? 0;
        for (let i = 0; i < p.count; i++) {
          point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          assert(point.y < game.cavernProfile.height(point.x, point.z) - 0.1);
          vertices++;
        }
        const indices = g.index?.array;
        for (const y of [1.35, 1.43, 1.51])
          for (let i = 0; i < (indices?.length ?? p.count); i += 3) {
            const vs = [0, 1, 2].map((j) =>
              new THREE.Vector3().fromBufferAttribute(
                p,
                indices ? indices[i + j] : i + j,
              ),
            );
            const cut = [];
            for (let j = 0; j < 3; j++) {
              const a = vs[j],
                b = vs[(j + 1) % 3];
              if ((a.y < y && b.y > y) || (a.y > y && b.y < y))
                cut.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
              if (Math.abs(a.y - y) < 1e-7) cut.push(a.clone());
            }
            if (!cut.length) continue;
            for (const v of cut)
              assert(
                Math.hypot(v.x, v.z) > 1.095,
                "casting enters turning collar",
              );
            for (let j = 1; j < cut.length; j++) {
              const a = cut[0],
                b = cut[j],
                dx = b.x - a.x,
                dz = b.z - a.z,
                s = Math.max(
                  0,
                  Math.min(
                    1,
                    -(a.x * dx + a.z * dz) / (dx * dx + dz * dz || 1),
                  ),
                );
              assert(
                Math.hypot(a.x + s * dx, a.z + s * dz) > 1.095,
                "face crosses turning collar",
              );
            }
            turningSections++;
          }
      }
      // Real merged bracket surfaces behind the original backing planes.
      for (const [y, z] of [
        [0.65, 1.23],
        [1.86, 1],
      ])
        for (const x of [-0.5, 0.5]) {
          ray.set(
            n.center.clone().add(new THREE.Vector3(x, y, z + 0.1)),
            new THREE.Vector3(0, 0, -1),
          );
          ray.far = 0.5;
          assert(
            ray.intersectObjects(frameMeshes, false).length > 0,
            "plate bracket detached",
          );
        }
      ray.set(
        n.center.clone().add(new THREE.Vector3(0, 1.07, 1.4)),
        new THREE.Vector3(0, 0, -1),
      );
      ray.far = 0.7;
      assert(
        ray.intersectObjects(frameMeshes, false).length > 0,
        "missing wheel shaft",
      );
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12])
          assert(
            game.canMove(
              n.control.group.position.x + dx,
              n.control.group.position.z + dz,
              0,
            ),
            "operator position obstructed",
          );
    }
  assert.equal(roots, 33);
  assert(turningSections > 100);
  game.cameraSurfaces.rebuild();
  t.diagnostic(
    `${vertices} delivered frame vertices; ${footingQueries} buried rim queries; ${legContacts} rooted hoop legs; ${turningSections} turning-plane triangle sections; ${sourceTriangles} frame triangles, ${bytes} geometry-array bytes (footings counted separately)`,
  );
});

test("short guide-light castings stop the camera outside the preceding central proxy", (t) => {
  const game = fixture(t),
    node = game.resonanceSites[0].nodes[0],
    angle = node.frame.style.angles[0],
    point = (radius) =>
      node.center
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            1.43,
            -Math.sin(angle) * radius,
          ),
        ),
    from = point(1.6),
    to = point(1.15),
    entries = game.cameraSurfaces.pending;
  game.player.position.copy(node.control.group.position);
  updateResonanceCourts(game, 0);
  game.cameraSurfaces.pending = entries.filter(
    (e) => e.parent !== node.frame.root,
  );
  game.cameraSurfaces.rebuild();
  assert.equal(
    game.cameraSurfaces.entry(from, to, 0.005),
    1,
    "the old proxy leaves this short casting unprotected",
  );
  game.cameraSurfaces.pending = entries;
  game.cameraSurfaces.rebuild();
  assert(
    game.cameraSurfaces.entry(from, to, 0.005) < 1,
    "the delivered small-casting bounds stop the lens",
  );
});

test("physical hardware rejects the reproduced base-rim intrusion while retaining every working margin", (t) => {
  const game = fixture(t),
    node = game.resonanceSites[0].nodes[0],
    x = node.center.x,
    z = node.center.z + 1.3,
    obstacles = game.obstacles;
  game.obstacles = obstacles.filter((o) => !o.resonanceHardware);
  assert.equal(
    game.canMove(x, z, 0),
    true,
    "preceding centre box admits the unsafe rim",
  );
  game.obstacles = obstacles;
  assert.equal(
    game.canMove(x, z, 0),
    false,
    "delivered triangle hardware closes the intrusion",
  );
  const oldPosition = { x, y: game.groundHeight(x, z), z },
    recovered = safeArrival(game, oldPosition);
  assert(recovered, "an older occupied save finds a nearby clear arrival");
  assert(Math.hypot(recovered.x - x, recovered.z - z) <= 2.25);
  assert.equal(recovered.y, game.groundHeight(recovered.x, recovered.z));
  assert(game.canMove(recovered.x, recovered.z, 0));
  assert.deepEqual(oldPosition, { x, y: game.groundHeight(x, z), z });
  for (const site of game.resonanceSites)
    for (const f of [site.tablet, ...site.nodes.map((n) => n.control)])
      for (const dx of [-0.12, 0, 0.12])
        for (const dz of [-0.12, 0, 0.12])
          assert(
            game.canMove(f.group.position.x + dx, f.group.position.z + dz, 0),
            f.id,
          );
  for (const site of game.resonanceSites)
    for (const n of site.nodes) {
      const p = n.control.group.position;
      assert.equal(
        supportAt(game, p.x, p.z, Infinity, 0.35).height,
        game.groundHeight(p.x, p.z),
        "a nearby footing must not lift the operator onto an absent surface",
      );
    }
  const footingMeshes = [];
  game.resonanceSites[5].root.traverse((m) => {
    if (m.material?.name === "Dressed resonance limestone")
      footingMeshes.push({ geometry: m.geometry, matrices: [m.matrixWorld] });
  });
  const footing = new TriangleSolids(footingMeshes);
  for (const [x, y, z] of [
    [66.96315277571983, 15.026602193974869, 312.22115471316107],
    [66.95127522379461, 15.031747484179439, 312.2175199543486],
    [66.9214434843546, 15.04224025636886, 312.21397737828306],
    [66.93336546573683, 14.98865926658165, 312.2090843622429],
    [66.94664722722564, 14.988016667530092, 312.21116410444364],
  ])
    assert.equal(
      footing.blocked(x, y, z, 0, 0),
      false,
      "the reproduced crouched records clear the narrower dressed shoulder",
    );
  const slopedNode = game.resonanceSites[5].nodes[0],
    standingRadius = Array.from(
      { length: 141 },
      (_, i) => 1.4 + i * 0.005,
    ).find((r) =>
      game.canMove(slopedNode.center.x, slopedNode.center.z + r, 0),
    );
  assert(standingRadius !== undefined);
  game.grounded = true;
  t.diagnostic(
    `reproduced standing edge: front radius ${standingRadius.toFixed(3)} m`,
  );
  game.player.position.set(
    slopedNode.center.x,
    game.groundHeight(
      slopedNode.center.x,
      slopedNode.center.z + standingRadius,
    ),
    slopedNode.center.z + standingRadius,
  );
  assert.equal(
    toggleCrouch(game),
    false,
    "a standing edge rejects an overlapping crouch",
  );
  game.rig = { crouchBlend: 0.5 };
  assert.equal(
    game.canMove(game.player.position.x, game.player.position.z, 0),
    false,
    "standing up retains the larger margin while the crouched pose fades",
  );
  game.rig.crouchBlend = 0;
  assert(game.canMove(game.player.position.x, game.player.position.z, 0));
  for (const site of game.resonanceSites)
    for (const n of site.nodes) {
      game.player.position.copy(n.control.group.position);
      assert.equal(
        toggleCrouch(game),
        true,
        `crouched working stance ${n.control.id}`,
      );
      assert(game.canMove(game.player.position.x, game.player.position.z, 0));
      toggleCrouch(game);
    }
});
