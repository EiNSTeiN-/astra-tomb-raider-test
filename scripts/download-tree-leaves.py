"""Fetch the unmodified CC0 leaf cutout shared by both Island Tree assets."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'asset-sources/tree-leaves'
SOURCES.mkdir(parents=True, exist_ok=True)
TARGET = ROOT / 'public/assets/textures/island-tree-leaves-alpha.png'
STAGING = ROOT / 'local/staging/tree-leaves'
STAGING.mkdir(parents=True, exist_ok=True)
staged = STAGING / 'island-tree-leaves-alpha.download.png'
URL = 'https://dl.polyhaven.org/file/ph-assets/Models/png/1k/island_tree_01/island_tree_01_leaves_alpha_1k.png'
SHA = 'f4341f147988dbe6b58d9ca841a8f0e4bcff25bc40d05f9877da82006d489c39'
subprocess.run(['curl', '-fsSL', '--retry', '2', URL, '-o', str(staged)], check=True)
data = staged.read_bytes()
assert hashlib.sha256(data).hexdigest() == SHA, 'Leaf mask changed upstream'
TARGET.parent.mkdir(parents=True, exist_ok=True)
TARGET.write_bytes(data)
manifest = SOURCES / 'sources.json'
records = json.loads(manifest.read_text()) if manifest.exists() else {}
records['mask'] = {'path': str(TARGET.relative_to(ROOT)), 'url': URL, 'sha256': SHA, 'bytes': TARGET.stat().st_size, 'license': 'CC0-1.0', 'source': 'https://polyhaven.com/a/island_tree_01', 'shared_with': 'https://polyhaven.com/a/island_tree_02', 'derivation': 'Unmodified 1K PNG; both assets publish the same leaf mask.'}
manifest.write_text(json.dumps(records, indent=2) + '\n')
print(records['mask']['path'])
