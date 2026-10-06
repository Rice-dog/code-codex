// @ts-nocheck -- Preserved standalone JavaScript renderer; host API is typed at its call site.
// Pixel Sculpt: independent WebGL2 study, visually inspired by React Bits Pro.
// No React Bits Pro source or assets are included. Code-Codex adds persistence,
// full-window input forwarding, native-theme lifecycle, and secondary settings.
import { requestBackgroundFrame, cancelBackgroundFrame } from './background-startup-hold';
declare const __CODE_CODEX_PIXEL_SCULPT_IMAGE__: string;
export const PIXEL_SCULPT_CONTROLS_HTML="<div class=\"panel\" id=\"panel\">\n  <div class=\"ph\"><div><h2 data-i18n=\"title\">Customize</h2><p data-i18n=\"subtitle\">Instanced relief tiles with pointer ripple</p></div><div class=\"actions\"><div class=\"lang-switch\" id=\"langSwitch\"><button data-lang=\"zh\">中</button><button class=\"on\" data-lang=\"en\">EN</button></div><button class=\"ghost\" id=\"copyCfg\" data-i18n=\"copyConfig\">Copy Config</button><button class=\"reset\" id=\"reset\" data-i18n=\"reset\">Reset</button><button class=\"ghost panel-close\" id=\"panelClose\" aria-label=\"Close panel\">×</button></div></div>\n  <div class=\"row gallery-block\"><div class=\"row-head\"><span data-i18n=\"imageGallery\">Local Gallery</span><output id=\"galleryCount\">0</output></div><div class=\"file-row\"><input id=\"imageFile\" type=\"file\" accept=\".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp\" multiple hidden><button id=\"chooseFile\" type=\"button\" data-i18n=\"addImages\">Add Images</button><span id=\"galleryStatus\" data-i18n=\"galleryEmpty\">No local images</span></div><div class=\"gallery-strip\" id=\"galleryStrip\"><div class=\"gallery-empty\" data-i18n=\"galleryHint\">Select several images to start a sequence</div></div><div class=\"gallery-order-hint\" data-i18n=\"galleryOrderHint\">0 hides · positive numbers set playback order</div><div class=\"gallery-nav\"><button id=\"galleryPrev\" type=\"button\" aria-label=\"Previous image\">‹</button><span class=\"gallery-index\" id=\"galleryIndex\">—</span><button id=\"galleryNext\" type=\"button\" aria-label=\"Next image\">›</button></div></div>\n  <div class=\"toggle-line\"><span data-i18n=\"galleryAuto\">Auto Play</span><label class=\"toggle\"><input id=\"galleryAuto\" type=\"checkbox\" checked><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"displayTime\">Display Time</span><output id=\"oDisplayTime\">6.0s</output></div><input id=\"displayTime\" type=\"range\" min=\"1\" max=\"30\" step=\"0.5\" value=\"6\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"transitionDuration\">Transition Duration</span><output id=\"oTransitionDuration\">1.2s</output></div><input id=\"transitionDuration\" type=\"range\" min=\"0.2\" max=\"5\" step=\"0.1\" value=\"1.2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"transitionSpread\">Particle Lift</span><output id=\"oTransitionSpread\">10.0</output></div><input id=\"transitionSpread\" type=\"range\" min=\"0\" max=\"30\" step=\"0.5\" value=\"10\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"galleryLoop\">Loop Gallery</span><label class=\"toggle\"><input id=\"galleryLoop\" type=\"checkbox\" checked><span></span></label></div>\n  <div class=\"divider\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"resolution\">Resolution</span><output id=\"oRes\">100</output></div><input id=\"res\" type=\"range\" min=\"24\" max=\"320\" value=\"100\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"depth\">Depth</span><output id=\"oDepth\">8.0</output></div><input id=\"depth\" type=\"range\" min=\"0\" max=\"30\" step=\"0.1\" value=\"8\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"gap\">Gap</span><output id=\"oGap\">0.05</output></div><input id=\"gap\" type=\"range\" min=\"0\" max=\"0.95\" step=\"0.01\" value=\"0.05\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"tileShape\">Tile Shape</span></div><div class=\"seg\" id=\"shapeSeg\"><button class=\"on\" data-v=\"square\" data-i18n=\"square\">Square</button><button data-v=\"round\" data-i18n=\"round\">Round</button><button data-v=\"hex\" data-i18n=\"hex\">Hex</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"hoverEffect\">Hover Effect</span></div><div class=\"seg\" id=\"hoverSeg\"><button class=\"on\" data-v=\"raise\" data-i18n=\"raise\">Raise</button><button data-v=\"separate\" data-i18n=\"separate\">Separate</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"interactionRadius\">Interaction Radius</span><output id=\"oRadius\">18.0</output></div><input id=\"radius\" type=\"range\" min=\"1\" max=\"30\" step=\"0.5\" value=\"18\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"interactionStrength\">Interaction Strength</span><output id=\"oStrength\">1.00</output></div><input id=\"strength\" type=\"range\" min=\"0\" max=\"72\" step=\"0.1\" value=\"1\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"clickEffect\">Click Effect</span></div><div class=\"seg\" id=\"clickSeg\"><button class=\"on\" data-v=\"pulse\" data-i18n=\"pulse\">Pulse</button><button data-v=\"rebuild\" data-i18n=\"rebuild\">Rebuild</button><button data-v=\"none\" data-i18n=\"none\">None</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"clickStrength\">Click Strength</span><output id=\"oClick\">2.0</output></div><input id=\"click\" type=\"range\" min=\"0\" max=\"30\" step=\"0.1\" value=\"2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"pulseSpeed\">Pulse Spread Speed</span><output id=\"oPulseSpeed\">11.0</output></div><input id=\"pulseSpeed\" type=\"range\" min=\"2\" max=\"30\" step=\"0.5\" value=\"11\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"colorMode\">Color Mode</span></div><div class=\"seg\" id=\"colorSeg\"><button class=\"on\" data-v=\"image\" data-i18n=\"image\">Image</button><button data-v=\"mono\" data-i18n=\"mono\">Mono</button><button data-v=\"luminance\" data-i18n=\"luminance\">Luminance</button></div></div>\n  <div class=\"row color-row\"><div><div class=\"row-head\"><span data-i18n=\"baseColor\">Base Color</span></div><input id=\"baseText\" type=\"text\" value=\"#ffffff\"></div><input id=\"baseColor\" type=\"color\" value=\"#ffffff\"></div>\n  <div class=\"row color-row\"><div><div class=\"row-head\"><span data-i18n=\"backgroundColor\">Background Color</span></div><input id=\"bgText\" type=\"text\" value=\"transparent\"></div><input id=\"bgColor\" type=\"color\" value=\"#000000\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"invert\">Invert</span><label class=\"toggle\"><input id=\"invert\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"toggle-line\"><span data-i18n=\"removeBackground\">Remove Background</span><label class=\"toggle\"><input id=\"removeBg\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"backgroundTolerance\">Background Tolerance</span><output id=\"oTol\">0.12</output></div><input id=\"tol\" type=\"range\" min=\"0\" max=\"0.5\" step=\"0.01\" value=\"0.12\"></div>\n  <div class=\"divider\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"cameraTilt\">Tilt</span><output id=\"oTilt\">45°</output></div><input id=\"tilt\" type=\"range\" min=\"0\" max=\"72\" step=\"1\" value=\"45\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"scale\">Scale</span><output id=\"oScale\">1.20</output></div><input id=\"scale\" type=\"range\" min=\"0.55\" max=\"1.8\" step=\"0.01\" value=\"1.2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"offsetX\">Offset X</span><output id=\"oOffx\">0.00</output></div><input id=\"offx\" type=\"range\" min=\"-0.5\" max=\"0.5\" step=\"0.01\" value=\"0\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"offsetY\">Offset Y</span><output id=\"oOffy\">0.00</output></div><input id=\"offy\" type=\"range\" min=\"-0.5\" max=\"0.5\" step=\"0.01\" value=\"0\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"rotation\">Rotation</span><output id=\"oRot\">0°</output></div><input id=\"rot\" type=\"range\" min=\"-180\" max=\"180\" step=\"1\" value=\"0\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"autoRotate\">Auto Rotate</span><label class=\"toggle\"><input id=\"auto\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"rotateSpeed\">Rotate Speed</span><output id=\"oSpeed\">2.0</output></div><input id=\"speed\" type=\"range\" min=\"-8\" max=\"8\" step=\"0.1\" value=\"2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"dpr\">DPR</span><output id=\"oDpr\">2.0</output></div><input id=\"dpr\" type=\"range\" min=\"0.5\" max=\"3\" step=\"0.1\" value=\"2\"></div>\n</div>\n<button id=\"panelToggle\" hidden></button>";
export function startPixelSculptRuntime(hostCanvas, controls, onError, options={}){
const realDocument=globalThis.document;
const document=new Proxy(realDocument,{get(target,key){
 if(key==='getElementById')return id=>id==='stage'?hostCanvas:controls.querySelector('[id="'+id+'"]');
 if(key==='querySelectorAll')return selector=>controls.querySelectorAll(selector);
 if(key==='documentElement')return controls;
 const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
}});
let disposed=false,raf=0,paused=false,hiddenAt=0,timeOffset=0,storageTimer=0,initialized=false,initializationTimer=0;
let rejectInitialization;let resolveFirstFrame;const firstFrame=new Promise(resolve=>{resolveFirstFrame=resolve;});
let savedSettings={};try{savedSettings=JSON.parse(localStorage.getItem('code-codex:pixel-sculpt-settings:v1')||'{}');}catch{}
const resizeHandlers=[];
const addEventListener=(type,handler)=>{globalThis.addEventListener(type,handler);resizeHandlers.push([type,handler]);};
function scheduleFrame(){if(!disposed&&initialized&&!paused&&!realDocument.hidden&&!raf)raf=requestBackgroundFrame(hostCanvas,ms=>{raf=0;if(disposed)return;try{render(ms);if(initialized)resolveFirstFrame();}catch(error){onError(error.message||String(error));}});}

const canvas=document.getElementById('stage');
const panel=document.getElementById('panel');
const galleryFileRow=panel.querySelector('.file-row'),galleryStatusNode=document.getElementById('galleryStatus');
const clearGalleryOrderButton=document.createElement('button');clearGalleryOrderButton.id='clearGalleryOrder';clearGalleryOrderButton.type='button';
galleryFileRow?.insertBefore(clearGalleryOrderButton,galleryStatusNode);panel.querySelector('.gallery-order-hint')?.remove();
const toastEl=realDocument.createElement('div');
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>toastEl.classList.remove('show'),2200)}
const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:false});
if(!gl){throw new Error('WebGL2 required')}
const state={resolution:100,depth:8,gap:0.05,shape:'square',radius:18,strength:1,hover:'raise',click:'pulse',clickStrength:2,pulseSpeed:11,colorMode:'image',baseColor:'#ffffff',backgroundColor:'transparent',invert:false,removeBg:false,tolerance:0.12,tilt:45,scale:1.2,offsetX:0,offsetY:0,rotation:0,auto:false,rotateSpeed:2,dpr:2,galleryAuto:true,displayTime:6,transitionDuration:1.2,transitionSpread:10,galleryLoop:true};
const I18N={
  en:{title:'Customize',subtitle:'Instanced relief tiles with pointer ripple',studyLabel:'interactive WebGL study',parameters:'Parameters',copyConfig:'Copy Config',reset:'Reset',imageGallery:'Local Gallery',addImages:'Add Images',galleryEmpty:'No local images',galleryHint:'Select several images to start a sequence',galleryOrder:'Playback order',galleryOrderHint:'0 hides · positive numbers set playback order',galleryEnabled:'enabled',galleryAuto:'Auto Play',displayTime:'Display Time',transitionDuration:'Transition Duration',transitionSpread:'Particle Lift',galleryLoop:'Loop Gallery',imagesAdded:'images added',resolution:'Resolution',depth:'Depth',gap:'Gap',tileShape:'Tile Shape',square:'Square',round:'Round',hex:'Hex',hoverEffect:'Hover Effect',raise:'Raise',separate:'Separate',interactionRadius:'Interaction Radius',interactionStrength:'Interaction Strength',clickEffect:'Click Effect',pulse:'Pulse',rebuild:'Rebuild',none:'None',clickStrength:'Click Strength',pulseSpeed:'Pulse Spread Speed',colorMode:'Color Mode',image:'Image',mono:'Mono',luminance:'Luminance',baseColor:'Base Color',backgroundColor:'Background Color',invert:'Invert',removeBackground:'Remove Background',backgroundTolerance:'Background Tolerance',cameraTilt:'Tilt',scale:'Scale',offsetX:'Offset X',offsetY:'Offset Y',rotation:'Rotation',autoRotate:'Auto Rotate',rotateSpeed:'Rotate Speed',dpr:'DPR',hint:'Move pointer across the sculpture · Click for pulse · Drag-free demo',badge:'WEBGL2 · INSTANCED PRISMS · HEIGHTFIELD SCULPT',imageLoaded:'Image loaded',imageError:'Unable to read this image',copied:'Config copied',copyFailed:'Copy failed',webglError:'Your browser does not support WebGL2'},
  zh:{title:'参数调节',subtitle:'实例化浮雕方块 · 指针涟漪交互',studyLabel:'WebGL 交互研究',parameters:'参数',copyConfig:'复制配置',reset:'重置',imageGallery:'本地图库',addImages:'添加图片',galleryEmpty:'暂无本地图片',galleryHint:'选择多张图片即可开始轮播',galleryOrder:'播放序号',galleryOrderHint:'0 不播放 · 正整数决定播放顺序',galleryEnabled:'启用',galleryAuto:'自动播放',displayTime:'单图停留时间',transitionDuration:'切换持续时间',transitionSpread:'粒子跃升高度',galleryLoop:'循环播放',imagesAdded:'张图片已添加',resolution:'分辨率',depth:'浮雕深度',gap:'方块间距',tileShape:'方块形状',square:'方形',round:'圆形',hex:'六边形',hoverEffect:'悬停效果',raise:'抬升',separate:'分离',interactionRadius:'交互半径',interactionStrength:'交互强度',clickEffect:'点击效果',pulse:'脉冲',rebuild:'重构',none:'无',clickStrength:'点击强度',pulseSpeed:'脉冲扩散速度',colorMode:'颜色模式',image:'原图',mono:'单色',luminance:'亮度',baseColor:'基础颜色',backgroundColor:'背景颜色',invert:'反相高度',removeBackground:'移除背景',backgroundTolerance:'背景容差',cameraTilt:'视角倾斜',scale:'缩放',offsetX:'水平偏移',offsetY:'垂直偏移',rotation:'旋转',autoRotate:'自动旋转',rotateSpeed:'旋转速度',dpr:'像素比上限',hint:'移动鼠标查看局部起伏 · 点击触发脉冲 · 无需拖拽',badge:'WEBGL2 · 实例化棱柱 · 高度场雕塑',imageLoaded:'图片加载完成',imageError:'无法读取这张图片',copied:'配置已复制',copyFailed:'复制失败',webglError:'当前浏览器不支持 WebGL2'}
};
let currentLang='zh';
function tr(key){return (I18N[currentLang]&&I18N[currentLang][key])||I18N.en[key]||key}
function applyLanguage(lang){currentLang=lang;document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.querySelectorAll('[data-i18n]').forEach(el=>{let k=el.dataset.i18n;if(I18N[lang][k])el.textContent=I18N[lang][k]});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{let k=el.dataset.i18nPlaceholder;if(I18N[lang][k])el.placeholder=I18N[lang][k]});document.querySelectorAll('#langSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.lang===lang));clearGalleryOrderButton.textContent=lang==='zh'?'清除顺序':'Clear order';if(typeof renderGallery==='function')renderGallery();}

let W=0,H=0,DPR=2,stageW=0,cols=0,rows=0,imageAspect=1,instanceCount=0,sourceImage=null,pickData=new Float32Array(0);let pointer=[9999,9999],pointerInside=false,clickPos=[9999,9999],clickStart=-99,camPos=[0,0,0],vp=null,invVP=null;
const MAX_PULSES=8,pulsePositions=new Float32Array(MAX_PULSES*2),pulseAges=new Float32Array(MAX_PULSES);let pulses=[];
const morphVs=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNormal;
layout(location=2)in vec2 iCenter;layout(location=3)in vec3 iColor;layout(location=4)in float iLum;layout(location=5)in float iRand;layout(location=6)in float iPresence;
layout(location=7)in vec2 iTargetCenter;layout(location=8)in vec3 iTargetColor;layout(location=9)in float iTargetLum;layout(location=10)in float iTargetRand;layout(location=11)in float iTargetPresence;
uniform mat4 uVP;uniform float uTime;uniform float uDepth;uniform float uGap;uniform float uRadius;uniform float uStrength;uniform vec2 uPointer;uniform int uHover;uniform int uClick;uniform float uClickAge;uniform vec2 uClickPos;uniform float uClickStrength;uniform float uPulseSpeed;uniform int uPulseCount;uniform vec2 uPulsePos[8];uniform float uPulseAge[8];uniform int uColorMode;uniform int uInvert;uniform int uRemoveBg;uniform vec3 uBaseColor;
uniform float uTransition;uniform float uTransitionSpread;uniform int uMorphing;
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
function sharedUniforms(program){return {uVP:gl.getUniformLocation(program,'uVP'),uDepth:gl.getUniformLocation(program,'uDepth'),uGap:gl.getUniformLocation(program,'uGap'),uColorMode:gl.getUniformLocation(program,'uColorMode'),uInvert:gl.getUniformLocation(program,'uInvert'),uRemoveBg:gl.getUniformLocation(program,'uRemoveBg'),uBaseColor:gl.getUniformLocation(program,'uBaseColor'),uCamPos:gl.getUniformLocation(program,'uCamPos')}}
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
const sampleCanvas=document.createElement('canvas'),sctx=sampleCanvas.getContext('2d',{willReadFrequently:true});
function datasetKey(){return Math.round(state.resolution)+'|'+(state.removeBg?1:0)+'|'+state.tolerance.toFixed(3)}
function buildInstanceData(image){
  let c,r,longEdge=Math.max(12,Math.round(state.resolution));
  if(image.width>=image.height){c=longEdge;r=Math.max(1,Math.round(longEdge/image.width*image.height))}
  else{r=longEdge;c=Math.max(1,Math.round(longEdge/image.height*image.width))}
  sampleCanvas.width=c;sampleCanvas.height=r;sctx.clearRect(0,0,c,r);sctx.drawImage(image,0,0,c,r);
  let data=sctx.getImageData(0,0,c,r).data,removed=null;
  if(state.removeBg){
    let corners=[[0,0],[c-1,0],[0,r-1],[c-1,r-1]],br=0,bg=0,bb=0;
    for(const [x,y] of corners){let i=(y*c+x)*4;br+=data[i];bg+=data[i+1];bb+=data[i+2]}
    br/=255*4;bg/=255*4;bb/=255*4;removed=new Uint8Array(c*r);
    let q=[],head=0;for(let x=0;x<c;x++){q.push(x,(r-1)*c+x)}for(let y=1;y<r-1;y++){q.push(y*c,y*c+c-1)}
    while(head<q.length){let idx=q[head++];if(removed[idx])continue;let i=idx*4,rr=data[i]/255,gg=data[i+1]/255,b=data[i+2]/255,dist=Math.sqrt((rr-br)*(rr-br)+(gg-bg)*(gg-bg)+(b-bb)*(b-bb))/1.732;if(dist>state.tolerance)continue;removed[idx]=1;let x=idx%c,y=(idx/c)|0;if(x>0)q.push(idx-1);if(x<c-1)q.push(idx+1);if(y>0)q.push(idx-c);if(y<r-1)q.push(idx+c)}
  }
  let arr=[],pick=[],heightGrid=new Float32Array(c*r);heightGrid.fill(-1);
  for(let y=0;y<r;y++)for(let x=0;x<c;x++){let idx=y*c+x,i=idx*4,a=data[i+3]/255,rr=data[i]/255,gg=data[i+1]/255,b=data[i+2]/255,lum=.2126*rr+.7152*gg+.0722*b;if(a<.035||(removed&&removed[idx]))continue;heightGrid[idx]=lum;let cx=x-(c-1)/2,cy=(r-1)/2-y;pick.push(cx,cy,lum);arr.push(cx,cy,rr,gg,b,lum,hash(x,y))}
  return {data:new Float32Array(arr),pickData:new Float32Array(pick),heightGrid,count:arr.length/7,cols:c,rows:r,aspect:image.width/image.height,image,key:datasetKey()};
}
function packDataset(dataset){const packed=new Float32Array(dataset.count*8);for(let i=0;i<dataset.count;i++){for(let k=0;k<7;k++)packed[i*8+k]=dataset.data[i*7+k]||0;packed[i*8+7]=1}return packed}
function uploadDataset(buffer,dataset){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,packDataset(dataset),gl.STATIC_DRAW)}
function heightGridFromInstances(data,c,r){const grid=new Float32Array(c*r);grid.fill(-1);for(let i=0;i<data.length;i+=7){const x=Math.round(data[i]+(c-1)/2),y=Math.round((r-1)/2-data[i+1]);if(x>=0&&x<c&&y>=0&&y<r)grid[y*c+x]=data[i+5]}return grid}
let currentDataset=null,gallery=[],currentGalleryIndex=-1,transition=null,galleryShownAt=0,gallerySequence=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function activateDataset(dataset,image){
  currentDataset=dataset;sourceImage=image||dataset.image;cols=dataset.cols;rows=dataset.rows;imageAspect=dataset.aspect;instanceCount=dataset.count;pickData=dataset.pickData;
}
function rebuildInstances(){
  if(!sourceImage)return;
  transition=null;
  currentDataset=buildInstanceData(sourceImage);uploadDataset(currentBuffer,currentDataset);activateDataset(currentDataset,sourceImage);
  for(let i=0;i<gallery.length;i++)gallery[i].dataset=gallery[i].image===sourceImage?currentDataset:null;
  galleryShownAt=simulationNow();renderGallery();
}
function applyCanvasBg(){canvas.style.background=(state.backgroundColor==='transparent')?'transparent':state.backgroundColor}
function loadImage(src,onDone){
  let im=new Image();
  im.onload=()=>{if(disposed){if(onDone)onDone(null);return;}try{sourceImage=im;currentDataset=buildInstanceData(im);uploadDataset(currentBuffer,currentDataset);activateDataset(currentDataset,im);galleryShownAt=simulationNow();toast(tr('imageLoaded'));if(onDone)onDone(im)}catch(error){onError(String(error));if(onDone)onDone(null)}};
  im.onerror=()=>{toast(tr('imageError'));console.warn('Image could not be decoded');if(onDone)onDone(null)};
  im.src=src;
}
function decodeLocalFile(file){
  return new Promise(resolve=>{if(!file||!file.type.startsWith('image/'))return resolve(null);let url=URL.createObjectURL(file),im=new Image();im.onload=()=>{const id=++gallerySequence;if(disposed||im.width*im.height>32000000){URL.revokeObjectURL(url);if(!disposed)onError('Image is too large: maximum 32 megapixels.');return resolve(null)};resolve({id,name:file.name||'Image',url,image:im,dataset:null,order:0,file})};im.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};im.src=url});
}
function ensureDataset(item){if(!item.dataset||item.dataset.key!==datasetKey())item.dataset=buildInstanceData(item.image);return item.dataset}
function playbackEntries(){return gallery.map((item,index)=>({item,index,order:Number.isFinite(item.order)?item.order:0})).filter(entry=>entry.order>0).sort((a,b)=>a.order-b.order||a.index-b.index)}
function compactPlaybackOrder(){playbackEntries().forEach((entry,index)=>{entry.item.order=index+1})}
function toggleGallerySelection(index){const item=gallery[index];if(!item)return;settleInterruptedTransition(simulationNow());if(item.order>0){item.order=0;compactPlaybackOrder();if(index===currentGalleryIndex){const entries=playbackEntries();if(entries.length)switchGallery(entries[0].index);}}else{item.order=playbackEntries().length+1;switchGallery(index)}galleryShownAt=simulationNow();renderGallery()}
function clearGalleryOrder(){settleInterruptedTransition(simulationNow());gallery.forEach(item=>item.order=0);galleryShownAt=simulationNow();renderGallery()}
function playbackPosition(index,entries=playbackEntries()){return entries.findIndex(entry=>entry.index===index)}
function switchPlayback(step,fromAuto=false){
  const entries=playbackEntries();if(!entries.length){galleryShownAt=simulationNow();return false}
  const active=transition?transition.targetIndex:currentGalleryIndex,pos=playbackPosition(active,entries);
  let next=pos<0?(step>0?0:entries.length-1):pos+step;
  if(next<0||next>=entries.length){
    if(!state.galleryLoop){if(fromAuto){state.galleryAuto=false;document.getElementById('galleryAuto').checked=false}renderGallery();return false}
    next=(next%entries.length+entries.length)%entries.length;
  }
  switchGallery(entries[next].index);return true;
}
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
  const image=e>=.5?t.targetItem.image:sourceImage,c=Math.round(cols+(t.targetDataset.cols-cols)*e),r=Math.round(rows+(t.targetDataset.rows-rows)*e);
  return {data,pickData:pick,heightGrid:heightGridFromInstances(data,c,r),count:data.length/7,cols:c,rows:r,aspect:image?.width&&image?.height?image.width/image.height:imageAspect,image,key:'presentation',synthetic:true};
}
function promoteTransition(){
  if(!transition)return;
  const t=transition;uploadDataset(currentBuffer,t.targetDataset);activateDataset(t.targetDataset,t.targetItem.image);currentGalleryIndex=t.targetIndex;transition=null;galleryShownAt=simulationNow();renderGallery();
}
function settleInterruptedTransition(now){
  if(!transition)return;
  const t=transition,e=easedProgress(transitionProgress(now)),dataset=presentationDataset(t,e);
  uploadDataset(currentBuffer,dataset);activateDataset(dataset,dataset.image);
  currentGalleryIndex=e>=.5?t.targetIndex:currentGalleryIndex;transition=null;galleryShownAt=now;renderGallery();
}
function switchGallery(index,immediate=false){
  if(!gallery.length)return;
  index=(index%gallery.length+gallery.length)%gallery.length;
  let now=simulationNow();settleInterruptedTransition(now);
  if(index===currentGalleryIndex&&!immediate&&!currentDataset?.synthetic){galleryShownAt=now;return}
  const item=gallery[index],dataset=ensureDataset(item);
  if(!currentDataset||immediate||reducedMotion.matches){uploadDataset(currentBuffer,dataset);activateDataset(dataset,item.image);currentGalleryIndex=index;transition=null;galleryShownAt=now;renderGallery();return}
  const pair=buildMorphPair(currentDataset,dataset);
  gl.bindBuffer(gl.ARRAY_BUFFER,morphFromBuffer);gl.bufferData(gl.ARRAY_BUFFER,pair.fromData,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,morphToBuffer);gl.bufferData(gl.ARRAY_BUFFER,pair.toData,gl.STATIC_DRAW);
  transition={targetItem:item,targetDataset:dataset,targetIndex:index,pair,start:now,duration:reducedMotion.matches?.2:Math.max(.05,state.transitionDuration)};
  renderGallery();
}
async function addLocalFiles(files){
  const decoded=[];
  for(const file of files){const item=await decodeLocalFile(file);if(item)decoded.push(item)}
  if(!decoded.length){toast(tr('imageError'));return}
  const firstIndex=gallery.length;let nextOrder=playbackEntries().length;decoded.forEach(item=>item.order=++nextOrder);gallery.push(...decoded);renderGallery();toast(currentLang==='zh'?decoded.length+tr('imagesAdded'):decoded.length+' '+tr('imagesAdded'));
  switchGallery(firstIndex);
}
function removeGalleryItem(index){
  if(index<0||index>=gallery.length)return;
  settleInterruptedTransition(simulationNow());
  const wasCurrent=index===currentGalleryIndex,item=gallery[index];gallery.splice(index,1);URL.revokeObjectURL(item.url);compactPlaybackOrder();
  if(index<currentGalleryIndex)currentGalleryIndex--;
  if(wasCurrent){currentGalleryIndex=-1;const entries=playbackEntries();if(entries.length)switchGallery(entries.find(entry=>entry.index>=index)?.index??entries[0].index);else if(gallery.length)switchGallery(Math.min(index,gallery.length-1));else renderGallery()}else renderGallery();
}
function renderGallery(){
  const strip=document.getElementById('galleryStrip'),status=document.getElementById('galleryStatus'),count=document.getElementById('galleryCount'),indexEl=document.getElementById('galleryIndex');
  if(!strip||!status)return;
  const active=transition?transition.targetIndex:currentGalleryIndex,entries=playbackEntries(),activePosition=playbackPosition(active,entries);strip.textContent='';
  if(!gallery.length){const empty=document.createElement('div');empty.className='gallery-empty';empty.textContent=currentLang==='zh'?'添加图片后按播放顺序选择。':'Add images, then select them in playback order.';strip.appendChild(empty)}
  else gallery.forEach((item,index)=>{const enabled=item.order>0,card=document.createElement('article');card.className='gallery-item'+(index===active?' is-active':'')+(enabled?' is-selected':'');card.title=item.name;const select=document.createElement('button');select.type='button';select.className='gallery-preview';select.dataset.select=index;select.title=item.name;select.setAttribute('aria-pressed',String(enabled));select.setAttribute('aria-label',enabled?(currentLang==='zh'?'从切换顺序移除 ':'Remove from switching order: ')+item.name:(currentLang==='zh'?'添加到切换顺序 ':'Add to switching order: ')+item.name);const img=document.createElement('img');img.src=item.url;img.alt='';img.loading='lazy';const name=document.createElement('span');name.className='gallery-name';name.textContent=item.name;select.append(img,name);card.append(select);if(enabled){const order=document.createElement('span');order.className='gallery-order';order.textContent=String(item.order);order.setAttribute('aria-hidden','true');card.append(order)}if(index===active){const live=document.createElement('span');live.className='gallery-live';live.textContent=currentLang==='zh'?'当前':'LIVE';live.setAttribute('aria-hidden','true');card.append(live)}const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.dataset.remove=index;remove.textContent='×';remove.setAttribute('aria-label',(currentLang==='zh'?'删除 ':'Delete ')+item.name);card.append(remove);strip.appendChild(card)});
  count.value=gallery.length?entries.length+' / '+gallery.length:'0';status.textContent=gallery.length?(currentLang==='zh'?tr('galleryEnabled')+' '+entries.length+' / '+gallery.length:entries.length+' / '+gallery.length+' '+tr('galleryEnabled')):tr('galleryEmpty');
  indexEl.textContent=entries.length?(activePosition>=0?(activePosition+1)+' / '+entries.length:'— / '+entries.length):'—';
  const prev=document.getElementById('galleryPrev'),next=document.getElementById('galleryNext'),outside=activePosition<0;
  prev.disabled=!entries.length||(!state.galleryLoop&&!outside&&activePosition===0);next.disabled=!entries.length||(!state.galleryLoop&&!outside&&activePosition===entries.length-1);
  clearGalleryOrderButton.disabled=!entries.length;
}
function resize(){const rect=canvas.parentElement?.getBoundingClientRect();W=Math.max(1,rect?.width||innerWidth);H=Math.max(1,rect?.height||innerHeight);DPR=Math.min(devicePixelRatio||1,state.dpr);canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);canvas.style.width='100%';canvas.style.height='100%';stageW=W;scheduleFrame();}addEventListener('resize',resize);const sizeObserver=new ResizeObserver(()=>{if(!disposed)resize();});if(canvas.parentElement)sizeObserver.observe(canvas.parentElement);resize();applyCanvasBg();
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
function eventToLocal(e,hoverAware=false){let rect=panel.getBoundingClientRect();if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom)return null;const bounds=canvas.getBoundingClientRect(),x=e.clientX-bounds.left,y=e.clientY-bounds.top;if(x<0||x>=stageW||y<0||y>=H)return null;return unprojectToSurface(e.clientX,e.clientY,hoverAware)}
canvas.addEventListener('pointermove',e=>{let p=eventToLocal(e,true);if(!p){pointerInside=false;return}pointer=p;pointerInside=isFinite(p[0])&&Math.abs(p[0])<cols*.7&&Math.abs(p[1])<rows*.7});canvas.addEventListener('pointerleave',()=>pointerInside=false);canvas.addEventListener('pointerdown',e=>{let p=eventToLocal(e,false);if(!p||state.click==='none')return;let now=simulationNow();clickPos=p;clickStart=now;if(state.click==='pulse'){pulses.push({x:p[0],y:p[1],start:now});if(pulses.length>MAX_PULSES)pulses.shift()}});
function hexToRgb(h){let s=(h||'#000000').replace('#','');if(s.length===3)s=s.split('').map(x=>x+x).join('');let n=parseInt(s,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
function setSharedUniforms(U){
  gl.uniformMatrix4fv(U.uVP,false,vp);gl.uniform1f(U.uDepth,state.depth);gl.uniform1f(U.uGap,state.gap);gl.uniform1i(U.uColorMode,{image:0,mono:1,luminance:2}[state.colorMode]);gl.uniform1i(U.uInvert,state.invert?1:0);gl.uniform1i(U.uRemoveBg,state.removeBg?1:0);gl.uniform3fv(U.uBaseColor,hexToRgb(state.baseColor));gl.uniform3fv(U.uCamPos,camPos);
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
  let time=reducedMotion.matches?0:Math.max(0,ms/1000-timeOffset);
  const completedTransition=Boolean(transition&&transitionProgress(time)>=1);
  if(!document.hidden&&state.galleryAuto&&!transition&&gallery.length&&time-galleryShownAt>=state.displayTime)switchPlayback(1,true);
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
  if(completedTransition)promoteTransition();
  if(!reducedMotion.matches)scheduleFrame();
}
function pct(el){let a=+el.min||0,b=+el.max||100,v=+el.value;el.style.setProperty('--pct',((v-a)/(b-a)*100)+'%')}
function bindRange(id,key,fmt,rebuild=false,resizeToo=false){let el=document.getElementById(id),out=document.getElementById('o'+id[0].toUpperCase()+id.slice(1));let set=()=>{state[key]=+el.value;if(out)out.value=fmt(state[key]);pct(el);if(rebuild)rebuildInstances();if(resizeToo)resize()};el.addEventListener('input',set);set()}
bindRange('res','resolution',v=>v.toFixed(0),true);bindRange('depth','depth',v=>v.toFixed(1));bindRange('gap','gap',v=>v.toFixed(2));bindRange('radius','radius',v=>v.toFixed(1));bindRange('strength','strength',v=>v.toFixed(2));bindRange('click','clickStrength',v=>v.toFixed(1));bindRange('pulseSpeed','pulseSpeed',v=>v.toFixed(1));bindRange('tol','tolerance',v=>v.toFixed(2),true);bindRange('tilt','tilt',v=>v.toFixed(0)+'°');bindRange('scale','scale',v=>v.toFixed(2));bindRange('offx','offsetX',v=>v.toFixed(2));bindRange('offy','offsetY',v=>v.toFixed(2));bindRange('rot','rotation',v=>v.toFixed(0)+'°');bindRange('speed','rotateSpeed',v=>v.toFixed(1));bindRange('dpr','dpr',v=>v.toFixed(1),false,true);bindRange('displayTime','displayTime',v=>v.toFixed(1)+'s');bindRange('transitionDuration','transitionDuration',v=>v.toFixed(1)+'s');bindRange('transitionSpread','transitionSpread',v=>v.toFixed(1));
function bindSeg(id,key){document.getElementById(id).addEventListener('click',e=>{if(e.target.tagName!=='BUTTON')return;[...e.currentTarget.children].forEach(b=>b.classList.remove('on'));e.target.classList.add('on');state[key]=e.target.dataset.v;if(key==='click')pulses.length=0})}bindSeg('shapeSeg','shape');bindSeg('hoverSeg','hover');bindSeg('clickSeg','click');bindSeg('colorSeg','colorMode');
for(const [id,key,rebuild] of [['auto','auto',false],['invert','invert',false],['removeBg','removeBg',true],['galleryAuto','galleryAuto',false],['galleryLoop','galleryLoop',false]])document.getElementById(id).addEventListener('change',e=>{state[key]=e.target.checked;if(key==='galleryAuto')galleryShownAt=simulationNow();if(rebuild)rebuildInstances()});
const bc=document.getElementById('baseColor'),bt=document.getElementById('baseText');bc.addEventListener('input',()=>{state.baseColor=bc.value;bt.value=bc.value});bt.addEventListener('change',()=>{if(/^#[0-9a-f]{6}$/i.test(bt.value)){state.baseColor=bt.value;bc.value=bt.value}});
const bgc=document.getElementById('bgColor'),bgt=document.getElementById('bgText');bgc.addEventListener('input',()=>{state.backgroundColor=bgc.value;bgt.value=bgc.value;applyCanvasBg()});bgt.addEventListener('change',()=>{if(bgt.value==='transparent'){state.backgroundColor='transparent';applyCanvasBg();return}if(/^#[0-9a-f]{6}$/i.test(bgt.value)){state.backgroundColor=bgt.value;bgc.value=bgt.value;applyCanvasBg()}});
const imageFile=document.getElementById('imageFile');document.getElementById('chooseFile').onclick=()=>{imageFile.value='';imageFile.click()};imageFile.onchange=()=>addLocalFiles([...(imageFile.files||[])]);
document.getElementById('galleryPrev').onclick=()=>switchPlayback(-1);
document.getElementById('galleryNext').onclick=()=>switchPlayback(1);
const galleryStrip=document.getElementById('galleryStrip');
galleryStrip.addEventListener('click',e=>{const remove=e.target.closest('[data-remove]');if(remove){e.stopPropagation();removeGalleryItem(+remove.dataset.remove);return}const select=e.target.closest('[data-select]');if(select)toggleGallerySelection(+select.dataset.select)});
clearGalleryOrderButton.addEventListener('click',()=>{clearGalleryOrder();void saveLibrary()});
document.getElementById('copyCfg').onclick=async()=>{let cfg={images:'<your-local-images>',playbackOrder:gallery.map(item=>item.order).join(','),autoPlay:state.galleryAuto,displayTime:state.displayTime,transitionDuration:state.transitionDuration,transitionSpread:state.transitionSpread,loop:state.galleryLoop,resolution:state.resolution,depth:state.depth,gap:state.gap,tileShape:state.shape,hoverEffect:state.hover,interactionRadius:state.radius,interactionStrength:state.strength,clickEffect:state.click,clickStrength:state.clickStrength,pulseSpeed:state.pulseSpeed,colorMode:state.colorMode,baseColor:state.baseColor,backgroundColor:state.backgroundColor,invert:state.invert,removeBackground:state.removeBg,backgroundTolerance:state.tolerance,tilt:state.tilt,scale:state.scale,offsetX:state.offsetX,offsetY:state.offsetY,rotation:state.rotation,autoRotate:state.auto,rotateSpeed:state.rotateSpeed,dpr:state.dpr};let txt='<PixelSculpt\\n  '+Object.entries(cfg).map(([k,v])=>`${k}={${typeof v==='string'&&!v.startsWith('<')?`"${v}"`:v}}`).join('\\n  ')+'\\n/>';
try{await navigator.clipboard.writeText(txt);toast(tr('copied'))}catch(e){toast(tr('copyFailed'))}};
document.getElementById('langSwitch').addEventListener('click',e=>{if(e.target.tagName!=='BUTTON')return;applyLanguage(e.target.dataset.lang)});
const panelToggle=document.getElementById('panelToggle'),panelClose=document.getElementById('panelClose');
function setPanelOpen(open){panel.classList.toggle('is-collapsed',!open);panelToggle.hidden=open}
panelToggle.addEventListener('click',()=>setPanelOpen(true));panelClose.addEventListener('click',()=>setPanelOpen(false));
// The Code-Codex secondary panel owns responsive placement.
document.getElementById('reset').onclick=()=>resetConfig();
applyLanguage(currentLang);


const defaults={...state};
const ranges=[...[["res","resolution"],["depth","depth"],["gap","gap"],["radius","radius"],["strength","strength"],["click","clickStrength"],["pulseSpeed","pulseSpeed"],["tol","tolerance"],["tilt","tilt"],["scale","scale"],["offx","offsetX"],["offy","offsetY"],["rot","rotation"],["speed","rotateSpeed"],["dpr","dpr"],["displayTime","displayTime"],["transitionDuration","transitionDuration"],["transitionSpread","transitionSpread"]]];
const segments=[['shapeSeg','shape'],['hoverSeg','hover'],['clickSeg','click'],['colorSeg','colorMode']];
const toggles=[['auto','auto'],['invert','invert'],['removeBg','removeBg'],['galleryAuto','galleryAuto'],['galleryLoop','galleryLoop']];
function applyConfig(values){
 for(const [id,key]of ranges){const el=document.getElementById(id);const value=Number(values[key]);if(Number.isFinite(value)){el.value=String(Math.max(+el.min,Math.min(+el.max,value)));el.dispatchEvent(new Event('input',{bubbles:true}));}}
 for(const [id,key]of toggles){const el=document.getElementById(id);if(typeof values[key]==='boolean'){el.checked=values[key];el.dispatchEvent(new Event('change',{bubbles:true}));}}
 for(const [id,key]of segments){const el=[...document.getElementById(id).querySelectorAll('button')].find(b=>b.dataset.v===values[key]);if(el)el.click();}
 for(const [id,key]of [['baseColor','baseColor'],['bgColor','backgroundColor']]){if(/^#[0-9a-f]{6}$/i.test(values[key]||'')){const el=document.getElementById(id);el.value=values[key];el.dispatchEvent(new Event('input',{bubbles:true}));}}
 if(values.backgroundColor==='transparent'){document.getElementById('bgText').value='transparent';document.getElementById('bgText').dispatchEvent(new Event('change',{bubbles:true}));}
}
function saveSettings(){if(options.persist===false)return;try{localStorage.setItem('code-codex:pixel-sculpt-settings:v1',JSON.stringify(state));}catch(error){onError('Settings could not be saved: '+error.message);}}
function resetConfig(){applyConfig(defaults);pulses.length=0;pointerInside=false;saveSettings();}
function openLibrary(){return new Promise((resolve,reject)=>{const request=indexedDB.open('code-codex-pixel-sculpt',1);request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
let saveQueue=Promise.resolve();
function saveLibrary(){if(options.persist===false)return Promise.resolve();const snapshot=gallery.map((item,i)=>({id:i+1,file:item.file,order:item.order}));saveQueue=saveQueue.catch(()=>{}).then(async()=>{const db=await openLibrary();try{await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');const store=tx.objectStore('images');store.clear();snapshot.forEach(item=>store.put(item));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}).catch(error=>onError('Image library could not be saved: '+error.message));return saveQueue;}
async function restoreLibrary(){let db;try{db=await openLibrary();if(disposed)return;const records=await new Promise((resolve,reject)=>{const request=db.transaction('images').objectStore('images').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();db=undefined;let bytes=0;for(const record of records.slice(0,32)){if(disposed)return;if(!(record.file instanceof Blob)||record.file.size>30*1024*1024||bytes+record.file.size>256*1024*1024)continue;const item=await decodeLocalFile(record.file);if(item){bytes+=record.file.size;item.order=Math.max(0,Math.floor(record.order||0));gallery.push(item);}}compactPlaybackOrder();const entries=playbackEntries();if(entries.length&&!disposed)switchGallery(entries[0].index,true);else renderGallery();}catch(error){if(!disposed)onError('Image library could not be restored: '+error.message);}finally{db?.close();}}
const originalAdd=addLocalFiles;
addLocalFiles=async files=>{if(disposed)return;const accepted=[];let bytes=gallery.reduce((sum,item)=>sum+(item.file?.size||0),0);for(const file of files){if(gallery.length+accepted.length>=32||file.size>30*1024*1024||bytes+file.size>256*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){onError('Image limit: 32 PNG/JPEG/WebP files, 30 MB each, 256 MB total.');continue;}bytes+=file.size;accepted.push(file);}await originalAdd(accepted);if(!disposed)await saveLibrary();};
for(const type of ['input','change','click'])controls.addEventListener(type,event=>{scheduleFrame();if(event.target.closest('[data-select],[data-remove]'))queueMicrotask(()=>saveLibrary());clearTimeout(storageTimer);storageTimer=setTimeout(saveSettings,180);});
applyConfig(savedSettings);
function simulationNow(){return Math.max(0,(hiddenAt||performance.now()/1000)-timeOffset);}
const ready=new Promise((resolve,reject)=>{rejectInitialization=reject;initializationTimer=setTimeout(()=>reject(new Error('Pixel Sculpt image initialization timed out')),15000);loadImage(__CODE_CODEX_PIXEL_SCULPT_IMAGE__,async image=>{if(!image){clearTimeout(initializationTimer);reject(new Error(disposed?'Pixel Sculpt activation was canceled':'The default Pixel Sculpt image could not be decoded'));return;}await restoreLibrary();clearTimeout(initializationTimer);if(disposed){reject(new Error('Pixel Sculpt activation was canceled'));return;}initialized=true;scheduleFrame();resolve();});});
void ready.catch(()=>{});
function resumeOpening(){if(disposed)return;const now=simulationNow();galleryShownAt=now;if(transition)transition.start=now;pulses.length=0;clickStart=-99;scheduleFrame();}
function onVisibility(){if(realDocument.hidden||paused){if(!hiddenAt)hiddenAt=performance.now()/1000;cancelBackgroundFrame(raf);raf=0;}else{if(hiddenAt){timeOffset+=performance.now()/1000-hiddenAt;hiddenAt=0;}scheduleFrame();}}
realDocument.addEventListener('visibilitychange',onVisibility);
function forward(event){if(disposed||paused)return;const path=event.composedPath();if(path.some(node=>node===controls||node instanceof Element&&node.matches('.particle-settings-panel,input,textarea,select,button,[contenteditable="true"]')))return;canvas.dispatchEvent(new PointerEvent(event.type,{clientX:event.clientX,clientY:event.clientY,button:event.button}));scheduleFrame();}
globalThis.addEventListener('pointermove',forward,{passive:true});globalThis.addEventListener('pointerdown',forward,{passive:true});
canvas.addEventListener('webglcontextlost',event=>{if(disposed)return;event.preventDefault();cancelBackgroundFrame(raf);raf=0;onError('Pixel Sculpt graphics context was lost. Disable and enable the plugin to recover.');});
return {ready,firstFrame,resumeOpening,language:applyLanguage,reset:resetConfig,replay:()=>{pulses.length=0;clickStart=-99;scheduleFrame();},setPaused(value){if(paused===value)return;paused=value;onVisibility();},dispose(){if(disposed)return;saveSettings();disposed=true;clearTimeout(storageTimer);clearTimeout(initializationTimer);rejectInitialization?.(new Error("Pixel Sculpt activation was canceled"));resolveFirstFrame();sizeObserver.disconnect();cancelBackgroundFrame(raf);realDocument.removeEventListener('visibilitychange',onVisibility);globalThis.removeEventListener('pointermove',forward);globalThis.removeEventListener('pointerdown',forward);for(const [type,handler]of resizeHandlers)globalThis.removeEventListener(type,handler);gallery.forEach(item=>URL.revokeObjectURL(item.url));gl.getExtension('WEBGL_lose_context')?.loseContext();controls.remove();}};
}
