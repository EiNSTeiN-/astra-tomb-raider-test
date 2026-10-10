import test from "node:test";
import assert from "node:assert/strict";
import {
  mountainHeight,
  mountainNormal,
  snowMountainGeometry,
} from "../src/snow-mountains.js";

test("continuous mountain normals agree with independent Cartesian derivatives", () => {
  for (const layer of [0, 1]) {
    const extent = 420,
      inner = extent * (0.73 + layer * 0.53),
      height = (x, z) =>
        mountainHeight(
          Math.atan2(z, x),
          (Math.hypot(x, z) - inner) / 400,
          layer,
          extent,
        );
    for (const angle of [0, 0.7, 1.8, 3.1, 4.3, 6.28])
      for (const across of [0, 0.07, 0.29, 0.53, 0.87, 1]) {
        const radius = inner + across * 400,
          x = Math.cos(angle) * radius,
          z = Math.sin(angle) * radius,
          dx = (height(x + 0.1, z) - height(x - 0.1, z)) / 0.2,
          dz = (height(x, z + 0.1) - height(x, z - 0.1)) / 0.2,
          length = Math.hypot(dx, 1, dz),
          normal = mountainNormal(angle, across, layer, extent),
          alignment = (-dx * normal[0] + normal[1] - dz * normal[2]) / length;
        assert(normal.every(Number.isFinite));
        assert(Math.abs(Math.hypot(...normal) - 1) < 1e-12);
        assert(
          alignment > 0.985,
          `normal at layer ${layer}, ${angle}, ${across}`,
        );
      }
  }
});

test("mountain refinement bounds geometry while preserving the submerged aprons", () => {
  for (const layer of [0, 1]) {
    const geometry = snowMountainGeometry(420, layer),
      { segments, rings } = geometry.userData,
      p = geometry.attributes.position,
      n = geometry.attributes.normal;
    assert.equal(p.count, 74593);
    assert.equal(geometry.index.count / 3, 147456);
    assert(p.array.every(Number.isFinite));
    assert(n.array.every(Number.isFinite));
    for (let i = 0; i <= segments; i++) {
      assert.equal(p.getY(i), -18);
      assert.equal(p.getY(rings * (segments + 1) + i), -18);
    }
    // Duplicated positions and analytical normals must join exactly, so the
    // lighting/snow field cannot reveal a seam when the camera turns around.
    for (let ring = 0; ring <= rings; ring++) {
      const a = ring * (segments + 1),
        b = a + segments;
      for (const attribute of [p, n])
        for (const axis of ["X", "Y", "Z"])
          assert.equal(attribute[`get${axis}`](a), attribute[`get${axis}`](b));
    }
    geometry.dispose();
  }
});
