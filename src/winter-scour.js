// Wind-facing shoulders expose rock; flat shelves and leeward slopes keep the
// existing deposited snow. Both the terrain and its distant continuation use
// this world-space field, with no new geometry, texture or support surface.
export const winterScourDeclarations = /* glsl */ `
#ifndef WINTER_WIND_SCOUR_INCLUDED
#define WINTER_WIND_SCOUR_INCLUDED
float winterWindScour(vec3 position,vec3 surfaceNormal,float broad,float broken) {
  vec3 n=normalize(surfaceNormal);
  float windward=dot(n.xz,normalize(vec2(-.83,.55)));
  float tilted=1.-smoothstep(.965,.999,n.y);
  float exposed=smoothstep(.015,.26,windward);
  float bed=.5+.5*sin(position.y*.36+position.x*.035-position.z*.027+broad*2.);
  float windBreakup=smoothstep(.18,.72,broad*.4+broken*.4+bed*.2);
  return smoothstep(.06,.48,tilted*exposed*(.38+.62*windBreakup));
}
#endif
`;
