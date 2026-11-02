export const BACKGROUND_PROTOCOL=1;
export const BACKGROUND_STATE_LIMIT=65536;
/** Separate bounded bulk lane for prepared numeric visual assets. */
export function visualPayload(value:unknown):unknown{
 let bytes=0,nodes=0,textBytes=0;
 const visit=(v:unknown,depth:number):unknown=>{
  if(++nodes>8192||depth>10)throw Error('BG_ASSET_SHAPE: Visual asset structure exceeds its budget.');
  if(ArrayBuffer.isView(v)){if((v instanceof Float32Array||v instanceof Float64Array)&&!v.every(Number.isFinite))throw Error('BG_ASSET_NUMBER: Prepared visual numbers must be finite.');bytes+=v.byteLength;if(bytes>32*1024*1024)throw Error('BG_ASSET_SIZE: Prepared visual assets exceed 32 MiB.');return v;}
  if(Array.isArray(v))return v.map(x=>visit(x,depth+1));
  if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){const result:Record<string,unknown>={};for(const[k,x]of Object.entries(v)){visualState({[k]:null});textBytes+=new TextEncoder().encode(k).length+4;if(textBytes>BACKGROUND_STATE_LIMIT)throw Error('BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.');result[k]=visit(x,depth+1);}return result;}
  const result=visualState(v);textBytes+=new TextEncoder().encode(JSON.stringify(result)).length;if(textBytes>BACKGROUND_STATE_LIMIT)throw Error('BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.');return result;
 };
 return visit(value,0);
}
export interface BackgroundViewport {width:number;height:number;left:number;top:number;dpr:number;}
/** The visual lane never accepts request dispatchers, paths, code or account state. */
export function visualState(value:unknown):unknown{
 let count=0;
 const visit=(v:unknown,depth:number):unknown=>{
  if(++count>4096||depth>8)throw Error('BG_STATE_LIMIT: Visual state exceeds the bounded schema.');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('BG_STATE_NUMBER: Visual numbers must be finite.');return v;}
  if(typeof v==='string'){if(v.length>1024)throw Error('BG_STATE_STRING: Visual strings must be bounded.');return v;}
  if(Array.isArray(v))return v.map(x=>visit(x,depth+1));
  if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){
   const result:Record<string,unknown>={};
   for(const [key,x] of Object.entries(v)){
    if(/^(?:__proto__|constructor|prototype|token|accessToken|refreshToken|authorization|cookie|bridge|conversation|history|source|url|path)$/i.test(key))throw Error('BG_STATE_FIELD: Visual state contains an unsupported field.');
    if(x!==undefined)result[key]=visit(x,depth+1);
   }
   return result;
  }
  throw Error('BG_STATE_TYPE: Visual state must contain serializable visual values.');
 };
 const result=visit(value,0);
 if(new TextEncoder().encode(JSON.stringify(result)).length>BACKGROUND_STATE_LIMIT)throw Error('BG_STATE_SIZE: Visual state exceeds the message budget.');
 return result;
}
export function viewportState(rect:{width:number;height:number;left:number;top:number},dpr:number):BackgroundViewport{
 if(![rect.width,rect.height,rect.left,rect.top,dpr].every(Number.isFinite)||rect.width<0||rect.height<0)throw Error('BG_VIEWPORT_INVALID: Invalid visual dimensions.');
 const width=Math.max(1,Math.min(8192,rect.width)),height=Math.max(1,Math.min(8192,rect.height));
 const pixelRatio=Math.min(3,Math.max(.5,dpr),Math.sqrt(16777216/(width*height)));
 return {width,height,left:rect.left,top:rect.top,dpr:pixelRatio};
}
