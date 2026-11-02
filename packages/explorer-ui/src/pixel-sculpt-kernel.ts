// @ts-nocheck -- Preserved Pixel Sculpt shaders and interaction equations.
import {requestBackgroundFrame,cancelBackgroundFrame} from './background-startup-hold';
import {kernelEvent} from './core/background-runtime/kernel-events';
export function startPixelKernel(canvas,onError,initial={},emit=kernelEvent){
let disposed=false,raf=0,paused=false,timeOffset=0,hiddenAt=0,initialized=false,autoRequested=false,firstPaint=false;
const document=globalThis.document,hostCanvas=canvas,events=new AbortController();
let resolveFirst;const ready=new Promise(resolve=>resolveFirst=resolve);

const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:false});
if(!gl)throw Error('BG_PIXEL_WEBGL2: WebGL2 is required.');
const state={resolution:100,depth:8,gap:0.05,shape:'square',radius:18,strength:1,hover:'raise',click:'pulse',clickStrength:2,pulseSpeed:11,colorMode:'image',baseColor:'#ffffff',backgroundColor:'transparent',invert:false,removeBg:false,tolerance:0.12,tilt:45,scale:1.2,offsetX:0,offsetY:0,rotation:0,auto:false,rotateSpeed:2,dpr:2,galleryAuto:true,displayTime:6,transitionDuration:1.2,transitionSpread:10,galleryLoop:true};
let openingStart=NaN,openingProgress=0;
let W=0,H=0,DPR=2,stageW=0,cols=0,rows=0,imageAspect=1,instanceCount=0,sourceImage=null,pickData=new Float32Array(0);let pointer=[9999,9999],pointerInside=false,clickPos=[9999,9999],clickStart=-99,camPos=[0,0,0],vp=null,invVP=null;
const MAX_PULSES=8,pulsePositions=new Float32Array(MAX_PULSES*2),pulseAges=new Float32Array(MAX_PULSES);let pulses=[];
const morphVs=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNormal;
layout(location=2)in vec2 iCenter;layout(location=3)in vec3 iColor;layout(location=4)in float iLum;layout(location=5)in float iRand;layout(location=6)in float iPresence;
layout(location=7)in vec2 iTargetCenter;layout(location=8)in vec3 iTargetColor;layout(location=9)in float iTargetLum;layout(location=10)in float iTargetRand;layout(location=11)in float iTargetPresence;
uniform mat4 uVP;uniform float uTime;uniform float uDepth;uniform float uGap;uniform float uRadius;uniform float uStrength;uniform vec2 uPointer;uniform int uHover;uniform int uClick;uniform float uClickAge;uniform vec2 uClickPos;uniform float uClickStrength;uniform float uPulseSpeed;uniform int uPulseCount;uniform vec2 uPulsePos[8];uniform float uPulseAge[8];uniform int uColorMode;uniform int uInvert;uniform int uRemoveBg;uniform vec3 uBaseColor;
uniform float uOpening;uniform float uTransition;uniform float uTransitionSpread;uniform int uMorphing;
out vec3 vColor;out vec3 vNormal;out vec3 vWorld;out float vTopness;out float vAlpha;out float vMotion;
float gauss(float x,float k){return exp(-x*x*k);}
void main(){
  float morph=uMorphing==1?uTransition:0.0;
  vec2 center=mix(iCenter,iTargetCenter,morph);
  vec3 sampleColor=mix(iColor,iTargetColor,morph);
  float sampleLum=mix(iLum,iTargetLum,morph),sampleRand=mix(iRand,iTargetRand,morph),presence=mix(iPresence,iTargetPresence,morph);
  float lum=(uInvert==1)?(1.0-sampleLum):sampleLum;
  float tileHeight=max(0.025,lum*uDepth);
  float gapAmt=clamp(uGap,0.0,0.96),tileScale=max(0.02,1.0-gapAmt);
  vec3 p=aPos,n=aNormal;float presenceScale=smoothstep(0.0,1.0,presence);p.xy*=tileScale*presenceScale;p.z*=tileHeight*presenceScale;
  float motion=0.0;
  if(uMorphing==1){
    vec2 delta=iTargetCenter-iCenter;
    float arc=sin(morph*3.14159265),foreground=uRemoveBg==1?smoothstep(0.025,0.14,max(sampleColor.r,max(sampleColor.g,sampleColor.b))):1.0;
    motion=arc*foreground*presenceScale;
    float travel=length(iTargetCenter-iCenter),lift=motion*uTransitionSpread*(0.18+0.34*sampleRand);
    vec2 tangent=travel>0.001?normalize(vec2(-delta.y,delta.x)):vec2(0.0);
    vec2 radial=length(center)>0.001?normalize(center):vec2(0.0,1.0);
    vec2 drift=vec2(cos(sampleRand*6.2831853),sin(sampleRand*6.2831853));
    center+=tangent*motion*min(travel*0.08,uTransitionSpread*0.04)*(sampleRand-0.5);
    center+=radial*motion*uTransitionSpread*0.12+drift*motion*uTransitionSpread*0.025;
    p.z+=lift;
  }
  float d=distance(center,uPointer),radius=max(uRadius,0.001),infl=gauss(d/radius,2.35);
  if(uHover==0){p.z+=infl*uStrength*0.95;}else if(uHover==1){vec2 dir=normalize(center-uPointer+vec2(cos(sampleRand*6.2831),sin(sampleRand*6.2831))*0.02);p.xy+=dir*infl*uStrength*0.55;p.z+=infl*uStrength*0.55;}
  if(uClick==0){for(int pi=0;pi<8;pi++){if(pi>=uPulseCount)break;float age=max(uPulseAge[pi],0.0),rd=distance(center,uPulsePos[pi]),front=age*uPulseSpeed,diff=rd-front,ring=exp(-diff*diff*0.24),outwardFade=exp(-rd/max(uRadius*1.8,1.0));p.z+=ring*outwardFade*uClickStrength*1.85;}}
  else if(uClick==1){float age=max(uClickAge,0.0),rd=distance(center,uClickPos),localT=clamp((age-rd*0.018)/1.15,0.0,1.0),rebuild=sin(localT*3.14159265),rebuildPower=uClickStrength*0.5,ang=sampleRand*6.2831853;vec2 jitter=vec2(cos(ang),sin(ang));p.xy+=jitter*rebuild*uClickStrength*0.08;p.z-=rebuild*(tileHeight+uDepth*0.55)*rebuildPower;}
  vec3 world=vec3(center,0.0)+p;vWorld=world;vNormal=normalize(n);vTopness=clamp(vNormal.z*0.5+0.5,0.0,1.0);vAlpha=presence>0.001?1.0:0.0;vMotion=motion;
  if(uColorMode==0){vColor=sampleColor;}else if(uColorMode==1){vColor=uBaseColor;}else{vColor=uBaseColor*mix(0.18,1.0,lum);}
  gl_Position=uVP*vec4(world,1.0);
  if(uOpening<1.0){
    float delay=sampleRand*.32;
    float age=max(0.0,(uOpening-delay)/.60);
    float fall=clamp(age,0.0,1.0);
    float lift=age<1.0?(1.0-fall*fall)*3.0:abs(sin((age-1.0)*18.0))*exp(-(age-1.0)*18.0)*.045;
    gl_Position.y+=lift*gl_Position.w;
    vAlpha*=smoothstep(0.0,.06,age);
  }
}`;
const fs=`#version 300 es
precision highp float;
in vec3 vColor;in vec3 vNormal;in vec3 vWorld;in float vTopness;in float vAlpha;in float vMotion;
uniform vec3 uCamPos;
out vec4 outColor;
void main(){
  if(vAlpha<0.003)discard;
  vec3 n=normalize(vNormal);
  vec3 lightDir=normalize(vec3(-0.45,-0.55,0.78));
  vec3 viewDir=normalize(uCamPos-vWorld);
  float diffuse=max(dot(n,lightDir),0.0);
  float topFace=smoothstep(0.86,0.98,vTopness);
  float sideLight=mix(0.34+0.50*diffuse,0.68+0.24*diffuse,smoothstep(0.0,0.45,vMotion));
  float topLight=0.92+0.08*diffuse;
  float faceLight=mix(sideLight,topLight,topFace);
  vec3 coolShade=vec3(0.94,0.80,0.66);
  vec3 warmLight=vec3(1.06,1.015,0.93);
  vec3 tint=mix(coolShade,warmLight,smoothstep(0.0,0.85,diffuse));
  vec3 halfDir=normalize(lightDir+viewDir);
  float specular=pow(max(dot(n,halfDir),0.0),48.0)*0.11*topFace;
  float edgeShade=pow(1.0-max(n.z,0.0),1.35)*0.06;
  vec3 color=vColor*tint*faceLight;
  color*=1.0-edgeShade;
  color+=warmLight*specular;
  outColor=vec4(max(color,vec3(0.0)),vAlpha);
}`;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function createProgram(vertexSource){const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));return program}
function sharedUniforms(program){return {uVP:gl.getUniformLocation(program,'uVP'),uOpening:gl.getUniformLocation(program,'uOpening'),uDepth:gl.getUniformLocation(program,'uDepth'),uGap:gl.getUniformLocation(program,'uGap'),uColorMode:gl.getUniformLocation(program,'uColorMode'),uInvert:gl.getUniformLocation(program,'uInvert'),uRemoveBg:gl.getUniformLocation(program,'uRemoveBg'),uBaseColor:gl.getUniformLocation(program,'uBaseColor'),uCamPos:gl.getUniformLocation(program,'uCamPos')}}
function interactionUniforms(program){return {uRadius:gl.getUniformLocation(program,'uRadius'),uStrength:gl.getUniformLocation(program,'uStrength'),uPointer:gl.getUniformLocation(program,'uPointer'),uHover:gl.getUniformLocation(program,'uHover'),uClick:gl.getUniformLocation(program,'uClick'),uClickAge:gl.getUniformLocation(program,'uClickAge'),uClickPos:gl.getUniformLocation(program,'uClickPos'),uClickStrength:gl.getUniformLocation(program,'uClickStrength'),uPulseSpeed:gl.getUniformLocation(program,'uPulseSpeed'),uPulseCount:gl.getUniformLocation(program,'uPulseCount'),uPulsePos:gl.getUniformLocation(program,'uPulsePos[0]'),uPulseAge:gl.getUniformLocation(program,'uPulseAge[0]')}}
const morphProgram=createProgram(morphVs);
const morphU={...sharedUniforms(morphProgram),...interactionUniforms(morphProgram),uTransition:gl.getUniformLocation(morphProgram,'uTransition'),uTransitionSpread:gl.getUniformLocation(morphProgram,'uTransitionSpread'),uMorphing:gl.getUniformLocation(morphProgram,'uMorphing')};
function makePrism(kind){
  let pts=[];
  if(kind==='square')pts=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
  else if(kind==='hex')for(let i=0;i<6;i++){let a=Math.PI/6+i*Math.PI/3;pts.push([Math.cos(a)*.52,Math.sin(a)*.52])}
  else for(let i=0;i<20;i++){let a=i/20*Math.PI*2;pts.push([Math.cos(a)*.5,Math.sin(a)*.5])}
  const pos=[],norm=[],indices=[];
  function vertex(x,y,z,nx,ny,nz){const index=pos.length/3;pos.push(x,y,z);norm.push(nx,ny,nz);return index}
  const topCenter=vertex(0,0,1,0,0,1),bottomCenter=vertex(0,0,0,0,0,-1);
  const top=pts.map(p=>vertex(p[0],p[1],1,0,0,1));
  const bottom=pts.map(p=>vertex(p[0],p[1],0,0,0,-1));
  for(let i=0;i<pts.length;i++){
    const j=(i+1)%pts.length;
    indices.push(topCenter,top[i],top[j],bottomCenter,bottom[j],bottom[i]);
  }
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],ex=b[0]-a[0],ey=b[1]-a[1],len=Math.hypot(ex,ey)||1,nx=ey/len,ny=-ex/len;
    const a0=vertex(a[0],a[1],0,nx,ny,0),b0=vertex(b[0],b[1],0,nx,ny,0),b1=vertex(b[0],b[1],1,nx,ny,0),a1=vertex(a[0],a[1],1,nx,ny,0);
    indices.push(a0,b0,b1,a0,b1,a1);
  }
  return {pos:new Float32Array(pos),norm:new Float32Array(norm),indices:new Uint16Array(indices),indexCount:indices.length,vertexCount:pos.length/3};
}
const geos={square:makePrism('square'),round:makePrism('round'),hex:makePrism('hex')},staticVaos={},morphVaos={};
let currentBuffer=gl.createBuffer(),morphFromBuffer=gl.createBuffer(),morphToBuffer=gl.createBuffer();
function bindMorphInstanceSet(buffer,base){
  const stride=8*4;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.enableVertexAttribArray(base);gl.vertexAttribPointer(base,2,gl.FLOAT,false,stride,0);gl.vertexAttribDivisor(base,1);
  gl.enableVertexAttribArray(base+1);gl.vertexAttribPointer(base+1,3,gl.FLOAT,false,stride,2*4);gl.vertexAttribDivisor(base+1,1);
  gl.enableVertexAttribArray(base+2);gl.vertexAttribPointer(base+2,1,gl.FLOAT,false,stride,5*4);gl.vertexAttribDivisor(base+2,1);
  gl.enableVertexAttribArray(base+3);gl.vertexAttribPointer(base+3,1,gl.FLOAT,false,stride,6*4);gl.vertexAttribDivisor(base+3,1);
  gl.enableVertexAttribArray(base+4);gl.vertexAttribPointer(base+4,1,gl.FLOAT,false,stride,7*4);gl.vertexAttribDivisor(base+4,1);
}
function createShapeVao(g,fromBuffer,toBuffer){
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,g.vertexBuffer);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,g.pos.byteLength);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.indexBuffer);
  bindMorphInstanceSet(fromBuffer,2);bindMorphInstanceSet(toBuffer||fromBuffer,7);
  return vao;
}
for(const [name,g] of Object.entries(geos)){
  const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);g.vertexBuffer=vb;
  gl.bufferData(gl.ARRAY_BUFFER,g.pos.byteLength+g.norm.byteLength,gl.STATIC_DRAW);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,g.pos);gl.bufferSubData(gl.ARRAY_BUFFER,g.pos.byteLength,g.norm);
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.indices,gl.STATIC_DRAW);g.indexBuffer=ib;
  staticVaos[name]=createShapeVao(g,currentBuffer,currentBuffer);
  morphVaos[name]=createShapeVao(g,morphFromBuffer,morphToBuffer);
}
gl.bindVertexArray(null);
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.disable(gl.BLEND);
function hash(x,y){let v=Math.sin(x*127.1+y*311.7)*43758.5453123;return v-Math.floor(v)}
function packDataset(dataset){const packed=new Float32Array(dataset.count*8);for(let i=0;i<dataset.count;i++){for(let k=0;k<7;k++)packed[i*8+k]=dataset.data[i*7+k]||0;packed[i*8+7]=1}return packed}
function uploadDataset(buffer,dataset){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,packDataset(dataset),gl.STATIC_DRAW)}
function heightGridFromInstances(data,c,r){const grid=new Float32Array(c*r);grid.fill(-1);for(let i=0;i<data.length;i+=7){const x=Math.round(data[i]+(c-1)/2),y=Math.round((r-1)/2-data[i+1]);if(x>=0&&x<c&&y>=0&&y<r)grid[y*c+x]=data[i+5]}return grid}

let currentDataset=null,transition=null,galleryShownAt=0,currentGalleryIndex=-1;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function simulationNow(){return Math.max(0,(hiddenAt||performance.now()/1000)-timeOffset);}
function scheduleFrame(){if(!disposed&&initialized&&(!paused||!firstPaint)&&(!document.hidden||!firstPaint)&&!raf)raf=requestBackgroundFrame(canvas,ms=>{raf=0;try{render(ms);}catch(error){onError(String(error));}});}
function activateDataset(dataset){currentDataset=dataset;cols=dataset.cols;rows=dataset.rows;imageAspect=dataset.aspect;instanceCount=dataset.count;pickData=dataset.pickData;}
function transitionProgress(now){return transition?Math.min(1,Math.max(0,(now-transition.start)/transition.duration)):1}
function easedProgress(value){return value*value*(3-2*value)}
function gridRecordOffsets(dataset){
  const offsets=new Int32Array(dataset.cols*dataset.rows);offsets.fill(-1);
  for(let i=0;i<dataset.count;i++){
    const a=i*7,x=Math.round(dataset.data[a]+(dataset.cols-1)/2),y=Math.round((dataset.rows-1)/2-dataset.data[a+1]);
    if(x>=0&&x<dataset.cols&&y>=0&&y<dataset.rows)offsets[y*dataset.cols+x]=a;
  }
  return offsets;
}
function mappedRecordOffset(dataset,offsets,gx,gy,gridCols,gridRows){
  const sx=dataset.cols>1&&gridCols>1?Math.round(gx*(dataset.cols-1)/(gridCols-1)):0;
  const sy=dataset.rows>1&&gridRows>1?Math.round(gy*(dataset.rows-1)/(gridRows-1)):0;
  const canonicalX=dataset.cols>1&&gridCols>1?Math.round(sx*(gridCols-1)/(dataset.cols-1)):0;
  const canonicalY=dataset.rows>1&&gridRows>1?Math.round(sy*(gridRows-1)/(dataset.rows-1)):0;
  return gx===canonicalX&&gy===canonicalY?offsets[sy*dataset.cols+sx]:-1;
}
function buildMorphPair(fromDataset,toDataset){
  const gridCols=Math.max(fromDataset.cols,toDataset.cols),gridRows=Math.max(fromDataset.rows,toDataset.rows);
  const fromOffsets=gridRecordOffsets(fromDataset),toOffsets=gridRecordOffsets(toDataset),fromValues=[],toValues=[];
  for(let gy=0;gy<gridRows;gy++)for(let gx=0;gx<gridCols;gx++){
    const fromOffset=mappedRecordOffset(fromDataset,fromOffsets,gx,gy,gridCols,gridRows),toOffset=mappedRecordOffset(toDataset,toOffsets,gx,gy,gridCols,gridRows);
    if(fromOffset<0&&toOffset<0)continue;
    const fromRecord=fromOffset>=0?fromOffset:toOffset,toRecord=toOffset>=0?toOffset:fromOffset;
    for(let k=0;k<7;k++){fromValues.push(fromOffset>=0?fromDataset.data[fromRecord+k]:toDataset.data[fromRecord+k]);toValues.push(toOffset>=0?toDataset.data[toRecord+k]:fromDataset.data[toRecord+k]);}
    fromValues.push(fromOffset>=0?1:0);toValues.push(toOffset>=0?1:0);
  }
  const fromData=new Float32Array(fromValues),toData=new Float32Array(toValues);
  return {fromData,toData,count:fromData.length/8};
}
function presentationDataset(t,e){
  const values=[];
  for(let i=0;i<t.pair.count;i++){
    const a=i*8,presence=t.pair.fromData[a+7]+(t.pair.toData[a+7]-t.pair.fromData[a+7])*e;
    if(presence<.5)continue;
    for(let k=0;k<7;k++)values.push(t.pair.fromData[a+k]+(t.pair.toData[a+k]-t.pair.fromData[a+k])*e);
  }
  const data=new Float32Array(values),pick=new Float32Array(data.length/7*3);
  for(let i=0;i<data.length/7;i++){pick[i*3]=data[i*7];pick[i*3+1]=data[i*7+1];pick[i*3+2]=data[i*7+5]}
  const image=e>=.5?t.targetItem.image:{width:cols,height:rows},c=Math.round(cols+(t.targetDataset.cols-cols)*e),r=Math.round(rows+(t.targetDataset.rows-rows)*e);
  return {data,pickData:pick,heightGrid:heightGridFromInstances(data,c,r),count:data.length/7,cols:c,rows:r,aspect:image?.width&&image?.height?image.width/image.height:imageAspect,image,key:'presentation',synthetic:true};
}

function promoteTransition(){if(!transition)return;const t=transition;uploadDataset(currentBuffer,t.targetDataset);activateDataset(t.targetDataset);transition=null;galleryShownAt=simulationNow();emit('pixel-transition',null);}
function settleInterruptedTransition(now){if(!transition)return;const dataset=presentationDataset(transition,easedProgress(transitionProgress(now)));uploadDataset(currentBuffer,dataset);activateDataset(dataset);transition=null;}
function setDataset(dataset,immediate=false){
 const now=simulationNow();if(!currentDataset)openingStart=now;settleInterruptedTransition(now);autoRequested=false;
 if(!currentDataset||immediate||reducedMotion.matches){uploadDataset(currentBuffer,dataset);activateDataset(dataset);transition=null;galleryShownAt=now;}
 else{const pair=buildMorphPair(currentDataset,dataset);gl.bindBuffer(gl.ARRAY_BUFFER,morphFromBuffer);gl.bufferData(gl.ARRAY_BUFFER,pair.fromData,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,morphToBuffer);gl.bufferData(gl.ARRAY_BUFFER,pair.toData,gl.STATIC_DRAW);transition={targetItem:{image:{width:dataset.cols,height:dataset.rows}},targetDataset:dataset,pair,start:now,duration:Math.max(.05,state.transitionDuration)};}
 initialized=true;scheduleFrame();
}
function resize(){const rect=canvas.parentElement?.getBoundingClientRect();W=Math.max(1,rect?.width||innerWidth);H=Math.max(1,rect?.height||innerHeight);DPR=Math.min(devicePixelRatio||1,state.dpr);const width=Math.round(W*DPR),height=Math.round(H*DPR);if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;canvas.style.width='100%';canvas.style.height='100%';stageW=W;scheduleFrame();}globalThis.addEventListener('resize',resize);const sizeObserver=new ResizeObserver(()=>{if(!disposed)resize();});if(canvas.parentElement)sizeObserver.observe(canvas.parentElement);resize();applyCanvasBg();
function identity(){let m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m}
function multiply(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3]}return o}
function lookAt(e,c,u){let zx=e[0]-c[0],zy=e[1]-c[1],zz=e[2]-c[2],zl=Math.hypot(zx,zy,zz);zx/=zl;zy/=zl;zz/=zl;let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx,xl=Math.hypot(xx,xy,xz);xx/=xl;xy/=xl;xz/=xl;let yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;let o=identity();o[0]=xx;o[1]=yx;o[2]=zx;o[4]=xy;o[5]=yy;o[6]=zy;o[8]=xz;o[9]=yz;o[10]=zz;o[12]=-(xx*e[0]+xy*e[1]+xz*e[2]);o[13]=-(yx*e[0]+yy*e[1]+yz*e[2]);o[14]=-(zx*e[0]+zy*e[1]+zz*e[2]);return o}
function ortho(l,r,b,t,n,f){let o=new Float32Array(16);o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;return o}
function invert(a){let out=new Float32Array(16),b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14],det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return identity();det=1/det;out[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det;out[1]=(-a[1]*b11+a[2]*b10-a[3]*b09)*det;out[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det;out[3]=(-a[9]*b05+a[10]*b04-a[11]*b03)*det;out[4]=(-a[4]*b11+a[6]*b08-a[7]*b07)*det;out[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;out[6]=(-a[12]*b05+a[14]*b02-a[15]*b01)*det;out[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;out[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det;out[9]=(-a[0]*b10+a[1]*b08-a[3]*b06)*det;out[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det;out[11]=(-a[8]*b04+a[9]*b02-a[11]*b00)*det;out[12]=(-a[4]*b09+a[5]*b07-a[6]*b06)*det;out[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;out[14]=(-a[12]*b03+a[13]*b01-a[14]*b00)*det;out[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;return out}
function tx(m,v){let x=v[0],y=v[1],z=v[2],w=v[3]??1;return [m[0]*x+m[4]*y+m[8]*z+m[12]*w,m[1]*x+m[5]*y+m[9]*z+m[13]*w,m[2]*x+m[6]*y+m[10]*z+m[14]*w,m[3]*x+m[7]*y+m[11]*z+m[15]*w]}
function cameraMatrices(time){let frameCols=cols,frameRows=rows;if(transition){let q=transitionProgress(time),e=q*q*(3-2*q);frameCols=cols+(transition.targetDataset.cols-cols)*e;frameRows=rows+(transition.targetDataset.rows-rows)*e}const baseYaw=0,frameDepth=8,frameClickStrength=2;let tilt=state.tilt*Math.PI/180,yaw=(baseYaw+state.rotation+(state.auto?time*state.rotateSpeed*6:0))*Math.PI/180,s=Math.sin(tilt),c=Math.cos(tilt),sy=Math.sin(yaw),cy=Math.cos(yaw),dist=Math.max(frameCols,frameRows)*2.45+frameDepth*3.2;let target=[0,0,frameDepth*.2];camPos=[dist*s*sy,-dist*s*cy,target[2]+dist*c];let view=lookAt(camPos,target,[0,1,0]);let pts=[],zmax=frameDepth+Math.max(4,frameClickStrength*3.2);for(let x of [-frameCols/2,frameCols/2])for(let y of [-frameRows/2,frameRows/2])for(let z of [-frameDepth*.7,zmax])pts.push(tx(view,[x,y,z,1]));let maxx=1,maxy=1;for(let p of pts){maxx=Math.max(maxx,Math.abs(p[0]));maxy=Math.max(maxy,Math.abs(p[1]))}let aspect=stageW/H,hw=maxx*1.54/state.scale,hh=maxy*1.54/state.scale;if(hw/hh>aspect)hh=hw/aspect;else hw=hh*aspect;let ox=-state.offsetX*frameCols,oy=state.offsetY*frameRows;let proj=ortho(-hw+ox,hw+ox,-hh+oy,hh+oy,.1,dist*5);vp=multiply(proj,view);invVP=invert(vp)}
function unprojectRay(clientX,clientY){
  if(!invVP||stageW<=0||H<=0)return null;
  const rect=canvas.getBoundingClientRect();
  const localX=clientX-rect.left,localY=clientY-rect.top;
  const x=localX/stageW*2-1,y=1-localY/H*2;
  const a=tx(invVP,[x,y,-1,1]),b=tx(invVP,[x,y,1,1]);
  for(const p of [a,b]){if(Math.abs(p[3])<1e-7)return null;p[0]/=p[3];p[1]/=p[3];p[2]/=p[3]}
  return {a,b};
}
function sampleSurfaceHeight(x,y){
  const dataset=currentDataset,grid=dataset?.heightGrid;if(!grid||!dataset.cols||!dataset.rows)return 0;
  const gx=x+(dataset.cols-1)/2,gy=(dataset.rows-1)/2-y;
  if(gx<-.5||gx>dataset.cols-.5||gy<-.5||gy>dataset.rows-.5)return 0;
  const x0=Math.max(0,Math.min(dataset.cols-1,Math.floor(gx))),y0=Math.max(0,Math.min(dataset.rows-1,Math.floor(gy)));
  const x1=Math.min(dataset.cols-1,x0+1),y1=Math.min(dataset.rows-1,y0+1),fx=Math.max(0,Math.min(1,gx-x0)),fy=Math.max(0,Math.min(1,gy-y0));
  const values=[grid[y0*dataset.cols+x0],grid[y0*dataset.cols+x1],grid[y1*dataset.cols+x0],grid[y1*dataset.cols+x1]];
  for(let i=0;i<4;i++)values[i]=values[i]<0?0:Math.max(.025,(state.invert?1-values[i]:values[i])*state.depth);
  const top=values[0]+(values[1]-values[0])*fx,bottom=values[2]+(values[3]-values[2])*fx;
  return top+(bottom-top)*fy;
}
function unprojectToSurface(clientX,clientY,hoverAware=false){
  const ray=unprojectRay(clientX,clientY);if(!ray)return [9999,9999];
  const {a,b}=ray,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],epsilon=1e-7;if(Math.abs(dz)<epsilon)return [9999,9999];
  const hoverLift=hoverAware?state.strength*(state.hover==='raise'?.95:.55):0;
  let lo=Math.max(0,Math.min(1,(state.depth+hoverLift-a[2])/dz)),hi=Math.max(0,Math.min(1,-a[2]/dz));if(lo>hi){const q=lo;lo=hi;hi=q}
  const field=t=>a[2]+dz*t-(sampleSurfaceHeight(a[0]+dx*t,a[1]+dy*t)+hoverLift);
  let left=lo,right=hi,leftValue=field(left),found=leftValue===0;
  for(let i=1;i<=10&&!found;i++){const t=lo+(hi-lo)*i/10,value=field(t);if((leftValue>=0&&value<=0)||(leftValue<=0&&value>=0)){right=t;found=true;break}left=t;leftValue=value}
  if(!found){left=lo;right=hi;leftValue=field(left)}
  for(let i=0;i<10;i++){const mid=(left+right)*.5,value=field(mid);if((leftValue>=0&&value<=0)||(leftValue<=0&&value>=0))right=mid;else{left=mid;leftValue=value}}
  const t=(left+right)*.5;return [a[0]+dx*t,a[1]+dy*t];
}
function eventToLocal(e,hoverAware=false){const bounds=canvas.getBoundingClientRect(),x=e.clientX-bounds.left,y=e.clientY-bounds.top;if(x<0||x>=stageW||y<0||y>=H)return null;return unprojectToSurface(e.clientX,e.clientY,hoverAware)}
canvas.addEventListener('pointermove',e=>{let p=eventToLocal(e,true);if(!p){pointerInside=false;return}pointer=p;pointerInside=isFinite(p[0])&&Math.abs(p[0])<cols*.7&&Math.abs(p[1])<rows*.7});canvas.addEventListener('pointerleave',()=>pointerInside=false);canvas.addEventListener('pointerdown',e=>{let p=eventToLocal(e,false);if(!p||state.click==='none')return;let now=simulationNow();clickPos=p;clickStart=now;if(state.click==='pulse'){pulses.push({x:p[0],y:p[1],start:now});if(pulses.length>MAX_PULSES)pulses.shift()}});
function hexToRgb(h){let s=(h||'#000000').replace('#','');if(s.length===3)s=s.split('').map(x=>x+x).join('');let n=parseInt(s,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
function setSharedUniforms(U){
  gl.uniform1f(U.uOpening,openingProgress);gl.uniformMatrix4fv(U.uVP,false,vp);gl.uniform1f(U.uDepth,state.depth);gl.uniform1f(U.uGap,state.gap);gl.uniform1i(U.uColorMode,{image:0,mono:1,luminance:2}[state.colorMode]);gl.uniform1i(U.uInvert,state.invert?1:0);gl.uniform1i(U.uRemoveBg,state.removeBg?1:0);gl.uniform3fv(U.uBaseColor,hexToRgb(state.baseColor));gl.uniform3fv(U.uCamPos,camPos);
}
function setInteractionUniforms(U,time,pulseCount){
  gl.uniform1f(U.uRadius,state.radius);gl.uniform1f(U.uStrength,state.strength);gl.uniform1f(U.uClickAge,time-clickStart);gl.uniform1f(U.uClickStrength,state.clickStrength);gl.uniform1f(U.uPulseSpeed,state.pulseSpeed);gl.uniform1i(U.uPulseCount,pulseCount);gl.uniform2fv(U.uPulsePos,pulsePositions);gl.uniform1fv(U.uPulseAge,pulseAges);gl.uniform2f(U.uPointer,...(pointerInside?pointer:[9999,9999]));gl.uniform2f(U.uClickPos,...clickPos);gl.uniform1i(U.uHover,{raise:0,separate:1}[state.hover]);gl.uniform1i(U.uClick,{pulse:0,rebuild:1,none:2}[state.click]);
}
function drawStatic(count,time,pulseCount){
  const U=morphU,g=geos[state.shape];gl.useProgram(morphProgram);setSharedUniforms(U);
  setInteractionUniforms(U,time,pulseCount);gl.uniform1f(U.uTransition,0);gl.uniform1f(U.uTransitionSpread,0);gl.uniform1i(U.uMorphing,0);
  gl.bindVertexArray(staticVaos[state.shape]);gl.drawElementsInstanced(gl.TRIANGLES,g.indexCount,gl.UNSIGNED_SHORT,0,count);
}
function drawMorph(count,progress,time,pulseCount){
  const U=morphU,g=geos[state.shape];gl.useProgram(morphProgram);setSharedUniforms(U);
  setInteractionUniforms(U,time,pulseCount);gl.uniform1f(U.uTransition,progress);gl.uniform1f(U.uTransitionSpread,reducedMotion.matches?0:state.transitionSpread);gl.uniform1i(U.uMorphing,1);
  gl.bindVertexArray(morphVaos[state.shape]);gl.drawElementsInstanced(gl.TRIANGLES,g.indexCount,gl.UNSIGNED_SHORT,0,count);
}
function render(ms){
  let time=reducedMotion.matches?0:simulationNow();
  openingProgress=reducedMotion.matches||!Number.isFinite(openingStart)?1:Math.min(1,Math.max(0,(time-openingStart)/2.4));
  const completedTransition=Boolean(transition&&transitionProgress(time)>=1);
  if(!document.hidden&&state.galleryAuto&&!transition&&!autoRequested&&time-galleryShownAt>=state.displayTime){autoRequested=true;emit('pixel-advance',null);}
  let maxPulseTravel=Math.hypot(cols,rows)*.8+8,write=0;
  for(let i=0;i<pulses.length;i++){let q=pulses[i];if((time-q.start)*state.pulseSpeed<maxPulseTravel)pulses[write++]=q}
  pulses.length=write;let pulseCount=Math.min(pulses.length,MAX_PULSES);
  for(let i=0;i<pulseCount;i++){let q=pulses[i];pulsePositions[i*2]=q.x;pulsePositions[i*2+1]=q.y;pulseAges[i]=time-q.start}
  cameraMatrices(time);
  let bg=state.backgroundColor==='transparent'?[0,0,0,0]:hexToRgb(state.backgroundColor).concat(1);
  gl.clearColor(bg[0],bg[1],bg[2],bg[3]);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.viewport(0,0,Math.round(stageW*DPR),Math.round(H*DPR));
  if(currentDataset){
    if(transition){const e=easedProgress(transitionProgress(time));drawMorph(transition.pair.count,e,time,pulseCount)}
    else drawStatic(currentDataset.count,time,pulseCount);
  }
  if(currentDataset&&!firstPaint){firstPaint=true;if(paused||document.hidden)hiddenAt=ms/1000;resolveFirst();}
  if(completedTransition)promoteTransition();
  if(!reducedMotion.matches)scheduleFrame();
}

function onVisibility(){if((document.hidden||paused)&&firstPaint){if(!hiddenAt)hiddenAt=performance.now()/1000;cancelBackgroundFrame(raf);raf=0;}else{if(hiddenAt){timeOffset+=performance.now()/1000-hiddenAt;hiddenAt=0;}scheduleFrame();}}
document.addEventListener('visibilitychange',onVisibility,{signal:events.signal});reducedMotion.addEventListener('change',()=>scheduleFrame(),{signal:events.signal});
function setSettings(next){const changed=Object.keys(next).some(key=>state[key]!==next[key]);if(!changed)return;const resizeNeeded=next.dpr!==undefined&&next.dpr!==state.dpr;const playbackChanged=next.galleryAuto!==undefined&&next.galleryAuto!==state.galleryAuto||next.displayTime!==undefined&&next.displayTime!==state.displayTime;Object.assign(state,next);if(resizeNeeded)resize();applyCanvasBg();if(playbackChanged)autoRequested=false;scheduleFrame();}
function applyCanvasBg(){canvas.style.background=state.backgroundColor==='transparent'?'transparent':state.backgroundColor;}
setSettings(initial);
function replayOpening(){openingStart=simulationNow();pulses.length=0;clickStart=-99;render(performance.now());return {openingProgress};}
return {ready,setSettings,setDataset,replayOpening,replay:replayOpening,setPaused(value){paused=value;onVisibility();},dispose(){disposed=true;events.abort();cancelBackgroundFrame(raf);sizeObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);globalThis.removeEventListener('resize',resize);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
