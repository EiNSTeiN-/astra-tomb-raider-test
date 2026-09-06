"""Fetch pinned-resolution CC0 environment assets from Poly Haven."""
import pathlib, json, subprocess, concurrent.futures
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'asset-sources/models'
def download(job):
    url, path = job
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '-sL', '--fail', '--retry', '2', url, '-o', str(path)], check=True)
    return path
jobs=[]
for name in ['fern_02', 'shrub_01', 'rock_moss_set_01', 'island_tree_02', 'island_tree_01', 'fir_tree_01']:
    meta = json.loads(subprocess.check_output(['curl', '-sL', '--fail', 'https://api.polyhaven.com/files/' + name]))
    data = meta['gltf']['1k']['gltf']
    jobs.append((data['url'], ROOT/name/'scene.gltf'))
    jobs += [(v['url'], ROOT/name/k) for k,v in data['include'].items()]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for path in pool.map(download, jobs):
        print(path.relative_to(ROOT))
