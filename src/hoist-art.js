import * as THREE from "three";
import { HOIST_CARS, HOIST_DECK, HOIST_RISE } from "./bell-hoist-rules.js";
import { monasteryRoofGeometry } from "./monastery-roof.js";
import { mergeArchitecture } from "./visuals.js";

export const SHEAVE_RADIUS = 0.58;
export const HOIST_AXIS = new THREE.Vector3(14, 0, 18).normalize();

export function cableTangent(index) {
  const [x, z] = HOIST_CARS[index],
    side = index ? 1 : -1;
  return new THREE.Vector3(x, 14.8, z).addScaledVector(
    HOIST_AXIS,
    side * SHEAVE_RADIUS,
  );
}

// A quarter-turn over each grooved sheave and a straight shared upper run.
// Piecewise circular/linear segments avoid spline overshoot through the rims.
export function hoistLinkPath() {
  const path = new THREE.CurvePath();
  for (let side = 0; side < 2; side++) {
    const [x, z] = HOIST_CARS[side],
      center = new THREE.Vector3(x, 14.8, z);
    const points = Array.from({ length: 25 }, (_, i) => {
      const angle = (side ? Math.PI / 2 : Math.PI) - ((i / 24) * Math.PI) / 2;
      return center
        .clone()
        .addScaledVector(HOIST_AXIS, Math.cos(angle) * SHEAVE_RADIUS)
        .add(new THREE.Vector3(0, Math.sin(angle) * SHEAVE_RADIUS, 0));
    });
    if (side)
      path.add(
        new THREE.LineCurve3(
          new THREE.Vector3(
            HOIST_CARS[0][0],
            14.8 + SHEAVE_RADIUS,
            HOIST_CARS[0][1],
          ),
          points[0],
        ),
      );
    for (let i = 1; i < points.length; i++)
      path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  }
  return path;
}

export function hoistBronzeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: "Weathered hoist bronze",
    color: 0x8c805f,
    metalness: 0.68,
    roughness: 0.57,
  });
  material.onBeforeCompile = (shader) => {
    const noise = `
      varying vec3 vHoistPosition;
      float hoistHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      float hoistNoise(vec3 p){
        vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hoistHash(i),hoistHash(i+vec3(1,0,0)),f.x),
          mix(hoistHash(i+vec3(0,1,0)),hoistHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hoistHash(i+vec3(0,0,1)),hoistHash(i+vec3(1,0,1)),f.x),
          mix(hoistHash(i+vec3(0,1,1)),hoistHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vHoistPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHoistPosition=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + noise)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float hoistWear=hoistNoise(vHoistPosition*vec3(8.0,1.2,8.0))*.65+hoistNoise(vHoistPosition*33.0)*.35;
        float hoistPatina=smoothstep(.32,.74,hoistWear);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.05,.085,.075),hoistPatina*.65);
        diffuseColor.rgb*=.86+.14*hoistNoise(vHoistPosition*95.0);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.86,hoistPatina);",
      );
  };
  material.customProgramCacheKey = () => "vesper-hoist-bronze-1";
  return material;
}

export function buildHoistArt(
  game,
  { add, block, solid, stone, wood, iron, bronze, snow },
) {
  const h = game.bellHoist,
    root = h.root,
    upper = HOIST_DECK + 2 * HOIST_RISE;
  h.art = { paving: [], rollers: [], furniture: [], frames: [] };
  const remove = (mesh) => {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  };
  const beam = (a, b, width, depth, mat = wood, parent = root) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start),
      p = start.clone().add(end).multiplyScalar(0.5);
    const mesh = block(
      width,
      delta.length(),
      depth,
      p.x,
      p.y,
      p.z,
      mat,
      parent,
      false,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const pin = (r, length, x, y, z, parent = root, mat = bronze, axis = "z") => {
    const m = add(
      new THREE.CylinderGeometry(r, r, length, 12),
      mat,
      x,
      y,
      z,
      parent,
    );
    if (axis !== "y") m.rotation[axis === "x" ? "z" : "x"] = Math.PI / 2;
    return m;
  };
  // Fitted slabs have actual narrow joints and varied edges at the same floor
  // height as their support. The recessed bed closes every joint underneath.
  const floor = h.decks[0];
  remove(floor.mesh);
  delete floor.mesh;
  block(39, 0.28, 51, 0, HOIST_DECK - 0.24, 0, stone);
  for (let iz = 0; iz < 17; iz++)
    for (let ix = 0; ix < 13; ix++) {
      const x = -18 + ix * 3,
        z = -24 + iz * 3;
      block(2.95, 0.1, 2.95, x, HOIST_DECK - 0.05, z, stone, root, false);
      h.art.paving.push({ x, z, y: HOIST_DECK });
      if ((ix + iz * 3) % 9 === 0) {
        // Small inset corner keys break up the large loading floor.
        for (const dx of [-1.26, 1.26])
          block(
            0.07,
            0.012,
            0.32,
            x + dx,
            HOIST_DECK + 0.001,
            z - 1.1,
            bronze,
            root,
            false,
          );
      }
    }
  if (h.linkCable) remove(h.linkCable);
  h.linkCable = add(
    new THREE.TubeGeometry(hoistLinkPath(), 128, 0.028, 7, false),
    iron,
    0,
    0,
    0,
  );
  h.linkCable.name = "Continuous upper counterweight cable";
  h.linkCable.userData.animated = true;
  for (const [i, car] of h.cars.entries()) {
    const [px, pz] = HOIST_CARS[i],
      parent = car.root;
    remove(car.deck.mesh);
    delete car.deck.mesh;
    // Thick plank deck, banded end grain, riveted skids and clear boarding edges.
    for (let plank = 0; plank < 7; plank++)
      block(
        0.526,
        0.21,
        4.38,
        -1.629 + plank * 0.543,
        -0.105,
        0,
        wood,
        parent,
        false,
      );
    for (const z of [-1.9, 1.9]) {
      block(3.8, 0.16, 0.32, 0, -0.29, z, iron, parent, false);
      block(3.8, 0.24, 0.07, 0, -0.12, z * 1.145, bronze, parent, false);
      for (let k = 0; k < 7; k++)
        pin(0.035, 0.035, -1.629 + k * 0.543, -0.06, z * 1.17, parent);
    }
    for (const side of [-1, 1]) {
      block(0.09, 0.23, 4.4, side * 1.86, -0.12, 0, iron, parent, false);
      for (const y of [0.5, 1.95]) {
        block(0.16, 0.22, 0.17, side * 1.72, y, 0.14, iron, parent, false);
        const wheel = new THREE.Group();
        wheel.position.set(side * 1.82, y, 0);
        parent.add(wheel);
        pin(0.145, 0.1, 0, 0, 0, wheel, bronze);
        for (let n = 0; n < 4; n++) {
          const a = (n * Math.PI) / 2;
          pin(
            0.02,
            0.025,
            Math.cos(a) * 0.09,
            Math.sin(a) * 0.09,
            0.065,
            wheel,
            iron,
          );
        }
        h.art.rollers.push({ root: wheel, car: i, base: y, side });
        mergeArchitecture(wheel);
        pin(0.062, 0.29, side * 1.82, y, 0, parent, iron);
      }
      // Triangular knee braces stiffen the hanger without closing the entries.
      beam(
        [side * 1.72, 1.72, 0],
        [side * 0.9, 2.65, 0],
        0.1,
        0.12,
        bronze,
        parent,
      );
      for (const z of [-0.13, 0.13])
        pin(0.047, 0.04, side * 1.72, 2.53, z, parent, iron);
    }
    const tangent = cableTangent(i),
      offset = tangent.clone().sub(new THREE.Vector3(px, 14.8, pz));
    car.cable.position.x = tangent.x;
    car.cable.position.z = tangent.z;
    car.hangerOffset = offset;
    car.cableAnchor = 2.77;
    beam([0, 2.65, 0], [offset.x, 2.65, offset.z], 0.12, 0.14, bronze, parent);
    const eye = add(
      new THREE.TorusGeometry(0.12, 0.042, 8, 16),
      bronze,
      offset.x,
      2.65,
      offset.z,
      parent,
    );
    eye.rotation.y = Math.atan2(-HOIST_AXIS.z, HOIST_AXIS.x);
    // Cheek plates enclose a grooved, spoked wheel. Only the rotor turns.
    if (car.sheave) remove(car.sheave);
    const sheave = new THREE.Group();
    sheave.position.set(px, 14.8, pz);
    sheave.rotation.y = Math.atan2(-HOIST_AXIS.z, HOIST_AXIS.x);
    root.add(sheave);
    const rotor = new THREE.Group();
    sheave.add(rotor);
    for (const z of [-0.08, 0.08]) {
      add(
        new THREE.TorusGeometry(SHEAVE_RADIUS, 0.055, 8, 40),
        bronze,
        0,
        0,
        z,
        rotor,
      );
      for (let spoke = 0; spoke < 8; spoke++) {
        const a = (spoke * Math.PI) / 4;
        beam(
          [Math.cos(a) * 0.14, Math.sin(a) * 0.14, z],
          [Math.cos(a) * 0.54, Math.sin(a) * 0.54, z],
          0.07,
          0.055,
          bronze,
          rotor,
        );
      }
    }
    pin(0.145, 0.27, 0, 0, 0, rotor);
    for (const z of [-0.24, 0.24]) {
      block(0.48, 0.44, 0.16, 0, 0, z, iron, sheave, false);
      block(0.23, 0.74, 0.14, 0, 0.39, z, iron, sheave, false);
      pin(0.075, 0.035, 0, 0, z * 1.4, sheave, bronze);
      pin(0.035, 0.035, -0.13, 0.12, z * 1.4, sheave);
      pin(0.035, 0.035, 0.13, -0.12, z * 1.4, sheave);
    }
    car.sheave = sheave;
    car.rotor = rotor;
    h.art.frames.push(sheave);
    for (const side of [-1, 1]) {
      // The gantry's timber legs carry the header independently of its rails.
      block(
        0.36,
        15.55,
        0.4,
        px + side * 2.25,
        7.775,
        pz + 1.7,
        wood,
        root,
        true,
      );
      solid(px + side * 2.25, 7.775, pz + 1.7, 0.36, 15.55, 0.4);
      beam(
        [px + side * 2.25, 13.8, pz + 1.7],
        [px + side * 0.8, 15.55, pz + 1.7],
        0.22,
        0.3,
        wood,
      );
      block(
        0.65,
        0.24,
        0.7,
        px + side * 2.25,
        HOIST_DECK + 0.12,
        pz + 1.7,
        stone,
        root,
        false,
      );
      solid(px + side * 2.25, HOIST_DECK + 0.12, pz + 1.7, 0.65, 0.24, 0.7);
    }
    mergeArchitecture(rotor);
    mergeArchitecture(sheave);
    mergeArchitecture(parent);
  }
  // Riveted straps and shallow edge ribs remain attached to each bridge leaf.
  for (const [leaf, side] of [
    [h.bridge, -1],
    [h.bridgeWest, 1],
  ]) {
    for (let n = 0; n < 12; n++) {
      const x = side * (n + 0.5) * 0.75;
      block(0.025, 0.018, 2.55, x, 0.006, 0, iron, leaf, false);
      for (const z of [-1.14, 1.14])
        pin(0.026, 0.03, x, 0.025, z, leaf, bronze, "y");
    }
    mergeArchitecture(leaf);
  }
  // Raised bands, crown loops and the pivot make the bell's casting readable.
  for (const [r, y] of [
    [1.1, -1.5],
    [0.57, -0.52],
    [0.38, 0.24],
  ]) {
    const band = add(
      new THREE.TorusGeometry(r, 0.03, 8, 48),
      bronze,
      0,
      y,
      0,
      h.bell,
    );
    band.rotation.x = Math.PI / 2;
  }
  for (let n = 0; n < 12; n++) {
    const a = (n * Math.PI) / 6;
    const stud = add(
      new THREE.SphereGeometry(0.047, 8, 6),
      bronze,
      Math.cos(a) * 0.68,
      -0.91,
      Math.sin(a) * 0.68,
      h.bell,
    );
    stud.scale.y = 1.9;
  }
  for (const z of [-0.13, 0.13])
    add(
      new THREE.TorusGeometry(0.17, 0.045, 8, 18),
      bronze,
      0,
      0.48,
      z,
      h.bell,
    );
  pin(0.12, 3.5, 12, upper + 5.38, -13, root, iron, "x");
  // A small slate canopy protects the bell but keeps the valley view open.
  const roof = game.monasteryMaterials?.roof || stone;
  for (const isSnow of [false, true]) {
    add(
      monasteryRoofGeometry({
        width: 4.6,
        depth: 3.8,
        rise: 0.95,
        snow: isSnow,
        seed: 781,
      }),
      isSnow ? snow : roof,
      12,
      upper + 5.8,
      -13,
      root,
      true,
    );
  }
  for (const x of [10.6, 13.4])
    beam([x, upper + 4.5, -13], [12, upper + 5.5, -13], 0.15, 0.19, wood);
  h.tongue.userData.animated = true;
  mergeArchitecture(h.bell);
  // Human-scale refuge belongings occupy wall-side pockets, outside the route.
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x82705c,
    roughness: 1,
  });
  const furnishings = [
    [-17, HOIST_DECK, -14, 2.1, 1.1, 2.4],
    [17, HOIST_DECK, -18, 2.1, 1.1, 2.4],
    [-16, upper, -21, 1.2, 0.65, 3.4],
  ];
  for (const [x, y, z, w, height, d] of furnishings) {
    block(w, 0.14, d, x, y + 0.12, z, wood, root, false);
    for (const dx of [-w * 0.35, w * 0.35])
      for (const dz of [-d * 0.37, d * 0.37])
        block(
          0.14,
          0.5,
          0.14,
          x + dx,
          y - 0.03 + 0.25,
          z + dz,
          wood,
          root,
          false,
        );
    for (let n = 0; n < 3; n++) {
      const roll = add(
        new THREE.CylinderGeometry(0.18, 0.18, w * 0.8, 16, 5),
        cloth,
        x,
        y + 0.42 + n * 0.14,
        z + (n - 1) * 0.44,
      );
      roll.rotation.z = Math.PI / 2;
      for (const bandX of [-w * 0.27, w * 0.27]) {
        const strap = add(
          new THREE.TorusGeometry(0.183, 0.018, 6, 20),
          wood,
          x + bandX,
          y + 0.42 + n * 0.14,
          z + (n - 1) * 0.44,
        );
        strap.rotation.y = Math.PI / 2;
      }
    }
    const collider = solid(x, y + height / 2, z, w, height, d);
    h.art.furniture.push(collider);
  }
  // Cargo chests in the southern corners stay away from the broken gallery.
  for (const [x, z] of [
    [-17, 22],
    [17, 22],
  ]) {
    block(1.8, 0.95, 1.2, x, HOIST_DECK + 0.475, z, wood, root, false);
    for (const dx of [-0.58, 0.58])
      block(0.08, 0.98, 1.24, x + dx, HOIST_DECK + 0.49, z, iron, root, false);
    block(1.88, 0.1, 1.28, x, HOIST_DECK + 1, z, wood, root, false);
    pin(0.07, 0.06, x, HOIST_DECK + 0.65, z - 0.64, root, bronze);
    h.art.furniture.push(solid(x, HOIST_DECK + 0.55, z, 1.9, 1.1, 1.3));
  }
  // A supported shelf of ledgers gives the recovered register a place in a
  // larger archive, without introducing extra interactive objectives.
  block(5.5, 0.16, 0.62, -12, upper + 1.25, -24.1, wood, root, false);
  for (let n = 0; n < 15; n++) {
    const height = 0.4 + (n % 4) * 0.06;
    block(
      0.22,
      height,
      0.38,
      -14.3 + n * 0.32,
      upper + 1.34 + height / 2,
      -24.1,
      n % 3 === 0 ? cloth : wood,
      root,
      false,
    );
  }
  for (const x of [-14, -10])
    beam([x, upper + 0.55, -24.4], [x, upper + 1.15, -23.85], 0.1, 0.12, iron);
  h.art.furniture.push(solid(-12, upper + 1.5, -24.1, 5.5, 0.7, 0.7));
  for (const d of h.decks) delete d.mesh;
}

export function updateHoistArt(h) {
  for (const [i, car] of h.cars.entries())
    car.rotor.rotation.z = ((i ? 1 : -1) * car.root.position.y) / SHEAVE_RADIUS;
  for (const roller of h.art.rollers)
    roller.root.rotation.z =
      (-roller.side * h.cars[roller.car].root.position.y) / 0.145;
}
