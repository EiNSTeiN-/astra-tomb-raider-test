import * as THREE from "three";
import { buildReturnCable, RETURN_CABLE_HEIGHT } from "./return-cable.js";
import { pbrMaterial } from "./visuals.js";
import {
  climbingMaterials,
  buildClimbingArt,
  updateClimbingArt,
} from "./traversal-art.js";

export const COURSE_THEMES = {
  jungle: {
    name: "Canopy crossing",
    color: 0x9cad66,
    rope: 0x8b7955,
    length: 10.8,
  },
  desert: {
    name: "The surveyor's gantry",
    color: 0xd3b06c,
    rope: 0xb19b72,
    length: 10.6,
  },
  snow: {
    name: "The pilgrim handline",
    color: 0xa6c3d1,
    rope: 0xa3987e,
    length: 10.8,
  },
  water: {
    name: "The salvager's passage",
    color: 0x75b5ad,
    rope: 0x7c8f78,
    length: 11,
  },
  volcano: {
    name: "The furnace service gantry",
    color: 0xd18450,
    rope: 0x756c56,
    length: 10.5,
  },
  sky: {
    name: "The cloud crossing",
    color: 0xc3c7a1,
    rope: 0x9b8b6b,
    length: 11.1,
  },
  crystal: {
    name: "The resonant span",
    color: 0xa48ac5,
    rope: 0x9793ad,
    length: 10.7,
  },
  eclipse: {
    name: "The astral crossing",
    color: 0xc1a76a,
    rope: 0x96907c,
    length: 10.8,
  },
};
export function hasTraversalCourse(level, feature) {
  return (
    feature.kind === "climb" ||
    (level.biome === "volcano" && feature.id === "field-4-1")
  );
}
export function coursePlan(level, feature) {
  const theme = COURSE_THEMES[level.biome],
    turns =
      (feature.stage +
        feature.step +
        Object.keys(COURSE_THEMES).indexOf(level.biome)) %
      4;
  const angle = (turns * Math.PI) / 2,
    cos = Math.round(Math.cos(angle)),
    sin = Math.round(Math.sin(angle));
  const transform = (x, z) => ({
    x: feature.x * 7 + x * cos - z * sin,
    z: feature.z * 7 + x * sin + z * cos,
  });
  const farZ = feature.stage % 2 ? -6 : -5;
  const ledges = [
    [-10, 8, 2.8],
    [-10, 2, 5.6],
    [-10, farZ, 5.6],
    [5, farZ, 5.6],
    [0, 0, 8.4],
  ].map(([x, z, h], index) => ({
    ...transform(x, z),
    h,
    w: index === 4 ? 2.5 : 2.2,
    d: index === 4 ? 2.5 : 2.2,
    index,
  }));
  return {
    id: feature.id,
    stage: feature.stage,
    pivotLocalZ: farZ,
    theme,
    angle,
    transform,
    ledges,
    entry: transform(-10, 12),
    exitPoint: transform(4, 12),
    launchPoint: transform(0.9, 2.65),
    pivot: { ...transform(-2.5, farZ), h: 5.6 + theme.length + 2.4 },
    axis: { x: cos, z: sin },
    length: theme.length,
  };
}

export function buildTraversalCourse(game, feature, station) {
  const plan = coursePlan(game.level, feature),
    base = game.groundHeight(feature.x * 7, feature.z * 7),
    root = new THREE.Group();
  game.world.add(root);
  const gold = game.goldMat;
  const ropeMaterial = pbrMaterial("bark", plan.theme.rope, 1);
  game.climbingMaterials ||= climbingMaterials(game);
  const art = buildClimbingArt(game, plan, base, root, game.climbingMaterials);
  for (const ledge of plan.ledges) {
    const h = base + ledge.h - game.groundHeight(ledge.x, ledge.z);
    const obstacle = {
      x: ledge.x,
      z: ledge.z,
      w: ledge.w,
      d: ledge.d,
      h,
      climbable: true,
      courseId: feature.id,
      ledge: ledge.index,
    };
    game.obstacles.push(obstacle);
    ledge.obstacle = obstacle;
    ledge.y = base + ledge.h;
  }
  for (const localX of [-12.8, 7.8]) {
    const p = plan.transform(localX, plan.pivotLocalZ - 3);
    game.obstacles.push({
      x: p.x,
      z: p.z,
      w: 0.5,
      d: 0.5,
      h: base + plan.pivot.h + 2.85 - game.groundHeight(p.x, p.z),
    });
  }
  const anchor = new THREE.Vector3(
    plan.pivot.x,
    base + plan.pivot.h,
    plan.pivot.z,
  );
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1, 7),
    ropeMaterial,
  );
  rope.castShadow = true;
  root.add(rope);
  const grip = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.035, 6, 16),
    gold,
  );
  root.add(grip);
  const zip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
    ropeMaterial,
  );
  zip.visible = false;
  root.add(zip);
  // Keep moving cable geometry separate from the static architecture batch.
  rope.userData.animated =
    grip.userData.animated =
    zip.userData.animated =
      true;
  const course = {
    art,
    ...plan,
    base,
    root,
    rope,
    grip,
    zip,
    anchor,
    angle: 0,
    omega: 0,
    sound: {
      id: `climbing-${feature.id}`,
      kind: "hoist",
      courseId: feature.id,
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      near: 2,
      range: 28,
      gain: 0.055,
      activity: 0,
      rate: 0.8,
    },
    stage: feature.stage,
    launch: new THREE.Vector3(
      plan.launchPoint.x,
      base + 8.4,
      plan.launchPoint.z,
    ),
    exit: new THREE.Vector3(
      plan.exitPoint.x,
      game.groundHeight(plan.exitPoint.x, plan.exitPoint.z),
      plan.exitPoint.z,
    ),
  };
  game.traversalCourses ||= [];
  game.traversalCourses.push(course);
  buildReturnCable(game, course, game.climbingMaterials);
  feature.yOffset = 8.4;
  station.position.y = base + 8.4;
  updateCourseVisual(course);
  return course;
}

export function ropeGrip(course) {
  return new THREE.Vector3(
    course.anchor.x + course.axis.x * Math.sin(course.angle) * course.length,
    course.anchor.y - Math.cos(course.angle) * course.length,
    course.anchor.z + course.axis.z * Math.sin(course.angle) * course.length,
  );
}
function span(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.y = a.distanceTo(b);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
}
export function updateCourseVisual(course) {
  updateClimbingArt(course);
  const grip = ropeGrip(course);
  span(course.rope, course.anchor, grip);
  course.grip.position.copy(grip);
  const from = course.launch
      .clone()
      .add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0)),
    to = course.exit.clone().add(new THREE.Vector3(0, RETURN_CABLE_HEIGHT, 0));
  span(course.zip, from, to);
}
