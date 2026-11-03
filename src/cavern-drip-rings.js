import * as T from "three";
import { waterAt } from "./hydrology.js";

export const DRIP_SURFACE_SKIN = 0.025;
export const DRIP_WATER_SKIN = 0.06;

export function dripReceivingHeight(game, x, z) {
  const water = waterAt(game, x, z);
  // Retain the existing clearance above the animated water's wave envelope.
  return water
    ? water.y + DRIP_WATER_SKIN
    : game.groundHeight(x, z) + DRIP_SURFACE_SKIN;
}

export function dripRingGeometry() {
  const geometry = new T.RingGeometry(0.48, 0.54, 80);
  geometry.rotateX(-Math.PI / 2);
  geometry.attributes.position.setUsage(T.DynamicDrawUsage);
  return geometry;
}

// Keep horizontal expansion and phase unchanged. Each visible vertex follows
// its own receiving surface; a centre-height plane cuts through sloping soil.
export function fitDripRing(game, site, scale) {
  const ring = site.ring,
    p = ring.geometry.attributes.position;
  site.floor = dripReceivingHeight(game, site.x, site.z);
  ring.position.set(site.x, site.floor, site.z);
  ring.scale.setScalar(scale);
  for (let i = 0; i < p.count; i++) {
    const x = site.x + p.getX(i) * scale,
      z = site.z + p.getZ(i) * scale;
    p.setY(i, (dripReceivingHeight(game, x, z) - site.floor) / scale);
  }
  p.needsUpdate = true;
  ring.geometry.computeBoundingSphere();
}
