import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildForgeInteriors } from "../src/forge-interiors.js";
import { stationBlocked, stationSupport } from "../src/field-station-solids.js";
import { advanceCharacter } from "../src/character-motion.js";

function fixture(t, stage) {
  const material = new THREE.MeshStandardMaterial();
  const g = {
    world: new THREE.Group(),
    level: { biome: "volcano", seed: 71 },
    groundHeight: () => 0,
    obstacles: [],
    fieldGates: [{ stage, root: new THREE.Group() }],
    stoneMat: material,
    darkMat: material,
    forgeMetal: material,
    cameraSurfaces: { capture() {} },
    player: new THREE.Group(),
    grounded: true,
    velocityY: 0,
    jumpY: 0,
    audio: { tone() {} },
  };
  g.canMove = (x, z, y, clearance = 1.8) =>
    !g.obstacles.some((o) => stationBlocked(o, x, y, z, clearance));
  buildForgeInteriors(g);
  t.after(() => {
    const geometries = new Set(),
      materials = new Set([material]);
    g.world.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    geometries.forEach((o) => o.dispose());
    materials.forEach((o) => o.dispose());
  });
  return g;
}

test("narrow service ledges do not hold a body beyond the boot support footprint", (t) => {
  for (const stage of [3, 4]) {
    const g = fixture(t, stage);
    for (const a of g.forgeInteriors[0].assemblies.filter((a) =>
      ["gear", "hopper"].includes(a.kind),
    )) {
      // Reproduced oblique jump landings: the wider body-clearance disk
      // touches raised iron while both soles remain over the floor beside it.
      const x =
          a.solid.x -
          (a.kind === "gear" ? Math.sign(a.solid.x) * 0.279 : 1.394),
        z = a.solid.z + (a.kind === "gear" ? 1.122 : 0),
        top = stationSupport(a.solid, x, z, 2, 0.55);
      assert(
        top === null || top < 0.3,
        `${a.kind}: distant iron cannot be a landing surface`,
      );
      assert(
        stationSupport(a.solid, a.solid.x, a.solid.z, Infinity) > 1,
        "actual machinery tops remain physical surfaces",
      );
      assert(
        stationBlocked(a.solid, x, 0.4, z),
        "the body margin still prevents side entry",
      );
      // An older save can resume at the former hovering height. Let gravity
      // and edge clearance settle it without trapping the root in the stand.
      g.player.position.set(x, a.kind === "gear" ? 1.475 : 0.73, z);
      g.grounded = true;
      g.velocityY = g.jumpY = g.fallPeak = 0;
      for (let frame = 0; frame < 150; frame++) {
        advanceCharacter(g, { x: 0, z: 0 }, 1 / 60);
        assert(g.canMove(g.player.position.x, g.player.position.z, g.jumpY));
      }
      assert(
        g.grounded && g.player.position.y < 0.3,
        "a former hovering arrival settles beside the machinery",
      );
    }
  }
});

test("low service furniture retains jump landings and a clear walk off", (t) => {
  for (const stage of [3, 4, 6]) {
    const g = fixture(t, stage);
    for (const a of g.forgeInteriors[0].assemblies.filter((a) =>
      ["bench", "casting", "trough"].includes(a.kind),
    )) {
      const s = a.spec,
        start = { x: s.x - Math.sign(s.x) * (s.w / 2 + 0.825), z: s.z };
      g.player.position.set(start.x, 0, start.z);
      g.grounded = true;
      g.velocityY = g.jumpY = g.fallPeak = 0;
      assert(g.canMove(start.x, start.z, 0));
      const walk = (target, jump) => {
        for (let frame = 0; frame < 150; frame++) {
          const p = g.player.position,
            dx = target.x - p.x,
            dz = target.z - p.z,
            d = Math.hypot(dx, dz),
            speed = Math.min(4, d * 60);
          advanceCharacter(
            g,
            { x: (dx / (d || 1)) * speed, z: (dz / (d || 1)) * speed },
            1 / 60,
            jump && frame === 0,
          );
          assert(
            g.canMove(p.x, p.z, g.jumpY),
            `${a.kind} frame ${frame} remains clear`,
          );
        }
      };
      walk(s, true);
      assert(
        g.grounded && g.player.position.y > 0.4,
        `${a.kind} retains its actual landing`,
      );
      walk(start, false);
      assert(
        g.grounded && Math.abs(g.player.position.y) < 1e-6,
        `${a.kind} returns to the floor`,
      );
      assert(
        Math.hypot(
          g.player.position.x - start.x,
          g.player.position.z - start.z,
        ) < 0.01,
      );
    }
  }
});
