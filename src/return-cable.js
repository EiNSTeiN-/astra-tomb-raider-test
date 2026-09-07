import * as THREE from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { windSurface } from "./wind-art.js";

export const RETURN_CABLE_HEIGHT = 2.55;
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

export function buildReturnCable(game, course, materials) {
  const root = new THREE.Group(),
    fixed = new THREE.Group(),
    carriage = new THREE.Group(),
    hanger = new THREE.Group(),
    frame = cableFrame(course),
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
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    if (parent === fixed) game.cameraSurfaces?.capture(m);
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
    const side = index === 0 ? -1 : 1;
    for (const x of [-0.86, 0.86]) {
      const p = at(end, x, side * 0.95, 0),
        floor = index === 0 ? course.launch.y : game.groundHeight(p.x, p.z),
        head = at(end, x, side * 0.95, 3.0);
      block(0.42, 0.13, 0.42, fixed, p.x, floor + 0.065, p.z, materials.stone);
      beam(new THREE.Vector3(p.x, floor + 0.12, p.z), head, 0.22, 0.22);
      game.obstacles.push({
        x: p.x,
        z: p.z,
        w: 0.17,
        d: 0.17,
        h: head.y - game.groundHeight(p.x, p.z),
        returnCable: course.id,
      });
      posts.push({ x: p.x, z: p.z, floor, head: head.y });
      for (const h of [0.26, 1.3, 2.85])
        block(0.28, 0.09, 0.28, fixed, p.x, end.y + h, p.z);
      beam(at(end, x, side * 0.95, 2.74), at(end, x, 0, 2.74), 0.17, 0.17);
      beam(head, at(end, x, 0, 2.74), 0.13, 0.13);
    }
    beam(
      at(end, -1.04, side * 0.95, 2.87),
      at(end, 1.04, side * 0.95, 2.87),
      0.23,
      0.28,
    );
    beam(at(end, -1.04, 0, 2.74), at(end, 1.04, 0, 2.74), 0.22, 0.26);
    const anchor = at(end, 0, 0, RETURN_CABLE_HEIGHT);
    block(0.22, 0.35, 0.17, fixed, anchor.x, anchor.y + 0.16, anchor.z);
    const ring = mesh(
      new THREE.TorusGeometry(0.105, 0.027, 8, 20),
      materials.metal,
      fixed,
      ...anchor.toArray(),
    );
    ring.quaternion.copy(frame.rotation);
    const plate = block(
      0.21,
      0.24,
      0.11,
      fixed,
      ...at(end, 0, side * 0.95, 2.4).toArray(),
    );
    plate.quaternion.copy(frame.rotation);
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
    wp = at(course.launch, 0.86, -0.95, 1.05);
  winchRoot.position.copy(wp);
  winchRoot.quaternion.copy(frame.rotation);
  root.add(winchRoot);
  winchRoot.add(drum);
  for (const x of [-0.27, 0.27]) block(0.075, 0.59, 0.61, winchRoot, x, 0, 0);
  mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.48, 20).rotateZ(Math.PI / 2),
    materials.metal,
    drum,
  );
  for (const x of [-0.2, 0.2])
    mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.055, 24).rotateZ(Math.PI / 2),
      materials.metal,
      drum,
      x,
      0,
      0,
    );
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
  const lead = at(course.launch, 0.86, -0.95, 2.75);
  beam(
    wp.clone().addScaledVector(frame.normal, 0.22),
    lead,
    0.025,
    0.025,
    fixed,
    wire,
  );
  beam(
    lead,
    at(course.launch, 0, 0, RETURN_CABLE_HEIGHT),
    0.025,
    0.025,
    fixed,
    wire,
  );
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
