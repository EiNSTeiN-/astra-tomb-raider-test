// Static observer setup on disposable progress. This does not play a chapter.
import * as THREE from "three";
import { prepareStation } from "./inspect-field-stations-browser.js";
import { carryingComponent } from "../src/expeditions.js";

export function prepareCarriedFittingObserver(game, id) {
  const f = game.items.find((f) => f.id === id);
  if (!f?.stationStyle || f.kind !== "lift")
    throw new Error("No regional fitting " + id);
  prepareStation(game, f);
  game.progress.torch = false;
  game.progress.field.push(f.id);
  game.avatar.rotation.y = Math.PI;
  game.updatePlayer(0);
  return { id, label: f.label, stage: f.stage };
}

export function carriedFittingSnapshot(game) {
  const carrier = game.rig?.carrier,
    visible = carrier?.variants.filter((v) => v.fitting.visible) || [];
  const fitting = visible[0]?.fitting,
    bounds = fitting && new THREE.Box3().setFromObject(fitting),
    meshes = [];
  fitting?.traverse((m) => {
    if (m.isMesh) meshes.push(m);
  });
  return {
    expected: !!carryingComponent(game.level, game.progress),
    visible: !!carrier?.root.visible,
    ids: visible.map((v) => v.id),
    label: fitting?.name,
    center: bounds?.getCenter(new THREE.Vector3()).toArray(),
    size: bounds?.getSize(new THREE.Vector3()).toArray(),
    coverage: game.rig?.visibility?.uniform.value,
    meshes: meshes.length,
    finite: meshes.every((m) => m.matrixWorld.elements.every(Number.isFinite)),
  };
}
