import {recordCaughtRuntimeError} from '../../runtime-operations';
export const EVENT_IDS=['school','dolphin','storm','meteor','duo'] as const;
export const JOURNAL_KEY='code-codex:shallow-ocean-events:v1';
export interface EventJournal {discovered:string[];excluded:string[]}
export function normalizeJournal(input:unknown):EventJournal {
 const value=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const known=(v:unknown)=>EVENT_IDS.filter(id=>Array.isArray(v)&&v.includes(id));
 const discovered=known(value.discovered);
 return {discovered,excluded:discovered.length===EVENT_IDS.length?known(value.excluded):[]};
}
export class OceanEventJournal {
 #state:EventJournal;#listeners=new Set<()=>void>();
 constructor(){try{this.#state=normalizeJournal(JSON.parse(localStorage.getItem(JOURNAL_KEY)??'{}'));}catch(error){recordCaughtRuntimeError('Ocean event collection read',error);this.#state=normalizeJournal(null);}}
 get state():EventJournal{return {discovered:[...this.#state.discovered],excluded:[...this.#state.excluded]};}
 get included():string[]{return EVENT_IDS.filter(id=>!this.#state.excluded.includes(id));}
 subscribe(listener:()=>void){this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};}
 discover(id:string):void{if(!EVENT_IDS.includes(id as typeof EVENT_IDS[number])||this.#state.discovered.includes(id))return;this.#commit({...this.#state,discovered:[...this.#state.discovered,id]});}
 toggle(id:string):void{if(this.#state.discovered.length!==EVENT_IDS.length||!EVENT_IDS.includes(id as typeof EVENT_IDS[number]))return;const excluded=this.#state.excluded.includes(id)?this.#state.excluded.filter(i=>i!==id):[...this.#state.excluded,id];this.#commit({...this.#state,excluded});}
 #commit(next:EventJournal){const normalized=normalizeJournal(next);try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(normalized));}catch(error){recordCaughtRuntimeError('Ocean event collection write',error);throw Error('OCEAN_COLLECTION_WRITE_FAILED: Event collection could not be saved.');}this.#state=normalized;for(const listener of this.#listeners)listener();}
}
