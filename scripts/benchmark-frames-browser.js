// Run in a development expedition in a disposable browser profile:
// await (await import('/scripts/benchmark-frames-browser.js')).benchmarkFrames(__vesper.game)
// Uses the actual animation loop. Movement remains available during the sample.
// Results describe this browser/device/view, not a supported-device FPS guarantee.
export async function benchmarkFrames(game, { duration = 6500 } = {}) {
  if (!game.active || game.paused)
    throw new Error("Start or resume an expedition before sampling frames.");
  const renderer = game.renderer;
  const gl = renderer.getContext();
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const originalFrame = game.frame;
  const originalRender = game.renderScene;
  const pending = [],
    gpu = [],
    cpu = [],
    intervals = [],
    counts = [];
  let previous = 0,
    disjoint = 0,
    skippedQueries = 0,
    stopped = false;
  const start = performance.now();
  function poll() {
    if (timer && gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      disjoint++;
      gpu.length = 0;
      for (const query of pending) gl.deleteQuery(query);
      pending.length = 0;
      return;
    }
    while (
      pending.length &&
      gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = pending.shift();
      gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
  }
  game.renderScene = function (...args) {
    if (stopped || !timer || pending.length >= 16) {
      if (!stopped) skippedQueries++;
      return originalRender.apply(this, args);
    }
    const query = gl.createQuery();
    gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    try {
      return originalRender.apply(this, args);
    } finally {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      pending.push(query);
    }
  };
  game.frame = function (...args) {
    const time = performance.now();
    const sampling = !stopped && this.active && !this.paused;
    const result = originalFrame.apply(this, args);
    if (sampling) {
      cpu.push(performance.now() - time);
      if (previous) intervals.push(time - previous);
      previous = time;
      counts.push({ ...renderer.info.render });
    } else previous = 0;
    return result;
  };
  try {
    while (performance.now() - start < duration) {
      await new Promise(requestAnimationFrame);
      poll();
    }
    stopped = true;
    const deadline = performance.now() + 2000;
    while (pending.length && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      poll();
    }
    return {
      chapter: game.level.id,
      quality: game.store.data.settings.quality,
      viewport: renderer.getSize({
        set(width, height) {
          return { width, height };
        },
      }),
      pixelRatio: renderer.getPixelRatio(),
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : "Unavailable",
      duration: performance.now() - start,
      frameIntervalMs: statistics(intervals),
      frameCpuMs: statistics(cpu),
      renderGpuMs: statistics(gpu),
      calls: statistics(counts.map((value) => value.calls)),
      triangles: statistics(counts.map((value) => value.triangles)),
      disjoint,
      skippedQueries,
      unfinishedQueries: pending.length,
    };
  } finally {
    game.frame = originalFrame;
    game.renderScene = originalRender;
    for (const query of pending) gl.deleteQuery(query);
  }
}

function statistics(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
  };
}
