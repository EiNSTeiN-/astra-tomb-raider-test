import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { Adventure } from "../src/game.js";
import { createTerrainProfile } from "../src/terrain.js";
import { advanceCharacter } from "../src/character-motion.js";
import { stationSupport, stationBlocked } from "../src/field-station-solids.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  buildDesertArchitecture,
  updateDesertArchitecture,
} from "../src/desert-architecture.js";
import {
  inspectDesertCrowns,
  inspectCrownApertures,
} from "../scripts/inspect-desert-crowns-browser.js";

function fixture(t) {
  t.mock.method(
    THREE.TextureLoader.prototype,
    "load",
    () => new THREE.Texture(),
  );
  const level = LEVELS[1],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group();
  const game = Object.assign(Object.create(Adventure.prototype), {
    level,
    map,
    terrainProfile,
    world,
    obstacles: [],
    cameraSurfaces: new CameraSurfaces(world),
    store: { data: { settings: { quality: "high" } } },
    player: { position: new THREE.Vector3() },
  });
  buildDesertArchitecture(game);
  game.cameraSurfaces.rebuild();
  t.after(() => {
    const resources = new Set();
    world.traverse((m) => {
      if (m.geometry) resources.add(m.geometry);
      if (m.material) {
        resources.add(m.material);
        for (const v of Object.values(m.material))
          if (v?.isTexture) resources.add(v);
      }
    });
    resources.forEach((r) => r.dispose());
  });
  return game;
}

test("ten delivered crown silhouettes have sealed solids, cornice bearing, joined carving and exact point support", (t) => {
  const g = fixture(t),
    r = inspectDesertCrowns(g);
  assert.equal(r.crowns, 10);
  assert.equal(new Set(r.styles).size, 10);
  assert(r.parts > 200 && r.triangles < 50000);
  assert.equal(r.bearingQueries, 390);
  assert.equal(r.bearingContacts, 390);
  assert(r.contacts > 300 && r.panelQueries > 30000);
  assert.equal(r.supportQueries, 390);
  assert(r.largestSupportError < 0.0001);
  assert.deepEqual(r.failures, []);
  const apertures = inspectCrownApertures(g);
  assert.equal(apertures.voids, 5);
  assert.equal(apertures.stone, 5);
  assert.deepEqual(apertures.failures, []);
  for (const p of g.desertPatches) {
    const c = p.crown;
    assert(c.root.children.length <= 2);
    assert.equal(c.solid.supportRadius, 0);
    assert.equal(c.solid.bodyPadding, 0.72);
    assert(
      g.canMove(c.root.position.x, c.root.position.z, 0),
      "elevated masonry creates no invisible column",
    );
  }
});

test("triangle observer rejects raised crowns, a detached facing course, damaged solid edges and a filled opening", (t) => {
  const g = fixture(t),
    c = g.desertPatches[1].crown;
  c.root.position.y += 0.4;
  c.detail.position.y += 0.4;
  try {
    assert(
      inspectDesertCrowns(g).failures.some(
        (f) => f.kind === "unsupported crown bearing" && f.court === 1,
      ),
    );
  } finally {
    c.root.position.y -= 0.4;
    c.detail.position.y -= 0.4;
  }
  const mesh = c.root.children.find((m) => m.isMesh),
    p = mesh.geometry.attributes.position,
    tag = mesh.geometry.attributes.crownPart,
    id = c.parts.find((p) => p.name === "facing course").id,
    copy = p.array.slice();
  try {
    for (let i = 0; i < p.count; i++)
      if (tag.getX(i) === id) p.setZ(i, p.getZ(i) + 2);
    assert(
      inspectDesertCrowns(g).failures.some(
        (f) => f.court === 1 && f.part === id && f.kind === "unsupported part",
      ),
    );
  } finally {
    p.array.set(copy);
  }
  try {
    p.setX(0, p.getX(0) + 0.03);
    assert(
      inspectDesertCrowns(g).failures.some(
        (f) => f.court === 1 && f.kind === "unsealed or reversed solid",
      ),
    );
  } finally {
    p.array.set(copy);
  }
  const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mesh.material);
  fill.position.set(0, 1.5, 0);
  c.root.add(fill);
  try {
    assert(
      inspectCrownApertures(g).failures.some(
        (f) => f.court === 1 && f.empty && f.visible,
      ),
    );
  } finally {
    c.root.remove(fill);
    fill.geometry.dispose();
  }
  assert.deepEqual(inspectDesertCrowns(g).failures, []);
  assert.deepEqual(inspectCrownApertures(g).failures, []);
});

test("distance and quality cull only crown carving, retaining structure and physical surfaces", (t) => {
  const g = fixture(t);
  for (const quality of ["high", "medium", "low"])
    for (const patch of g.desertPatches) {
      g.store.data.settings.quality = quality;
      const c = patch.crown;
      g.player.position.copy(c.detailBounds.center);
      updateDesertArchitecture(g);
      assert(c.detail.visible);
      g.player.position.set(-500, 0, -500);
      updateDesertArchitecture(g);
      assert(!c.detail.visible);
      assert(c.root.visible);
      assert(g.obstacles.includes(c.solid));
    }
  g.level = LEVELS[0];
  assert.equal(buildDesertArchitecture(g), false);
  assert.deepEqual(g.desertPatches, []);
  assert.deepEqual(g.desertBirdPerches, {});
});

test("a crown's lower base remains supported below its roof and departures clear both edges", (t) => {
  const art = fixture(t),
    crown = art.desertPatches[6].crown,
    solid = crown.solid,
    x = crown.root.position.x,
    z = crown.root.position.z,
    ray = new THREE.Raycaster(
      new THREE.Vector3(x, crown.root.position.y + 1.5, z),
      new THREE.Vector3(0, -1, 0),
    ),
    top = ray.intersectObjects(crown.root.children, false)[0]?.point.y;
  assert(Number.isFinite(top));
  assert(solid.bounds.max.y > top + 3);
  assert(Math.abs(stationSupport(solid, x, z, top + 0.05) - top) < 0.0001);
  assert(
    Math.abs(stationSupport(solid, x, z, top + 0.05, 0.55) - top) < 0.0001,
  );
  solid.triangles.layeredSupport = false;
  try {
    assert.equal(
      stationSupport(solid, x, z, top + 0.05),
      null,
      "the previous highest-face query skips the rendered lower base",
    );
  } finally {
    solid.triangles.layeredSupport = true;
  }
  for (const direction of [-1, 1]) {
    const g = {
      obstacles: [solid],
      player: new THREE.Group(),
      groundHeight: () => 0,
      grounded: true,
      jumpY: top,
      velocityY: 0,
      audio: { tone() {} },
    };
    g.canMove = (px, pz, y) => !stationBlocked(solid, px, y, pz, 2.1);
    g.player.position.set(x, top, z);
    for (let frame = 0; frame < 210; frame++) {
      advanceCharacter(g, { x: 0, z: direction * 4 }, 1 / 60);
      assert(
        g.canMove(
          g.player.position.x,
          g.player.position.z,
          g.player.position.y,
        ),
        `clear standing/falling body at ${direction}/${frame}`,
      );
    }
    assert(g.grounded && g.jumpY === 0);
    assert(Math.abs(g.player.position.z - z) > 8);
  }
});
