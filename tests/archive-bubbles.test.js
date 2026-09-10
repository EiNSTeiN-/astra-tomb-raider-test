import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createArchiveBubbles,
  updateArchiveBubbles,
} from "../src/archive-bubbles.js";

function site(waterHeight) {
  return {
    source: { x: 20, y: -7, z: 40 },
    water: { position: { y: waterHeight }, userData: { baseY: waterHeight } },
    bubbles: createArchiveBubbles(),
  };
}

test("bubble guides stay beneath full and drained water and vanish when their source is exposed", () => {
  const s = site(0),
    matrix = new THREE.Matrix4(),
    center = new THREE.Vector3(),
    scale = new THREE.Vector3();
  try {
    for (const height of [0, -1.8, -3.2, -6.95, -7, -8]) {
      s.water.position.y = height;
      for (let t = 0; t < 20; t += 0.13) {
        updateArchiveBubbles(s, t);
        const life = s.bubbles.geometry.getAttribute("bubbleLife");
        for (let i = 0; i < s.bubbles.count; i++) {
          s.bubbles.getMatrixAt(i, matrix);
          assert(matrix.elements.every(Number.isFinite));
          assert(life.getX(i) >= 0 && life.getX(i) <= 1);
          if (height <= s.source.y + 0.08) {
            assert.equal(
              life.getX(i),
              0,
              "exposed source has zero visual life",
            );
            continue;
          }
          center.setFromMatrixPosition(matrix);
          scale.setFromMatrixScale(matrix);
          assert(
            center.y + scale.y / 2 < height,
            "whole bubble stays submerged",
          );
          assert(
            center.y >= s.source.y - 1e-5,
            "bubble rises from the sound source",
          );
          assert(
            Math.hypot(center.x - s.source.x, center.z - s.source.z) < 0.32,
          );
        }
      }
    }
  } finally {
    s.bubbles.geometry.dispose();
    s.bubbles.material.dispose();
  }
});

test("draining after a long play session does not reshuffle bubbles below the new surface", () => {
  const s = site(0),
    matrix = new THREE.Matrix4(),
    before = [];
  try {
    updateArchiveBubbles(s, 3600);
    for (let i = 0; i < s.bubbles.count; i++) {
      s.bubbles.getMatrixAt(i, matrix);
      before.push(new THREE.Vector3().setFromMatrixPosition(matrix));
    }
    s.water.position.y = -1.8;
    updateArchiveBubbles(s, 3600);
    let compared = 0;
    for (const [i, position] of before.entries()) {
      if (position.y > s.water.position.y - 0.2) continue;
      s.bubbles.getMatrixAt(i, matrix);
      assert.deepEqual(
        new THREE.Vector3().setFromMatrixPosition(matrix),
        position,
      );
      compared++;
    }
    assert(
      compared >= 8,
      "inspect bubbles throughout the surviving water column",
    );
  } finally {
    s.bubbles.geometry.dispose();
    s.bubbles.material.dispose();
  }
});

test("different well depths retain bubble rise speed and paused updates retain their exact state", () => {
  const shallow = site(-3),
    deep = site(2),
    matrix = new THREE.Matrix4();
  try {
    for (const s of [shallow, deep]) {
      updateArchiveBubbles(s, 1);
      s.bubbles.getMatrixAt(0, matrix);
      const before = matrix.elements[13];
      updateArchiveBubbles(s, 1.2);
      s.bubbles.getMatrixAt(0, matrix);
      const rise = matrix.elements[13] - before;
      assert(
        rise > 0.14 && rise < 0.21,
        "well depth does not accelerate bubbles",
      );
      const poses = s.bubbles.instanceMatrix.array.slice(),
        lives = s.bubbles.geometry.getAttribute("bubbleLife").array.slice();
      updateArchiveBubbles(s, 1.2);
      assert.deepEqual(s.bubbles.instanceMatrix.array, poses);
      assert.deepEqual(
        s.bubbles.geometry.getAttribute("bubbleLife").array,
        lives,
      );
    }
    assert.notEqual(shallow.bubbles.geometry, deep.bubbles.geometry);
  } finally {
    for (const s of [shallow, deep]) {
      s.bubbles.geometry.dispose();
      s.bubbles.material.dispose();
    }
  }
});
