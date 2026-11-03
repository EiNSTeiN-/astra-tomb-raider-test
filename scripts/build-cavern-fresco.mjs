import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Deterministic texture packing only: preserve every painted source pixel and
// repeat each cell's edge into an 8 px gutter for filtered sampling in the game.
sharp.concurrency(1);
sharp.cache(false);
const input =
    process.argv[2] || "asset-sources/cavern-records/atlas-generated.png",
  output = "public/assets/textures/cavern-records-atlas.webp",
  source = await readFile(input),
  correctionInput =
    process.argv[3] || "asset-sources/cavern-records/guide-light-corrected.png",
  correction = await readFile(correctionInput),
  correctionMeta = await sharp(correction).metadata(),
  meta = await sharp(source).metadata(),
  width = Math.ceil(meta.width / 4),
  height = meta.height / 2,
  pad = 8;
assert.equal(meta.width, 1254);
assert.equal(meta.height, 1254);
assert.equal(correctionMeta.width, meta.width);
assert.equal(correctionMeta.height, meta.height);
const layers = [];
for (let row = 0; row < 2; row++)
  for (let col = 0; col < 4; col++)
    layers.push({
      input: await sharp(row === 0 && col === 0 ? correction : source)
        .extract({
          left: Math.round((col * meta.width) / 4),
          top: row * height,
          width:
            Math.round(((col + 1) * meta.width) / 4) -
            Math.round((col * meta.width) / 4),
          height,
        })
        .extend({
          top: pad,
          bottom: pad,
          left: pad,
          right:
            pad +
            width -
            (Math.round(((col + 1) * meta.width) / 4) -
              Math.round((col * meta.width) / 4)),
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
    width: (width + pad * 2) * 4,
    height: (height + pad * 2) * 2,
    channels: 3,
    background: "#ddd2b5",
  },
})
  .composite(layers)
  .webp({ lossless: true, effort: 5 })
  .toFile(output);
for (let row = 0; row < 2; row++)
  for (let col = 0; col < 4; col++) {
    const a = await sharp(row === 0 && col === 0 ? correction : source)
        .extract({
          left: Math.round((col * meta.width) / 4),
          top: row * height,
          width:
            Math.round(((col + 1) * meta.width) / 4) -
            Math.round((col * meta.width) / 4),
          height,
        })
        .ensureAlpha()
        .raw()
        .toBuffer(),
      b = await sharp(output)
        .extract({
          left: col * (width + pad * 2) + pad,
          top: row * (height + pad * 2) + pad,
          width:
            Math.round(((col + 1) * meta.width) / 4) -
            Math.round((col * meta.width) / 4),
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
await mkdir("asset-sources/cavern-records", { recursive: true });
await writeFile(
  "asset-sources/cavern-records/sources.json",
  JSON.stringify(
    {
      asset: "Eight cavern fresco records",
      provenance:
        "Original project artwork generated with the built-in image_gen tool, then packed without changing the painted pixels.",
      prompt: "docs/art-prompts.md#cavern-fresco-atlas",
      source: {
        file: "atlas-generated.png",
        width: meta.width,
        height: meta.height,
        sha256: hash(source),
      },
      correction: {
        file: "guide-light-corrected.png",
        width: correctionMeta.width,
        height: correctionMeta.height,
        sha256: hash(correction),
        usedRegion: { left: 0, top: 0, width, height },
        prompt: "docs/art-prompts.md#cavern-fresco-correction",
        purpose:
          "Replace the guide-light figure's extra arm with two arms, a three-lamp yoke and walking staff. Only this cell is selected from the edited atlas; all seven other original cells remain pixel-identical.",
      },
      delivery: {
        file: output,
        width: delivery.width,
        height: delivery.height,
        sha256: hash(file),
        bytes: file.length,
      },
      atlas: {
        columns: 4,
        rows: 2,
        cellWidth: width,
        cellHeight: height,
        gutter: pad,
        sourceColumnEdges: [0, 314, 627, 941, 1254],
        order: [
          "Guide lights",
          "Descending echo",
          "Mirrored archive",
          "Ascending chamber",
          "Violet counterpoint",
          "Broken conversation",
          "Paired heart",
          "Remembered prism",
        ],
      },
      conversion:
        "python3 scripts/run-with-cpu-budget.py ./local/bin/node scripts/build-cavern-fresco.mjs asset-sources/cavern-records/atlas-generated.png asset-sources/cavern-records/guide-light-corrected.png",
      verification:
        "Seven original source-cell RGBA buffers and the corrected first-cell RGBA buffer equal their delivered inner regions. Only copied edge columns, gutters and lossless format encoding are added.",
      limitations:
        "Original fictional cavern paintings, not historical documentation or scans. The generated source is 1254 square despite the prompt requesting 2048 square. The 313-pixel-wide cells repeat one rightmost column to fill a uniform 314-pixel cell, preserving all original pixels. The optional generated source is excluded from publication; the playable atlas and this provenance record are tracked.",
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
