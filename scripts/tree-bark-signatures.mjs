import { createHash } from "node:crypto";

export const barkHash = (data) =>
  createHash("sha256").update(data).digest("hex");
const arrayHash = (a) =>
  barkHash(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));

// Compare actual buffer values after GLB round trips, not accessor IDs or offsets.
export function barkRetained(doc, trunkName) {
  const root = doc.getRoot();
  return {
    scenes: root
      .listScenes()
      .map((s) => ({ name: s.getName(), extras: s.getExtras() })),
    nodes: root
      .listNodes()
      .map((n) => ({ name: n.getName(), matrix: n.getWorldMatrix() })),
    textures: root
      .listTextures()
      .map((t) => ({ name: t.getName(), sha256: barkHash(t.getImage()) })),
    geometry: root
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .filter((p) => p.getMaterial().getName() !== trunkName)
      .map((p) => ({
        material: p.getMaterial().getName(),
        indices: arrayHash(p.getIndices().getArray()),
        attributes: Object.fromEntries(
          p
            .listSemantics()
            .sort()
            .map((s) => [s, arrayHash(p.getAttribute(s).getArray())]),
        ),
      })),
  };
}
