import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { solarReflectorPlan } from "../src/solar-reflectors.js";
import { CameraSurfaces } from "../src/camera-collision.js";
import {
  solarCastingGeometry,
  solarPlateGeometry,
  addSolarPedestal,
  addSolarReflectorFrame,
} from "../src/solar-instrument-art.js";

function closedSolid(geometry) {
  const p = geometry.attributes.position,
    ids = geometry.index?.array || Array.from({ length: p.count }, (_, i) => i),
    edges = new Map();
  let volume = 0,
    triangles = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const vertices = [...ids.slice(i, i + 3)].map((id) =>
        new THREE.Vector3().fromBufferAttribute(p, id),
      ),
      [a, b, c] = vertices,
      area = b.clone().sub(a).cross(c.clone().sub(a));
    if (area.lengthSq() < 1e-18) continue;
    triangles++;
    volume += a.dot(b.clone().cross(c)) / 6;
    const keys = vertices.map((v) =>
      v
        .toArray()
        .map((x) => Math.round(x * 1e6))
        .join(","),
    );
    for (let j = 0; j < 3; j++) {
      const key = [keys[j], keys[(j + 1) % 3]].sort().join("/");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert(triangles > 40);
  assert(volume > 0);
  assert(
    [...edges.values()].every((count) => count === 2),
    "delivered surfaces close at material seams",
  );
}

test("solar turned bases and chamfered frame shells are closed outward solids with real openings", () => {
  const casting = solarCastingGeometry([
      [0, -1.2],
      [0.83, -1.2],
      [0.83, 0.045],
      [0.68, 0.45],
      [0, 0.45],
    ]),
    frame = solarPlateGeometry(2.03, 1.864, 0.144, [1.75, 1.49]),
    plate = solarPlateGeometry(1.95, 1.76, 0.064),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(frame, material),
    ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );
  for (const geometry of [casting, frame, plate]) closedSolid(geometry);
  assert.equal(
    ray.intersectObject(mesh).length,
    0,
    "frame aperture contains no hidden bronze face",
  );
  ray.ray.origin.x = 0.96;
  assert(ray.intersectObject(mesh).length > 0, "frame has solid side metal");
  const p = casting.attributes.position,
    uv = casting.attributes.uv;
  let caps = 0;
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(p, j),
      ),
      area = b.clone().sub(a).cross(c.clone().sub(a));
    if (
      area.lengthSq() < 1e-18 ||
      Math.hypot(area.x, area.z) > Math.abs(area.y) * 1e-6
    )
      continue;
    const [u, v, w] = [i, i + 1, i + 2].map((j) =>
      new THREE.Vector2().fromBufferAttribute(uv, j),
    );
    assert(
      Math.abs((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)) > 1e-10,
    );
    caps++;
  }
  assert(caps >= 64, "both flat ends have two-dimensional UV patches");
  for (const geometry of [casting, frame, plate]) geometry.dispose();
  material.dispose();
});

test("whole solar base footprints bury into diagonal terrain and castings bear the frames below the glass", () => {
  const materials = {
      stone: new THREE.MeshStandardMaterial(),
      bronze: new THREE.MeshStandardMaterial(),
    },
    game = {
      groundHeight: (x, z) => x * 0.62 - z * 0.18,
      terrainProfile: { step: 1.75 },
      cameraSurfaces: null,
    },
    ray = new THREE.Raycaster();
  for (const kind of ["mirror", "source", "receiver"]) {
    const group = new THREE.Group();
    group.position.set(2.1, game.groundHeight(2.1, 2.7), 2.7);
    const base = addSolarPedestal(game, group, 3.7, materials, kind);
    group.updateMatrixWorld(true);
    for (const radius of [
      0,
      base.radius * 0.33,
      base.radius * 0.66,
      base.radius * 0.97,
    ])
      for (let i = 0; i < (radius ? 32 : 1); i++) {
        const angle = (i * Math.PI) / 16,
          x = group.position.x + Math.cos(angle) * radius,
          z = group.position.z + Math.sin(angle) * radius;
        ray.set(
          new THREE.Vector3(x, base.bottom - 1, z),
          new THREE.Vector3(0, 1, 0),
        );
        const hit = ray.intersectObject(group, true)[0];
        assert(hit && hit.point.y - game.groundHeight(x, z) < -0.17);
      }
    if (kind === "mirror") {
      const pivot = new THREE.Group();
      pivot.position.y = 3.7;
      group.add(pivot);
      addSolarReflectorFrame(game, pivot, materials.bronze, 4);
      group.updateMatrixWorld(true);
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 1.3,
          group.position.z,
        ),
        new THREE.Vector3(0, 1, 0),
      );
      const frame = ray.intersectObject(pivot, true)[0];
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 0.7,
          group.position.z,
        ),
        new THREE.Vector3(0, -1, 0),
      );
      const bearing = ray.intersectObjects(
        group.children.filter((m) => m.isMesh),
        false,
      )[0];
      assert(
        bearing && frame && bearing.point.y >= frame.point.y - 1e-6,
        "bearing touches the underside rather than leaving an air gap",
      );
      ray.set(
        new THREE.Vector3(
          group.position.x,
          group.position.y + 3.7 - 0.35,
          group.position.z + 0.65,
        ),
        new THREE.Vector3(0, 0, -1),
      );
      const hits = ray.intersectObject(group, true);
      assert(
        hits.every((hit) => hit.distance > 0.65),
        "spindle never crosses the front glass plane",
      );
    }
    group.traverse((m) => m.geometry?.dispose());
  }
  materials.stone.dispose();
  materials.bronze.dispose();
});

test("short source pillars protect the follow sight line despite the default camera size threshold", () => {
  const world = new THREE.Group(),
    group = new THREE.Group(),
    materials = {
      stone: new THREE.MeshStandardMaterial(),
      bronze: new THREE.MeshStandardMaterial(),
    },
    game = {
      groundHeight: () => 0,
      terrainProfile: { step: 1.75 },
      cameraSurfaces: new CameraSurfaces(world),
    };
  world.add(group);
  addSolarPedestal(game, group, 2.7, materials, "source");
  game.cameraSurfaces.rebuild();
  const target = new THREE.Vector3(1.4, 1.3, 0),
    eye = new THREE.Vector3(-3.8, 2.45, 0),
    ray = new THREE.Raycaster(
      target,
      eye.clone().sub(target).normalize(),
      0,
      target.distanceTo(eye),
    ),
    hit = ray.intersectObject(world, true)[0],
    entry = game.cameraSurfaces.entry(target, eye);
  assert(hit, "actual short pillar intersects the body sight line");
  assert(
    entry < hit.distance / target.distanceTo(eye),
    "rounded camera clearance catches that actual obstruction before the lens passes through it",
  );
  world.traverse((m) => m.geometry?.dispose());
  materials.stone.dispose();
  materials.bronze.dispose();
});

test("nine reflector outlines triangulate without holes and their metal shells are closed", () => {
  const bronze = new THREE.MeshStandardMaterial(),
    glass = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide }),
    silhouettes = new Set();
  for (let stage = 0; stage < 9; stage++) {
    const pivot = new THREE.Group(),
      { face, back, meshes, plan } = addSolarReflectorFrame(
        {},
        pivot,
        bronze,
        stage,
        glass,
      ),
      polygonArea =
        Math.abs(
          plan.glass.reduce((area, a, i, points) => {
            const b = points[(i + 1) % points.length];
            return area + a[0] * b[1] - b[0] * a[1];
          }, 0),
        ) / 2,
      p = face.geometry.attributes.position,
      ids = face.geometry.index.array;
    let triangleArea = 0;
    for (let i = 0; i < ids.length; i += 3) {
      const [a, b, c] = [...ids.slice(i, i + 3)].map((id) =>
        new THREE.Vector3().fromBufferAttribute(p, id),
      );
      triangleArea += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    assert(Math.abs(triangleArea - polygonArea) < 1e-6, plan.name);
    assert(polygonArea > 2.4 && polygonArea < 3.4, plan.name);
    assert.equal(face.position.z, 0, "optical centre stays on the beam plane");
    closedSolid(back.geometry);
    closedSolid(
      meshes.find((mesh) => mesh.name.endsWith("closed bezel")).geometry,
    );
    silhouettes.add(JSON.stringify(plan.glass));
    pivot.traverse((mesh) => mesh.geometry?.dispose());
  }
  assert.equal(silhouettes.size, 9);
  bronze.dispose();
  glass.dispose();
});

test("every shaped aperture stays clear through turns and joins its lower spindle", () => {
  const materials = {
      stone: new THREE.MeshStandardMaterial(),
      bronze: new THREE.MeshStandardMaterial(),
    },
    glass = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide }),
    ray = new THREE.Raycaster(),
    game = { groundHeight: () => 0, terrainProfile: { step: 1.75 } };
  for (let stage = 0; stage < 9; stage++) {
    const group = new THREE.Group(),
      pivot = new THREE.Group();
    addSolarPedestal(game, group, 2.7, materials, "mirror");
    group.add(pivot);
    pivot.position.y = 2.7;
    addSolarReflectorFrame(game, pivot, materials.bronze, stage, glass);
    const outline = solarReflectorPlan(stage).glass;
    for (const angle of [
      -Math.PI / 4,
      -Math.PI / 8,
      0,
      Math.PI / 8,
      Math.PI / 4,
    ]) {
      pivot.rotation.y = angle;
      group.updateMatrixWorld(true);
      // Near-edge and inner probes test the actual nonrectangular aperture.
      // The outer ring clears the bevel even at the narrow stepped crown.
      for (const [ex, ey] of outline)
        for (const radius of [0.3, 0.7, 0.94]) {
          const from = pivot.localToWorld(
              new THREE.Vector3(ex * radius, ey * radius, 0.65),
            ),
            direction = new THREE.Vector3(0, 0, -1).transformDirection(
              pivot.matrixWorld,
            );
          ray.set(from, direction);
          ray.far = 1.3;
          const hit = ray.intersectObject(group, true)[0];
          assert.equal(
            hit?.object.material,
            glass,
            `${stage}/${angle}/${ex}/${ey}/${radius}`,
          );
        }
      // The rear saddle bears on the fixed collar at every optical angle.
      const saddleBottom = pivot.localToWorld(
        new THREE.Vector3(0, -1.26, -0.1),
      );
      ray.set(
        saddleBottom.clone().add(new THREE.Vector3(0, 1, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      ray.far = 2;
      const bearing = ray.intersectObjects(
        group.children.filter((mesh) => mesh.isMesh),
        false,
      )[0];
      assert(
        bearing && bearing.point.y >= saddleBottom.y,
        `unsupported saddle ${stage}/${angle}`,
      );
    }
    group.traverse((mesh) => mesh.geometry?.dispose());
  }
  glass.dispose();
  materials.stone.dispose();
  materials.bronze.dispose();
});

test("turning reflector camera envelopes follow their cases and leave round corners clear", () => {
  const bronze = new THREE.MeshStandardMaterial(),
    glass = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
  for (let stage = 0; stage < 9; stage++) {
    const world = new THREE.Group(),
      pivot = new THREE.Group();
    pivot.userData.cameraDynamic = true;
    world.add(pivot);
    const surfaces = new CameraSurfaces(world),
      ray = new THREE.Raycaster();
    addSolarReflectorFrame(
      { cameraSurfaces: surfaces },
      pivot,
      bronze,
      stage,
      glass,
    );
    surfaces.rebuild();
    assert.equal(surfaces.dynamic.length, 2);
    const envelope = surfaces.dynamic.find((surface) => surface.planes);
    for (const mesh of pivot.children) {
      if (!mesh.isMesh || mesh.name.endsWith("spindle saddle")) continue;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3()
          .fromBufferAttribute(p, i)
          .add(mesh.position);
        assert(
          envelope.box.clone().expandByScalar(1e-6).containsPoint(v),
          `case bevel outside camera bounds ${stage}/${mesh.name}`,
        );
        assert(
          envelope.planes.every(
            ([x, y, z, d]) => x * v.x + y * v.y + z * v.z <= d + 1e-6,
          ),
          `case outside camera planes ${stage}/${mesh.name}`,
        );
      }
    }
    for (const angle of [-Math.PI / 4, 0, Math.PI / 4]) {
      pivot.rotation.y = angle;
      pivot.position.set(stage * 5, 3, 1);
      world.updateMatrixWorld(true);
      for (const [x, y] of solarReflectorPlan(stage).glass) {
        const a = pivot.localToWorld(new THREE.Vector3(x * 0.8, y * 0.8, 2)),
          b = pivot.localToWorld(new THREE.Vector3(x * 0.8, y * 0.8, -2));
        ray.set(a, b.clone().sub(a).normalize());
        ray.far = 4;
        const hit = ray.intersectObject(pivot, true)[0];
        assert(hit);
        assert(
          surfaces.entry(a, b, 0.01) < hit.distance / 4,
          `${stage}/${angle}`,
        );
      }
      if (stage === 1) {
        const a = pivot.localToWorld(new THREE.Vector3(1.02, 1.02, 2)),
          b = pivot.localToWorld(new THREE.Vector3(1.02, 1.02, -2));
        assert.equal(
          surfaces.entry(a, b, 0),
          1,
          "empty disc corners do not inherit a square obstruction",
        );
      }
    }
    world.traverse((mesh) => mesh.geometry?.dispose());
  }
  bronze.dispose();
  glass.dispose();
});
