import * as THREE from "three";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { mergeArchitecture } from "./visuals.js";
import { windSurface } from "./wind-art.js";

// Regional joinery sits on the rear header, away from the reading and trolley
// aisle. Caps have a continuous bearing; cast marks grow out of backed plates.
export function buildCableFrameArt(
  game,
  parent,
  center,
  frame,
  width,
  materials,
) {
  const group = new THREE.Group(),
    forward = new THREE.Vector3(
      frame.direction.x,
      0,
      frame.direction.z,
    ).normalize(),
    capMeshes = [],
    motifMeshes = [],
    biome = game.level.biome;
  group.position.copy(center);
  group.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      frame.across,
      new THREE.Vector3(0, 1, 0),
      forward,
    ),
  );
  parent.add(group);
  let serial = game.level.seed + Math.round(center.x * 11 + center.z * 17);
  const mesh = (geometry, material = materials.metal, x = 0, y = 0, z = 0) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    if (material.userData.windMetal) windSurface(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    game.cameraSurfaces?.capture(object, { small: true, thin: true });
    return object;
  };
  const block = (w, h, d, x, y, z, material = materials.metal) =>
    mesh(stoneBlockGeometry(w, h, d, ++serial), material, x, y, z);
  const cap = (w, h, d, y, material = materials.timber) =>
    capMeshes.push(block(w, h, d, 0, y, 0, material));
  const prism = (points, depth, material, x = 0, y = 0, z = 0) => {
    const shape = new THREE.Shape();
    points.forEach(([px, py], i) =>
      i ? shape.lineTo(px, py) : shape.moveTo(px, py),
    );
    shape.closePath();
    return mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 8,
        steps: 1,
      }),
      material,
      x,
      y,
      z,
    );
  };
  const face = 0.21,
    plate = block(0.72, 0.46, 0.09, 0, 0, 0.165, materials.timber);
  for (const x of [-0.28, 0.28])
    for (const y of [-0.075, 0.075])
      mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.026, 6).rotateX(Math.PI / 2),
        materials.metal,
        x,
        y,
        face + 0.007,
      );
  const line = (points, radius = 0.012) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, y]) => new THREE.Vector3(x, y, face + 0.002)),
    );
    const m = mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(8, points.length * 4),
        radius,
        6,
        false,
      ),
    );
    motifMeshes.push(m);
    return m;
  };
  const disc = (r, x = 0, y = 0) => {
    const m = mesh(
      new THREE.CylinderGeometry(r, r, 0.03, 24).rotateX(Math.PI / 2),
      materials.metal,
      x,
      y,
      face + 0.004,
    );
    motifMeshes.push(m);
    return m;
  };
  const ring = (r, tube, x = 0, y = 0) => {
    const m = mesh(
      new THREE.TorusGeometry(r, tube, 6, 32),
      materials.metal,
      x,
      y,
      face + 0.003,
    );
    motifMeshes.push(m);
    return m;
  };
  switch (biome) {
    case "jungle": {
      cap(width * 0.96, 0.1, 0.34, 0.155);
      // A forked botanical mark and curved wooden corbels distinguish the
      // canopy gear from stone shrines and the other regions' metalwork.
      line([
        [0, -0.17],
        [0, 0],
        [0.02, 0.17],
      ]);
      for (const side of [-1, 1])
        for (const height of [-0.08, 0.04]) {
          const leaf = new THREE.Shape();
          leaf.moveTo(0, 0);
          leaf.bezierCurveTo(-0.05, 0.025, -0.05, 0.08, 0, 0.12);
          leaf.bezierCurveTo(0.05, 0.08, 0.05, 0.025, 0, 0);
          const m = mesh(
            new THREE.ExtrudeGeometry(leaf, {
              depth: 0.022,
              bevelEnabled: false,
              curveSegments: 8,
            }),
            materials.metal,
            0,
            height,
            face - 0.006,
          );
          m.rotation.z = side * -0.85;
          motifMeshes.push(m);
        }
      for (const side of [-1, 1])
        capMeshes.push(
          prism(
            [
              [0, 0],
              [side * 0.22, 0.12],
              [side * 0.34, 0.2],
              [side * 0.34, 0.28],
              [0, 0.12],
            ],
            0.2,
            materials.timber,
            side * (width / 2 - 0.34),
            -0.24,
            -0.1,
          ),
        );
      break;
    }
    case "desert":
      cap(width * 0.98, 0.1, 0.35, 0.155, materials.stone);
      cap(width * 0.82, 0.1, 0.31, 0.245, materials.stone);
      cap(width * 0.64, 0.1, 0.27, 0.335, materials.stone);
      disc(0.09);
      ring(0.13, 0.011);
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6;
        line(
          [
            [Math.sin(angle) * 0.147, Math.cos(angle) * 0.147],
            [Math.sin(angle) * 0.185, Math.cos(angle) * 0.185],
          ],
          0.009,
        );
      }
      break;
    case "snow": {
      cap(width * 0.98, 0.08, 0.36, 0.145);
      const shape = new THREE.Shape();
      shape.moveTo(-0.24, 0);
      shape.lineTo(0, 0.18);
      shape.lineTo(0.24, 0);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width * 0.98,
        bevelEnabled: false,
      })
        .rotateY(Math.PI / 2)
        .translate(-width * 0.49, 0.18, 0);
      const frost = (game.cableFrostMaterial ||= new THREE.MeshStandardMaterial(
        { name: "Hoist frost", color: 0xdce7eb, roughness: 0.95 },
      ));
      capMeshes.push(mesh(geometry, frost));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          tip = [Math.sin(a) * 0.17, Math.cos(a) * 0.17];
        line([[0, 0], tip], 0.01);
        for (const side of [-1, 1])
          line(
            [
              [Math.sin(a) * 0.11, Math.cos(a) * 0.11],
              [
                Math.sin(a + side * 0.5) * 0.15,
                Math.cos(a + side * 0.5) * 0.15,
              ],
            ],
            0.009,
          );
      }
      break;
    }
    case "water":
      cap(width * 0.98, 0.09, 0.38, 0.15, materials.metal);
      cap(width * 0.91, 0.07, 0.3, 0.225, materials.timber);
      for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * 1.8;
        line(
          [
            [0, -0.15],
            [Math.sin(a) * 0.1, 0],
            [Math.sin(a) * 0.22, Math.cos(a) * 0.18 - 0.035],
          ],
          0.011,
        );
      }
      line(
        [
          [-0.18, -0.12],
          [0, -0.17],
          [0.18, -0.12],
        ],
        0.016,
      );
      break;
    case "volcano":
      cap(width, 0.13, 0.37, 0.17, materials.timber);
      for (const z of [-0.175, 0.175])
        capMeshes.push(
          block(width * 0.99, 0.04, 0.07, 0, 0.24, z, materials.metal),
        );
      for (let x = -width / 2 + 0.17; x < width / 2 - 0.1; x += 0.28)
        mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6).rotateX(
            Math.PI / 2,
          ),
          materials.metal,
          x,
          0.17,
          0.19,
        );
      motifMeshes.push(
        prism(
          [
            [-0.2, 0.12],
            [-0.2, 0.04],
            [-0.045, 0.04],
            [-0.045, -0.15],
            [0.045, -0.15],
            [0.045, 0.04],
            [0.2, 0.04],
            [0.2, 0.12],
          ],
          0.03,
          materials.metal,
          0,
          0,
          face - 0.008,
        ),
      );
      line(
        [
          [-0.14, -0.16],
          [-0.14, -0.07],
        ],
        0.013,
      );
      line(
        [
          [0.14, -0.16],
          [0.14, -0.07],
        ],
        0.013,
      );
      break;
    case "sky":
      cap(width, 0.11, 0.36, 0.16, materials.stone);
      cap(width * 0.91, 0.1, 0.31, 0.26, materials.stone);
      line(
        [
          [-0.16, -0.16],
          [0, 0],
          [0.13, 0.16],
        ],
        0.015,
      );
      for (let i = 0; i < 5; i++) {
        const y = -0.1 + i * 0.045,
          x = y * 0.8;
        line(
          [
            [x - 0.1, y + 0.015],
            [x, y],
            [x + 0.075, y - 0.012],
          ],
          0.012,
        );
      }
      break;
    case "crystal": {
      cap(width * 0.98, 0.09, 0.34, 0.15, materials.timber);
      const mineral = (game.cableMineralMaterial ||=
        new THREE.MeshStandardMaterial({
          name: "Hoist mineral inlay",
          color: 0x938baa,
          roughness: 0.38,
          metalness: 0.18,
        }));
      for (const [x, h, r] of [
        [-width * 0.25, 0.19, 0.085],
        [0, 0.3, 0.12],
        [width * 0.25, 0.22, 0.095],
      ])
        capMeshes.push(
          mesh(
            new THREE.CylinderGeometry(r * 0.38, r, h, 6),
            mineral,
            x,
            0.19 + h / 2,
            0,
          ),
        );
      for (const x of [-0.14, 0, 0.14])
        motifMeshes.push(
          prism(
            [
              [x - 0.047, -0.14],
              [x - 0.047, 0.09],
              [x, 0.18],
              [x + 0.047, 0.09],
              [x + 0.047, -0.14],
            ],
            0.025,
            materials.metal,
            0,
            0,
            face - 0.006,
          ),
        );
      break;
    }
    case "eclipse":
      cap(width * 0.98, 0.09, 0.34, 0.15, materials.metal);
      capMeshes.push(block(0.09, 0.22, 0.1, 0, 0.27, 0, materials.metal));
      capMeshes.push(
        mesh(
          new THREE.TorusGeometry(0.22, 0.023, 8, 40),
          materials.metal,
          0,
          0.46,
          0,
        ),
      );
      ring(0.155, 0.012);
      disc(0.027);
      line(
        [
          [-0.22, -0.1],
          [0.14, 0.13],
        ],
        0.012,
      );
      line(
        [
          [-0.14, 0.13],
          [0.22, -0.1],
        ],
        0.012,
      );
      for (const [x, y] of [
        [-0.22, -0.1],
        [0.14, 0.13],
        [-0.14, 0.13],
        [0.22, -0.1],
      ])
        disc(0.023, x, y);
      break;
  }
  mergeArchitecture(group);
  return { group, biome, plate, capMeshes, motifMeshes };
}
