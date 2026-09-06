"""Fetch unmodified CC0 moss maps and paving height for the terrain shader."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "asset-sources/terrain-detail"
TARGET = ROOT / "public/assets/textures"
SOURCES.mkdir(parents=True, exist_ok=True)


def fetch(url, path):
    subprocess.run(["curl", "-fsSL", "--retry", "2", url, "-o", str(path)], check=True)


archive = SOURCES / "Ground037_2K-JPG.zip"
source_url = "https://ambientcg.com/get?file=Ground037_2K-JPG.zip"
fetch(source_url, archive)
records = []
with zipfile.ZipFile(archive) as bundle:
    for source, target in [("Color", "verdure-color.jpg"), ("NormalGL", "verdure-normal.jpg")]:
        data = bundle.read(f"Ground037_2K-JPG_{source}.jpg")
        (TARGET / target).write_bytes(data)
        records.append({"path": f"public/assets/textures/{target}", "url": source_url, "member": f"Ground037_2K-JPG_{source}.jpg", "sha256": hashlib.sha256(data).hexdigest(), "license": "CC0-1.0", "source": "https://ambientcg.com/view?id=Ground037"})

metadata = SOURCES / "mossy-cobblestone-files.json"
fetch("https://api.polyhaven.com/files/mossy_cobblestone", metadata)
url = json.loads(metadata.read_text())["Displacement"]["1k"]["jpg"]["url"]
path = TARGET / "moss-height.jpg"
fetch(url, path)
records.append({"path": "public/assets/textures/moss-height.jpg", "url": url, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "license": "CC0-1.0", "source": "https://polyhaven.com/a/mossy_cobblestone"})
(SOURCES / "sources.json").write_text(json.dumps(records, indent=2) + "\n")
for record in records:
    print(record["path"])
