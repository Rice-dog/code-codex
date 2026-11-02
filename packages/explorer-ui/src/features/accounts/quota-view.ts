import {assetControl,assetCss} from './asset-controls';
import {t,getLocale} from '../../i18n';
import type {AccountUsageStore} from './quota';
export function quotaElement(id:string,showReset=false):HTMLSpanElement {const e=document.createElement('span');e.className='account-quota';e.dataset.accountQuota=id;if(showReset)e.dataset.quotaResets='';return e;}
export function resetTimeLabel(reset:number|null,remaining:number|null,now=Date.now()):string {
 if(remaining===100)return t('accounts.quotaFull');
 if(!reset||reset*1000<=now)return t('accounts.resetUnknown');
 const date=new Date(reset*1000),today=new Date(now),locale=getLocale();
 const time=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 const sameDay=date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()&&date.getDate()===today.getDate();
 const day=sameDay?t('accounts.today'):new Intl.DateTimeFormat(locale,{...(date.getFullYear()!==today.getFullYear()?{year:'numeric' as const}:{}),month:'short',day:'numeric'}).format(date);
 return t('accounts.resetsAt',{time:`${day} ${time}`});
}
export function updateQuota(element:HTMLElement,store:AccountUsageStore|undefined):void {
 const values=store?.remaining(element.dataset.accountQuota!)??{fiveHour:null,weekly:null};
 const percent=(value:number|null)=>value===null?'—':`${value}%`;
 const showReset=element.hasAttribute('data-quota-resets'),resets=store?.resetTimes(element.dataset.accountQuota!)??{fiveHour:null,weekly:null};
 const labels=showReset?[resetTimeLabel(resets.fiveHour,values.fiveHour),resetTimeLabel(resets.weekly,values.weekly)]:[];
 const diagnostic=showReset?store?.diagnostics?.(element.dataset.accountQuota!):undefined;
 const time=diagnostic?.lastSuccessAt?new Intl.DateTimeFormat(getLocale(),{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(diagnostic.lastSuccessAt)):undefined;
 const code=diagnostic?.error?.match(/\b(?:ACCOUNT_[A-Z_]+|TIMEOUT)\b/)?.[0]??'ACCOUNT_USAGE_UNAVAILABLE';
 const observation=diagnostic?diagnostic.phase==='loading'?t('accounts.quotaRefreshing'):diagnostic.phase==='unavailable'?`${code}${time?' · '+t('accounts.quotaCached',{time}):''}`:time?t('accounts.quotaUpdated',{time}):'':'';
 const id=element.dataset.accountQuota!;const assets=showReset?store?.assets?.(id):undefined;
 const signature=JSON.stringify([values,labels,getLocale(),observation,assets,showReset&&store?.creditAllowed?.(id)]);if(element.dataset.quotaSignature===signature)return;element.dataset.quotaSignature=signature;
 const retained=new Map([...element.querySelectorAll<HTMLButtonElement>('[data-account-asset]')].map(b=>[b.dataset.accountAsset!,b]));
 const rows=[['5H',percent(values.fiveHour)],[t('accounts.weekly'),percent(values.weekly)]];
 element.replaceChildren(...rows.map(([name,value],index)=>{const row=document.createElement('span');row.className='account-quota-row';const label=document.createElement('span'),number=document.createElement('span');label.className='account-quota-label';number.className='account-quota-value';label.textContent=name!;number.textContent=value!;row.append(label,number);if(showReset){const reset=document.createElement('span');reset.className='account-quota-reset';reset.textContent=labels[index]!;row.append(reset);const kind=index===0?'credit':'reset';row.append(assetControl(id,kind,store,retained.get(kind)));}return row;}));
 if(observation){const status=document.createElement('span');status.className='account-quota-observation';status.style.gridColumn='1 / -1';status.style.overflow='hidden';status.style.textOverflow='ellipsis';status.textContent=observation;status.setAttribute('role','status');element.append(status);}
 element.setAttribute('aria-label',[t('accounts.remaining',{five:percent(values.fiveHour),weekly:percent(values.weekly)}),...labels,observation].filter(Boolean).join('; '));
}
export const accountQuotaCss=assetCss+'.account-quota{display:grid;grid-template-columns:max-content max-content;column-gap:5px;justify-content:end;justify-self:end;width:max-content;row-gap:0;flex:none;min-width:0;font-size:10px;line-height:13px;font-weight:400;white-space:nowrap;font-variant-numeric:tabular-nums;color:inherit;opacity:.8}.account-quota-row{display:contents}.account-quota-label,.account-quota-value{text-align:right;justify-self:stretch}.account-quota[data-quota-resets]{grid-template-columns:max-content max-content minmax(0,max-content) max-content max-content;width:100%;justify-self:start;justify-content:start;max-width:100%}.account-asset-button{display:grid!important;grid-template-columns:subgrid!important;grid-column:span 2;column-gap:5px!important;padding:0!important}.account-asset-label{margin-inline-start:10px}.account-asset-number{max-width:7ch}.account-quota-reset{text-align:start;margin-inline-start:5px;overflow:hidden;text-overflow:ellipsis;min-width:0}.accounts-details,.account-details{container-type:inline-size}@container(max-width:240px){.account-asset-button{display:grid!important;grid-template-columns:subgrid!important;grid-column:span 2;column-gap:5px!important;padding:0!important}.account-asset-label{margin-inline-start:8px}.account-asset-number{max-width:5ch}}';
