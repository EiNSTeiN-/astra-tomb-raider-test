import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Vector3 } from "three";
import sharp from "sharp";
import { sprigPlanes, sprigCards } from "../scripts/fir-sprigs.mjs";

test("sprig bake planes enclose a rotated branch and card normals survive nonuniform mirrored transforms", () => {
  const rotation = new Matrix4().makeRotationAxis(
      new Vector3(1, 2, 3).normalize(),
      1.17,
    ),
    points = [];
  for (const x of [-0.4, 0.4])
    for (const y of [-1, 1])
      for (const z of [-0.15, 0.15])
        points.push(...new Vector3(x, y, z).applyMatrix4(rotation).toArray());
  const planes = sprigPlanes(points);
  for (const plane of planes) {
    assert(Math.abs(plane.u.dot(plane.v)) < 1e-9);
    assert(Math.abs(plane.w.length() - 1) < 1e-9);
    for (let i = 0; i < points.length; i += 3) {
      const p = new Vector3().fromArray(points, i).sub(plane.center);
      for (const [a, d] of [p.dot(plane.u), p.dot(plane.v)].entries())
        assert(d > plane.min[a] && d < plane.max[a]);
    }
  }
  const matrix = new Matrix4().makeScale(-2, 0.7, 1.3).premultiply(rotation),
    cards = sprigCards([{ template: { id: 0, planes }, matrix }]);
  for (let i = 0; i < cards.indices.length; i += 3) {
    const ids = Array.from(cards.indices.slice(i, i + 3)),
      [a, b, c] = ids.map((id) =>
        new Vector3().fromArray(cards.positions, id * 3),
      ),
      normal = new Vector3().fromArray(cards.normals, ids[0] * 3),
      u = b.sub(a),
      v = c.sub(a);
    assert(Math.abs(normal.dot(u)) < 1e-6);
    assert(Math.abs(normal.dot(v)) < 1e-6);
    assert(new Vector3().crossVectors(u, v).dot(normal) > 0);
  }
});

test("delivered fir cards retain atlas UVs, valid faces and identical normalization across distance tiers", async () => {
  const record = JSON.parse(
      await readFile("asset-sources/fir-sprigs/sources.json", "utf8"),
    ),
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const normalPoint = new Vector3(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (const output of record.outputs) {
    const bytes = await readFile(output.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      output.sha256,
    );
    if (!output.path.endsWith(".glb")) continue;
    const doc = await io.readBinary(new Uint8Array(bytes));
    for (const scene of doc.getRoot().listScenes())
      assert.deepEqual(
        scene.getExtras().vesperTreeBounds,
        record.referenceBounds,
      );
    let triangles = 0;
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) {
        triangles += p.getIndices().getCount() / 3;
        if (!/twig/.test(p.getMaterial().getName())) continue;
        const pos = p.getAttribute("POSITION"),
          norm = p.getAttribute("NORMAL"),
          uv = p.getAttribute("TEXCOORD_0"),
          indices = p.getIndices().getArray();
        assert(uv, "Shared runtime textures must not cause UVs to be pruned");
        assert.equal(uv.getCount(), pos.getCount());
        assert.equal(norm.getCount(), pos.getCount());
        assert.equal(pos.getCount() % 4, 0);
        const usedCells = new Set();
        for (let i = 0; i < pos.getCount(); i += 4) {
          const corners = Array.from({ length: 4 }, (_, j) =>
            uv.getElement(i + j, []),
          );
          const minU = Math.min(...corners.map((p) => p[0])),
            maxU = Math.max(...corners.map((p) => p[0])),
            minV = Math.min(...corners.map((p) => p[1])),
            maxV = Math.max(...corners.map((p) => p[1]));
          assert(Math.abs(maxU - minU - 1 / 6) < 1e-6);
          assert(Math.abs(maxV - minV - 0.25) < 1e-6);
          assert(minU >= 0 && maxU <= 1 && minV >= 0 && maxV <= 1);
          const cell = Math.round(minV * 4) * 6 + Math.round(minU * 6);
          assert(cell < 21);
          usedCells.add(cell);
        }
        assert(
          usedCells.size >= 8,
          "Several distinct sprig silhouettes should remain in each specimen",
        );
        for (let i = 0; i < indices.length; i += 3) {
          a.fromArray(pos.getArray(), indices[i] * 3);
          b.fromArray(pos.getArray(), indices[i + 1] * 3).sub(a);
          c.fromArray(pos.getArray(), indices[i + 2] * 3).sub(a);
          normalPoint.fromArray(norm.getArray(), indices[i] * 3);
          assert(Math.abs(normalPoint.length() - 1) < 1e-5);
          assert(new Vector3().crossVectors(b, c).dot(normalPoint) > 1e-8);
        }
      }
    assert.equal(triangles, output.triangles);
  }
});

test("each fir atlas tile contains a padded cutout silhouette and usable needle normals", async () => {
  const { data, info } = await sharp(
    "public/assets/textures/fir-sprigs-color.png",
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const normals = await sharp("public/assets/textures/fir-sprigs-normal.png")
    .raw()
    .toBuffer();
  assert.equal(info.width, 1536);
  assert.equal(info.height, 1024);
  assert.equal(info.channels, 4);
  for (let cell = 0; cell < 21; cell++) {
    const ox = (cell % 6) * 256,
      oy = Math.floor(cell / 6) * 256;
    let visible = 0,
      transparent = 0,
      normalVariation = 0;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const index = (oy + y) * info.width + ox + x,
          alpha = data[index * 4 + 3];
        if (alpha > 89) {
          visible++;
          if (
            Math.abs(normals[index * 3] - 128) > 10 ||
            Math.abs(normals[index * 3 + 1] - 128) > 10
          )
            normalVariation++;
        }
        if (alpha === 0) transparent++;
        if (x < 3 || y < 3 || x > 252 || y > 252)
          assert.equal(
            alpha,
            0,
            "Tile borders must not leak into neighboring sprigs",
          );
      }
    assert(visible > 1000 && visible < 45000);
    assert(transparent > 10000);
    assert(normalVariation > visible * 0.2);
  }
});
