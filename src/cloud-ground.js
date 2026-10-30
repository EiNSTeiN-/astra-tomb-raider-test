import * as THREE from "three";

export const CLOUD_CONTACT_FADE = 16;

// Store the float32 heights written to the actual terrain vertices. Linear
// texture filtering would replace its two planes with a bilinear saddle.
export function cloudGroundTexture(profile) {
  const { width, step } = profile,
    data = new Float32Array(width * width);
  for (let z = 0; z < width; z++)
    for (let x = 0; x < width; x++)
      data[z * width + x] = profile.height(x * step, z * step);
  const texture = new THREE.DataTexture(
    data,
    width,
    width,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.name = "Cloud contact: rendered terrain heights";
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export const cloudGroundShader = `
uniform sampler2D cloudGround;
uniform vec2 groundGrid;
uniform float contactFade;
float cloudGroundHeight(vec2 world){
  float size=groundGrid.x,step=groundGrid.y;
  vec2 q=clamp(world,vec2(0.),vec2((size-1.)*step));
  vec2 f=q/step,i=min(floor(f),vec2(size-2.)),uv=f-i;
  float a=texture2D(cloudGround,(i+vec2(.5,.5))/size).r;
  float b=texture2D(cloudGround,(i+vec2(1.5,.5))/size).r;
  float c=texture2D(cloudGround,(i+vec2(.5,1.5))/size).r;
  float d=texture2D(cloudGround,(i+vec2(1.5,1.5))/size).r;
  float h=uv.x+uv.y<=1.?a+uv.x*(b-a)+uv.y*(c-a):d+(1.-uv.x)*(c-d)+(1.-uv.y)*(b-d);
  // Continue the fade past the mesh boundary instead of introducing a hard
  // rectangle in the much wider cloud sheet. This is atmosphere, not a floor.
  return h-distance(world,q)*4.;
}
`;
