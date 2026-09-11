import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  meridianHeight,
  meridianGeometry,
  buildMeridianEscarpment,
} from "../src/meridian-escarpment.js";
import { observatorySky } from "../src/observatory-sky.js";

test("the distant meridian shelves are finite, reproducible and remain beyond every playable corner", () => {
  const extent = 427,
    geometry = meridianGeometry(extent),
    again = meridianGeometry(extent);
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  assert.deepEqual(p.array, again.attributes.position.array);
  assert(p.array.every(Number.isFinite));
  assert(n.array.every(Number.isFinite));
  assert(uv.array.every(Number.isFinite));
  assert.equal(p.count, n.count);
  assert.equal(uv.count, p.count);
  assert(geometry.index.count / 3 <= 82000);
  let minimum = Infinity,
    maximum = -Infinity;
  for (let i = 0; i < p.count; i++) {
    assert(n.getY(i) > 0);
    assert(
      Math.hypot(p.getX(i) - extent / 2, p.getZ(i) - extent / 2) >
        extent / Math.sqrt(2),
    );
    minimum = Math.min(minimum, p.getY(i));
    maximum = Math.max(maximum, p.getY(i));
  }
  assert(minimum >= -18.001 && minimum <= -17.999);
  assert(maximum > 90 && maximum < 170);
  for (const index of geometry.index.array) assert(index < p.count);
  const { segments, rings } = geometry.userData;
  for (let ring = 0; ring <= rings; ring++)
    for (const attribute of [p, n]) {
      const a = new THREE.Vector3().fromBufferAttribute(
          attribute,
          ring * (segments + 1),
        ),
        b = new THREE.Vector3().fromBufferAttribute(
          attribute,
          ring * (segments + 1) + segments,
        );
      assert(a.distanceTo(b) < 1e-5);
    }
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI) / 24;
    assert.equal(meridianHeight(angle, 0, extent), -18);
    assert.equal(meridianHeight(angle, 1, extent), -18);
    assert(
      Math.abs(
        meridianHeight(angle, 0.4, extent) -
          meridianHeight(angle + 2 * Math.PI, 0.4, extent),
      ) < 1e-10,
    );
  }
  geometry.dispose();
  again.dispose();
});
test("the eclipse sky precedes the distant depth interval without changing shared rock assets", () => {
  const source = new THREE.MeshStandardMaterial({
      color: 0x887766,
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
    }),
    color = source.color.clone(),
    world = new THREE.Group(),
    haze = new THREE.Color(0x424956);
  buildMeridianEscarpment({
    map: { size: 61 },
    darkMat: source,
    world,
    scene: { fog: { color: haze } },
  });
  const mesh = world.children[0],
    sky = observatorySky(new THREE.Vector3(-48, 50, -95), {});
  assert.equal(mesh.name, "Meridian escarpment");
  assert(sky.renderOrder < mesh.renderOrder && mesh.renderOrder < 0);
  assert(mesh.userData.excludeContact);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  assert.notEqual(mesh.material, source);
  assert.deepEqual(source.color, color);
  assert.equal(
    source.onBeforeCompile,
    THREE.Material.prototype.onBeforeCompile,
  );
  assert.equal(mesh.material.map, source.map);
  assert.equal(mesh.material.normalMap, source.normalMap);
  let clears = 0;
  mesh.onAfterRender({
    clearDepth() {
      clears++;
    },
  });
  assert.equal(clears, 1);
  mesh.geometry.dispose();
  mesh.material.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  source.dispose();
});
