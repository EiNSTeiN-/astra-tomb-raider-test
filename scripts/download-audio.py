"""Fetch the licensed field recordings used by the browser soundscape.

See docs/asset-credits.md for authors, license links, and processing details.
The game downmixes, levels, and crossfades these recordings in Web Audio.
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/audio'
BASE = 'https://opengameart.org/sites/default/files/'
ASSETS = {
    'birds.ogg': 'birds-isaiah658_0.ogg',
    'fire.ogg': 'audio_preview/fire.wav.ogg',
    'drips.flac': 'atmosbasement.mp3_.flac',
}


def download(item):
    name, path = item
    with urlopen(BASE + path, timeout=45) as response:
        data = response.read()
    (ROOT / name).write_bytes(data)
    return f'{name}: {len(data):,} bytes'


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(download, ASSETS.items()):
            print(result)
    with urlopen(BASE + 'stream-waterfall.zip', timeout=45) as response:
        archive = ZipFile(BytesIO(response.read()))
    for source, target in [('waterfall2.ogg', 'waterfall.ogg'), ('stream3.ogg', 'stream.ogg')]:
        data = archive.read('stream-waterfall/' + source)
        (ROOT / target).write_bytes(data)
        print(f'{target}: {len(data):,} bytes')
