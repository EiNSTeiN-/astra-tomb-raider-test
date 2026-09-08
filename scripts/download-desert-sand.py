"""Reproduce the unmodified CC0 ripple maps used by the desert terrain."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "asset-sources/desert-sand"
SOURCE.mkdir(parents=True, exist_ok=True)
ASSET = "aerial_beach_01"
CHANNELS = [("diff", "color"), ("nor_gl", "normal"), ("rough", "roughness")]

# Fixed delivery URLs, resolution and format; a normal clone uses bundled maps.
records = []
for channel, suffix in CHANNELS:
    url = f"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{ASSET}/{ASSET}_{channel}_2k.jpg"
    path = ROOT / "public/assets/textures" / f"desert-sand-{suffix}.jpg"
    subprocess.run(["curl", "-fsSL", "--retry", "2", url, "-o", str(path)], check=True)
    data = path.read_bytes()
    records.append({
        "asset": ASSET, "author": "Rob Tuytel", "source": f"https://polyhaven.com/a/{ASSET}",
        "license": "CC0-1.0", "license_url": "https://polyhaven.com/license",
        "url": url, "file": str(path.relative_to(ROOT)), "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
    print(path.relative_to(ROOT), len(data))
(SOURCE / "sources.json").write_text(json.dumps(records, indent=2) + "\n")
