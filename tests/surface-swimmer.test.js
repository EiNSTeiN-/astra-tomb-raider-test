import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { animateExplorer } from "../src/explorer.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  buildTideArchive,
  updateTideArchive,
  archiveInteract,
} from "../src/tide-archive.js";
import { stationBlocked } from "../src/field-station-solids.js";
import { canSwimAt, recoverSwimmer } from "../src/swimmer-clearance.js";
import { restoreTraversal } from "../src/traversal.js";
import { waterAt } from "../src/hydrology.js";
import { safeArrival } from "../src/character-motion.js";
import { Adventure } from "../src/game.js";

function cleanup(t, g) {
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const root of [g.world, g.player].filter(Boolean))
      root.traverse((m) => {
        if (m.geometry) geometries.add(m.geometry);
        m.skeleton?.dispose();
        for (const material of [m.material || []].flat()) {
          materials.add(material);
          for (const v of Object.values(material))
            if (v?.isTexture) textures.add(v);
        }
      });
    geometries.forEach((m) => m.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((m) => m.dispose());
  });
}
async function loadSwimmer(g) {
  const io = new NodeIO(),
    document = await io.read(
      new URL("../public/assets/characters/vesper.glb", import.meta.url)
        .pathname,
    );
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  const bytes = await io.writeBinary(document),
    { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    ),
    mixer = new THREE.AnimationMixer(scene),
    actions = {};
  g.avatar.add(scene);
  for (const clip of animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  g.rig = {
    model: scene,
    mixer,
    actions,
    state: "Idle",
    weapon: { group: new THREE.Group() },
  };
}

function fixture(t, real = false) {
  const player = new THREE.Group(),
    avatar = new THREE.Group();
  player.add(avatar);
  const g = {
    player,
    avatar,
    world: new THREE.Group(),
    swimming: true,
    diving: false,
    grounded: false,
    elapsed: 25,
    actualMoveSpeed: 0,
    level: LEVELS[3],
    obstacles: [],
    soundSources: [],
    progress: { archive: [] },
    keys: new Set(),
    audio: { tone() {} },
    cb: { toast() {}, update() {} },
    save() {},
    state() {
      return {};
    },
    groundHeight: () => -5,
  };
  if (real) {
    g.map = createMap(g.level);
    g.terrainProfile = createTerrainProfile(g.map, g.level);
    g.groundHeight = g.terrainProfile.height;
    g.waterMeshes = g.terrainProfile.waters.map((w) => {
      const m = new THREE.Mesh();
      m.position.set(w.x, w.baseY, w.z);
      Object.assign(m.userData, w);
      return m;
    });
    g.stoneMat = new THREE.MeshStandardMaterial();
    g.cameraSurfaces = new CameraSurfaces(g.world);
    for (const name of ["walkable", "canMove"])
      g[name] = Adventure.prototype[name].bind(g);
    buildTideArchive(g);
    g.cameraSurfaces.rebuild();
  }
  cleanup(t, g);
  return g;
}

test("resting surface poses keep the delivered face above wave crests and soles above shallow beds", async (t) => {
  const g = fixture(t);
  await loadSwimmer(g);
  const point = new THREE.Vector3();
  let lowestEye = Infinity,
    lowestSole = Infinity;
  for (const depth of [1.1, 1.3, 1.7, 4])
    for (const slope of [0, 0.12, -0.12]) {
      g.groundHeight = (x, z) => -depth + slope * z;
      g.player.position.set(0, -0.38, 0);
      g.avatar.rotation.y = 0;
      g.rig.bellFloat = undefined;
      g.diving = false;
      g.actualMoveSpeed = 0;
      for (let phase = 0; phase < 12; phase++) {
        g.elapsed = phase * 0.31;
        animateExplorer(g, 1 / 60, false, false);
        g.player.updateMatrixWorld(true);
        const eye = [],
          feet = [];
        g.rig.model.traverse((m) => {
          if (!m.isMesh) return;
          const target = ["eyebrow001", "eyelashes01", "high-poly"].includes(
            m.name,
          )
            ? eye
            : ["shoes04", "female_casualsuit01", "Vesper"].includes(m.name)
              ? feet
              : null;
          if (!target) return;
          for (let i = 0; i < m.geometry.attributes.position.count; i++) {
            m.getVertexPosition(i, point).applyMatrix4(m.matrixWorld);
            target.push(
              target === eye
                ? point.y
                : point.y - g.groundHeight(point.x, point.z),
            );
          }
        });
        assert(
          eye.length > 50 && feet.length > 10000,
          "actual face and garment surfaces sampled",
        );
        const eyeClearance = Math.min(...eye),
          bedClearance = Math.min(...feet);
        lowestEye = Math.min(lowestEye, eyeClearance);
        lowestSole = Math.min(lowestSole, bedClearance);
        assert(
          eyeClearance > 0.065,
          JSON.stringify({ depth, slope, phase, eyeClearance }),
        );
        assert(
          bedClearance > 0,
          JSON.stringify({ depth, slope, phase, bedClearance }),
        );
      }
    }
  // Traveling and diving must still recover their horizontal stroke.
  g.groundHeight = () => -5;
  g.actualMoveSpeed = 3.4;
  for (let i = 0; i < 60; i++) animateExplorer(g, 1 / 60, false, false);
  assert(g.rig.model.rotation.x > 1.2, "surface travel uses the prone stroke");
  g.actualMoveSpeed = 0;
  g.diving = true;
  for (let i = 0; i < 60; i++) animateExplorer(g, 1 / 60, false, false);
  assert(g.rig.model.rotation.x > 1.2, "diving remains prone");
  t.diagnostic(JSON.stringify({ lowestEye, lowestSole }));
});

test("all five sounding floats leave the dive axis clear and keep live physical and camera bounds", (t) => {
  const g = fixture(t, true);
  assert.equal(g.tideArchive.length, 5);
  for (const site of g.tideArchive) {
    const water = site.water,
      ring = site.buoy.children[0],
      bounds = new THREE.Box3().setFromObject(ring);
    assert(
      Math.hypot(
        site.buoy.position.x - water.position.x,
        site.buoy.position.z - water.position.z,
      ) > 2.5,
    );
    assert(
      Math.abs(site.buoy.position.z - water.position.z) + 0.56 <
        water.userData.length / 2,
      "float remains within the basin",
    );
    const from = new THREE.Vector3(
        water.position.x,
        water.position.y - 0.3,
        water.position.z - 2,
      ),
      to = from.clone().add(new THREE.Vector3(0, 0, 4));
    assert(
      !site.floatSolids.some((s) =>
        stationBlocked(
          s,
          water.position.x,
          water.position.y - 0.38,
          water.position.z,
          0.8,
        ),
      ),
      "central surfacing body is clear",
    );
    assert.equal(
      g.cameraSurfaces.entry(from, to, 0.28),
      1,
      "central lens sweep is clear",
    );
    assert(
      site.floatSolids.some((s) =>
        stationBlocked(
          s,
          site.buoy.position.x,
          water.position.y - 0.38,
          site.buoy.position.z,
          0.8,
        ),
      ),
      "a swimmer cannot pass through the float",
    );
    assert(
      site.floatSolids.every(
        (s) =>
          !stationBlocked(
            s,
            site.buoy.position.x,
            water.position.y - 1.1,
            site.buoy.position.z,
            0.8,
          ),
      ),
      "the dive path below it stays open",
    );
    const p = new THREE.Vector3(
        site.buoy.position.x - 0.9,
        site.buoy.position.y + 0.08,
        site.buoy.position.z,
      ),
      q = p.clone().add(new THREE.Vector3(1.8, 0, 0));
    assert(
      g.cameraSurfaces.entry(p, q, 0.28) < 1,
      "actual ring blocks a near-plane sweep",
    );
    assert(
      bounds.intersectsBox(
        new THREE.Box3(
          new THREE.Vector3().copy(site.floatSolids[0].bounds.min),
          new THREE.Vector3().copy(site.floatSolids[0].bounds.max),
        ),
      ),
    );
    for (const angle of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
      const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
        center = new THREE.Vector3(
          site.buoy.position.x,
          site.buoy.position.y + 0.08,
          site.buoy.position.z,
        ),
        start = center.clone().addScaledVector(axis, 0.8),
        end = center.clone().addScaledVector(axis, 0.3),
        ray = new THREE.Raycaster(start, axis.clone().negate(), 0, 0.5),
        hit = ray.intersectObject(ring)[0];
      assert(hit, "independent delivered torus hit");
      assert(
        Math.abs(g.cameraSurfaces.entry(start, end, 0) * 0.5 - hit.distance) <
          0.007,
        "circular camera envelope follows the real ring instead of filling its empty box corners",
      );
    }
    const oldY = site.buoy.position.y;
    water.position.y -= 1.8;
    g.elapsed += 1.2;
    updateTideArchive(g);
    const delta = site.buoy.position.y - oldY;
    p.y += delta;
    q.y += delta;
    assert(
      g.cameraSurfaces.entry(p, q, 0.28) < 1,
      "camera bounds follow drainage and bobbing",
    );
    assert(
      site.floatSolids.some((s) =>
        stationBlocked(
          s,
          site.buoy.position.x,
          water.position.y - 0.38,
          site.buoy.position.z,
          0.8,
        ),
      ),
      "physical bounds follow drainage",
    );
    g.diving = true;
    g.player.position.copy(site.position);
    assert(archiveInteract(g));
    assert(
      site.floatSolids.every(
        (s) =>
          !stationBlocked(
            s,
            site.buoy.position.x,
            water.position.y - 0.38,
            site.buoy.position.z,
            0.8,
          ),
      ),
      "recovered hidden float releases its bounds",
    );
    assert.equal(
      g.cameraSurfaces.entry(p, q, 0.28),
      1,
      "hidden float releases lens clearance",
    );
  }
});

test("a save inside a sounding float recovers through water without crossing another solid", (t) => {
  const g = fixture(t, true),
    site = g.tideArchive[0],
    y = site.water.position.y - 0.38;
  g.player.position.set(site.buoy.position.x, y, site.buoy.position.z);
  g.avatar.rotation.y = 0;
  const start = g.player.position.clone();
  assert(!canSwimAt(g, start.x, y, start.z));
  assert(
    recoverSwimmer(g, true),
    "occupied old save moves to a fitting swim position",
  );
  assert(canSwimAt(g, g.player.position.x, y, g.player.position.z));
  assert(g.player.position.distanceTo(start) <= 2.5);
  assert.equal(g.player.position.y, y);
  assert(site.buoy.visible);
  // A closed surrounding barrier is not an escape route, even though the
  // newly occupied float itself may be depenetrated.
  g.player.position.copy(start);
  const original = g.canMove;
  g.canMove = (x, z, h, c) =>
    Math.hypot(x - start.x, z - start.z) < 0.2 && original(x, z, h, c);
  assert.equal(recoverSwimmer(g, true), false);
  assert(g.player.position.equals(start));
  assert(site.buoy.visible);
});

test("saved surface and diving positions restore above submerged furniture without sideways ground recovery", (t) => {
  const g = fixture(t, true);
  g.traversalCourses = [];
  for (const site of g.tideArchive)
    for (const drained of [false, true]) {
      const w = site.water;
      if (drained) w.position.y -= 1.8;
      updateTideArchive(g);
      const x = w.position.x,
        z = w.position.z,
        ground = g.groundHeight(x, z),
        // A second sheet can remain above a drained basin. Resume at the
        // effective visible fluid level, as ordinary swimming does.
        surface = waterAt(g, x, z, ground).y;
      g.player.position.set(x, ground, z);
      g.swimming = false;
      g.grounded = true;
      const control = safeArrival(g, g.player.position);
      assert(
        control && Math.hypot(control.x - x, control.z - z) > 0.5,
        "ground recovery control moves around the submerged archive bench",
      );
      g.progress.position = { x, z, height: 0 };
      restoreTraversal(g);
      assert.equal(g.player.position.x, x);
      assert.equal(g.player.position.z, z);
      assert.equal(g.player.position.y, surface - 0.38);
      assert(g.swimming && !g.grounded);
      const arrival = safeArrival(g, g.player.position);
      assert.deepEqual(
        arrival,
        { x, y: surface - 0.38, z },
        "standing furniture beneath the water cannot redirect the restored surface view",
      );
      assert(canSwimAt(g, x, g.player.position.y, z));
    }
});
