export interface ResetCard {id:string;grantedAt:number;title:string;description:string;expiresAt:number|null;resetType:string;status:string;}
export interface AccountAssets {balance:string|null;hasCredits:boolean|null;unlimited:boolean;availableCount:number|null;cards:ResetCard[]|null;}
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function projectAssets(raw:unknown):Partial<AccountAssets>{
 const r=obj(raw),limits=obj(r.rateLimitsByLimitId),b=obj(limits.codex??r.rateLimits),out:Partial<AccountAssets>={};
 if(Object.hasOwn(b,'credits')){const c=obj(b.credits),balance=typeof c.balance==='string'&&c.balance.length<=80&&/^\d+(?:\.\d+)?$/.test(c.balance)&&Number.isFinite(Number(c.balance))?c.balance:null;out.balance=balance;out.hasCredits=typeof c.hasCredits==='boolean'?c.hasCredits:null;out.unlimited=c.unlimited===true;}
 if(Object.hasOwn(r,'rateLimitResetCredits')){const c=obj(r.rateLimitResetCredits);out.availableCount=typeof c.availableCount==='number'&&Number.isSafeInteger(c.availableCount)&&c.availableCount>=0?c.availableCount:null;out.cards=Array.isArray(c.credits)?c.credits.slice(0,64).map(obj).filter(v=>typeof v.id==='string'&&v.id.length>0&&v.id.length<=256&&typeof v.grantedAt==='number'&&Number.isSafeInteger(v.grantedAt)&&v.grantedAt>0&&(v.expiresAt==null||typeof v.expiresAt==='number'&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0&&v.expiresAt<=8640000000000)).map(v=>({id:v.id as string,grantedAt:v.grantedAt as number,title:typeof v.title==='string'?v.title.slice(0,200):'',description:typeof v.description==='string'?v.description.slice(0,600):'',expiresAt:typeof v.expiresAt==='number'&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0?v.expiresAt:null,resetType:typeof v.resetType==='string'?v.resetType:'unknown',status:typeof v.status==='string'?v.status:'unknown'})):null;}
 return out;
}
export const emptyAssets=():AccountAssets=>({balance:null,hasCredits:null,unlimited:false,availableCount:null,cards:null});
export const usableCredits=(a:AccountAssets)=>a.unlimited||a.hasCredits===true&&a.balance!==null&&Number(a.balance)>0;

/** Details may be absent even when the official summary reports available cards. */
export function requireResetCard(raw:unknown,id:string,now=Date.now(),known?:ResetCard):ResetCard {
 const assets=projectAssets(raw);
 const incomplete=(assets.availableCount??0)>(assets.cards?.length??0);
 if(assets.cards==null&&!incomplete)throw Error('ACCOUNT_RESET_DETAILS_UNAVAILABLE: Fresh reset-card details were not returned. Expiration is unknown. No redemption was sent.');
 const card=assets.cards?.find(c=>c.id===id)??(incomplete&&known?.id===id?known:undefined);
 if(!card&&incomplete)throw Error('ACCOUNT_RESET_DETAILS_UNAVAILABLE: Card details are incomplete and no verified card snapshot is available. No redemption was sent.');
 if(!card||card.status!=='available')throw Error('ACCOUNT_RESET_UNAVAILABLE: The selected reset is no longer available. No redemption was sent.');
 if(card.resetType!=='codexRateLimits')throw Error('ACCOUNT_RESET_UNSUPPORTED: This reset type is not supported. No redemption was sent.');
 if(card.expiresAt!==null&&card.expiresAt*1000<=now)throw Error('ACCOUNT_RESET_EXPIRED: The selected reset has expired. No redemption was sent.');
 return card;
}
export function resetDefinitelyNotSent(error:unknown):boolean {
 const code=String(error).match(/\bACCOUNT_RESET_[A-Z_]+\b/)?.[0];
 return ['ACCOUNT_RESET_DETAILS_UNAVAILABLE','ACCOUNT_RESET_UNAVAILABLE','ACCOUNT_RESET_UNSUPPORTED','ACCOUNT_RESET_EXPIRED','ACCOUNT_RESET_STALE'].includes(code??'');
}

export function assetProjection(raw:unknown):Record<string,unknown>{const r=obj(raw),b=obj(r.rateLimits),a=projectAssets(raw),out:Record<string,unknown>={};if(Object.hasOwn(b,'credits'))out.credits={balance:a.balance??null,hasCredits:a.hasCredits??null,unlimited:a.unlimited??false};if(Object.hasOwn(r,'rateLimitResetCredits'))out.rateLimitResetCredits={availableCount:a.availableCount??null,credits:a.cards??null};return out;}
