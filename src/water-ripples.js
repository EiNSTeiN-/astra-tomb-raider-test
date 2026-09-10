// Short, bent wave fronts keep the surface from reading as parallel bands.
// The phase gradient gives both the normal and its footprint in screen pixels;
// frequencies that the current view cannot resolve fade before they alias.
export const waterRipples = `
float waterBandWeight(vec2 phaseStep){
  return exp(-dot(phaseStep,phaseStep)/24.0)*(1.0-smoothstep(3.14159,6.28318,max(abs(phaseStep.x),abs(phaseStep.y))));
}
vec2 rippleBand(vec2 p,float t,vec2 k,float strength,float speed,float offset,vec2 dx,vec2 dy){
  vec2 bend=vec2(-k.y,k.x)*.19;
  float bendPhase=dot(p,bend)+t*speed*.23+offset*2.13;
  float phase=dot(p,k)-t*speed+offset+.9*sin(bendPhase);
  vec2 gradient=k+.9*cos(bendPhase)*bend;
  float resolved=waterBandWeight(vec2(dot(gradient,dx),dot(gradient,dy)));
  return gradient*(strength/length(k))*cos(phase)*resolved;
}
vec2 waterRipples(vec2 p,float t,vec2 dx,vec2 dy){
  vec2 slope=vec2(0.0);
  slope+=rippleBand(p,t,vec2(.43,.19),.024,.7,.4,dx,dy);
  slope+=rippleBand(p,t,vec2(.17,-.69),.026,1.0,2.1,dx,dy);
  slope+=rippleBand(p,t,vec2(-1.1,.74),.021,1.3,4.7,dx,dy);
  slope+=rippleBand(p,t,vec2(2.3,.8),.019,1.8,1.3,dx,dy);
  slope+=rippleBand(p,t,vec2(-1.7,-3.2),.015,2.6,5.2,dx,dy);
  slope+=rippleBand(p,t,vec2(5.2,-2.6),.012,3.3,3.6,dx,dy);
  slope+=rippleBand(p,t,vec2(6.4,8.5),.010,4.8,.8,dx,dy);
  slope+=rippleBand(p,t,vec2(-15.3,4.6),.006,6.0,5.8,dx,dy);
  return slope;
}
`;
