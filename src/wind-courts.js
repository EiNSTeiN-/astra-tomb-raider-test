import * as THREE from "three";
import {
  WIND_TRIALS,
  WIND_PORTS,
  windPosition,
  windName,
  traceWind,
  normalizeWind,
} from "./wind-rules.js";
import { restorePuzzle, applyMove, isSolved } from "./puzzles.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { mergeArchitecture } from "./visuals.js";
import {
  windArtKit,
  windDuctGeometry,
  windMetal,
  windSurface,
} from "./wind-art.js";
import { poseHands } from "./pose.js";
import {
  batchWindCourt,
  syncWindCourt,
  windPlaqueFactory,
} from "./wind-rendering.js";

export function windReady(game, site) {
  return (
    !!site &&
    !game.progress.completed &&
    site.stage === game.progress.stage &&
    fieldComplete(game.level, game.progress, site.stage) &&
    counterweightsReady(game, site.feature)
  );
}
const orientation = (mask) =>
  [5, 10].includes(mask) ? (mask === 5 ? 0 : 1) : [3, 6, 12, 9].indexOf(mask);
function ductCurve(straight) {
  return new THREE.CatmullRomCurve3(
    (straight
      ? [
          [0, -1.5],
          [0, -0.6],
          [0, 0.6],
          [0, 1.5],
        ]
      : [
          [0, -1.5],
          [0, -0.8],
          [0.22, -0.22],
          [0.8, 0],
          [1.5, 0],
        ]
    ).map(([x, z]) => new THREE.Vector3(x, 0, z)),
  );
}
export function buildWindCourts(game) {
  game.windSites = [];
  game.windSources = [];
  game.windFocus = null;
  game.windGrip = null;
  if (game.level.biome !== "sky") return false;
  const bronze = windMetal(),
    stone = game.darkMat,
    trim = windMetal("worn"),
    iron = windMetal("iron"),
    kit = windArtKit(),
    makePlaque = windPlaqueFactory();
  const curves = [ductCurve(true), ductCurve(false)],
    ducts = curves.map(windDuctGeometry);
  const airMaterial = new THREE.PointsMaterial({
    color: 0xd2efea,
    size: 0.12,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const stage = feature.stage,
      trial = WIND_TRIALS[stage],
      root = new THREE.Group(),
      detail = new THREE.Group();
    root.position.copy(feature.group.position);
    root.name = trial.title;
    root.add(detail);
    game.world.add(root);
    const state = restorePuzzle(game.level, stage, game.progress.wind?.[stage]);
    if (game.progress.completed || stage < game.progress.stage)
      state.values = [...state.target];
    const site = {
      stage,
      trial,
      feature,
      root,
      detail,
      state,
      nodes: [],
      fans: [],
      visualTime: 0,
      moving: false,
    };
    game.windSites.push(site);
    const floor = (x, z) =>
      game.groundHeight(root.position.x + x, root.position.z + z) -
      root.position.y;
    const add = (geometry, material, x, y, z, parent = root) => {
      if (material.userData.windMetal) windSurface(geometry);
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (w, h, d, material, x, y, z, parent = root) =>
      add(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
    const control = (kind, index, x, z) => {
      const group = new THREE.Group();
      group.position.set(
        root.position.x + x,
        root.position.y + floor(x, z),
        root.position.z + z,
      );
      game.world.add(group);
      const marker = add(
        new THREE.OctahedronGeometry(0.11),
        game.glowMat,
        0,
        2.6,
        0,
        group,
      );
      const f = {
        id: `wind-${stage}-${kind}-${index}`,
        type: "wind",
        kind,
        index,
        stage,
        x: group.position.x / 7,
        z: group.position.z / 7,
        group,
        marker,
        label:
          kind === "tablet"
            ? "Read the wind-engine record"
            : `Turn duct ${windName(state, index)}`,
      };
      game.items.push(f);
      return f;
    };
    const source = (id, kind, x, y, z, gain, range, extra = {}) => {
      const s = {
        id: `wind-${stage}-${id}`,
        kind,
        x: root.position.x + x,
        y: root.position.y + y,
        z: root.position.z + z,
        near: 1.2,
        range,
        gain,
        activity: 0,
        windStage: stage,
        ...extra,
      };
      game.windSources.push(s);
      return s;
    };
    const airHeight =
      Math.max(
        ...state.values.map((_, i) => {
          const p = windPosition(state, i);
          return floor(p.x, p.z);
        }),
      ) + 3.05;
    site.airHeight = airHeight;
    for (let i = 0; i < state.values.length; i++) {
      const { x, z } = windPosition(state, i),
        y = floor(x, z),
        body = new THREE.Group();
      body.position.set(x, y, z);
      detail.add(body);
      add(kit.plinth, stone, x, y, z);
      add(kit.housing, bronze, x, y, z);
      add(kit.crown, trim, x, y, z);
      const rotor = new THREE.Group();
      rotor.position.set(0, airHeight - y, 0);
      rotor.userData.cameraDynamic = true;
      add(
        new THREE.CylinderGeometry(0.18, 0.23, airHeight - y - 1.35, 24),
        bronze,
        x,
        (airHeight + y + 1.35) / 2,
        z,
      );
      body.add(rotor);
      const straight = [5, 10].includes(state.target[i]),
        curve = curves[straight ? 0 : 1];
      game.cameraSurfaces?.capture(
        add(ducts[straight ? 0 : 1], bronze, 0, 0, 0, rotor),
      );
      // Open mouths and raised ribs retain the channel silhouette in daylight.
      for (const t of [0, 0.18, 0.82, 1]) {
        const p = curve.getPoint(t),
          tangent = curve.getTangent(t),
          rib = add(
            t === 0 || t === 1
              ? kit.flange
              : new THREE.TorusGeometry(0.26, 0.025, 8, 32),
            trim,
            p.x,
            p.y,
            p.z,
            rotor,
          );
        rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      }
      const glow = new THREE.MeshStandardMaterial({
        color: 0x667c76,
        emissive: 0x79b9ae,
        emissiveIntensity: 0.03,
        roughness: 0.5,
        metalness: 0.2,
      });
      const line = add(
        new THREE.TubeGeometry(curve, 20, 0.035, 5, false),
        glow,
        0,
        0.28,
        0,
        rotor,
      );
      line.castShadow = false;
      const particles = new THREE.Points(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(18), 3),
        ),
        airMaterial,
      );
      rotor.add(particles);
      const locked = state.fixed.includes(i),
        wheel = add(kit.wheel, trim, 0, 1.04, 0.94, body),
        handles = [-1, 1].map((side) => {
          const h = new THREE.Object3D();
          h.position.set(side * 0.26, 0, 0.03);
          wheel.add(h);
          return h;
        });
      if (locked) {
        wheel.visible = false;
        add(kit.brace, trim, 0, 0, 0, body);
      }
      add(kit.bearing, iron, 0, 1.04, 0.65, body);
      add(
        new THREE.CylinderGeometry(0.048, 0.048, 0.3, 16).rotateX(Math.PI / 2),
        trim,
        0,
        1.04,
        0.82,
        body,
      );
      add(kit.panel, iron, 0, 0.61, 0.725, body);
      const plaque = makePlaque(
        `${windName(state, i)}${locked ? " · FIXED" : ""}`,
        1.06,
      );
      plaque.position.set(0, 0.61, 0.77);
      body.add(plaque);
      const f = locked ? null : control("wheel", i, x, z + 1.52);
      const node = {
        index: i,
        x,
        y,
        z,
        body,
        rotor,
        curve,
        straight,
        wheel,
        handles,
        particles,
        glow,
        control: f,
        angle: orientation(state.values[i]),
        goal: orientation(state.values[i]),
        motion: 0,
        air: source(
          `${i}-air`,
          "wind",
          x,
          airHeight + 0.1,
          z + 1.02,
          0.11,
          11,
          {
            windIndex: i,
            channel: "air",
          },
        ),
        bearing: source(
          `${i}-bearing`,
          "machine",
          x,
          y + 1.04,
          z + 1.0,
          0.1,
          12,
          { windIndex: i, channel: "bearing" },
        ),
      };
      site.nodes.push(node);
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z,
        w: 0.95,
        d: 0.95,
        h: airHeight - y + 0.3,
        wind: true,
      });
      const proxy = box(
        1.9,
        airHeight - y + 0.3,
        1.9,
        bronze,
        x,
        (y + airHeight + 0.3) / 2,
        z,
      );
      game.cameraSurfaces?.capture(proxy);
      root.remove(proxy);
      proxy.geometry.dispose();
      mergeArchitecture(rotor); // Keep the rotating castings separate from the static supports.
    }
    // Coupler sleeves bridge the small clearance between neighboring castings.
    for (const node of site.nodes)
      for (const [dx, dz, port] of WIND_PORTS.filter(
        ([, , p]) => p === 2 || p === 4,
      )) {
        const next = node.index + (dx || dz * state.columns);
        if (
          (dx && node.index % state.columns === state.columns - 1) ||
          next >= site.nodes.length
        )
          continue;
        const x = node.x + dx * 1.75,
          z = node.z + dz * 1.75;
        const sleeve = add(
          new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12, 1, true),
          bronze,
          x,
          airHeight,
          z,
        );
        sleeve.rotation.set(dx ? 0 : Math.PI / 2, 0, dx ? Math.PI / 2 : 0);
      }
    for (const receiver of [false, true]) {
      const node = site.nodes[receiver ? state.end : state.start],
        x = node.x + (receiver ? 3.2 : -3.2),
        z = node.z,
        y = floor(x, z),
        frame = new THREE.Group();
      frame.position.set(x, airHeight, z);
      frame.rotation.y = Math.PI / 2;
      detail.add(frame);
      add(new THREE.CylinderGeometry(0.75, 1, 0.3, 12), stone, x, y + 0.15, z);
      box(0.45, airHeight - y - 1, 0.55, bronze, x, (y + airHeight - 1) / 2, z);
      add(kit.frame, bronze, 0, 0, 0, frame);
      add(kit.spider, iron, 0, 0, 0, frame);
      const spinner = new THREE.Group();
      frame.add(spinner);
      add(kit.hub, trim, 0, 0, 0, spinner);
      add(kit.vanes, bronze, 0, 0, 0, spinner);
      mergeArchitecture(spinner);
      const duct = add(
        new THREE.CylinderGeometry(0.29, 0.29, 1.7, 12, 1, true),
        bronze,
        x + (receiver ? -0.85 : 0.85),
        airHeight,
        z,
      );
      duct.rotation.z = Math.PI / 2;
      const plaque = makePlaque(receiver ? "RECEIVER" : "WIND IN", 1.5);
      plaque.position.set(x, airHeight + 1.25, z + 0.1);
      detail.add(plaque);
      const sound = source(
        receiver ? "receiver" : "collector",
        receiver ? "machine" : "wind",
        x,
        airHeight,
        z + 0.8,
        receiver ? 0.16 : 0.18,
        receiver ? 20 : 24,
        { channel: receiver ? "receiver" : "collector" },
      );
      site.fans.push({ spinner, sound, receiver });
      game.obstacles.push({
        x: root.position.x + x,
        z: root.position.z + z,
        w: 0.65,
        d: 0.65,
        h: airHeight - y + 1.12,
        wind: true,
      });
    }
    const tx = -10.5,
      tz = 21.5,
      ty = floor(tx, tz);
    box(1.8, 1.1, 0.28, stone, tx, ty + 0.65, tz);
    const label = makePlaque("WIND ENGINE", 1.65);
    label.position.set(tx, ty + 1.01, tz - 0.15);
    label.rotation.y = Math.PI;
    detail.add(label);
    site.tablet = control("tablet", -1, tx, tz - 1.4); // Approach from inside the court's bank.
    game.obstacles.push({
      x: root.position.x + tx,
      z: root.position.z + tz,
      w: 0.95,
      d: 0.3,
      h: 1.2,
      wind: true,
    });
    if (stage > 0) {
      const retired = new Set(
        feature.group.children.filter((m) => m !== feature.marker),
      );
      retired.forEach((m) => (m.visible = false));
      if (game.cameraSurfaces?.pending)
        game.cameraSurfaces.pending = game.cameraSurfaces.pending.filter(
          (e) => !retired.has(e.mesh),
        );
    }
    mergeArchitecture(root);
    batchWindCourt(site);
  }
  updateWindCourts(game, 0);
  return true;
}
export function saveWindState(game, stage, state, event) {
  const site = game.windSites?.[stage],
    clean = normalizeWind({ [stage]: state })[stage];
  if (!windReady(game, site) || !clean) return false;
  (game.progress.wind ??= {})[stage] = clean;
  site.state = restorePuzzle(game.level, stage, clean);
  for (const n of site.nodes) {
    if (event?.kind === "turned" && event.index === n.index) n.goal += 1;
    else if (!event) n.angle = n.goal = orientation(site.state.values[n.index]);
  }
  if (event?.kind === "turned") {
    const n = site.nodes[event.index];
    game.audio.noiseHit?.(
      0.006,
      0.12,
      460,
      new THREE.Vector3(n.air.x, n.bearing.y, n.bearing.z),
    );
    if (game.paused) game.presentationRemaining = 1.2;
  }
  game.save();
  game.renderOnce = true;
  return true;
}
export function updateWindCourts(game, dt) {
  for (const site of game.windSites || []) {
    site.visualTime += Math.max(0, dt);
    const completed =
        game.progress.completed || site.stage < game.progress.stage,
      active = windReady(game, site);
    if (completed) {
      site.state.values = [...site.state.target];
      for (const n of site.nodes)
        n.goal = orientation(site.state.values[n.index]);
    }
    const flow = traceWind(site.state),
      fed = new Set(flow.cells);
    site.flow = flow;
    site.moving = false;
    site.detail.visible =
      game.windFocus === site.stage ||
      !game.player ||
      Math.hypot(
        game.player.position.x - site.root.position.x,
        game.player.position.z - site.root.position.z - 14,
      ) < (site.detail.visible ? 95 : 85);
    if (site.stage > 0) {
      site.feature.core.visible = false;
      if (active) site.feature.marker.visible = false;
    }
    for (const n of site.nodes) {
      const old = n.angle;
      n.angle += (n.goal - n.angle) * (1 - Math.exp(-Math.max(0, dt) * 8));
      if (Math.abs(n.goal - n.angle) < 0.002) n.angle = n.goal;
      n.motion = Math.abs(n.goal - old);
      site.moving ||= n.motion > 0.002;
      // Three.js positive Y rotation turns north toward west; negate for clockwise.
      n.rotor.rotation.y = (-n.angle * Math.PI) / 2;
      n.wheel.rotation.z = (-n.angle * Math.PI) / 2;
      const flowing =
        (active || completed) && fed.has(n.index) && n.motion < 0.08;
      n.flowing = flowing;
      n.glow.emissiveIntensity = flowing ? 0.7 : 0.015;
      n.glow.color.setHex(flowing ? 0x9cbfb6 : 0x566963);
      n.air.activity = flowing ? (completed ? 0.22 : 0.7) : 0;
      n.bearing.activity = active ? Math.min(1, n.motion) * 0.8 : 0;
      n.particles.visible = flowing;
      if (flowing && site.detail.visible) {
        const attr = n.particles.geometry.attributes.position;
        const at = flow.cells.indexOf(n.index),
          previous = at ? flow.cells[at - 1] : -1;
        const inlet =
          previous < 0
            ? 8
            : previous - n.index === -site.state.columns
              ? 1
              : previous - n.index === 1
                ? 2
                : previous - n.index === site.state.columns
                  ? 4
                  : 8;
        // Compare incoming direction with the curve's rotated northern mouth.
        const forward =
          [1, 2, 4, 8][((Math.round(n.goal) % 4) + 4) % 4] === inlet;
        for (let k = 0; k < 6; k++) {
          const t = (site.visualTime * 0.42 + k / 6) % 1,
            p = n.curve.getPoint(forward ? t : 1 - t);
          attr.setXYZ(k, p.x, 0.31, p.z);
        }
        attr.needsUpdate = true;
      }
      if (n.control) {
        n.control.marker.visible = active && game.sense > 0;
        n.control.label = `Duct ${windName(site.state, n.index)} · ${flowing ? "air flowing" : "no airflow"}`;
      }
    }
    for (const f of site.fans) {
      const powered = (active || completed) && (!f.receiver || flow.hit);
      f.spinner.rotation.z += dt * (powered ? 3.2 : 0.12);
      f.sound.activity = powered ? (completed ? 0.2 : 0.7) : 0;
    }
    site.tablet.marker.visible = active;
    syncWindCourt(site);
  }
  const grip = game.windGrip,
    site = game.windSites?.[grip?.stage];
  if (grip && site) {
    if (
      game.paused ||
      site.visualTime > grip.until ||
      !game.grounded ||
      game.swimming ||
      game.blockGrip ||
      game.climb ||
      game.ropeRide ||
      game.dodge ||
      game.player.position.distanceTo(grip.position) > 0.25
    )
      game.windGrip = null;
    else if (game.rig) {
      game.avatar.rotation.y = Math.PI;
      const n = site.nodes[grip.index];
      n.wheel.updateWorldMatrix(true, true);
      poseHands(
        game,
        n.handles.map((h) => h.getWorldPosition(new THREE.Vector3())),
      );
    }
  }
}
export function settleWind(game) {
  game.windGrip = null;
  for (const site of game.windSites || [])
    for (const n of site.nodes)
      n.angle = n.goal = orientation(site.state.values[n.index]);
  updateWindCourts(game, 0);
}
export function windInteract(game) {
  const f = game.nearest;
  if (f?.type !== "wind") return false;
  const site = game.windSites?.[f.stage];
  if (
    !windReady(game, site) ||
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 1.6 ||
    Math.abs(game.player.position.y - f.group.position.y) > 0.8
  )
    return true;
  if (f.kind === "tablet") {
    game.setPaused(true);
    game.cb.puzzle?.(site.feature, game.level);
    return true;
  }
  const state = restorePuzzle(
      game.level,
      f.stage,
      game.progress.wind?.[f.stage],
    ),
    event = applyMove(state, { index: f.index });
  saveWindState(game, f.stage, state, event);
  game.windGrip = {
    stage: f.stage,
    index: f.index,
    until: site.visualTime + 0.55,
    position: game.player.position.clone(),
  };
  game.cb.toast?.(
    isSolved(state)
      ? "The receiver is turning. Activate the engine at its record."
      : "Follow the silver airflow to its next break.",
    2500,
  );
  game.keys.delete("KeyE");
  return true;
}
export function windTarget(game) {
  const site = game.windSites?.[game.progress.stage];
  return windReady(game, site) ? site.tablet : null;
}
export function focusWind(game) {
  const site = game.windSites?.[game.windFocus];
  if (!site || !game.paused) return false;
  const c = site.root.position,
    compact =
      game.renderer.domElement.clientWidth < 600 &&
      game.renderer.domElement.clientHeight > 560;
  game.camera.position.set(
    c.x,
    c.y + (compact ? 28 : 18),
    c.z + (compact ? 33 : 28),
  );
  game.camera.fov = compact
    ? 95
    : game.renderer.domElement.clientHeight <= 560
      ? 52
      : 70;
  game.camera.filmOffset = compact
    ? 0
    : 0.45 *
      game.camera.getFilmWidth() *
      Math.tan((game.camera.fov * Math.PI) / 360) *
      game.camera.aspect;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(
    c.x,
    c.y + (compact ? -12 : 1.5),
    c.z + (compact ? 30 : 14),
  );
  return true;
}
