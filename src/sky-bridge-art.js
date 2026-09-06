import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pbrMaterial } from "./visuals.js";
import { random } from "./campaign.js";
import { fittedWallGeometry, fittedStoneGeometry } from "./sky-masonry.js";
import { weatherSkyStone } from "./sky-architecture.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { windMetal, windSurface } from "./wind-art.js";

export function bridgeArtMaterials() {
  const stone = pbrMaterial("rock", 0xc3c9c4);
  stone.name = "Bridge fitted granite";
  stone.vertexColors = true;
  stone.normalScale.set(0.32, 0.32);
  weatherSkyStone(stone);
  const wood = pbrMaterial("monastery-wood", 0xc0b7a5);
  wood.name = "Weathered bridge timber";
  wood.vertexColors = true;
  wood.normalScale.set(0.28, 0.28);
  wood.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 bridgeWoodCoord; varying vec3 vBridgeWood;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBridgeWood=bridgeWoodCoord;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBridgeWood;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float timberLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(timberLuma)*vec3(1.06,1.02,.94),.65);
        float grainPhase=vBridgeWood.z*117.+sin(vBridgeWood.x*1.3)*1.4;
        float grainFade=1.-smoothstep(.7,2.2,fwidth(grainPhase));
        float grain=(.5+.5*sin(grainPhase))*grainFade;
        diffuseColor.rgb*=.88+.12*grain;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.229,.202),.09);`,
      );
  };
  wood.customProgramCacheKey = () => "vesper-bridge-timber-1";
  const rope = new THREE.MeshStandardMaterial({
    name: "Twisted bridge fibre",
    color: 0xb5a17a,
    roughness: 0.97,
  });
  rope.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vBridgeRope;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBridgeRope=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vBridgeRope;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float strandPhase=(vBridgeRope.x*1.2-vBridgeRope.y*3.)*6.283185;
        float fibrePhase=(vBridgeRope.x*17.-vBridgeRope.y*31.)*6.283185;
        float strandFade=1.-smoothstep(.7,2.5,fwidth(strandPhase));
        float fibreFade=1.-smoothstep(.6,2.3,fwidth(fibrePhase));
        float strand=mix(.5,.5+.5*cos(strandPhase),strandFade);
        float fibre=sin(fibrePhase)*fibreFade;
        diffuseColor.rgb*=.62+.38*pow(strand,.45)+fibre*.035;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float ropeHeight=strand*.0025+fibre*.00018;
        vec3 ropeDx=dFdx(-vViewPosition),ropeDy=dFdy(-vViewPosition);
        vec3 ropeR1=cross(ropeDy,normal),ropeR2=cross(normal,ropeDx);
        float ropeDet=dot(ropeDx,ropeR1);
        vec3 ropeGradient=sign(ropeDet)*(dFdx(ropeHeight)*ropeR1+dFdy(ropeHeight)*ropeR2);
        normal=normalize(max(abs(ropeDet),1.e-12)*normal-ropeGradient);`,
      );
  };
  rope.customProgramCacheKey = () => "vesper-bridge-fibre-1";
  return { stone, wood, rope, metal: windMetal() };
}

export function bridgeWoodSurface(geometry, shade = 1) {
  const p = geometry.attributes.position;
  geometry.setAttribute("bridgeWoodCoord", p.clone());
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      new Float32Array(p.count * 3).fill(shade),
      3,
    ),
  );
  return geometry;
}

// Beveled/chipped edges retain a flat walking face, including on sloping decks.
export function bridgeBoardGeometry(width, depth, seed, warning = false) {
  const rng = random(seed);
  const g = stoneBlockGeometry(width, 0.19, depth, seed);
  const p = g.attributes.position,
    uv = g.attributes.uv;
  const offset = rng() * 7;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.08) p.setY(i, 0.095);
    uv.setXY(i, p.getZ(i) * 0.7 + offset, p.getX(i) * 0.29 + offset * 0.37);
  }
  g.computeVertexNormals();
  bridgeWoodSurface(g, warning ? 1.12 : 0.74 + rng() * 0.29);
  return g;
}

export function bridgeRopeGeometry(
  curve,
  radius = 0.065,
  segments = 32,
  sides = 8,
) {
  const g = new THREE.TubeGeometry(curve, segments, radius, sides, false);
  const uv = g.attributes.uv;
  const repeats = curve.getLength() / (Math.PI * 2 * radius);
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeats);
  return g;
}

export function bridgeRope(points, radius = 0.065, segments = 32, sides = 8) {
  return bridgeRopeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    radius,
    segments,
    sides,
  );
}

export function bridgeLashingGeometry(depth, seed = 1) {
  const rng = random(seed),
    points = [];
  const corners = [
    [-0.12, -depth / 2 - 0.035],
    [0.12, -depth / 2 - 0.035],
    [0.12, depth / 2 + 0.035],
    [-0.12, depth / 2 + 0.035],
  ];
  for (let j = 0; j < 4; j++)
    points.push([-0.025 + (j / 4) * 0.05, corners[j][0], corners[j][1]]);
  points.push([0.025, -0.12, -depth / 2 - 0.035]);
  points.push([0.07, -0.22 - rng() * 0.05, -depth / 2 - 0.065]);
  return bridgeRope(points, 0.023, 12, 6);
}

export function bridgeAnchorGeometry(low, top, seed) {
  const boundary = [
    [-0.7, low],
    [0.7, low],
    [0.57, top],
    [-0.57, top],
  ];
  const face = fittedWallGeometry(boundary, 1.8, seed, 0.83);
  // A shallow packed backing also closes side-view joints on these narrow piers.
  const backing = fittedStoneGeometry(boundary, 1.77, seed);
  const colors = backing.attributes.color;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 0.46, 0.46, 0.43);
  const result = mergeGeometries([face, backing]);
  face.dispose();
  backing.dispose();
  return result;
}

export function buildBridgeAnchor({ bridge, c, end, sign, game, m, add, box }) {
  const bankY = end ? bridge.by - bridge.ay : 0;
  const z = end - sign * 1.5;
  for (const side of [-1, 1]) {
    const x = side * 3.05;
    const worldX = bridge.ax + c.uz * x + c.ux * z;
    const worldZ = bridge.az - c.ux * x + c.uz * z;
    const low = game.groundHeight(worldX, worldZ) - bridge.ay;
    const seed = game.level.seed + bridge.stage * 91 + end * 7 + side;
    const column = bridgeAnchorGeometry(low, bankY + 5.9, seed);
    add(column, m.stone, x, 0, z, bridge.root, true);
    for (const [y, w, h, d] of [
      [0.22, 1.5, 0.32, 1.94],
      [5.84, 1.52, 0.24, 1.96],
      [6.12, 1.7, 0.32, 2.08],
    ])
      box(w, h, d, m.stone, x, bankY + y, z, bridge.root, true);
    game.obstacles.push({
      x: worldX,
      z: worldZ,
      w: 0.8,
      d: 1,
      h: bankY + 6.28 - low,
      skyAnchor: true,
    });
    // The visible main and hand ropes terminate in embedded bronze sockets.
    for (const y of [1.5, 5.7]) {
      box(
        0.3,
        0.36,
        0.2,
        m.metal,
        side * 2.55,
        bankY + y,
        z + sign * 0.87,
        bridge.detail,
      );
      const eye = add(
        new THREE.TorusGeometry(0.12, 0.035, 6, 16),
        m.metal,
        side * 2.55,
        bankY + y,
        z + sign * 1.01,
        bridge.detail,
      );
      eye.rotation.y = Math.PI / 2;
    }
    // A supported cable drum, with separate rotating barrel and static cheeks.
    const drumZ = z + sign * 1.12;
    const rotor = new THREE.Group();
    rotor.position.set(x, bankY + 4.7, drumZ);
    rotor.userData.animated = true;
    bridge.detail.add(rotor);
    bridge.drums.push({ rotor, side, sign });
    for (const sx of [-0.39, 0.39]) {
      box(
        0.16,
        1.15,
        0.5,
        m.metal,
        x + sx,
        bankY + 4.64,
        drumZ - sign * 0.12,
        bridge.detail,
      );
      const cap = add(
        new THREE.CylinderGeometry(0.48, 0.48, 0.09, 24),
        m.metal,
        x + sx,
        bankY + 4.7,
        drumZ,
        bridge.detail,
      );
      cap.rotation.z = Math.PI / 2;
    }
    const barrel = add(
      new THREE.CylinderGeometry(0.31, 0.31, 0.65, 16),
      m.wood,
      0,
      0,
      0,
      rotor,
    );
    barrel.rotation.z = Math.PI / 2;
    const coil = Array.from({ length: 113 }, (_, i) => {
      const t = i / 112,
        a = t * Math.PI * 14;
      return [-0.31 + t * 0.62, Math.cos(a) * 0.34, Math.sin(a) * 0.34];
    });
    add(bridgeRope(coil, 0.038, 70, 5), m.rope, 0, 0, 0, rotor);
    const axle = add(
      new THREE.CylinderGeometry(0.09, 0.09, 1.12, 12),
      m.metal,
      0,
      0,
      0,
      rotor,
    );
    axle.rotation.z = Math.PI / 2;
    box(0.13, 0.57, 0.13, m.wood, side * 0.54, 0.19, 0, rotor);
    const handle = add(
      new THREE.CylinderGeometry(0.07, 0.07, 0.25, 8),
      m.wood,
      side * 0.66,
      0.45,
      0,
      rotor,
    );
    handle.rotation.z = Math.PI / 2;
    // The working line leaves the reel tangentially and enters the upper socket.
    add(
      bridgeRope(
        [
          [x, bankY + 4.72, drumZ + sign * 0.34],
          [x - side * 0.15, bankY + 5.25, drumZ + sign * 0.28],
          [side * 2.55, bankY + 5.7, z + sign * 1.01],
        ],
        0.042,
        16,
      ),
      m.rope,
      0,
      0,
      0,
      bridge.detail,
    );
    for (const dz of [-0.46, 0.46]) {
      const brace = box(
        0.22,
        1.7,
        0.25,
        m.wood,
        side * 2.43,
        bankY + 5.16,
        z + dz,
        bridge.root,
      );
      brace.rotation.z = -side * 0.66;
      game.cameraSurfaces?.capture(brace);
    }
  }
  for (const dz of [-0.49, 0.49])
    box(7.48, 0.42, 0.34, m.wood, 0, bankY + 5.89, z + dz, bridge.root, true);
  for (const x of [-3.05, 3.05])
    for (const dz of [-0.69, 0.69]) {
      box(0.36, 0.48, 0.045, m.metal, x, bankY + 5.88, z + dz, bridge.detail);
      for (const y of [5.75, 6.01]) {
        const bolt = add(
          new THREE.CylinderGeometry(0.055, 0.055, 0.06, 6),
          m.metal,
          x,
          bankY + y,
          z + dz * 1.04,
          bridge.detail,
        );
        bolt.rotation.x = Math.PI / 2;
      }
    }
}

export function prepareBridgeGeometry(geometry, material, materials) {
  if (material === materials.wood && !geometry.attributes.bridgeWoodCoord)
    bridgeWoodSurface(geometry);
  if (material === materials.stone && !geometry.attributes.color)
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3).fill(1),
        3,
      ),
    );
  if (material === materials.metal) windSurface(geometry);
  return geometry;
}
