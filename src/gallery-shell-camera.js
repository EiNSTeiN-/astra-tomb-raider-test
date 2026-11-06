import { BufferGeometry, Float32BufferAttribute, Mesh } from "three";

// Join the actual shell quads into finite coplanar rectangles. A single box
// around this hollow interior would obstruct every view inside it, while one
// camera entry for every half-metre tile would repeat thousands of queries.
function mergeAlong(panels, along) {
  const other = along === "u" ? "v" : "u",
    groups = new Map();
  for (const p of panels) {
    const key = `${p.axis},${p.plane},${p[other + "0"]},${p[other + "1"]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const merged = [];
  for (const row of groups.values()) {
    row.sort((a, b) => a[along + "0"] - b[along + "0"]);
    let run;
    for (const p of row) {
      if (run && Math.abs(run[along + "1"] - p[along + "0"]) < 1e-7)
        run[along + "1"] = p[along + "1"];
      else {
        run = { ...p };
        merged.push(run);
      }
    }
  }
  return merged;
}

export function captureGalleryShell(game, panels) {
  const merged = mergeAlong(mergeAlong(panels, "u"), "v");
  game.sunkenGallery.cameraPanels = merged;
  if (!game.cameraSurfaces) return;
  for (const p of merged) {
    const axes = [0, 1, 2].filter((axis) => axis !== p.axis),
      low = [],
      high = [];
    low[p.axis] = high[p.axis] = p.plane;
    low[axes[0]] = p.u0;
    high[axes[0]] = p.u1;
    low[axes[1]] = p.v0;
    high[axes[1]] = p.v1;
    // These two corners supply bounds only. No proxy is rendered or retained
    // in the scene, and capture copies the bounds before releasing geometry.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([...low, ...high], 3),
    );
    const proxy = new Mesh(geometry, game.darkMat);
    game.sunkenGallery.root.add(proxy);
    game.cameraSurfaces.capture(proxy, { small: true, thin: true });
    proxy.removeFromParent();
    geometry.dispose();
  }
}
