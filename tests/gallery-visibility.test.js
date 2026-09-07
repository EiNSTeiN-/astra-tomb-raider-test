import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { WaterReflection } from "../src/water-reflection.js";
import {
  GalleryVisibility,
  galleryFootprint,
  galleryPortalVisible,
  galleryExteriorVisible,
} from "../src/gallery-visibility.js";

const terrainProfile = createTerrainProfile(createMap(LEVELS[3]), LEVELS[3]);
const profile = terrainProfile.gallery,
  origin = profile.origin;

test("gallery aperture visibility retains the entry and narrow corner views but rejects enclosed chambers", () => {
  const footprint = galleryFootprint(profile);
  const visible = (x, z) =>
    galleryPortalVisible(footprint, { x: origin.x + x, z: origin.z + z });
  for (const [x, z] of [
    [-4, 0],
    [-29, 0],
    [-8.5, 8],
  ])
    assert(visible(x, z), `${x},${z}`);
  for (const [x, z] of [
    [-29, 12],
    [-29, 25],
    [-8, 34],
    [-8, 48],
    [-7, 19],
  ])
    assert.equal(visible(x, z), false, `${x},${z}`);
  // In the return passage a tiny part of the opposite entrance edge remains
  // visible up to this analytically derived corner alignment, then disappears.
  const x = -8.5,
    corner = 2.5 + (5 * (-5 - x)) / 3;
  assert(visible(x, corner - 0.001), "retain a 1 mm corner sliver");
  assert.equal(visible(x, corner + 0.001), false);
  assert(
    galleryExteriorVisible(footprint, {
      x: origin.x + x,
      z: origin.z + corner + 0.001,
    }),
    "retain the shading guard just behind an entrance corner",
  );
  assert.equal(
    visible(-2, 48),
    true,
    "parallel aperture plane takes the conservative path",
  );
});

function visibilityGame() {
  const scene = new THREE.Scene(),
    exterior = new THREE.Group(),
    hidden = new THREE.Group();
  hidden.visible = false;
  const sun = new THREE.DirectionalLight();
  const player = new THREE.Group(),
    gallery = new THREE.Group(),
    particles = new THREE.Points();
  const lampPost = new THREE.Group(),
    lamp = new THREE.PointLight(),
    lampStand = new THREE.Group();
  lampPost.add(lamp, lampStand);
  const sea = new THREE.Group();
  sea.userData.sea = true;
  scene.add(exterior, hidden, sun, player, gallery, particles, lampPost, sea);
  const game = {
    scene,
    terrainProfile,
    player,
    particles,
    waterMeshes: [sea],
    camera: new THREE.PerspectiveCamera(),
    sunkenGallery: { profile, root: gallery },
    renderer: {
      shadowMap: {
        enabled: true,
        autoUpdate: true,
        needsUpdate: false,
        render() {
          assert(exterior.visible && lampStand.visible);
          assert.equal(hidden.visible, false);
        },
      },
    },
  };
  game.camera.position.set(origin.x - 29, origin.y - 2, origin.z + 12);
  return {
    game,
    exterior,
    hidden,
    sun,
    player,
    gallery,
    particles,
    lampPost,
    lampStand,
    lamp,
    sea,
  };
}

test("interior culling preserves every light and actor, restores exterior shadow casters, and leaves live visibility intact", () => {
  const world = visibilityGame(),
    { game, exterior, hidden, lampStand } = world;
  const culling = new GalleryVisibility(game),
    original = game.renderer.shadowMap.render;
  const assertCulled = () => {
    assert.equal(exterior.visible, false);
    assert.equal(lampStand.visible, false);
    assert.equal(hidden.visible, false);
    for (const key of [
      "sun",
      "player",
      "gallery",
      "particles",
      "lampPost",
      "lamp",
      "sea",
    ])
      assert(world[key].visible, key);
  };
  assert.equal(
    culling.render(() => {
      assertCulled();
      game.renderer.shadowMap.render();
      assertCulled();
      return 7;
    }),
    7,
  );
  assert(exterior.visible && lampStand.visible);
  assert.equal(hidden.visible, false);
  assert.equal(game.renderer.shadowMap.render, original);
  // New effects and changes to an existing effect are evaluated at the next draw.
  const late = new THREE.Group();
  game.scene.add(late);
  exterior.visible = false;
  culling.render(() => {
    assert.equal(late.visible, false);
    assert.equal(exterior.visible, false);
  });
  assert(late.visible);
  assert.equal(exterior.visible, false);
  // The gallery footprint must not cull the palace directly above it.
  game.camera.position.y = origin.y + 2;
  culling.render(() => {
    assert(late.visible && lampStand.visible);
    assert.equal(game.renderer.shadowMap.render, original);
  });
  assert.equal(culling.culled, false);
  game.camera.position.set(origin.x - 4, origin.y - 3, origin.z);
  culling.render(() => assert(late.visible));
  assert.equal(culling.culled, false);
});

test("an enclosed gallery clears exterior reflection weights without issuing a capture", () => {
  const weight = { value: 1 };
  const water = {
    material: { userData: { waterUniforms: { mirrorWeight: weight } } },
  };
  const reflection = Object.assign(Object.create(WaterReflection.prototype), {
    game: { waterMeshes: [water] },
    frame: 0,
    captures: 4,
    selected: water,
  });
  // No renderer/camera exists in this fixture: the suppressed reflection must
  // not select or render an external plane, even if one was previously active.
  reflection.render(true);
  assert.equal(weight.value, 0);
  assert.equal(reflection.selected, null);
  assert.equal(reflection.captures, 4);
});

test("failed scene or shadow draws restore culling state, and a contact pass does not expose exterior meshes", () => {
  for (const failure of ["scene", "shadow"]) {
    const { game, exterior, hidden } = visibilityGame();
    const shadows = game.renderer.shadowMap;
    if (failure === "shadow")
      shadows.render = () => {
        assert(exterior.visible);
        throw new Error("shadow failed");
      };
    const original = shadows.render,
      culling = new GalleryVisibility(game);
    assert.throws(
      () =>
        culling.render(() => {
          assert.equal(exterior.visible, false);
          if (failure === "shadow") shadows.render();
          throw new Error("scene failed");
        }),
      /failed/,
    );
    assert(exterior.visible);
    assert.equal(hidden.visible, false);
    assert.equal(shadows.render, original);
  }
  const { game, exterior } = visibilityGame(),
    shadows = game.renderer.shadowMap;
  shadows.autoUpdate = false;
  shadows.render = () => assert.equal(exterior.visible, false);
  new GalleryVisibility(game).render(() => shadows.render());
  assert(exterior.visible);
  assert.equal(shadows.autoUpdate, false);
  assert.equal(shadows.needsUpdate, false);
});
