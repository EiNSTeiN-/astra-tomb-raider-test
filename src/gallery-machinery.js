import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";

const PINION_RADIUS = 0.28;
const PINION_TEETH = 16;
const RACK_PITCH = (Math.PI * 2 * PINION_RADIUS) / PINION_TEETH;

// Drop gates store below their floors. Raising them would carry the bars through
// the shallow gallery roof and into the walkable palace courtyard above.
export function buildGalleryMachinery(game, { add, block, bronze, trim }) {
  const gallery = game.sunkenGallery,
    { root, profile } = gallery;
  const cylinder = (radius, length, material, x, y, z, parent = root) => {
    const mesh = add(
      new THREE.CylinderGeometry(radius, radius, length, 16),
      material,
      x,
      y,
      z,
      parent,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const pipe = (points) => {
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3().copy(points[i - 1]),
        b = new THREE.Vector3().copy(points[i]),
        direction = b.clone().sub(a),
        center = a.clone().add(b).multiplyScalar(0.5);
      const mesh = add(
        new THREE.CylinderGeometry(0.045, 0.045, direction.length(), 8),
        bronze,
        ...center.toArray(),
      );
      mesh.quaternion.setFromUnitVectors(up, direction.normalize());
      add(new THREE.SphereGeometry(0.065, 8, 6), trim, b.x, b.y, b.z);
    }
  };

  for (const site of profile.gates) {
    const group = new THREE.Group();
    group.name = `${site.id} retracting gate`;
    group.position.set(site.x, site.y, site.z);
    root.add(group);
    const bars = Math.floor(site.width / 0.45);
    for (let i = 0; i <= bars; i++)
      block(
        (i / bars - 0.5) * (site.width - 0.3),
        site.height / 2,
        0,
        0.14,
        site.height,
        0.24,
        bronze,
        false,
        group,
      );
    for (const y of [0.18, site.height / 2, site.height - 0.18])
      block(0, y, 0, site.width, 0.28, 0.34, bronze, false, group);

    // The narrow, dark threshold and bronze lips mark the sealed storage slot.
    // The existing floor remains the player's continuous collision surface.
    block(site.x, site.y + 0.005, site.z, site.width, 0.01, 0.44, game.darkMat);
    for (const side of [-1, 1])
      block(
        site.x,
        site.y + 0.025,
        site.z + side * 0.29,
        site.width,
        0.05,
        0.13,
        trim,
      );

    const pinions = [];
    for (const side of [-1, 1]) {
      const rackX = side * (site.width / 2 - 0.23),
        driveX = site.x + rackX - side * PINION_RADIUS,
        driveY = site.y + 0.9,
        driveZ = site.z - 0.26;
      block(
        site.x + side * (site.width / 2 - 0.08),
        site.y + site.height / 2,
        site.z,
        0.25,
        site.height,
        0.7,
        game.stoneMat,
        true,
      );
      for (const face of [-1, 1])
        block(
          site.x + rackX,
          site.y + site.height / 2,
          site.z + face * 0.22,
          0.13,
          site.height,
          0.1,
          trim,
        );
      block(
        rackX,
        site.height / 2,
        -0.26,
        0.11,
        site.height,
        0.18,
        bronze,
        false,
        group,
      );
      for (let y = RACK_PITCH / 2; y < site.height; y += RACK_PITCH)
        block(
          rackX - side * 0.07,
          y,
          -0.26,
          0.12,
          RACK_PITCH * 0.48,
          0.18,
          trim,
          false,
          group,
        );

      const gear = new THREE.Group();
      gear.name = `${site.id} ${side < 0 ? "left" : "right"} pinion`;
      gear.position.set(driveX, driveY, driveZ);
      root.add(gear);
      cylinder(0.235, 0.11, bronze, 0, 0, 0, gear);
      for (let i = 0; i < PINION_TEETH; i++) {
        const angle = (i / PINION_TEETH) * Math.PI * 2;
        const tooth = block(
          Math.cos(angle) * 0.252,
          Math.sin(angle) * 0.252,
          0,
          0.075,
          0.066,
          0.12,
          trim,
          false,
          gear,
        );
        tooth.rotation.z = angle;
      }
      cylinder(0.085, 0.22, trim, 0, 0, -0.04, gear);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        cylinder(
          0.028,
          0.025,
          trim,
          Math.cos(angle) * 0.16,
          Math.sin(angle) * 0.16,
          -0.075,
          gear,
        );
      }
      mergeArchitecture(gear);
      pinions.push({ group: gear, side });
      // Fixed axle bearings and a pressure brake seat the drive into the jamb.
      cylinder(0.12, 0.5, trim, driveX, driveY, site.z + 0.06);
      cylinder(0.2, 0.24, bronze, driveX, driveY, site.z + 0.37);
      block(
        driveX,
        driveY - 0.23,
        site.z + 0.25,
        0.38,
        0.15,
        0.6,
        game.stoneMat,
      );
    }
    block(
      site.x,
      site.y + site.height - 0.16,
      site.z,
      site.width,
      0.32,
      0.7,
      game.stoneMat,
    );
    mergeArchitecture(group);
    const box = {
      min: { x: site.x - site.width / 2, y: site.y, z: site.z - 0.36 },
      max: {
        x: site.x + site.width / 2,
        y: site.y + site.height,
        z: site.z + 0.22,
      },
    };
    gallery.solids.push(box);
    const source = {
      id: `gallery-gate-${site.id}`,
      kind: "machine",
      x: pinions[1].group.position.x,
      y: pinions[1].group.position.y,
      z: pinions[1].group.position.z,
      near: 1.5,
      range: 20,
      gain: 0.14,
      activity: 0,
    };
    gallery.sources.push(source);
    game.soundSources.push(source);
    gallery.gates.push({ site, group, box, source, pinions });
  }

  const wheel = new THREE.Group();
  wheel.name = "Archive emergency wheel";
  wheel.position.copy(profile.wheel);
  root.add(wheel);
  gallery.wheel = wheel;
  add(new THREE.TorusGeometry(0.65, 0.065, 8, 32), trim, 0, 0, 0, wheel);
  cylinder(0.14, 0.45, bronze, 0, 0, 0, wheel);
  for (let i = 0; i < 3; i++)
    block(0, 0, 0, 0.09, 1.25, 0.1, trim, false, wheel).rotation.z =
      (i * Math.PI) / 3;
  mergeArchitecture(wheel);
  const w = profile.wheel;
  block(w.x, w.y - 0.8, w.z + 0.35, 0.7, 1.6, 0.55, game.stoneMat, true);
  block(w.x, w.y, w.z + 0.08, 0.55, 0.55, 0.1, bronze);
  for (const x of [-0.2, 0.2])
    for (const y of [-0.2, 0.2])
      cylinder(0.035, 0.06, trim, w.x + x, w.y + y, w.z + 0.01);
  cylinder(0.21, 0.35, bronze, w.x, w.y, w.z + 0.64);
  // A low manifold keeps the wheel's approach clear. The long return line
  // reaches the room's eastern wall before joining the narrow return passage.
  for (const gate of gallery.gates) {
    const s = gate.site,
      x = s.x + s.width / 2 - 0.18,
      y = s.y + 0.18,
      behind = w.z + 0.64,
      low = w.y - 1.25,
      east = profile.origin.x - 2.18,
      turn = profile.origin.z + 29.5;
    const route =
      s.id === "return"
        ? [
            { x: east, y: low, z: behind },
            { x: east, y: low, z: turn },
            { x: east, y, z: turn },
            { x, y, z: turn },
          ]
        : [
            { x, y: low, z: behind },
            { x, y: low, z: s.z - 1 },
            { x, y, z: s.z - 1 },
          ];
    pipe(
      [
        { x: w.x, y: w.y, z: behind },
        { x: w.x, y: low, z: behind },
        ...route,
        { x, y, z: s.z + 0.45 },
        { x, y: s.y + 0.9, z: s.z + 0.45 },
        { x: gate.source.x, y: s.y + 0.9, z: s.z + 0.45 },
      ].filter(
        (point, i, all) =>
          !i ||
          new THREE.Vector3().copy(point).distanceToSquared(all[i - 1]) > 1e-8,
      ),
    );
    pipe([
      { x: gate.source.x, y: s.y + 0.9, z: s.z + 0.45 },
      { x: gate.source.x, y: s.y + 0.12, z: s.z + 0.45 },
      { x: gate.pinions[0].group.position.x, y: s.y + 0.12, z: s.z + 0.45 },
      { x: gate.pinions[0].group.position.x, y: s.y + 0.9, z: s.z + 0.45 },
    ]);
  }
}

export function updateGalleryMachinery(game, dt) {
  const gallery = game.sunkenGallery,
    target = game.progress.gallery.opened ? 1 : 0;
  gallery.lift = Math.min(target, gallery.lift + dt * 0.65);
  const t = gallery.lift,
    eased = t * t * (3 - 2 * t),
    activity = !game.paused && t < target ? 4 * t * (1 - t) : 0;
  for (const gate of gallery.gates) {
    const drop = eased * (gate.site.height + 0.65);
    gate.group.position.y = gate.site.y - drop;
    gate.group.visible = t < 1;
    gate.box.min.y = gate.site.y - drop;
    gate.box.max.y = gate.site.y - drop + gate.site.height;
    for (const pinion of gate.pinions)
      pinion.group.rotation.z = (-pinion.side * drop) / PINION_RADIUS;
    gate.source.activity = activity;
  }
  gallery.wheel.rotation.z = -eased * Math.PI * 2;
}
