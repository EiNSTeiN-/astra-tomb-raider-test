import * as THREE from "three";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { patinatedBronze } from "./observatory-geometry.js";
import { stationSolid } from "./field-station-solids.js";

// Chapter rewards have physical construction and bearing. The objective marker
// supplies their distant beacon; their surfaces can retain natural lighting.
export function buildRelicArtwork(game, feature, root) {
  const construction = new THREE.Group(),
    payload = new THREE.Group(),
    biome = game.level.biome,
    stone = game.stoneMat.clone(),
    bronze = patinatedBronze(),
    inlay = new THREE.MeshStandardMaterial({
      color: new THREE.Color(game.level.color),
      roughness: 0.44,
      metalness: 0.12,
    });
  construction.name = `${game.level.artifact} · resting stand`;
  payload.name = game.level.artifact;
  stone.name = "Relic stand masonry";
  bronze.name = "Relic worn bronze";
  root.add(construction, payload);
  let serial = game.level.seed + 1837;
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = payload) => {
    if (material.vertexColors && !geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.name = `${parent.name} · ${material.name || "inlay"}`;
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const cylinder = (
    radius,
    height,
    material,
    x,
    y,
    z,
    parent = payload,
    sides = 32,
  ) =>
    add(
      new THREE.CylinderGeometry(radius, radius, height, sides),
      material,
      x,
      y,
      z,
      parent,
    );
  const ring = (radius, tube, material, x, y, z, parent = payload) =>
    add(
      new THREE.TorusGeometry(radius, tube, 8, 48),
      material,
      x,
      y,
      z,
      parent,
    );
  const beam = (from, to, radius, material = bronze, parent = payload) => {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to),
      center = a.clone().add(b).multiplyScalar(0.5),
      object = add(
        new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8),
        material,
        center.x,
        center.y,
        center.z,
        parent,
      );
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.sub(a).normalize(),
    );
    return object;
  };
  const relief = (
    points,
    depth,
    material,
    x = 0,
    y = 0,
    z = 0,
    parent = payload,
  ) => {
    const shape = new THREE.Shape(
      points.map(([u, v]) => new THREE.Vector2(u, v)),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      curveSegments: 12,
    });
    geometry.translate(0, 0, -depth / 2);
    return add(geometry, material, x, y, z, parent);
  };
  const socket = (radius = 0.3) => cylinder(radius, 0.06, bronze, 0, 0.03, 0);

  // Fit the full foundation, not just its centre, to the rendered ground grid.
  let low = root.position.y,
    high = low;
  for (let iz = -8; iz <= 8; iz++)
    for (let ix = -8; ix <= 8; ix++) {
      const y = game.groundHeight(
        root.position.x + ix * 0.11,
        root.position.z + iz * 0.11,
      );
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  const bottom = low - root.position.y - 0.14,
    foot = high - root.position.y + 0.13,
    seat = foot + 1.04,
    sides = biome === "crystal" ? 6 : biome === "eclipse" ? 12 : 8;
  add(
    new THREE.CylinderGeometry(0.82, 0.86, foot - bottom, sides),
    stone,
    0,
    (foot + bottom) / 2,
    0,
    construction,
  );
  cylinder(0.76, 0.14, stone, 0, foot + 0.07, 0, construction, sides);
  add(
    new THREE.CylinderGeometry(0.48, 0.57, 0.72, sides),
    stone,
    0,
    foot + 0.5,
    0,
    construction,
  );
  for (const y of [foot + 0.17, foot + 0.84])
    cylinder(0.59, 0.075, bronze, 0, y, 0, construction, sides);
  // The bronze plate bears on the crown instead of sharing its exposed face.
  // Extend the crown down into the neck and upper collar so it cannot float.
  const plateThickness = 0.025,
    crownThickness = 0.17;
  cylinder(
    0.7,
    crownThickness,
    stone,
    0,
    seat - plateThickness - crownThickness / 2,
    0,
    construction,
    sides,
  );
  cylinder(
    0.64,
    plateThickness,
    bronze,
    0,
    seat - plateThickness / 2,
    0,
    construction,
  );
  // Small inset panels are part of the shaft; none stand apart from its face.
  for (let i = 0; i < sides; i++) {
    const angle = ((i + 0.5) * Math.PI * 2) / sides,
      panel = add(
        stoneBlockGeometry(0.17, 0.38, 0.025, ++serial, 0.006),
        inlay,
        Math.sin(angle) * 0.48,
        foot + 0.5,
        Math.cos(angle) * 0.48,
        construction,
      );
    panel.rotation.y = angle;
  }
  payload.position.y = seat;
  feature.relicArt = { construction, payload, seat };
  feature.core = payload;

  if (biome === "jungle") {
    socket();
    const compass = new THREE.Group();
    compass.name = "Compass face";
    payload.add(compass);
    compass.position.y = 0.463551;
    compass.rotation.x = Math.PI / 3;
    const jade = pbrMaterial("rock", 0x729680);
    jade.name = "Compass carved jade";
    jade.normalScale.setScalar(0.12);
    jade.roughness = 0.38;
    cylinder(0.44, 0.09, bronze, 0, 0, 0, compass);
    cylinder(0.383, 0.016, jade, 0, 0.05, 0, compass);
    ring(0.402, 0.024, bronze, 0, 0.062, 0, compass).rotation.x = Math.PI / 2;
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        r = i % 4 === 0 ? 0.337 : 0.354;
      beam(
        [Math.sin(a) * r, 0.067, Math.cos(a) * r],
        [Math.sin(a) * 0.372, 0.067, Math.cos(a) * 0.372],
        0.004,
        bronze,
        compass,
      );
    }
    const needle = relief(
      [
        [0, 0.3],
        [-0.055, 0],
        [0, -0.3],
        [0.055, 0],
      ],
      0.018,
      bronze,
      0,
      0.08,
      0,
      compass,
    );
    needle.rotation.x = -Math.PI / 2;
    add(new THREE.SphereGeometry(0.042, 16, 8), bronze, 0, 0.083, 0, compass);
    for (const x of [-0.22, 0.22]) beam([x, 0.05, 0], [x, 0.225, 0.14], 0.025);
    mergeArchitecture(compass);
  } else if (biome === "desert") {
    socket(0.23);
    beam([0, 0.05, 0], [0, 0.25, 0], 0.047);
    const eye = cylinder(0.35, 0.1, bronze, 0, 0.61, 0);
    eye.rotation.x = Math.PI / 2;
    ring(0.32, 0.025, bronze, 0, 0.61, 0.057);
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        ray = relief(
          [
            [-0.035, 0],
            [0, 0.14],
            [0.035, 0],
          ],
          0.045,
          bronze,
          Math.sin(a) * 0.337,
          0.61 + Math.cos(a) * 0.337,
          0,
        );
      ray.rotation.z = -a;
    }
    relief(
      [
        [-0.25, 0],
        [0, 0.105],
        [0.25, 0],
        [0, -0.105],
      ],
      0.025,
      inlay,
      0,
      0.61,
      0.074,
    );
    add(new THREE.SphereGeometry(0.07, 24, 12), bronze, 0, 0.61, 0.1).scale.z =
      0.4;
  } else if (biome === "snow") {
    socket(0.37);
    const silver = new THREE.MeshStandardMaterial({
      name: "Winter chime silver",
      color: 0xb9c9c4,
      metalness: 0.78,
      roughness: 0.34,
    });
    for (const x of [-0.31, 0.31]) beam([x, 0.04, 0], [x, 0.89, 0], 0.035);
    beam([-0.35, 0.89, 0], [0.35, 0.89, 0], 0.043);
    for (const [i, x] of [-0.2, 0, 0.2].entries()) {
      const h = [0.43, 0.55, 0.37][i],
        top = 0.79,
        profile = [
          [0, 0],
          [0.13, 0],
          [0.135, 0.045],
          [0.08, h * 0.44],
          [0.075, h - 0.025],
          [0.03, h],
          [0, h],
        ];
      beam([x, top, 0], [x, 0.89, 0], 0.012, silver);
      add(
        new THREE.LatheGeometry(
          profile.map((p) => new THREE.Vector2(...p)),
          32,
        ),
        silver,
        x,
        top - h,
        0,
      );
      ring(0.085, 0.01, bronze, x, top - h * 0.48, 0).rotation.x = Math.PI / 2;
      add(
        new THREE.SphereGeometry(0.029, 12, 8),
        bronze,
        x,
        top - h + 0.022,
        0,
      );
    }
  } else if (biome === "water") {
    socket(0.4);
    const shell = new THREE.MeshPhysicalMaterial({
      name: "Pearl nacre",
      color: 0xf0e5cf,
      metalness: 0.07,
      roughness: 0.25,
      iridescence: 0.6,
      iridescenceIOR: 1.35,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        petal = relief(
          [
            [0, 0],
            [-0.12, 0.1],
            [-0.17, 0.31],
            [0, 0.44],
            [0.17, 0.31],
            [0.12, 0.1],
          ],
          0.03,
          bronze,
          Math.sin(a) * 0.18,
          0.05,
          Math.cos(a) * 0.18,
        );
      petal.rotation.set(0.34, a, 0);
    }
    add(new THREE.SphereGeometry(0.25, 48, 32), shell, 0, 0.39, 0);
  } else if (biome === "volcano") {
    socket(0.27);
    const obsidian = pbrMaterial("rock", 0x302c32);
    obsidian.name = "Ember heart obsidian";
    obsidian.roughness = 0.3;
    obsidian.normalScale.setScalar(0.18);
    const heat = new THREE.MeshStandardMaterial({
      name: "Ember seams",
      color: 0xa34721,
      emissive: 0xd96526,
      emissiveIntensity: 0.28,
      roughness: 0.7,
    });
    relief(
      [
        [0, 0.09],
        [-0.29, 0.36],
        [-0.34, 0.63],
        [-0.22, 0.79],
        [-0.08, 0.8],
        [0, 0.69],
        [0.08, 0.8],
        [0.22, 0.79],
        [0.34, 0.63],
        [0.29, 0.36],
      ],
      0.22,
      obsidian,
      0,
      0,
      0,
    );
    for (const side of [-1, 1]) {
      beam([side * 0.08, 0.18, 0.132], [side * 0.15, 0.41, 0.132], 0.009, heat);
      beam([side * 0.15, 0.41, 0.132], [side * 0.07, 0.54, 0.132], 0.009, heat);
      beam([side * 0.07, 0.54, 0.132], [side * 0.14, 0.72, 0.132], 0.009, heat);
      beam([side * 0.18, 0.04, 0], [side * 0.18, 0.28, 0], 0.028);
    }
  } else if (biome === "sky") {
    socket(0.18);
    const feather = pbrMaterial("rock", 0xbfc6bc);
    feather.name = "Carved stone feather";
    feather.normalScale.setScalar(0.18);
    relief(
      [
        [-0.04, 0.12],
        [-0.17, 0.31],
        [-0.24, 0.54],
        [-0.21, 0.77],
        [-0.1, 1.02],
        [0.09, 1.23],
        [-0.005, 0.86],
        [-0.04, 0.48],
      ],
      0.075,
      feather,
    );
    relief(
      [
        [-0.02, 0.15],
        [0.13, 0.29],
        [0.23, 0.5],
        [0.24, 0.73],
        [0.18, 0.96],
        [0.09, 1.23],
        [0.015, 0.81],
      ],
      0.075,
      feather,
    );
    beam([-0.055, 0.03, 0], [0.09, 1.23, 0], 0.022, bronze);
    for (let i = 0; i < 7; i++) {
      const y = 0.3 + i * 0.1,
        x = -0.03 + (y - 0.3) * 0.12;
      for (const side of [-1, 1])
        beam(
          [x, y, 0.052],
          [x + side * (0.17 - Math.abs(y - 0.62) * 0.16), y + 0.12, 0.052],
          0.006,
          bronze,
        );
    }
  } else if (biome === "crystal") {
    socket(0.31);
    const glass = new THREE.MeshPhysicalMaterial({
      name: "Memory prism crystal",
      color: 0xa798cd,
      metalness: 0.12,
      roughness: 0.19,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 0.32,
    });
    const points = [
      [0, 0],
      [0.18, 0.11],
      [0.24, 0.3],
      [0.24, 0.73],
      [0.12, 1.04],
      [0, 1.11],
    ];
    add(
      new THREE.LatheGeometry(
        points.map((p) => new THREE.Vector2(...p)),
        6,
      ),
      glass,
      0,
      0.04,
      0,
    );
    for (const y of [0.19, 0.33, 0.74])
      cylinder(0.248, 0.045, bronze, 0, y, 0, payload, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      beam(
        [Math.sin(a) * 0.24, 0.33, Math.cos(a) * 0.24],
        [Math.sin(a) * 0.24, 0.74, Math.cos(a) * 0.24],
        0.009,
      );
    }
  } else {
    socket(0.31);
    beam([0, 0.05, 0], [0, 0.22, 0], 0.046);
    const celestial = new THREE.MeshStandardMaterial({
      name: "Atlas midnight enamel",
      color: 0x364759,
      metalness: 0.23,
      roughness: 0.35,
    });
    add(new THREE.SphereGeometry(0.22, 32, 24), celestial, 0, 0.58, 0);
    for (const [radius, x, z] of [
      [0.32, 0, 0],
      [0.355, Math.PI / 2, 0],
      [0.38, 0, Math.PI / 3],
    ]) {
      const orbit = ring(radius, 0.018, bronze, 0, 0.58, 0);
      orbit.rotation.set(x, 0, z);
    }
    beam([0, 0.17, 0], [0, 0.99, 0], 0.018);
    for (let i = 0; i < 24; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 24),
        theta = i * 2.399963229728653;
      add(
        new THREE.SphereGeometry(i % 5 === 0 ? 0.016 : 0.01, 8, 6),
        bronze,
        Math.sin(phi) * Math.cos(theta) * 0.22,
        0.58 + Math.cos(phi) * 0.22,
        Math.sin(phi) * Math.sin(theta) * 0.22,
      );
    }
    for (const y of [0.2, 0.97])
      add(new THREE.SphereGeometry(0.033, 16, 8), bronze, 0, y, 0);
  }
  // Capture real parts before batching, including the removable payload's
  // visibility. An empty stand cannot leave an invisible artifact obstruction.
  for (const group of [construction, payload]) {
    group.traverse((object) => {
      if (object.isMesh)
        game.cameraSurfaces?.capture(object, {
          small: true,
          thin: true,
          cylinderAxis:
            object.geometry.type === "CylinderGeometry" ? "y" : null,
        });
    });
    mergeArchitecture(group);
  }
  stationSolid(
    game,
    feature,
    root,
    [1.72, foot - bottom, 1.72],
    [0, (foot + bottom) / 2, 0],
    { radius: 0.86, node: construction },
  );
  stationSolid(
    game,
    feature,
    root,
    [1.4, seat - foot, 1.4],
    [0, (seat + foot) / 2, 0],
    {
      radius: 0.7,
      node: construction,
      surfaceHeight: (x, z) =>
        root.position.y +
        seat -
        (Math.hypot(x - root.position.x, z - root.position.z) > 0.64
          ? plateThickness
          : 0),
    },
  );
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(payload),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3()).sub(root.position);
  stationSolid(game, feature, root, size.toArray(), center.toArray(), {
    support: false,
    node: payload,
  });
  updateRelicArtwork(game, feature);
  return feature.relicArt;
}

export function updateRelicArtwork(game, feature) {
  const unlocked = game.progress.stage >= game.level.mechanisms,
    collected =
      game.progress.completed || game.progress.found.includes(feature.id);
  feature.group.visible = true;
  feature.core.visible = unlocked && !collected;
  if (feature.marker) feature.marker.visible = unlocked && !collected;
}
