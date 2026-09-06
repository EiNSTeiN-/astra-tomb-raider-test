"""Download unmodified 2K CC0 sandstone maps with reproducible source records."""
import hashlib
import json
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "asset-sources/desert-stone"
SOURCE.mkdir(parents=True, exist_ok=True)
jobs = []
for asset, local in [("sandstone_cracks", "sandstone"), ("sandstone_blocks_08", "sandstone-wall")]:
    metadata = json.loads(subprocess.check_output([
        "curl", "-fsSL", "--retry", "2", f"https://api.polyhaven.com/files/{asset}"
    ]))
    (SOURCE / f"{asset}.json").write_text(json.dumps(metadata, indent=2) + "\n")
    for channel, suffix in [("Diffuse", "color"), ("nor_gl", "normal"), ("Rough", "roughness")]:
        jobs.append((asset, metadata[channel]["2k"]["jpg"]["url"], local, suffix))

def download(job):
    asset, url, local, suffix = job
    path = ROOT / "public/assets/textures" / f"{local}-{suffix}.jpg"
    subprocess.run(["curl", "-fsSL", "--retry", "2", url, "-o", str(path)], check=True)
    data = path.read_bytes()
    return {"asset": asset, "source": f"https://polyhaven.com/a/{asset}", "license": "CC0",
            "url": url, "file": str(path.relative_to(ROOT)), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}

with ThreadPoolExecutor(max_workers=3) as pool:
    records = list(pool.map(download, jobs))
(SOURCE / "sources.json").write_text(json.dumps(records, indent=2) + "\n")
for record in records:
    print(record["file"], record["bytes"])
