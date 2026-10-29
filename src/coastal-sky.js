import { Sky } from "three/addons/objects/Sky.js";

// Low marine cloud banks with stretched upper wisps. The analytic daylight
// remains underneath, including its sun and horizon scattering. The same sky
// is intended for the visible dome and the chapter's reflection capture.
const clouds = `
uniform float time;
float coastHash(vec2 p) {
  p=fract(p*vec2(.1031,.1030));
  p+=dot(p,p.yx+33.33);
  return fract((p.x+p.y)*p.x);
}
float coastNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(coastHash(i),coastHash(i+vec2(1.,0.)),f.x),
             mix(coastHash(i+vec2(0.,1.)),coastHash(i+vec2(1.,1.)),f.x),f.y);
}
float coastCloud(vec2 p) {
  float value=0.,weight=.5;
  for(int octave=0;octave<4;octave++) {
    value+=coastNoise(p)*weight;
    p=mat2(.8,.6,-.6,.8)*p*2.03+vec2(17.7,9.2);
    weight*=.5;
  }
  return value;
}
vec3 coastalCloudColor(vec3 clearSky,vec3 direction,vec3 sun) {
  float height=max(0.,direction.y);
  vec2 wind=vec2(time*.00045,time*.00012);
  vec2 p=direction.xz/(height+.19)*1.45+wind;
  vec2 warp=vec2(coastNoise(p*.65),coastNoise(p*.65+19.))*1.1;
  float density=coastCloud(p+warp);
  float cover=smoothstep(.43,.69,density);
  cover*=smoothstep(.015,.11,height)*(1.-smoothstep(.72,.96,height)*.45);
  vec2 lightDirection=sun.xz/max(length(sun.xz),.001);
  float neighbour=coastCloud(p+warp+lightDirection*.14);
  float light=clamp(.56+(density-neighbour)*5.,0.,1.);
  vec3 body=mix(vec3(.24,.34,.38),vec3(.85,.86,.79),light);
  float haze=1.-smoothstep(.025,.24,height);
  body=mix(body,clearSky,haze*.7);
  vec3 color=mix(clearSky,body,cover*.86);
  float wisps=smoothstep(.58,.76,coastCloud(p*vec2(.38,3.7)+37.));
  color=mix(color,vec3(.68,.76,.79),wisps*.15*smoothstep(.15,.4,height));
  return color;
}
`;

export function coastalSky(sunPosition) {
  const sky = new Sky();
  sky.name = "Coastal daylight and marine clouds";
  sky.scale.setScalar(4000);
  sky.frustumCulled = false;
  const { material } = sky;
  material.uniforms.turbidity.value = 2.6;
  material.uniforms.rayleigh.value = 2.5;
  material.uniforms.mieCoefficient.value = 0.004;
  material.uniforms.mieDirectionalG.value = 0.78;
  material.uniforms.sunPosition.value.copy(sunPosition).normalize();
  material.uniforms.time = { value: 0 };
  const output = "gl_FragColor = vec4( retColor, 1.0 );";
  if (!material.fragmentShader.includes(output))
    throw new Error("The daylight shader no longer exposes its radiance output");
  material.fragmentShader = clouds + material.fragmentShader.replace(
    output,
    `gl_FragColor = vec4(coastalCloudColor(retColor*.38,
      normalize(vWorldPosition-cameraPosition),vSunDirection),1.0);`,
  );
  return sky;
}
