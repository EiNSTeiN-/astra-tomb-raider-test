import * as THREE from "three";
import { desertForecourtPlan } from "./desert-forecourt-layout.js";
import { stoneBlockGeometry } from "./temple-architecture.js";
import {
  solarPanelGeometry,
  weatherDesertStone,
} from "./desert-architecture.js";
import { footprintMinimum } from "./masonry-foundations.js";
import { stationMeshSolid } from "./field-station-solids.js";
import { yardRouteClear, yardTraversalClear } from "./station-yard-plan.js";
import { natureRockAllowed } from "./nature-rocks.js";
import { discoveryFoliageClear } from "./discovery-setting-plan.js";
import { inSolarCourt } from "./solar-rules.js";
import { pbrMaterial, mergeArchitecture } from "./visuals.js";

export function desertForecourtAllowed(game, x, z, w, d) {
  const box = { x, z, w, d },
    radius = Math.hypot(w, d) / 2;
  if (
    !yardRouteClear(game.map, box, 1.8) ||
    !yardTraversalClear(game.traversalCourses || [], box) ||
    !natureRockAllowed(game, x, z, radius) ||
    !discoveryFoliageClear(game, x, z, radius)
  )
    return false;
  for (const dx of [-w / 2, 0, w / 2])
    for (const dz of [-d / 2, 0, d / 2])
      if (inSolarCourt(game.map, x + dx, z + dz)) return false;
  for (const gate of game.fieldGates || [])
    if (
      Math.abs(x - gate.root.position.x) < 12 + w / 2 &&
      Math.abs(z - gate.root.position.z) < 12 + d / 2
    )
      return false;
  for (const palm of game.palmLayout || [])
    if (
      Math.abs(x - palm.x) < w / 2 + 1.6 * palm.scale &&
      Math.abs(z - palm.z) < d / 2 + 1.6 * palm.scale
    )
      return false;
  return true;
}

// UVs use metres on every face, including narrow coping and long gallery beams.
function dressedBox(w, h, d, seed) {
  const g = stoneBlockGeometry(w, h, d, seed, 0.014),
    p = g.attributes.position;
  // Horizontal caps remain complete standing surfaces above their lower bevel.
  for (let i = 0; i < p.count; i++) {
    p.setX(i, Math.max(-w / 2, Math.min(w / 2, p.getX(i))));
    p.setZ(i, Math.max(-d / 2, Math.min(d / 2, p.getZ(i))));
    if (p.getY(i) > h / 2 - 0.028) p.setY(i, h / 2);
  }
  g.computeVertexNormals();
  return g;
}

export function buildDesertForecourts(game) {
  game.desertForecourts = [];
  if (game.level.biome !== "desert") return;
  const stone = pbrMaterial("sandstone", 0xe4c89b),
    pale = pbrMaterial("sandstone", 0xf1ddb5),
    backing = pbrMaterial("sandstone", 0xb8a181),
    bronze = new THREE.MeshStandardMaterial({
      color: 0x7d8d77,
      metalness: 0.7,
      roughness: 0.6,
    });
  stone.name = "Forecourt dressed sandstone";
  pale.name = "Forecourt pale limestone";
  backing.name = "Forecourt recessed masonry";
  bronze.name = "Forecourt weathered bronze";
  const relief = pale.clone();
  relief.name = "Forecourt relief faces";
  weatherDesertStone(relief);
  relief.normalScale.set(0.18, 0.18);
  for (const m of [stone, pale, backing, bronze, relief]) m.vertexColors = true;
  for (const m of [stone, pale, backing]) {
    m.normalScale.set(0.35, 0.35);
    weatherDesertStone(m);
  }
  let seed = game.level.seed + 91237;
  for (const room of game.map.rooms) {
    const root = new THREE.Group(),
      feature = { id: `desert-forecourt-${room.index}` },
      record = {
        root,
        feature,
        room: room.index,
        plans: desertForecourtPlan(room),
        walls: [],
        galleries: [],
        cisterns: [],
        parts: 0,
        triangles: 0,
      };
    root.name = `Desert foreground court ${room.index}`;
    root.position.set(room.x * 7, 0, room.z * 7);
    game.world.add(root);
    const floor = (x, z) =>
        game.groundHeight(root.position.x + x, root.position.z + z),
      add = (geometry, material, x, y, z, physical = true, camera = true) => {
        const count = geometry.attributes.position.count,
          colors = new Float32Array(count * 3),
          shade = 0.89 + Math.sin(++seed * 13.17) * 0.065;
        for (let i = 0; i < count; i++)
          colors.set([shade, shade * 0.985, shade * 0.96], i * 3);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        record.parts++;
        record.triangles += (geometry.index?.count ?? count) / 3;
        if (camera)
          game.cameraSurfaces?.capture(mesh, { small: true, thin: true });
        if (physical) {
          const solid = stationMeshSolid(game, feature, mesh, {
            // The delivered crouching knee reaches beyond the generic capsule.
            bodyPadding: 0.72,
            // Narrow walls and hollow rims require a real face under the root.
            supportRadius: 0,
          });
          solid.desertForecourt = room.index;
        }
        return mesh;
      },
      box = (w, h, d, material, x, y, z, physical = true) =>
        add(dressedBox(w, h, d, ++seed), material, x, y, z, physical),
      heights = (x, z, w, d) => {
        const wx = root.position.x + x,
          wz = root.position.z + z,
          step = game.terrainProfile.step;
        let high = -Infinity;
        for (
          let px = Math.floor((wx - w / 2) / step) * step;
          px <= Math.ceil((wx + w / 2) / step) * step + 0.001;
          px += step
        )
          for (
            let pz = Math.floor((wz - d / 2) / step) * step;
            pz <= Math.ceil((wz + d / 2) / step) * step + 0.001;
            pz += step
          )
            high = Math.max(high, game.groundHeight(px, pz));
        return {
          high,
          bottom:
            footprintMinimum(
              (x, z) => game.groundHeight(x, z),
              wx,
              wz,
              w,
              d,
              step,
            ) - 0.23,
        };
      },
      wall = (reservations, p) => {
        const wx = root.position.x + p.x,
          wz = root.position.z + p.z;
        if (!desertForecourtAllowed(reservations, wx, wz, p.w, p.d))
          return null;
        const { high, bottom } = heights(p.x, p.z, p.w, p.d),
          top = high + p.height,
          rows = Math.ceil((top - 0.2 - bottom) / 0.38),
          rise = (top - 0.2 - bottom) / rows;
        add(
          new THREE.BoxGeometry(p.w - 0.05, top - 0.18 - bottom, p.d - 0.05),
          backing,
          p.x,
          (bottom + top - 0.18) / 2,
          p.z,
        );
        const longX = p.w > p.d,
          length = longX ? p.w : p.d,
          pieces = Math.ceil(length / 1.2);
        for (let row = 0; row < rows; row++)
          for (let i = 0; i < pieces; i++) {
            const along = -length / 2 + ((i + 0.5) * length) / pieces;
            box(
              longX ? length / pieces - 0.012 : p.w,
              rise - 0.012,
              longX ? p.d : length / pieces - 0.012,
              stone,
              p.x + (longX ? along : 0),
              bottom + (row + 0.5) * rise,
              p.z + (longX ? 0 : along),
              false,
            );
          }
        box(p.w + 0.07, 0.2, p.d + 0.07, pale, p.x, top - 0.1, p.z);
        const r = { ...p, worldX: wx, worldZ: wz, bottom, top };
        record.walls.push(r);
        return r;
      };
    for (const plan of record.plans) {
      const reservations = Object.create(game);
      reservations.obstacles = game.obstacles.slice();
      const { x, z, width: w, depth: d, height } = plan;
      // Paired side pieces retain a broad entrance and a separate side opening.
      const segments = [
        { x, z: z + d / 2, w, d: 0.72, height },
        {
          x: x - w / 2,
          z: z + d / 4,
          w: 0.72,
          d: d / 2,
          height: height * 0.75,
        },
        {
          x: x + w / 2,
          z: z + d / 4,
          w: 0.72,
          d: d / 2,
          height: height * 0.75,
        },
        { x: x - w / 2, z: z - d / 3, w: 0.72, d: 1.65, height: 0.7 },
        { x: x + w / 2, z: z - d / 3, w: 0.72, d: 1.65, height: 0.7 },
      ];
      if (plan.kind === "broken") segments.splice(plan.side < 0 ? 1 : 2, 1);
      const walls = segments.map((s) => wall(reservations, s)).filter(Boolean);
      const back = walls.find((p) => p.w > 2);
      if (back && plan.kind === "relief") {
        const plaque = add(
          solarPanelGeometry(w * 0.7, 1.65, room.index + plan.side),
          relief,
          x,
          back.top - 2.2,
          back.z - 0.39,
          false,
        );
        plaque.rotation.y = Math.PI;
        box(w * 0.78, 0.2, 0.85, pale, x, back.top + 0.02, back.z);
        back.crown = { width: w * 0.78, top: back.top + 0.12 };
      }
      if (
        plan.kind === "gallery" &&
        desertForecourtAllowed(
          reservations,
          root.position.x + x,
          root.position.z + z + 0.65,
          w,
          4.7,
        )
      ) {
        const { high } = heights(x, z + 0.65, w, 4.7),
          underside = high + 3.55,
          top = underside + 0.28,
          posts = [];
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            const px = x + sx * (w / 2 - 0.6),
              pz = z + 0.65 + sz * 1.85,
              { bottom } = heights(px, pz, 1.08, 1.08),
              height = underside - bottom;
            box(1.04, 0.24, 1.04, pale, px, bottom + 0.12, pz);
            box(
              0.78,
              height - 0.18,
              0.78,
              stone,
              px,
              bottom + 0.18 + (height - 0.18) / 2,
              pz,
            );
            box(1.08, 0.22, 1.08, pale, px, underside - 0.11, pz);
            posts.push({
              x: px,
              z: pz,
              worldX: root.position.x + px,
              worldZ: root.position.z + pz,
              bottom,
              top: underside,
            });
          }
        for (const sz of [-1, 1])
          box(
            w + 0.1,
            0.28,
            0.65,
            pale,
            x,
            underside + 0.14,
            z + 0.65 + sz * 1.85,
          );
        // The complete roof supplies a continuous cap; embedded ribs shape its
        // underside without coplanar overlapping top faces or standing gaps.
        box(w + 0.1, 0.18, 4.45, stone, x, top + 0.08, z + 0.65);
        for (let i = 0; i < 12; i++)
          box(
            0.16,
            0.08,
            4.45,
            stone,
            x - w / 2 + ((i + 0.5) * w) / 12,
            top - 0.035,
            z + 0.65,
          );
        record.galleries.push({
          x,
          z: z + 0.65,
          width: w,
          depth: 4.7,
          underside,
          top: top + 0.17,
          posts,
        });
      }
      if (
        plan.kind === "cistern" &&
        desertForecourtAllowed(
          reservations,
          root.position.x + x,
          root.position.z + z + 0.6,
          4.5,
          4.5,
        )
      ) {
        const { high, bottom } = heights(x, z + 0.6, 4.5, 4.5),
          top = high + 0.72,
          outer = 2.15,
          inner = 1.65,
          shape = new THREE.Shape(),
          hole = new THREE.Path();
        for (let i = 0; i <= 8; i++) {
          const a = (i * Math.PI) / 4;
          const p = [Math.cos(a) * outer, Math.sin(a) * outer];
          if (i === 0) shape.moveTo(...p);
          else shape.lineTo(...p);
        }
        for (let i = 0; i <= 8; i++) {
          const a = (-i * Math.PI) / 4;
          const p = [Math.cos(a) * inner, Math.sin(a) * inner];
          if (i === 0) hole.moveTo(...p);
          else hole.lineTo(...p);
        }
        shape.holes.push(hole);
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: top - bottom,
          steps: 1,
          bevelEnabled: false,
        });
        geometry.rotateX(-Math.PI / 2);
        add(geometry, stone, x, bottom, z + 0.6, true, false);
        const rim = new THREE.ExtrudeGeometry(shape, {
          depth: 0.14,
          steps: 1,
          bevelEnabled: false,
        });
        rim.rotateX(-Math.PI / 2);
        add(rim, pale, x, top - 0.06, z + 0.6, true, false);
        // One bound around a hollow ring puts the camera target inside a solid
        // box, so the camera incorrectly ignores the intervening rim. Capture
        // the eight actual wall faces separately, retaining the empty interior.
        if (game.cameraSurfaces) {
          const cos = Math.cos(Math.PI / 8),
            radial = ((outer + inner) / 2) * cos,
            height = top + 0.08 - bottom;
          for (let face = 0; face < 8; face++) {
            const angle = ((face + 0.5) * Math.PI) / 4,
              geometry = new THREE.BoxGeometry(
                2 * outer * Math.sin(Math.PI / 8),
                height,
                (outer - inner) * cos,
              ),
              proxy = new THREE.Mesh(geometry, stone);
            proxy.position.set(
              x + Math.cos(angle) * radial,
              bottom + height / 2,
              z + 0.6 + Math.sin(angle) * radial,
            );
            proxy.rotation.y = Math.PI / 2 - angle;
            root.add(proxy);
            try {
              game.cameraSurfaces.capture(proxy, { small: true, thin: true });
            } finally {
              root.remove(proxy);
              geometry.dispose();
            }
          }
        }
        record.cisterns.push({
          x,
          z: z + 0.6,
          outer,
          inner,
          bottom,
          top: top + 0.08,
        });
        const bowl = new THREE.LatheGeometry(
          [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.32, 0),
            new THREE.Vector2(0.47, 0.12),
            new THREE.Vector2(0.42, 0.39),
            new THREE.Vector2(0.37, 0.44),
            new THREE.Vector2(0.28, 0.43),
            new THREE.Vector2(0.3, 0.14),
            new THREE.Vector2(0, 0.09),
          ],
          20,
        );
        add(
          bowl,
          bronze,
          x + plan.side * 3.1,
          heights(x + plan.side * 3.1, z - 1, 0.96, 0.96).bottom,
          z - 1,
        );
      }
    }
    mergeArchitecture(root);
    game.desertForecourts.push(record);
  }
}
