import * as THREE from "three";

// A small offscreen render tests the actual background shaders and depth reset.
// Reversing triangle submission must not expose back slopes through front faces;
// a gameplay-colored card near the normal far plane must cover the mountains.
export async function inspectAndeanDepth(game) {
  const renderer = game.renderer,
    camera = game.camera.clone();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x193849);
  const ranges = game.cloudCity.group.children.filter(
    (m) => m.geometry.attributes.ridgeLight,
  );
  const meshes = ranges.map((original) => {
    const mesh = new THREE.Mesh(original.geometry, original.material);
    mesh.renderOrder = original.renderOrder;
    mesh.frustumCulled = false;
    mesh.onAfterRender = original.onAfterRender;
    scene.add(mesh);
    return mesh;
  });
  const target = new THREE.WebGLRenderTarget(128, 128);
  const savedTarget = renderer.getRenderTarget(),
    savedAutoClear = renderer.autoClear;
  const savedShadow = renderer.shadowMap.autoUpdate;
  const originals = meshes.map((m) => m.geometry.index.array.slice());
  const cardMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    toneMapped: false,
  });
  const cardGeometry = new THREE.PlaneGeometry(1200, 1200);
  const card = new THREE.Mesh(cardGeometry, cardMaterial);
  const read = async () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(128 * 128 * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 128, pixels);
    return pixels;
  };
  try {
    renderer.autoClear = true;
    renderer.shadowMap.autoUpdate = false;
    camera.updateMatrixWorld(true);
    const before = await read();
    meshes.forEach((m) => {
      const source = m.geometry.index.array,
        reversed = new source.constructor(source.length);
      for (let i = 0; i < source.length; i += 3)
        reversed.set(source.subarray(i, i + 3), source.length - i - 3);
      m.geometry.index.array.set(reversed);
      m.geometry.index.needsUpdate = true;
    });
    const reversed = await read();
    let changed = 0,
      maxDifference = 0;
    for (let i = 0; i < before.length; i++) {
      const d = Math.abs(before[i] - reversed[i]);
      if (d) changed++;
      maxDifference = Math.max(maxDifference, d);
    }
    card.position
      .copy(camera.position)
      .addScaledVector(
        camera.getWorldDirection(new THREE.Vector3()),
        camera.far - 1,
      );
    card.quaternion.copy(camera.quaternion);
    scene.add(card);
    const foreground = await read();
    let covered = 0;
    for (let i = 0; i < foreground.length; i += 4)
      if (foreground[i] > 250 && foreground[i + 1] < 2 && foreground[i + 2] < 2)
        covered++;
    return {
      changedChannels: changed,
      maxDifference,
      foregroundPixels: covered,
      totalPixels: 128 * 128,
      triangles: ranges.reduce((n, m) => n + m.geometry.index.count / 3, 0),
      meshes: ranges.length,
    };
  } finally {
    meshes.forEach((m, i) => {
      m.geometry.index.array.set(originals[i]);
      m.geometry.index.needsUpdate = true;
    });
    renderer.setRenderTarget(savedTarget);
    renderer.autoClear = savedAutoClear;
    renderer.shadowMap.autoUpdate = savedShadow;
    cardGeometry.dispose();
    cardMaterial.dispose();
    target.dispose();
  }
}

export function andeanCompassView(game, heading = 0) {
  game.renderer.setAnimationLoop(null);
  game.setPaused(true);
  const p = game.player.position;
  game.camera.position.set(p.x, p.y + 3.2, p.z);
  game.camera.lookAt(
    p.x + Math.cos(heading) * 600,
    p.y + 120,
    p.z + Math.sin(heading) * 600,
  );
  game.camera.updateMatrixWorld(true);
  game.renderScene(0);
  const gl = game.renderer.getContext();
  return {
    heading,
    position: game.camera.position.toArray(),
    quality: game.store.data.settings.quality,
    triangles: game.renderer.info.render.triangles,
    calls: game.renderer.info.render.calls,
    linked: game.renderer.info.programs.every((p) =>
      gl.getProgramParameter(p.program, gl.LINK_STATUS),
    ),
  };
}
