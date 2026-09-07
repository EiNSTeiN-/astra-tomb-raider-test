import * as THREE from "three";
import { buildWaterfall, updateWaterfalls } from "./waterfall-effects.js";

export function buildSoundLandmarks(game) {
  const { biome } = game.level;
  game.soundSources = [];
  game.waterfalls = [];
  game.waterfallEffects = [];
  game.birds = [];
  const source = (id, kind, x, y, z, extra = {}) =>
    game.soundSources.push({ id, kind, x, y, z, ...extra });
  game.world.updateMatrixWorld(true);
  for (const [i, flame] of game.flames.entries()) {
    const p = flame.getWorldPosition(new THREE.Vector3());
    const station = game.items.find((f) => f.fire === flame);
    source(
      `fire-${i}`,
      "fire",
      p.x,
      p.y,
      p.z,
      station
        ? { field: station.id, stage: station.stage }
        : flame.userData.hazardId
          ? { hazard: flame.userData.hazardId }
          : {},
    );
  }
  for (const [i, room] of game.map.rooms.entries()) {
    const x = room.x * 7,
      z = room.z * 7,
      y = game.groundHeight(x, z);
    if (
      ["jungle", "sky", "water"].includes(biome) ||
      (biome === "desert" && i % 3 === 0)
    ) {
      // Perch on the existing ruin capital; no freestanding pole in the approach.
      const perch =
        biome === "desert"
          ? game.desertBirdPerches?.[i]
          : biome === "water"
            ? game.palaceBirdPerches?.[i]
            : biome === "sky"
              ? game.skyBirdPerches?.[i]
              : null;
      const bx = perch?.x ?? x + 19,
        bz = perch?.z ?? z + 18,
        birdY = perch?.y ?? game.groundHeight(bx, bz) + 9.1;
      const bird = new THREE.Group();
      bird.position.set(bx, birdY, bz);
      const feathers = new THREE.MeshStandardMaterial({
        color: biome === "jungle" ? 0x6e8865 : 0xc7c7ad,
        roughness: 0.9,
      });
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        feathers,
      );
      body.scale.set(0.8, 1, 1.5);
      bird.add(body);
      const wings = [];
      for (const side of [-1, 1]) {
        const wing = game.box(
          0.3,
          0.035,
          0.2,
          feathers,
          side * 0.18,
          0,
          0,
          bird,
        );
        wings.push(wing);
      }
      game.world.add(bird);
      game.birds.push({ bird, wings, phase: i * 2 });
      source(`birds-${i}`, "birds", bx, birdY, bz, {
        rate: 0.97 + (i % 4) * 0.018,
      });
    }
    if (["sky", "snow", "desert"].includes(biome)) {
      const flagLine = biome === "snow" ? game.monasteryWindSources?.[i] : null;
      source(
        `ridge-wind-${i}`,
        "wind",
        flagLine?.x ?? x - 14,
        flagLine?.y ?? y + 9,
        flagLine?.z ?? z - 12,
      );
    }
  }
  game.soundSources.push(...(game.forgeSources || []).map((s) => ({ ...s })));
  game.soundSources.push(...(game.windSources || []).map((s) => ({ ...s })));
  game.soundSources.push(...(game.cipherSources || []).map((s) => ({ ...s })));
  game.soundSources.push(
    ...(game.traversalCourses || []).map((c) => ({ ...c.sound })),
  );
  game.soundSources.push(...(game.thermalSources || []).map((s) => ({ ...s })));
  game.soundSources.push(
    ...(game.resonanceSources || []).map((s) => ({ ...s })),
  );
  game.soundSources.push(
    ...(game.hydraulicSources || []).map((s) => ({ ...s })),
  );
  game.soundSources.push(...(game.gateSources || []).map((s) => ({ ...s })));
  game.soundSources.push(...(game.solarSources || []).map((s) => ({ ...s })));
  game.soundSources.push(
    ...(game.observatorySources || []).map((s) => ({ ...s })),
  );
  game.soundSources.push(...(game.cavernSources || []).map((s) => ({ ...s })));
  game.soundSources.push(
    ...(game.skyBridgeSources || []).map((s) => ({ ...s })),
  );
  for (const [i, water] of game.waterMeshes.entries()) {
    if (
      water.geometry.parameters.width > 30 ||
      (water.userData.fall !== undefined && water.userData.stage === undefined)
    )
      continue;
    const p = water.position;
    if (biome === "volcano")
      source(`lava-pool-${i}`, "lava", p.x, p.y, p.z, { waterIndex: i });
    else if (biome !== "snow")
      source(
        `pool-${i}`,
        biome === "crystal" ? "drips" : "stream",
        p.x,
        p.y,
        p.z,
        { waterIndex: i },
      );
  }
  for (const f of game.items)
    if (f.type === "mechanism")
      source(
        f.id,
        biome === "crystal" || biome === "eclipse" ? "crystal" : "machine",
        f.x * 7,
        f.group.position.y + 1.8,
        f.z * 7,
        { stage: f.stage, mechanism: true, gain: 0.28 },
      );
  for (const basin of game.waterMeshes.filter(
    (w) => w.userData.fall !== undefined,
  )) {
    const index = basin.userData.fall,
      { curtain, emitter } = buildWaterfall(game, index, basin);
    game.waterfalls.push(curtain);
    source(`waterfall-${index}`, "waterfall", emitter.x, emitter.y, emitter.z, {
      waterfallId: index,
    });
  }
}

export function updateSoundSources(game) {
  for (const source of game.soundSources) {
    if (source.courseId !== undefined)
      source.activity =
        game.traversalCourses?.find((c) => c.id === source.courseId)?.sound
          ?.activity || 0;
    if (source.windStage !== undefined) {
      const site = game.windSites?.[source.windStage];
      const live =
        source.windIndex !== undefined
          ? site?.nodes[source.windIndex]?.[source.channel]
          : site?.fans.find(
              (f) => f.receiver === (source.channel === "receiver"),
            )?.sound;
      source.activity = live?.activity || 0;
    }
    if (source.resonanceStage !== undefined) {
      const node =
        game.resonanceSites?.[source.resonanceStage]?.nodes[
          source.resonanceIndex
        ];
      const live = node?.[source.channel];
      source.activity = live?.activity || 0;
      if (live) source.rate = live.rate;
    }
    if (source.cipherStage !== undefined)
      source.activity =
        game.cipherSites?.[source.cipherStage]?.nodes[source.cipherIndex]?.sound
          .activity || 0;
    if (source.thermalStage !== undefined) {
      const node =
        game.thermalSites?.[source.thermalStage]?.nodes[source.thermalIndex];
      source.activity = node?.[source.channel]?.activity || 0;
    }
    if (source.hydraulicStage !== undefined) {
      const tank =
        game.hydraulicSites?.[source.hydraulicStage]?.tanks[source.tankIndex];
      const live = source.channel === "pump" ? tank?.pump : tank?.outlet;
      source.activity = live?.activity || 0;
      if (live) source.y = live.y;
    }
    if (source.gateStage !== undefined) {
      const gate = game.fieldGates?.find((g) => g.stage === source.gateStage);
      source.activity = Math.min(1, (gate?.motion || 0) * 6);
    }
    if (source.observatoryRoom !== undefined) {
      const patch = game.observatories?.find(
        (p) => p.index === source.observatoryRoom,
      );
      source.activity =
        source.channel === "gear"
          ? 0.18 + Math.min(1, patch?.motion || 0) * 0.8
          : (patch?.state.glow ?? 0.18);
    }
    if (source.solarStage !== undefined) {
      const site = game.solarSites?.[source.solarStage];
      source.activity = !site?.active
        ? 0
        : source.solarMirror !== undefined
          ? 0.04 + Math.min(1, site.mirrors[source.solarMirror].motion) * 0.7
          : site.aligned
            ? 1
            : 0.15;
    }
    if (game.cavernDrips && source.kind === "drips") {
      const site = game.cavernDrips.sites.find((site) => site.id === source.id);
      if (site) source.y = site.floor + 0.3;
    }
    if (source.cavernRoom !== undefined)
      source.activity =
        0.4 +
        0.6 *
          (game.cavernPatches?.find((p) => p.index === source.cavernRoom)
            ?.restoration.value ?? 0);
    if (source.skyBridge)
      source.activity =
        game.skyBridges?.find((b) => b.id === source.skyBridge)?.activity ??
        0.2;
    if (source.skyBridgeDrum)
      source.activity =
        game.skyBridges?.find((b) => b.id === source.skyBridgeDrum)
          ?.driveActivity ?? 0;
    if (source.forgeRoom !== undefined) {
      const patch = game.forgePatches?.find(
        (p) => p.index === source.forgeRoom,
      );
      source.activity = patch?.state[source.forgeChannel] ?? 0;
    }
    if (source.waterfallId !== undefined) {
      const fall = game.waterfallEffects?.find(
        (f) => f.index === source.waterfallId,
      );
      if (fall) source.y = fall.basin.position.y + 1.85;
    }
    if (source.waterIndex === undefined) continue;
    const water = game.waterMeshes[source.waterIndex];
    if (!water) continue;
    source.x = water.position.x;
    source.y = water.position.y;
    source.z = water.position.z;
    source.activity = water.userData.cooled
      ? 0
      : 1 - Math.min(1, (water.userData.drain || 0) / 1.8) * 0.7;
  }
}

export function updateSoundLandmarks(game) {
  updateWaterfalls(game);
  for (const { bird, wings, phase } of game.birds) {
    const flutter =
      Math.sin(game.elapsed * 0.43 + phase) > 0.96
        ? Math.sin(game.elapsed * 24) * 0.7
        : 0.08;
    wings[0].rotation.z = flutter;
    wings[1].rotation.z = -flutter;
    bird.rotation.y = phase + Math.sin(game.elapsed * 0.4 + phase) * 0.4;
  }
}
