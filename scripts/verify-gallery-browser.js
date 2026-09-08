// Development-only assisted route check. Use a disposable test profile.
import { updateSunkenGallery } from "/src/sunken-gallery.js";
import { normalizeGallery } from "/src/sunken-gallery-record.js";
import { resetDiving } from "/src/diving.js";

export function memorialRoute(game) {
  if (!game.sunkenGallery) throw new Error("Load the Drowned Kingdom first.");
  const o = game.terrainProfile.gallery.origin,
    log = [];
  const saved = game.save;
  game.save = () => {};
  const progress = structuredClone(game.progress),
    position = game.player.position.clone(),
    health = game.health;
  game.progress.gallery = normalizeGallery(null);
  game.progress.field = [];
  game.health = 100;
  game.setPaused(false);
  game.yaw = 0;
  resetDiving(game);
  game.swimming = true;
  game.grounded = false;
  const surface = game.sunkenGallery.well.position.y - o.y - 0.38;
  game.player.position.set(o.x, o.y + surface, o.z);
  const tick = (x = 0, z = 0, down = false, rise = false) => {
    game.keys.clear();
    if (down) game.keys.add("KeyX");
    if (rise) game.keys.add("Space");
    game.touchMove = { x, z };
    game.elapsed += 1 / 60;
    game.updatePlayer(1 / 60);
    updateSunkenGallery(game, 1 / 60);
  };
  const move = ([x, y, z]) => {
    const target = position.clone().set(o.x + x, o.y + y, o.z + z);
    const started = game.elapsed;
    for (let i = 0; i < 1500; i++) {
      const delta = target.clone().sub(game.player.position);
      if (delta.length() < 0.16) {
        log.push({
          target: [x, y, z],
          seconds: game.elapsed - started,
          air: game.diveAir,
        });
        return;
      }
      const distance = Math.hypot(delta.x, delta.z),
        moving = distance > 0.07;
      tick(
        moving ? delta.x / Math.max(1, distance) : 0,
        moving ? delta.z / Math.max(1, distance) : 0,
        delta.y < -0.08,
        delta.y > 0.08,
      );
    }
    throw new Error(
      `Blocked toward ${[x, y, z]} at ${game.player.position.clone().sub(position.clone().copy(o)).toArray()}`,
    );
  };
  const breathe = () => {
    for (let i = 0; i < 20; i++) tick(0, 0, false, true);
    for (let i = 0; i < 240; i++) tick();
    if (game.diving || game.diveAir !== 32)
      throw new Error("Air bell did not restore breath");
  };
  try {
    for (const p of [
      [0, -3.5, 0],
      [-4, -3.5, 0],
      [-29, -3.5, 0],
      [-29, -5.35, 5],
      [-29, -5.35, 12],
      [-29, -3.18, 12],
    ])
      move(p);
    breathe();
    for (const p of [
      [-29, -5.35, 12],
      [-29, -5.35, 18],
      [-29, -4.1, 20],
      [-29, -4.1, 24],
      [-29, -6.3, 24],
      [-29, -6.3, 30],
      [-29, -6.3, 34],
      [-8, -6.3, 34],
      [-8, -3.18, 34],
    ])
      move(p);
    breathe();
    for (const p of [
      [-8, -5.8, 34],
      [-4.5, -5.8, 33.7],
    ])
      move(p);
    game.interact();
    for (let i = 0; i < 120; i++) tick();
    if (!game.progress.gallery.opened)
      throw new Error("Emergency wheel did not open the gates");
    for (const p of [
      [-8, -6.3, 36],
      [-8, -6.3, 44],
      [-8, -7.2, 48.5],
    ])
      move(p);
    game.interact();
    if (!game.progress.gallery.recovered)
      throw new Error("Memorial roll was not recovered");
    for (const p of [
      [-8, -5.35, 38],
      [-8, -5.35, 34],
      [-8, -3.18, 34],
    ])
      move(p);
    breathe();
    for (const p of [
      [-8, -5.35, 34],
      [-7, -5.35, 30],
      [-7, -5.35, 3],
      [-7, -3.5, 0],
      [0, -3.5, 0],
      [0, surface, 0],
    ])
      move(p);
    for (let i = 0; i < 20; i++) tick(0, 0, false, true);
    return {
      log,
      health: game.health,
      surfaced: !game.diving,
      progress: structuredClone(game.progress.gallery),
    };
  } finally {
    game.keys.clear();
    game.touchMove = { x: 0, z: 0 };
    Object.assign(game.progress, progress);
    game.player.position.copy(position);
    game.health = health;
    game.save = saved;
    game.setPaused(true);
    updateSunkenGallery(game, 100);
  }
}

export function memorialView(game, view) {
  const locations = {
    entrance: [0, -3.5, 0, Math.PI / 2],
    bell: [-29, -3.18, 12, Math.PI],
    colonnade: [-29, -4.1, 20, Math.PI],
    memorial: [-8, -6.3, 45, Math.PI],
  };
  const [x, y, z, yaw] = locations[view],
    o = game.terrainProfile.gallery.origin;
  game.progress.gallery.opened = view === "memorial";
  game.sunkenGallery.lift = game.progress.gallery.opened ? 1 : 0;
  game.progress.gallery.recovered = false;
  game.player.position.set(o.x + x, o.y + y, o.z + z);
  game.yaw = yaw;
  game.avatar.rotation.y = yaw + Math.PI;
  game.pitch = -0.05;
  game.swimming = true;
  game.diving = view !== "bell";
  game.grounded = false;
  game.keys.clear();
  game.touchMove = { x: 0, z: 0 };
  game.diveAir = 32;
  game.elapsed = 10;
  updateSunkenGallery(game, 100);
  for (let i = 0; i < 45; i++) game.updatePlayer(1 / 60);
  game.updateCamera(10);
  game.updateDecorations(0);
  game.renderScene(0);
  game.cb.update(game.state());
  const gl = game.renderer.getContext(),
    program = game.renderer.properties.get(
      game.terrainMeshes[0].material,
    ).currentProgram;
  return {
    view,
    position: game.player.position.toArray(),
    camera: game.camera.position.toArray(),
    avatar: game.avatar.visible,
    shaderLinked: gl.getProgramParameter(program.program, gl.LINK_STATUS),
    render: { ...game.renderer.info.render },
  };
}
