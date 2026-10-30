import * as THREE from "three";
import { forgeInteriorPlan, forgeInteriorArt } from "./forge-interior-art.js";
import { courtWalkingHeight } from "./court-dais-rules.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationAssemblySolid } from "./field-station-solids.js";
import { mergeArchitecture } from "./visuals.js";

export function buildForgeInteriors(game) {
  game.forgeInteriors = [];
  if (game.level.biome !== "volcano") return;
  const m = {
    stone: game.stoneMat.clone(),
    dark: game.darkMat.clone(),
    iron: game.forgeMetal.clone(),
  };
  m.stone.color.setHex(0xb6a48c);
  m.dark.color.setHex(0x45423a);
  m.iron.color.setHex(0xa4a69b);
  m.iron.metalness = 0.65;
  m.iron.roughness = 0.62;
  m.glow = new THREE.MeshStandardMaterial({
    color: 0xf6d7a3,
    emissive: 0xffb45d,
    emissiveIntensity: 1.7,
    roughness: 0.6,
  });
  for (const [name, material] of Object.entries(m)) {
    material.name = `Foundry interior ${name}`;
    material.vertexColors = true;
  }
  for (const gate of game.fieldGates) {
    const root = new THREE.Group();
    root.name = `Foundry service hall ${gate.stage}`;
    root.position.copy(gate.root.position);
    game.world.add(root);
    const record = {
      stage: gate.stage,
      root,
      assemblies: [],
      lamps: [],
      materials: m,
    };
    game.forgeInteriors.push(record);
    function capture(group, kind) {
      group.updateMatrix();
      const parts = [...group.children];
      for (const mesh of parts) {
        mesh.updateMatrix();
        mesh.geometry.applyMatrix4(mesh.matrix).applyMatrix4(group.matrix);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrix();
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        game.cameraSurfaces.capture(mesh, { small: true, thin: true });
      }
      const solid = stationAssemblySolid(
        game,
        { id: `forge-interior-${gate.stage}-${record.assemblies.length}` },
        parts,
        {
          bodyPadding: 0.8,
          // Reserve shoulders beside machinery, but catch landings only within
          // the normal movement disk. The wider body margin can touch a ledge
          // whose top is beyond either boot's resting reach.
          supportRadius: 0.55,
          layeredSupport: true,
        },
      );
      record.assemblies.push({ kind, solid });
      return solid;
    }
    for (const [i, spec] of forgeInteriorPlan(gate.stage).entries()) {
      const wx = root.position.x + spec.x,
        wz = root.position.z + spec.z;
      // A bed can cross several shallow dais treads. Extend its foundation
      // below the lowest tread and seat its plinth across the highest.
      const low =
        footprintMinimum(
          (x, z) => courtWalkingHeight(game, x, z),
          wx,
          wz,
          spec.w,
          spec.d,
          0.2,
        ) - 0.08;
      // These bases meet the next 20 cm dais tread. Bury their plinth start
      // slightly so its cap stays below that tread: a nearby support disk must
      // not lift a walking root onto the bank and plant its boot in the trim.
      const high =
        -footprintMinimum(
          (x, z) => -courtWalkingHeight(game, x, z),
          wx,
          wz,
          spec.w,
          spec.d,
          0.2,
        ) - 0.005;
      const group = forgeInteriorArt(
        spec,
        m,
        game.level.seed + gate.stage * 371 + i * 89,
      );
      group.position.set(spec.x, high - root.position.y, spec.z);
      const foundation = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w, high - low, spec.d),
        m.dark,
      );
      foundation.geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(
          new Float32Array(
            foundation.geometry.attributes.position.count * 3,
          ).fill(0.87),
          3,
        ),
      );
      foundation.position.y = (low - high) / 2;
      group.add(foundation);
      const solid = capture(group, spec.kind);
      Object.assign(record.assemblies.at(-1), { spec, low, high });
      solid.forgeInterior = true;
    }
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * 5.25, 3.7, 1.5);
      group.rotation.y = (-side * Math.PI) / 2;
      const box = (w, h, d, mat, x, y, z) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        geo.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(
            new Float32Array(geo.attributes.position.count * 3).fill(1),
            3,
          ),
        );
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        group.add(mesh);
      };
      box(0.7, 1.25, 0.7, m.iron, 0, 0, -0.1);
      box(0.55, 0.9, 0.06, m.glow, 0, 0, 0.28);
      for (const x of [-0.23, 0, 0.23]) box(0.055, 1, 0.12, m.iron, x, 0, 0.33);
      for (const y of [-0.54, 0.54])
        box(0.82, 0.13, 0.75, m.stone, 0, y, -0.04);
      capture(group, "wall lamp");
      record.lamps.push(
        new THREE.Vector3(side * 4.7, 3.7, 1.5).add(root.position),
      );
    }
    record.triangles = root.children.reduce(
      (n, o) =>
        n +
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
      0,
    );
    mergeArchitecture(root, 1);
  }
}
