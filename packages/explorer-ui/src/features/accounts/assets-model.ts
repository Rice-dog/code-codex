export interface ResetCard {id:string;grantedAt:number;title:string;description:string;expiresAt:number|null;resetType:string;status:string;}
export interface AccountAssets {balance:string|null;hasCredits:boolean|null;unlimited:boolean;availableCount:number|null;cards:ResetCard[]|null;}
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function projectAssets(raw:unknown):Partial<AccountAssets>{
 const r=obj(raw),limits=obj(r.rateLimitsByLimitId),b=obj(limits.codex??r.rateLimits),out:Partial<AccountAssets>={};
 if(Object.hasOwn(b,'credits')){const c=obj(b.credits),balance=typeof c.balance==='string'&&c.balance.length<=80&&/^\d+(?:\.\d+)?$/.test(c.balance)&&Number.isFinite(Number(c.balance))?c.balance:null;out.balance=balance;out.hasCredits=typeof c.hasCredits==='boolean'?c.hasCredits:null;out.unlimited=c.unlimited===true;}
 if(Object.hasOwn(r,'rateLimitResetCredits')){const c=obj(r.rateLimitResetCredits);out.availableCount=typeof c.availableCount==='number'&&Number.isSafeInteger(c.availableCount)&&c.availableCount>=0?c.availableCount:null;out.cards=Array.isArray(c.credits)?c.credits.slice(0,64).map(obj).filter(v=>typeof v.id==='string'&&v.id.length>0&&v.id.length<=256&&typeof v.grantedAt==='number'&&Number.isSafeInteger(v.grantedAt)&&v.grantedAt>0&&(v.expiresAt===null||typeof v.expiresAt==='number'&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0&&v.expiresAt<=8640000000000)).map(v=>({id:v.id as string,grantedAt:v.grantedAt as number,title:typeof v.title==='string'?v.title.slice(0,200):'',description:typeof v.description==='string'?v.description.slice(0,600):'',expiresAt:typeof v.expiresAt==='number'&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0?v.expiresAt:null,resetType:typeof v.resetType==='string'?v.resetType:'unknown',status:typeof v.status==='string'?v.status:'unknown'})):null;}
 return out;
}
export const emptyAssets=():AccountAssets=>({balance:null,hasCredits:null,unlimited:false,availableCount:null,cards:null});
export const usableCredits=(a:AccountAssets)=>a.unlimited||a.hasCredits===true&&a.balance!==null&&Number(a.balance)>0;

export function assetProjection(raw:unknown):Record<string,unknown>{const r=obj(raw),b=obj(r.rateLimits),a=projectAssets(raw),out:Record<string,unknown>={};if(Object.hasOwn(b,'credits'))out.credits={balance:a.balance??null,hasCredits:a.hasCredits??null,unlimited:a.unlimited??false};if(Object.hasOwn(r,'rateLimitResetCredits'))out.rateLimitResetCredits={availableCount:a.availableCount??null,credits:a.cards??null};return out;}
