import { Box3, Matrix4, Vector3 } from "three";
import { boxEntry } from "./camera-collision.js";

// Guardian armor is rigidly weighted: each delivered vertex belongs to one
// bone. Retain its local bounds across both detail tiers, without scanning
// posed skin vertices on every camera update. Cached shapes retain no actors.
const shapes = new WeakMap();
function geometryShapes(geometry, mesh) {
  if (shapes.has(geometry)) return shapes.get(geometry);
  const boxes = new Map(),
    point = new Vector3();
  const { position, skinIndex, skinWeight } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    if (
      skinWeight.getX(i) !== 1 ||
      skinWeight.getY(i) !== 0 ||
      skinWeight.getZ(i) !== 0 ||
      skinWeight.getW(i) !== 0
    )
      throw Error("Guardian camera bounds require rigid skin weights");
    const index = skinIndex.getX(i);
    if (!boxes.has(index)) boxes.set(index, new Box3());
    point
      .fromBufferAttribute(position, i)
      .applyMatrix4(mesh.bindMatrix)
      .applyMatrix4(mesh.skeleton.boneInverses[index]);
    boxes.get(index).expandByPoint(point);
  }
  shapes.set(geometry, boxes);
  return boxes;
}

export function guardianCameraBounds(rig) {
  if (rig.cameraBounds) return rig.cameraBounds;
  const boxes = new Map();
  for (const tier of rig.tiers)
    for (const [material, geometry] of tier.entries())
      for (const [index, box] of geometryShapes(
        geometry,
        rig.skins[material],
      )) {
        if (!boxes.has(index)) boxes.set(index, new Box3());
        boxes.get(index).union(box);
      }
  rig.cameraBounds = [...boxes].map(([index, box]) => ({
    bone: rig.skeleton.bones[index],
    box,
  }));
  return rig.cameraBounds;
}

function posedGuardians(game) {
  const groups = [];
  for (const enemy of game.enemies || []) {
    const rig = enemy.art;
    if (!rig?.skins || !enemy.group.visible) continue;
    let visible = true;
    for (let node = rig.model; node; node = node.parent)
      visible &&= node.visible;
    if (!visible) continue;
    // The ordinary arm is at most 5.3 m and the authored guardian render
    // sphere is at most 5.1 m. Distant actors cannot intersect this solve.
    if (
      game.player &&
      enemy.group.position.distanceToSquared(game.player.position) > 20 ** 2
    )
      continue;
    rig.model.updateWorldMatrix(true, true);
    const bounds = new Box3(),
      surfaces = guardianCameraBounds(rig).map(({ bone, box }) => {
        const matrix = bone.matrixWorld.clone(),
          worldBox = box.clone().applyMatrix4(matrix);
        bounds.union(worldBox);
        const e = matrix.elements;
        return {
          box,
          bounds: worldBox,
          inverse: new Matrix4().copy(matrix).invert(),
          scale: Math.min(
            Math.hypot(...e.slice(0, 3)),
            Math.hypot(...e.slice(4, 7)),
            Math.hypot(...e.slice(8, 11)),
          ),
        };
      });
    groups.push({ parent: enemy.group, bounds, surfaces });
  }
  return groups;
}

// Add actors only to the camera solver. The world's ordinary surface queries
// remain available to sight, sound and physical controls without NPC proxies.
// A solve shares one posed snapshot; the next update reads the new bone pose.
export function guardianCameraSurfaces(game) {
  const scenery = game.cameraSurfaces;
  if (!game.enemies?.some((e) => e.art?.skins && e.group.visible))
    return scenery;
  let groups;
  const a = new Vector3(),
    b = new Vector3();
  return {
    withSnapshot(query) {
      if (groups) return query();
      const read = () => {
        const previous = groups;
        groups = posedGuardians(game);
        try {
          return query();
        } finally {
          groups = previous;
        }
      };
      return scenery?.withSnapshot ? scenery.withSnapshot(read) : read();
    },
    entry(start, end, radius = 0.28, ignoreParent = null) {
      let result = scenery?.entry(start, end, radius, ignoreParent) ?? 1;
      for (const group of groups || posedGuardians(game)) {
        if (
          group.parent === ignoreParent ||
          boxEntry(start, end, group.bounds, radius, true) === null
        )
          continue;
        for (const surface of group.surfaces) {
          if (boxEntry(start, end, surface.bounds, radius, true) === null)
            continue;
          a.copy(start).applyMatrix4(surface.inverse);
          b.copy(end).applyMatrix4(surface.inverse);
          const padding = radius / Math.max(0.001, surface.scale);
          let entry = boxEntry(a, b, surface.box, padding);
          // A close attacker can surround the body target. It may look out
          // of that armor, but the lens itself must not remain inside it.
          if (
            entry === null &&
            ["x", "y", "z"].every(
              (axis) =>
                b[axis] >= surface.box.min[axis] - padding &&
                b[axis] <= surface.box.max[axis] + padding,
            )
          )
            entry = 0;
          if (entry !== null) result = Math.min(result, entry);
        }
      }
      return result;
    },
  };
}
