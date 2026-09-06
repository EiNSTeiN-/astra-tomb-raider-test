import * as THREE from "three";
import { random } from "./campaign.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";

function leafGeometry() {
  const vertices = [],
    uv = [],
    indices = [],
    sections = 7;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections,
      width = Math.pow(Math.sin(t * Math.PI), 0.8) * 0.24;
    for (const side of [-1, 0, 1]) {
      vertices.push(
        side * width,
        t,
        Math.sin(t * Math.PI) * 0.12 - Math.abs(side) * 0.04,
      );
      uv.push((side + 1) / 2, t);
    }
    if (i < sections)
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side;
        indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildRuinGrowth(game) {
  game.growthPatches = [];
  if (game.level.biome !== "jungle") return;
  const rng = random(game.level.seed + 7114),
    wood = pbrMaterial("bark", 0x8f9677, 1),
    leaf = leafGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0x53783d,
    roughness: 0.87,
    side: THREE.DoubleSide,
  });
  game.growthWind = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.growthTime = game.growthWind;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float growthTime; varying vec2 vLeafUv;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vLeafUv=uv;
      transformed.z+=sin(growthTime*1.3+instanceMatrix[3].x*.6+instanceMatrix[3].y)*uv.y*uv.y*.028;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec2 vLeafUv;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float rib=1.0-smoothstep(.008,.026,abs(vLeafUv.x-.5));
      float veins=pow(.5+.5*cos((vLeafUv.y+abs(vLeafUv.x-.5)*.65)*70.0),18.0);
      diffuseColor.rgb*=mix(.65,1.15,vLeafUv.y)*(1.0+rib*.26+veins*.12);
    `,
    );
  };
  material.customProgramCacheKey = () => "vesper-climbing-leaf-1";
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  for (const room of game.map.rooms) {
    const rootGroup = new THREE.Group(),
      leaves = [],
      x = room.x * 7,
      z = room.z * 7;
    game.world.add(rootGroup);
    const addLeaf = (position, angle, size) => {
      dummy.position.copy(position);
      dummy.rotation.set(
        (rng() - 0.5) * 0.7,
        angle,
        Math.PI + (rng() - 0.5) * 1.8,
      );
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      leaves.push({ matrix: dummy.matrix.clone(), shade: 0.72 + rng() * 0.5 });
    };
    for (const side of [-1, 1]) {
      const px = x + side * 19,
        pz = z - 18,
        y = game.groundHeight(px, pz);
      for (let root = 0; root < 3; root++) {
        const a = root * 2.1 + side * 0.4,
          reach = 3.3 + rng() * 1.5;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(
            px + Math.cos(a) * reach,
            game.groundHeight(
              px + Math.cos(a) * reach,
              pz + Math.sin(a) * reach,
            ) + 0.08,
            pz + Math.sin(a) * reach,
          ),
          new THREE.Vector3(
            px + Math.cos(a) * 2,
            y + 0.8,
            pz + Math.sin(a) * 2,
          ),
          new THREE.Vector3(
            px + Math.cos(a + 0.4) * 1.45,
            y + 3.3,
            pz + Math.sin(a + 0.4) * 1.45,
          ),
          new THREE.Vector3(
            px + Math.cos(a - 0.1) * 1.3,
            y + 6.3,
            pz + Math.sin(a - 0.1) * 1.3,
          ),
          new THREE.Vector3(
            px + Math.cos(a + 0.3) * 1.5,
            y + 8.8,
            pz + Math.sin(a + 0.3) * 1.5,
          ),
        ]);
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, 0.12 + rng() * 0.09, 6, false),
          wood,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        rootGroup.add(mesh);
        for (let i = 0; i < 30; i++) {
          const p = curve.getPoint(0.25 + i / 40);
          p.x += (rng() - 0.5) * 0.45;
          p.z += (rng() - 0.5) * 0.45;
          addLeaf(p, a, 0.22 + rng() * 0.3);
        }
      }
    }
    // Tendrils drape from the lintel, with paired leaves along the stem.
    const y = game.groundHeight(x, z);
    for (let vine = 0; vine < 11; vine++) {
      const vx = x - 17 + vine * 3.3,
        length = 2 + rng() * 6,
        points = [];
      for (let i = 0; i < 9; i++)
        points.push(
          new THREE.Vector3(
            vx + Math.sin(i * 0.6 + vine) * 0.22,
            y + 10.1 - (i * length) / 8,
            z - 16.3 + Math.sin(i) * 0.12,
          ),
        );
      const curve = new THREE.CatmullRomCurve3(points),
        mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 20, 0.035, 4, false),
          wood,
        );
      rootGroup.add(mesh);
      for (let i = 0; i < length * 9; i++) {
        const p = curve.getPoint(i / (length * 9));
        p.x += (i % 2 ? 1 : -1) * 0.12;
        addLeaf(p, (rng() - 0.5) * 0.8, 0.19 + rng() * 0.22);
      }
    }
    mergeArchitecture(rootGroup);
    const canopy = new THREE.InstancedMesh(leaf, material, leaves.length);
    leaves.forEach((entry, i) => {
      canopy.setMatrixAt(i, entry.matrix);
      canopy.setColorAt(i, color.setScalar(entry.shade));
    });
    canopy.receiveShadow = true;
    canopy.castShadow = false;
    canopy.computeBoundingSphere();
    game.world.add(canopy);
    game.growthPatches.push({
      rootGroup,
      canopy,
      center: new THREE.Vector3(x, y + 5, z - 15),
    });
  }
}

export function updateRuinGrowth(game) {
  if (game.growthWind) game.growthWind.value = game.elapsed;
  const range = game.store.data.settings.quality === "low" ? 65 : 105;
  for (const patch of game.growthPatches || []) {
    const visible = patch.center.distanceTo(game.player.position) < range;
    patch.rootGroup.visible = visible;
    patch.canopy.visible = visible;
  }
}
