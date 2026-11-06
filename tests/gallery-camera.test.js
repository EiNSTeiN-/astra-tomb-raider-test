import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVELS, createMap } from "../src/campaign.js";
import { createTerrainProfile } from "../src/terrain.js";
import { beginGalleryWheel } from "../src/gallery-wheel.js";
import {
  buildSunkenGallery,
  updateSunkenGallery,
} from "../src/sunken-gallery.js";
import { normalizeGallery } from "../src/sunken-gallery-record.js";
import { Adventure } from "../src/game.js";
import { animateExplorer } from "../src/explorer.js";
import { galleryCameraSight } from "../src/gallery-camera-sight.js";
import { followClearCamera } from "../src/camera-follow.js";
import {
  CameraSurfaces,
  followCamera,
  cylinderEntry,
} from "../src/camera-collision.js";
import { explorerCoverage } from "../src/explorer-visibility.js";
import { inspectExplorerCamera } from "../scripts/inspect-explorer-camera-browser.js";
import { cameraBodyTargets } from "../src/camera-body-frame.js";
import { advanceSwimming } from "../src/water-motion.js";
import { diveCameraFrame } from "../src/camera-state.js";

function fixture(t) {
  const level = LEVELS[3],
    map = createMap(level),
    terrainProfile = createTerrainProfile(map, level),
    world = new THREE.Group(),
    player = new THREE.Group(),
    avatar = new THREE.Group();
  player.add(avatar);
  const g = {
    level,
    map,
    terrainProfile,
    groundHeight: terrainProfile.height,
    world,
    player,
    avatar,
    camera: new THREE.PerspectiveCamera(58, 1.6, 0.1, 1000),
    cameraSurfaces: new CameraSurfaces(world),
    stoneMat: new THREE.MeshStandardMaterial(),
    darkMat: new THREE.MeshStandardMaterial(),
    soundSources: [],
    obstacles: [],
    progress: { gallery: normalizeGallery(null) },
    swimming: true,
    diving: true,
    grounded: false,
    elapsed: 45,
    health: 100,
    save() {},
    audio: { noiseHit() {}, tone() {} },
    cb: { toast() {} },
    keys: new Set(),
    waterMeshes: terrainProfile.waters.map((site) => {
      const m = new THREE.Mesh();
      m.position.set(site.x, site.baseY, site.z);
      Object.assign(m.userData, site);
      return m;
    }),
  };
  for (const name of ["walkable", "canMove", "cameraSpace"])
    g[name] = Adventure.prototype[name].bind(g);
  buildSunkenGallery(g);
  g.cameraSurfaces.rebuild();
  t.after(() => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const root of [world, player])
      root.traverse((mesh) => {
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          for (const material of [mesh.material].flat()) {
            materials.add(material);
            for (const value of Object.values(material))
              if (value?.isTexture) textures.add(value);
          }
        mesh.skeleton?.dispose();
      });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  });
  return g;
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

test("gallery body sight follows live solids and the hollow bell skirt and cap", (t) => {
  const g = fixture(t),
    o = g.terrainProfile.gallery.origin,
    w = g.sunkenGallery.profile.wheel,
    point = (x, y, z) => new THREE.Vector3(o.x + x, o.y + y, o.z + z);
  assert(
    !galleryCameraSight(g, point(-4.5, -6.1, 34.35), point(-4.5, -5.9, 38)),
  );
  assert(
    galleryCameraSight(g, point(-4.5, -6.1, 34.35), point(-7.8, -5.7, 34.35)),
  );
  const bell = g.sunkenGallery.profile.bells[1],
    inside = new THREE.Vector3(bell.x, bell.y, bell.z),
    outside = inside.clone().add(new THREE.Vector3(0, 0, 4));
  assert(
    !galleryCameraSight(g, inside, outside),
    "the hollow skirt blocks its side",
  );
  assert(
    galleryCameraSight(
      g,
      inside,
      inside.clone().add(new THREE.Vector3(0, 0, 2)),
    ),
    "room within the hollow bell stays clear",
  );
  inside.y = outside.y = bell.rim - 0.4;
  assert(galleryCameraSight(g, inside, outside), "swim below the skirt");
  assert(
    !galleryCameraSight(
      g,
      new THREE.Vector3(bell.x + 1, bell.ceiling - 1, bell.z),
      new THREE.Vector3(bell.x + 1, bell.ceiling + 1, bell.z),
    ),
    "the bronze cap blocks ascent sight",
  );
  const gate = g.sunkenGallery.gates.find((gate) => gate.site.id === "archive"),
    from = new THREE.Vector3(gate.site.x, gate.site.y + 2, gate.site.z - 1),
    to = from.clone().add(new THREE.Vector3(0, 0, 2));
  assert(!galleryCameraSight(g, from, to));
  gate.box.min.y -= 7;
  gate.box.max.y -= 7;
  assert(
    galleryCameraSight(g, from, to),
    "moving gate bounds update without a retained snapshot",
  );
  assert(galleryCameraSight({}, from, to));
});

test("finite camera panels cover the delivered gallery shell and preserve its open aperture", (t) => {
  const g = fixture(t),
    panels = g.sunkenGallery.cameraPanels,
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    meshes = [],
    ray = new THREE.Raycaster();
  g.world.updateMatrixWorld(true);
  g.sunkenGallery.root.traverse((m) => {
    if (m.isMesh && m.material === g.darkMat) {
      const proxy = new THREE.Mesh(m.geometry, material);
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(m.matrixWorld);
      proxy.updateMatrixWorld(true);
      meshes.push(proxy);
    }
  });
  try {
    assert(
      panels.length > 20 && panels.length < 150,
      "bounded merged surface count",
    );
    assert.equal(g.cameraSurfaces.count, panels.length + 1);
    for (const p of panels) {
      const axes = [0, 1, 2].filter((axis) => axis !== p.axis),
        point = [0, 0, 0];
      point[p.axis] = p.plane;
      point[axes[0]] = (p.u0 + p.u1) / 2;
      point[axes[1]] = (p.v0 + p.v1) / 2;
      const center = new THREE.Vector3(...point),
        normal = new THREE.Vector3().setComponent(p.axis, 1),
        from = center.clone().addScaledVector(normal, 0.3),
        to = center.clone().addScaledVector(normal, -0.3);
      ray.set(from, normal.clone().negate());
      ray.far = 0.6;
      assert(
        ray
          .intersectObjects(meshes, false)
          .some((hit) => hit.point.distanceTo(center) < 0.00004),
        `delivered shell at ${JSON.stringify(p)}`,
      );
      assert(
        g.cameraSurfaces.entry(from, to, 0.05) < 1,
        "both sides of the rendered shell block a lens sweep",
      );
      assert(g.cameraSurfaces.entry(to, from, 0.05) < 1);
    }
    const o = g.sunkenGallery.profile.origin,
      from = new THREE.Vector3(o.x + 0.8, o.y - 3.3, o.z),
      to = new THREE.Vector3(o.x - 6, o.y - 3.3, o.z);
    assert.equal(
      g.cameraSurfaces.entry(from, to, 0.28),
      1,
      "open sounding-well aperture",
    );
  } finally {
    material.dispose();
  }
});

test("recorded submerged squeezes recover an opaque, unobstructed delivered explorer while retaining look and position", async (t) => {
  const g = fixture(t);
  await loadSwimmer(g);
  const o = g.terrainProfile.gallery.origin,
    w = g.sunkenGallery.profile.wheel;
  for (const pose of [
    {
      name: "colonnade descent",
      player: [o.x - 29, -5.955722606270308, o.z + 23.93797655135357],
      yaw: Math.PI,
    },
    { name: "northward wheel", player: [w.x, w.y - 0.3, w.z - 0.65], yaw: 0 },
  ]) {
    g.player.position.fromArray(pose.player);
    g.avatar.rotation.y = 0;
    g.rig.swimCompact = 0;
    g.yaw = pose.yaw;
    g.pitch = 0.13;
    animateExplorer(g, 0, false, false);
    g.player.updateMatrixWorld(true);
    g.world.updateMatrixWorld(true);
    const feet = g.player.position.clone(),
      target = feet.clone().add(new THREE.Vector3(0, 0.3, 0)),
      desired = target
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(g.yaw) * Math.cos(g.pitch) * 3.4,
            Math.sin(g.pitch) * 3.4 + 0.2,
            Math.cos(g.yaw) * Math.cos(g.pitch) * 3.4,
          ),
        ),
      space = (p) => g.cameraSpace(p);
    g.camera.position.copy(desired);
    g.cameraFollowTarget = target.clone();
    const ordinary = followCamera(
      g.camera.position,
      target,
      desired,
      1 / 60,
      g.cameraSurfaces,
      space,
      target,
    );
    assert.equal(
      explorerCoverage(ordinary.distanceTo(target)),
      0,
      "control reproduces the vanished explorer",
    );
    g.camera.position.copy(ordinary);
    g.cameraBodyRecovery = g.cameraContactRecovery = null;
    for (let frame = 0; frame < 90; frame++) {
      g.camera.position.copy(
        followClearCamera(g, target, desired, 1 / 60, space),
      );
      g.cameraFollowTarget.copy(target);
      assert(space(g.camera.position), `${pose.name}: legal lens ${frame}`);
      assert.equal(
        explorerCoverage(g.camera.position.distanceTo(target)),
        1,
        `${pose.name}: visible coverage ${frame}`,
      );
    }
    g.camera.lookAt(target);
    g.camera.updateMatrixWorld(true);
    const meshes = [];
    g.sunkenGallery.root.traverse((m) => {
      if (m.isMesh && !m.material.transparent) meshes.push(m);
    });
    const visible = inspectExplorerCamera(g, meshes, 20, 30);
    assert(visible.bodyRays > 50, `${pose.name}: actual posed surface sampled`);
    assert.equal(visible.invalid, 0);
    assert.equal(
      visible.blocked,
      0,
      JSON.stringify({ pose: pose.name, visible }),
    );
    assert(g.player.position.equals(feet));
    assert.equal(g.yaw, pose.yaw);
    assert.equal(g.pitch, 0.13);
  }
});

test("camera skin samples follow a moving swimmer between draws", async (t) => {
  const g = fixture(t);
  await loadSwimmer(g);
  const o = g.terrainProfile.gallery.origin;
  g.player.position.set(o.x - 29, o.y - 6.3, o.z + 34.5);
  g.avatar.rotation.y = Math.PI / 2;
  animateExplorer(g, 0, false, false);
  g.player.updateMatrixWorld(true);
  const before = cameraBodyTargets(g).filter((p) => p.galleryOnly);
  assert(before.length > 50, "delivered arm and hand surface samples");
  const translation = new THREE.Vector3(6.4, 0.3, 0.15);
  g.player.position.add(translation);
  // The animation controller updates this graph before the camera; no render
  // has refreshed the SkinnedMesh inverse bindings at the translated position.
  g.rig.model.updateWorldMatrix(true, true);
  const stale = g.rig.cameraSwimmerProbes[0],
    stalePoint = stale.mesh
      .getVertexPosition(stale.index, new THREE.Vector3())
      .applyMatrix4(stale.mesh.matrixWorld);
  assert(
    stalePoint.distanceTo(before[0].position.clone().add(translation)) > 1,
    "control reproduces stale-binding displacement",
  );
  const after = cameraBodyTargets(g).filter((p) => p.galleryOnly);
  assert.equal(after.length, before.length);
  for (let i = 0; i < after.length; i++)
    assert(
      after[i].position.distanceTo(
        before[i].position.clone().add(translation),
      ) < 1e-5,
      `posed surface ${i} follows one translation`,
    );
});

for (const pitch of [0.13, -0.4, 0.55])
  test(`rising from the gallery aperture retains an opaque, continuous well view at pitch ${pitch}`, async (t) => {
    const g = fixture(t);
    await loadSwimmer(g);
    g.player.position.set(
      201.47046373603646,
      -3.334496316489686,
      79.8024239476197,
    );
    g.camera.position.set(
      197.78003376594987,
      -2.39375951753107,
      79.88791339337315,
    );
    g.yaw = -1.5520713852699928;
    g.pitch = pitch;
    g.avatar.rotation.y = Math.PI / 2;
    g.cameraFollowTarget = g.player.position
      .clone()
      .add(new THREE.Vector3(0, 0.3, 0));
    const look = { yaw: g.yaw, pitch: g.pitch };
    const shellMaterial = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
      }),
      shell = [],
      pathRay = new THREE.Raycaster(),
      stages = new Set();
    t.after(() => shellMaterial.dispose());
    g.world.updateMatrixWorld(true);
    g.sunkenGallery.root.traverse((mesh) => {
      if (mesh.isMesh && mesh.material === g.darkMat) {
        const proxy = new THREE.Mesh(mesh.geometry, shellMaterial);
        proxy.matrixAutoUpdate = false;
        proxy.matrix.copy(mesh.matrixWorld);
        proxy.updateMatrixWorld(true);
        shell.push(proxy);
      }
    });
    let maxTurn = 0,
      maxLensStep = 0,
      turnWitness,
      lensWitness;
    for (let frame = 0; frame < 80; frame++) {
      const oldCamera = g.camera.position.clone();
      const oldArm = g.camera.position.clone().sub(g.cameraFollowTarget);
      g.elapsed += 1 / 60;
      g.keys.clear();
      g.keys.add("Space");
      advanceSwimming(g, { x: 0, z: 0 }, 1 / 60, true);
      animateExplorer(g, 1 / 60, false, false);
      const view = diveCameraFrame(g, 1 / 60),
        target = g.player.position
          .clone()
          .add(new THREE.Vector3(0, view.height, 0)),
        distance = view.distance,
        desired = target
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(g.yaw) * Math.cos(g.pitch) * distance,
              Math.sin(g.pitch) * distance + 0.2,
              Math.cos(g.yaw) * Math.cos(g.pitch) * distance,
            ),
          );
      if (!g.diving)
        desired.y = Math.max(desired.y, g.sunkenGallery.well.position.y + 0.12);
      g.camera.position.copy(
        followClearCamera(g, target, desired, 1 / 60, (p) => g.cameraSpace(p)),
      );
      g.cameraFollowTarget.copy(target);
      stages.add(g.cameraGalleryExit?.stage || "clear");
      const lensStep = oldCamera.distanceTo(g.camera.position);
      if (lensStep > maxLensStep) {
        maxLensStep = lensStep;
        lensWitness = {
          frame,
          diving: g.diving,
          oldCamera: oldCamera.toArray(),
          camera: g.camera.position.toArray(),
          target: target.toArray(),
          recovery: g.cameraBodyRecovery,
        };
      }
      assert(lensStep <= 0.35, JSON.stringify({ lensStep, lensWitness }));
      if (lensStep > 1e-6) {
        pathRay.set(
          oldCamera,
          g.camera.position.clone().sub(oldCamera).normalize(),
        );
        pathRay.near = 1e-6;
        pathRay.far = lensStep - 1e-6;
        assert.equal(
          pathRay.intersectObjects(shell, false).length,
          0,
          `rendered shell sweep ${frame}`,
        );
      }
      const turn = oldArm.angleTo(g.camera.position.clone().sub(target));
      if (turn > maxTurn) {
        maxTurn = turn;
        turnWitness = {
          frame,
          diving: g.diving,
          player: g.player.position.toArray(),
          camera: g.camera.position.toArray(),
          target: target.toArray(),
          oldArm: oldArm.toArray(),
          recovery: g.cameraBodyRecovery,
        };
      }
      assert(g.cameraSpace(g.camera.position), `legal lens ${frame}`);
      assert.equal(
        explorerCoverage(g.camera.position.distanceTo(target)),
        1,
        JSON.stringify({
          frame,
          pitch,
          arm: g.camera.position.distanceTo(target),
          player: g.player.position.toArray(),
          camera: g.camera.position.toArray(),
          target: target.toArray(),
          recovery: g.cameraBodyRecovery,
        }),
      );
      assert.deepEqual({ yaw: g.yaw, pitch: g.pitch }, look);
    }
    assert(!g.diving, "reaches the well surface");
    if (pitch === 0.55) {
      assert(
        stages.has("aperture") && stages.has("rise"),
        "leaves through the aperture before rising",
      );
      assert.equal(
        g.cameraGalleryExit,
        null,
        "completed exit releases the waypoint",
      );
    }
    assert(maxTurn <= 0.08, JSON.stringify({ maxTurn, turnWitness }));
    assert(maxLensStep <= 0.35, JSON.stringify({ maxLensStep, lensWitness }));
    t.diagnostic(JSON.stringify({ maxTurn, maxLensStep }));
  });

for (const look of [4.817004947267814, 0])
  test(`wheel grip and release retain a continuous opaque swim view at yaw ${look}`, async (t) => {
    const g = fixture(t);
    await loadSwimmer(g);
    g.player.position.set(
      196.94582058917342,
      -5.5165872834710274,
      113.51590930949418,
    );
    g.camera.position.set(
      193.23404353095117,
      -4.575434191794268,
      113.91488482456717,
    );
    g.yaw = look;
    g.pitch = 0.13;
    g.avatar.rotation.y = 0;
    g.cameraFollowTarget = g.player.position
      .clone()
      .add(new THREE.Vector3(0, 0.3, 0));
    assert(beginGalleryWheel(g), "the actual wheel approach is usable");
    const head = [],
      hub = g.sunkenGallery.profile.wheel,
      point = new THREE.Vector3();
    g.rig.model.traverseVisible((m) => {
      if (!m.isSkinnedMesh) return;
      const indices = m.geometry.attributes.skinIndex,
        weights = m.geometry.attributes.skinWeight;
      for (let i = 0; i < indices.count; i++)
        if (
          [0, 1, 2, 3].some(
            (j) =>
              weights.getComponent(i, j) > 0.1 &&
              m.skeleton.bones[indices.getComponent(i, j)].name.endsWith(
                "Head",
              ),
          )
        )
          head.push({ m, i });
    });
    assert(head.length > 100, "delivered head and hair vertices selected");
    let maxTurn = 0,
      maxLensStep = 0,
      witness;
    for (let frame = 0; frame < 180; frame++) {
      const oldCamera = g.camera.position.clone(),
        oldArm = oldCamera.clone().sub(g.cameraFollowTarget);
      g.elapsed += 1 / 60;
      advanceSwimming(g, { x: 0, z: 0 }, 1 / 60, false);
      animateExplorer(g, 1 / 60, false, false);
      updateSunkenGallery(g, 1 / 60);
      g.player.updateMatrixWorld(true);
      for (const { m, i } of head) {
        m.getVertexPosition(i, point).applyMatrix4(m.matrixWorld);
        assert(
          !(
            Math.hypot(point.x - hub.x, point.y - hub.y) < 0.139 &&
            Math.abs(point.z - hub.z) < 0.224
          ),
          JSON.stringify({
            frame,
            look,
            point: point.toArray(),
            message: "head enters delivered hub",
          }),
        );
      }
      const target = g.player.position
          .clone()
          .add(new THREE.Vector3(0, 0.3, 0)),
        desired = target
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(g.yaw) * Math.cos(g.pitch) * 3.4,
              Math.sin(g.pitch) * 3.4 + 0.2,
              Math.cos(g.yaw) * Math.cos(g.pitch) * 3.4,
            ),
          );
      g.camera.position.copy(
        followClearCamera(g, target, desired, 1 / 60, (p) => g.cameraSpace(p)),
      );
      g.cameraFollowTarget.copy(target);
      const turn = oldArm.angleTo(g.camera.position.clone().sub(target));
      if (turn > maxTurn) {
        maxTurn = turn;
        witness = {
          frame,
          turn,
          camera: g.camera.position.toArray(),
          recovery: g.cameraBodyRecovery,
          brace: g.rig.wheelBrace,
        };
      }
      maxLensStep = Math.max(
        maxLensStep,
        oldCamera.distanceTo(g.camera.position),
      );
      assert(g.cameraSpace(g.camera.position), `legal lens ${frame}`);
      assert.equal(
        explorerCoverage(g.camera.position.distanceTo(target)),
        1,
        `opaque explorer ${frame}`,
      );
    }
    assert(g.progress.gallery.opened, "both gates released");
    assert.equal(g.sunkenGallery.operation, null, "hand release completes");
    assert.equal(g.yaw, look);
    assert.equal(g.pitch, 0.13);
    assert(maxTurn <= 0.08, JSON.stringify({ maxTurn, witness }));
    assert(maxLensStep <= 0.35, JSON.stringify({ maxLensStep }));
    g.world.updateMatrixWorld(true);
    g.camera.lookAt(g.cameraFollowTarget);
    const meshes = [];
    g.sunkenGallery.root.traverse((m) => {
      if (m.isMesh && !m.material.transparent) meshes.push(m);
    });
    for (const aspect of [1.6, 0.6]) {
      g.camera.aspect = aspect;
      g.camera.updateProjectionMatrix();
      const view = inspectExplorerCamera(g, meshes, 20, 30);
      assert(view.bodyRays > 50);
      assert.equal(view.blocked, 0, JSON.stringify({ look, aspect, view }));
      assert.equal(view.invalid, 0);
    }
    t.diagnostic(JSON.stringify({ maxTurn, maxLensStep }));
  });

test("surfacing in an air bell keeps torso framing and bounded recovery work", async (t) => {
  const g = fixture(t);
  await loadSwimmer(g);
  g.player.position.set(
    193.58393675321753,
    -3.113323084817213,
    113.86281198698478,
  );
  g.camera.position.set(
    191.0113053671846,
    -2.7374827802443207,
    114.00892935386277,
  );
  g.yaw = 5.3744505912777445;
  g.pitch = 0.13;
  g.cameraFollowTarget = g.player.position
    .clone()
    .add(new THREE.Vector3(0, 0.3, 0));
  const entry = g.cameraSurfaces.entry;
  let queries = 0,
    maxQueries = 0,
    maxTurn = 0;
  g.cameraSurfaces.entry = function (...args) {
    queries++;
    return entry.apply(this, args);
  };
  for (let frame = 0; frame < 140; frame++) {
    queries = 0;
    const oldArm = g.camera.position.clone().sub(g.cameraFollowTarget);
    g.elapsed += 1 / 60;
    g.keys.clear();
    if (frame < 18) g.keys.add("Space");
    advanceSwimming(g, { x: 0, z: 0 }, 1 / 60, frame < 18);
    animateExplorer(g, 1 / 60, false, false);
    updateSunkenGallery(g, 1 / 60);
    const view = diveCameraFrame(g, 1 / 60),
      target = g.player.position
        .clone()
        .add(new THREE.Vector3(0, view.height, 0)),
      desired = target
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(g.yaw) * Math.cos(g.pitch) * view.distance,
            Math.sin(g.pitch) * view.distance + 0.2,
            Math.cos(g.yaw) * Math.cos(g.pitch) * view.distance,
          ),
        );
    if (!g.diving)
      desired.y = Math.max(
        desired.y,
        g.sunkenGallery.profile.bells[1].y + 0.12,
      );
    g.camera.position.copy(
      followClearCamera(g, target, desired, 1 / 60, (p) => g.cameraSpace(p)),
    );
    g.cameraFollowTarget.copy(target);
    maxQueries = Math.max(maxQueries, queries);
    maxTurn = Math.max(
      maxTurn,
      oldArm.angleTo(g.camera.position.clone().sub(target)),
    );
    assert(target.y < g.player.position.y + 0.31, `swimmer focus ${frame}`);
    assert.equal(
      explorerCoverage(g.camera.position.distanceTo(target)),
      1,
      `opaque explorer ${frame}`,
    );
    assert(g.cameraSpace(g.camera.position), `legal lens ${frame}`);
  }
  assert(!g.diving && g.swimming, "surfaces while retaining the floating pose");
  assert.equal(g.diveAir, 32, "the bell restores air");
  assert(maxTurn <= 0.08, JSON.stringify({ maxTurn }));
  // Counts solver work instead of imposing a hardware-dependent time limit.
  // The rejected clear-extension regression performed over 70,000 queries.
  assert(maxQueries < 5000, JSON.stringify({ maxQueries }));
  t.diagnostic(JSON.stringify({ maxQueries, maxTurn }));
});

test("the entrance guide lamp is seated on its pier and clears the return view", (t) => {
  const g = fixture(t),
    lamp = g.sunkenGallery.entranceLamp;
  g.world.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(lamp);
  assert(
    g.sunkenGallery.solids.some((box) =>
      bounds.intersectsBox(
        new THREE.Box3(
          new THREE.Vector3().copy(box.min),
          new THREE.Vector3().copy(box.max),
        ),
      ),
    ),
    "the actual lamp engages its stone mounting",
  );
  const center = bounds.getCenter(new THREE.Vector3()),
    from = center.clone().add(new THREE.Vector3(0, 0, -0.7)),
    to = center.clone().add(new THREE.Vector3(0, 0, 0.7));
  const ray = new THREE.Raycaster(
    from,
    to.clone().sub(from).normalize(),
    0,
    from.distanceTo(to),
  );
  assert(
    ray.intersectObject(lamp).length,
    "delivered light fixture intersects the probe",
  );
  assert(
    g.cameraSurfaces.entry(from, to, 0.28) < 1,
    "the lens reserves real fixture clearance",
  );
  assert.equal(
    g.cameraSurfaces.entry(
      new THREE.Vector3(
        201.47046373603646,
        -3.034496316489686,
        79.8024239476197,
      ),
      new THREE.Vector3(
        197.78003376594987,
        -2.39375951753107,
        79.88791339337315,
      ),
      0.28,
    ),
    1,
    "the recorded central return arm stays clear of the guide lamp",
  );
});

test("wheel body sight reserves each rotating casting without filling their empty corners", (t) => {
  const g = fixture(t),
    wheel = g.sunkenGallery.wheel,
    box = g.sunkenGallery.wheelSight,
    center = box.getCenter(new THREE.Vector3()),
    radius = (box.max.x - box.min.x) / 2,
    material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    meshes = [],
    ray = new THREE.Raycaster();
  t.after(() => material.dispose());
  g.world.updateMatrixWorld(true);
  wheel.traverse((m) => {
    if (m.isMesh) {
      const proxy = new THREE.Mesh(m.geometry, material);
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(m.matrixWorld);
      proxy.updateMatrixWorld(true);
      meshes.push(proxy);
    }
  });
  const actual = (a, b) => {
    const d = b.clone().sub(a);
    ray.set(a, d.clone().normalize());
    ray.far = d.length();
    return ray.intersectObjects(meshes, false).length > 0;
  };
  const from = new THREE.Vector3(
      196.38282198472032,
      -5.807599744065615,
      114.59491058027766,
    ),
    to = new THREE.Vector3(
      197.2672726383938,
      -5.077398196378352,
      111.06228335370295,
    );
  assert(
    !actual(from, to),
    "the recorded stroke ray does not hit delivered wheel triangles",
  );
  assert(
    galleryCameraSight(g, from, to),
    "empty space beside the rim stays clear",
  );
  const radialCorner = new THREE.Vector3(
      196.38794880531245,
      -5.720985748997638,
      114.67572772876494,
    ),
    front = new THREE.Vector3(
      197.5183488850449,
      -5.081036543819396,
      111.21888028365326,
    );
  assert(
    !actual(radialCorner, front),
    "the moving shoulder margin misses every wheel triangle",
  );
  assert(
    cylinderEntry(radialCorner, front, box, 0.02, "z") !== null,
    "the combined hub-depth/rim-radius control fills this empty region",
  );
  assert(
    galleryCameraSight(g, radialCorner, front),
    "casting-specific depth leaves the recorded ray clear",
  );
  assert(
    g.sunkenGallery.wheelSightParts.length < 8,
    "contained and duplicate envelopes are removed",
  );
  for (let i = 0; i < 32; i++) {
    const angle = (i * Math.PI * 2) / 32,
      a = new THREE.Vector3(
        center.x + Math.cos(angle) * radius * 0.97,
        center.y + Math.sin(angle) * radius * 0.97,
        center.z - 0.5,
      ),
      b = a.clone().setZ(center.z + 0.5);
    assert(actual(a, b), "the delivered rim intersects this sight line");
    assert(
      !galleryCameraSight(g, a, b),
      "the conservative circle retains the whole rim",
    );
  }
  for (const angle of [Math.PI / 6, 0, -Math.PI / 6]) {
    wheel.rotation.z = angle;
    wheel.updateWorldMatrix(true, true);
    wheel.traverse((m) => {
      if (!m.isMesh) return;
      const p = new THREE.Vector3();
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        p.fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(
          m.matrixWorld,
        );
        assert(
          g.sunkenGallery.wheelSightParts.some((part) => {
            const c = part.getCenter(new THREE.Vector3()),
              r = (part.max.x - part.min.x) / 2;
            return (
              Math.hypot(p.x - c.x, p.y - c.y) <= r + 1e-5 &&
              p.z >= part.min.z - 1e-5 &&
              p.z <= part.max.z + 1e-5
            );
          }),
          "every delivered vertex stays within a casting envelope throughout the turn",
        );
      }
    });
  }
});

test("a folded swim pose keeps the delivered head, hair and equipment outside the wheel hub", async (t) => {
  const g = fixture(t);
  await loadSwimmer(g);
  const w = g.sunkenGallery.profile.wheel;
  g.player.position.set(w.x, w.y - 0.3, w.z - 0.65);
  g.avatar.rotation.y = 0;
  const surface = [];
  g.rig.model.traverseVisible((m) => {
    if (m.isMesh)
      for (let i = 0; i < m.geometry.attributes.position.count; i++)
        surface.push({ m, i });
  });
  const point = new THREE.Vector3(),
    embedded = () => {
      g.player.updateMatrixWorld(true);
      let count = 0;
      for (const { m, i } of surface) {
        m.getVertexPosition(i, point).applyMatrix4(m.matrixWorld);
        if (
          Math.hypot(point.x - w.x, point.y - w.y) < 0.139 &&
          Math.abs(point.z - w.z) < 0.224
        )
          count++;
      }
      return count;
    };
  animateExplorer(g, 0, false, false);
  const offset = g.avatar.position.z;
  // Reproduce the former forward translation using the actual posed asset.
  g.avatar.position.z += 0.25 * g.rig.swimCompact;
  assert(
    embedded() > 0,
    "control reproduces delivered head vertices inside the cylindrical hub",
  );
  g.avatar.position.z = offset;
  assert.equal(
    embedded(),
    0,
    "the ordinary swim pose clears the hub before camera framing",
  );
  assert(
    surface.length > 10000,
    "actual visible skin, hair and equipment sampled",
  );
  for (let phase = 0; phase < 16; phase++) {
    g.elapsed = 45 + (phase * Math.PI) / 32;
    animateExplorer(g, 1 / 60, false, false);
    assert.equal(
      embedded(),
      0,
      `delivered surface clears the hub at stroke phase ${phase}`,
    );
  }
});

const recordedMotions = [
  {
    label: "wheel departure",
    elapsed: 69.966666666664,
    player: [197.1, -5.883519582748413, 114.15],
    camera: [197.09444511447956, -4.949255484052363, 110.78117134027502],
    yaw: 4.817004947267814,
    facing: 0,
    recovery: [Math.PI - 4.817004947267814, 0],
    destination: [-8, -6.3, 36],
  },
  {
    label: "entrance turn",
    elapsed: 97.0999999999959,
    player: [194.59999983713615, -3.334496316489686, 79.93098751819397],
    camera: [194.59999464151772, -2.412543265727898, 83.66374669020786],
    yaw: -0.00000130028887264,
    facing: Math.PI,
    destination: [0, -3.5, 0],
  },
  {
    label: "memorial return",
    elapsed: 75.4166666666638,
    player: [193.60005902977255, -6.906467392864961, 128.17628601232914],
    camera: [193.60187065016063, -5.96569229335428, 124.44274332197482],
    yaw: 3.1411122372107534,
    facing: 0,
    recovered: true,
    destination: [-8, -5.35, 38],
  },
];
for (const pose of recordedMotions)
  test(`${pose.label} retains continuous framing with bounded camera work`, async (t) => {
    const g = fixture(t);
    await loadSwimmer(g);
    const o = g.terrainProfile.gallery.origin;
    g.elapsed = pose.elapsed;
    g.rig.mixer.setTime(0.1 + g.elapsed - 25);
    g.player.position.fromArray(pose.player);
    g.camera.position.fromArray(pose.camera);
    g.yaw = pose.yaw;
    g.pitch = 0.13;
    g.avatar.rotation.y = pose.facing;
    g.rig.bellFloat = g.rig.wheelBrace = g.rig.swimCompact = 0;
    g.progress.gallery.opened = true;
    g.progress.gallery.recovered = !!pose.recovered;
    g.sunkenGallery.lift = 1;
    g.sunkenGallery.wheel.rotation.z = -Math.PI / 6;
    updateSunkenGallery(g, 0);
    g.cameraFollowTarget = g.player.position
      .clone()
      .add(new THREE.Vector3(0, 0.3, 0));
    g.cameraBodyRecovery = pose.recovery ? [...pose.recovery] : null;
    g.cameraContactRecovery = g.cameraBodyRecovery;
    const destination = new THREE.Vector3(...pose.destination).add(
        new THREE.Vector3(o.x, o.y, o.z),
      ),
      entry = g.cameraSurfaces.entry;
    let queries = 0,
      maxQueries = 0,
      maxTurn = 0,
      maxLensStep = 0;
    g.cameraSurfaces.entry = function (...args) {
      queries++;
      return entry.apply(this, args);
    };
    animateExplorer(g, 0, false, false);
    const meshes = [];
    g.world.updateMatrixWorld(true);
    g.sunkenGallery.root.traverse((m) => {
      if (m.isMesh && !m.material.transparent) meshes.push(m);
    });
    const sweepMaterial = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
      }),
      sweepMeshes = pose.recovered
        ? meshes.map((m) => {
            const proxy = new THREE.Mesh(m.geometry, sweepMaterial);
            proxy.matrixAutoUpdate = false;
            proxy.matrix.copy(m.matrixWorld);
            proxy.updateMatrixWorld(true);
            return proxy;
          })
        : [],
      sweepRay = new THREE.Raycaster();
    t.after(() => sweepMaterial.dispose());
    for (let frame = 0; frame < 120; frame++) {
      const delta = destination.clone().sub(g.player.position),
        horizontal = Math.hypot(delta.x, delta.z),
        old = g.camera.position.clone(),
        oldArm = old.clone().sub(g.cameraFollowTarget);
      if (horizontal > 0.12) {
        const yaw = Math.atan2(-delta.x, -delta.z);
        g.yaw +=
          (Math.atan2(Math.sin(yaw - g.yaw), Math.cos(yaw - g.yaw)) * 5) / 60;
      }
      g.keys.clear();
      if (delta.y < -0.08) g.keys.add("KeyX");
      if (delta.y > 0.08) g.keys.add("Space");
      const amount = Math.min(1, horizontal * 6),
        input = {
          x: horizontal > 0.07 ? (delta.x / horizontal) * amount : 0,
          z: horizontal > 0.07 ? (delta.z / horizontal) * amount : 0,
        };
      g.elapsed += 1 / 60;
      advanceSwimming(g, input, 1 / 60, delta.y > 0.08);
      animateExplorer(g, 1 / 60, false, false);
      updateSunkenGallery(g, 1 / 60);
      const target = g.player.position
          .clone()
          .add(new THREE.Vector3(0, 0.3, 0)),
        desired = target
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(g.yaw) * Math.cos(g.pitch) * 3.4,
              Math.sin(g.pitch) * 3.4 + 0.2,
              Math.cos(g.yaw) * Math.cos(g.pitch) * 3.4,
            ),
          );
      queries = 0;
      g.camera.position.copy(
        followClearCamera(g, target, desired, 1 / 60, (p) => g.cameraSpace(p)),
      );
      g.cameraFollowTarget.copy(target);
      maxQueries = Math.max(maxQueries, queries);
      maxTurn = Math.max(
        maxTurn,
        oldArm.angleTo(g.camera.position.clone().sub(target)),
      );
      maxLensStep = Math.max(maxLensStep, old.distanceTo(g.camera.position));
      assert(queries < 5000, JSON.stringify({ frame, queries }));
      assert(g.cameraSpace(g.camera.position), `legal lens ${frame}`);
      if (pose.recovered && old.distanceTo(g.camera.position) > 1e-6) {
        sweepRay.set(old, g.camera.position.clone().sub(old).normalize());
        sweepRay.near = 1e-6;
        sweepRay.far = old.distanceTo(g.camera.position) - 1e-6;
        assert.equal(
          sweepRay.intersectObjects(sweepMeshes, false).length,
          0,
          `delivered gallery surface crosses the lens sweep at ${frame}`,
        );
      }
      assert.equal(explorerCoverage(g.camera.position.distanceTo(target)), 1);
      if (frame % 20 === 0 || (pose.recovered && frame === 32)) {
        g.camera.lookAt(target);
        const view = inspectExplorerCamera(g, meshes, 20, 30);
        assert(view.bodyRays > 50);
        assert.equal(view.blocked, 0, JSON.stringify({ frame, view }));
        assert.equal(view.invalid, 0);
      }
    }
    assert(maxTurn <= 0.08, JSON.stringify({ maxTurn }));
    assert(maxLensStep <= 0.35, JSON.stringify({ maxLensStep }));
    t.diagnostic(JSON.stringify({ maxQueries, maxTurn, maxLensStep }));
  });
