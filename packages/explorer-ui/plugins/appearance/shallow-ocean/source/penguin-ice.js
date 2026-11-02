export function install(root, document, window, matchMedia) {
/* Surface erosion and support-driven penguin decisions. No scene-scale melting. */
(function(root){
'use strict';
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const coasts=new WeakMap();
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
function clip(poly,nx,ny,c){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny-c,db=b[0]*nx+b[1]*ny-c;if(da<=0)out.push(a);if((da<0)!==(db<0)){const t=da/(da-db);out.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);}}return out;}
function measure(poly){let area=0,x=0,y=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],q=a[0]*b[1]-b[0]*a[1];area+=q;x+=(a[0]+b[0])*q;y+=(a[1]+b[1])*q;}return {area:Math.abs(area/2),center:Math.abs(area)>1e-8?[x/(3*area),y/(3*area)]:[0,0]};}
function clearance(poly,p){if(poly.length<3)return -Infinity;let d=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-8)continue;d=Math.min(d,(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/length);}return d;}
function create(s,rng,count,coast=()=>1){
 coasts.set(s,coast);
 let value=(Math.floor(s.seed*1e8)^0x68bc21eb)>>>0;const rand=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 s.duration=116;s.entryV=.42+rng()*.20;s.exitV=.24+rng()*.40;s.splashes=[];
 s.breakAt=12+((Math.imul(value^0x9e3779b9,2246822519)>>>0)/4294967296)*7;
 const boundary=Array.from({length:16},(_,i)=>{const a=i/16*TAU,r=1+.035*Math.sin(a*3+s.seed);return [Math.cos(a)*3.6*r,Math.sin(a)*2.65*r];});
 s.boundary=boundary;
 const sites=[[-2.6,-.5],[-1.6,1.5],[.25,1.8],[2.4,1.0],[2.55,-1.2],[.65,-1.8],[-1.3,-1.7],[-.9,.0],[.95,.0]].map(p=>p.map(v=>v+(rand()-.5)*.42));
 s.floes=sites.map((site,index)=>{let poly=boundary;for(const other of sites){if(other===site)continue;const nx=other[0]-site[0],ny=other[1]-site[1],c=(other[0]**2+other[1]**2-site[0]**2-site[1]**2)/2;poly=clip(poly,nx,ny,c);}
  poly=poly.filter((p,i)=>Math.hypot(p[0]-poly[(i+1)%poly.length][0],p[1]-poly[(i+1)%poly.length][1])>1e-8);const m=measure(poly),center=m.center;poly=poly.map(p=>[p[0]-center[0],p[1]-center[1]]);const radius=clearance(poly,[0,0]),life=12+rand()*34,angle=Math.atan2(center[1],center[0]);
  return {index,center,polygon:poly,area:m.area,radius,seed:rand()*TAU,meltAt:s.breakAt+1+rand()*4,rate:radius/life,drift:[Math.cos(angle)*(.015+rand()*.014),Math.sin(angle)*(.015+rand()*.014)],spin:(rand()-.5)*.012};
 });
 const ordered=[...s.floes].sort((a,b)=>a.radius/a.rate-b.radius/b.rate),assigned=[];
 for(let i=0;i<count;i++)assigned.push(ordered[Math.round(i*(ordered.length-1)/(count-1))].index);
 s.actors=assigned.map((piece,index)=>({index,piece,local:[0,0],u:1.4,v:s.entryV,z:.30,heading:Math.PI,pitch:0,roll:0,visible:true,scale:.82+rng()*.12,seed:s.seed+index*1.83,reaction:0,cooldown:0,mode:'standing',hops:[],history:[],plan:null,diveAt:Infinity,diveHit:Infinity,checkAt:17+index*.12,landAt:0}));
 s.actor=s.actors[0];s.icePieces=s.floes.map(f=>iceAt(s,0,f.index));
}
function iceAt(s,t,index){if(s.iceTime===t&&s.icePieces?.[index])return s.icePieces[index];const f=s.floes[index],elapsed=Math.max(0,t-f.meltAt);let poly=f.polygon;
 for(let j=0;j<f.polygon.length&&poly.length>=3;j++){const a=f.polygon[j],b=f.polygon[(j+1)%f.polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=dy/length,ny=-dx/length;
  const erosion=elapsed*f.rate*(.79+.28*(.5+.5*Math.sin(f.seed+j*2.37)));poly=clip(poly,nx,ny,nx*a[0]+ny*a[1]-erosion);
 }
 const m=measure(poly),split=Math.max(0,t-s.breakAt),separate=split*ease(split/3),travel=ease(t/10),base={u:mix(1.38,s.home.u,travel),v:mix(s.entryV,s.home.v,travel)};
 const remaining=m.area/f.area,thickness=.028+.26*Math.sqrt(Math.max(0,remaining));
 return {index,seed:f.seed,u:base.u+(f.center[0]+f.drift[0]*separate)/(20*s.ratio),v:base.v+(f.center[1]+f.drift[1]*separate)/20,z:.015+Math.sin(t*.75+f.seed)*.012*ease(split/3),rotation:f.spin*separate,polygon:poly,area:m.area,center:m.center,thickness,top:.015+Math.sin(t*.75+f.seed)*.012*ease(split/3)+thickness*.53,visible:t>=s.breakAt&&m.area>.012,remaining};
}
function world(s,ice,local){const c=Math.cos(ice.rotation),sn=Math.sin(ice.rotation);return {u:ice.u+(c*local[0]-sn*local[1])/(20*s.ratio),v:ice.v+(sn*local[0]+c*local[1])/20,z:ice.top+.015};}
function standing(s,a,t,idleFn){const ice=iceAt(s,t,a.piece),p=world(s,ice,a.local),idle=idleFn(a,t),gate=ease((t-a.landAt)/.5)*(a.plan?1-ease((t-(a.plan.start-.5))/.3):1),safe=t<s.breakAt?1:clamp(clearance(ice.polygon,a.local)/.65);
 const side=idle.side*gate*safe;p.u+=Math.cos(a.heading)*side/(20*s.ratio);p.v-=Math.sin(a.heading)*side/20;p.z+=idle.hop*gate*safe;
 return {...p,lift:idle.hop*gate*safe,idleWeight:gate*safe,swimming:false,jumping:false};
}
function spots(s,ice,actor){const candidates=[ice.center];for(const r of [.28,.52,.78])for(let i=0;i<8;i++)candidates.push([ice.center[0]+Math.cos(i*TAU/8)*r,ice.center[1]+Math.sin(i*TAU/8)*r]);
 let best=null,score=-Infinity;for(const p of candidates){const edge=clearance(ice.polygon,p);if(edge<.38*actor.scale)continue;const w=world(s,ice,p);let gap=Infinity;
  for(const other of s.actors){if(other===actor)continue;const reserved=other.plan?.targetPiece===ice.index?other.plan.targetLocal:other.mode==='standing'&&other.piece===ice.index?other.local:null;if(reserved)gap=Math.min(gap,Math.hypot(p[0]-reserved[0],p[1]-reserved[1]));}
  if(gap<.53)continue;const rank=edge+Math.min(1,gap)*.2;if(rank>score){score=rank;best={local:p,world:w,edge};}
 }return best;
}
function seaClearance(s,p,coast=coasts.get(s)||(()=>1)){const mu=.42/(20*s.ratio),mv=.42/20;let value=Infinity;for(const [du,dv] of [[0,0],[-mu,0],[mu,0],[0,-mv],[0,mv]])value=Math.min(value,coast(p.u+du,p.v+dv));return value;}
function choose(s,a,t){const current=iceAt(s,t,a.piece),support=clearance(current.polygon,a.local),need=support<.36*a.scale||current.area<.62||current.thickness<.085;
 if(!need)return;
 let best=null,score=-Infinity;const from=world(s,current,a.local),start=t+.48;
 for(const f of s.floes){if(f.index===a.piece)continue;const future=iceAt(s,start+1.15,f.index);if(!future.visible||future.area<Math.max(.80,current.area*1.30)||future.remaining<.12)continue;
  const seat=spots(s,future,a,start+1.15);if(!seat)continue;const distance=Math.hypot((seat.world.u-from.u)*20*s.ratio,(seat.world.v-from.v)*20);if(distance>3.35||distance<.12)continue;
  const benefit=future.area/(1+distance*.9)+seat.edge*.7;if(benefit>score){score=benefit;best={targetPiece:f.index,targetLocal:seat.local,to:seat.world,distance};}
 }
 const plan={start,fromPiece:a.piece,fromLocal:[...a.local],water:!best};
 if(best){Object.assign(plan,best);plan.duration=.80+best.distance*.15;plan.height=.48+best.distance*.22;plan.to=world(s,iceAt(s,start+plan.duration,best.targetPiece),best.targetLocal);}
 else{const f=s.floes[a.piece],angle=Math.atan2(f.center[0],f.center[1]);plan.duration=1.15;plan.height=.80;plan.to={u:from.u+Math.sin(angle)*1.45/(20*s.ratio),v:from.v+Math.cos(angle)*1.45/20,z:-.62};
  for(let i=0;i<60&&seaClearance(s,plan.to)<.08;i++){plan.to.u+=.012;plan.to.v-=.006;}
  plan.heading=Math.atan2((plan.to.u-from.u)*s.ratio,plan.to.v-from.v);a.diveAt=start;}
 plan.from=world(s,iceAt(s,start,a.piece),a.local);a.plan=plan;a.hops.push({start,duration:plan.duration,water:plan.water});
 if(plan.water){let lo=0,hi=1;for(let j=0;j<28;j++){const q=(lo+hi)/2,z=mix(plan.from.z,plan.to.z,q)+4*q*(1-q)*plan.height;if(z>0)lo=q;else hi=q;}a.diveHit=start+(lo+hi)/2*plan.duration;}
 a.history.push({at:t,from:a.piece,to:best?.targetPiece??'water',area:current.area,support,distance:best?.distance??1.45,targetArea:best?iceAt(s,start+plan.duration,best.targetPiece).area:0});
}
function flight(a,t){const p=a.plan,q=clamp((t-p.start)/p.duration),horizontal=ease(q),lift=4*q*(1-q)*p.height;return {u:mix(p.from.u,p.to.u,horizontal),v:mix(p.from.v,p.to.v,horizontal),z:mix(p.from.z,p.to.z,q)+lift,lift,jumping:true,swimming:false,idleWeight:0,progress:q};}
function circle(s,a,since){const lap=18+a.index*.4,r=a.swimRadius??(1.65+.12*a.index),theta=a.swimHeading,angle=-theta+since/lap*TAU;
 return {u:a.water.u+(Math.cos(angle)-Math.cos(theta))*r/(20*s.ratio),v:a.water.v+(Math.sin(angle)+Math.sin(theta))*r/20};
}
function exitPose(s,a,exit,q){const p=circle(s,a,18+a.index*.4+clamp(q)*exit.duration),blend=ease(q);return {u:mix(p.u,exit.u,blend),v:mix(p.v,exit.v,blend)};}
function planExit(s,a,coast=coasts.get(s)||(()=>1)){
 let value=(Math.floor(a.seed*1e7)^Math.imul(a.index+1,0x68bc21eb))>>>0;const rand=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 const edges=['top','right','bottom'],first=Math.floor(rand()*3),water=p=>seaClearance(s,p,coast)>.025;
 a.swimRadius=1.65+.12*a.index;for(let attempt=0;attempt<20;attempt++){let safe=true;for(let i=0;i<64;i++)if(!water(circle(s,a,(18+a.index*.4)*i/64))){safe=false;break;}if(safe)break;a.swimRadius*=.8;}
 for(let edge=0;edge<3;edge++)for(let i=0;i<24;i++){const side=edges[(first+edge)%3],along=.16+rand()*.76,exit={edge:side,u:side==='right'?1.24:along,v:side==='top'?1.24:side==='bottom'?-.24:along,duration:9};
  const gate={u:side==='right'?.99:along,v:side==='top'?.99:side==='bottom'?.01:along};if(!water(gate))continue;
  let safe=true;for(let j=0;j<=48;j++){const p=exitPose(s,a,exit,j/48);if(p.u>=0&&p.u<=1&&p.v>=0&&p.v<=1&&!water(p)){safe=false;break;}}
  if(safe)return exit;
 }
 return {edge:'right',u:1.24,v:clamp(a.water.v,.12,.88),duration:9};
}
function swimming(s,a,t){const since=t-a.swimAt,lap=18+a.index*.4;let {u,v}=circle(s,a,since);
 if(since>lap)({u,v}=exitPose(s,a,a.exit,(since-lap)/a.exit.duration));
 return {u,v,z:-.62+Math.sin(t*2+a.seed)*.035*ease(since/.8),lift:0,swimming:true,jumping:false,idleWeight:0,progress:1};
}
function step(s,dt,idleFn,splash){const t=s.age;s.icePieces=s.floes.map(f=>iceAt(s,t,f.index));s.iceTime=t;
 s.intactIce={polygon:s.boundary,center:[0,0],area:measure(s.boundary).area,remaining:1,thickness:.288,seed:s.seed,u:mix(1.38,s.home.u,ease(t/10)),v:mix(s.entryV,s.home.v,ease(t/10)),z:.015,rotation:0,visible:t<s.breakAt};
 s.raft=s.intactIce.visible?1:Math.max(0,...s.icePieces.filter(p=>p.visible).map(p=>p.remaining));
 for(const a of s.actors){const before={u:a.u,v:a.v,z:a.z};
  if(a.mode==='standing'&&!a.plan&&t>a.checkAt&&t>s.breakAt+.3){choose(s,a,t);a.checkAt=t+.20;}
  let pose;if(a.plan&&t>=a.plan.start){a.mode='jumping';pose=flight(a,t);
   if(a.plan.water&&t>=a.diveHit&&!a.splashed){a.splashed=true;const hit=flight(a,a.diveHit),key=`penguin-${a.index}-dive`;s.marks.push(key);s.splashes.push({key,member:a.index,at:a.diveHit,u:hit.u,v:hit.v,heading:a.plan.heading,type:'in'});splash(hit.u,hit.v);}
   if(t>=a.plan.start+a.plan.duration){const p=a.plan;if(p.water){a.mode='swimming';a.swimAt=p.start+p.duration;a.water={...p.to};a.swimHeading=p.heading;a.exit=planExit(s,a);a.plan=null;pose=swimming(s,a,t);}else{a.mode='standing';a.piece=p.targetPiece;a.local=[...p.targetLocal];a.landAt=p.start+p.duration;a.plan=null;a.checkAt=t+.45;pose=standing(s,a,t,idleFn);}}
  }else if(a.mode==='swimming')pose=swimming(s,a,t);else pose=standing(s,a,t,idleFn);
  Object.assign(a,pose);a.visible=a.mode!=='swimming'||t<a.swimAt+18+a.index*.4+a.exit.duration;
  const dx=(a.u-before.u)*20*s.ratio,dy=(a.v-before.v)*20;a.speed=dt>0?Math.hypot(dx,dy)/dt:0;a.swimBlend=Number.isFinite(a.diveAt)?ease((t-a.diveAt-.38)/1.05):0;
  a.desiredHeading=a.plan?Math.atan2((a.plan.to.u-a.plan.from.u)*s.ratio,a.plan.to.v-a.plan.from.v):a.swimming?Math.atan2(dx,dy):Math.PI+idleFn(a,t).turn;
 }
 const afloat=s.actors.filter(a=>a.mode==='standing').length,ice=s.icePieces.filter(p=>p.visible).length;
 s.phase=`${s.actors.length} 只企鹅 · ${t<10?'乘完整浮冰漂来':t<s.breakAt?'在完整浮冰上嬉戏':afloat?`${afloat} 只等待或寻找落脚处 · ${ice} 块浮冰`:s.actors.some(a=>a.jumping)?'最后的企鹅跃入海中':'结伴潜游 · 先后离开'}`;
 return t>=s.duration||s.actors.every(a=>!a.visible);
}
function updateGeometry(geometry,edgeGeometry,ice){const position=geometry.attributes.position,normal=geometry.attributes.normal,poly=ice.polygon;let count=0;
 const triangle=(a,b,c)=>{const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,d=Math.hypot(nx,ny,nz)||1;
  for(const p of [a,b,c]){position.setXYZ(count,...p);normal.setXYZ(count,nx/d,ny/d,nz/d);count++;}
 };
 const rim=[];for(let i=0;i<poly.length;i++){const a=poly[(i+poly.length-1)%poly.length],b=poly[i],c=poly[(i+1)%poly.length],left=[mix(b[0],a[0],.12),mix(b[1],a[1],.12)],right=[mix(b[0],c[0],.12),mix(b[1],c[1],.12)];for(let j=0;j<3;j++){const q=j/2;rim.push([(1-q)**2*left[0]+2*(1-q)*q*b[0]+q*q*right[0],(1-q)**2*left[1]+2*(1-q)*q*b[1]+q*q*right[1]]);}
  const next=[mix(c[0],b[0],.12),mix(c[1],b[1],.12)];for(let j=1;j<4;j++){const q=j/4,x=mix(right[0],next[0],q),y=mix(right[1],next[1],q),dx=ice.center[0]-x,dy=ice.center[1]-y,d=Math.hypot(dx,dy)||1,bite=(1-ice.remaining)*.10*Math.sin(q*Math.PI)**2*(.5+.5*Math.sin(x*11+y*7+ice.seed));rim.push([x+dx/d*bite,y+dy/d*bite]);}
 }
 if(rim.length<3){geometry.setDrawRange(0,0);edgeGeometry.setDrawRange(0,0);return;}
 const center=ice.center,top=ice.thickness*.53,bottom=-ice.thickness*.47,bevel=Math.min(.035,ice.thickness*.25),cap=p=>[mix(p[0],center[0],.022),mix(p[1],center[1],.022),top],edge=p=>[p[0],p[1],top-bevel],low=p=>[p[0],p[1],bottom+bevel],foot=p=>[mix(p[0],center[0],.012),mix(p[1],center[1],.012),bottom];
 for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length],A=cap(a),B=cap(b),C=edge(a),D=edge(b),E=low(a),F=low(b),G=foot(a),H=foot(b);
  triangle([center[0],center[1],top-.009*(1-ice.remaining)],A,B);triangle(A,C,D);triangle(A,D,B);triangle(C,E,F);triangle(C,F,D);triangle(E,G,H);triangle(E,H,F);triangle([center[0],center[1],bottom],H,G);
  edgeGeometry.attributes.position.setXYZ(i,A[0],A[1],top+.003);
 }
 geometry.setDrawRange(0,count);position.needsUpdate=true;normal.needsUpdate=true;edgeGeometry.setDrawRange(0,rim.length);edgeGeometry.attributes.position.needsUpdate=true;
}
root.OceanPenguinIce={create,step,iceAt,clip,measure,clearance,world,flight,updateGeometry,planExit,exitPose};
})(root);

}
