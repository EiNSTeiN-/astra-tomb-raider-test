import * as THREE from "three";

export const COURIER_SAIL = Object.freeze({
  mast: 6.2,
  pivot: 4.2,
  width: 4,
  height: 2.8,
  top: 1.4,
});
export const courierSailOpen = (trim) => 0.08 + 0.92 * Math.abs(trim);

// The spars retain their length while the foot rises toward the head. All four
// corners remain pinned; billow and the reefed folds vanish at their attachments.
export function courierSailPoint(u, v, trim, time, wind) {
  const open = courierSailOpen(trim),
    edge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  return new THREE.Vector3(
    -3.4 + 4 * u,
    1.4 - 2.8 * v * open,
    edge *
      (open * (0.18 + 0.1 * Math.abs(wind)) * Math.sign(wind || 1) +
        (1 - open) * Math.sin(v * Math.PI * 14) * 0.15) +
      edge * open * 0.025 * Math.sin(time * 4 - u * 7 + v * 11),
  );
}
export function courierSailGeometry() {
  const cols = 40,
    rows = 28,
    g = new THREE.BufferGeometry(),
    p = [],
    uv = [],
    indices = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      p.push(...courierSailPoint(i / cols, j / rows, 1, 0, 1).toArray());
      uv.push(i / cols, 1 - j / rows);
      if (i < cols && j < rows) {
        const a = j * (cols + 1) + i;
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-1.4, 0, 0), 3);
  return g;
}
export function courierSailMaterial() {
  const m = new THREE.MeshStandardMaterial({
    name: "Courier woven sailcloth",
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vCourierCloth;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCourierCloth=uv;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vCourierCloth;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 clothUv=vCourierCloth;
      vec2 threads=clothUv*vec2(1200.,850.);
      float threadFade=1.-smoothstep(.55,2.2,max(fwidth(threads.x),fwidth(threads.y)));
      float weave=sin(threads.x)*sin(threads.y)*threadFade;
      float mottle=sin(clothUv.x*31.+sin(clothUv.y*12.)*2.)*sin(clothUv.y*23.)*.045;
      float damp=pow(1.-clothUv.y,5.)*.14+smoothstep(.68,.97,sin(clothUv.x*13.-clothUv.y*7.)*.5+.5)*.045;
      vec3 linen=vec3(.69,.58,.39)*(1.+mottle-damp+weave*.045);
      float seam=min(abs(fract(clothUv.x*3.+.5)-.5),min(clothUv.x,1.-clothUv.x)*3.);
      float stitch=(1.-smoothstep(.005,.014,seam))*step(.48,fract(clothUv.y*82.));
      float border=1.-smoothstep(.022,.035,min(min(clothUv.x,1.-clothUv.x),min(clothUv.y,1.-clothUv.y)));
      float wing=1.-smoothstep(.008,.018,abs(clothUv.y-.54+abs(clothUv.x-.5)*.48));
      wing*=smoothstep(.18,.24,clothUv.x)*(1.-smoothstep(.76,.82,clothUv.x));
      float feathers=(1.-smoothstep(.008,.015,abs(fract(clothUv.x*15.)-.5)*.14+abs(clothUv.y-.51+abs(clothUv.x-.5)*.48)))*.7;
      feathers*=step(.22,clothUv.x)*step(clothUv.x,.78);
      float ink=max(wing,feathers)*(.42+mottle*2.);
      linen=mix(linen,vec3(.26,.115,.068),max(ink,border*.5));
      diffuseColor.rgb*=linen*(1.-stitch*.35);
      `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
      float clothHeight=weave*.00035+border*.0005;
      vec3 clothDx=dFdx(-vViewPosition),clothDy=dFdy(-vViewPosition);
      vec3 clothR1=cross(clothDy,normal),clothR2=cross(normal,clothDx);
      float clothDet=dot(clothDx,clothR1);
      vec3 clothGradient=sign(clothDet)*(dFdx(clothHeight)*clothR1+dFdy(clothHeight)*clothR2);
      normal=normalize(max(abs(clothDet),1.e-12)*normal-clothGradient);`,
      );
  };
  m.customProgramCacheKey = () => "vesper-courier-cloth-1";
  return m;
}

// Four continuous line strips share one draw. Their end rings remain exactly
// on the eyes while sag changes only the interior; no geometry is reallocated.
export function courierLinesGeometry(
  count = 4,
  segments = 18,
  sides = 7,
  radius = 0.028,
) {
  const g = new THREE.BufferGeometry(),
    vertices = count * (segments + 1) * (sides + 1),
    indices = [];
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertices * 3), 3),
  );
  g.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(vertices * 3), 3),
  );
  g.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array(vertices * 2), 2),
  );
  for (let n = 0; n < count; n++)
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < sides; j++) {
        const a = n * (segments + 1) * (sides + 1) + i * (sides + 1) + j;
        indices.push(
          a,
          a + 1,
          a + sides + 1,
          a + 1,
          a + sides + 2,
          a + sides + 1,
        );
      }
  g.setIndex(indices);
  g.userData.line = { count, segments, sides, radius };
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 8);
  return g;
}
export function updateCourierLines(g, lines) {
  const { segments, sides, radius } = g.userData.line,
    p = g.attributes.position,
    norm = g.attributes.normal,
    uv = g.attributes.uv;
  const center = new THREE.Vector3(),
    tangent = new THREE.Vector3(),
    side = new THREE.Vector3(),
    other = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (const [n, { a, b, sag = 0.06 }] of lines.entries()) {
    const delta = b.clone().sub(a),
      length = delta.length();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      center.copy(a).addScaledVector(delta, t);
      center.y -= 4 * sag * t * (1 - t);
      tangent.copy(delta);
      tangent.y -= 4 * sag * (1 - 2 * t);
      tangent.normalize();
      side
        .set(
          Math.abs(tangent.y) > 0.9 ? 1 : 0,
          Math.abs(tangent.y) > 0.9 ? 0 : 1,
          0,
        )
        .cross(tangent)
        .normalize();
      other.copy(tangent).cross(side).normalize();
      for (let j = 0; j <= sides; j++) {
        const index = n * (segments + 1) * (sides + 1) + i * (sides + 1) + j,
          angle = (j / sides) * Math.PI * 2;
        normal
          .copy(side)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(other, Math.sin(angle));
        p.setXYZ(
          index,
          center.x + normal.x * radius,
          center.y + normal.y * radius,
          center.z + normal.z * radius,
        );
        norm.setXYZ(index, normal.x, normal.y, normal.z);
        uv.setXY(index, (t * length) / (Math.PI * 2 * radius), j / sides);
      }
    }
  }
  p.needsUpdate = norm.needsUpdate = uv.needsUpdate = true;
}
