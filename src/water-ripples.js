// A spread of wavelengths and directions breaks up repeated crossing crests.
// The signed sinc weights average each wave across the screen pixel, including
// its faint residual beyond the first zero, rather than abruptly dropping it.
export const waterRipples = `
float waterBandWeight(vec2 phaseStep){
  vec2 h=phaseStep*.5;
  return (abs(h.x)<.001?1.:sin(h.x)/h.x)*(abs(h.y)<.001?1.:sin(h.y)/h.y);
}
vec2 rippleBand(vec2 p,float t,vec2 k,float strength,float speed,float offset,vec2 dx,vec2 dy){
  float phase=dot(p,k)-t*speed+offset;
  float resolved=waterBandWeight(vec2(dot(k,dx),dot(k,dy)));
  return normalize(k)*strength*cos(phase)*resolved;
}
vec2 waterRipples(vec2 p,float t,vec2 dx,vec2 dy){
  vec2 slope=vec2(0.0);
  slope+=rippleBand(p,t,vec2(0.21925,0.09762),0.008,0.7430,0.4000,dx,dy);
  slope+=rippleBand(p,t,vec2(0.27684,-0.07938),0.010,0.8139,2.8000,dx,dy);
  slope+=rippleBand(p,t,vec2(0.21277,0.27234),0.012,0.8916,5.1999,dx,dy);
  slope+=rippleBand(p,t,vec2(0.41314,0.03615),0.013,0.9767,1.3167,dx,dy);
  slope+=rippleBand(p,t,vec2(0.39216,-0.30639),0.013,1.0699,3.7167,dx,dy);
  slope+=rippleBand(p,t,vec2(0.48314,0.35102),0.012,1.1720,6.1166,dx,dy);
  slope+=rippleBand(p,t,vec2(0.71489,-0.04999),0.012,1.2838,2.2334,dx,dy);
  slope+=rippleBand(p,t,vec2(0.39042,0.76623),0.011,1.4064,4.6334,dx,dy);
  slope+=rippleBand(p,t,vec2(0.97573,0.33597),0.011,1.5406,0.7501,dx,dy);
  slope+=rippleBand(p,t,vec2(1.08308,-0.60036),0.010,1.6877,3.1501,dx,dy);
  slope+=rippleBand(p,t,vec2(1.08680,1.01346),0.010,1.8487,5.5501,dx,dy);
  slope+=rippleBand(p,t,vec2(1.78295,0.03112),0.009,2.0252,1.6669,dx,dy);
  slope+=rippleBand(p,t,vec2(1.45938,-1.56500),0.009,2.2185,4.0668,dx,dy);
  slope+=rippleBand(p,t,vec2(2.22381,1.28392),0.008,2.4302,0.1836,dx,dy);
  slope+=rippleBand(p,t,vec2(1.15431,2.85703),0.008,2.6622,2.5836,dx,dy);
  slope+=rippleBand(p,t,vec2(3.61688,-0.76879),0.007,2.9163,4.9835,dx,dy);
  slope+=rippleBand(p,t,vec2(4.35570,0.84666),0.007,3.1946,1.1003,dx,dy);
  slope+=rippleBand(p,t,vec2(4.36171,-3.05410),0.006,3.4995,3.5003,dx,dy);
  slope+=rippleBand(p,t,vec2(4.19195,4.82229),0.006,3.8335,5.9002,dx,dy);
  slope+=rippleBand(p,t,vec2(7.10920,2.87230),0.005,4.1994,2.0170,dx,dy);
  slope+=rippleBand(p,t,vec2(9.16601,-0.80192),0.005,4.6003,4.4170,dx,dy);
  slope+=rippleBand(p,t,vec2(5.52061,9.56198),0.004,5.0393,0.5337,dx,dy);
  slope+=rippleBand(p,t,vec2(12.10400,-5.38905),0.004,5.5203,2.9337,dx,dy);
  slope+=rippleBand(p,t,vec2(12.52887,9.78863),0.003,6.0472,5.3337,dx,dy);
  return slope;
}
`;
