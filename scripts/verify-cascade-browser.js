// Assisted development checks; these do not measure human playthrough duration.
import * as THREE from "three";
import { findRoute } from "../src/navigation.js";
import { advanceCharacter } from "../src/character-motion.js";
import { advanceSwimming, restoreWaterArrival } from "../src/water-motion.js";
import { updateSoundSources } from "../src/sound-landmarks.js";

export function inspectCascadeSetting(game) {
  updateSoundSources(game);
  return game.waterfallEffects.map((f) => {
    const art = f.art,
      site = f.basin.userData.waterfallSite || f.basin.userData,
      source = game.soundSources.find((s) => s.waterfallId === f.index);
    let leastBurial = Infinity,
      samples = 0;
    for (const foot of art.footings)
      for (let ix = 0; ix <= 10; ix++)
        for (let iz = 0; iz <= 10; iz++) {
          const x = art.root.position.x + foot.x + (ix / 10 - 0.5) * foot.w,
            z = art.root.position.z + foot.z + (iz / 10 - 0.5) * foot.d;
          leastBurial = Math.min(
            leastBurial,
            game.groundHeight(x, z) - art.root.position.y - foot.bottom,
          );
          samples++;
        }
    const listener = new THREE.Vector3(
        site.x,
        game.groundHeight(site.x, site.z + 4),
        site.z + 4,
      ),
      water = f.basin.position.y;
    if (water - listener.y > 1.15) listener.y = water - 0.38;
    const listenerHeight =
      water - game.groundHeight(listener.x, listener.z) > 1.15 ? 0.3 : 1.6;
    const clear = game.lineOfSight(
      new THREE.Vector3(source.x, source.y, source.z),
      listener,
      0,
      listenerHeight,
    );
    return {
      index: f.index,
      site: { x: site.x, z: site.z },
      samples,
      leastBurial,
      source: { x: source.x, y: source.y, z: source.z },
      water,
      frontSoundClear: clear,
      headerWater: f.art.header.water
        .getWorldPosition(new THREE.Vector3())
        .toArray(),
    };
  });
}

export function walkCascadeBanks(game) {
  const position = game.player.position.clone(),
    fields = [
      "jumpY",
      "velocityY",
      "grounded",
      "jumpBuffer",
      "coyote",
      "motionLanding",
      "fallPeak",
      "airVelocity",
      "swimming",
      "diving",
      "nextSwimStroke",
      "stamina",
      "moveVelocity",
    ],
    saved = Object.fromEntries(
      fields.map((k) => [
        k,
        game[k]?.clone
          ? game[k].clone()
          : game[k] && typeof game[k] === "object"
            ? structuredClone(game[k])
            : game[k],
      ]),
    ),
    results = [];
  try {
    for (const fall of game.waterfallEffects) {
      const site = fall.basin.userData.waterfallSite || fall.basin.userData;
      const points = [
        [0, 4.4],
        [0, -1.8],
        [0, 4.4],
        [-3.8, 3.2],
        [-3.8, -7.3],
        [-1.8, -7.6],
        [-3.8, 3.2],
      ].map(([x, z]) => ({ x: x + site.x, z: z + site.z }));
      for (let leg = 1; leg < points.length; leg++) {
        const a = points[leg - 1],
          b = points[leg],
          route = findRoute((x, z) => game.canMove(x, z, 0), a, b, {
            cell: 0.25,
            margin: 6,
            maxVisited: 16000,
            maxDistance: 40,
          });
        let arrived = route.status === "complete",
          frames = 0,
          swam = false;
        if (arrived) {
          game.player.position.set(a.x, game.groundHeight(a.x, a.z), a.z);
          Object.assign(game, {
            jumpY: 0,
            velocityY: 0,
            grounded: true,
            jumpBuffer: 0,
            airVelocity: { x: 0, z: 0 },
          });
          restoreWaterArrival(game);
          for (const p of route.points) {
            let step = 0;
            while (
              Math.hypot(
                p.x - game.player.position.x,
                p.z - game.player.position.z,
              ) > 0.14 &&
              step++ < 650
            ) {
              const dx = p.x - game.player.position.x,
                dz = p.z - game.player.position.z,
                d = Math.hypot(dx, dz),
                input = { x: dx / d, z: dz / d };
              if (!advanceSwimming(game, input, 1 / 60, false))
                advanceCharacter(
                  game,
                  { x: input.x * 4.6, z: input.z * 4.6 },
                  1 / 60,
                );
              swam ||= game.swimming;
              frames++;
            }
            if (step >= 650) {
              arrived = false;
              break;
            }
          }
        }
        results.push({
          index: fall.index,
          leg,
          status: route.status,
          arrived,
          frames,
          swam,
          distance: Math.hypot(
            game.player.position.x - b.x,
            game.player.position.z - b.z,
          ),
          from: a,
          to: b,
        });
      }
    }
  } finally {
    game.player.position.copy(position);
    Object.assign(game, saved);
  }
  return results;
}
