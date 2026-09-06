export class ChapterLoadError extends Error {
  constructor(kind, message, details) {
    super(message);
    this.name = "ChapterLoadError";
    this.kind = kind;
    this.details = details;
  }
}

export function abortError() {
  return new DOMException("Chapter loading cancelled", "AbortError");
}

export function waitForTask(task, signal, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(abortError());
    };
    // Consume the task even when cancellation preceded this call. Its eventual
    // failure must not become an unrelated unhandled rejection after a retry.
    Promise.resolve(task).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(
        new ChapterLoadError(
          "timeout",
          "The chapter is taking too long to prepare.",
        ),
      );
    }, timeoutMs);
  });
}

// WebGL 2 fences let the loading UI keep responding while the submitted first
// frame completes. No pixel readback and no blocking GPU wait are needed.
export function waitForFirstFrame(gl, signal, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) {
      reject(
        new ChapterLoadError(
          "renderer",
          "The first view could not be prepared.",
        ),
      );
      return;
    }
    let poll,
      timeout,
      settled = false;
    const cleanup = () => {
      clearTimeout(poll);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      gl.deleteSync(fence);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const abort = () => finish(abortError());
    const check = () => {
      if (gl.isContextLost()) {
        finish(
          new ChapterLoadError(
            "renderer",
            "The graphics connection was interrupted.",
          ),
        );
        return;
      }
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED)
        finish();
      else if (status === gl.WAIT_FAILED)
        finish(
          new ChapterLoadError(
            "renderer",
            "The first view could not be prepared.",
          ),
        );
      else poll = setTimeout(check, 20);
    };
    signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(
      () =>
        finish(
          new ChapterLoadError(
            "timeout",
            "The first view is taking too long to prepare.",
          ),
        ),
      timeoutMs,
    );
    gl.flush();
    check();
  });
}

export async function prepareChapter(
  game,
  { signal, onStage = () => {}, timeoutMs = 120000 } = {},
) {
  onStage("Loading the environment and soundscape…");
  const [assets] = await waitForTask(
    Promise.all([game.visualsReady, game.audio.ready]),
    signal,
    timeoutMs,
  );
  if (assets?.errors?.length)
    throw new ChapterLoadError(
      "assets",
      "Some chapter files could not be loaded.",
      assets.errors,
    );
  if (signal?.aborted) throw abortError();
  onStage("Preparing the first view…");
  game.updateCamera(1);
  game.updateDecorations(0);
  game.updateAudio();
  // Compile scene materials before exposing the view; the first render also
  // initializes shadow, reflection, and post-processing programs and targets.
  game.renderer.compile(game.scene, game.camera);
  game.renderScene(0);
  await waitForFirstFrame(game.renderer.getContext(), signal, timeoutMs);
  game.renderOnce = false;
}

export function preserveChapterSave(store, id) {
  const existed = Object.hasOwn(store.data.levels, id);
  const progress = existed ? structuredClone(store.data.levels[id]) : undefined;
  const currentLevel = store.data.currentLevel;
  return () => {
    if (existed) store.data.levels[id] = progress;
    else delete store.data.levels[id];
    store.data.currentLevel = currentLevel;
  };
}
