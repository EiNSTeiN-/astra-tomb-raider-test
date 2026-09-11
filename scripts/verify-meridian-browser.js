import { verifyCalderaDepth } from "./verify-caldera-browser.js";
import { meridianRockMaterial } from "../src/meridian-rock-material.js";

// The same conventional-camera, foreground and oblique-clipping reference
// applies to both distant heightfields. Run with the animation loop stopped.
export function verifyMeridianDepth(game) {
  return verifyCalderaDepth(game, {
    name: "Meridian escarpment",
    createMaterial: meridianRockMaterial,
  });
}
