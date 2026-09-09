# Island Tree foliage and leaf mask

[Island Tree 01](https://polyhaven.com/a/island_tree_01) and
[Island Tree 02](https://polyhaven.com/a/island_tree_02) are distributed by
Poly Haven under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/),
as recorded on the [Poly Haven license page](https://polyhaven.com/license).
The source asset credits name Rico Cilliers and Rob Tuytel.

The shared 1K leaf alpha mask is delivered without modification. Both assets
publish the same PNG. `sources.json` records its download URL and SHA-256 hash.

The six revised GLBs retain this project's existing trunk/branch geometry,
texture images and node transforms. Leaf geometry is replaced with fitted cards
using the original connected leaves' UV bounds. Normalization bounds retain the
existing world size and origin. At jungle load, a one-time GPU bake places small
leaf clusters into shared color, normal and roughness atlases for the middle/distant cards. Ordinary
foliage and depth materials sample the atlases with matching cutouts.

The reconstruction and shader are original project code. Source file hashes,
normalization bounds and delivery hashes are recorded in `sources.json`.
Raw downloads, conversion intermediates and comparison copies remain excluded
from publication.
