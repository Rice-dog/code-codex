// custom responsibility; original state keys, defaults and lifecycle retained.

// Custom media stays local. The library and controls reuse Startup Transition's
// original class names so both panels share the exact same layout and sliders.
export type Parameters = {scale:number;x:number;y:number;rotation:number;opacity:number;blur:number;brightness:number;contrast:number;saturation:number;speed:number;fit:'cover'|'contain'};

export type Media = {id:string;name:string;kind:'image'|'video';blob:Blob;parameters:Parameters};

export const defaults:Parameters={scale:100,x:0,y:0,rotation:0,opacity:100,blur:0,brightness:100,contrast:100,saturation:100,speed:1,fit:'cover'};

export const DB='code-codex-custom-background', STORE='media', KEY='code-codex:custom-background:v1';

export const controls:[keyof Parameters,string,string,number,number,number,string][]=[
 ['scale','缩放','Scale',10,300,1,'%'],['x','水平位置','Horizontal position',-100,100,1,'%'],['y','垂直位置','Vertical position',-100,100,1,'%'],['rotation','旋转','Rotation',-180,180,1,'°'],['opacity','透明度','Opacity',0,100,1,'%'],['blur','模糊','Blur',0,60,.5,'px'],['brightness','亮度','Brightness',0,200,1,'%'],['contrast','对比度','Contrast',0,200,1,'%'],['saturation','饱和度','Saturation',0,200,1,'%'],['speed','播放速度','Playback speed',.25,2,.05,'×']];

export function normalizeParameters(value:Partial<Parameters>={}):Parameters{const result={...defaults,...value};for(const [key,,,min,max] of controls){const n=Number(value[key]??defaults[key]);(result as unknown as Record<string,unknown>)[key]=Number.isFinite(n)?Math.max(min,Math.min(max,n)):defaults[key];}result.fit=value.fit==='contain'?'contain':'cover';return result;}
