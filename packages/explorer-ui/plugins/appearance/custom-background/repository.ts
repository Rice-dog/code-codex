// custom responsibility; original state keys, defaults and lifecycle retained.
import { DB,STORE } from "./model";

export function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('CC-BG-STORAGE-BLOCKED: Close the other background settings window and retry.'));});}

export async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(STORE,mode),r=run(tx.objectStore(STORE));let result:T;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error??r.error);});}finally{db.close();}}
