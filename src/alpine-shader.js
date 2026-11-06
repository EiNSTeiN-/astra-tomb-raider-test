import { winterScourDeclarations } from "./winter-scour.js";

// Shared mountain appearance; the foreland meets this shader at its outer edge.
export const alpineDeclarations = /* glsl */ `#include <common>
        ${winterScourDeclarations}
        uniform vec3 alpineHaze;
        varying vec3 vAlpinePosition, vAlpineNormal;
        varying float vAlpineClip;
        varying float vAlpineDeposit;
        float alpineHash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*.1031);
          q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float alpineNoise(vec2 p) {
          vec2 c=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(alpineHash(c),alpineHash(c+vec2(1.,0.)),f.x),
            mix(alpineHash(c+vec2(0.,1.)),alpineHash(c+vec2(1.)),f.x),f.y);
        }
        vec2 alpineOffset(vec2 cell) {
          return vec2(alpineHash(cell+vec2(71.,11.)),
            alpineHash(cell+vec2(17.,83.)))*7.23;
        }
        vec3 alpineSample(sampler2D surface,vec2 uv) {
          vec2 tiled=mat2(1.,0.,-.577350269,1.154700538)*uv;
          vec2 cell=floor(tiled), f=fract(tiled);
          float upper=step(1.,f.x+f.y);
          vec3 weights=mix(vec3(1.-f.x-f.y,f.y,f.x),
            vec3(f.x+f.y-1.,1.-f.x,1.-f.y),upper);
          weights=max(weights,vec3(0.)); weights=weights*weights*weights;
          weights/=max(.001,weights.x+weights.y+weights.z);
          vec2 a=alpineOffset(cell+vec2(upper));
          vec2 b=alpineOffset(cell+vec2(0.,1.));
          vec2 c=alpineOffset(cell+vec2(1.,0.));
          // Shared edge weights join adjacent patches. Projection derivatives
          // keep mip selection independent of the discrete texture shifts.
          vec2 dx=dFdx(uv), dy=dFdy(uv);
          return textureGrad(surface,uv+a,dx,dy).rgb*weights.x
            +textureGrad(surface,uv+b,dx,dy).rgb*weights.y
            +textureGrad(surface,uv+c,dx,dy).rgb*weights.z;
        }`;

export const alpineDetailDeclarations = /* glsl */ `#include <normalmap_pars_fragment>
        vec3 alpineDetail(vec3 sampleNormal,vec2 uv,vec3 base,float strength) {
          vec3 detail=sampleNormal*2.-1.; detail.xy*=strength;
          return normalize(getTangentFrame(-vViewPosition,base,uv)*detail);
        }`;

export const alpineColorLayer = /* glsl */ `
        vec3 alpineN=normalize(vAlpineNormal);
        vec3 alpineWeights=pow(abs(alpineN),vec3(4.));
        alpineWeights/=max(.001,alpineWeights.x+alpineWeights.y+alpineWeights.z);
        vec3 alpineUv=vAlpinePosition*.07;
        vec3 rock=alpineSample(map,alpineUv.zy)*alpineWeights.x
          +alpineSample(map,alpineUv.xz)*alpineWeights.y
          +alpineSample(map,alpineUv.xy)*alpineWeights.z;
        float broad=alpineNoise(vAlpinePosition.xz*.027);
        float broken=alpineNoise(vAlpinePosition.xz*.19+vAlpinePosition.y*.012);
        // Inclined, gently folded beds remain legible across a whole face.
        // Their edge width follows the pixel footprint at the distant horizon.
        float fold=alpineNoise(vAlpinePosition.xz*.008);
        vec2 bed=vec2(vAlpinePosition.y*.055+fold*1.8+(broad-.5)*.35,
          dot(vAlpinePosition.xz,vec2(.024,.017)));
        float bedding=alpineNoise(bed);
        float bedEdge=max(.09,fwidth(bedding)*1.5);
        float paleBed=smoothstep(.48-bedEdge,.48+bedEdge,bedding);
        float gray=dot(rock,vec3(.2126,.7152,.0722));
        vec3 mineral=mix(vec3(.58,.66,.77),vec3(.84,.79,.70),paleBed*.42);
        vec3 stone=mix(rock,vec3(gray)*mineral,.84)
          *(.34+.17*paleBed)*(.84+.16*broad);
        float snowline=27.+broad*30.;
        // Shallow slopes accumulate; steeper shoulders shed their cover.
        // Previously even moderate slopes saturated to snow, hiding the relief.
        // Broad deposition and fine breakup perturb the edge without turning
        // whole exposed faces into disconnected white noise patches.
        float shelter=alpineN.y+(broad-.5)*.045+(broken-.5)*.012
          +vAlpineDeposit*.18*smoothstep(.65,.94,alpineN.y);
        float snow=smoothstep(.91,.995,shelter)
          *smoothstep(snowline,snowline+32.,vAlpinePosition.y);
        float rangeWindScour=winterWindScour(vAlpinePosition,alpineN,broad,broken);
        snow*=1.-rangeWindScour*.9;
        vec3 snowColor=mix(vec3(.58,.70,.82),vec3(.89,.93,.96),.5+.5*broken);
        diffuseColor.rgb*=mix(stone,snowColor,snow);
        `;

export const alpineNormalLayer = /* glsl */ `float detailStrength=mix(.55,.08,snow);
        normal=normalize(
          alpineDetail(alpineSample(normalMap,alpineUv.zy),alpineUv.zy,normal,detailStrength)*alpineWeights.x
          +alpineDetail(alpineSample(normalMap,alpineUv.xz),alpineUv.xz,normal,detailStrength)*alpineWeights.y
          +alpineDetail(alpineSample(normalMap,alpineUv.xy),alpineUv.xy,normal,detailStrength)*alpineWeights.z);`;

export const alpineHazeLayer = /* glsl */ `
        float airDistance=length(cameraPosition-vAlpinePosition);
        float airDensity=.00065*mix(1.9,.55,smoothstep(0.,220.,vAlpinePosition.y));
        float air=1.-exp(-airDistance*airDensity);
        outgoingLight=mix(outgoingLight,alpineHaze,air);
        #include <opaque_fragment>`;
