import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Deterministic texture packing only: preserve every painted source pixel and
// repeat each cell's edge into an 8 px gutter for filtered sampling in the game.
sharp.concurrency(1);
sharp.cache(false);
const input =
    process.argv[2] || "asset-sources/jungle-records/atlas-generated.png",
  output = "public/assets/textures/jungle-records-atlas.webp",
  source = await readFile(input),
  meta = await sharp(source).metadata(),
  width = meta.width / 2,
  height = meta.height / 4,
  pad = 8;
assert.equal(meta.width, 1536);
assert.equal(meta.height, 1024);
const layers = [];
for (let row = 0; row < 4; row++)
  for (let col = 0; col < 2; col++)
    layers.push({
      input: await sharp(source)
        .extract({ left: col * width, top: row * height, width, height })
        .extend({
          top: pad,
          bottom: pad,
          left: pad,
          right: pad,
          extendWith: "copy",
        })
        .png()
        .toBuffer(),
      left: col * (width + pad * 2),
      top: row * (height + pad * 2),
    });
await mkdir("public/assets/textures", { recursive: true });
await sharp({
  create: {
    width: (width + pad * 2) * 2,
    height: (height + pad * 2) * 4,
    channels: 3,
    background: "#ddd2b5",
  },
})
  .composite(layers)
  .webp({ lossless: true, effort: 5 })
  .toFile(output);
for (let row = 0; row < 4; row++)
  for (let col = 0; col < 2; col++) {
    const a = await sharp(source)
        .extract({ left: col * width, top: row * height, width, height })
        .ensureAlpha()
        .raw()
        .toBuffer(),
      b = await sharp(output)
        .extract({
          left: col * (width + pad * 2) + pad,
          top: row * (height + pad * 2) + pad,
          width,
          height,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
    assert(a.equals(b), "Painted cell pixels must survive packing unchanged");
  }
const file = await readFile(output),
  delivery = await sharp(file).metadata(),
  hash = (data) => createHash("sha256").update(data).digest("hex");
await mkdir("asset-sources/jungle-records", { recursive: true });
await writeFile(
  "asset-sources/jungle-records/sources.json",
  JSON.stringify(
    {
      asset: "Eight jungle sanctuary fresco records",
      provenance:
        "Original project artwork generated with the built-in image_gen tool, then packed without changing the painted pixels.",
      prompt: "docs/art-prompts.md#jungle-fresco-atlas",
      source: {
        file: "atlas-generated.png",
        width: meta.width,
        height: meta.height,
        sha256: hash(source),
      },
      delivery: {
        file: output,
        width: delivery.width,
        height: delivery.height,
        sha256: hash(file),
        bytes: file.length,
      },
      atlas: {
        columns: 2,
        rows: 4,
        cellWidth: width,
        cellHeight: height,
        gutter: pad,
        order: [
          "Dawn beacons",
          "Root gatehouse",
          "Rain garden",
          "Keepers vigil",
          "Eastern lens",
          "Hanging crossing",
          "Beacon chain",
          "Heart seal",
        ],
      },
      conversion:
        "python3 scripts/run-with-cpu-budget.py ./local/bin/node scripts/build-jungle-fresco.mjs asset-sources/jungle-records/atlas-generated.png",
      verification:
        "All eight source-cell RGBA buffers equal their delivered inner regions. Only copied edge gutters and lossless format encoding are added.",
      limitations:
        "Original fictional wall paintings, not historical documentation or scans. The optional generated source is excluded from publication; the playable atlas and this provenance record are tracked.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  delivery.width,
  delivery.height,
  file.length,
  "bytes; all eight painted cells preserved.",
);
