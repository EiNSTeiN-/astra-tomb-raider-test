import { alpineMaterial } from "../src/alpine-material.js";
import { verifyCalderaDepth } from "./verify-caldera-browser.js";

// Both shells must keep their mutual depth ordering before clearing depth for
// the playable world. Test them together against a conventional long camera.
export function verifyAlpineDepth(game) {
  return verifyCalderaDepth(game, {
    name: "Alpine ranges",
    names: ["Alpine range 0", "Alpine range 1"],
    createMaterial: alpineMaterial,
  });
}
