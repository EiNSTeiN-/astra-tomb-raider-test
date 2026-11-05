import * as THREE from "three";
import { solarCastPrism } from "./solar-cast-prism.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { mergeArchitecture } from "./visuals.js";
import { solarCastStroke } from "./solar-cast-stroke.js";
import { solarShutterScene } from "./solar-shutter-scenes.js";

export function shutterPanel(x, bottom, width, height, bevel = 0.12) {
  return [
    [x - width / 2 + bevel, bottom],
    [x + width / 2 - bevel, bottom],
    [x + width / 2, bottom + bevel],
    [x + width / 2, bottom + height - bevel],
    [x + width / 2 - bevel, bottom + height],
    [x - width / 2 + bevel, bottom + height],
    [x - width / 2, bottom + height - bevel],
    [x - width / 2, bottom + bevel],
  ];
}
export function buildSolarShutterArt({
  gate,
  leaf,
  side,
  materials: m,
  polygon,
  windows,
  field,
}) {
  if (!m.portalPanel) {
    m.portalPanel = patinatedBronze();
    m.portalPanel.name = "Cast solar records";
    m.portalPanel.color.setHex(0xc2a36c);
    m.portalPanel.roughness = 0.59;
    m.portalPanel.metalness = 0.76;
  }
  if (!m.shutterRecess) {
    m.shutterRecess = patinatedBronze();
    m.shutterRecess.name = "Recessed solar bronze";
    m.shutterRecess.color.setHex(0x918360);
    m.shutterRecess.roughness = 0.78;
    m.shutterRecess.metalness = 0.62;
  }
  const root = new THREE.Group(),
    parts = [],
    scene = solarShutterScene(gate.stage, side);
  root.name = scene.name + " cast shutter";
  leaf.add(root);
  let triangles = 0;
  const add = (geometry, material, kind, face = 0) => {
    const id = parts.length;
    geometry.setAttribute(
      "solarShutterPart",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count).fill(id),
        1,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    parts.push({ id, kind, face });
    triangles += geometry.attributes.position.count / 3;
    return mesh;
  };
  const outer = shutterPanel(field.x, field.bottom, field.width, field.height),
    cut = shutterPanel(
      field.x,
      field.bottom + 0.012,
      field.width - 0.024,
      field.height - 0.024,
    ),
    inner = shutterPanel(
      field.x,
      field.bottom + 0.17,
      field.width - 0.34,
      field.height - 0.34,
      0.1,
    );
  add(
    solarCastPrism(polygon, 0.48, [...windows, cut], 0),
    m.metal,
    "structural leaf",
  );
  add(solarCastPrism(outer, 0.24, [], 0), m.shutterRecess, "recess backing");
  const scale = Math.min(
      (field.width - 0.76) / 4.25,
      (field.height - 0.7) / 4.25,
    ),
    cy = field.bottom + field.height / 2,
    map = ([x, y]) => [field.x + x * scale, cy + y * scale];
  for (const face of [1, -1]) {
    const frame = solarCastPrism(outer, 0.14, [inner], 0.008);
    frame.translate(0, 0, face * 0.23);
    add(frame, m.portalPanel, "cast field rim", face);
    for (const shape of scene.shapes) {
      if (shape.stroke) {
        add(
          solarCastStroke(
            shape.stroke.path.map(map),
            (shape.stroke.width * scale) / 2,
            face,
          ),
          shape.tier === 0 ? m.metal : m.portalPanel,
          "cast fillet",
          face,
        );
        continue;
      }
      const front = [0.18, 0.24, 0.28][shape.tier],
        depth = front - 0.1,
        geometry = solarCastPrism(
          shape.points.map(map),
          depth,
          shape.holes.map((h) => h.map(map)),
          0.008,
        );
      geometry.translate(0, 0, (face * (front + 0.1)) / 2);
      add(
        geometry,
        shape.tier === 0 ? m.metal : m.portalPanel,
        "cast scene",
        face,
      );
    }
    // A narrow lower register carries repeated foundry strokes, separate from
    // the pictorial record and unrelated to the live mechanism controls.
    if (field.height > 5.3)
      for (let i = 0; i < 7; i++) {
        const x = field.x + (i - 3) * 0.48,
          y = field.bottom + 0.38,
          geometry = solarCastPrism(
            [
              [x - 0.09, y - 0.07],
              [x + 0.09, y - 0.07],
              [x + 0.04, y + 0.09],
              [x - 0.04, y + 0.09],
            ],
            0.055,
            [],
            0.006,
          );
        geometry.translate(0, 0, face * 0.134);
        add(geometry, m.portalPanel, "foundry register", face);
      }
  }
  const pullX = -side * (gate.leafWidth - 0.9),
    socket = solarCastPrism(
      Array.from({ length: 32 }, (_, i) => {
        const a = (i * Math.PI) / 16;
        return [pullX + Math.cos(a) * 0.27, 3.7 + Math.sin(a) * 0.43];
      }),
      0.23,
      [],
      0.012,
    );
  socket.translate(0, 0, 0.215);
  add(socket, m.metal, "pull socket", 1);
  mergeArchitecture(root, 2);
  const record = { root, parts, scene: scene.name, field, faces: 2, triangles };
  leaf.userData.solarShutter = record;
  return record;
}
