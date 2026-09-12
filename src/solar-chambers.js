import * as THREE from "three";
import { createPuzzle, restorePuzzle } from "./puzzles.js";
import { solarLocal, traceSolar, normalizeSolar } from "./solar-rules.js";
import { fieldComplete } from "./expeditions.js";
import { counterweightsReady } from "./counterweights.js";
import { mergeArchitecture } from "./visuals.js";
import { boxEntry } from "./camera-collision.js";
import { addSolarWheelMount } from "./solar-mounts.js";

export function solarReady(game, site) {
  if (!site) return false;
  return (
    game.progress.completed ||
    game.progress.stage > site.stage ||
    (game.progress.stage === site.stage &&
      fieldComplete(game.level, game.progress, site.stage) &&
      counterweightsReady(game, site.feature))
  );
}

function numberMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e7cf8d";
  ctx.font = "52px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 10; i++) ctx.fillText(String(i + 1), 64 + i * 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
}
function numberPlaque(index, material) {
  const geometry = new THREE.PlaneGeometry(0.45, 0.45),
    uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) + index) / 10);
  const plaque = new THREE.Mesh(geometry, material);
  plaque.position.set(1.03, 0.73, 0);
  plaque.rotation.y = Math.PI / 2;
  return plaque;
}

export function buildSolarChambers(game) {
  game.solarSites = [];
  game.solarSources = [];
  if (game.level.biome !== "desert") return false;
  const numbers = numberMaterial();
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xc4a35c,
    metalness: 0.78,
    roughness: 0.32,
  });
  const mirrorMaterial = new THREE.MeshPhysicalMaterial({
    name: "Silvered solar reflectors",
    color: 0xdbe4db,
    metalness: 1,
    roughness: 0.07,
    clearcoat: 0.5,
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3.2, 2.1, 0.7),
    toneMapped: false,
  });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdb87,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  for (const feature of game.items.filter((f) => f.type === "mechanism")) {
    const stage = feature.stage,
      state = restorePuzzle(game.level, stage, game.progress.solar?.[stage]);
    if (game.progress.completed || stage < game.progress.stage)
      state.values = [...state.target];
    const root = new THREE.Group();
    root.name = `Solar chamber ${stage + 1}`;
    root.position.copy(feature.group.position);
    game.world.add(root);
    const floor = (p) =>
      game.groundHeight(root.position.x + p.x, root.position.z + p.z) -
      root.position.y;
    const anchors = [state.start, ...state.mirrors, state.end].map(solarLocal);
    const beamY = Math.max(...anchors.map(floor)) + 2.7;
    const site = {
      stage,
      feature,
      root,
      state,
      initial: createPuzzle(game.level, stage).values,
      beamY,
      mirrors: [],
      trace: null,
      aligned: false,
      active: false,
      segments: [],
      signature: "",
      sourceIds: [],
    };
    game.solarSites.push(site);
    const add = (geo, mat, x, y, z, parent = root) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const obstacle = (p, w = 0.95, d = 0.95) =>
      game.obstacles.push({
        x: root.position.x + p.x,
        z: root.position.z + p.z,
        w,
        d,
        h: beamY - floor(p) + 1,
        solar: true,
      });
    const marker = (group, x = 0) => {
      const m = add(
        new THREE.OctahedronGeometry(0.13),
        coreMaterial,
        x,
        3.4,
        0,
        group,
      );
      m.castShadow = false;
      m.userData.animated = true;
      return m;
    };
    const featureAt = (group, p, label, kind, index) => {
      const f = {
        id: `solar-${stage}-${kind}-${index ?? 0}`,
        type: "solar",
        kind,
        stage,
        index,
        label,
        x: (root.position.x + p.x) / 7,
        z: (root.position.z + p.z) / 7,
        group,
        marker: marker(group, kind === "mirror" ? 1.35 : 0),
      };
      game.items.push(f);
      return f;
    };
    state.mirrors.forEach((cell, index) => {
      const p = solarLocal(cell),
        ground = floor(p),
        group = new THREE.Group();
      group.position.set(p.x, ground, p.z);
      root.add(group);
      game.cylinder(0.67, 0.83, 0.45, game.darkMat, 0, 0.225, 0, group, 20);
      game.cylinder(0.46, 0.63, 0.14, bronze, 0, 0.53, 0, group, 24);
      game.cylinder(
        0.18,
        0.28,
        beamY - ground - 0.55,
        bronze,
        0,
        (beamY - ground + 0.55) / 2,
        0,
        group,
        16,
      );
      const pivot = new THREE.Group();
      pivot.userData.cameraDynamic = true;
      pivot.position.y = beamY - ground;
      group.add(pivot);
      // The two diagonal normals implement the same reflection law as the grid.
      pivot.rotation.y = state.values[index] ? -Math.PI / 4 : Math.PI / 4;
      const face = add(
        new THREE.PlaneGeometry(1.78, 1.52),
        mirrorMaterial,
        0,
        0,
        0,
        pivot,
      );
      face.receiveShadow = false;
      for (const side of [-1, 1]) {
        game.box(0.12, 1.85, 0.16, bronze, side * 0.97, 0, 0, pivot);
        game.box(2.05, 0.12, 0.16, bronze, 0, side * 0.88, 0, pivot);
      }
      // A separate support captures the thin reflective face for camera collision.
      game.box(2.05, 1.82, 0.14, bronze, 0, 0, -0.09, pivot);
      const wheel = add(
        new THREE.TorusGeometry(0.34, 0.045, 8, 24),
        bronze,
        1.04,
        1.03,
        0,
        group,
      );
      wheel.rotation.y = Math.PI / 2;
      wheel.userData.animated = true;
      addSolarWheelMount(group, wheel, bronze);
      for (let spoke = 0; spoke < 4; spoke++) {
        const bar = game.box(0.04, 0.62, 0.04, bronze, 0, 0, 0, wheel);
        bar.rotation.z = (spoke * Math.PI) / 4;
      }
      mergeArchitecture(wheel);
      group.add(numberPlaque(index, numbers));
      const f = featureAt(
        group,
        { x: p.x + 1.35, z: p.z },
        `Turn solar mirror ${index + 1}`,
        "mirror",
        index,
      );
      obstacle(p);
      mergeArchitecture(pivot);
      mergeArchitecture(group);
      site.mirrors.push({ pivot, wheel, feature: f, motion: 0 });
      const id = `solar-bearing-${stage}-${index}`;
      site.sourceIds.push(id);
      game.solarSources.push({
        id,
        kind: "machine",
        x: f.x * 7,
        y: root.position.y + ground + 1.05,
        z: f.z * 7,
        gain: 0.2,
        near: 1.5,
        range: 14,
        solarStage: stage,
        solarMirror: index,
        activity: 0,
      });
    });
    const source = solarLocal(state.start),
      receiver = solarLocal(state.end);
    for (const [kind, p] of [
      ["source", source],
      ["receiver", receiver],
    ]) {
      const ground = floor(p),
        group = new THREE.Group();
      group.position.set(p.x, ground, p.z);
      root.add(group);
      game.cylinder(0.75, 1.02, 0.5, game.darkMat, 0, 0.25, 0, group, 24);
      game.cylinder(
        0.36,
        0.57,
        beamY - ground - 0.4,
        game.stoneMat,
        0,
        (beamY - ground + 0.4) / 2,
        0,
        group,
        24,
      );
      const lensMaterial = new THREE.MeshStandardMaterial({
        color: kind === "receiver" ? 0x608b78 : 0xcbd4b0,
        metalness: 0.35,
        roughness: 0.2,
        emissive: 0xe7c579,
        emissiveIntensity: 0.1,
      });
      const lens = add(
        new THREE.SphereGeometry(0.57, 24, 16),
        lensMaterial,
        0,
        beamY - ground,
        0,
        group,
      );
      lens.scale.x = 0.23;
      const ring = add(
        new THREE.TorusGeometry(0.66, 0.1, 12, 32),
        bronze,
        0,
        beamY - ground,
        0,
        group,
      );
      ring.rotation.y = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        add(
          new THREE.OctahedronGeometry(0.09),
          bronze,
          0,
          beamY - ground + Math.cos(a) * 0.83,
          Math.sin(a) * 0.83,
          group,
        );
      }
      obstacle(p, 1.15, 1.15);
      if (kind === "source") {
        site.sourceLens = lensMaterial;
        const shade = game.box(
          0.2,
          1.5,
          1.5,
          game.darkMat,
          -0.32,
          beamY - ground,
          0,
          group,
        );
        shade.userData.animated = true;
        site.shutter = shade;
        const sun = (game.sunOffset?.clone() || new THREE.Vector3(-70, 55, 45))
          .normalize()
          .multiplyScalar(9);
        const feed = add(
          new THREE.CylinderGeometry(0.12, 0.035, 9, 8),
          haloMaterial,
          sun.x / 2,
          beamY - ground + sun.y / 2,
          sun.z / 2,
          group,
        );
        feed.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          sun.normalize(),
        );
        site.feed = feed;
        feed.userData.animated = true;
      } else {
        site.receiverLens = lensMaterial;
        // The receiver's control sits on its east side, clear of the pedestal.
        const control = new THREE.Group();
        control.position.set(p.x + 1.55, ground, p.z);
        root.add(control);
        game.cylinder(0.28, 0.38, 0.8, bronze, 0, 0.4, 0, control, 16);
        const sun = add(
          new THREE.OctahedronGeometry(0.22),
          lensMaterial,
          0,
          1.05,
          0,
          control,
        );
        site.receiver = featureAt(
          control,
          { x: p.x + 1.55, z: p.z },
          "Activate the solar receiver",
          "receiver",
        );
        site.receiverCore = sun;
        game.solarSources.push({
          id: `solar-receiver-${stage}`,
          kind: "crystal",
          x: site.receiver.x * 7,
          y: root.position.y + ground + 1.2,
          z: site.receiver.z * 7,
          gain: 0.12,
          near: 2,
          range: 18,
          solarStage: stage,
          activity: 0,
        });
      }
      mergeArchitecture(group);
    }
    site.beams = [coreMaterial, haloMaterial].map((mat) => {
      const mesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 6),
        mat,
        48,
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      root.add(mesh);
      return mesh;
    });
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(96 * 3), 3),
    );
    site.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0xffd8a0,
        size: 0.04,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    site.dust.frustumCulled = false;
    root.add(site.dust);
    // The engravings form a readable coordinate grid without raising the floor.
    const gridMaterial = new THREE.MeshStandardMaterial({
      color: 0xa17f43,
      metalness: 0.5,
      roughness: 0.5,
    });
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 6; col++) {
        const p = solarLocal({ x: col, y: row }),
          y = floor(p) + 0.03;
        game.box(0.32, 0.035, 0.035, gridMaterial, p.x, y, p.z, root);
        game.box(0.035, 0.035, 0.32, gridMaterial, p.x, y, p.z, root);
      }
    // Copies preserve the original local transforms retained for camera bounds.
    // Static fittings batch across the court; mirrors and handwheels stay movable.
    for (const group of [...root.children].filter((child) => child.isGroup)) {
      group.updateMatrix();
      for (const child of [...group.children]) {
        if (!child.isMesh || child.isInstancedMesh || child.userData.animated)
          continue;
        const copy = child.clone(false);
        copy.applyMatrix4(group.matrix);
        root.add(copy);
        group.remove(child);
      }
    }
    mergeArchitecture(root);
  }
  updateSolarChambers(game, 100);
  return true;
}

// Stop a missed beam at solid architecture or terrain rather than drawing through it.
export function clipSolarSegment(game, a, b) {
  let fraction = 1;
  for (const o of game.obstacles) {
    if (o.solar || o.h <= 0.2) continue;
    const y = game.groundHeight(o.x, o.z);
    const t = boxEntry(
      a,
      b,
      {
        min: { x: o.x - o.w, y, z: o.z - o.d },
        max: { x: o.x + o.w, y: y + o.h, z: o.z + o.d },
      },
      0,
      true,
    );
    if (t !== null) fraction = Math.min(fraction, t);
  }
  const distance = a.distanceTo(b),
    steps = Math.ceil(distance / 0.3);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (t >= fraction) break;
    const p = a.clone().lerp(b, t);
    if (game.groundHeight(p.x, p.z) > p.y - 0.025) {
      fraction = Math.max(0, (i - 1) / steps);
      break;
    }
  }
  return { end: a.clone().lerp(b, fraction), blocked: fraction < 0.999 };
}

export function updateSolarChambers(game, dt) {
  const dummy = new THREE.Object3D(),
    axis = new THREE.Vector3(0, 1, 0);
  for (const site of game.solarSites || []) {
    const completed =
      game.progress.completed || site.stage < game.progress.stage;
    const values = completed
      ? site.state.target
      : game.progress.solar?.[site.stage]?.values || site.initial;
    site.state.values = [...values];
    site.active = solarReady(game, site);
    const moving = new Set();
    site.mirrors.forEach((m, i) => {
      const angle = values[i] ? -Math.PI / 4 : Math.PI / 4,
        before = m.pivot.rotation.y;
      m.pivot.rotation.y = THREE.MathUtils.damp(before, angle, 9, dt);
      m.motion = Math.abs(m.pivot.rotation.y - before) / Math.max(0.001, dt);
      m.wheel.rotation.z += m.motion * dt;
      if (Math.abs(m.pivot.rotation.y - angle) > 0.01) moving.add(i);
      m.feature.marker.visible =
        site.stage === game.progress.stage && site.active && game.sense > 0;
    });
    site.shutter.position.y =
      site.beamY - site.shutter.parent.position.y + (site.active ? 1.7 : 0);
    site.sourceLens.emissiveIntensity = site.active ? 1.5 : 0.1;
    site.feed.visible = site.active;
    const signature = `${values.join("")}:${[...moving]}:${site.active}:${game.fieldGates?.[site.stage]?.obstacle.h}:${game.fieldGates?.[site.stage]?.amount?.toFixed(3)}`;
    if (site.signature !== signature) {
      site.signature = signature;
      site.trace = traceSolar(site.state, moving);
      site.segments = [];
      const ray = site.trace.points.filter(
        (p, i, list) =>
          i === 0 ||
          i === list.length - 1 ||
          (p.x - list[i - 1].x) * (list[i + 1].y - p.y) !==
            (p.y - list[i - 1].y) * (list[i + 1].x - p.x),
      );
      if (site.active)
        for (let i = 1; i < ray.length; i++) {
          const a = solarLocal(ray[i - 1]),
            b = solarLocal(ray[i]);
          const start = new THREE.Vector3(a.x, site.beamY, a.z).add(
              site.root.position,
            ),
            end = new THREE.Vector3(b.x, site.beamY, b.z).add(
              site.root.position,
            );
          const clipped = clipSolarSegment(game, start, end);
          site.segments.push([
            start.sub(site.root.position),
            clipped.end.sub(site.root.position),
          ]);
          if (clipped.blocked) {
            site.trace.hit = false;
            break;
          }
        }
      site.aligned = site.active && site.trace.hit && moving.size === 0;
      site.beams.forEach((mesh, pass) => {
        mesh.count = Math.min(site.segments.length, 48);
        site.segments.slice(0, 48).forEach(([a, b], i) => {
          const direction = b.clone().sub(a),
            length = direction.length();
          dummy.position.copy(a).add(b).multiplyScalar(0.5);
          dummy.quaternion.setFromUnitVectors(axis, direction.normalize());
          dummy.scale.set(pass ? 0.11 : 0.027, length, pass ? 0.11 : 0.027);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
    const near =
      !game.player ||
      site.root.position.distanceTo(game.player.position) <
        (site.root.visible ? 125 : 115);
    site.root.visible = near;
    site.beams.forEach((m) => (m.visible = site.active && near));
    site.dust.visible = site.active && near && site.segments.length > 0;
    site.receiverLens.emissiveIntensity = site.aligned ? 2.1 : 0.1;
    site.receiver.marker.visible =
      site.stage === game.progress.stage && site.aligned;
    if (site.dust.visible) {
      const p = site.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const [a, b] = site.segments[i % site.segments.length],
          t = (i * 0.6180339 + (game.elapsed || 0) * 0.12) % 1;
        p.setXYZ(
          i,
          THREE.MathUtils.lerp(a.x, b.x, t) + Math.sin(i * 13) * 0.07,
          site.beamY + Math.sin(i * 11 + (game.elapsed || 0)) * 0.09,
          THREE.MathUtils.lerp(a.z, b.z, t) + Math.cos(i * 17) * 0.07,
        );
      }
      p.needsUpdate = true;
    }
  }
  const target = solarTarget(game);
  if (target) target.marker.visible = true;
}

export function saveSolarState(game, stage, state) {
  const clean = normalizeSolar({ [stage]: state })[stage];
  if (!clean) return false;
  game.progress.solar ||= {};
  game.progress.solar[stage] = clean;
  game.save();
  return true;
}

export function solarInteract(game) {
  const f = game.nearest;
  if (f?.type !== "solar") return false;
  const site = game.solarSites?.find((s) => s.stage === f.stage);
  if (!site || site.stage !== game.progress.stage || !solarReady(game, site))
    return true;
  if (
    Math.hypot(
      game.player.position.x - f.x * 7,
      game.player.position.z - f.z * 7,
    ) > 2.25 ||
    Math.abs(game.player.position.y - game.groundHeight(f.x * 7, f.z * 7)) > 1.5
  )
    return true;
  if (f.kind === "mirror") {
    const state = restorePuzzle(
      game.level,
      site.stage,
      game.progress.solar?.[site.stage],
    );
    state.values[f.index] = 1 - state.values[f.index];
    state.moves++;
    saveSolarState(game, site.stage, state);
    game.audio.noiseHit?.(0.045, 0.22, 420, game.player.position);
    game.cb.toast?.(
      `Mirror ${f.index + 1} turns. Follow the reflected light.`,
      2200,
    );
  } else if (site.aligned) game.solve(site.feature);
  else
    game.cb.toast?.(
      "The receiver is dark. Follow the beam back to the mirrors.",
    );
  game.keys.clear();
  return true;
}

export function solarTarget(game) {
  const site = game.solarSites?.find((s) => s.stage === game.progress.stage);
  if (!site || !solarReady(game, site)) return null;
  if (site.aligned) return site.receiver;
  const last = site.trace?.mirrors.at(-1) ?? 0;
  return site.mirrors[last]?.feature || null;
}
