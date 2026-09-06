import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WIND_TRIALS, windName } from "./wind-rules.js";

// Every sign retains its original 768 x 128 text cell. Repeated labels share
// pixels instead of allocating a full canvas texture for every casting.
export function windPlaqueFactory() {
  const names = [
    ...new Set(
      WIND_TRIALS.flatMap((t) =>
        Array.from(
          { length: t.columns * t.rows },
          (_, i) => `${windName(t, i)}${t.fixed.includes(i) ? " · FIXED" : ""}`,
        ),
      ).concat(["WIND IN", "RECEIVER", "WIND ENGINE"]),
    ),
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = Math.ceil(names.length / 2) * 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e4d3a2";
  ctx.font = "600 76px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  names.forEach((text, i) =>
    ctx.fillText(text, (i % 2) * 768 + 384, Math.floor(i / 2) * 128 + 64, 748),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
  });
  return (text, width) => {
    const i = names.indexOf(text);
    if (i < 0) throw Error(`Unknown wind inscription: ${text}`);
    const geometry = new THREE.PlaneGeometry(width, width / 6),
      uv = geometry.attributes.uv;
    const x = (i % 2) * 768,
      y = Math.floor(i / 2) * 128;
    for (let j = 0; j < uv.count; j++)
      uv.setXY(
        j,
        (x + uv.getX(j) * 768) / canvas.width,
        1 - (y + (1 - uv.getY(j)) * 128) / canvas.height,
      );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.windLabel = text;
    mesh.userData.windLabelCell = { x, y, width: 768, height: 128 };
    return mesh;
  };
}

// Keep the existing objects as transform drivers for hands, camera surfaces and
// game state. Rendering consumes their transforms in per-court instance batches.
// The original geometry, materials and shadow flags are retained.
export function batchWindCourt(site) {
  const groups = new Map(),
    drivers = [];
  const collect = (
    key,
    source,
    kind,
    node = null,
    active = null,
    material = source.material,
  ) => {
    if (!groups.has(key))
      groups.set(key, {
        kind,
        geometry: source.geometry,
        material,
        castShadow: source.castShadow,
        receiveShadow: source.receiveShadow,
        drivers: [],
      });
    const entry = { source, node, active, kind };
    groups.get(key).drivers.push(entry);
    drivers.push(entry);
    source.visible = false;
  };
  const glowMaterials = [false, true].map((active) => {
    const m = site.nodes[0].glow.clone();
    m.color.setHex(active ? 0x9cbfb6 : 0x566963);
    m.emissiveIntensity = active ? 0.7 : 0.015;
    return m;
  });
  for (const node of site.nodes) {
    for (const source of node.rotor.children.filter((o) => o.isMesh)) {
      if (source.material === node.glow) {
        for (const active of [false, true])
          collect(
            `flow:${node.straight}:${active}`,
            source,
            "flow",
            node,
            active,
            glowMaterials[Number(active)],
          );
      } else
        collect(
          `casting:${node.straight}:${source.material.uuid}`,
          source,
          source.geometry.userData.windPart === "duct" ||
            source.geometry.type === "TubeGeometry"
            ? "duct"
            : "collars",
          node,
        );
    }
    if (node.control) collect("wheel", node.wheel, "wheel", node);
    for (const source of node.body.children.filter(
      (o) => o.isMesh && o !== node.wheel && o.material.isMeshStandardMaterial,
    ))
      collect(
        `body:${source.material.uuid}:${source.geometry.userData.windKey || (source.geometry.parameters ? JSON.stringify(source.geometry.parameters) : source.geometry.uuid)}`,
        source,
        "body",
      );
    node.particles.visible = false;
  }
  for (const fan of site.fans) {
    for (const source of fan.spinner.children.filter((o) => o.isMesh))
      collect(`fan:${source.material.uuid}`, source, "fan");
    for (const source of fan.spinner.parent.children.filter((o) => o.isMesh))
      collect(`fan-frame:${source.material.uuid}`, source, "fan-frame");
  }
  // Conservative bounds include every quarter turn, spinning blade and the
  // sloping support ground. A turn cannot leave a batch's frustum bounds.
  const bounds = new THREE.Box3(
    new THREE.Vector3(-12, Math.min(...site.nodes.map((n) => n.y)) - 1, 6),
    new THREE.Vector3(12, site.airHeight + 2, 24),
  );
  const batches = [];
  const labels = [];
  site.detail.updateWorldMatrix(true, true);
  site.detail.traverse((o) => {
    if (o.userData.windLabel) labels.push(o);
  });
  const inverseLabels = site.detail.matrixWorld.clone().invert();
  const labelParts = labels.map((source) => {
    source.visible = false;
    return source.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverseLabels, source.matrixWorld),
      );
  });
  const labelMesh = new THREE.Mesh(
    mergeGeometries(labelParts),
    labels[0].material,
  );
  labelMesh.name = `Wind ${site.stage}: inscriptions`;
  site.detail.add(labelMesh);
  labelParts.forEach((g) => g.dispose());
  for (const group of groups.values()) {
    const mesh = new THREE.InstancedMesh(
      group.geometry,
      group.material,
      group.drivers.length,
    );
    mesh.name = `Wind ${site.stage}: ${group.kind}`;
    mesh.castShadow = group.castShadow;
    mesh.receiveShadow = group.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.boundingBox = bounds.clone();
    mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    site.detail.add(mesh);
    batches.push({ ...group, mesh, slots: [] });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(site.nodes.length * 18),
      3,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.boundingBox = bounds.clone();
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  const particles = new THREE.Points(
    geometry,
    site.nodes[0].particles.material,
  );
  particles.name = `Wind ${site.stage}: airflow`;
  site.detail.add(particles);
  site.rendering = {
    batches,
    drivers,
    particles,
    labels: { mesh: labelMesh, sources: labels },
    inverse: new THREE.Matrix4(),
    matrix: new THREE.Matrix4(),
    point: new THREE.Vector3(),
  };
  syncWindCourt(site);
  return site.rendering;
}

export function syncWindCourt(site) {
  const rendering = site.rendering;
  if (!rendering) return;
  const { batches, particles, inverse, matrix, point } = rendering;
  site.detail.updateWorldMatrix(true, true);
  inverse.copy(site.detail.matrixWorld).invert();
  for (const batch of batches) {
    let count = 0;
    batch.slots.length = 0;
    for (const driver of batch.drivers) {
      if (driver.active !== null && !!driver.node.flowing !== driver.active)
        continue;
      matrix.multiplyMatrices(inverse, driver.source.matrixWorld);
      batch.mesh.setMatrixAt(count++, matrix);
      batch.slots.push(driver);
    }
    batch.mesh.count = count;
    batch.mesh.visible = count > 0;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
  const target = particles.geometry.attributes.position;
  let count = 0;
  for (const node of site.nodes) {
    node.particles.visible = false;
    if (!node.flowing) continue;
    const source = node.particles.geometry.attributes.position;
    matrix.multiplyMatrices(inverse, node.particles.matrixWorld);
    for (let i = 0; i < source.count; i++) {
      point.fromBufferAttribute(source, i).applyMatrix4(matrix);
      target.setXYZ(count++, point.x, point.y, point.z);
    }
  }
  target.needsUpdate = true;
  particles.geometry.setDrawRange(0, count);
  particles.visible = count > 0;
}
