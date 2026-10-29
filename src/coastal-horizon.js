import * as THREE from "three";
import { desertNoise as noise } from "./desert-geology.js";

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Positions and radii are relative to the map extent, about its centre. These
// separate islands leave open sea channels; none extends onto playable ground.
export const COASTAL_ISLANDS = [
  { x: -1.55, z: -0.35, rx: 0.53, rz: 0.25, turn: -0.5, height: 128 },
  { x: -1.05, z: -1.6, rx: 0.5, rz: 0.33, turn: 0.4, height: 165 },
  { x: 0.25, z: -1.85, rx: 0.65, rz: 0.25, turn: -0.2, height: 115 },
  { x: 1.5, z: -1.05, rx: 0.48, rz: 0.3, turn: 0.8, height: 190 },
  { x: 1.85, z: 0.55, rx: 0.6, rz: 0.29, turn: -0.9, height: 145 },
  { x: 0.65, z: 1.8, rx: 0.65, rz: 0.33, turn: 0.15, height: 178 },
  { x: -0.5, z: 1.55, rx: 0.22, rz: 0.16, turn: 0.5, height: 62 },
  { x: -1.65, z: 1.25, rx: 0.55, rz: 0.25, turn: -0.8, height: 142 },
];

export function coastalIslandHeight(u, v, island, seed) {
  const warp = (noise(u * 3 + 7, v * 3, seed) - 0.5) * 0.17;
  const radius = Math.hypot(u, v) + warp;
  const shore = Math.pow(Math.max(0, 1 - radius), 0.72);
  const ridge = noise(u * 2.8, v * 1.2, seed + 19);
  const gullies = Math.abs(noise(u * 8, v * 5, seed + 31) * 2 - 1);
  const broken = noise(u * 22, v * 17, seed + 53);
  const terrace = 1 - smooth(0.78, 0.96, radius);
  return (
    -10 +
    shore *
      (island.height * (0.38 + ridge * 0.48) -
        gullies * 16 +
        (broken - 0.5) * 9) +
    terrace * 6
  );
}

export function coastalHorizonGeometry(extent) {
  const positions = [],
    normals = [],
    indices = [];
  const columns = 96,
    rows = 48;
  for (const [i, island] of COASTAL_ISLANDS.entries()) {
    const offset = positions.length / 3,
      seed = 9187 + i * 113;
    const c = Math.cos(island.turn),
      s = Math.sin(island.turn);
    const rx = island.rx * extent,
      rz = island.rz * extent;
    const height = (u, v) => coastalIslandHeight(u, v, island, seed);
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        // Extend beyond the warped shore so every open mesh edge is submerged.
        const u = ((col / columns) * 2 - 1) * 1.12,
          v = ((row / rows) * 2 - 1) * 1.12;
        const x = u * rx,
          z = v * rz;
        positions.push(
          extent * (0.5 + island.x) + x * c - z * s,
          height(u, v),
          extent * (0.5 + island.z) + x * s + z * c,
        );
        const dx = height(u + 0.5 / rx, v) - height(u - 0.5 / rx, v);
        const dz = height(u, v + 0.5 / rz) - height(u, v - 0.5 / rz);
        const n = new THREE.Vector3(
          -dx * c + dz * s,
          1,
          -dx * s - dz * c,
        ).normalize();
        normals.push(n.x, n.y, n.z);
        if (col < columns && row < rows) {
          const a = offset + row * (columns + 1) + col,
            b = a + columns + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildCoastalHorizon(game) {
  const material = new THREE.ShaderMaterial({
    name: "Weathered limestone and coastal scrub",
    uniforms: {
      rock: {
        value:
          game.terrainMeshes[0].material.userData.terrainUniforms.cliffMap
            .value,
      },
      sunDirection: { value: game.sunOffset.clone().normalize() },
      haze: { value: game.scene.fog.color.clone() },
    },
    vertexShader: `varying vec3 vCoast,vCoastNormal;varying float vCoastClip;
      void main(){vCoast=(modelMatrix*vec4(position,1.)).xyz;vCoastNormal=normal;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
        vCoastClip=p.z+p.w;
        float depth=.2+.75*(max(0.,p.w)/(max(0.,p.w)+700.));
        gl_Position=vec4(p.xy,p.w*depth,p.w);}`,
    fragmentShader: `uniform sampler2D rock;uniform vec3 sunDirection,haze;
      varying vec3 vCoast,vCoastNormal;varying float vCoastClip;
      float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){
        // The submerged apron must never draw into the sky, including in a
        // reflection whose oblique depth is replaced by the background interval.
        if(vCoast.y < -2.3 || vCoastClip < 0.) discard;
        vec3 n=normalize(vCoastNormal),w=pow(abs(n),vec3(4.));w/=w.x+w.y+w.z;
        vec3 p=vCoast*.065;
        vec3 grain=texture2D(rock,p.zy).rgb*w.x+texture2D(rock,p.xz).rgb*w.y+texture2D(rock,p.xy).rgb*w.z;
        float broad=noise(vCoast.xz*.021);
        float fissure=noise(vCoast.xz*.19+vCoast.y*.01);
        float phase=vCoast.y*.43+vCoast.x*.008-vCoast.z*.012+broad*9.+fissure*1.4;
        float strata=mix(.91,1.,smoothstep(.05,.3,abs(sin(phase))));
        strata=mix(strata,1.,smoothstep(.5,2.,fwidth(phase)));
        float gray=dot(grain,vec3(.2126,.7152,.0722));
        vec3 color=mix(vec3(.24,.25,.19),vec3(.53,.49,.38),broad);
        color*=mix(.67,1.3,gray)*strata*(.82+fissure*.3);
        float scrub=smoothstep(.58,.9,n.y)*smoothstep(8.,35.,vCoast.y)*smoothstep(.28,.65,fissure);
        color=mix(color,vec3(.12,.17,.075)*(.8+broad*.45),scrub*.87);
        color*=vec3(.28,.35,.4)+vec3(.97,.89,.72)*max(0.,dot(n,sunDirection));
        float air=1.-exp(-distance(cameraPosition,vCoast)*.0005);
        color=mix(color,haze,air);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(
    coastalHorizonGeometry(game.map.size * 7),
    material,
  );
  mesh.name = "Distant coastal islands";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.excludeContact = true;
  // All islands share one draw and depth interval, preserving their mutual
  // occlusion. Restore ordinary depth before rendering the playable world.
  mesh.onAfterRender = (renderer) => renderer.clearDepth();
  game.world.add(mesh);
  game.coastalHorizon = mesh;
  const sea = game.waterMeshes?.find((water) => water.userData.sea);
  if (sea) {
    game.coastalSea = coastalSeaContinuation(game, sea);
    mesh.add(game.coastalSea);
  }
}

// The nearby ocean keeps its excavated bed, shoreline and gameplay bounds.
// This visual continuation fills only pixels beyond that rectangle or the
// camera far plane, using precisely the same waves, fog and reflection uniforms.
function coastalSeaContinuation(game, sea) {
  const geometry = new THREE.PlaneGeometry(24000, 24000, 64, 64);
  geometry.setAttribute(
    "bedHeight",
    new THREE.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count).fill(
        sea.position.y - 15,
      ),
      1,
    ),
  );
  const material = sea.material.clone();
  material.name = "Open sea to the coastal horizon";
  // Blend the sea into the sky before the opaque islands, so water beyond an
  // island cannot paint over its slopes after the background depth is cleared.
  // Custom blending retains the water alpha while using the opaque render list.
  material.transparent = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    sea.material.onBeforeCompile(shader);
    shader.uniforms.coastalFar = { value: game.camera.far };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      #include <project_vertex>
      gl_Position.z=min(gl_Position.z,gl_Position.w*.99999);
    `,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float coastalFar;",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `
        #include <clipping_planes_fragment>
        vec2 seaDelta=abs(vWaterWorld.xz-poolCenter)-poolSize*.5;
        if(vViewPosition.z < coastalFar && max(seaDelta.x,seaDelta.y) < 0.) discard;
      `,
      );
    shader.fragmentShader = "#undef OPAQUE\n" + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => "vesper-coastal-distant-sea-1";
  const ocean = new THREE.Mesh(geometry, material);
  ocean.name = material.name;
  ocean.position.copy(sea.position);
  ocean.rotation.copy(sea.rotation);
  ocean.frustumCulled = false;
  ocean.renderOrder = -20;
  ocean.userData.excludeContact = true;
  return ocean;
}
