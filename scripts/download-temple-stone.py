"""Download the pinned 2K Worn Rock Natural 01 PBR maps from Poly Haven (CC0)."""
import json
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output([
    'curl', '-fsSL', '--retry', '2', 'https://api.polyhaven.com/files/worn_rock_natural_01'
]))

def download(pair):
    source, suffix = pair
    target = ROOT / 'public/assets/textures' / f'temple-{suffix}.jpg'
    subprocess.run(['curl', '-fsSL', '--retry', '2', metadata[source]['2k']['jpg']['url'], '-o', str(target)], check=True)
    print(target.relative_to(ROOT))

with ThreadPoolExecutor(max_workers=3) as executor:
    list(executor.map(download, [('Diffuse', 'color'), ('nor_gl', 'normal'), ('Rough', 'roughness')]))
