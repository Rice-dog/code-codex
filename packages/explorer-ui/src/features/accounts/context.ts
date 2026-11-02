/** Inspect native turn status without serializing, copying or storing conversation history. */
type Item={type?:string;text?:string;content?:Array<{type?:string;text?:string;url?:string;path?:string}>;command?:string;status?:string;aggregatedOutput?:string;path?:string;};
export interface ConversationTurn {turnId?:string;status?:string;items?:Item[];}
export interface NativeConversation {id:string;turns?:ConversationTurn[];[key:string]:unknown;}
/** Qualified native builds keep completed turns in canonical islands. */
export function conversationTurns(conversation:NativeConversation|undefined):ConversationTurn[]{
 if(!conversation)return [];
 const history=conversation.turnHistory as {kind?:string;history?:{islands?:Array<{entries:Array<{value:string}>}>;entitiesByKey?:Record<string,ConversationTurn>}}|undefined;
 const canonical=history?.kind==='canonical'?(history.history?.islands??[]).flatMap(i=>i.entries.map(e=>history.history?.entitiesByKey?.[e.value]).filter((t):t is ConversationTurn=>!!t)):[];
 const turns=[...canonical];
 for(const live of conversation.turns??[]){const at=live.turnId?turns.findIndex(t=>t.turnId===live.turnId):-1;if(at<0)turns.push(live);else turns[at]=live;}
 return turns;
}
export function normalizeSelection(value:unknown,connections:readonly {id:string}[]):string {
 if(value===undefined||value==='host')return 'host';
 if(typeof value==='string'&&connections.some(c=>c.id===value))return value;
 throw Error('ACCOUNT_CONNECTION_MISSING: The saved execution account is unavailable. Select an account explicitly before sending.');
}
export function turnIsActive(conversation:NativeConversation|undefined):boolean {
 // Match the qualified host's latest control turn. Old canonical islands can
 // retain an interrupted inProgress record after a newer turn has completed.
 const turns=conversationTurns(conversation);
 for(let i=turns.length-1;i>=0;i--){const t=turns[i]!;if(t.turnId!=null||t.status!=='completed'&&t.status!=='failed')return t.status==='inProgress';}
 return false;
}
