import * as THREE from "three";
import { spawnBolt } from "./combat.js";
import { mergeArchitecture } from "./visuals.js";
import { softParticleMaterial } from "./effects.js";

export const HAZARD_TYPES = {
  jungle: {
    kind: "blade",
    name: "Swinging shrine blade",
    period: 7,
    warning: 1.4,
    active: 2.2,
    damage: 18,
    color: 0xd8ad72,
    hint: "The blade crosses the marked strip. Wait for its return or dodge clear.",
  },
  desert: {
    kind: "darts",
    name: "Sun-dart gallery",
    period: 6.5,
    warning: 1.2,
    active: 0.8,
    damage: 12,
    color: 0xe7bc72,
    hint: "The side ports fire across the station. Approach between volleys.",
  },
  snow: {
    kind: "ice",
    name: "Fractured ice crown",
    period: 8,
    warning: 1.7,
    active: 1.1,
    damage: 22,
    color: 0xb0e3ef,
    hint: "Falling ice marks your position before it drops. Move out of the circle.",
  },
  water: {
    kind: "jet",
    name: "Pressure spillway",
    period: 7,
    warning: 1.3,
    active: 2,
    damage: 12,
    color: 0x76cbd7,
    hint: "The pressure jets cycle off. Reach the station during the quiet interval.",
  },
  volcano: {
    kind: "vent",
    name: "Furnace vent",
    period: 8,
    warning: 1.6,
    active: 2.3,
    damage: 20,
    color: 0xff8c52,
    hint: "The furnace vents after the warning glow. Use the clear interval to reach its control.",
  },
  sky: {
    kind: "gust",
    name: "Crosswind channel",
    period: 7,
    warning: 1.1,
    active: 2.6,
    damage: 0,
    color: 0xc7e3ce,
    hint: "Crosswinds push across the station. Brace against the wind or move between gusts.",
  },
  crystal: {
    kind: "beam",
    name: "Resonant sweep",
    period: 8,
    warning: 1.3,
    active: 3,
    damage: 15,
    color: 0xbca3f2,
    hint: "The crystal ray sweeps at waist height. Jump its path or keep behind the emitter.",
  },
  eclipse: {
    kind: "pulse",
    name: "Meridian pulse",
    period: 7.5,
    warning: 1.5,
    active: 2.5,
    damage: 18,
    color: 0xe2b6e7,
    hint: "The ground pulse expands from the station. Jump the ring as it reaches you.",
  },
};
export function hazardPhase(time, spec, offset = 0) {
  const t = (((time + offset) % spec.period) + spec.period) % spec.period;
  return t < spec.warning
    ? { phase: "warning", progress: t / spec.warning }
    : t < spec.warning + spec.active
      ? { phase: "active", progress: (t - spec.warning) / spec.active }
      : {
          phase: "rest",
          progress:
            (t - spec.warning - spec.active) /
            (spec.period - spec.warning - spec.active),
        };
}
export function hazardDisabled(hazard, progress) {
  return (
    progress.completed ||
    progress.stage > hazard.stage ||
    progress.field.includes(hazard.fieldId)
  );
}
export function hazardContact(hazard, position, jumpHeight = 0) {
  const x = position.x - hazard.x,
    z = position.z - hazard.z,
    y = position.y - hazard.y;
  if (hazard.phase !== "active") return false;
  switch (hazard.spec.kind) {
    case "blade":
      return (
        Math.abs(z) < 1.05 &&
        Math.abs(x - hazard.bladeX) < 1.05 &&
        Math.abs(y + 1 - hazard.bladeY) < 1.25
      );
    case "ice":
      return (
        hazard.progress > 0.76 &&
        Math.hypot(position.x - hazard.aim.x, position.z - hazard.aim.z) < 2 &&
        y < 3
      );
    case "jet":
      return Math.abs(x) < 4.6 && Math.abs(z) < 1.15 && y < 4;
    case "vent":
      return Math.hypot(x, z) < 3.2 && y < 4.6;
    case "gust":
      return Math.abs(x) < 6 && Math.abs(z) < 2.5 && y < 4;
    case "beam": {
      const dx = Math.cos(hazard.angle),
        dz = Math.sin(hazard.angle),
        along = x * dx + z * dz,
        across = Math.abs(x * dz - z * dx);
      return along > 0.8 && along < 7 && across < 0.55 && y < 1.15;
    }
    case "pulse":
      return (
        Math.abs(Math.hypot(x, z) - hazard.progress * 7) < 0.65 &&
        jumpHeight < 1.05 &&
        y < 1.3
      );
    default:
      return false;
  }
}

export function buildHazards(game) {
  game.hazards = [];
  game.hazardTutorials = new Set();
  const spec = HAZARD_TYPES[game.level.biome];
  for (let stage = 0; stage < game.level.mechanisms; stage++) {
    const fields = game.items.filter(
      (f) => f.type === "field" && f.stage === stage,
    );
    const f = [fields[1], fields[2], fields[0]].find(
      (f) => f && f.kind !== "climb",
    );
    // These connected routes supply their own moving-platform or wind hazards.
    if (
      !f ||
      f.causewayHeight !== undefined ||
      f.shutterHeight !== undefined ||
      f.arcadeHeight !== undefined ||
      f.sunHeight !== undefined
    )
      continue;
    const x = f.x * 7,
      z = f.z * 7,
      y =
        f.stairHeight !== undefined ||
        f.reflectorHeight !== undefined ||
        f.gardenHeight !== undefined ||
        f.craneHeight !== undefined ||
        f.cartHeight !== undefined
          ? (f.group?.position.y ??
            game.groundHeight(x, z) +
              (f.stairHeight ??
                f.reflectorHeight ??
                f.gardenHeight ??
                f.craneHeight ??
                f.cartHeight))
          : game.groundHeight(x, z),
      root = new THREE.Group();
    root.position.set(x, y, z);
    game.world.add(root);
    const glow = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const warningRadius =
      { blade: 5.2, darts: 6, jet: 5, gust: 6.5, beam: 7, pulse: 7 }[
        spec.kind
      ] || 3.65;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(warningRadius - 0.2, warningRadius, 48),
      glow.clone(),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.07;
    root.add(marker);
    const hazard = {
      id: `hazard-${stage}`,
      stage,
      fieldId: f.id,
      x,
      y,
      z,
      root,
      marker,
      spec,
      phase: "rest",
      progress: 0,
      offset: stage * 1.83,
      aim: new THREE.Vector3(x, y, z),
      fx: new THREE.Group(),
      bladeX: 0,
      bladeY: 1,
      angle: 0,
      lastCycle: -1,
    };
    root.add(hazard.fx);
    const stone = game.darkMat,
      gold = game.goldMat;
    const box = (w, h, d, mat, px, py, pz, parent = root) =>
      game.box(w, h, d, mat, px, py, pz, parent);
    if (spec.kind === "blade") {
      for (const side of [-1, 1]) {
        const pier = box(0.6, 7, 0.6, stone, side * 5.5, 3.5, 0);
        if (f.gardenHeight !== undefined) {
          game.cameraSurfaces?.capture(pier);
          game.rainGarden?.solids.push({
            x: x + side * 5.5,
            z,
            w: 0.3,
            d: 0.3,
            bottom: y,
            top: y + 7,
          });
        }
        box(0.9, 0.24, 0.9, gold, side * 5.5, 7, 0);
      }
      box(12, 0.55, 0.8, stone, 0, 7.35, 0);
      hazard.fx.position.y = 6.7;
      box(0.14, 5, 0.14, gold, 0, -2.5, 0, hazard.fx);
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-1.5, 0.15);
      bladeShape.lineTo(-0.4, 0.38);
      bladeShape.lineTo(0.4, 0.38);
      bladeShape.lineTo(1.5, 0.15);
      bladeShape.quadraticCurveTo(0.8, -1.05, 0, -1.12);
      bladeShape.quadraticCurveTo(-0.8, -1.05, -1.5, 0.15);
      const blade = new THREE.Mesh(
        new THREE.ExtrudeGeometry(bladeShape, {
          depth: 0.16,
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.025,
          bevelSegments: 2,
          steps: 1,
          curveSegments: 16,
        }),
        gold,
      );
      blade.position.y = -5;
      hazard.fx.add(blade);
    } else if (spec.kind === "darts") {
      if (f.reflectorHeight !== undefined) {
        // Ports in the east parapet leave the west service jump open.
        const parapet = box(0.35, 2.2, 3.5, stone, 3.95, 1.1, -0.5);
        game.cameraSurfaces?.capture(parapet);
        game.easternReflector?.solids.push({
          x: x + 3.95,
          z: z - 0.5,
          w: 0.175,
          d: 1.75,
          bottom: y,
          top: y + 2.2,
        });
        for (const dz of [-1.3, 0, 1.3])
          game.cylinder(
            0.13,
            0.13,
            0.2,
            glow,
            3.72,
            1.2,
            dz,
            root,
            8,
          ).rotation.z = Math.PI / 2;
        hazard.dartStart = 3.55;
        hazard.dartEnd = -6;
        marker.scale.set(0.62, 0.25, 1);
        marker.position.z = -0.5;
      } else
        for (const side of [-1, 1]) {
          box(0.8, 2.8, 5.5, stone, side * 5.7, 1.4, 0);
          for (const dz of [-1.3, 0, 1.3])
            game.cylinder(
              0.13,
              0.13,
              0.2,
              glow,
              side * 5.21,
              1.3,
              dz,
              root,
              8,
            ).rotation.z = Math.PI / 2;
        }
    } else if (spec.kind === "ice") {
      if (f.stairHeight !== undefined) {
        // Fit this crown to the surviving service gallery. The wide field
        // frame would otherwise put its eastern pier through the stair landing.
        const timber = game.monasteryMaterials?.wood || stone;
        for (const side of [-1, 1]) {
          box(0.28, 8, 0.3, timber, side * 1.5, 4, 0);
          game.frozenStair?.solids.push({
            x: x + side * 1.5,
            z,
            w: 0.14,
            d: 0.15,
            bottom: y,
            top: y + 8,
          });
        }
        box(3.8, 0.35, 0.55, timber, 0, 8, 0);
      } else {
        for (const side of [-1, 1]) box(0.65, 8, 0.7, stone, side * 4.8, 4, 0);
        box(10, 0.7, 1.1, stone, 0, 8, 0);
      }
      const ice = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 3.8, 6),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: 0.15,
          metalness: 0.2,
          transparent: true,
          opacity: 0.82,
        }),
      );
      ice.rotation.z = Math.PI;
      hazard.fx.add(ice);
    } else if (["jet", "vent", "gust"].includes(spec.kind)) {
      for (const dx of f.cartHeight !== undefined
        ? [-1.6, 0, 1.6]
        : [-3, 0, 3]) {
        game.cylinder(0.62, 0.8, 0.28, stone, dx, 0.15, 0, root, 12);
        game.cylinder(0.45, 0.45, 0.08, gold, dx, 0.32, 0, root, 12);
      }
      const positions = new Float32Array(100 * 3);
      for (let i = 0; i < 100; i++) {
        positions[i * 3] = Math.sin(i * 13.3) * 3.6;
        positions[i * 3 + 1] = ((i % 17) / 17) * 5;
        positions[i * 3 + 2] = Math.cos(i * 7.1) * 0.6;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      const points = new THREE.Points(
        geometry,
        softParticleMaterial({
          color: spec.color,
          size: spec.kind === "vent" ? 0.22 : 0.12,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      hazard.fx.add(points);
      hazard.particles = points;
      if (spec.kind === "vent") {
        const fire = new THREE.Mesh(
          new THREE.ConeGeometry(1.2, 5.5, 8),
          new THREE.MeshBasicMaterial({ color: spec.color }),
        );
        fire.position.y = 2.6;
        fire.userData.hazardId = hazard.id;
        root.add(fire);
        game.flames.push(fire);
        hazard.fire = fire;
      }
    } else if (spec.kind === "beam") {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        game.glowMat,
      );
      crystal.position.set(0, 2.4, 0);
      root.add(crystal);
      game.cylinder(0.3, 0.65, 2, stone, 0, 1, 0, root, 8);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.15, 7, 8),
        glow,
      );
      beam.rotation.z = -Math.PI / 2;
      beam.position.set(3.5, 1.05, 0);
      hazard.fx.add(beam);
    } else if (spec.kind === "pulse") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.08, 8, 48),
        game.goldMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.35;
      root.add(ring);
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.91, 1, 64), glow);
      wave.rotation.x = -Math.PI / 2;
      wave.position.y = 0.25;
      hazard.fx.add(wave);
      hazard.wave = wave;
    }
    mergeArchitecture(root);
    game.hazards.push(hazard);
  }
}

export function updateHazards(game, dt) {
  for (const h of game.hazards || []) {
    const disabled = hazardDisabled(h, game.progress),
      distance = Math.hypot(
        game.player.position.x - h.x,
        game.player.position.z - h.z,
      );
    h.disabled = disabled;
    h.root.visible = distance < 130;
    if (disabled) {
      h.phase = "rest";
      h.fx.visible = h.spec.kind === "blade";
      if (h.spec.kind === "blade") h.fx.rotation.z = -1;
      h.marker.visible = false;
      if (h.fire) h.fire.visible = false;
      continue;
    }
    const previous = h.phase,
      state = hazardPhase(game.elapsed, h.spec, h.offset);
    h.phase = state.phase;
    h.progress = state.progress;
    h.fx.visible =
      h.phase === "active" || ["blade", "ice"].includes(h.spec.kind);
    h.marker.visible = h.phase !== "rest";
    h.marker.material.opacity =
      h.phase === "warning" ? 0.2 + h.progress * 0.45 : 0.75;
    if (distance < 14 && !game.hazardTutorials.has(h.spec.kind)) {
      game.hazardTutorials.add(h.spec.kind);
      game.cb.toast?.(h.spec.hint, 6500);
    }
    if (h.phase === "warning" && previous !== "warning") {
      h.aim.copy(
        distance < 9 ? game.player.position : new THREE.Vector3(h.x, h.y, h.z),
      );
      game.audio.noiseHit?.(0.028, 0.45, 1200, h.root.position);
    }
    if (h.phase === "active" && previous !== "active") {
      game.audio.noiseHit?.(
        0.06,
        0.5,
        h.spec.kind === "ice" ? 2300 : 650,
        h.root.position,
      );
      if (h.spec.kind === "darts")
        for (const dz of [-1.3, 0, 1.3]) {
          spawnBolt(game, {
            group: {
              position: new THREE.Vector3(
                h.x + (h.dartStart ?? -5),
                h.y - 1.15,
                h.z + dz,
              ),
            },
            aim: new THREE.Vector3(h.x + (h.dartEnd ?? 6), h.y, h.z + dz),
            spec: h.spec,
          });
        }
    }
    if (h.spec.kind === "blade") {
      const angle =
        h.phase === "active" ? Math.sin(h.progress * Math.PI * 2) * 1.0 : -1;
      h.fx.rotation.z = angle;
      h.bladeX = 5 * Math.sin(angle);
      h.bladeY = 6.7 - 5 * Math.cos(angle);
    } else if (h.spec.kind === "ice") {
      h.fx.position.set(
        h.aim.x - h.x,
        h.phase === "active" ? 8 - h.progress * h.progress * 8 : 8,
        h.aim.z - h.z,
      );
      h.marker.position.set(h.aim.x - h.x, 0.08, h.aim.z - h.z);
      h.marker.scale.setScalar(0.6);
    } else if (h.spec.kind === "beam") {
      h.angle = h.progress * Math.PI * 2;
      h.fx.rotation.y = -h.angle;
    } else if (h.spec.kind === "pulse")
      h.wave.scale.setScalar(Math.max(0.01, h.progress * 7));
    if (h.fire) h.fire.visible = h.phase === "active";
    if (h.particles && h.phase === "active") {
      const p = h.particles.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (h.spec.kind === "gust")
          p.setX(i, ((p.getX(i) + dt * 9 + 6) % 12) - 6);
        else p.setY(i, (p.getY(i) + dt * (h.spec.kind === "jet" ? 8 : 5)) % 5);
      }
      p.needsUpdate = true;
    }
    if (hazardContact(h, game.player.position, game.jumpY)) {
      if (h.spec.kind === "gust") {
        const x = game.player.position.x + dt * 3.5;
        if (game.canMove(x, game.player.position.z, game.jumpY)) {
          game.player.position.x = x;
          game.player.position.y =
            game.groundHeight(x, game.player.position.z) + game.jumpY;
        }
        game.stamina = Math.max(0, game.stamina - dt * 8);
      } else game.damage(h.spec.damage);
    }
  }
}
