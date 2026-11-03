import * as T from "three";
import { mergeArchitecture } from "./visuals.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import { RoofCamera } from "./roof-camera.js";
import { TriangleSolids } from "./triangle-solids.js";
import {
  roofFaceHeight,
  FacadeCamera,
  PavilionCamera,
  geometryFromFaces,
  opening,
  extrude,
  projectTimberUVs,
} from "./fitted-facades.js";
import {
  stationAssemblySolid,
  stationMeshSolid,
} from "./field-station-solids.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { monasteryWingPlan } from "./monastery-wing-plan.js";

export function verandaDeckMaterial(wood) {
  const material = wood.clone();
  material.name = "Veranda cross-laid timber decks";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vVerandaAlong,vVerandaUp;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvVerandaAlong=position.x;vVerandaUp=normal.y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vVerandaAlong,vVerandaUp;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      if(vVerandaUp>.65){
        float joint=1.-smoothstep(.002,.012,abs(fract(vVerandaAlong/.42+.5)-.5)*.42);
        diffuseColor.rgb*=1.-joint*.28;
      }`,
      );
  };
  material.customProgramCacheKey = () => "vesper-veranda-boards-1";
  return material;
}

// A closed height-field slab, with real empty space beneath an incline. The
// same top faces render, support the boots and define the camera's clearance.
export function verandaRun(points, z0, z1, depth = 0.28) {
  const faces = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i],
      [x1, y1] = points[i + 1],
      top = [
        new T.Vector3(x0, y0, z0),
        new T.Vector3(x0, y0, z1),
        new T.Vector3(x1, y1, z1),
        new T.Vector3(x1, y1, z0),
      ],
      bottom = top.map((v) => v.clone().add(new T.Vector3(0, -depth, 0)));
    faces.push(top, [...bottom].reverse());
    for (const j of [1, 3])
      faces.push([top[j], bottom[j], bottom[(j + 1) % 4], top[(j + 1) % 4]]);
    if (i === 0) faces.push([top[0], bottom[0], bottom[1], top[1]]);
    if (i === points.length - 2)
      faces.push([top[2], bottom[2], bottom[3], top[3]]);
  }
  const g = geometryFromFaces(faces),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++)
    if (Math.abs(g.attributes.normal.getY(i)) > 0.65)
      uv.setXY(i, p.getZ(i) / 2, p.getX(i) / 2);
  return g;
}
export function verandaSlab(x0, x1, z0, z1, y0, y1, depth = 0.28) {
  return verandaRun(
    [
      [x0, y0],
      [x1, y1],
    ],
    z0,
    z1,
    depth,
  );
}

export function buildMonasteryWing(
  game,
  parent,
  index,
  side,
  roof,
  materials,
  deckMaterial,
) {
  const plan = monasteryWingPlan(index, side),
    root = new T.Group(),
    record = {
      id: `monastery-wing-${index}-${side}`,
      root,
      plan,
      windows: [],
      bearings: [],
      parts: 0,
      triangles: 0,
    },
    worldBase = parent.position,
    px = side * 13.35,
    pz = -19.5,
    ceilingPatch = roofFaceHeight(roof, false, { allowMissing: true }),
    ceiling = (x, z) => ceilingPatch(x + px, z + pz),
    ground = (x, z) =>
      game.groundHeight(worldBase.x + px + x, worldBase.z + pz + z) -
      worldBase.y,
    structure = [],
    underDeck = [],
    walkMeshes = [],
    walkSolids = [],
    cameraParts = [],
    cameraBounds = new T.Box3();
  root.name = `${plan.name} — court ${index}`;
  root.position.set(px, 0, pz);
  parent.add(root);
  let seed = game.level.seed + index * 1181 + (side + 2) * 307;
  const capture = (g, frame, kernel) => {
    g.computeBoundingBox();
    const box = g.boundingBox.clone();
    cameraParts.push({ box, inverse: frame.clone().invert(), kernel });
    cameraBounds.union(box.clone().applyMatrix4(frame));
  };
  const emit = (
    g,
    mat,
    tag,
    frame = new T.Matrix4(),
    kernel = null,
    deck = false,
    collection = structure,
  ) => {
    capture(g, frame, kernel);
    g.applyMatrix4(frame);
    const p = g.attributes.position,
      colors = [];
    for (let i = 0; i < p.count; i++) {
      const shade =
        0.94 +
        0.055 *
          Math.sin(
            p.getX(i) * 0.8 + p.getY(i) * 0.31 + p.getZ(i) * 0.7 + index,
          );
      colors.push(shade, shade, shade);
    }
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    const mesh = new T.Mesh(g, mat);
    mesh.name = tag;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    record.parts++;
    record.triangles += (g.index?.count ?? p.count) / 3;
    if (deck) {
      const solid = stationMeshSolid(game, record, mesh, {
        bodyPadding: 0.55,
        supportRadius: 0,
        groundingSlope: true,
        support: deck !== "footing",
      });
      solid.ceiling = deck !== "footing";
      solid.woodenDeck = deck !== "footing";
      if (deck !== "footing") {
        walkMeshes.push(mesh);
        if (deck !== "ramp") walkSolids.push(solid);
      }
    } else collection.push(mesh);
    return mesh;
  };
  const beam = (
    a,
    b,
    w,
    d,
    mat = materials.wood,
    tag = "Veranda joinery",
    collection = structure,
  ) => {
    a = new T.Vector3(...a);
    b = new T.Vector3(...b);
    const length = a.distanceTo(b),
      g = stoneBlockGeometry(w, length, d, ++seed, 0.018);
    projectTimberUVs(g);
    const frame = new T.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      ),
      new T.Vector3(1, 1, 1),
    );
    return emit(g, mat, tag, frame, null, false, collection);
  };
  const box = (w, h, d, x, y, z, mat, tag, collection = structure) =>
    emit(
      new T.BoxGeometry(w, h, d),
      mat,
      tag,
      new T.Matrix4().makeTranslation(x, y, z),
      null,
      false,
      collection,
    );
  const floor = (
    x0,
    x1,
    z0,
    z1,
    y0 = plan.floor,
    y1 = y0,
    depth = 0.28,
    tag = "Open veranda deck",
  ) => {
    const g = verandaSlab(x0, x1, z0, z1, y0, y1, depth);
    return emit(g, deckMaterial, tag, new T.Matrix4(), new RoofCamera(g), true);
  };
  const rail = (a, b, height = 0.95) => {
    const topA = [a[0], a[1] + height, a[2]],
      topB = [b[0], b[1] + height, b[2]];
    beam(topA, topB, 0.11, 0.12, materials.red, "Handrail");
    beam(
      [a[0], a[1] + height * 0.48, a[2]],
      [b[0], b[1] + height * 0.48, b[2]],
      0.075,
      0.08,
      materials.wood,
      "Lower rail",
    );
    const count = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.3),
    );
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t,
        z = a[2] + (b[2] - a[2]) * t;
      beam(
        [x, y - 0.04, z],
        [x, y + height + 0.04, z],
        0.105,
        0.12,
        materials.wood,
        "Rail stanchion",
      );
    }
  };
  const hw = plan.width / 2,
    hd = plan.depth / 2,
    [hx0, hx1] = plan.hole,
    hz = plan.opening / 2;
  floor(-hw, hw, -hd, -hz);
  floor(-hw, hw, hz, hd);
  floor(-hw, hx0, -hz, hz);
  floor(hx1, hw, -hz, hz);
  // Existing stilt capitals carry long joists; headers carry the ends of the
  // ramp and the two cross passages around its actual floor opening.
  for (const z of [-2.1, 2.1])
    beam(
      [-hw, 6.31, z],
      [hw, 6.31, z],
      0.32,
      0.4,
      materials.wood,
      "Bearing floor joist",
      underDeck,
    );
  for (const x of [hx0, hx1])
    beam(
      [x, 6.28, -2.9],
      [x, 6.28, 2.9],
      0.32,
      0.38,
      materials.red,
      "Opening header",
      underDeck,
    );
  const footWorldZ = worldBase.z + pz,
    footGround = [];
  for (const dx of [-0.4, 0, 0.4])
    for (const dz of [-1, 0, 1]) footGround.push(ground(plan.foot + dx, dz));
  const entry = Math.max(...footGround) + 0.035,
    toeSeat = () =>
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        worldBase.x + px + lead,
        footWorldZ,
        0.1,
        1.9,
        game.terrainProfile?.step,
      ) -
      worldBase.y -
      0.025;
  let toeLength = 1,
    lead = plan.foot - side * toeLength,
    leadY = toeSeat();
  while ((entry - leadY) / toeLength > 0.85 && toeLength < 3) {
    toeLength += 0.25;
    lead = plan.foot - side * toeLength;
    leadY = toeSeat();
  }
  const entryMin = Math.min(lead, plan.foot),
    entryMax = Math.max(lead, plan.foot),
    toeY = (x) => leadY + ((entry - leadY) * (x - lead)) / (plan.foot - lead),
    rampY = (x) =>
      entry + ((plan.floor - entry) * (x - plan.foot)) / (plan.lip - plan.foot),
    rampMin = Math.min(plan.foot, plan.lip),
    rampMax = Math.max(plan.foot, plan.lip);
  // The high edge of an entry can span a steep bank. Carry the entire
  // underside into the lowest delivered terrain cell beneath the wedge;
  // keeping a fixed slab depth left an exposed corner on the western ascent.
  const stoneBottom =
      footprintMinimum(
        (x, z) => game.groundHeight(x, z),
        worldBase.x + px + (entryMin + entryMax) / 2,
        footWorldZ,
        entryMax - entryMin,
        1.9,
        game.terrainProfile?.step,
      ) -
      worldBase.y -
      0.12,
    stoneDepth = Math.max(
      0.65,
      Math.max(toeY(entryMin), toeY(entryMax)) - 0.18 - stoneBottom,
    ),
    toeStone = verandaSlab(
      entryMin,
      entryMax,
      -0.95,
      0.95,
      toeY(entryMin) - 0.18,
      toeY(entryMax) - 0.18,
      stoneDepth,
    );
  emit(
    toeStone,
    materials.stone,
    "Ground-seated inclined ramp foot",
    new T.Matrix4(),
    new RoofCamera(toeStone),
    "footing",
  );
  const rampGeometry = verandaRun(
    [
      [lead, leadY],
      [plan.foot, entry],
      [plan.lip, plan.floor],
    ].sort((a, b) => a[0] - b[0]),
    -0.85,
    0.85,
    0.2,
  );
  emit(
    rampGeometry,
    deckMaterial,
    "Continuous ramp and buried toe",
    new T.Matrix4(),
    new RoofCamera(rampGeometry),
    "ramp",
  );
  record.ramp = {
    foot: [plan.foot, entry, 0],
    lip: [plan.lip, plan.floor, 0],
    entry: [entryMin, entryMax],
    lead: [lead, leadY, 0],
    toeSlope: (entry - leadY) / toeLength,
    slope: Math.abs((plan.floor - entry) / (plan.lip - plan.foot)),
  };
  for (const z of [-1, 1]) {
    rail([plan.foot, entry, z], [plan.lip, plan.floor, z], 1.05);
    beam(
      [plan.foot, entry - 0.22, z * 0.72],
      [plan.lip, plan.floor - 0.22, z * 0.72],
      0.22,
      0.2,
      materials.wood,
      "Ramp stringer",
      underDeck,
    );
  }
  for (const t of [0.35, 0.7]) {
    const x = plan.foot + (plan.lip - plan.foot) * t,
      y = rampY(x) - 0.22;
    for (const z of [-0.72, 0.72]) {
      const gy = ground(x, z),
        bottom =
          footprintMinimum(
            (wx, wz) => game.groundHeight(wx, wz),
            worldBase.x + px + x,
            worldBase.z + pz + z,
            0.48,
            0.48,
            game.terrainProfile?.step,
          ) -
          worldBase.y -
          0.12;
      box(
        0.48,
        gy + 0.2 - bottom,
        0.48,
        x,
        (bottom + gy + 0.2) / 2,
        z,
        materials.stone,
        "Trestle footing",
        underDeck,
      );
      beam(
        [x, gy + 0.16, z],
        [x, y, z],
        0.22,
        0.22,
        materials.wood,
        "Ramp trestle",
        underDeck,
      );
    }
    beam(
      [x, y, -0.91],
      [x, y, 0.91],
      0.19,
      0.22,
      materials.red,
      "Trestle crossbeam",
      underDeck,
    );
    beam(
      [x, ground(x, -0.72) + 0.25, -0.72],
      [x, y - 0.15, 0.72],
      0.11,
      0.12,
      materials.wood,
      "Trestle diagonal",
      underDeck,
    );
  }
  // Rail the opening's upper edges. The ascending handrails already protect
  // the opening along the flight and remain below the loft circulation line.
  for (const z of [-hz, hz]) {
    const innerX = side < 0 ? hx1 : hx0;
    rail([innerX, plan.floor, z], [plan.lip, plan.floor, z], 0.92);
  }
  for (const x of [-hw + 0.015, hw - 0.015])
    rail([x, plan.floor, -hd + 0.08], [x, plan.floor, hd - 0.08]);
  const bearer = (z, kind) => {
    const samples = Array.from({ length: 65 }, (_, i) => {
      const x = -6.1 + (i * 12.2) / 64;
      return { x, y: ceiling(x, z) };
    });
    let run = [];
    const finish = () => {
      if (run.length > 1) {
        const outline = [
            ...run.map((p) => [p.x, p.y - 0.33]),
            ...[...run].reverse().map((p) => [p.x, p.y - 0.08]),
          ],
          g = extrude(outline, [], 0.36),
          frame = new T.Matrix4().makeTranslation(0, 0, z + 0.18);
        emit(g, materials.wood, kind, frame, new FacadeCamera(g));
      }
      run = [];
    };
    for (const sample of samples) {
      if (sample.y === null) finish();
      else run.push(sample);
    }
    finish();
  };
  const xs = [-5.5, -1.84, 1.84, 5.5];
  for (const z of [-2.8, 2.8]) {
    for (const x of xs) {
      const top = ceiling(x, z),
        end = top === null ? plan.floor + 0.8 : top - 0.1;
      beam(
        [x, plan.floor - 0.04, z],
        [x, end, z],
        0.26,
        0.28,
        materials.red,
        top === null ? "Broken column stub" : "Roof-bearing veranda column",
      );
      if (top !== null) {
        beam(
          [x - 0.4, end - 0.18, z],
          [x + 0.4, end - 0.18, z],
          0.18,
          0.42,
          materials.wood,
          "Bracket head",
        );
        record.bearings.push([x, top, z]);
      }
    }
    bearer(z, "Continuous fitted eave bearer");
  }
  bearer(0, "Roof ridge purlin");
  for (const x of [-5.5, -1.84, 1.84, 5.5]) {
    const front = ceiling(x, 2.8),
      back = ceiling(x, -2.8),
      middle = ceiling(x, 0);
    if (front !== null && back !== null && middle !== null) {
      const y = Math.min(front, back) - 0.21;
      beam(
        [x, y, -2.8],
        [x, y, 2.8],
        0.2,
        0.24,
        materials.wood,
        "Truss tie beam",
      );
      if (middle - 0.21 - y > 0.05)
        beam(
          [x, y - 0.04, 0],
          [x, middle - 0.18, 0],
          0.18,
          0.2,
          materials.red,
          "Truss centre post",
        );
    }
    for (const z0 of [-2.8, 0]) {
      const z1 = z0 + 2.8,
        a = ceiling(x, z0),
        b = ceiling(x, z1);
      if (a === null || b === null) continue;
      beam(
        [x, a - 0.21, z0],
        [x, b - 0.21, z1],
        0.22,
        0.26,
        materials.wood,
        "Roof truss chord",
      );
    }
  }
  // Front and back elevations alternate enclosed window bays with open rails.
  for (const face of [-1, 1]) {
    const z = face * 2.8,
      closed = face > 0 ? plan.front : plan.back,
      angle = face > 0 ? 0 : Math.PI;
    for (let bay = 0; bay < 3; bay++) {
      const left = xs[bay] + 0.12,
        right = xs[bay + 1] - 0.12,
        center = (left + right) / 2,
        width = right - left,
        damaged = Array.from({ length: 13 }, (_, i) =>
          ceiling(left + ((right - left) * i) / 12, z),
        ).some((y) => y === null);
      if (!closed.includes(bay) || damaged) {
        const connection =
          face > 0 && plan.gallery && bay === (side < 0 ? 0 : 2);
        if (connection) {
          for (const [a, b] of [
            [left, plan.gallery.x - plan.gallery.width / 2],
            [plan.gallery.x + plan.gallery.width / 2, right],
          ])
            if (b - a > 0.12) rail([a, plan.floor, z], [b, plan.floor, z]);
        } else rail([left, plan.floor, z], [right, plan.floor, z]);
        if (damaged && !connection)
          box(
            width * 0.55,
            0.5,
            0.2,
            center - width * 0.15,
            plan.floor + 0.25,
            z,
            materials.plaster,
            "Surviving low plaster fragment",
          );
        continue;
      }
      const outline = [],
        steps = 24;
      outline.push(
        [-width / 2, plan.floor - 0.02],
        [width / 2, plan.floor - 0.02],
      );
      for (let j = steps; j >= 0; j--) {
        const s = -width / 2 + (j * width) / steps,
          x = center + s * (face > 0 ? 1 : -1);
        outline.push([s, ceiling(x, z) + 0.035]);
      }
      let holes = [],
        joinery = [];
      if (plan.style === "slits")
        joinery = [-0.65, 0.65].map((x) => ({
          x,
          y: 8.6,
          w: 0.44,
          h: 1.6,
          kind: "rectangle",
        }));
      else if (plan.style === "stacked")
        joinery = [
          { x: 0, y: 7.75, w: 1.8, h: 0.62, kind: "rectangle" },
          { x: 0, y: 9, w: 1.8, h: 1.05, kind: "arch" },
        ];
      else if (plan.style === "sunwheel")
        joinery = [{ x: 0, y: 8.55, w: 1.42, h: 1.42, kind: "circle" }];
      else if (plan.style === "transoms")
        joinery = [{ x: 0, y: 8.75, w: 2.25, h: 1.15, kind: "rectangle" }];
      else if (plan.style === "paired")
        joinery = [-0.65, 0.65].map((x) => ({
          x,
          y: 8.5,
          w: 0.78,
          h: 1.7,
          kind: "arch",
        }));
      else
        joinery = [
          {
            x: 0,
            y: 8.5,
            w: 1.65,
            h: 1.85,
            kind: plan.style === "arches" ? "arch" : "rectangle",
          },
        ];
      holes = joinery.map((r) => opening(r.x, r.y, r.w, r.h, r.kind));
      const matrix = new T.Matrix4()
          .makeRotationY(angle)
          .setPosition(center, 0, z),
        g = extrude(outline, holes, 0.23);
      emit(
        g,
        materials.plaster,
        "Fitted window bay",
        matrix,
        new FacadeCamera(g),
      );
      for (const r of joinery) {
        const hole = opening(r.x, r.y, r.w, r.h, r.kind),
          rim = extrude(
            opening(r.x, r.y, r.w + 0.18, r.h + 0.18, r.kind),
            [hole],
            0.105,
          ).translate(0, 0, 0.035);
        emit(
          rim,
          materials.red,
          "Recessed window surround",
          matrix,
          new FacadeCamera(rim),
        );
        const at = (s, y) => [
          center + s * (face > 0 ? 1 : -1),
          y,
          z - face * 0.1,
        ];
        if (r.kind === "circle") {
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4;
            beam(
              at(r.x, r.y),
              at(
                r.x + Math.cos(a) * r.w * 0.52,
                r.y + Math.sin(a) * r.h * 0.52,
              ),
              0.055,
              0.06,
              materials.wood,
              "Sunwheel grille",
            );
          }
        } else {
          for (let k = 1; k < 4; k++) {
            const s = r.x - r.w / 2 + (k * r.w) / 4,
              arch = r.kind === "arch" ? r.w / 2 : 0,
              top =
                r.y +
                r.h / 2 -
                arch +
                (arch
                  ? Math.sqrt(Math.max(0, arch * arch - (s - r.x) ** 2))
                  : 0);
            beam(
              at(s, r.y - r.h / 2 - 0.025),
              at(s, top + 0.025),
              0.055,
              0.065,
              materials.wood,
              "Window grille",
            );
          }
          beam(
            at(r.x - r.w / 2, r.y),
            at(r.x + r.w / 2, r.y),
            0.065,
            0.065,
            materials.wood,
            "Window crossbar",
          );
          if (plan.style === "lattice")
            for (const sign of [-1, 1])
              beam(
                at(r.x - r.w * 0.48, r.y - sign * r.h * 0.48),
                at(r.x + r.w * 0.48, r.y + sign * r.h * 0.48),
                0.06,
                0.065,
                materials.wood,
                "Crossed window lattice",
              );
        }
        record.windows.push({
          face,
          bay,
          ...r,
          center: [center + r.x * (face > 0 ? 1 : -1), r.y, z],
        });
      }
      beam(
        [left, plan.floor + 0.18, z + 0.02 * face],
        [right, plan.floor + 0.18, z + 0.02 * face],
        0.23,
        0.29,
        materials.wood,
        "Window-bay sill",
      );
    }
  }
  // End friezes stay above head height so both cross passages remain usable.
  for (const x of [-hw + 0.04, hw - 0.04]) {
    const top = ceiling(x, 0);
    if (top === null) continue;
    const frame = new T.Matrix4()
        .makeRotationY(x > 0 ? Math.PI / 2 : -Math.PI / 2)
        .setPosition(x, 0, 0),
      g = extrude(
        [
          [-2.55, 8.9],
          [2.55, 8.9],
          [2.55, 9.4],
          [-2.55, 9.4],
        ],
        [],
        0.18,
      );
    emit(g, materials.red, "High end frieze", frame, new FacadeCamera(g));
    for (const z of [-1.8, 0, 1.8]) {
      const y = ceiling(x, z);
      if (y !== null)
        beam(
          [x, 9.35, z],
          [x, y + 0.035, z],
          0.12,
          0.14,
          materials.wood,
          "Frieze roof hanger",
        );
    }
    for (let k = -4; k <= 4; k++)
      beam(
        [x, 8.9, k * 0.5],
        [x, 9.4, k * 0.5],
        0.06,
        0.12,
        materials.wood,
        "End-frieze rib",
      );
  }
  // At the toe and landing a cylinder can touch two connected deck pieces.
  // Share their real surfaces for grounding without filling the floor opening
  // or treating the loft above the low entry as the current floor.
  for (const mesh of walkMeshes) mesh.updateWorldMatrix(true, false);
  const groundingFace = {
    requireContact: true,
    triangles: new TriangleSolids(
      walkMeshes.map((mesh) => ({
        geometry: mesh.geometry,
        matrices: [mesh.matrixWorld],
      })),
      { layeredSupport: true },
    ),
  };
  record.groundingFace = groundingFace;
  for (const solid of walkSolids) solid.groundingFace = groundingFace;
  const bearingSolid = stationAssemblySolid(game, record, underDeck, {
    bodyPadding: 0.55,
    support: false,
  });
  bearingSolid.groundingSlope = true;
  bearingSolid.groundingFace = groundingFace;
  stationAssemblySolid(game, record, structure, {
    bodyPadding: 0.55,
    support: false,
  });
  if (game.cameraSurfaces) {
    const size = cameraBounds.getSize(new T.Vector3()),
      center = cameraBounds.getCenter(new T.Vector3()),
      proxy = new T.Mesh(
        new T.BoxGeometry(size.x, size.y, size.z).translate(
          center.x,
          center.y,
          center.z,
        ),
        materials.wood,
      );
    root.add(proxy);
    game.cameraSurfaces.capture(proxy, {
      kernel: new PavilionCamera(cameraParts),
      small: true,
      thin: true,
    });
    root.remove(proxy);
    proxy.geometry.dispose();
  }
  mergeArchitecture(root, 2);
  return record;
}

// The neighboring roof supplies real support through the veranda doorway.
// Sharing those delivered faces lets the body margin cross a small down-step.
export function connectMonasteryGallery(wing, meshes) {
  for (const mesh of meshes) mesh.updateWorldMatrix(true, false);
  const roof = new TriangleSolids(
      meshes.map((mesh) => ({
        geometry: mesh.geometry,
        matrices: [mesh.matrixWorld],
      })),
    ),
    previous = wing.groundingFace.triangles;
  wing.groundingFace.triangles = {
    support(...args) {
      const a = previous.support(...args),
        b = roof.support(...args);
      return a && b ? (a.height > b.height ? a : b) : a || b;
    },
  };
}
