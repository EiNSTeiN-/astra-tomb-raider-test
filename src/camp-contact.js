import * as THREE from "three";
import { TriangleSolids } from "./triangle-solids.js";
import { stationSolid, stationBlocked } from "./field-station-solids.js";

export const CAMP_BODY_PADDING = 0.8;
const ESCAPE_SPEED = 6;

export function campEscapeVelocity(game, step) {
  const escape = game.campEscape;
  if (!escape) return null;
  if (
    game.grounded ||
    escape.remaining <= 0 ||
    !game.obstacles.includes(escape.source) ||
    game.elapsed - escape.started > escape.duration + 0.5
  ) {
    game.campEscape = null;
    return null;
  }
  const dx = escape.x - game.player.position.x,
    dz = escape.z - game.player.position.z,
    distance = Math.hypot(dx, dz);
  if (distance < 0.025) {
    escape.remaining -= step;
    return { x: 0, z: 0 };
  }
  escape.remaining -= step;
  const speed = Math.min(ESCAPE_SPEED, distance / step);
  return { x: (dx / distance) * speed, z: (dz / distance) * speed };
}

// Copy the delivered furniture into an upright CPU kernel before batching.
// Baking each part also preserves the kettle's tilted spout and scaled fittings.
export function campFurnitureSolid(game, feature, root) {
  root.updateWorldMatrix(true, true);
  const geometries = [];
  let triangles;
  try {
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        mesh.geometry.attributes.position.clone(),
      );
      if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
      geometry.applyMatrix4(mesh.matrixWorld);
      geometries.push(geometry);
    });
    triangles = new TriangleSolids(
      geometries.map((geometry) => ({
        geometry,
        matrices: [new THREE.Matrix4()],
      })),
    );
  } finally {
    for (const geometry of geometries) geometry.dispose();
  }
  const bounds = new THREE.Box3();
  for (const shape of triangles.solids) bounds.union(shape.bounds);
  const x = (bounds.min.x + bounds.max.x) / 2,
    z = (bounds.min.z + bounds.max.z) / 2,
    solid = {
      x,
      z,
      w: (bounds.max.x - bounds.min.x) / 2,
      d: (bounds.max.z - bounds.min.z) / 2,
      h: bounds.max.y - game.groundHeight(x, z),
      fieldStation: feature.id,
      camp: feature.id,
      bodyPadding: CAMP_BODY_PADDING,
      supportable: false,
      bounds,
      triangles,
    };
  game.obstacles.push(solid);
  return solid;
}

// The fire is an unsafe standing area, not an opaque wall or a platform.
// Its disk covers the actual outer hearth, while its finite height follows
// the flame. Ray queries still use the opaque furniture's delivered triangles.
export function campHearthSolid(game, feature, group, radius) {
  const solid = stationSolid(
    game,
    feature,
    group,
    [radius * 2, 1.37, radius * 2],
    [0, 0.665, 0],
    { radius, bodyPadding: CAMP_BODY_PADDING, support: false },
  );
  solid.camp = feature.id;
  solid.campFire = true;
  return solid;
}

// A jump can cross above low furniture, then descend into it. Resolve that
// finite contact with a short outward rebound rather than landing inside an
// unwalkable bedroll or flame. The regular collision substeps advance the escape;
// no horizontal position is snapped. Test destinations against the complete
// movement rules, including adjacent supplies and walls.
export function clearCampVerticalContact(game, before) {
  const p = game.player.position,
    contacts = game.obstacles.filter(
      (o) =>
        o.camp &&
        stationBlocked(o, p.x, p.y, p.z) &&
        !stationBlocked(o, p.x, before, p.z),
    );
  if (!contacts.length) return false;
  const candidates = [];
  for (const o of contacts) {
    const padding = o.bodyPadding + 0.025;
    if (o.radius !== undefined) {
      const angle = Math.atan2(p.z - o.z, p.x - o.x);
      for (let i = 0; i < 24; i++) {
        const a = angle + (i * Math.PI * 2) / 24;
        candidates.push({
          x: o.x + Math.cos(a) * (o.radius + padding),
          z: o.z + Math.sin(a) * (o.radius + padding),
        });
      }
    } else {
      for (const x of [o.bounds.min.x - padding, o.bounds.max.x + padding])
        candidates.push({ x, z: p.z });
      for (const z of [o.bounds.min.z - padding, o.bounds.max.z + padding])
        candidates.push({ x: p.x, z });
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
  );
  for (const q of candidates) {
    const ground = game.groundHeight(q.x, q.z);
    if (
      ground > p.y + 0.45 ||
      !game.canMove(q.x, q.z, p.y - ground) ||
      !game.canMove(q.x, q.z, 0)
    )
      continue;
    const distance = Math.hypot(q.x - p.x, q.z - p.z),
      duration = distance / ESCAPE_SPEED + 0.05;
    p.y = before;
    game.velocityY = (19 * duration) / 2 + 0.4;
    game.grounded = false;
    game.coyote = game.jumpBuffer = 0;
    game.airVelocity = null;
    game.campEscape = {
      x: q.x,
      z: q.z,
      source: contacts[0],
      started: game.elapsed,
      duration,
      remaining: duration + 0.4,
    };
    return true;
  }
  p.y = before;
  game.velocityY = 0;
  return true;
}
