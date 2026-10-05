import * as THREE from "three";
import { carryingComponent } from "./expeditions.js";
import { stationLatheGeometry } from "./field-station-geometry.js";

// The pack is skinned to Spine2. Fit the carrier in the same bind-pose frame so
// it follows the pack through every animation without a second position spring.
export function buildCarriedFittings(game, model) {
  const spine = model.getObjectByName("mixamorigSpine2");
  if (!spine) return null;
  const root = new THREE.Group();
  root.name = "Recovered fitting on the expedition pack";
  root.userData.actor = true;
  root.visible = false;
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  root.applyMatrix4(
    spine.matrixWorld
      .clone()
      .invert()
      .multiply(model.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(0, 1.2, -0.7)),
  );
  spine.add(root);
  const pack = model.getObjectByName("Spine2_canvas"),
    ray = new THREE.Raycaster(),
    forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  const variants = [],
    materials = new Map();
  for (const f of game.items || []) {
    // Pump, cart and crane components have their own physical assemblies. This
    // carrier fits the regional cartridges, retaining their source dimensions.
    if (f.kind !== "lift" || !f.stationStyle || !f.core) continue;
    const fitting = f.core.clone(true);
    fitting.name = f.label;
    fitting.position.set(0, 0, 0);
    fitting.quaternion.identity();
    fitting.visible = false;
    fitting.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      const copy = (original) => {
        if (!materials.has(original)) {
          const material = original.clone();
          material.onBeforeCompile = original.onBeforeCompile;
          material.customProgramCacheKey = original.customProgramCacheKey;
          materials.set(original, material);
        }
        return materials.get(original);
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(copy)
        : copy(mesh.material);
      mesh.castShadow = mesh.receiveShadow = true;
    });
    root.add(fitting);
    variants.push({ stage: f.stage, id: f.id, fitting });
  }
  const leather = new THREE.MeshStandardMaterial({
      name: "Recovered fitting leather retaining bands",
      color: 0x46382b,
      roughness: 0.91,
    }),
    metal = new THREE.MeshStandardMaterial({
      name: "Recovered fitting pack cradle",
      color: 0x6c6659,
      metalness: 0.7,
      roughness: 0.61,
    });
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // The cartridge's closed bottom bears on this seat. The bands retain it
  // sideways; a shelf and two stays carry its weight back to the pack shoes.
  const seat = add(
    new THREE.BoxGeometry(0.72, 0.035, 0.72),
    metal,
    0,
    -0.4075,
    0,
  );
  seat.name = "Recovered fitting bearing seat";
  for (const y of [-0.04, 0.17]) {
    add(
      stationLatheGeometry(
        [
          [0.31, -0.03],
          [0.321, -0.03],
          [0.321, 0.03],
          [0.31, 0.03],
          [0.31, -0.03],
        ],
        32,
      ),
      leather,
      0,
      y,
      0,
    );
    // Two short shoes meet the existing pack, rather than floating behind it.
    for (const x of [-0.12, 0.12]) {
      ray.set(model.localToWorld(new THREE.Vector3(x, 1.2 + y, -1.2)), forward);
      const contact = pack && ray.intersectObject(pack)[0];
      const end = contact
        ? model.worldToLocal(contact.point.clone()).z + 0.7
        : 0.47;
      const start = 0.285;
      add(
        new THREE.BoxGeometry(0.065, 0.07, end - start),
        metal,
        x,
        y,
        (start + end) / 2,
      );
      add(new THREE.BoxGeometry(0.092, 0.095, 0.028), metal, x, y, end);
      if (y < 0) {
        const a = new THREE.Vector3(x, -0.4075, 0.35),
          b = new THREE.Vector3(x, y, end),
          delta = b.clone().sub(a),
          midpoint = a.clone().add(b).multiplyScalar(0.5);
        add(
          new THREE.CylinderGeometry(0.022, 0.022, delta.length(), 8),
          metal,
          ...midpoint.toArray(),
        ).quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.normalize(),
        );
      }
    }
  }
  return { root, variants };
}

export function updateCarriedFittings(game) {
  const carrier = game.rig?.carrier;
  if (!carrier) return;
  const carrying = !!(
    game.progress &&
    game.level?.id &&
    carryingComponent(game.level, game.progress)
  );
  let visible = false;
  for (const { stage, fitting } of carrier.variants) {
    fitting.visible = carrying && stage === game.progress.stage;
    visible ||= fitting.visible;
  }
  carrier.root.visible = visible;
}
