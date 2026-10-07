import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { windSurface } from "./wind-art.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { buildCableFrameArt } from "./cable-frame-art.js";

export const RETURN_CABLE_HEIGHT = 2.55;
export const RETURN_CABLE_OVERRUN = 0.65;
export function cableFrame(course) {
  const direction = course.exit.clone().sub(course.launch).normalize(),
    across = new THREE.Vector3(direction.z, 0, -direction.x).normalize(),
    normal = direction.clone().cross(across).normalize();
  return {
    direction,
    across,
    normal,
    rotation: new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, normal, direction),
    ),
  };
}

// Stops describe the explorer's motion. The cable continues past both stops
// so both sheaves remain on steel and clear the terminal clamps.
export function returnCableEndpoints(course) {
  const direction = course.exit.clone().sub(course.launch).normalize();
  return [
    course.launch
      .clone()
      .add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0))
      .addScaledVector(direction, -RETURN_CABLE_OVERRUN),
    course.exit
      .clone()
      .add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0))
      .addScaledVector(direction, RETURN_CABLE_OVERRUN),
  ];
}

export function buildReturnCable(game, course, materials) {
  const root = new THREE.Group(),
    fixed = new THREE.Group(),
    carriage = new THREE.Group(),
    hanger = new THREE.Group(),
    frame = cableFrame(course),
    launchSetback = -4.6,
    launchAcross = 1.6,
    anchors = returnCableEndpoints(course),
    ornaments = [],
    wheels = [],
    handles = [],
    posts = [],
    wire = new THREE.MeshStandardMaterial({
      name: "Return cable steel",
      color: 0x90998d,
      metalness: 0.65,
      roughness: 0.48,
    });
  course.root.add(root);
  root.add(fixed, carriage, hanger);
  course.zip.material = wire;
  let serial = game.level.seed + course.stage * 79;
  const mesh = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    if (material.userData.windMetal) windSurface(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    if (parent.userData.cableCamera)
      game.cameraSurfaces?.capture(m, {
        small: true,
        thin: true,
        cylinderAxis: geometry.userData.cameraCylinderAxis,
      });
    return m;
  };
  const block = (w, h, d, parent, x, y, z, material = materials.metal) =>
    mesh(stoneBlockGeometry(w, h, d, ++serial), material, parent, x, y, z);
  const beam = (a, b, w, d, parent = fixed, material = materials.timber) => {
    const m = block(
      w,
      a.distanceTo(b),
      d,
      parent,
      ...a.clone().add(b).multiplyScalar(0.5).toArray(),
      material,
    );
    const along = b.clone().sub(a).normalize(),
      side = frame.across
        .clone()
        .addScaledVector(along, -frame.across.dot(along));
    if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
    side.normalize();
    m.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        side,
        along,
        side.clone().cross(along).normalize(),
      ),
    );
    if (parent === fixed)
      // The long winch lead is only 25 mm wide, but can cross the summit
      // camera's near plane. Preserve its oriented bounds through batching;
      // retain the normal length filter for the short lead beside the drum.
      game.cameraSurfaces?.capture(
        m,
        material === wire ? { thin: true } : undefined,
      );
    return m;
  };
  const at = (point, across, along, height) =>
    point
      .clone()
      .addScaledVector(frame.across, across)
      .addScaledVector(
        new THREE.Vector3(frame.direction.x, 0, frame.direction.z).normalize(),
        along,
      )
      .add(new THREE.Vector3(0, height, 0));
  for (const [index, end] of [course.launch, course.exit].entries()) {
    // Set the upper frame back onto the summit. Posts immediately behind the
    // trolley cut across the reading and boarding camera angles; longer stayed
    // arms leave that working edge open while retaining the cable's anchor.
    const setback = index === 0 ? launchSetback : 0.95,
      width = index === 0 ? launchAcross : 0.86,
      anchor = anchors[index],
      crosshead = new THREE.Vector3(anchor.x, end.y + 3.5, anchor.z);
    for (const x of [-width, width]) {
      const p = at(end, x, setback, 0),
        floor = index === 0 ? course.launch.y : game.groundHeight(p.x, p.z),
        head = at(end, x, setback, 3.7),
        bottom =
          index === 0
            ? floor
            : footprintMinimum(
                (x, z) => game.groundHeight(x, z),
                p.x,
                p.z,
                0.42,
                0.42,
              ) - 0.08,
        footing = block(
          0.42,
          floor + 0.13 - bottom,
          0.42,
          fixed,
          p.x,
          (bottom + floor + 0.13) / 2,
          p.z,
          materials.stone,
        );
      beam(new THREE.Vector3(p.x, floor + 0.12, p.z), head, 0.22, 0.22);
      game.obstacles.push({
        x: p.x,
        z: p.z,
        w: 0.14,
        d: 0.14,
        h: head.y - game.groundHeight(p.x, p.z),
        returnCable: course.id,
        fieldStation: course.id,
        bodyPadding: 0.35,
        supportable: false,
        bounds: {
          min: { x: p.x - 0.14, y: floor, z: p.z - 0.14 },
          max: { x: p.x + 0.14, y: head.y, z: p.z + 0.14 },
        },
      });
      posts.push({ x: p.x, z: p.z, floor, head: head.y, bottom, footing });
      for (const h of [0.26, 1.3, 3.55])
        block(0.28, 0.09, 0.28, fixed, p.x, end.y + h, p.z);
      const front = Math.sign(x) * 0.86;
      beam(
        at(end, x, setback, 3.45),
        crosshead.clone().addScaledVector(frame.across, front),
        index === 0 ? 0.28 : 0.17,
        index === 0 ? 0.28 : 0.17,
      );
      beam(
        index === 0 ? at(end, x, setback, 1.7) : head,
        index === 0
          ? at(end, x, setback, 3.45).lerp(
              crosshead.clone().addScaledVector(frame.across, front),
              0.5,
            )
          : crosshead.clone().addScaledVector(frame.across, front),
        index === 0 ? 0.2 : 0.13,
        index === 0 ? 0.2 : 0.13,
      );
    }
    beam(
      at(end, -width - 0.18, setback, 3.57),
      at(end, width + 0.18, setback, 3.57),
      0.23,
      0.28,
    );
    beam(
      crosshead.clone().addScaledVector(frame.across, -1.04),
      crosshead.clone().addScaledVector(frame.across, 1.04),
      0.22,
      0.26,
    );
    const clampPoint = anchor.clone().addScaledVector(frame.normal, 0.17),
      clamp = block(0.22, 0.35, 0.17, fixed, ...clampPoint.toArray());
    clamp.quaternion.copy(frame.rotation);
    game.cameraSurfaces?.capture(clamp, { small: true });
    const stem = beam(
      anchor.clone().addScaledVector(frame.normal, 0.33),
      crosshead.clone().add(new THREE.Vector3(0, -0.09, 0)),
      0.12,
      0.12,
      fixed,
      materials.metal,
    );
    game.cameraSurfaces?.capture(stem, { small: true });
    const ring = mesh(
      new THREE.TorusGeometry(0.105, 0.027, 8, 20),
      materials.metal,
      fixed,
      ...anchor.toArray(),
    );
    ring.quaternion.copy(frame.rotation);
    game.cameraSurfaces?.capture(ring, { small: true, thin: true });
    const plate = block(
      0.21,
      0.24,
      0.11,
      fixed,
      ...at(end, 0, setback, 3.57).toArray(),
    );
    plate.quaternion.copy(frame.rotation);
    ornaments.push(
      buildCableFrameArt(
        game,
        root,
        at(end, 0, setback, 3.57),
        frame,
        width * 2 + 0.36,
        materials,
      ),
    );
  }

  // Two grooved sheaves straddle the taut cable; the crossbar supplies separate
  // hand targets rather than asking both hands to grasp an invisible point.
  const sheaveGeometry = new THREE.LatheGeometry(
    [
      [-0.16, 0],
      [-0.16, 0.095],
      [-0.12, 0.13],
      [-0.08, 0.105],
      [0.08, 0.105],
      [0.12, 0.13],
      [0.16, 0.095],
      [0.16, 0],
    ].map(([y, r]) => new THREE.Vector2(r, y)),
    24,
  ).rotateZ(Math.PI / 2);
  for (const z of [-0.24, 0.24]) {
    const wheel = mesh(
      sheaveGeometry.clone(),
      materials.metal,
      carriage,
      0,
      0.14,
      z,
    );
    wheels.push(wheel);
    beam(
      new THREE.Vector3(-0.22, 0.14, z),
      new THREE.Vector3(0.22, 0.14, z),
      0.07,
      0.07,
      carriage,
      materials.metal,
    );
  }
  sheaveGeometry.dispose();
  for (const x of [-0.205, 0.205]) {
    block(0.05, 0.33, 0.79, carriage, x, 0.01, 0);
    beam(
      new THREE.Vector3(x, 0, 0),
      new THREE.Vector3(Math.sign(x) * 0.365, -0.43, 0),
      0.055,
      0.06,
      hanger,
      materials.metal,
    );
  }
  mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.78, 12).rotateZ(Math.PI / 2),
    materials.metal,
    hanger,
    0,
    -0.45,
    0,
  );
  for (const x of [-0.23, 0.23]) {
    const grip = mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.19, 12).rotateZ(Math.PI / 2),
      wire,
      hanger,
      x,
      -0.45,
      0,
    );
    handles.push(grip);
  }
  for (const wheel of wheels) wheel.userData.animated = true;
  for (const grip of handles) grip.userData.animated = true;
  mergeArchitecture(carriage);
  mergeArchitecture(hanger);

  const winchRoot = new THREE.Group(),
    drum = new THREE.Group(),
    wp = at(course.launch, launchAcross, launchSetback, 1.05);
  winchRoot.position.copy(wp);
  winchRoot.quaternion.copy(frame.rotation);
  winchRoot.userData.cableCamera = drum.userData.cableCamera = true;
  drum.userData.animated = true;
  root.add(winchRoot);
  winchRoot.add(drum);
  for (const x of [-0.27, 0.27]) block(0.075, 0.59, 0.61, winchRoot, x, 0, 0);
  const casting = (radius, length, segments) => {
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      segments,
    ).rotateZ(Math.PI / 2);
    geometry.userData.cameraCylinderAxis = "x";
    return geometry;
  };
  mesh(casting(0.19, 0.48, 20), materials.metal, drum);
  for (const x of [-0.2, 0.2])
    mesh(casting(0.27, 0.055, 24), materials.metal, drum, x, 0, 0);
  for (let i = 0; i < 9; i++)
    mesh(
      new THREE.TorusGeometry(0.203, 0.014, 6, 20).rotateY(Math.PI / 2),
      wire,
      drum,
      (i - 4) * 0.039,
      0,
      0,
    );
  block(0.08, 0.4, 0.08, drum, 0.35, -0.1, 0);
  block(0.23, 0.07, 0.07, drum, 0.44, -0.28, 0);
  const lead = at(course.launch, launchAcross, launchSetback, 3.25);
  beam(
    wp.clone().addScaledVector(frame.normal, 0.22),
    lead,
    0.025,
    0.025,
    fixed,
    wire,
  );
  beam(lead, anchors[0], 0.025, 0.025, fixed, wire);
  // Include every crank angle in physical clearance. Camera collision retains
  // the individual castings and their actual animated transforms instead.
  winchRoot.updateWorldMatrix(true, true);
  const winchBounds = new THREE.Box3().setFromObject(winchRoot),
    inverse = drum.matrixWorld.clone().invert();
  drum.traverse((o) => {
    if (!o.isMesh) return;
    const transform = inverse.clone().multiply(o.matrixWorld),
      positions = o.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(transform),
        radius = Math.hypot(p.y, p.z);
      for (const axis of ["x", "y", "z"]) {
        const center = wp[axis] + frame.across[axis] * p.x,
          extent =
            radius * Math.hypot(frame.normal[axis], frame.direction[axis]);
        winchBounds.min[axis] = Math.min(
          winchBounds.min[axis],
          center - extent,
        );
        winchBounds.max[axis] = Math.max(
          winchBounds.max[axis],
          center + extent,
        );
      }
    }
  });
  const winchCenter = winchBounds.getCenter(new THREE.Vector3()),
    winchSize = winchBounds.getSize(new THREE.Vector3());
  game.obstacles.push({
    x: winchCenter.x,
    z: winchCenter.z,
    w: winchSize.x / 2,
    d: winchSize.z / 2,
    h: winchBounds.max.y - game.groundHeight(winchCenter.x, winchCenter.z),
    bounds: winchBounds,
    fieldStation: course.id,
    returnCable: course.id,
    bodyPadding: 0.35,
    supportable: false,
  });
  mergeArchitecture(drum);
  mergeArchitecture(winchRoot);
  mergeArchitecture(fixed);
  const sources = [
    {
      id: `cable-carriage-${course.id}`,
      kind: "hoist",
      cableId: course.id,
      cableIndex: 0,
      x: 0,
      y: 0,
      z: 0,
      near: 1.2,
      range: 22,
      gain: 0.045,
      rate: 1.35,
      activity: 0,
    },
    {
      id: `cable-winch-${course.id}`,
      kind: "machine",
      cableId: course.id,
      cableIndex: 1,
      x: wp.x,
      y: wp.y,
      z: wp.z,
      near: 1.2,
      range: 18,
      gain: 0.055,
      rate: 0.75,
      activity: 0,
    },
  ];
  const rig = {
    root,
    fixed,
    carriage,
    hanger,
    frame,
    wheels,
    handles,
    drum,
    sources,
    posts,
    anchors,
    ornaments,
    winchRoot,
    winchBounds,
    travel: 0,
    returning: false,
  };
  course.zipRig = rig;
  updateReturnCable(game, course, 0);
  return rig;
}

export function updateReturnCable(game, course, dt) {
  const rig = course.zipRig;
  if (!rig) return;
  const ride = game.zipRide?.course === course ? game.zipRide : null;
  let moving = false;
  if (ride && !ride.approach) {
    const path = course.exit.clone().sub(course.launch);
    rig.travel = THREE.MathUtils.clamp(
      game.player.position.clone().sub(course.launch).dot(path) /
        path.lengthSq(),
      0,
      1,
    );
    rig.returning = false;
    moving = !game.paused;
  } else if (rig.returning && dt > 0) {
    rig.travel = Math.max(0, rig.travel - dt / 3.2);
    moving = !game.paused;
    if (rig.travel === 0) rig.returning = false;
  }
  const position = course.launch
    .clone()
    .lerp(course.exit, rig.travel)
    .add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0));
  rig.carriage.position.copy(position);
  rig.carriage.quaternion.copy(rig.frame.rotation);
  // The roller frame follows cable pitch; its hinged handle hangs vertically.
  rig.hanger.position.copy(position);
  rig.hanger.rotation.y = Math.atan2(
    rig.frame.direction.x,
    rig.frame.direction.z,
  );
  const distance = rig.travel * course.launch.distanceTo(course.exit);
  for (const wheel of rig.wheels) wheel.rotation.x = -distance / 0.115;
  rig.drum.rotation.x =
    (rig.travel * course.launch.distanceTo(course.exit)) / 0.203;
  rig.sources[0].x = position.x;
  rig.sources[0].y = position.y;
  rig.sources[0].z = position.z;
  rig.sources[0].activity = moving ? 0.7 : 0;
  rig.sources[1].activity = rig.returning && !game.paused ? 0.7 : 0;
  rig.carriage.visible = course.zip.visible;
  rig.hanger.visible = course.zip.visible;
}

export function silenceCableMotion(game) {
  for (const c of game.traversalCourses || []) {
    const sources = [c.sound, ...(c.zipRig?.sources || [])].filter(Boolean);
    for (const source of sources) {
      source.activity = 0;
      game.audio.releaseVoice?.(source.id);
    }
  }
}

export function cableHands(game) {
  const rig = game.zipRide?.course.zipRig;
  if (!rig || game.zipRide.approach) return null;
  rig.hanger.updateWorldMatrix(true, true);
  // Avatar Left lies on the right of a camera looking down the cable.
  return [...rig.handles]
    .reverse()
    .map((h) => h.getWorldPosition(new THREE.Vector3()));
}
