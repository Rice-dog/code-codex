export function install(root, document, window, matchMedia) {
/* Seeded 3D meteor event with high-detail sculpted bolide, volumetric hypersonic plasma flame,
   breaking water crown, stratified seabed crater, 3-front offshore refill, and reversible resident flight.
   Engineered with strict numerical bounds to eliminate NaNs, black screens, and flashing. */
(function(root){
'use strict';
const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)},IMPACT=18,REFILL=26,RESTORED=38,DURATION=44;
function impact(t){
  const a=t-IMPACT;
  // Radiant atmospheric bloom capped at 0.65 to eliminate jarring black/white flicker
  const white=clamp(ease((a-.8)/1.5)*(1-ease((a-3.1)/2.2)) * 0.65);
  const envelope=a<0?0:(1-ease(a/3.4))*Math.exp(-a*.65);
  return {white,shakeX:envelope*(Math.sin(a*38)+.4*Math.sin(a*67)),shakeY:envelope*(Math.cos(a*43)-Math.cos(a*19))*.65};
}
function state(t){
  const front=1-ease((t-REFILL)/(RESTORED-REFILL));
  return {
    dry:ease((t-19.7)/.6)*(1-ease((t-REFILL)/(RESTORED-REFILL))),
    front,
    recovery:front, // Compatible with index.html uRecoveryFront
    phase:t<18?'旋转陨石 · 斜向坠入':t<20.3?'猛烈撞击 · 水幕爆起':t<23.3?'蒸汽白幕 · 深坑显露':t<REFILL?'深坑余烟':t<RESTORED?'海水漫回 · 生物加速落下':t<41?'生物落水 · 即刻游动':'浅海恢复宁静'
  };
}
function landing(index){return RESTORED+(index%8===0?0:(index*.61803398875%1)*2.6);}
// Motion resumes at each resident's own water contact, not a shared event cutoff.
function isFlying(t,index){return Number.isFinite(t)&&t>=IMPACT&&t<landing(index);}
function reentry(creature,t,index){
 if(!Number.isFinite(t)||t<IMPACT||t>=DURATION||t<landing(index)){
  creature.meteorLanded=false;
  return false;
 }
 if(creature.meteorLanded)return false;
 creature.meteorLanded=true;
 return true;
}
function recoveryField(u,v){const a=Math.hypot((u-1.3)*.8,(v-.5)*.7),b=Math.hypot((u-.76)*.8,(v-1.35)*.7),c=Math.hypot((u-.72)*.8,(v+.35)*.7);return -Math.log(Math.exp(-a*12)+Math.exp(-b*12)+Math.exp(-c*12))/12+.012*Math.sin(u*21+v*13)+.008*Math.sin(v*31-u*17);}
function recoveryReach(shore){let reach=0;for(let y=0;y<=100;y++)for(let x=0;x<=100;x++)if(shore(x/100,y/100)>-.032)reach=Math.max(reach,recoveryField(x/100,y/100));return reach+.115;}
function flight(base,t,index,aspect){
 const land=landing(index),rise=clamp((t-IMPACT)/2.2),launch=1-(1-rise)*(1-rise),fall=clamp((t-(land-1.75))/1.75),lift=launch*(1-fall*fall),angle=Math.atan2(base.v-.5,(base.u-.55)*aspect),bend=Math.sin(index*2.4),arc=Math.sin(Math.PI*rise)*(1-fall)+Math.sin(Math.PI*fall)*.65;
 return {...base,u:base.u+(Math.cos(angle)*.34*lift+bend*.25*arc)/aspect,v:base.v+(1.5+Math.sin(angle)*.16)*lift,z:base.z+(25-base.z)*lift,roll:(base.roll||0)+bend*(Math.sin(rise*Math.PI)*2.1+Math.sin(fall*Math.PI)*1.3),flip:(base.flip||0)+Math.sin(rise*Math.PI)*1.4-Math.sin(fall*Math.PI)*.9,lift,land};
}
function path(t,aspect,seed){const corner=seed%4,sx=corner%2?1:-1,sy=corner<2?1:-1,q=clamp(t/18),travel=.55*q+.45*q*q;return {x:(1-travel)*sx*(10*aspect+15)*20/45+travel*aspect,y:(1-travel)*sy*25*20/45,z:25-18.3*travel-Math.max(0,t-18)*30};}

function create(T){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(2*Math.atan(10/45)*180/Math.PI,1,.1,150);camera.position.z=45;
 const geometry=new T.SphereGeometry(6.7,180,120),original=geometry.attributes.position.array.slice();
 const rockMat=new T.ShaderMaterial({uniforms:{clock:{value:0},seed:{value:0}},vertexShader:'varying vec3 localP,N,world;void main(){localP=position;N=normalize(mat3(modelMatrix)*normal);world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}',fragmentShader:`
 precision highp float;uniform float clock,seed;varying vec3 localP,N,world;
 float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+1.),f.x),f.y),f.z);}
 void main(){
  vec3 p=localP*.85+seed;
  float grain=n(p*22.),stone=n(p)*.55+n(p*2.2)*.28+n(p*5.5)*.17;
  float strata=abs(sin(p.z*12.+n(p*2.4)*5.5)),chips=n(p*36.);
  vec3 warped=p*1.75+vec3(n(p*1.15),n(p*1.15+7.),n(p*1.15-4.))*.95;
  float fissure=abs(n(warped)-.5),branch=abs(n(warped*3.1)-.5);
  float vein=(1.-smoothstep(.015,.052,fissure))*smoothstep(.30,.62,n(p*.72));
  float core=(1.-smoothstep(.003,.017,fissure))*vein;
  float hair=(1.-smoothstep(.005,.017,branch))*(1.-smoothstep(.06,.17,fissure))*.35;
  // Multi-frequency thermal pulsation with atmospheric friction glow
  float heat=.76+.24*n(p*2.6+vec3(0.,clock*.75,clock*.15));
  vec3 normal=normalize(N+(vec3(n(p*14.+.13),n(p*14.+3.7),n(p*14.+9.1))-.5)*.36);
  float light=.24+.76*max(0.,dot(normal,normalize(vec3(-.45,.78,.95))));
  vec3 c=mix(vec3(.055,.065,.065),vec3(.34,.27,.21),stone)*light*(.75+.40*grain);
  c*=1.-.38*(1.-smoothstep(.018,.065,abs(grain-.45)));
  c*=.75+.18*smoothstep(.07,.23,strata)+.15*chips;
  // Vibrant incandescent molten veins & burning heat emission
  c+=vec3(1.0,.22,.02)*(vein+hair)*heat*1.15+vec3(1.,.72,.22)*core*heat*1.3;
  c+=vec3(.35,.06,.01)*exp(-fissure*16.)*heat;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);}`});
 const rock=new T.Mesh(geometry,rockMat);scene.add(rock);
 const fireUniforms={clock:rockMat.uniforms.clock,seed:rockMat.uniforms.seed,eye:{value:new T.Vector3()}};
 const flameMat=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,side:T.BackSide,uniforms:fireUniforms,vertexShader:'varying vec3 P;void main(){P=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
 precision highp float;uniform float clock,seed;uniform vec3 eye;varying vec3 P;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+1.),f.x),f.y),f.z);}
 float fbm(vec3 p){return n(p)*.56+n(p*2.05+5.)*.29+n(p*4.2-3.)*.15;}
 void main(){
  vec3 rd=normalize(P-eye);
  // Strictly safe inverse direction to eliminate all division-by-zero NaNs
  vec3 safeRd=sign(rd)*max(abs(rd),vec3(0.0001));
  vec3 inv=1./safeRd;
  vec3 lo=(-vec3(10.,10.,9.)-eye)*inv,hi=(vec3(10.,10.,30.)-eye)*inv;
  vec3 nearT=min(lo,hi),farT=max(lo,hi);
  float start=max(0.,max(nearT.x,max(nearT.y,nearT.z)));
  float end=min(farT.x,min(farT.y,farT.z));
  float b=dot(eye,rd),disc=b*b-dot(eye,eye)+6.6*6.6;
  if(disc>0.0001){float hit=-b-sqrt(max(0.0,disc));if(hit>start)end=min(end,hit);}
  if(end<=start+0.001)discard;
  float stepSize=(end-start)/44.;
  vec4 sum=vec4(0.);
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.54);
  for(int i=0;i<44;i++){
    vec3 q=eye+rd*(start+(float(i)+jitter)*stepSize);
    float z=max(0.,q.z);
    vec3 flow=q*vec3(.72,.72,.28)+vec3(seed,seed*.31,-clock*3.6);
    float turb=fbm(flow+vec3(sin(q.z*.28-clock*1.6),cos(q.z*.24-clock*1.3),0.)*.62);
    float tongues=(turb-.46)*4.8;
    // Hypersonic detached bow shock sheath wrapping closely around bolide apex
    float sheath=exp(-pow((length(q)-6.9-tongues)/.58,2.))*(1.-smoothstep(2.5,10.5,q.z));
    float radius=mix(6.4,.32,clamp(z/28.,0.,1.));
    vec2 curl=vec2(sin(z*.36-clock*2.1),cos(z*.31-clock*1.8))*z*.068;
    // Swirling aerodynamic fiery tail
    float tail=(1.-smoothstep(radius*.32,radius+1.1,length(q.xy-curl)))*smoothstep(1.,7.,q.z)*(1.-smoothstep(19.,30.,q.z));
    float shape=max(sheath,tail*.70);
    float density=shape*smoothstep(.47,.72,turb)*1.02;
    float hot=clamp(shape*.68+turb*.72-z*.016,0.,1.);
    // Multi-tier incandescent plasma color gradation: white-blue core -> gold -> fiery red
    vec3 col=mix(vec3(.76,.08,.01),vec3(1.,.46,.06),smoothstep(.22,.68,hot));
    col=mix(col,vec3(1.,.88,.52),smoothstep(.69,.94,hot));
    col=mix(col,vec3(.92,.98,1.0),smoothstep(.94,1.0,hot));
    float alpha=1.-exp(-density*stepSize);
    sum.rgb+=(1.-sum.a)*alpha*col;
    sum.a+=(1.-sum.a)*alpha;
    if(sum.a>.97)break;
  }
  if(sum.a<.005)discard;
  gl_FragColor=vec4(clamp(sum.rgb/max(sum.a,.001),0.,1.),clamp(sum.a,0.,1.));}`});
 const flameGeometry=new T.BoxGeometry(20,20,39);flameGeometry.translate(0,0,10.5);
 const flameShell=new T.Mesh(flameGeometry,flameMat);flameShell.frustumCulled=false;flameShell.renderOrder=2;scene.add(flameShell);
 const count=2800,positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),alphas=new Float32Array(count),g=new T.BufferGeometry();
 for(const [name,array,size] of [['position',positions,3],['tint',colors,3],['size',sizes,1],['alpha',alphas,1]])g.setAttribute(name,new T.BufferAttribute(array,size));
 const pm=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{viewport:{value:900}},vertexShader:'attribute vec3 tint;attribute float size,alpha;uniform float viewport;varying vec3 color;varying float opacity;void main(){color=tint;opacity=alpha;vec4 v=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(size*viewport/max(1.,-v.z),1.,130.);}',fragmentShader:'varying vec3 color;varying float opacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=pow(1.-d*d,2.)*opacity;gl_FragColor=vec4(color,clamp(a,0.,1.));}'});
 const particles=new T.Points(g,pm);particles.frustumCulled=false;scene.add(particles);
 const crownUniforms={age:{value:0},seed:rockMat.uniforms.seed,center:{value:new T.Vector2()}};
 const crownMat=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,uniforms:crownUniforms,vertexShader:`
 uniform float age,seed;uniform vec2 center;varying vec2 tex;varying float height;
 void main(){tex=uv;float angle=uv.x*6.2831853,a=max(0.,age),crest=1.+.16*sin(angle*13.+seed)+.08*sin(angle*29.-seed);
 float radius=5.8+a*(5.5+uv.y*3.8)+sin(angle*17.+seed)*.38*uv.y;
 height=max(0.,(21.*a-8.*a*a))*uv.y*crest;
 vec3 p=vec3(center+vec2(cos(angle),sin(angle))*radius,height);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`
 uniform float age,seed;varying vec2 tex;varying float height;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){vec2 flow=vec2(tex.x*210.,tex.y*19.-age*4.);float lace=n(flow+n(flow*.31)*2.)*.7+n(flow*2.3)*.3;float tear=smoothstep(.20,.55,lace+.45*(1.-tex.y)-age*.07);
 float rim=smoothstep(.45,.98,tex.y),fade=smoothstep(0.,.08,age)*(1.-smoothstep(1.6,2.6,age));
 vec3 c=mix(vec3(.12,.68,.75),vec3(.94,.99,1.),rim*.7+lace*.3);gl_FragColor=vec4(c,clamp(tear*fade*(.47+rim*.48),0.,1.));}`});
 const crown=new T.Mesh(new T.PlaneGeometry(1,1,192,12),crownMat);crown.frustumCulled=false;scene.add(crown);
 const overlayScene=new T.Scene(),overlayCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),u={age:{value:0},ratio:{value:1},seed:{value:0}};
 const overlay=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:u,vertexShader:'varying vec2 screenUV;void main(){screenUV=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 precision highp float;varying vec2 screenUV;uniform float age,ratio,seed;
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec4 h=fract(sin(vec4(dot(i,vec2(127,311)),dot(i+vec2(1,0),vec2(127,311)),dot(i+vec2(0,1),vec2(127,311)),dot(i+1.,vec2(127,311)))+seed)*43758.5);return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
 void main(){
  vec2 p=(screenUV-vec2(.55,.5))*vec2(ratio,1.);float d=length(p),a=age-18.;
  if(a<0.){
    // Elegant warm atmospheric arrival glow instead of dark muddy circle
    float pre=exp(-d*d/.38)*smoothstep(10.,18.,age)*.14;
    gl_FragColor=vec4(vec3(1.0,.85,.62),clamp(pre,0.,1.));
    return;
  }
  float safeA=max(0.,a);
  float radius=.30+safeA*.42,warp=(n(p*19.+seed)-.5)*.025;
  // Strictly positive denominators to eliminate all potential shader divide-by-zeros
  float ring=exp(-pow((d+warp-radius)/(0.015+0.008*safeA),2.));
  float backwash=exp(-pow((d+warp-radius+.048)/(0.038+0.009*safeA),2.))*.35;
  vec2 foamUV=mat2(.8,.6,-.6,.8)*p*110.+vec2(n(p*17.),n(p*19.+3.))*4.;
  float cells=n(foamUV-safeA*1.3)*.6+n(foamUV*2.13+safeA)*.4,foam=(ring+backwash)*smoothstep(.30,.67,cells);
  float flash=exp(-safeA*8.);vec2 adv=p*7.+vec2(safeA*.38,-safeA*.51);adv+=vec2(n(adv+seed),n(adv+8.))*2.1;
  float cloud=n(adv)*.57+n(adv*2.2)*.29+n(adv*4.5)*.14;
  float steam=(.48+.52*smoothstep(.20,.70,cloud))*exp(-d*d/max(.12,safeA*.65))*smoothstep(0.,.15,safeA)*(1.-smoothstep(3.7,7.,safeA));
  float contact=(1.-smoothstep(.30+safeA*.18,.43+safeA*.27,d))*smoothstep(0.,.10,safeA)*(1.-smoothstep(.9,2.7,safeA));
  vec3 c=mix(vec3(.78,.91,.92),vec3(.96,.99,.98),clamp(foam+cloud*.6,0.,1.));c=mix(c,vec3(1.,.85,.59),flash);
  float alpha=clamp(flash*.45+foam*.95*exp(-safeA*.2)+steam*.84+contact*.98,0.,.98);
  gl_FragColor=vec4(clamp(c,0.,1.),clamp(alpha,0.,1.));}`});
 overlayScene.add(new T.Mesh(new T.PlaneGeometry(2,2),overlay));
 const whiteScene=new T.Scene(),whiteMat=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{opacity:{value:0}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform float opacity;void main(){gl_FragColor=vec4(1.,1.,1.,clamp(opacity,0.,1.));}'});
 whiteScene.add(new T.Mesh(new T.PlaneGeometry(2,2),whiteMat));
 let lastSeed=-1,values=[];
 function reset(seed){
  let v=seed>>>0;const rng=()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};
  const pits=Array.from({length:72},(_,i)=>{const d=new T.Vector3(rng()-.5,rng()-.5,rng()-.5).normalize();return {d,r:i<26?.12+rng()*.24:.032+rng()*.09,depth:i<26?.13+rng()*.24:.024+rng()*.065};});
  const attr=geometry.attributes.position;
  for(let i=0;i<attr.count;i++){
    const x=original[i*3]/6.7,y=original[i*3+1]/6.7,z=original[i*3+2]/6.7;
    // Aerodynamic regmaglypts (supersonic ablation scoops) and multi-frequency craters
    let radius=1+.058*Math.sin(x*9+seed)*Math.cos(y*8-z*7)+.038*Math.sin(y*17+z*12)+.014*Math.sin(x*51+y*22+seed)*Math.sin(z*45-y*35)+.009*Math.sin(y*83+x*65)*Math.sin(z*59);
    for(const p of pits){
      const d=Math.hypot(x-p.d.x,y-p.d.y,z-p.d.z)/p.r;
      radius-=p.depth*Math.exp(-d*d*3.2);
      radius+=.038*Math.exp(-Math.pow((d-1)*6,2));
    }
    attr.setXYZ(i,x*6.7*radius,y*6.7*radius,z*6.7*radius);
  }
  attr.needsUpdate=true;geometry.computeVertexNormals();
  values=Array.from({length:count},()=>[rng(),rng(),rng(),rng(),rng()]);rockMat.uniforms.seed.value=(seed%10000)*.013;u.seed.value=seed%1000;lastSeed=seed;
 }
 const bufferSize=new T.Vector2();
 return {render(renderer,t,aspect,seed=1,particleScale=1){
  if(t<0||t>26)return;if(seed!==lastSeed)reset(seed);
  camera.aspect=aspect;camera.updateProjectionMatrix();const p=path(t,aspect,seed),back=path(t-.08,aspect,seed),direction=new T.Vector3(back.x-p.x,back.y-p.y,back.z-p.z).normalize();
  rock.position.set(p.x,p.y,p.z);rock.rotation.set(t*.23+seed,t*.31,t*.12);rock.visible=t<18.18;flameShell.visible=t<18;rockMat.uniforms.clock.value=t;
  flameShell.position.copy(rock.position);flameShell.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);flameShell.updateMatrixWorld(true);fireUniforms.eye.value.copy(camera.position);flameShell.worldToLocal(fireUniforms.eye.value);
  crown.visible=t>=18&&t<20.6;crownUniforms.age.value=t-18;crownUniforms.center.value.set(aspect,0);
  for(let i=0;i<count;i++){const [r,b,c,d,e]=values[i];let x,y,z,size,alpha,color;
   if(t<18){const life=(t*(.7+b*.5)+r)%1,theta=c*Math.PI*2,len=life*(13+d*13),rad=Math.sqrt(Math.max(0.0001,1-Math.pow(2*b-1,2)))*7.2;x=p.x+Math.cos(theta)*rad+direction.x*len+Math.sin(life*7.+c*20.)*life*.7;y=p.y+Math.sin(theta)*rad+direction.y*len+Math.cos(life*6.+c*20.)*life*.7;z=p.z+(2*b-1)*7.2+direction.z*len;size=.036+e*.11;alpha=i<260?(1-life)*.82:0;color=[1.,.48+(1-life)*.28,.14];}
   else{const age=t-18,delay=r*.65,life=Math.max(0,age-delay),theta=b*Math.PI*2,speed=4+c*14,mist=i%3===0;const radius=4.5+speed*life;x=aspect+Math.cos(theta)*radius+Math.sin(life*2+c*12)*life*.4;y=Math.sin(theta)*radius+Math.cos(life*2+r*12)*life*.4;z=(mist?8:19+d*12)*life-(mist?1.6:7.8)*life*life;size=mist?1.4+life*2.2:.12+e*.38;alpha=age<delay||z<0?0:clamp(1-life/(mist?5:4))*(mist?.23:.95);color=mist?[.88,.93,.91]:i%11===0?[.38,.29,.22]:[.88,.97,.96];}
   positions.set([x,y,z],i*3);colors.set(color,i*3);sizes[i]=size;alphas[i]=alpha;
  }
  for(const a of Object.values(g.attributes))a.needsUpdate=true;renderer.getDrawingBufferSize(bufferSize);pm.uniforms.viewport.value=bufferSize.y;u.age.value=t;u.ratio.value=aspect;
  const clear=renderer.autoClear;renderer.autoClear=false;
  try {
    if(t<IMPACT)renderer.render(overlayScene,overlayCamera);
    renderer.clearDepth();
    renderer.render(scene,camera);
    if(t>=IMPACT)renderer.render(overlayScene,overlayCamera);
    whiteMat.uniforms.opacity.value=impact(t).white;
    if(whiteMat.uniforms.opacity.value>0.001)renderer.render(whiteScene,overlayCamera);
  } finally {
    renderer.autoClear=clear;
  }
 },stats:()=>({seed:lastSeed,vertices:geometry.attributes.position.count,particles:count})};
}
root.OceanMeteor={state,impact,flight,create,path,landing,isFlying,reentry,recoveryField,recoveryReach,IMPACT,REFILL,RESTORED,DURATION};
})(root);

}
