export function install(root, document, window, matchMedia) {
/* A relaxed, face-up character visit stylized for Ocean Shallows 2's crystal lagoon lighting. */
(function(root){
'use strict';
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const MAX_VISITORS=150;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);},coasts=new WeakMap();
function curve(a,t){
 const path=a.route;let i=0;t=clamp(t,0,a.travel);
 const entryPhase=clamp(t/a.entryDuration);t+=a.entryBoost*(1-(1-entryPhase)**3);
 while(i<path.length-2&&t>path[i+1].t)i++;
 const p=path[i],q=path[i+1],h=q.t-p.t,f=(t-p.t)/h,f2=f*f,f3=f2*f,out={};
 for(const k of ['u','v']){const tangent=j=>{const l=path[Math.max(0,j-1)],r=path[Math.min(path.length-1,j+1)];return (r[k]-l[k])/(r.t-l.t);},m=tangent(i)*h,n=tangent(i+1)*h;
  out[k]=(2*f3-3*f2+1)*p[k]+(f3-2*f2+f)*m+(-2*f3+3*f2)*q[k]+(f3-f2)*n;
 }return out;
}
function basePose(s,i,t){const a=s.actors[i];return curve(a,t-a.startAt);}
function clearance(s,p){
 const coast=coasts.get(s),r=1.95*s.size;let result=Infinity;
 for(let j=0;j<8;j++){const a=j/8*TAU;result=Math.min(result,coast(p.u+Math.cos(a)*r/(20*s.ratio),p.v+Math.sin(a)*r/20));}return result;
}
function create(s,rng,coast){
 coasts.set(s,coast);s.size=Math.min(1.18,.78+s.ratio*.25)*.25;s.entry=1;s.actors=[];s.socialAt=0;
 const count=100+Math.min(50,Math.floor(rng()*51));
 const safe=p=>{for(let i=0;i<60&&clearance(s,p)<.065;i++){p.u+=.009;p.v-=.004;}return p;};
 const edges=['top','right','bottom'],entryOffset=Math.floor(rng()*3);
 const gates=edges.map((_,edge)=>{
  const slots=[];
  for(let i=0;i<64;i++){
   const along=.09+i/63*.82;
   const inner=edge===1?{u:.94,v:along}:{u:along,v:edge===0?.94:.06};
   const boundary=edge===1?{u:1,v:along}:{u:along,v:edge===0?1:0};
   if(clearance(s,inner)>.09&&clearance(s,boundary)>.09)slots.push(inner);
  }
  if(!slots.length)slots.push(edge===1?{u:.94,v:.5}:{u:.65,v:edge===0?.94:.06});
  return slots;
 });
 const gate=edge=>{
  const slots=gates[edge],inner=slots[Math.min(slots.length-1,Math.floor(rng()*slots.length))];
  const outer=edge===1?{u:1.18,v:inner.v}:{u:inner.u,v:edge===0?1.18:-.18};
  return {inner,outer};
 };
 for(let index=0;index<count;index++){
  const kind=index<2?['sponge','patrick'][index]:rng()<.5?'sponge':'patrick',startAt=index/count*6+rng()*.18,travel=62+rng()*12,edge=Math.floor(rng()*3),entryEdge=(index+entryOffset)%3;
  const entrance=gate(entryEdge),departure=gate(edge);
  const a={kind,index,startAt,travel,entry:edges[entryEdge],exit:edges[edge],...entrance.outer,z:.025,heading:0,pitch:0,roll:0,visible:false,scale:s.size,seed:rng()*TAU,reaction:0,social:0,cooldown:0,pushX:0,pushY:0,pushVX:0,pushVY:0,speed:0,stroke:rng()*TAU,effort:.3,nextGreeting:12+rng()*10};
  const cu=.47+rng()*.22,cv=.35+rng()*.30,rx=.20+rng()*Math.min(.09,.94-cu-.20),ry=.21+rng()*.08,clockwise=rng()<.5?1:-1;
  const phase=((index*.61803398875+rng()*.16)%1)*TAU;
  a.entryDuration=2+rng()*8;a.entryBoost=travel*.18-a.entryDuration;a.travel=travel-a.entryBoost;
  const raw=[[0,entrance.outer.u,entrance.outer.v],[.08,entrance.inner.u,entrance.inner.v]];
  for(let j=0;j<=4;j++){const angle=phase+clockwise*j*TAU/4;raw.push([.18+j*.16,cu+Math.cos(angle)*rx,cv+Math.sin(angle)*ry]);}
  raw.push([.92,departure.inner.u,departure.inner.v],[1,departure.outer.u,departure.outer.v]);
  a.route=raw.map(([t,u,v],i)=>({t:t*travel,...(i===0||i===raw.length-1?{u,v}:safe({u,v}))}));
  for(let pass=0;pass<14;pass++){let bad=false;for(let j=1;j<160;j++){const p=curve(a,j/160*a.travel);if(p.u>0&&p.u<1&&p.v>0&&p.v<1&&clearance(s,p)<.035){bad=true;break;}}if(!bad)break;for(let j=2;j<a.route.length-2;j++){a.route[j].u=Math.min(.95,a.route[j].u+.016);a.route[j].v=clamp(a.route[j].v-.004,.055,.95);}}
  s.actors.push(a);
 }
 s.actor=s.actors[0];s.duration=Math.max(...s.actors.map(a=>a.startAt+a.travel))+1.7;s.travel=s.duration;s.bump=0;step(s,0);
}
function pointer(s,u,v,du,dv){
 if(!s||s.type!=='duo')return false;const length=Math.hypot(du*s.ratio,dv);if(length<.0001)return false;
 for(const a of s.actors){if(!a.visible||s.age-a.startAt>a.travel*.84)continue;const dx=(a.u-u)*20*s.ratio,dy=(a.v-v)*20,d=Math.hypot(dx,dy),weight=1-smooth((d-.25)/1.4);if(weight<=0)continue;
  const power=Math.min(.05,length*3)*weight;a.pushVX=clamp(a.pushVX+du*s.ratio/length*power,-.22,.22);a.pushVY=clamp(a.pushVY+dv/length*power,-.22,.22);
 }return true;
}
function interact(s,index){const a=s.actors[index];if(!a?.visible||a.cooldown>0||s.age-a.startAt>a.travel-4)return false;a.reaction=2.8;a.cooldown=4;return true;}
function step(s,dt){
 const t=s.age,arriving=s.actors.some(a=>t<a.startAt+a.entryDuration),leaving=t>s.duration-22;
 s.phase=s.actors.length+' 位迷你朋友 · '+(arriving?'从上、右、下方海域陆续漂来':leaving?'向上、右、下方海域散去':t<s.duration*.53?'结伴划水，互相招手':'绕过浅海，随水滑行');
 for(const a of s.actors){
  const local=t-a.startAt,p=curve(a,local),before=curve(a,local-.03),after=curve(a,local+.03);
  a.visible=local>=0&&local<a.travel;a.reaction=Math.max(0,a.reaction-dt);a.social=Math.max(0,a.social-dt);a.cooldown=Math.max(0,a.cooldown-dt);
  a.pushVX+=(-a.pushX*.7-a.pushVX*2.7)*dt;a.pushVY+=(-a.pushY*.7-a.pushVY*2.7)*dt;a.pushX=clamp(a.pushX+a.pushVX*dt,-.30,.30);a.pushY=clamp(a.pushY+a.pushVY*dt,-.30,.30);
  const fade=1-smooth((local/a.travel-.79)/.08),pushed={u:p.u+a.pushX*fade/(20*s.ratio),v:p.v+a.pushY*fade/20};
  if((a.pushX||a.pushY)&&clearance(s,pushed)>.025){p.u=pushed.u;p.v=pushed.v;}
  a.u=p.u;a.v=p.v;a.z=.035+Math.sin(t*1.12+a.seed)*.011;
  const dx=(after.u-before.u)*20*s.ratio,dy=(after.v-before.v)*20,pace=Math.hypot(dx,dy)/.06;
  a.speed=pace;a.effort=clamp(.24+pace*.72,.25,.92);a.stroke+=dt*(2.6+pace*2.8);
  const course=Math.atan2(dx,dy);a.course??=course;if(pace>.001)a.course+=Math.atan2(Math.sin(course-a.course),Math.cos(course-a.course));
  const desired=a.course*.32+(a.kind==='sponge'?-.18:.18)+Math.sin(t*.29+a.seed)*.16;
  const angle=Math.atan2(Math.sin(desired-a.heading),Math.cos(desired-a.heading));a.heading+=dt===0?angle:angle*(1-Math.exp(-dt*1.8));
  a.pitch=Math.sin(a.stroke-.7)*.035*a.effort+Math.sin(t*.8+a.seed)*.025;a.roll=Math.sin(a.stroke*.5+a.seed)*.045;
  if(!a.visible)a.speed=0;
 }
 if(t>=s.socialAt){s.socialAt=t+.4;for(const a of s.actors){if(!a.visible||t<a.nextGreeting||t-a.startAt>a.travel*.8)continue;
  let buddy=null,nearest=1.4;for(const b of s.actors){if(a===b||!b.visible)continue;const d=Math.hypot((a.u-b.u)*20*s.ratio,(a.v-b.v)*20);if(d<nearest){nearest=d;buddy=b;}}
  a.nextGreeting=t+7+(Math.sin(a.seed+t)*.5+.5)*6;if(buddy){a.social=2.3;a.buddy=buddy.index;if(buddy.social===0)buddy.social=1.9;}
 }}
 return t>=s.duration;
}

function createStage({THREE:T,scene,toWorld,aspect,ripple,surfaceDepth,layerCenters}){
 const resources=new Set(),models=[],shadows=[],history=Array.from({length:MAX_VISITORS},()=>[]);let current=null,lastId=-1,lastRipple=0;
 const own=r=>(resources.add(r),r),sphere=own(new T.SphereGeometry(1,28,20));
 const group=(parent,name)=>{const g=new T.Group();g.name=name||'';parent?.add(g);return g;};
 const mesh=(g,geo,mat,p=[0,0,0],scale=[1,1,1])=>{const m=new T.Mesh(own(geo),mat);m.position.set(...p);m.scale.set(...scale);g.add(m);return m;};
 const oval=(g,mat,p,scale)=>mesh(g,sphere,mat,p,scale);
 const tube=(g,pts,r,mat)=>mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),24,r,8,false),mat);
 const vertex='varying vec3 p,N;void main(){p=position;N=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
 function skin(color,kind=0){return own(new T.ShaderMaterial({uniforms:{tone:{value:new T.Color(color)},kind:{value:kind}},vertexShader:vertex,fragmentShader:`varying vec3 p,N;uniform vec3 tone;uniform float kind;
 float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec3 n=normalize(N);float light=max(0.,dot(n,normalize(vec3(.32,.35,.88))));float grain=sin(p.x*82.+p.z*37.)*sin(p.y*94.+p.z*61.);vec3 c=tone*(.70+.36*light);
 if(kind>.5&&kind<1.5){vec2 cell=floor(p.xy*10.),f=fract(p.xy*10.)-.5;float h=hash(cell);vec2 center=(vec2(hash(cell+13.),hash(cell+29.))-.5)*.3;float d=length((f-center)*vec2(1.,1.2));float pore=(1.-smoothstep(.07,.17,d))*step(.66,h);c*=1.-pore*.16*max(0.,n.z);c+=grain*.006;}
 if(kind>1.5&&kind<2.5)c*=1.+grain*.009+.025*sin(p.x*3.+p.y*2.);
 if(kind>2.5&&kind<3.5){vec2 q=p.xy*1.15+vec2(.15,.2),cell=floor(q),f=fract(q)-.5;float a=atan(f.y,f.x),d=length(f),petal=.20+.075*cos(a*4.+hash(cell)*6.);float flower=1.-smoothstep(petal-.025,petal+.015,d);c=mix(c,vec3(.48,.32,.58)*(.76+.24*light),flower);c*=1.+grain*.012;}
 if(kind>3.5&&kind<4.5){float a=atan(p.y,p.x),r=length(p.xy);c*=.81+.16*sin(a*38.+r*12.)+.04*sin(a*83.);c=mix(c,c*.55,smoothstep(.75,.98,r));}
 if(kind>4.5)c*=1.+sin(p.x*170.)*sin(p.y*170.)*.013;
 float sheen=pow(max(0.,dot(n,normalize(vec3(.2,.2,1.)))),24.);c+=vec3(.88,.97,.98)*sheen*.06;c=mix(c,c*vec3(.92,1.03,1.05),.14);gl_FragColor=vec4(c,1.);}` }));}
 const yellow=skin(0xefd165,1),pore=skin(0xb59b43),poreRim=skin(0xf5dc7f),cream=skin(0xf6f2e2),black=skin(0x233138),brown=skin(0x96724c,5),red=skin(0xc25b50),blue=skin(0x56b0c4,4),rose=skin(0xe49b93,2),cheek=skin(0xdc8b79),green=skin(0xb4c276,3),mouth=skin(0x966059),sole=skin(0x464e52);
 function rounded(g,w,h,depth,mat,p,r=.14){const b=Math.min(.045,depth*.22,w*.10,h*.10),s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return mesh(g,new T.ExtrudeGeometry(s,{depth:Math.max(.004,depth-2*b),bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:4,curveSegments:10}),mat,[p[0],p[1],p[2]-depth/2+b]);}
 function eye(g,x,y,z,size,iris=false){const e=group(g);e.position.set(x,y,z);oval(e,cream,[0,0,0],[size,size*1.13,size*.34]);if(iris)oval(e,blue,[0,-.005,size*.30],[size*.47,size*.55,size*.13]);const pupil=oval(e,black,[0,-.005,size*.405],[size*(iris?.22:.16),size*(iris?.30:.26),size*.09]);oval(e,cream,[-size*.065,size*.10,size*.48],[size*.075,size*.095,size*.035]);e.userData.pupil=pupil;return e;}
 const sponge=group(scene,'drift-sponge'),sb=group(sponge,'sponge-body'),sEyes=[],sArms=[],sLegs=[];models.push(sponge);
 const spongeVolume=rounded(sb,1.53,1.38,.53,yellow,[0,.38,0],.15),spongeVertices=spongeVolume.geometry.attributes.position;
 for(let i=0;i<spongeVertices.count;i++){const x=spongeVertices.getX(i),y=spongeVertices.getY(i),z=spongeVertices.getZ(i);spongeVertices.setXYZ(i,x+Math.sin(y*19.+.6)*.014*Math.pow(Math.abs(x)/.83,4),y+Math.sin(x*17.)*.013*Math.pow(Math.abs(y)/.75,4),z);}spongeVolume.geometry.computeVertexNormals();
 const pores=[[-.62,.85,.07],[-.64,.41,.045],[-.65,-.06,.09],[.63,.94,.06],[.64,.54,.09],[.61,.05,.05],[-.45,1.01,.045],[.28,1.02,.045],[-.53,-.17,.035],[.45,-.21,.06]];
 for(const [x,y,r] of pores){oval(sb,pore,[x,y,.273],[r,r*.74,.008]);mesh(sb,new T.TorusGeometry(r*.79,.009,8,24),poreRim,[x,y,.279],[1,.74,.6]);oval(sb,yellow,[x-r*.09,y+r*.12,.282],[r*.56,r*.35,.006]);tube(sb,[[x-r*.75,y-r*.25,.278],[x,y-r*.62,.282],[x+r*.7,y-r*.20,.278]],.009,poreRim);}
 for(const sign of [-1,1]){const e=eye(sb,sign*.29,.63,.30,.278,true);sEyes.push(e);for(let i=-1;i<=1;i++)tube(sb,[[sign*.29+i*.12,.87,.32],[sign*.29+i*.16,1.0-Math.abs(i)*.025,.32]],.014,black);oval(sb,yellow,[sign*.49,.22,.30],[.20,.135,.065]);oval(sb,cheek,[sign*.50,.255,.355],[.095,.055,.006]);for(let j=0;j<3;j++)oval(sb,red,[sign*(.46+(j%2)*.055),.25+(j===1?.025:-.02),.363],[.012,.012,.004]);}
 oval(sb,yellow,[.015,.40,.47],[.09,.22,.13]);
 tube(sb,[[-.51,.16,.35],[-.27,.02,.365],[0,-.005,.37],[.29,.025,.365],[.51,.16,.35]],.018,mouth);
 for(const sign of [-1,1])rounded(sb,.14,.19,.045,cream,[sign*.085,-.055,.391],.025);
 rounded(sb,1.47,.22,.52,cream,[0,-.41,0],.06);rounded(sb,1.48,.42,.54,brown,[0,-.71,0],.09);
 for(const sign of [-1,1]){const collar=new T.Shape();collar.moveTo(sign*.07,-.32);collar.lineTo(sign*.34,-.32);collar.lineTo(sign*.19,-.50);collar.closePath();mesh(sb,new T.ExtrudeGeometry(collar,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:2}),cream,[0,0,.29]);rounded(sb,.16,.038,.025,black,[sign*.47,-.57,.293],.009);tube(sb,[[sign*.57,-.62,.29],[sign*.53,-.76,.29],[sign*.36,-.79,.29]],.006,mouth);}
 const tieShape=new T.Shape();tieShape.moveTo(0,-.46);tieShape.lineTo(-.075,-.67);tieShape.lineTo(0,-.77);tieShape.lineTo(.075,-.67);tieShape.closePath();mesh(sb,new T.ExtrudeGeometry(tieShape,{depth:.026,bevelEnabled:true,bevelSize:.01,bevelThickness:.01,bevelSegments:2}),red,[0,0,.29]);oval(sb,red,[0,-.44,.33],[.065,.055,.025]);
 tube(sb,[[-.65,-.88,.28],[0,-.9,.28],[.65,-.88,.28]],.009,mouth);
 for(const sign of [-1,1]){const arm=group(sb);arm.position.set(sign*.76,-.14,0);oval(arm,cream,[sign*.025,0,0],[.12,.15,.21]);tube(arm,[[sign*.05,0,0],[sign*.25,-.12,-.02],[sign*.39,-.19,.02]],.038,yellow);const hand=group(arm);hand.position.set(sign*.4,-.18,.025);oval(hand,yellow,[0,0,0],[.075,.08,.04]);for(let j=0;j<4;j++){const a=-.9+j*.6;tube(hand,[[sign*.035,0,0],[sign*(.10+Math.cos(a)*.055),Math.sin(a)*.105,0]],.023,yellow);}sArms.push(arm);
  const leg=group(sb);leg.position.set(sign*.4,-.92,0);tube(leg,[[0,0,0],[sign*.03,-.23,0]],.038,yellow);oval(leg,cream,[sign*.03,-.34,.01],[.06,.16,.06]);tube(leg,[[sign*.03-.045,-.23,.045],[sign*.03+.045,-.23,.045]],.012,blue);tube(leg,[[sign*.03-.045,-.27,.05],[sign*.03+.045,-.27,.05]],.01,red);oval(leg,sole,[sign*.10,-.52,0],[.19,.075,.065]);oval(leg,black,[sign*.1,-.49,.05],[.19,.085,.09]);sLegs.push(leg);
 }
 sponge.userData={body:sb,eyes:sEyes,arms:sArms,legs:sLegs};
 function limb(g,sections,mat){const pos=[],indices=[],rings=32,sides=28;
  for(let j=0;j<=rings;j++){const t=j/rings*(sections.length-1),k=Math.min(sections.length-2,Math.floor(t)),f=t-k,a=sections[Math.max(0,k-1)],b=sections[k],c=sections[k+1],d=sections[Math.min(sections.length-1,k+2)];const v=b.map((_,n)=>.5*(2*b[n]+(-a[n]+c[n])*f+(2*a[n]-5*b[n]+4*c[n]-d[n])*f*f+(-a[n]+3*b[n]-3*c[n]+d[n])*f*f*f));for(let i=0;i<=sides;i++){const angle=i/sides*TAU;pos.push(v[0]+Math.cos(angle)*Math.max(.003,v[2]),v[1],Math.sin(angle)*Math.max(.003,v[3]));}}
  for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}for(let i=1;i<sides;i++){indices.push(0,i+1,i);const b=rings*(sides+1);indices.push(b,b+i,b+i+1);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(indices);geo.computeVertexNormals();return mesh(g,geo,mat);
 }
 const patrick=group(scene,'drift-patrick'),pb=group(patrick,'patrick-body'),pArms=[],pLegs=[],pEyes=[];models.push(patrick);
 limb(pb,[[0,-.73,.25,.16],[0,-.54,.56,.29],[0,-.13,.65,.35],[0,.22,.50,.29],[0,.58,.30,.23],[.015,1.10,.17,.16],[.055,1.46,.05,.06],[.065,1.53,.012,.016],[.065,1.54,.002,.002]],rose);
 for(const sign of [-1,1]){const arm=group(pb);arm.position.set(sign*.48,.13,-.015);const m=limb(arm,[[0,0,.25,.20],[sign*.03,.32,.19,.15],[sign*.06,.62,.12,.10],[sign*.07,.84,.015,.02],[sign*.07,.86,.002,.002]],rose);m.rotation.z=-sign*1.75;pArms.push(arm);
  const leg=group(pb);leg.position.set(sign*.30,-.51,-.015);const m2=limb(leg,[[0,0,.29,.22],[sign*.035,.25,.245,.19],[sign*.08,.56,.13,.115],[sign*.12,.76,.025,.03],[sign*.12,.79,.002,.002]],rose);m2.rotation.z=-sign*(Math.PI-.40);pLegs.push(leg);
 }
 const clothPositions=[],clothIndices=[],NX=36,NY=16,stride=NX+1,sideSize=(NX+1)*(NY+1);
 for(const side of [1,-1])for(let j=0;j<=NY;j++)for(let i=0;i<=NX;i++){const u=i/NX*2-1,v=j/NY,x=u*.615*(1-v*.055),hem=-.88+.19*Math.exp(-u*u*16),y=mix(-.285+.018*u*u,hem,v),z=side*(Math.sqrt(Math.max(0,1-(x/.665)**2))*.337+.004*Math.sin(x*28)*Math.sin(v*Math.PI));clothPositions.push(x,y,z);}
 for(let side=0;side<2;side++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const a=side*sideSize+j*stride+i,b=a+stride;if(side===0)clothIndices.push(a,b,a+1,b,b+1,a+1);else clothIndices.push(a,a+1,b,b,a+1,b+1);}
 const border=[];for(let i=0;i<=NX;i++)border.push(i);for(let j=1;j<=NY;j++)border.push(j*stride+NX);for(let i=NX-1;i>=0;i--)border.push(NY*stride+i);for(let j=NY-1;j>0;j--)border.push(j*stride);
 for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length];clothIndices.push(a,b,a+sideSize,b,b+sideSize,a+sideSize);}
 const clothGeo=new T.BufferGeometry();clothGeo.setAttribute('position',new T.Float32BufferAttribute(clothPositions,3));clothGeo.setIndex(clothIndices);clothGeo.computeVertexNormals();const shorts=mesh(pb,clothGeo,green);
 for(const sign of [-1,1])tube(pb,[[sign*.10,-.73,.33],[sign*.31,-.86,.29],[sign*.55,-.87,.18]],.008,green);
 tube(pb,[[-.58,-.30,.15],[-.31,-.29,.30],[0,-.28,.337],[.31,-.29,.30],[.58,-.30,.15]],.018,green);
 for(const sign of [-1,1]){pEyes.push(eye(pb,sign*.12,.69,.218,.145));tube(pb,[[sign*.04,.91,.235],[sign*.12,.95,.235],[sign*.21,.93,.215]],.018,mouth);tube(pb,[[sign*.03,.80,.25],[sign*.12,.85,.27],[sign*.23,.80,.24]],.012,rose);oval(pb,cheek,[sign*.31,.40,.258],[.065,.035,.007]);for(let j=0;j<4;j++)oval(pb,cheek,[sign*(.30+j%2*.13),.13-Math.floor(j/2)*.14,.295],[.011,.017,.005]);}
 tube(pb,[[-.22,.40,.29],[-.10,.33,.32],[.06,.33,.33],[.24,.43,.28]],.018,mouth);
 tube(pb,[[-.05,-.11,.35],[0,-.145,.355],[.048,-.10,.35]],.012,mouth);
 patrick.userData={body:pb,eyes:pEyes,arms:pArms,legs:pLegs,shorts};
 const jointVertex=`attribute vec3 detailP,tint,bonePivot;attribute float region,part;attribute vec4 motion;
 varying vec3 p,N,tone;varying float kind;uniform float clock;
 vec3 rx(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
 vec3 ry(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
 vec3 rz(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
 void main(){vec3 v=position,n=normal;float ax=0.,ay=0.,az=0.,stroke=motion.x,seed=motion.y,response=motion.z,effort=motion.w;
 if(part>.5&&part<2.5){float side=part<1.5?-1.:1.,beat=stroke+side*.35;
  az=side*(.08+sin(beat)*(.16+effort*.22));ax=cos(beat-.5)*(.12+effort*.20);ay=side*sin(beat+.7)*.12;
  if(side>0.){ax+=response*.65;ay+=response*sin(clock*7.+seed)*.36;}
 }else if(part>2.5&&part<4.5){float side=part<3.5?-1.:1.;az=sin(stroke*.63+side*1.5)*.13;ax=sin(stroke*.63+side*1.5-.6)*.12;}
 else if(part>4.5){float phase=mod(clock+seed*1.7,6.7),blink=phase<.20?sin(phase/.20*3.14159265):0.,scaleY=1.-blink*.92;v.y=bonePivot.y+(v.y-bonePivot.y)*scaleY;n.y/=scaleY;}
 if(part>.5&&part<4.5){v=bonePivot+rz(ry(rx(v-bonePivot,ax),ay),az);n=rz(ry(rx(n,ax),ay),az);}
 p=detailP;tone=tint;kind=region;N=normalize(normalMatrix*mat3(instanceMatrix)*n);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(v,1.);}`;
 const crowdFragment=yellow.fragmentShader.replace('uniform vec3 tone;uniform float kind;','varying vec3 tone;varying float kind;');
 function compile(template){
  template.updateMatrixWorld(true);const spec=template.userData,joints=[...spec.arms,...spec.legs,...spec.eyes],attrs={position:[],normal:[],detailP:[],tint:[],region:[],part:[],bonePivot:[]},indices=[],p=new T.Vector3(),n=new T.Vector3(),normalMatrix=new T.Matrix3();
  template.traverse(o=>{if(!o.isMesh)return;let node=o,j=-1;while(node&&node!==template){j=joints.indexOf(node);if(j>=0)break;node=node.parent;}
   const pivot=j<0?new T.Vector3():joints[j].getWorldPosition(new T.Vector3()),geo=o.geometry,pos=geo.attributes.position,norm=geo.attributes.normal,base=attrs.part.length,tone=o.material.uniforms.tone.value,region=o.material.uniforms.kind.value;normalMatrix.getNormalMatrix(o.matrixWorld);
   for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);attrs.detailP.push(p.x,p.y,p.z);p.applyMatrix4(o.matrixWorld);n.fromBufferAttribute(norm,i).applyMatrix3(normalMatrix).normalize();attrs.position.push(p.x,p.y,p.z);attrs.normal.push(n.x,n.y,n.z);attrs.tint.push(tone.r,tone.g,tone.b);attrs.region.push(region);attrs.part.push(j+1);attrs.bonePivot.push(pivot.x,pivot.y,pivot.z);}
   if(geo.index)for(let i=0;i<geo.index.count;i++)indices.push(base+geo.index.getX(i));else for(let i=0;i<pos.count;i++)indices.push(base+i);
  });
  const geo=own(new T.BufferGeometry());for(const [name,values]of Object.entries(attrs))geo.setAttribute(name,new T.Float32BufferAttribute(values,['region','part'].includes(name)?1:3));geo.setIndex(indices);
  geo.setAttribute('motion',new T.InstancedBufferAttribute(new Float32Array(MAX_VISITORS*4),4).setUsage(T.DynamicDrawUsage));
  const mat=own(new T.ShaderMaterial({uniforms:{clock:{value:0}},vertexShader:jointVertex,fragmentShader:crowdFragment})),batch=new T.InstancedMesh(geo,mat,MAX_VISITORS);batch.instanceMatrix.setUsage(T.DynamicDrawUsage);batch.count=0;batch.frustumCulled=false;batch.visible=false;batch.renderOrder=6;scene.add(batch);return {mesh:batch,actors:[],kind:template===sponge?'sponge':'patrick'};
 }
 const batches=models.map(compile);for(const model of models){scene.remove(model);model.visible=false;}
 const shadowMat=own(new T.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvv;void main(){vec2 p=(uvv-.5)*3.7;float a=exp(-dot(p,p))*.16;gl_FragColor=vec4(.02,.11,.15,a);}'}));
 const shadowMesh=new T.InstancedMesh(own(new T.PlaneGeometry(3.4,4.1)),shadowMat,MAX_VISITORS);shadowMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);shadowMesh.count=0;shadowMesh.frustumCulled=false;shadowMesh.visible=false;shadowMesh.renderOrder=1;scene.add(shadowMesh);shadows.push(shadowMesh);
 const flowScene=new T.Scene(),format=root.OceanObjectOcclusion,frameSize=new T.Vector2(),flowGeo=own(new T.BufferGeometry()),position=new T.BufferAttribute(new Float32Array(MAX_VISITORS*42*12*3),3).setUsage(T.DynamicDrawUsage),data=new T.BufferAttribute(new Float32Array(MAX_VISITORS*42*12*3),3).setUsage(T.DynamicDrawUsage);
 flowGeo.setAttribute('position',position);flowGeo.setAttribute('flowData',data);flowGeo.setDrawRange(0,0);
 const flowMat=own(new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,uniforms:{clock:{value:0},frameSize:{value:frameSize},surfaceDepth:{value:surfaceDepth},layerCenters:{value:layerCenters},layerFormat:{value:new T.Vector3(format.BANDS,format.CAPACITY,format.SPAN)}},vertexShader:'attribute vec3 flowData;varying vec3 f;void main(){f=flowData;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 f;uniform float clock;uniform vec2 frameSize;uniform sampler2D surfaceDepth,layerCenters;uniform vec3 layerFormat;
 void main(){float a=(1.-smoothstep(0.,1.6,clock-f.x))*(1.-abs(f.y))*f.z*.34;if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float z=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);a*=1.-smoothstep(-.06,.06,z);}if(a<.002)discard;gl_FragColor=vec4(.76,.95,.96,a);}` }));
 const flow=new T.Mesh(flowGeo,flowMat);flow.frustumCulled=false;flow.visible=false;flowScene.add(flow);
 function wake(a,t,i){const h=history[i];while(h.length&&t-h[0].t>1.6)h.shift();if(!a?.visible||a.speed<.025)return;if(h.length&&t-h[h.length-1].t<1/24)return;const p=toWorld(a.u,a.v),r=.95*a.scale,c=Math.cos(a.heading),s=Math.sin(a.heading);h.push({x:p.x,y:p.y,t,rx:c*r,ry:-s*r,power:.5+a.effort*.5});if(h.length>42)h.shift();}
 function updateFlow(t){let n=0;const put=(p,side,e,nx,ny)=>{position.setXYZ(n,p.x+side*p.rx+e*nx*.025,p.y+side*p.ry+e*ny*.025,.015);data.setXYZ(n,p.t,e,p.power);n++;};
  for(const h of history)for(let i=1;i<h.length;i++){const a=h[i-1],b=h[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;for(const side of [-1,1])for(const [p,e]of [[a,-1],[a,1],[b,-1],[a,1],[b,1],[b,-1]])put(p,side,e,-dy/length,dx/length);}
  flowGeo.setDrawRange(0,n);position.needsUpdate=data.needsUpdate=true;flowMat.uniforms.clock.value=t;flow.visible=n>0;
 }
 const matrix=new T.Object3D(),shadowOwners=new WeakMap(),shadowActors=[];
 function hide(){current=null;for(const b of batches){b.mesh.count=0;b.mesh.visible=false;b.actors.length=0;}shadowActors.length=0;shadowMesh.count=0;shadowMesh.visible=flow.visible=false;flowGeo.setDrawRange(0,0);for(const h of history)h.length=0;}
 function render(s,id){if(lastId!==id){hide();lastId=id;lastRipple=0;}current=s;let count=0;shadowActors.length=0;
  for(const b of batches){b.mesh.count=0;b.actors.length=0;b.mesh.material.uniforms.clock.value=s.age;}
  for(let i=0;i<MAX_VISITORS;i++){const a=s.actors[i];wake(a,s.age,i);if(!a?.visible)continue;const b=batches[a.kind==='sponge'?0:1],slot=b.mesh.count++,p=toWorld(a.u,a.v),response=Math.max(a.reaction>0?Math.sin(Math.PI*(1-a.reaction/2.8)):0,a.social>0?Math.sin(Math.PI*clamp(a.social/2.3))*.72:0);
   matrix.position.set(p.x,p.y,a.z);matrix.rotation.set(a.pitch,a.roll,-a.heading,'ZYX');matrix.scale.setScalar(a.scale);matrix.updateMatrix();b.mesh.setMatrixAt(slot,matrix.matrix);b.mesh.geometry.attributes.motion.setXYZW(slot,a.stroke,a.seed,response,a.effort);b.actors.push(a);
   matrix.position.set(p.x+.025,p.y-.03,-5.92);matrix.rotation.set(0,0,-a.heading);matrix.updateMatrix();shadowMesh.setMatrixAt(count++,matrix.matrix);if(!shadowOwners.has(a))shadowOwners.set(a,{z:-5.92});shadowActors.push(shadowOwners.get(a));
  }
  for(const b of batches){b.mesh.visible=b.mesh.count>0;b.mesh.instanceMatrix.needsUpdate=true;b.mesh.geometry.attributes.motion.needsUpdate=true;}
  shadowMesh.count=count;shadowMesh.visible=count>0;shadowMesh.instanceMatrix.needsUpdate=true;updateFlow(s.age);
  if(s.age-lastRipple>.48){lastRipple=s.age;const first=Math.floor(s.age*7)%s.actors.length;for(let j=0;j<5;j++){const a=s.actors[(first+j*13)%s.actors.length];if(a.visible&&a.u>0&&a.u<1&&a.v>0&&a.v<1)ripple(a.u,a.v,.008,.004);}}
 }
 function hit(u,v){if(!current)return false;let nearest=null,best=Infinity;for(const a of current.actors){if(!a.visible)continue;const dx=(u-a.u)*20*aspect(),dy=(v-a.v)*20,c=Math.cos(a.heading),s=Math.sin(a.heading),x=dx*c-dy*s,y=dx*s+dy*c,d=(x/(1.15*a.scale))**2+(y/(1.55*a.scale))**2;if(d<1&&d<best){best=d;nearest={index:a.index};}}return nearest||false;}
 return {render,hide,hit,occlusionLayers:()=>[],occlusionBatches:()=>[...batches,{mesh:shadowMesh,actors:shadowActors}],stats:()=>({visible:shadowMesh.count,bodyDraws:batches.filter(b=>b.mesh.visible).length,bodyTriangles:batches.reduce((n,b)=>n+b.mesh.geometry.index.count/3*b.mesh.count,0),trailVertices:flowGeo.drawRange.count}),
  renderSurface(renderer,camera){if(!flow.visible)return;if(surfaceDepth)renderer.getDrawingBufferSize(frameSize);else frameSize.set(0,0);const clear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(flowScene,camera);}finally{renderer.autoClear=clear;}},
  dispose(){hide();for(const g of [...models,...shadows,...batches.map(b=>b.mesh)])scene.remove(g);for(const r of resources)r.dispose();},models,batches};
}
root.OceanDriftDuo={create,step,interact,pointer,curve,basePose,createStage};
})(root);

}
