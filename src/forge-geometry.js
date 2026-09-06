import * as THREE from "three";

// A thick toothed rim around an open hub: original machinery, not a flat decal.
export function forgeGearGeometry(radius = 3.2, teeth = 24, depth = 0.5) {
  const shape = new THREE.Shape();
  for (let tooth = 0; tooth < teeth; tooth++)
    for (let step = 0; step < 4; step++) {
      const a = ((tooth + step / 4) / teeth) * Math.PI * 2;
      const r = radius + (step === 1 || step === 2 ? 0.17 : -0.17);
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      if (!tooth && !step) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.73, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 32,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// Square taper with horizontal courses; cap is covered by the chimney socket.
export function furnaceHoodGeometry(width = 8, depth = 7, height = 3.6) {
  const geometry = new THREE.CylinderGeometry(
    1,
    1,
    height,
    4,
    1,
    false,
    Math.PI / 4,
  );
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height + 0.5;
    p.setXYZ(
      i,
      (p.getX(i) * Math.SQRT2 * (width * (1 - t) + 3.2 * t)) / 2,
      p.getY(i),
      (p.getZ(i) * Math.SQRT2 * (depth * (1 - t) + 3.2 * t)) / 2,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function furnaceFlueGeometry(height, radius = 1.38) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    if (i) shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else shape.moveTo(radius, 0);
  }
  shape.closePath();
  const hole = new THREE.Path();
  for (let i = 0; i < 8; i++) {
    const a = (-i * Math.PI) / 4;
    if (i)
      hole.lineTo(Math.cos(a) * (radius - 0.18), Math.sin(a) * (radius - 0.18));
    else hole.moveTo(radius - 0.18, 0);
  }
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
