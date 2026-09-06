import * as THREE from "three";

let materialManager;

// Low-level masonry helpers create textures synchronously during a build.
// Capture their manager without making later loads share a global batch.
export function withMaterialManager(manager, build) {
  const previous = materialManager;
  materialManager = manager;
  try {
    return build();
  } finally {
    materialManager = previous;
  }
}

export function materialTextureLoader() {
  return new THREE.TextureLoader(materialManager);
}

export function createAssetBatch() {
  const errors = [];
  let finish,
    sealed = false;
  const ready = new Promise((resolve) => {
    finish = resolve;
  });
  const manager = new THREE.LoadingManager(
    () => finish({ errors }),
    undefined,
    (url) => errors.push({ url }),
  );
  // Keep the batch open until asynchronous model construction has finished
  // discovering its own images and installing the resulting scene objects.
  manager.itemStart("chapter-build");
  return {
    manager,
    ready,
    errors,
    seal(results = []) {
      if (sealed) return;
      sealed = true;
      for (const result of results)
        if (result.status === "rejected") errors.push({ cause: result.reason });
      manager.itemEnd("chapter-build");
    },
  };
}
