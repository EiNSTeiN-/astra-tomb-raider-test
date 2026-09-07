import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CIPHER_SIGNS,
  cipherName,
  cipherClue,
  CIPHER_TRIALS,
} from "./cipher-rules.js";

// Original relief silhouettes, extruded into stone rather than floating glyph
// sprites. All four faces remain readable while a drum turns.
export function cipherRelief(sign) {
  const parts = [],
    bar = (ax, ay, bx, by, width = 0.035) => {
      const g = new THREE.BoxGeometry(
        width,
        Math.hypot(bx - ax, by - ay),
        0.038,
      );
      g.rotateZ(-Math.atan2(bx - ax, by - ay)).translate(
        (ax + bx) / 2,
        (ay + by) / 2,
        0,
      );
      parts.push(g);
    };
  if (sign === 0) {
    parts.push(new THREE.TorusGeometry(0.16, 0.035, 8, 32));
    parts.push(
      new THREE.CylinderGeometry(0.07, 0.07, 0.035, 20).rotateX(Math.PI / 2),
    );
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      bar(
        Math.sin(a) * 0.23,
        Math.cos(a) * 0.23,
        Math.sin(a) * 0.32,
        Math.cos(a) * 0.32,
      );
    }
  } else if (sign === 1) {
    bar(0, 0.3, 0, -0.22, 0.05);
    for (const side of [-1, 1]) {
      bar(0, 0.16, side * 0.22, 0.28);
      bar(0, 0, side * 0.25, 0.1);
      bar(0, -0.13, side * 0.21, -0.28);
      bar(side * 0.13, -0.23, side * 0.27, -0.18, 0.027);
    }
  } else if (sign === 2) {
    for (const x of [-0.23, 0, 0.23]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.24);
      shape.bezierCurveTo(-0.16, 0.01, -0.12, -0.2, 0, -0.2);
      shape.bezierCurveTo(0.12, -0.2, 0.16, 0.01, 0, 0.24);
      parts.push(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.035,
          bevelEnabled: true,
          bevelSize: 0.01,
          bevelThickness: 0.01,
          bevelSegments: 1,
          steps: 1,
          curveSegments: 8,
        }).translate(x, x === 0 ? 0.06 : -0.04, 0),
      );
    }
  } else {
    const shape = new THREE.Shape();
    shape.moveTo(0.11, 0.3);
    shape.bezierCurveTo(-0.35, 0.32, -0.35, -0.32, 0.11, -0.3);
    shape.bezierCurveTo(-0.13, -0.15, -0.13, 0.15, 0.11, 0.3);
    parts.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.035,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 12,
      }),
    );
  }
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  const result = mergeGeometries(flat);
  flat.forEach((g) => g.dispose());
  parts.forEach((g) => g.dispose());
  return result;
}

// One atlas contains repeated sign names, drum numbers and all covenant lines.
// Each line owns a padded 768 x 96 cell; no per-frame canvas repaint is needed.
export function cipherPlaques() {
  const names = [
    ...new Set([
      ...CIPHER_SIGNS,
      ...Array.from({ length: 6 }, (_, i) => cipherName(i)),
      "READ THE COVENANT",
      ...CIPHER_TRIALS.flatMap((t) => t.clues.map(cipherClue)),
    ]),
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = Math.ceil(names.length / 2) * 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d7cda7";
  ctx.font = "600 38px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  names.forEach((name, i) =>
    ctx.fillText(name, (i % 2) * 768 + 384, Math.floor(i / 2) * 96 + 48, 736),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
  });
  return (name, width, height = width / 8) => {
    const i = names.indexOf(name);
    if (i < 0) throw Error(`Unknown covenant inscription: ${name}`);
    const geometry = new THREE.PlaneGeometry(width, height),
      uv = geometry.attributes.uv;
    for (let j = 0; j < uv.count; j++)
      uv.setXY(
        j,
        ((i % 2) * 768 + uv.getX(j) * 768) / canvas.width,
        1 - (Math.floor(i / 2) * 96 + (1 - uv.getY(j)) * 96) / canvas.height,
      );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.cipherLabel = name;
    return mesh;
  };
}

export function batchCipherDrum(rotor) {
  rotor.updateWorldMatrix(true, true);
  const inverse = rotor.matrixWorld.clone().invert(),
    groups = new Map(),
    originals = new Set();
  rotor.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld),
    );
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
    originals.add(o.geometry);
  });
  rotor.clear();
  for (const [material, parts] of groups) {
    const geometry = mergeGeometries(parts),
      mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    rotor.add(mesh);
    parts.forEach((g) => g.dispose());
  }
  originals.forEach((g) => g.dispose());
}

export function cipherWheelGeometry() {
  const parts = [new THREE.TorusGeometry(0.32, 0.035, 8, 32)];
  for (const side of [-1, 1])
    parts.push(
      new THREE.BoxGeometry(0.05, 0.62, 0.05).rotateZ((side * Math.PI) / 4),
    );
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return geometry;
}
