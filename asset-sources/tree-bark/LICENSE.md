# Island Tree trunk repair

[Island Tree 01](https://polyhaven.com/a/island_tree_01) and
[Island Tree 02](https://polyhaven.com/a/island_tree_02) by Rico Cilliers and
Rob Tuytel are distributed by Poly Haven under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
See the existing [leaf source record](../tree-leaves/LICENSE.md).

The trunk repair uses the original mesh vertices, normals and texture coordinates.
The project reduction preserves UV chart boundaries and restores local source
geometry where a reduced triangle would cross into texture-atlas padding.
The three distance tiers share this trunk geometry. Branches, leaf cards,
texture images, transforms and normalization metadata retain their input values.

`sources.json` records original input hashes, reduced counts, delivery hashes and
retained input signatures. It includes compressed source UV coverage as a small
validation fixture so tests do not need raw downloads. This fixture is derived
from the same CC0 meshes and is not loaded by the game. The reconstruction and
verification scripts are original project code. Raw downloads and temporary
comparison assets remain excluded from publication.
