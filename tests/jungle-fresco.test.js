import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

sharp.concurrency(1);
sharp.cache(false);
test("the jungle fresco atlas matches its provenance and all copied gutters isolate the eight stories", async () => {
  const manifest = JSON.parse(
      await readFile("asset-sources/jungle-records/sources.json", "utf8"),
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
