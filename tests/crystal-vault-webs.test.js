import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { createCavernProfile } from "../src/cavern-profile.js";
import { Adventure } from "../src/game.js";
import { buildFieldGates } from "../src/field-world.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  crystalWebCells,
  crystalWebGeometry,
} from "../src/crystal-vault-webs.js";

test("every dressed vault cell and its mortar bed has closed outward finite triangles", (t) => {
  let blocks = 0,
    triangles = 0;
  for (let stage = 0; stage < 8; stage++)
    for (const cell of crystalWebCells(stage))
      for (const dressed of [false, true]) {
        const geometry = crystalWebGeometry(cell, dressed),
          p = geometry.attributes.position;
        try {
          for (const attribute of Object.values(geometry.attributes))
            assert(attribute.array.every(Number.isFinite));
          const edges = new Map();
          let volume = 0;
          for (let i = 0; i < p.count; i += 3) {
            const vertices = [0, 1, 2].map((j) =>
              new T.Vector3().fromBufferAttribute(p, i + j),
            );
            const area = vertices[1]
              .clone()
              .sub(vertices[0])
              .cross(vertices[2].clone().sub(vertices[0]));
            assert(
              area.length() > 1e-9,
              `degenerate block ${stage}/${cell.row}/${cell.col}`,
            );
            volume +=
              vertices[0].dot(vertices[1].clone().cross(vertices[2])) / 6;
            for (let j = 0; j < 3; j++) {
              const key = [vertices[j], vertices[(j + 1) % 3]]
                .map((v) =>
                  v
                    .toArray()
                    .map((n) => n.toFixed(5))
                    .join(","),
                )
                .sort()
                .join("|");
              edges.set(key, (edges.get(key) || 0) + 1);
            }
            triangles++;
          }
          assert(
            volume > 1e-7,
            `inward block ${stage}/${cell.row}/${cell.col}`,
          );
          assert(
            [...edges.values()].every((n) => n === 2),
            `open block ${stage}/${cell.row}/${cell.col}`,
          );
          blocks++;
        } finally {
          geometry.dispose();
        }
      }
  assert(blocks > 2000);
  t.diagnostic(`${blocks} closed blocks; ${triangles} outward triangles`);
});

test("assembled roof beds seal dressed joints, preserve intended openings and retain working-floor movement", (t) => {
  t.mock.method(T.TextureLoader.prototype, "load", () => new T.Texture());
  const level = LEVELS[6],
    map = createMap(level),
    profile = createTerrainProfile(map, level),
    world = new T.Group();
  const g = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile: profile,
    world,
    obstacles: [],
    items: map.features.filter((f) => f.type === "mechanism"),
    progress: { completed: true, stage: 8, field: [] },
    elapsed: 0,
    player: new T.Group(),
    audio: { noiseHit() {} },
    cameraSurfaces: new CameraSurfaces(world),
  });
  g.cavernProfile = createCavernProfile(map, profile);
  buildFieldGates(g);
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
  const ray = new T.Raycaster(),
    a = new T.Vector3(),
    b = new T.Vector3(),
    all = g.obstacles,
    without = all.filter((o) => !o.crystalWeb);
  let coverage = 0,
    queries = 0,
    vertices = 0,
    openings = 0;
  for (const gate of g.fieldGates) {
    const web = gate.vaultWeb,
      origin = gate.root.position;
    assert.equal(web.root.children.length, 1);
    assert(web.solid.supportable);
    for (const mesh of web.root.children) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        assert(
          a.y < g.cavernProfile.height(a.x, a.z) - 0.1,
          "roof enters cavern",
        );
        vertices++;
      }
    }
    const hits = (x, z) => {
      a.set(origin.x + x, origin.y + 3, origin.z + z);
      ray.set(a, new T.Vector3(0, 1, 0));
      return ray.intersectObject(web.root, true);
    };
    for (let x = -5.91; x < 6; x += 0.43)
      for (let z = -6.39; z < (gate.stage === 0 ? -1.4 : 5.4); z += 0.47) {
        if (gate.stage === 5 && x < -0.5 && z < 0.5) continue;
        if (gate.stage === 7 && Math.abs(x) < 0.6 && Math.abs(z) < 0.6)
          continue;
        const hit = hits(x, z)[0];
        assert(hit, `unsealed roof ${gate.stage}/${x}/${z}`);
        b.copy(a).y = origin.y + 17;
        const fraction = web.solid.triangles.entry(a, b);
        assert(fraction !== null);
        assert(
          Math.abs(fraction * a.distanceTo(b) - hit.distance) < 0.002,
          "physical/render roof mismatch",
        );
        const camera = web.root.children[0].userData.cameraKernel.entry(
          a.clone().sub(origin),
          b.clone().sub(origin),
          0,
        );
        assert(camera !== null);
        assert(
          Math.abs(camera * a.distanceTo(b) - hit.distance) < 0.002,
          "camera/render roof mismatch",
        );
        coverage++;
      }
    for (const [x, z] of gate.stage === 0
      ? [[0, 2]]
      : gate.stage === 5
        ? [[-4, -4]]
        : gate.stage === 7
          ? [
              [0, 0],
              [0.3, 0.3],
            ]
          : []) {
      assert.equal(hits(x, z).length, 0, "intentional roof opening sealed");
      assert.equal(
        web.root.children[0].userData.cameraKernel.entry(
          new T.Vector3(x, 3, z),
          new T.Vector3(x, 17, z),
          0,
        ),
        null,
      );
      openings++;
    }
    for (let x = -5.7; x < 6; x += 0.8)
      for (let z = -5.7; z < 6; z += 0.8)
        for (const jump of [0, 1.2, 2.8]) {
          const px = origin.x + x,
            pz = origin.z + z;
          g.obstacles = without;
          const before = g.canMove(px, pz, jump);
          g.obstacles = all;
          assert.equal(
            g.canMove(px, pz, jump),
            before,
            `working body changed ${gate.stage}/${x}/${z}/${jump}`,
          );
          queries++;
        }
  }
  assert(
    coverage > 3000 && queries > 5000 && vertices > 100000 && openings === 4,
  );
  g.cameraSurfaces.rebuild();
  assert(g.cameraSurfaces.count > 0);
  for (const gate of g.fieldGates) {
    const mesh = gate.vaultWeb.root.children[0],
      kernel = mesh.userData.cameraKernel;
    assert(kernel.grid.size > 0);
    mesh.geometry.dispose();
    assert.equal(kernel.grid.size, 0, "retired roof camera cells retained");
  }
  t.diagnostic(
    `${coverage} sealed render/physical roof rays; ${queries} retained body queries; ${vertices} roof vertices below cavern; ${openings} open porch/breach/lantern rays`,
  );
});
