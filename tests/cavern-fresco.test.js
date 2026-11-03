import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import * as THREE from "three";
import { cavernMuralCoordinates } from "../src/cavern-murals.js";

sharp.concurrency(1);
sharp.cache(false);

test("portrait figures keep equal physical texel scale in narrow and wide outer and inner bays", () => {
  for (const stage of [0, 4, 7])
    for (const radius of [0.33, 0.396, 0.849, 1.17, 1.22])
      for (const interior of [false, true]) {
        const bottom = interior ? 1.45 : 1.2,
          top = interior ? 4.87 : 5.7,
          g = new THREE.BoxGeometry(
            radius * 2,
            top - bottom,
            0.045,
          ).toNonIndexed();
        g.translate(0, (top + bottom) / 2, 0);
        const original = g.attributes.position.array.slice();
        cavernMuralCoordinates(g, { stage, radius, bottom, top, interior });
        assert.deepEqual(g.attributes.position.array, original);
        const p = g.attributes.position,
          uv = g.attributes.cavernMuralCoord;
        let checked = 0;
        for (let i = 0; i < p.count; i += 3) {
          if (!uv.getW(i)) continue;
          const a = new THREE.Vector3().fromBufferAttribute(p, i),
            b = new THREE.Vector3().fromBufferAttribute(p, i + 1).sub(a),
            c = new THREE.Vector3().fromBufferAttribute(p, i + 2).sub(a),
            du1 = (uv.getX(i + 1) - uv.getX(i)) * 313,
            dv1 = (uv.getY(i + 1) - uv.getY(i)) * 626,
            du2 = (uv.getX(i + 2) - uv.getX(i)) * 313,
            dv2 = (uv.getY(i + 2) - uv.getY(i)) * 626,
            det = du1 * dv2 - du2 * dv1,
            u = b
              .clone()
              .multiplyScalar(dv2)
              .addScaledVector(c, -dv1)
              .divideScalar(det),
            v = c
              .clone()
              .multiplyScalar(du1)
              .addScaledVector(b, -du2)
              .divideScalar(det);
          assert(Math.abs(u.length() / v.length() - 1) < 0.00001);
          assert(
            Math.abs(u.clone().normalize().dot(v.clone().normalize())) <
              0.00001,
          );
          assert.equal(Math.sign(u.x), interior ? -1 : 1);
          assert(v.y > 0);
          checked++;
        }
        assert.equal(checked, 2);
        g.dispose();
      }
});
test("the published cavern fresco atlas matches its provenance and all copied gutters isolate the eight stories", async () => {
  const manifest = JSON.parse(
      await readFile("asset-sources/cavern-records/sources.json", "utf8"),
    ),
    file = await readFile(manifest.delivery.file),
    image = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    { columns, rows, cellWidth, cellHeight, gutter } = manifest.atlas,
    width = columns * (cellWidth + gutter * 2),
    height = rows * (cellHeight + gutter * 2);
  assert.equal(
    createHash("sha256").update(file).digest("hex"),
    manifest.delivery.sha256,
  );
  assert.equal(image.info.width, width);
  assert.equal(image.info.height, height);
  assert.equal(columns * rows, 8);
  assert.equal(manifest.atlas.order.length, 8);
  function inspect(data) {
    let failures = 0,
      checks = 0;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++)
        for (let y = 0; y < cellHeight + gutter * 2; y++)
          for (let x = 0; x < cellWidth + gutter * 2; x++) {
            if (
              x >= gutter &&
              x < gutter + cellWidth &&
              y >= gutter &&
              y < gutter + cellHeight
            )
              continue;
            const px = col * (cellWidth + gutter * 2),
              py = row * (cellHeight + gutter * 2),
              sx = Math.max(gutter, Math.min(gutter + cellWidth - 1, x)),
              sy = Math.max(gutter, Math.min(gutter + cellHeight - 1, y)),
              a = ((py + y) * width + px + x) * 4,
              b = ((py + sy) * width + px + sx) * 4;
            for (let k = 0; k < 4; k++)
              if (data[a + k] !== data[b + k]) failures++;
            checks++;
          }
    return { failures, checks };
  }
  const result = inspect(image.data);
  assert.equal(result.failures, 0);
  assert(result.checks > 100000);
  const broken = Buffer.from(image.data);
  broken[0] ^= 127;
  assert(inspect(broken).failures > 0, "a damaged atlas edge must be detected");
});
