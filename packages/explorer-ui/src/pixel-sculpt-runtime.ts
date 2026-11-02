// @ts-nocheck -- Preserved standalone JavaScript renderer; host API is typed at its call site.
// Pixel Sculpt: independent WebGL2 study, visually inspired by React Bits Pro.
// No React Bits Pro source or assets are included. Code-Codex adds persistence,
// full-window input forwarding, native-theme lifecycle, and secondary settings.
import {parameterLanguage,subscribeLanguage} from './i18n';
import { DEFAULT_GALLERY_MARKER } from './default-image-library';
import {startPixelKernel} from './pixel-sculpt-kernel';
declare const __CODE_CODEX_PIXEL_SCULPT_IMAGE__: string;
export const PIXEL_SCULPT_CONTROLS_HTML="<div class=\"panel\" id=\"panel\">\n  <div class=\"ph\"><div><h2 data-i18n=\"title\">Customize</h2><p data-i18n=\"subtitle\">Instanced relief tiles with pointer ripple</p></div><div class=\"actions\"><button class=\"ghost\" id=\"copyCfg\" data-i18n=\"copyConfig\">Copy Config</button><button class=\"reset\" id=\"reset\" data-i18n=\"reset\">Reset</button><button class=\"ghost panel-close\" id=\"panelClose\" aria-label=\"Close panel\">×</button></div></div>\n  <div class=\"row gallery-block\"><div class=\"row-head\"><span data-i18n=\"imageGallery\">Local Gallery</span><output id=\"galleryCount\">0</output></div><div class=\"file-row\"><input id=\"imageFile\" type=\"file\" accept=\".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp\" multiple hidden><button id=\"chooseFile\" type=\"button\" data-i18n=\"addImages\">Add Images</button><span id=\"galleryStatus\" data-i18n=\"galleryEmpty\">No local images</span></div><div class=\"gallery-strip\" id=\"galleryStrip\"><div class=\"gallery-empty\" data-i18n=\"galleryHint\">Select several images to start a sequence</div></div><div class=\"gallery-order-hint\" data-i18n=\"galleryOrderHint\">0 hides · positive numbers set playback order</div><div class=\"gallery-nav\"><button id=\"galleryPrev\" type=\"button\" aria-label=\"Previous image\">‹</button><span class=\"gallery-index\" id=\"galleryIndex\">—</span><button id=\"galleryNext\" type=\"button\" aria-label=\"Next image\">›</button></div></div>\n  <div class=\"toggle-line\"><span data-i18n=\"galleryAuto\">Auto Play</span><label class=\"toggle\"><input id=\"galleryAuto\" type=\"checkbox\" checked><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"displayTime\">Display Time</span><output id=\"oDisplayTime\">6.0s</output></div><input id=\"displayTime\" type=\"range\" min=\"1\" max=\"30\" step=\"0.5\" value=\"6\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"transitionDuration\">Transition Duration</span><output id=\"oTransitionDuration\">1.2s</output></div><input id=\"transitionDuration\" type=\"range\" min=\"0.2\" max=\"5\" step=\"0.1\" value=\"1.2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"transitionSpread\">Particle Lift</span><output id=\"oTransitionSpread\">10.0</output></div><input id=\"transitionSpread\" type=\"range\" min=\"0\" max=\"30\" step=\"0.5\" value=\"10\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"galleryLoop\">Loop Gallery</span><label class=\"toggle\"><input id=\"galleryLoop\" type=\"checkbox\" checked><span></span></label></div>\n  <div class=\"divider\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"resolution\">Resolution</span><output id=\"oRes\">100</output></div><input id=\"res\" type=\"range\" min=\"24\" max=\"320\" value=\"100\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"depth\">Depth</span><output id=\"oDepth\">8.0</output></div><input id=\"depth\" type=\"range\" min=\"0\" max=\"30\" step=\"0.1\" value=\"8\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"gap\">Gap</span><output id=\"oGap\">0.05</output></div><input id=\"gap\" type=\"range\" min=\"0\" max=\"0.95\" step=\"0.01\" value=\"0.05\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"tileShape\">Tile Shape</span></div><div class=\"seg\" id=\"shapeSeg\"><button class=\"on\" data-v=\"square\" data-i18n=\"square\">Square</button><button data-v=\"round\" data-i18n=\"round\">Round</button><button data-v=\"hex\" data-i18n=\"hex\">Hex</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"hoverEffect\">Hover Effect</span></div><div class=\"seg\" id=\"hoverSeg\"><button class=\"on\" data-v=\"raise\" data-i18n=\"raise\">Raise</button><button data-v=\"separate\" data-i18n=\"separate\">Separate</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"interactionRadius\">Interaction Radius</span><output id=\"oRadius\">18.0</output></div><input id=\"radius\" type=\"range\" min=\"1\" max=\"30\" step=\"0.5\" value=\"18\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"interactionStrength\">Interaction Strength</span><output id=\"oStrength\">1.00</output></div><input id=\"strength\" type=\"range\" min=\"0\" max=\"72\" step=\"0.1\" value=\"1\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"clickEffect\">Click Effect</span></div><div class=\"seg\" id=\"clickSeg\"><button class=\"on\" data-v=\"pulse\" data-i18n=\"pulse\">Pulse</button><button data-v=\"rebuild\" data-i18n=\"rebuild\">Rebuild</button><button data-v=\"none\" data-i18n=\"none\">None</button></div></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"clickStrength\">Click Strength</span><output id=\"oClick\">2.0</output></div><input id=\"click\" type=\"range\" min=\"0\" max=\"30\" step=\"0.1\" value=\"2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"pulseSpeed\">Pulse Spread Speed</span><output id=\"oPulseSpeed\">11.0</output></div><input id=\"pulseSpeed\" type=\"range\" min=\"2\" max=\"30\" step=\"0.5\" value=\"11\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"colorMode\">Color Mode</span></div><div class=\"seg\" id=\"colorSeg\"><button class=\"on\" data-v=\"image\" data-i18n=\"image\">Image</button><button data-v=\"mono\" data-i18n=\"mono\">Mono</button><button data-v=\"luminance\" data-i18n=\"luminance\">Luminance</button></div></div>\n  <div class=\"row color-row\"><div><div class=\"row-head\"><span data-i18n=\"baseColor\">Base Color</span></div><input id=\"baseText\" type=\"text\" value=\"#ffffff\"></div><input id=\"baseColor\" type=\"color\" value=\"#ffffff\"></div>\n  <div class=\"row color-row\"><div><div class=\"row-head\"><span data-i18n=\"backgroundColor\">Background Color</span></div><input id=\"bgText\" type=\"text\" value=\"transparent\"></div><input id=\"bgColor\" type=\"color\" value=\"#000000\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"invert\">Invert</span><label class=\"toggle\"><input id=\"invert\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"toggle-line\"><span data-i18n=\"removeBackground\">Remove Background</span><label class=\"toggle\"><input id=\"removeBg\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"backgroundTolerance\">Background Tolerance</span><output id=\"oTol\">0.12</output></div><input id=\"tol\" type=\"range\" min=\"0\" max=\"0.5\" step=\"0.01\" value=\"0.12\"></div>\n  <div class=\"divider\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"cameraTilt\">Tilt</span><output id=\"oTilt\">45°</output></div><input id=\"tilt\" type=\"range\" min=\"0\" max=\"72\" step=\"1\" value=\"45\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"scale\">Scale</span><output id=\"oScale\">1.20</output></div><input id=\"scale\" type=\"range\" min=\"0.55\" max=\"1.8\" step=\"0.01\" value=\"1.2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"offsetX\">Offset X</span><output id=\"oOffx\">0.00</output></div><input id=\"offx\" type=\"range\" min=\"-0.5\" max=\"0.5\" step=\"0.01\" value=\"0\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"offsetY\">Offset Y</span><output id=\"oOffy\">0.00</output></div><input id=\"offy\" type=\"range\" min=\"-0.5\" max=\"0.5\" step=\"0.01\" value=\"0\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"rotation\">Rotation</span><output id=\"oRot\">0°</output></div><input id=\"rot\" type=\"range\" min=\"-180\" max=\"180\" step=\"1\" value=\"0\"></div>\n  <div class=\"toggle-line\"><span data-i18n=\"autoRotate\">Auto Rotate</span><label class=\"toggle\"><input id=\"auto\" type=\"checkbox\"><span></span></label></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"rotateSpeed\">Rotate Speed</span><output id=\"oSpeed\">2.0</output></div><input id=\"speed\" type=\"range\" min=\"-8\" max=\"8\" step=\"0.1\" value=\"2\"></div>\n  <div class=\"row\"><div class=\"row-head\"><span data-i18n=\"dpr\">DPR</span><output id=\"oDpr\">2.0</output></div><input id=\"dpr\" type=\"range\" min=\"0.5\" max=\"3\" step=\"0.1\" value=\"2\"></div>\n</div>\n<button id=\"panelToggle\" hidden></button>";
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
function scheduleFrame(){visual?.setSettings({...state,galleryAuto:state.galleryAuto&&playbackEntries().length>1});}
const canvas=document.getElementById('stage');
const panel=document.getElementById('panel');
const galleryFileRow=panel.querySelector('.file-row'),galleryStatusNode=document.getElementById('galleryStatus');
const clearGalleryOrderButton=document.createElement('button');clearGalleryOrderButton.id='clearGalleryOrder';clearGalleryOrderButton.type='button';
galleryFileRow?.insertBefore(clearGalleryOrderButton,galleryStatusNode);panel.querySelector('.gallery-order-hint')?.remove();
const toastEl=realDocument.createElement('div');
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>toastEl.classList.remove('show'),2200)}
const state={resolution:100,depth:8,gap:0.05,shape:'square',radius:18,strength:1,hover:'raise',click:'pulse',clickStrength:2,pulseSpeed:11,colorMode:'image',baseColor:'#ffffff',backgroundColor:'transparent',invert:false,removeBg:false,tolerance:0.12,tilt:45,scale:1.2,offsetX:0,offsetY:0,rotation:0,auto:false,rotateSpeed:2,dpr:2,galleryAuto:true,displayTime:6,transitionDuration:1.2,transitionSpread:10,galleryLoop:true};
const I18N={
  en:{title:'Customize',subtitle:'Instanced relief tiles with pointer ripple',studyLabel:'interactive WebGL study',parameters:'Parameters',copyConfig:'Copy Config',reset:'Reset',imageGallery:'Local Gallery',addImages:'Add Images',galleryEmpty:'No local images',galleryHint:'Select several images to start a sequence',galleryOrder:'Playback order',galleryOrderHint:'0 hides · positive numbers set playback order',galleryEnabled:'enabled',galleryAuto:'Auto Play',displayTime:'Display Time',transitionDuration:'Transition Duration',transitionSpread:'Particle Lift',galleryLoop:'Loop Gallery',imagesAdded:'images added',resolution:'Resolution',depth:'Depth',gap:'Gap',tileShape:'Tile Shape',square:'Square',round:'Round',hex:'Hex',hoverEffect:'Hover Effect',raise:'Raise',separate:'Separate',interactionRadius:'Interaction Radius',interactionStrength:'Interaction Strength',clickEffect:'Click Effect',pulse:'Pulse',rebuild:'Rebuild',none:'None',clickStrength:'Click Strength',pulseSpeed:'Pulse Spread Speed',colorMode:'Color Mode',image:'Image',mono:'Mono',luminance:'Luminance',baseColor:'Base Color',backgroundColor:'Background Color',invert:'Invert',removeBackground:'Remove Background',backgroundTolerance:'Background Tolerance',cameraTilt:'Tilt',scale:'Scale',offsetX:'Offset X',offsetY:'Offset Y',rotation:'Rotation',autoRotate:'Auto Rotate',rotateSpeed:'Rotate Speed',dpr:'DPR',hint:'Move pointer across the sculpture · Click for pulse · Drag-free demo',badge:'WEBGL2 · INSTANCED PRISMS · HEIGHTFIELD SCULPT',imageLoaded:'Image loaded',imageError:'Unable to read this image',copied:'Config copied',copyFailed:'Copy failed',webglError:'Your browser does not support WebGL2'},
  zh:{title:'参数调节',subtitle:'实例化浮雕方块 · 指针涟漪交互',studyLabel:'WebGL 交互研究',parameters:'参数',copyConfig:'复制配置',reset:'重置',imageGallery:'本地图库',addImages:'添加图片',galleryEmpty:'暂无本地图片',galleryHint:'选择多张图片即可开始轮播',galleryOrder:'播放序号',galleryOrderHint:'0 不播放 · 正整数决定播放顺序',galleryEnabled:'启用',galleryAuto:'自动播放',displayTime:'单图停留时间',transitionDuration:'切换持续时间',transitionSpread:'粒子跃升高度',galleryLoop:'循环播放',imagesAdded:'张图片已添加',resolution:'分辨率',depth:'浮雕深度',gap:'方块间距',tileShape:'方块形状',square:'方形',round:'圆形',hex:'六边形',hoverEffect:'悬停效果',raise:'抬升',separate:'分离',interactionRadius:'交互半径',interactionStrength:'交互强度',clickEffect:'点击效果',pulse:'脉冲',rebuild:'重构',none:'无',clickStrength:'点击强度',pulseSpeed:'脉冲扩散速度',colorMode:'颜色模式',image:'原图',mono:'单色',luminance:'亮度',baseColor:'基础颜色',backgroundColor:'背景颜色',invert:'反相高度',removeBackground:'移除背景',backgroundTolerance:'背景容差',cameraTilt:'视角倾斜',scale:'缩放',offsetX:'水平偏移',offsetY:'垂直偏移',rotation:'旋转',autoRotate:'自动旋转',rotateSpeed:'旋转速度',dpr:'像素比上限',hint:'移动鼠标查看局部起伏 · 点击触发脉冲 · 无需拖拽',badge:'WEBGL2 · 实例化棱柱 · 高度场雕塑',imageLoaded:'图片加载完成',imageError:'无法读取这张图片',copied:'配置已复制',copyFailed:'复制失败',webglError:'当前浏览器不支持 WebGL2'}
};
let currentLang=parameterLanguage();
function tr(key){return (I18N[currentLang]&&I18N[currentLang][key])||I18N.en[key]||key}
function applyLanguage(lang){currentLang=lang;document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.querySelectorAll('[data-i18n]').forEach(el=>{let k=el.dataset.i18n;if(I18N[lang][k])el.textContent=I18N[lang][k]});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{let k=el.dataset.i18nPlaceholder;if(I18N[lang][k])el.placeholder=I18N[lang][k]});clearGalleryOrderButton.textContent=lang==='zh'?'清除顺序':'Clear order';if(typeof renderGallery==='function')renderGallery();}

let sourceImage=null,pulses=[],pointerInside=false,clickStart=-99;
let visual;
const emit=(event,value)=>{if(disposed)return;if(event==='pixel-advance')switchPlayback(1,true);if(event==='pixel-transition'){transition=null;galleryShownAt=simulationNow();renderGallery();}};
const inputEvents=new AbortController();
if(!options.visualFactory){const forward=event=>{if(event.composedPath().some(node=>node===controls||node instanceof Element&&node.matches('button,a,input,textarea,select,[contenteditable],dialog,[role=menu],[popover]')))return;canvas.dispatchEvent(new PointerEvent(event.type,{clientX:event.clientX,clientY:event.clientY,button:event.button}));};for(const type of ['pointermove','pointerdown'])globalThis.addEventListener(type,forward,{signal:inputEvents.signal,passive:true});}
visual=options.visualFactory?options.visualFactory(canvas,onError,state,emit):startPixelKernel(canvas,onError,state,emit);
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
const currentBuffer=null;
function uploadDataset(_buffer,dataset){visual.setDataset(cleanDataset(dataset),true);}
function cleanDataset(dataset){const {data,pickData,heightGrid,count,cols,rows,aspect}=dataset;return {data,pickData,heightGrid,count,cols,rows,aspect};}
let currentDataset=null,gallery=[],currentGalleryIndex=-1,transition=null,galleryShownAt=0,gallerySequence=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function activateDataset(dataset,image){currentDataset=dataset;sourceImage=image||dataset.image;}
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
function settleInterruptedTransition(){}
function switchGallery(index,immediate=false){
 if(!gallery.length)return;index=(index%gallery.length+gallery.length)%gallery.length;
 const item=gallery[index],dataset=ensureDataset(item);sourceImage=item.image;currentDataset=dataset;currentGalleryIndex=index;transition=null;galleryShownAt=simulationNow();
 visual.setDataset(cleanDataset(dataset),immediate);scheduleFrame();renderGallery();
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
function resize(){scheduleFrame();}
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
const panelToggle=document.getElementById('panelToggle'),panelClose=document.getElementById('panelClose');
function setPanelOpen(open){panel.classList.toggle('is-collapsed',!open);panelToggle.hidden=open}
panelToggle.addEventListener('click',()=>setPanelOpen(true));panelClose.addEventListener('click',()=>setPanelOpen(false));
// The Code-Codex secondary panel owns responsive placement.
document.getElementById('reset').onclick=()=>resetConfig();
applyLanguage(currentLang);
const unsubscribeLanguage=subscribeLanguage(()=>applyLanguage(parameterLanguage()));


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
function saveLibrary(){if(options.persist===false)return Promise.resolve();const snapshot=gallery.map((item,i)=>({id:i+1,file:item.file,order:item.order}));saveQueue=saveQueue.catch(()=>{}).then(async()=>{const db=await openLibrary();try{await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');const store=tx.objectStore('images');const marker=store.get(DEFAULT_GALLERY_MARKER);marker.onsuccess=()=>{store.clear();snapshot.forEach(item=>store.put(item));if(marker.result)store.put(marker.result);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}).catch(error=>onError('Image library could not be saved: '+error.message));return saveQueue;}
async function restoreLibrary(){let db;try{db=await openLibrary();if(disposed)return;const records=await new Promise((resolve,reject)=>{const request=db.transaction('images').objectStore('images').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();db=undefined;let bytes=0;for(const record of records.filter(record=>record.file instanceof Blob).slice(0,32)){if(disposed)return;if(!(record.file instanceof Blob)||record.file.size>30*1024*1024||bytes+record.file.size>256*1024*1024)continue;const item=await decodeLocalFile(record.file);if(item){bytes+=record.file.size;item.order=Math.max(0,Math.floor(record.order||0));gallery.push(item);}}compactPlaybackOrder();const entries=playbackEntries();if(entries.length&&!disposed)switchGallery(entries[0].index,true);else renderGallery();}catch(error){if(!disposed)onError('Image library could not be restored: '+error.message);}finally{db?.close();}}
const originalAdd=addLocalFiles;
addLocalFiles=async files=>{if(disposed)return;const accepted=[];let bytes=gallery.reduce((sum,item)=>sum+(item.file?.size||0),0);for(const file of files){if(gallery.length+accepted.length>=32||file.size>30*1024*1024||bytes+file.size>256*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){onError('Image limit: 32 PNG/JPEG/WebP files, 30 MB each, 256 MB total.');continue;}bytes+=file.size;accepted.push(file);}await originalAdd(accepted);if(!disposed)await saveLibrary();};
for(const type of ['input','change','click'])controls.addEventListener(type,event=>{scheduleFrame();if(event.target.closest('[data-select],[data-remove]'))queueMicrotask(()=>saveLibrary());clearTimeout(storageTimer);storageTimer=setTimeout(saveSettings,180);});
applyConfig(savedSettings);
function simulationNow(){return Math.max(0,(hiddenAt||performance.now()/1000)-timeOffset);}
const ready=new Promise((resolve,reject)=>{rejectInitialization=reject;initializationTimer=setTimeout(()=>reject(new Error('Pixel Sculpt image initialization timed out')),15000);loadImage(__CODE_CODEX_PIXEL_SCULPT_IMAGE__,async image=>{if(!image){clearTimeout(initializationTimer);reject(new Error(disposed?'Pixel Sculpt activation was canceled':'The default Pixel Sculpt image could not be decoded'));return;}await restoreLibrary();clearTimeout(initializationTimer);if(disposed){reject(new Error('Pixel Sculpt activation was canceled'));return;}initialized=true;scheduleFrame();resolveFirstFrame();resolve();});});
void ready.catch(()=>{});
function resumeOpening(){if(disposed)return;const now=simulationNow();galleryShownAt=now;if(transition)transition.start=now;pulses.length=0;clickStart=-99;visual.replay();scheduleFrame();}
return {ready,firstFrame:visual.ready??firstFrame,resumeOpening,language:applyLanguage,reset:resetConfig,replay:()=>visual.replay(),setPaused(value){paused=value;visual.setPaused(value);},dispose(){if(disposed)return;unsubscribeLanguage();saveSettings();disposed=true;inputEvents.abort();clearTimeout(storageTimer);clearTimeout(initializationTimer);rejectInitialization?.(new Error('Pixel Sculpt activation was canceled'));resolveFirstFrame();visual.dispose();gallery.forEach(item=>URL.revokeObjectURL(item.url));controls.remove();}};
}
