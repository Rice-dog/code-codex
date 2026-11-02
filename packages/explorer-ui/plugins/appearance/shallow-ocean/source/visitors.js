export function install(root, document, window, matchMedia) {
/* Procedural Ocean Visitors (Dolphins, Penguins on Ice Floes, SpongeBob & Patrick Duo)
   Stylized to match Ocean Shallows 2's crystal-clear water, Voronoi caustics, and wet specular lighting. */
(function(root){
'use strict';
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const ease=x=>{x=clamp(x);return x*x*(3-2*x)},span=(t,a,b)=>ease((t-a)/(b-a));
const soft=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
function motionSegment(t,duration,p0,v0,a0,p1,v1,a1){
 const q=clamp(t/duration),c1=v0*duration,c2=a0*duration*duration/2,D=p1-p0-c1-c2,V=v1*duration-c1-2*c2,A=a1*duration*duration-2*c2;
 return p0+c1*q+c2*q*q+(10*D-4*V+A/2)*q**3+(-15*D+7*V-A)*q**4+(6*D-3*V+A/2)*q**5;
}
function dolphinLeap(time,start){const t=time-start,launch=.68,land=3.4,velocity=4.8,gravity=2*velocity/(land-launch);let height;
 if(t<0)height=motionSegment(t+.65,.65,0,0,0,-.32,0,0);
 else if(t<launch)height=motionSegment(t,launch,-.32,0,0,.88,velocity,-gravity);
 else if(t<land){const flight=t-launch;height=.88+velocity*flight-gravity*flight*flight/2;}
 else if(t<4.15)height=motionSegment(t-land,4.15-land,.88,-velocity,-gravity,-.65,0,0);
 else height=motionSegment(t-4.15,1.15,-.65,0,0,0,0,0);
 return {height,advance:.95*soft((t+.15)/3.7)};
}
function dolphinGait(speed,seed,time,response=0){
 const pace=clamp(speed/3.3),pulse=.5+.5*Math.sin(time*(.83+.035*Math.sin(seed))+seed);
 const glide=(1-soft((pulse-.25)/.65))*(1-pace)**2*.24;
 return {effort:clamp(.16+pace*.94-glide+response*.12),beatHz:.45+pace*1.95-glide*.4};
}
const names={dolphin:'好奇的海豚',duo:'今天什么也不干'};
function create(type,rng,point,ratio,coast=()=>1){
 if(!Object.hasOwn(names,type))throw new RangeError('Unknown visitor event: '+type);
 const home=point(.61+rng()*.09,.48+rng()*.12);
 const story={type,age:0,duration:{dolphin:50,duo:44}[type]||44,home,ratio,phase:'',marks:[],reaction:0,cooldown:0,
  actor:{u:1.2,v:home.v,z:-.65,heading:-Math.PI/2,pitch:0,roll:0,visible:true},seed:rng()*TAU,raft:1};
 if(type==='dolphin'){
  const shift=(home.v-.54)*.30;story.entryV=.32+rng()*.34;story.exitV=.20+rng()*.60;
  story.route=[[0,1.26,story.entryV],[4,.82,.49+shift],[8,.64,.76+shift],[12,.37,.66+shift],[16,.33,.34+shift],[20,.58,.24+shift],[24,.82,.39+shift],[29,.69,.66+shift],[35,.53,.46+shift],[40,.70,.30+shift],[44,.85,mix(.43,story.exitV,.35)],[48,1.28,story.exitV]].map(([t,u,v],i,all)=>({t,...(i===0||i===all.length-1?{u,v}:point(u,v))}));
  story.curve=dolphinCurve(story.route);story.splashes=[];
  story.batchCount=4+Math.min(3,Math.floor(rng()*4));story.batches=[];story.actors=[];
  for(let batch=0;batch<story.batchCount;batch++){
   const count=2+Math.min(3,Math.floor(rng()*4)),startAt=batch*15,drift=(rng()-.5)*.055;
   story.batches.push({count,startAt});
   for(let i=0;i<count;i++){const seed=story.seed+batch*2.7+i*1.9;story.actors.push({batch,startAt,drift,u:1.26,v:story.entryV,z:-.8,heading:-Math.PI/2,pitch:0,roll:0,visible:false,lag:i*.62,side:[-.60,.68,-.92,.94,0][i],seed,scale:.91+rng()*.12,rose:rng(),stroke:seed,effort:.5,turn:0,bend:0,reaction:0,cooldown:0,leapAt:startAt+22+i*4.6,air:0});}
  }
  story.duration=50+(story.batchCount-1)*15;
  for(const a of story.actors){a.heading=dolphinSample(story,0,ratio,a).heading;a.flex=0;
   a.contacts={};for(const [name,left,right] of [['out',.1,1.4],['in',2.1,4.1]]){let lo=a.leapAt+left,hi=a.leapAt+right;
    for(let j=0;j<28;j++){const mid=(lo+hi)/2,p=dolphinSample(story,mid,ratio,a),z=dolphinNoseHeight(p,a);if((name==='out'&&z<0)||(name==='in'&&z>0))lo=mid;else hi=mid;}a.contacts[name]=(lo+hi)/2;
   }
  }
  story.actor=story.actors[0];
 }
 if(type==='duo')root.OceanDriftDuo.create(story,rng,coast);
 step(story,0);return story;
}

function penguinIdle(a,t){
 const phase=(t+a.seed*1.6+(a.index||0)*1.13)%12.8,pulse=(at,length)=>{const q=(phase-at)/length;return q>0&&q<1?Math.sin(q*Math.PI)**2:0;};
 const arrival=(at,length)=>{const local=t-at,q=(local%2.8)/length;return t<10&&local>0&&q<1?Math.sin(q*Math.PI)**2:0;};
 const hop1=Math.max(pulse(2.1,.60),arrival(.6+(a.index||0)*.22,.68)),hop2=Math.max(pulse(2.92,.68),arrival(1.65+(a.index||0)*.18,.64)),preen=pulse(5.1,2.1),shuffle=pulse(8.1,1.9),flap=pulse(10.6,1.15);
 return {hop:(hop1*.24+hop2*.17),preen,shuffle,flap,turn:Math.sin(t*.78+a.seed)*.70+Math.sin(t*.31+(a.index||0))*.25,
  headTurn:Math.sin(t*1.35+a.seed)*.48+Math.sin(t*2.1+a.seed*.7)*.12,side:Math.sin((phase-8.1)/1.9*TAU)*shuffle*.105,
  bounce:hop1+hop2,rock:Math.sin(t*3.2+a.seed)*.065,phase};
}

function penguinGait(a,t){
 let crouch=0,landing=0,anticipation=0;
 for(const {start,duration} of a.hops||[{start:a.hop1,duration:1.25},{start:a.hop2,duration:1.25},{start:a.diveAt,duration:1.4}]){
  crouch=Math.max(crouch,span(t,start-.55,start-.14)*(1-span(t,start-.14,start+.14)));
  const impact=t-start-duration;if(impact>=0&&impact<.5)landing=Math.max(landing,Math.sin(Math.PI*impact/.5)*Math.exp(-impact*4));
  anticipation=Math.max(anticipation,span(t,start-.8,start-.18)*(1-span(t,start+.05,start+.4)));
 }
 const speed=a.speed||0,swim=a.swimBlend??0,clock=a.stroke??(t*(5.6+clamp(speed/3)*3)+a.seed),idle=penguinIdle(a,t);
 const glide=.5+.5*Math.sin(t*1.3+a.seed),stroke=Math.sin(clock)*(.38+.23*glide);
 return {crouch,landing,anticipation,stroke,clock,swim,idle,breath:Math.sin(t*1.8+a.seed)*.012};
}
function stepPenguins(s,dt,splash){const t=s.age,done=root.OceanPenguinIce.step(s,dt,penguinIdle,splash);
 for(const a of s.actors){
  a.reaction=Math.max(0,a.reaction-dt);a.cooldown=Math.max(0,a.cooldown-dt);a.stroke=(a.stroke??a.seed)+dt*(5.6+clamp(a.speed/3)*3);const idle=penguinIdle(a,t);
  a.idleAction=!a.idleWeight?'travel':idle.hop>.01?'small-hop':idle.preen>.1?'preen':idle.shuffle>.1?'shuffle':idle.flap>.1?'flipper-stretch':'look-around';
  const delta=Math.atan2(Math.sin(a.desiredHeading-a.heading),Math.cos(a.desiredHeading-a.heading)),blend=dt===0?1:1-Math.exp(-dt*6);
  a.heading+=delta*blend;a.bank=clamp(delta,-.6,.6);
  a.screenU=a.u+(a.lift||0)*.004/s.ratio;a.screenV=a.v+(a.lift||0)*.027;
  const gait=penguinGait(a,t),diving=a.swimBlend,desiredPitch=a.swimming?Math.PI/2+Math.sin(gait.clock-.4)*.065:a.jumping?Math.sin(a.progress*Math.PI)*.45*(1-diving)+diving*Math.PI/2:.26+gait.anticipation*.16+idle.preen*.20*(a.idleWeight||0);
  a.pitch+=(desiredPitch-a.pitch)*blend;a.roll+=(Math.sin(t*2+a.seed)*.035*(1-diving)-a.bank*diving*.35-a.roll)*blend;
 }return done;
}
function dolphinCurve(route){
 const result={};for(const key of ['u','v']){const n=route.length,diag=Array(n).fill(0),rhs=Array(n).fill(0),upper=Array(n).fill(0),second=Array(n).fill(0);diag[0]=diag[n-1]=1;
  for(let i=1;i<n-1;i++){const left=route[i].t-route[i-1].t,right=route[i+1].t-route[i].t,lower=left/diag[i-1];diag[i]=2*(left+right)-lower*upper[i-1];upper[i]=right;rhs[i]=6*((route[i+1][key]-route[i][key])/right-(route[i][key]-route[i-1][key])/left)-lower*rhs[i-1];}
  for(let i=n-2;i>=0;i--)second[i]=(rhs[i]-upper[i]*second[i+1])/diag[i];result[key]=second;
 }return result;
}
function dolphinPath(s,time,aspect,member){
 const leap=dolphinLeap(time,member.leapAt),localTime=time-member.startAt-member.lag+leap.advance,r=s.route,t=clamp(localTime,0,48);let i=0;while(i<r.length-2&&t>r[i+1].t)i++;
 const a=r[i],b=r[i+1],h=b.t-a.t,A=(b.t-t)/h,B=(t-a.t)/h,p={};
 for(const key of ['u','v']){const m=s.curve[key][i],n=s.curve[key][i+1];p[key]=A*a[key]+B*b[key]+((A*A*A-A)*m+(B*B*B-B)*n)*h*h/6;p['d'+key]=(b[key]-a[key])/h+((1-3*A*A)*m+(3*B*B-1)*n)*h/6;}
 const outside=localTime-t;p.u+=p.du*outside;p.v+=p.dv*outside;
 const formation=(time-member.startAt)*.055;p.u+=Math.sin(formation)*member.side/(20*aspect);p.v+=Math.cos(formation)*member.side/20+member.drift*Math.sin(Math.PI*clamp(localTime/48))**2;
 p.z=-.88+.07*Math.sin(time*.48+member.seed)+leap.height;
 return p;
}
function dolphinSample(s,t,aspect,member){
 const p=dolphinPath(s,t,aspect,member),before=dolphinPath(s,t-.015,aspect,member),after=dolphinPath(s,t+.015,aspect,member);
 const interval=.03,dx=(after.u-before.u)*20*aspect,dy=(after.v-before.v)*20;
 const distance=Math.hypot(dx,dy);return {...p,heading:distance>.00001?Math.atan2(dx,dy):Math.atan2(p.du*aspect,p.dv),speed:distance/interval,pitch:distance>.00001?Math.atan2(after.z-before.z,distance):0};
}
function dolphinNoseHeight(p,member){return p.z+member.scale*(1.25*Math.sin(p.pitch)-.07*Math.cos(p.pitch));}
function stepDolphins(s,dt,aspect,splash){
 const t=s.age,batch=Math.min(s.batchCount-1,Math.floor(t/15));
 s.phase=`${s.batchCount} 批 · 共 ${s.actors.length} 只粉海豚 · 第 ${batch+1} 批${t<s.batches[batch].startAt+5?'结伴游入':'环游跃水'}`;
 for(let i=0;i<s.actors.length;i++){const a=s.actors[i];a.visible=t>=a.startAt&&t<a.startAt+50;if(!a.visible)continue;
  const oldHeading=a.heading,sample=dolphinSample(s,t,aspect,a),ahead=dolphinSample(s,t+.08,aspect,a);
  a.reaction=Math.max(0,a.reaction-dt);a.cooldown=Math.max(0,a.cooldown-dt);
  const response=a.reaction>0?Math.sin(Math.PI*(1-a.reaction/3.2))**2:0,turn=Math.atan2(Math.sin(ahead.heading-sample.heading),Math.cos(ahead.heading-sample.heading))/.08;
  Object.assign(a,{u:sample.u,v:sample.v,z:sample.z+response*.25});
  a.air=soft((a.z+.10)/1.8);const height=Math.max(0,a.z);a.screenU=a.u+height*.006/aspect;a.screenV=a.v+height*.030;
  a.heading=oldHeading+Math.atan2(Math.sin(sample.heading-oldHeading),Math.cos(sample.heading-oldHeading));
  const blend=dt===0?1:1-Math.exp(-dt*10),swimNod=Math.sin(a.stroke-.6)*(.025+a.effort*.075)*(1-a.air);a.pitch+=(sample.pitch+swimNod-a.pitch)*blend;a.roll+=(clamp(turn*.42,-.34,.34)+response*.48+Math.sin(t*.7+a.seed)*.035*(1-a.air)-a.roll)*blend;
  a.turn=turn;a.bend+=(clamp(turn*.12,-.16,.16)-a.bend)*(1-Math.exp(-dt*5));
  const gait=dolphinGait(sample.speed,a.seed,t,response);a.effort+=(gait.effort-a.effort)*blend;a.beatHz=(a.beatHz??gait.beatHz)+(gait.beatHz-(a.beatHz??gait.beatHz))*blend;
  a.stroke+=dt*TAU*a.beatHz*(1-a.air*.86);a.speed=sample.speed;
  a.flex+=(clamp((ahead.pitch-sample.pitch)/.08*.48,-.52,.52)*a.air-a.flex)*blend;
  for(const name of ['out','in']){const key=`dolphin-${i}-${name}`,at=a.contacts[name];if(t>=at&&!s.marks.includes(key)){
   const hit=dolphinSample(s,at,aspect,a),forward=a.scale*(1.25*Math.cos(hit.pitch)+.07*Math.sin(hit.pitch)),u=hit.u+Math.sin(hit.heading)*forward/(20*aspect),v=hit.v+Math.cos(hit.heading)*forward/20;
   s.marks.push(key);s.splashes.push({key,member:i,type:name,at,u,v,heading:hit.heading,surfaceZ:dolphinNoseHeight(hit,a)});splash(u,v);
  }}
 }
 s.stroke=s.actor.stroke;s.speed=s.actor.speed;s.turn=s.actor.turn;
 return t>=s.duration;
}
function step(s,dt,{aspect=s.ratio,splash=()=>{}}={}){
 dt=clamp(dt,0,.05);s.age+=dt;s.reaction=Math.max(0,s.reaction-dt);s.cooldown=Math.max(0,s.cooldown-dt);
 if(s.type==='dolphin')return stepDolphins(s,dt,aspect,splash);
 if(s.type==='penguin')return stepPenguins(s,dt,splash);
 if(s.type==='duo')return root.OceanDriftDuo.step(s,dt);
 return s.age>=s.duration;
}
function interact(s,index=0){
 if(!s||s.age>s.duration-4)return false;
 if(s.type==='duo')return root.OceanDriftDuo.interact(s,index);
 if(s.type==='dolphin'||s.type==='penguin'){const a=s.actors[index];if(!a||a.cooldown>0||!a.visible)return false;a.reaction=s.reaction=3.2;a.cooldown=s.cooldown=4;return true;}
 return false;
}

function dolphinGeometry(T){
 const positions=[],fins=[],indices=[];
 const profile=[[-1.59,.025,.035,0],[-1.34,.065,.075,0],[-1.06,.12,.13,0],[-.72,.21,.23,0],[-.28,.31,.31,0],[.20,.355,.345,0],[.63,.335,.33,.025],[.90,.285,.31,.065],[1.07,.235,.27,.090],[1.18,.145,.155,.045],[1.25,.095,.068,-.075],[1.46,.075,.052,-.082],[1.65,.036,.032,-.082],[1.70,.001,.002,-.082]];
 const sides=40,rings=104;
 for(let j=0;j<=rings;j++){
  const t=j/rings*(profile.length-1),k=Math.min(profile.length-2,Math.floor(t)),f=t-k;
  const a=profile[Math.max(0,k-1)],b=profile[k],c=profile[k+1],d=profile[Math.min(profile.length-1,k+2)];
  const value=n=>.5*(2*b[n]+(-a[n]+c[n])*f+(2*a[n]-5*b[n]+4*c[n]-d[n])*f*f+(-a[n]+3*b[n]-3*c[n]+d[n])*f*f*f);
  for(let i=0;i<=sides;i++){const th=i/sides*TAU;positions.push(Math.cos(th)*Math.max(.001,value(1)),mix(b[0],c[0],f),Math.sin(th)*Math.max(.002,value(2))+value(3));fins.push(0);}
 }
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
 for(let i=1;i<sides;i++){indices.push(0,i+1,i);const end=rings*(sides+1);indices.push(end,end+i,end+i+1);}
 function foil(sections,vertical=false){
  const base=fins.length,n=20;
  const samples=[];for(let j=0;j<=(sections.length-1)*5;j++){
   const t=j/5,k=Math.min(sections.length-2,Math.floor(t)),f=t-k,a=sections[Math.max(0,k-1)],b=sections[k],c=sections[k+1],d=sections[Math.min(sections.length-1,k+2)];
   samples.push(b.map((_,i)=>{const v=.5*(2*b[i]+(-a[i]+c[i])*f+(2*a[i]-5*b[i]+4*c[i]-d[i])*f*f+(-a[i]+3*b[i]-3*c[i]+d[i])*f*f*f);return i>2?Math.max(.001,v):v;}));
  }
  for(const [x,y,z,chord,thickness] of samples)for(let i=0;i<=n;i++){
   const th=i/n*TAU,across=Math.sin(th)*thickness*(.8+.2*Math.cos(th));
   positions.push(x+(vertical?across:0),y+Math.cos(th)*chord,z+(vertical?0:across));fins.push(1);
  }
  const start=indices.length;
  for(let j=0;j<samples.length-1;j++)for(let i=0;i<n;i++){const a=base+j*(n+1)+i,b=a+n+1;indices.push(a,b,a+1,b,b+1,a+1);}
  for(let i=1;i<n;i++){indices.push(base,base+i+1,base+i);const end=base+(samples.length-1)*(n+1);indices.push(end,end+i,end+i+1);}
  if(!vertical&&sections[1][0]>sections[0][0])for(let i=start;i<indices.length;i+=3){const a=indices[i];indices[i]=indices[i+1];indices[i+1]=a;}
 }
 foil([[0,-.16,.20,.32,.07],[0,-.17,.31,.30,.058],[0,-.20,.43,.23,.044],[0,-.26,.56,.16,.028],[0,-.35,.66,.09,.017],[0,-.45,.70,.018,.005],[0,-.48,.70,.001,.001]],true);
 for(const sign of [-1,1]){
  foil([[sign*.24,.43,-.13,.24,.055],[sign*.38,.32,-.17,.24,.045],[sign*.55,.17,-.21,.19,.032],[sign*.72,-.01,-.24,.12,.022],[sign*.84,-.18,-.25,.045,.010],[sign*.87,-.23,-.25,.001,.001]]);
  foil([[0,-1.64,0,.105,.052],[sign*.17,-1.65,.005,.20,.055],[sign*.36,-1.70,.015,.215,.044],[sign*.55,-1.79,.023,.17,.032],[sign*.72,-1.91,.027,.10,.018],[sign*.83,-2.02,.03,.03,.007],[sign*.86,-2.05,.03,.001,.001]]);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('fin',new T.Float32BufferAttribute(fins,1));g.setIndex(indices);g.computeVertexNormals();return g;
}
const dolphinVertex=`attribute float fin;uniform float stroke,effort,turn,air,flex;varying vec3 localP,worldN,worldP;varying float isFin;
vec3 deform(vec3 original){vec3 p=original;float aft=clamp((.65-p.y)/2.7,0.,1.15),phase=stroke-aft*2.25,drive=.20+effort*.95;
float tail=1.-smoothstep(-1.55,-1.25,original.y);float angle=sin(stroke-2.)*(.17+effort*.70)*(1.-air*.85)*tail;float y=p.y+1.35;p.y=-1.35+cos(angle)*y-sin(angle)*p.z;p.z=sin(angle)*y+cos(angle)*p.z;
float arch=(original.y-.1)/1.8;p.z+=sin(phase)*aft*aft*drive*(1.-air*.88)+flex*aft*aft+air*.10*(1.-clamp(arch*arch,0.,1.));
p.x+=sin(phase+.8)*aft*aft*(.025+effort*.21)*(1.-air*.85)-turn*aft*aft;
float tip=smoothstep(.25,.85,abs(p.x)),flipper=step(.5,fin)*step(-.65,original.y);p.z+=flipper*tip*((.035+effort*.045)*sin(stroke-.5)+turn*.55*sign(p.x));return p;}
void main(){vec3 p=deform(position);float e=.002;vec3 x=(deform(position+vec3(e,0.,0.))-p)/e,y=(deform(position+vec3(0.,e,0.))-p)/e,z=(deform(position+vec3(0.,0.,e))-p)/e;vec3 n=normal.x*cross(y,z)+normal.y*cross(z,x)+normal.z*cross(x,y);localP=position;vec4 wp=modelMatrix*vec4(p,1.);worldP=wp.xyz;worldN=normalize(mat3(modelMatrix)*normalize(n));isFin=fin;gl_Position=projectionMatrix*viewMatrix*wp;}`;
const dolphinFragment=`precision highp float;uniform float rose,clock;varying vec3 localP,worldN,worldP;varying float isFin;
void main(){vec3 p=localP,n=normalize(worldN);
if(!gl_FrontFacing)n=-n;
vec3 bellyCol=vec3(1.0,.96,.97);
vec3 flankCol=mix(vec3(.99,.85,.90),vec3(1.0,.88,.92),rose*.5);
vec3 dorsalCol=mix(vec3(.96,.76,.82),vec3(.98,.80,.85),rose*.5);
float saddle=smoothstep(-.15,.22,p.z)+sin(p.y*1.8)*.06;
vec3 c=mix(bellyCol,flankCol,smoothstep(.0,.44,saddle));
c=mix(c,dorsalCol,smoothstep(.38,.90,saddle));
float throatBlush=smoothstep(.5,1.2,p.y)*(1.-smoothstep(-.25,.0,p.z));
c=mix(c,vec3(1.0,.88,.91),throatBlush*.4*(.8+rose*.4));
if(isFin>.5){
 vec3 finCol=mix(vec3(.97,.79,.85),vec3(.95,.73,.80),smoothstep(-.05,.45,p.z));
 c=mix(c,finCol,.85);
}
float eyeDist=length(vec2((abs(p.x)-.228)*1.4,(p.y-1.035)));
float eyeRing=1.-smoothstep(.022,.055,eyeDist);
float pupil=1.-smoothstep(.012,.024,eyeDist);
c=mix(c,vec3(.75,.48,.55),eyeRing*step(.015,p.z)*(1.-isFin)*.55);
c=mix(c,vec3(.12,.06,.09),pupil*step(.015,p.z)*(1.-isFin));
c+=pupil*.14*max(0.,n.z);
float mouth=(1.-smoothstep(.006,.016,abs(p.z+.09)))*smoothstep(.95,1.23,p.y)*(1.-smoothstep(1.58,1.67,p.y))*(1.-isFin);
c=mix(c,vec3(.85,.55,.62),mouth*.55);
float blowhole=length(vec2(p.x*1.6,(p.y-.78)*.78));
c=mix(c,vec3(.70,.45,.52),(1.-smoothstep(.025,.045,blowhole))*step(.30,p.z)*(1.-isFin));
vec3 sunDir=normalize(vec3(.35,.42,.84));
float NdotL=max(0.,dot(n,sunDir));
float wrapLight=max(0.,dot(n,sunDir)*.5+.5);
vec3 ambientSky=vec3(.96,.94,.97)*(.72+.28*max(0.,n.z));
vec3 directSun=vec3(1.0,.98,.96)*(NdotL*.35+wrapLight*.40);
vec3 halfway=normalize(sunDir+vec3(0.,0.,1.));
float specPower=worldP.z>0.?32.:20.;
float specIntensity=worldP.z>0.?.36:.16;
float sheen=pow(max(0.,dot(n,halfway)),specPower)*specIntensity;
float fresnel=pow(1.-max(0.,dot(n,vec3(0.,0.,1.))),3.);
vec3 rimColor=(vec3(1.0,.86,.92)*.75+vec3(.40,.92,.96)*.25)*fresnel*.22;
vec3 result=c*(ambientSky*.58+directSun*.52)+vec3(1.0,.96,.98)*sheen+rimColor;
float watery=sin(worldP.x*2.4+sin(worldP.y*2.8+clock*1.4)+clock*1.8)*cos(worldP.y*2.6-worldP.x*1.9-clock*1.3);
float caustic=pow(max(0.,watery),2.4)*max(0.,n.z*.8+.2)*smoothstep(.20,-.40,worldP.z);
result+=vec3(.70,.96,1.)*caustic*.16;
if(worldP.z<0.){result=mix(result,vec3(.30,.85,.90),clamp(-worldP.z*.08,0.,.14));}
gl_FragColor=vec4(clamp(result,0.,1.),1.);}`;
const WAKE_LIFE=.95;
function dolphinWakeAnchor(a,side){
 const originalY=-.23,stroke=a.stroke??0,effort=a.effort??.5;let x=side*.87,y=originalY,z=-.25;
 const aft=clamp((.65-y)/2.7,0,1.15),phase=stroke-aft*2.25,drive=.20+effort*.95,air=a.air||0;
 z+=Math.sin(phase)*aft*aft*drive*(1-air*.88)+(a.flex||0)*aft*aft+air*.10*(1-clamp(((originalY-.1)/1.8)**2));
 x+=Math.sin(phase+.8)*aft*aft*(.025+effort*.21)*(1-air*.85)-(a.bend||0)*aft*aft;
 const tip=ease((Math.abs(x)-.25)/.60);z+=tip*((.035+effort*.045)*Math.sin(stroke-.5)+(a.bend||0)*.55*Math.sign(x));
 const pitch=a.pitch||0,roll=a.roll||0,cy=Math.cos(pitch),sy=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 const py=cy*y-sy*z,pz=sy*y+cy*z,px=cr*x+sr*pz;
 return {x:(Math.cos(a.heading)*px+Math.sin(a.heading)*py)*a.scale,y:(-Math.sin(a.heading)*px+Math.cos(a.heading)*py)*a.scale};
}
function sampleDolphinWake(history,a,time,aspect){
 while(history.length&&time-history[0].at>WAKE_LIFE)history.shift();
 const last=history[history.length-1],moving=a?.visible&&a.speed>.25&&a.air<.12&&a.z>-1.25&&a.z<.05;
 if(!moving)return history;
 if(last&&(time-last.at<.012||Math.hypot((a.u-last.u)*20*aspect,(a.v-last.v)*20)<.012))return history;
 const join=!!last&&time-last.at<.12&&Math.hypot((a.u-last.u)*20*aspect,(a.v-last.v)*20)<.65;
 history.push({u:a.u,v:a.v,at:time,heading:a.heading,scale:a.scale,seed:a.seed,depth:a.z-.25,left:dolphinWakeAnchor(a,-1),right:dolphinWakeAnchor(a,1),join});
 if(history.length>64)history.shift();return history;
}
const dolphinFlowFragment=`varying float born,edge,flowDepth,hue;uniform float clock;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
void main(){float age=clamp((clock-born)/.95,0.,1.);
float alpha=(1.-smoothstep(.50,1.,abs(edge)))*pow(1.-age,1.5)*.68;
float spectrum=.5+.5*sin(hue+born*5.5);
vec3 tint=spectrum<.5?mix(vec3(.25,.94,.90),vec3(.72,.52,.98),spectrum*2.):mix(vec3(.72,.52,.98),vec3(1.,.55,.75),(spectrum-.5)*2.);
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(flowDepth-.08,flowDepth+.12,height);}
if(alpha<.004)discard;gl_FragColor=vec4(tint,alpha);}`;
const dolphinFoamFragment=`varying vec2 tex;uniform float life,impact;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
void main(){vec2 p=(tex-.5)*2.;float r=length(p),radius=.10+.74*sqrt(life),warp=(noise(p*9.)-.5)*.08,edge=abs(r-radius+warp);
vec2 cells=p*47.+noise(p*9.)*.45,cell=floor(cells),f=fract(cells)-.5,center=vec2(hash(cell),hash(cell+17.))*.3-.15;float bubbles=1.-smoothstep(.13,.39,length(f-center));
float ring=1.-smoothstep(.02,.085,edge),grains=(.25+.75*bubbles)*(.75+.25*noise(p*35.)),patches=mix(.22,1.,smoothstep(.20,.63,noise(p*8.)));
float core=(1.-smoothstep(.07,.42,r))*(1.-smoothstep(.04,.52,life));float alpha=(ring*grains*patches*.92+core*(.35+.65*bubbles)*.74)*pow(1.-life,1.18)*impact;
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(.05,.28,height);}
if(alpha<.008)discard;gl_FragColor=vec4(.95,.99,1.,alpha);}`;

function iceArrivalWake(s,write){
 const t=s.age;if(s.type!=='penguin'||!s.intactIce?.visible||t<=0||t>=11.8)return 0;
 const dx=(s.home.u-1.38)*20*s.ratio,dy=(s.home.v-s.entryV)*20,d=Math.hypot(dx,dy);if(d<.001)return 0;
 const nx=-dy/d,ny=dx/d,heading=Math.atan2(dy,dx),point=age=>{const q=clamp(age/10),travel=ease(q);return {x:(1.38+dx/(20*s.ratio)*travel-.5)*20*s.ratio,y:(s.entryV+dy/20*travel-.5)*20,strength:clamp(d*.6*q*(1-q)/1.8)};};
 const boundary=angle=>{const x=Math.cos(angle),y=Math.sin(angle);let r=Infinity;for(let i=0;i<s.boundary.length;i++){const a=s.boundary[i],b=s.boundary[(i+1)%s.boundary.length],ex=b[0]-a[0],ey=b[1]-a[1],den=x*ey-y*ex;if(Math.abs(den)<1e-8)continue;const distance=(a[0]*ey-a[1]*ex)/den,u=(a[0]*y-a[1]*x)/den;if(distance>0&&u>=0&&u<=1)r=Math.min(r,distance);}return [x*r,y*r];};
 let count=0;const strip=(a,b)=>{for(const [p,edge] of [[a,-1],[a,1],[b,-1],[b,-1],[a,1],[b,1]]){write(p.x+p.nx*p.width*edge,p.y+p.ny*p.width*edge,.045,p.alpha,edge,p.phase);count++;}};
 const current=point(t);
 if(t<10)for(let i=0;i<48;i++){const samples=[i,i+1].map(j=>{const angle=heading-1.38+j/48*2.76,p=boundary(angle),ox=Math.cos(angle),oy=Math.sin(angle);return {x:current.x+p[0]+ox*.045,y:current.y+p[1]+oy*.045,nx:ox,ny:oy,width:.055,alpha:current.strength*.43*Math.sin(j/48*Math.PI)**.45,phase:j/48*10};});strip(...samples);}
 for(const side of [-1,1]){const anchor=boundary(heading+side*Math.PI/2);for(let i=0;i<32;i++){const samples=[i,i+1].map(j=>{const age=j/32*1.8,emit=t-age,p=point(Math.max(0,emit)),spread=age*.22;return {x:p.x+anchor[0]+nx*side*(.035+spread),y:p.y+anchor[1]+ny*side*(.035+spread),nx,ny,width:.045+age*.035,alpha:emit>0&&emit<10?p.strength*.38*(1-age/1.8)**1.5:0,phase:age*5+side};});strip(...samples);}}
 return count;
}
const iceArrivalFragment=`varying vec3 flow;uniform float clock;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
void main(){float grain=.72+.28*sin(flow.z*11.-clock*4.);float alpha=flow.x*(1.-smoothstep(.05,1.,abs(flow.y)))*grain;
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(.06,.18,height);}
if(alpha<.003)discard;gl_FragColor=vec4(.76,.96,.98,alpha);}`;

function createStage({THREE:T,scene,toWorld,aspect,splash,ripple,breachSplash=(u,v)=>splash(u,v),surfaceDepth,layerCenters,surfaceParticles}){
 const duoStage=root.OceanDriftDuo.createStage({THREE:T,scene,toWorld,aspect,ripple,surfaceDepth,layerCenters});
 const groups={},sharedSphere=new T.SphereGeometry(1,28,18),resources=new Set([sharedSphere]);
 const mesh=(g,geo,mat,pos=[0,0,0],scale=[1,1,1])=>{resources.add(geo);const m=new T.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);g.add(m);return m;};
 const oval=(g,mat,pos,scale)=>mesh(g,sharedSphere,mat,pos,scale);
 const group=parent=>{const g=new T.Group();parent?.add(g);return g;};
 function fin(g,points,thickness,mat,curved=false){const shape=new T.Shape();if(curved){const n=points.length;shape.moveTo((points[n-1][0]+points[0][0])/2,(points[n-1][1]+points[0][1])/2);for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n];shape.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}}else{shape.moveTo(...points[0]);for(let i=1;i<points.length;i++)shape.lineTo(...points[i]);}shape.closePath();return mesh(g,new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:thickness*.45,bevelThickness:thickness*.4,bevelSegments:2,steps:1,curveSegments:12}),mat,[0,0,-thickness/2]);}
 const dolphinGeo=dolphinGeometry(T),dolphins=Array.from({length:35},()=>{const g=group(),mat=new T.ShaderMaterial({side:T.DoubleSide,vertexShader:dolphinVertex,fragmentShader:dolphinFragment,uniforms:{clock:{value:0},stroke:{value:0},effort:{value:.5},turn:{value:0},air:{value:0},flex:{value:0},rose:{value:.5}}});resources.add(mat);mesh(g,dolphinGeo,mat);g.userData={material:mat,wake:0};g.visible=false;g.renderOrder=4;return g;});
 groups.dolphin=dolphins[0];for(const g of dolphins.slice(1))scene.add(g);
 function plumage(color){const m=new T.ShaderMaterial({uniforms:{tone:{value:new T.Color(color)},clock:{value:0}},vertexShader:'varying vec3 p,n;void main(){p=position;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 p,n;uniform vec3 tone;uniform float clock;void main(){vec3 N=normalize(n);if(!gl_FrontFacing)N=-N;float light=max(0.,dot(N,normalize(vec3(.32,.35,.88))));float grain=sin(p.x*110.+p.z*73.)*sin(p.y*95.-p.z*57.);vec3 c=tone*(.62+.42*light)*(1.+grain*.006);c=mix(c,c*vec3(.85,1.03,1.06),.18);gl_FragColor=vec4(c,1.);}`});resources.add(m);return m;}
 const feather=plumage(0x22333b),bib=plumage(0xdfe2d5),beak=plumage(0xb59154),eyeMat=plumage(0x0d1920);
 const penguin=group(),bird=group(penguin),bodyProfile=[[0,.035],[.12,.06],[.235,.18],[.298,.39],[.285,.60],[.235,.78],[.16,.92],[.10,.99],[0,1.02]].map(([r,z])=>new T.Vector2(r,z));
 const torso=mesh(bird,new T.LatheGeometry(bodyProfile,40),feather);torso.rotation.x=Math.PI/2;torso.scale.z=.84;
 oval(bird,bib,[0,-.173,.48],[.232,.105,.39]);
 const head=group(bird);head.position.set(0,-.08,1.02);oval(head,feather,[0,0,0],[.19,.215,.215]);
 oval(head,bib,[0,-.154,.112],[.133,.082,.078]);
 for(const sign of [-1,1]){oval(head,bib,[sign*.107,-.170,-.035],[.073,.065,.112]);oval(head,bib,[sign*.132,-.108,.115],[.055,.085,.065]);oval(head,eyeMat,[sign*.147,-.180,.051],[.015,.013,.016]);}
 const bill=mesh(head,new T.ConeGeometry(.055,.205,16),beak,[0,-.238,-.054],[1,1,.65]);bill.rotation.z=Math.PI;
 const wings=[],feet=[];
 for(const sign of [-1,1]){const wing=group(bird);wing.position.set(sign*.25,.015,.82);
  fin(wing,[[0,.02],[sign*.10,-.015],[sign*.19,.04],[sign*.21,.15],[sign*.14,.19],[sign*.03,.12]],.035,feather,true).rotation.x=-Math.PI/2;
  wing.scale.set(1,1,2.5);wings.push(wing);const foot=group(bird);foot.position.set(sign*.12,-.015,.045);
  fin(foot,[[-.075,.035],[-.095,-.16],[-.035,-.145],[.01,-.19],[.055,-.14],[.09,-.15],[.075,.03]],.025,beak,true);feet.push(foot);
 }
 const tail=fin(bird,[[-.10,.15],[0,.36],[.10,.15]],.04,feather,true);tail.position.z=.22;
 const ice=group();
 bird.name='penguin-body';head.name='penguin-head';tail.name='penguin-tail';wings.forEach((w,i)=>w.name=`penguin-wing-${i}`);feet.forEach((f,i)=>f.name=`penguin-foot-${i}`);
 const penguins=[penguin,...Array.from({length:5},()=>penguin.clone(true))];for(const g of penguins){g.userData={bird:g.getObjectByName('penguin-body'),head:g.getObjectByName('penguin-head'),tail:g.getObjectByName('penguin-tail'),feet:[g.getObjectByName('penguin-foot-0'),g.getObjectByName('penguin-foot-1')],wings:[g.getObjectByName('penguin-wing-0'),g.getObjectByName('penguin-wing-1')]};g.visible=false;g.renderOrder=6;scene.add(g);}groups.penguin=penguin;
 const iceSkin=new T.ShaderMaterial({side:T.DoubleSide,vertexShader:'varying vec2 p;varying vec3 N;varying float level;void main(){p=position.xy;level=position.z;N=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 p;varying vec3 N;varying float level;
 float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 void main(){float frost=noise(p*1.3)*.82+noise(p*6.)*.15+noise(p*23.)*.03;float veins=pow(1.-abs(sin(p.x*2.5+p.y*1.5+noise(p*1.3)*4.)),20.);vec3 c=mix(vec3(.52,.80,.86),vec3(.88,.96,.97),smoothstep(.08,.95,frost));float top=smoothstep(.15,.8,abs(N.z)),wet=1.-smoothstep(.015,.14,level);c=mix(c*vec3(.72,.90,.96),c,top);c=mix(c,vec3(.22,.58,.68),wet*.28);c+=veins*.025*top;c*=.78+.26*max(0.,dot(normalize(N),normalize(vec3(.32,.35,.88))));gl_FragColor=vec4(c,1.);}`});resources.add(iceSkin);
 const icePieces=Array.from({length:10},()=>{const g=group(),geometry=new T.BufferGeometry(),edges=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(4096*3),3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(4096*3),3).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
  edges.setAttribute('position',new T.BufferAttribute(new Float32Array(256*3),3).setUsage(T.DynamicDrawUsage));edges.setDrawRange(0,0);resources.add(edges);
  const surface=mesh(g,geometry,iceSkin);surface.frustumCulled=false;
  const crackMat=new T.LineBasicMaterial({color:0x507e86,transparent:true,opacity:0,depthWrite:false});resources.add(crackMat);const cracks=new T.LineLoop(edges,crackMat);cracks.frustumCulled=false;g.add(cracks);
  g.userData={surface,cracks,crackMaterial:crackMat};g.renderOrder=5;scene.add(g);g.visible=false;return g;
 });ice.visible=false;
 const shadows={};for(const type of Object.keys(groups)){const g=groups[type];g.visible=false;scene.add(g);const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.18}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform float opacity;void main(){float a=exp(-dot((v-.5)*5.,(v-.5)*5.));gl_FragColor=vec4(.02,.12,.14,a*opacity);}'});resources.add(m);shadows[type]=mesh(scene,new T.PlaneGeometry(type==='dolphin'?3:2.5,4),m);shadows[type].visible=false;shadows[type].renderOrder=1;}
 const podShadows=[shadows.dolphin,...dolphins.slice(1).map(()=>{const m=shadows.dolphin.material.clone();resources.add(m);const shadow=mesh(scene,shadows.dolphin.geometry,m);shadow.visible=false;shadow.renderOrder=1;return shadow;})];
 const penguinShadows=[shadows.penguin,...penguins.slice(1).map(()=>{const m=shadows.penguin.material.clone();resources.add(m);const shadow=mesh(scene,shadows.penguin.geometry,m);shadow.visible=false;shadow.renderOrder=1;return shadow;})];
 const contactGeo=new T.PlaneGeometry(.85,.68),contactShadows=penguins.map(()=>{const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:0}},vertexShader:'varying vec2 p;void main(){p=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 p;uniform float opacity;void main(){float a=exp(-dot(p*5.,p*5.))*opacity;if(a<.003)discard;gl_FragColor=vec4(.08,.20,.23,a);}'});resources.add(mat);const shadow=mesh(scene,contactGeo,mat);shadow.visible=false;shadow.renderOrder=5;return shadow;});
 const foamScene=new T.Scene(),foamSize=new T.Vector2(),foamGeo=new T.PlaneGeometry(1,1),foams=Array.from({length:8},()=>{const g=group(),format=root.OceanObjectOcclusion,mat=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,uniforms:{life:{value:0},impact:{value:1},surfaceDepth:{value:surfaceDepth},layerCenters:{value:layerCenters},frameSize:{value:foamSize},layerFormat:{value:new T.Vector3(format.BANDS,format.CAPACITY,format.SPAN)}},vertexShader:'varying vec2 tex;void main(){tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:dolphinFoamFragment});resources.add(mat);mesh(g,foamGeo,mat);g.userData.material=mat;g.visible=false;foamScene.add(g);return g;});
 const wakeHistories=dolphins.map(()=>[]),wakeGeo=new T.BufferGeometry(),wakePositions=new Float32Array(35*2*63*6*3),wakeData=new Float32Array(35*2*63*6*4);
 wakeGeo.setAttribute('position',new T.BufferAttribute(wakePositions,3).setUsage(T.DynamicDrawUsage));wakeGeo.setAttribute('wakeData',new T.BufferAttribute(wakeData,4).setUsage(T.DynamicDrawUsage));wakeGeo.setDrawRange(0,0);
 const format=root.OceanObjectOcclusion,wakeMat=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,uniforms:{clock:{value:0},surfaceDepth:{value:surfaceDepth},layerCenters:{value:layerCenters},frameSize:{value:foamSize},layerFormat:{value:new T.Vector3(format.BANDS,format.CAPACITY,format.SPAN)}},vertexShader:'attribute vec4 wakeData;varying float born,edge,flowDepth,hue;void main(){born=wakeData.x;edge=wakeData.y;flowDepth=wakeData.z;hue=wakeData.w;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:dolphinFlowFragment});
 const wakeMesh=new T.Mesh(wakeGeo,wakeMat);wakeMesh.frustumCulled=false;wakeMesh.visible=false;resources.add(wakeGeo);resources.add(wakeMat);foamScene.add(wakeMesh);
 const iceFlowGeo=new T.BufferGeometry(),iceFlowPosition=new T.BufferAttribute(new Float32Array(768*3),3).setUsage(T.DynamicDrawUsage),iceFlowData=new T.BufferAttribute(new Float32Array(768*3),3).setUsage(T.DynamicDrawUsage);
 iceFlowGeo.setAttribute('position',iceFlowPosition);iceFlowGeo.setAttribute('flowData',iceFlowData);iceFlowGeo.setDrawRange(0,0);
 const iceFlowMat=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,uniforms:{clock:{value:0},surfaceDepth:{value:surfaceDepth},layerCenters:{value:layerCenters},frameSize:{value:foamSize},layerFormat:{value:new T.Vector3(format.BANDS,format.CAPACITY,format.SPAN)}},vertexShader:'attribute vec3 flowData;varying vec3 flow;void main(){flow=flowData;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:iceArrivalFragment});
 const iceFlowMesh=new T.Mesh(iceFlowGeo,iceFlowMat);iceFlowMesh.frustumCulled=false;iceFlowMesh.visible=false;foamScene.add(iceFlowMesh);resources.add(iceFlowGeo);resources.add(iceFlowMat);
 function updateIceFlow(s){let i=0;const count=iceArrivalWake(s,(x,y,z,alpha,edge,phase)=>{iceFlowPosition.setXYZ(i,x,y,z);iceFlowData.setXYZ(i,alpha,edge,phase);i++;});iceFlowGeo.setDrawRange(0,count);iceFlowMesh.visible=count>0;iceFlowMat.uniforms.clock.value=s.age;iceFlowPosition.needsUpdate=iceFlowData.needsUpdate=true;}
 function updateWakes(s){let count=0;
  for(let i=0;i<wakeHistories.length;i++){const history=sampleDolphinWake(wakeHistories[i],s.actors[i],s.age,aspect());
   for(let j=1;j<history.length;j++){const b=history[j];if(!b.join)continue;const a=history[j-1];
    for(const side of [-1,1]){for(const [p,edge] of [[a,-1],[a,1],[b,-1],[b,-1],[a,1],[b,1]]){
     const nx=Math.cos(p.heading),ny=-Math.sin(p.heading),width=.022*p.scale,anchor=side<0?p.left:p.right;
     const world=toWorld(p.u,p.v);wakePositions[count*3]=world.x+anchor.x+nx*edge*width;wakePositions[count*3+1]=world.y+anchor.y+ny*edge*width;wakePositions[count*3+2]=.04;
     wakeData[count*4]=p.at;wakeData[count*4+1]=edge;wakeData[count*4+2]=p.depth;wakeData[count*4+3]=p.seed+side*.6;count++;
    }}
   }
  }
  wakeGeo.setDrawRange(0,count);wakeMesh.visible=count>0;wakeMat.uniforms.clock.value=s.age;wakeGeo.attributes.position.needsUpdate=true;wakeGeo.attributes.wakeData.needsUpdate=true;
 }
 if(surfaceParticles)foamScene.add(surfaceParticles);
 let current=null,lastId=0,lastMarks=0;
 function at(g,u,v,z){const p=toWorld(u,v);g.position.set(p.x,p.y,z);}
 function hide(){duoStage.hide();for(const g of [...Object.values(groups),...dolphins,...penguins,...icePieces,...penguinShadows,...contactShadows,...Object.values(shadows),...podShadows,...foams,wakeMesh,iceFlowMesh])g.visible=false;for(const h of wakeHistories)h.length=0;wakeGeo.setDrawRange(0,0);iceFlowGeo.setDrawRange(0,0);ice.visible=false;current=null;}
 function render(story,id){if(!story){hide();return;}if(lastId!==id){hide();lastId=id;lastMarks=0;for(const d of dolphins)d.userData.wake=0;}current=story;const s=story,t=s.age;
  if(s.type==='duo'){duoStage.render(s,id);return;}
  if(s.type==='dolphin'){
   updateWakes(s);
   for(;lastMarks<s.splashes.length;lastMarks++){const hit=s.splashes[lastMarks];breachSplash(hit.u,hit.v,hit.type,hit.heading);}
   const recent=s.splashes.filter(hit=>t-hit.at<(hit.type==='in'?1.8:1.25)).slice(-foams.length);
   for(let i=0;i<foams.length;i++){const foam=foams[i],hit=recent[i],age=hit?t-hit.at:-1,duration=hit?.type==='in'?1.8:1.25;foam.visible=age>=0&&age<duration;if(!foam.visible)continue;at(foam,hit.u,hit.v,.08);const size=hit.type==='in'?5.2:3.4;foam.rotation.z=-hit.heading;foam.scale.set(size*.72,size*1.14,1);foam.userData.material.uniforms.life.value=clamp(age/duration);foam.userData.material.uniforms.impact.value=hit.type==='in'?1:.68;}
   for(let i=0;i<dolphins.length;i++){const actor=s.actors[i],model=dolphins[i],shadow=podShadows[i];model.visible=shadow.visible=!!actor?.visible;if(!actor?.visible)continue;
    at(model,actor.screenU,actor.screenV,actor.z);model.rotation.set(actor.pitch,actor.roll,-actor.heading,'ZYX');model.scale.setScalar(actor.scale*(1+Math.max(0,actor.z)*.035));
    model.renderOrder=actor.z>0?6:3;
    const u=model.userData.material.uniforms;u.clock??={value:0};u.clock.value=t;u.stroke.value=actor.stroke;u.effort.value=actor.effort;u.turn.value=actor.bend;u.rose.value=actor.rose;u.air.value=actor.air;u.flex.value=actor.flex;
    const height=Math.max(0,actor.z);at(shadow,actor.u+.004+height*.015/aspect(),actor.v-.008-height*.012,-5.92);shadow.rotation.z=-actor.heading;shadow.scale.setScalar(actor.scale*(1+height*.05));shadow.material.uniforms.opacity.value=.20*(1-clamp(actor.z/9));
    if(t<.1)model.userData.wake=0;
    if(t-model.userData.wake>.40&&actor.u>0&&actor.u<1&&actor.v>0&&actor.v<1&&Math.abs(actor.z)<1){model.userData.wake=t;
     const wu=actor.u-Math.sin(actor.heading)*1.25/(20*aspect()),wv=actor.v-Math.cos(actor.heading)*1.25/20;
     for(const side of [-1,1])ripple(wu+side*Math.cos(actor.heading)*.20/(20*aspect()),wv-side*Math.sin(actor.heading)*.20/20,.014,.005);
    }
   }
   return;
  }
  if(s.type==='penguin'){
   updateIceFlow(s);
   const recent=s.splashes.filter(hit=>t-hit.at<1.4).slice(-foams.length);
   for(let i=0;i<foams.length;i++){const foam=foams[i],hit=recent[i];foam.visible=!!hit;if(!hit)continue;at(foam,hit.u,hit.v,.035);foam.scale.set(1.35,1.75,1);foam.rotation.z=-hit.heading;foam.userData.material.uniforms.life.value=clamp((t-hit.at)/1.4);foam.userData.material.uniforms.impact.value=.62;}
   for(let i=0;i<icePieces.length;i++){const p=i===9?s.intactIce:s.icePieces[i],model=icePieces[i];model.visible=!!p?.visible;model.userData.cracks.visible=false;if(!model.visible)continue;root.OceanPenguinIce.updateGeometry(model.userData.surface.geometry,model.userData.cracks.geometry,p);at(model,p.u,p.v,p.z);model.rotation.z=p.rotation;}
   for(let i=0;i<penguins.length;i++){const a=s.actors[i],model=penguins[i],shadow=penguinShadows[i],contact=contactShadows[i];model.visible=shadow.visible=!!a?.visible;contact.visible=!!a?.visible&&!a.swimming&&!a.jumping;if(!a?.visible)continue;
    at(model,a.screenU??a.u,a.screenV??a.v,a.z);model.scale.setScalar(a.scale*(1+(a.lift||0)*.02));model.rotation.set(a.pitch,a.roll,Math.PI-a.heading,'ZYX');
    model.renderOrder=a.swimming?3:6;
    const d=model.userData;
    const gait=penguinGait(a,t),swim=gait.swim,idle=gait.idle,waiting=a.idleWeight||0,compress=gait.crouch*.17+gait.landing*.13+idle.bounce*.045*waiting;
    d.head.rotation.z=(idle.headTurn+idle.preen*.55)*waiting+Math.sin(t*.85+a.seed)*.08*(1-swim)*(1-waiting);d.head.rotation.x=gait.anticipation*.14+Math.sin(gait.clock-.6)*.035*swim+idle.preen*.48*waiting;d.head.position.z=1.02-compress*.18;d.head.position.y=-.08-idle.preen*.035*waiting;
    d.bird.position.z=gait.breath-compress*.25+Math.sin(gait.clock-.5)*.025*swim;d.bird.scale.set(1+compress*.25,1+compress*.16,1-compress);
    d.bird.rotation.z=(idle.rock+idle.shuffle*Math.sin(t*12+a.seed)*.11)*waiting*(1-gait.anticipation);d.bird.rotation.x=gait.anticipation*.10+gait.landing*.08+idle.preen*.10*waiting;
    d.wings.forEach((w,j)=>{const sign=j?1:-1,standing=.12+Math.sin(t*1.7+a.seed+j*.4)*.06,jump=a.jumping?.8*Math.sin(Math.PI*a.progress):0;
     const idleWing=waiting*(idle.flap*(.38+Math.sin(t*15+a.seed)*.18)+idle.bounce*.45+(j===a.index%2?idle.preen*.48:0));
     w.rotation.y=sign*mix(standing+jump+gait.anticipation*.35+idleWing,.7+gait.stroke,swim);w.rotation.x=Math.sin(gait.clock-.7)*.20*swim;w.rotation.z=sign*a.bank*swim*.22;
     if(a.reaction>0)w.rotation.y+=sign*Math.sin(a.reaction*10)*Math.sin(Math.PI*a.reaction/3.2)*.4;
    });
    d.feet.forEach((foot,j)=>{const beat=Math.sin(t*(3.7+idle.shuffle*7)+a.seed+j*Math.PI);foot.rotation.x=mix(beat*(.13+idle.shuffle*.23)*(1-gait.anticipation),-.38+Math.sin(gait.clock+.8+j*.25)*.14,swim);foot.position.z=.045+Math.max(0,beat)*(.018+idle.shuffle*.06)*waiting;});d.tail.rotation.x=Math.sin(gait.clock-1.2)*.10*swim+idle.bounce*.17*waiting;
    at(shadow,a.u+.004,a.v-.008,-5.92);shadow.scale.setScalar(a.scale);shadow.rotation.z=-a.heading;shadow.material.uniforms.opacity.value=.16;
    const idleLift=idle.hop*waiting;at(contact,a.u,a.v,a.z-idleLift-.02);contact.rotation.z=-a.heading;contact.scale.setScalar(a.scale*(1+idleLift*.8));contact.material.uniforms.opacity.value=.18*(1-idleLift*1.5);
    if(a.swimming&&t-(model.userData.wake||0)>.42){model.userData.wake=t;ripple(a.u,a.v,.018,.005);}
   }
   for(;lastMarks<s.splashes.length;lastMarks++){const hit=s.splashes[lastMarks];breachSplash(hit.u,hit.v,'in',hit.heading);ripple(hit.u,hit.v,.16,.016);}
   return;
  }
 }

 function hit(u,v){if(!current)return false;if(current.type==='duo')return duoStage.hit(u,v);const pod=current.type==='dolphin',actors=current.actors||[current.actor];let nearest=null;
  for(let i=0;i<actors.length;i++){const a=actors[i];if(!a.visible)continue;const dx=(u-(a.screenU??a.u))*20*aspect(),dy=(v-(a.screenV??a.v))*20,c=Math.cos(a.heading),s=Math.sin(a.heading),x=dx*c-dy*s,y=dx*s+dy*c,scale=(a.scale||1)*(pod?1+Math.max(0,a.z)*.035:1),d=(x/((pod ? .56 : .65)*scale))**2+(y/((pod?1.9:.75)*scale))**2;
   if(d<1&&(!nearest||a.z>nearest.z))nearest={index:i,z:a.z};
  }return nearest?{index:nearest.index}:false;
 }
 function occlusionLayers(){const result=duoStage.occlusionLayers();for(const g of [...Object.values(groups),...dolphins.slice(1),...penguins.slice(1),...icePieces,...contactShadows])if(g.visible)result.push({group:g,z:g.position.z,solidIce:icePieces.includes(g)});return result;}
 function renderSurface(renderer,camera){duoStage.renderSurface(renderer,camera);if(!foams.some(g=>g.visible)&&!wakeMesh.visible&&!iceFlowMesh.visible&&!surfaceParticles?.visible)return;if(surfaceDepth)renderer.getDrawingBufferSize(foamSize);else foamSize.set(0,0);if(surfaceParticles?.material?.uniforms?.frameSize)surfaceParticles.material.uniforms.frameSize.value.copy(foamSize);const clear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(foamScene,camera);}finally{renderer.autoClear=clear;}}
 return {render,renderSurface,hit,occlusionLayers,occlusionBatches:duoStage.occlusionBatches,stats:duoStage.stats,interact:(index=0)=>interact(current,index),pointer:(u,v,du,dv)=>root.OceanDriftDuo.pointer(current,u,v,du,dv),snapshot:()=>current?JSON.parse(JSON.stringify(current)):null,dispose(){hide();duoStage.dispose();for(const g of [...foams,wakeMesh,iceFlowMesh])foamScene.remove(g);for(const g of [...Object.values(groups),...dolphins.slice(1),...penguins.slice(1),...icePieces,...penguinShadows.slice(1),...contactShadows,...Object.values(shadows),...podShadows.slice(1),ice])scene.remove(g);for(const r of resources)r.dispose();}};
}
root.OceanVisitors={names,create,step,interact,createStage,dolphinGeometry,dolphinVertex,dolphinFragment,dolphinGait,sampleDolphinWake,penguinGait,penguinIdle,iceArrivalWake};
})(root);

}
