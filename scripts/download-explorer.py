"""Restore the reviewed character source assets; generated fabric is retained locally.

Run this from the project root, then run node scripts/build-explorer.mjs.
The application only serves the resulting GLB, not these development sources.
"""
from pathlib import Path
import hashlib
import json
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / "asset-sources/characters"
ASSETS = ROOT / "makehuman"
manifest = json.loads((ASSETS / "sources.json").read_text())


def matches(path, digest):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest


def write_checked(path, data, digest):
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError(f"Source checksum changed: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


for name, source in manifest["core"].items():
    target = ASSETS / name
    if not matches(target, source["sha256"]):
        write_checked(target, urllib.request.urlopen(source["url"]).read(), source["sha256"])

source = manifest["locomotion"]
target = ROOT / "locomotion-source.glb"
if not matches(target, source["sha256"]):
    write_checked(target, urllib.request.urlopen(source["url"]).read(), source["sha256"])

missing = {name: digest for name, digest in manifest["systemFiles"].items()
           if not matches(ASSETS / "system" / name, digest)}
if missing:
    with tempfile.TemporaryDirectory(prefix="vesper-character-") as temporary:
        archive = Path(temporary) / "system.zip"
        urllib.request.urlretrieve(manifest["systemZip"], archive)
        with zipfile.ZipFile(archive) as bundle:
            for name, digest in missing.items():
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts:
                    raise RuntimeError("Invalid source path")
                write_checked(ASSETS / "system" / relative, bundle.read(name), digest)
print("Character source checksums verified.")
