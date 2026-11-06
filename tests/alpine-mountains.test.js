import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  mountainHeight,
  mountainNormal,
  snowMountainGeometry,
} from "../src/snow-mountains.js";

// Inspect delivered triangles independently of the continuous height function.
// A valid derivative can still oppose a coarse face if its erosion is too fine.
function faceAudit(geometry) {
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal,
    index = geometry.index,
    corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    triangle = new THREE.Triangle(...corners),
    face = new THREE.Vector3(),
    normal = new THREE.Vector3();
  let minimumAlignment = 1,
    minimumArea = Infinity,
    minimumUp = 1;
  for (let i = 0; i < index.count; i += 3) {
    for (let j = 0; j < 3; j++)
      corners[j].fromBufferAttribute(positions, index.getX(i + j));
    triangle.getNormal(face);
    minimumArea = Math.min(minimumArea, triangle.getArea());
    minimumUp = Math.min(minimumUp, face.y);
    for (let j = 0; j < 3; j++) {
      normal.fromBufferAttribute(normals, index.getX(i + j));
      minimumAlignment = Math.min(minimumAlignment, normal.dot(face));
    }
  }
  return { minimumAlignment, minimumArea, minimumUp };
}

test("continuous mountain normals agree with independent Cartesian derivatives", () => {
  for (const layer of [0, 1]) {
    const extent = 420,
      geometry = snowMountainGeometry(extent, layer),
      { radius: inner, depth } = geometry.userData,
      height = (x, z) =>
        mountainHeight(
          Math.atan2(z, x),
          (Math.hypot(x, z) - inner) / depth,
          layer,
          extent,
        );
    for (const angle of [0, 0.7, 1.8, 3.1, 4.3, 6.28])
      for (const across of [0, 0.07, 0.29, 0.53, 0.87, 1]) {
        const radius = inner + across * depth,
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
    geometry.dispose();
  }
});

test("mountain refinement bounds geometry while preserving the submerged aprons", () => {
  for (const layer of [0, 1]) {
    const geometry = snowMountainGeometry(420, layer),
      { segments, rings } = geometry.userData,
      p = geometry.attributes.position,
      n = geometry.attributes.normal,
      deposit = geometry.attributes.snowDeposit;
    assert.equal(p.count, 74593);
    assert.equal(geometry.index.count / 3, 147456);
    assert(p.array.every(Number.isFinite));
    assert(n.array.every(Number.isFinite));
    assert.equal(deposit.count, p.count);
    assert(deposit.array.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
    assert(
      deposit.array.some((v) => v > 0.5),
      "snow-receiving gullies exist",
    );
    for (let i = 0; i <= segments; i++) {
      assert.equal(p.getY(i), -18);
      assert.equal(p.getY(rings * (segments + 1) + i), -18);
      assert.equal(deposit.getX(i), 0);
      assert.equal(deposit.getX(rings * (segments + 1) + i), 0);
    }
    // Duplicated positions and analytical normals must join exactly, so the
    // lighting/snow field cannot reveal a seam when the camera turns around.
    for (let ring = 0; ring <= rings; ring++) {
      const a = ring * (segments + 1),
        b = a + segments;
      for (const attribute of [p, n])
        for (const axis of ["X", "Y", "Z"])
          assert.equal(attribute[`get${axis}`](a), attribute[`get${axis}`](b));
      assert.equal(deposit.getX(a), deposit.getX(b));
    }
    geometry.dispose();
  }
});

test("both delivered shells keep finite upward faces and compatible lighting normals", (t) => {
  for (const extent of [420, 427])
    for (const layer of [0, 1]) {
      const geometry = snowMountainGeometry(extent, layer);
      try {
        const audit = faceAudit(geometry);
        assert(audit.minimumArea > 1);
        assert(audit.minimumUp > 0);
        assert(
          audit.minimumAlignment > 0.65,
          `lighting normal crosses a sharp unresolved face: ${JSON.stringify(audit)}`,
        );
        t.diagnostic(`${extent}, layer ${layer}: ${JSON.stringify(audit)}`);
        // Turning a delivered normal inward must fail the same observer.
        const n = geometry.attributes.normal,
          i = (geometry.userData.segments + 1) * 32 + 123;
        n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
        assert(faceAudit(geometry).minimumAlignment < 0);
      } finally {
        geometry.dispose();
      }
    }
});
