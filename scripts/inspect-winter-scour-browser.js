// Development-only GPU checks on the actual shared snow-deposition field.
import * as THREE from "three";
import { winterScourDeclarations } from "../src/winter-scour.js";

export function inspectWinterScour(game) {
  const renderer = game.renderer,
    previous = renderer.getRenderTarget(),
    viewport = renderer.getViewport(new THREE.Vector4()),
    cases = [],
    point = new THREE.Vector3(123, 77, 251),
    wind = new THREE.Vector2(-0.83, 0.55).normalize();
  for (const values of [
    [0, 0],
    [0.5, 0.5],
    [1, 1],
  ])
    for (const [kind, normal] of [
      ["flat", [0, 1, 0]],
      ["leeward", [0.65, 0.6, -0.46]],
      ["windward", [-0.65, 0.6, 0.46]],
    ])
      cases.push({ kind, normal: new THREE.Vector3(...normal), values });
  for (let i = 0; i <= 32; i++) {
    const y = 0.9 + (i / 32) * 0.1,
      horizontal = Math.sqrt(Math.max(0, 1 - y * y));
    cases.push({
      kind: "shelf-transition",
      normal: new THREE.Vector3(wind.x * horizontal, y, wind.y * horizontal),
      values: [0.4, 0.6],
    });
  }
  const target = new THREE.WebGLRenderTarget(cases.length, 1, {
      type: THREE.FloatType,
    }),
    geometry = new THREE.PlaneGeometry(2, 2),
    scene = new THREE.Scene(),
    camera = new THREE.Camera(),
    placeholder = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(geometry, placeholder),
    materials = [];
  mesh.frustumCulled = false;
  scene.add(mesh);
  const reports = [];
  try {
    for (const reversed of [false, true]) {
      const source = reversed
          ? winterScourDeclarations.replace("vec2(-.83,.55)", "vec2(.83,-.55)")
          : winterScourDeclarations,
        material = new THREE.ShaderMaterial({
          uniforms: {
            probePoint: { value: point },
            probeNormals: { value: cases.map((c) => c.normal) },
            probeValues: {
              value: cases.map((c) => new THREE.Vector2(...c.values)),
            },
          },
          vertexShader: "void main(){gl_Position=vec4(position.xy,0.,1.);}",
          fragmentShader: `${source}
            uniform vec3 probePoint,probeNormals[${cases.length}];
            uniform vec2 probeValues[${cases.length}];
            void main(){
              int i=int(gl_FragCoord.x);
              float value=winterWindScour(probePoint,probeNormals[i],probeValues[i].x,probeValues[i].y);
              gl_FragColor=vec4(value,value,value,1.);
            }`,
        });
      materials.push(material);
      mesh.material = material;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      const values = new Float32Array(cases.length * 4);
      renderer.readRenderTargetPixels(target, 0, 0, cases.length, 1, values);
      const gl = renderer.getContext(),
        error = gl.getError(),
        linked = renderer.info.programs.every((p) =>
          gl.getProgramParameter(p.program, gl.LINK_STATUS),
        );
      if (error || !linked) throw Error("Snow field GPU check failed");
      const samples = cases.map((c, i) => ({
          kind: c.kind,
          value: values[i * 4],
        })),
        failures = samples.filter(
          (s) =>
            !Number.isFinite(s.value) ||
            s.value < 0 ||
            s.value > 1 ||
            (["flat", "leeward"].includes(s.kind) && s.value > 1e-6) ||
            (s.kind === "windward" && s.value < 0.2),
        ),
        transition = samples.filter((s) => s.kind === "shelf-transition");
      const monotonic = transition.every(
        (s, i) => !i || s.value <= transition[i - 1].value + 1e-6,
      );
      reports.push({ reversed, samples, failures, monotonic, linked, error });
    }
    if (reports[0].failures.length || !reports[0].monotonic)
      throw Error("Wind snow-cover invariant failed");
    if (reports[1].failures.length < 6)
      throw Error("Reversed-wind control was not detected");
    return { cases: cases.length, reports };
  } finally {
    for (const material of materials) material.dispose();
    geometry.dispose();
    target.dispose();
    placeholder.dispose();
    scene.clear();
    renderer.setRenderTarget(previous);
    renderer.setViewport(viewport);
  }
}
