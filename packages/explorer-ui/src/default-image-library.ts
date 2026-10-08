/** Immutable media supplied by verified first-party package companion scripts. */
import { runtimeEvent } from './runtime-events';
interface DefaultImage {
  id: string; name: string; type: string; size: number; sha256: string;
  data: string; thumbnail?: string; order: number;
  positionX: number; positionY: number; zoom: number;
  createdAt?: number;
}
interface DefaultGallery { version: number; count: number; images: Map<string, DefaultImage> }
const KEY = Symbol.for('code-codex:default-galleries:v1');
export const DEFAULT_GALLERY_MARKER = '__codeCodex_default_media_v1__';
const operations = new Map<string, Promise<void>>();
function blob(data: string, type: string): Blob {
  const text = atob(data); const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return new Blob([bytes], { type });
}
async function digest(value: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await value.arrayBuffer());
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export function prepareDefaultImageLibrary(id: 'particle-image' | 'pixel-sculpt'): Promise<void> {
  const current = operations.get(id); if (current) return current;
  runtimeEvent('default-media','import','started',{id});
  const task = prepare(id).catch(error=>{
    runtimeEvent('default-media','import','failed',{id,reason:String(error)});throw error;
  }).finally(() => operations.delete(id));
  operations.set(id, task); return task;
}
async function prepare(id: 'particle-image' | 'pixel-sculpt'): Promise<void> {
  const registry = (window as unknown as Record<symbol, Map<string, DefaultGallery>>)[KEY];
  const gallery = registry?.get(id);
  // Legacy fixture/old-package paths without a default gallery keep their behavior.
  if (!gallery) return;
  if (gallery.images.size !== gallery.count) throw new Error(`Default images for ${id} are incomplete. Download the plugin again.`);
  const name = id === 'particle-image' ? 'code-codex-particle-image-background' : 'code-codex-pixel-sculpt';
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('images')) request.result.createObjectStore('images', {keyPath:'id'});
    };
    request.onsuccess = () => {if (rejected) request.result.close(); else resolve(request.result);};
    request.onerror = () => reject(request.error ?? new Error('Default image storage is unavailable'));
    request.onblocked = () => {rejected=true;reject(new Error('Close the other window using this image library and retry.'));};
  });
  try {
    const read = <T>(store: string, all = false) => new Promise<T>((resolve, reject) => {
      const request = all ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(DEFAULT_GALLERY_MARKER);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const previous = await read<{version:number}|undefined>('images');
    if (previous && previous.version >= gallery.version) {runtimeEvent('default-media','import','already initialized',{id,count:gallery.count,version:gallery.version});return;}
    const existing = (await read<Array<{id:unknown;file?:Blob;blob?:Blob;size?:number;sha256?:string}>>('images', true)).filter(record=>record.file instanceof Blob || record.blob instanceof Blob);
    const hashes = new Set<string>();
    for (const record of existing) {
      const value = record.file ?? record.blob;
      if (record.sha256) hashes.add(record.sha256);
      else if (value instanceof Blob && [...gallery.images.values()].some(item => item.size === value.size)) hashes.add(await digest(value));
    }
    const ids = new Set(existing.map(record => record.id));
    let bytes = existing.reduce((sum, record) => sum + (record.file?.size ?? record.blob?.size ?? 0), 0);
    const records: Array<Record<string, unknown>> = [];
    for (const item of [...gallery.images.values()].sort((a,b)=>(a.createdAt??0)-(b.createdAt??0))) {
      if (hashes.has(item.sha256) || ids.has(item.id)) continue;
      if (existing.length + records.length >= 32 || bytes + item.size > 256 * 1024 * 1024) throw new Error('There is not enough image-library capacity for the default images. Remove some images and retry.');
      const value = blob(item.data, item.type);
      if (value.size !== item.size || await digest(value) !== item.sha256) throw new Error(`Default image ${item.name} failed verification.`);
      bytes += value.size;
      records.push(id === 'pixel-sculpt'
        ? {id:item.id, file:new File([value], item.name, {type:item.type}), order:item.order, sha256:item.sha256}
        : {id:item.id,name:item.name,type:item.type,size:item.size,createdAt:item.createdAt??records.length + 1,blob:value,thumbnail:blob(item.thumbnail ?? item.data, item.type),positionX:item.positionX,positionY:item.positionY,zoom:item.zoom,sha256:item.sha256});
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite');
      const metadata = tx.objectStore('images'); const marker = metadata.get(DEFAULT_GALLERY_MARKER);
      marker.onsuccess = () => {
        if (marker.result?.version >= gallery.version) return;
        for (const record of records) tx.objectStore('images').add(record);
        metadata.put({id:DEFAULT_GALLERY_MARKER,version:gallery.version,count:gallery.count});
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Default image import was cancelled'));
    });
    // Only a genuinely empty library gets an initial playback selection.
    // Existing user choices and explicit deletions are never reset on reopen.
    if (id === 'particle-image' && existing.length === 0 && records.length) {
      const key='code-codex:particle-image-background:v1';
      let settings: Record<string, any> = {};
      try { settings=JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { /* Restore normalized defaults for malformed legacy settings. */ }
      if (!settings.selectedImageIds?.length) {
        settings.selectedImageIds=records.map(record=>record.id); settings.activeImageId=records[0]?.id;
        localStorage.setItem(key,JSON.stringify(settings));
      }
    }
    runtimeEvent('default-media','import','passed',{id,count:gallery.count,added:records.length,existing:existing.length,version:gallery.version});
  } finally { db.close(); }
}
