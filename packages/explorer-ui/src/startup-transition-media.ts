const DATABASE_NAME = "code-codex-startup-transition";
const STORE_NAME = "video";
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

export interface StartupVideo {
  id: string;
  blob: Blob;
  name: string;
  duration: number;
  size: number;
  type: string;
  thumbnail?: Blob;
  createdAt?: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Video storage is unavailable"));
  });
}

export async function loadStartupVideo(id = "selected"): Promise<StartupVideo | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const value = request.result as StartupVideo | undefined;
        resolve(value?.blob instanceof Blob && Number.isFinite(value.duration) ? value : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the saved video"));
    });
  } finally {
    database.close();
  }
}

export async function listStartupVideos(): Promise<StartupVideo[]> {
  const database=await openDatabase();
  try { return await new Promise((resolve,reject)=>{
    const request=database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess=()=>resolve((request.result as StartupVideo[]).filter(v=>typeof v.id==="string" && v.blob instanceof Blob && Number.isFinite(v.duration)).sort((a,b)=>(a.createdAt??0)-(b.createdAt??0)||a.id.localeCompare(b.id)));
    request.onerror=()=>reject(request.error??new Error("Could not read the video library"));
  }); } finally { database.close(); }
}

function inspectVideo(file: File): Promise<{duration:number;thumbnail?:Blob}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error("The video could not be read")), 10_000);
    const finish = (result: {duration:number;thumbnail?:Blob} | Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    video.preload = "auto";
    video.addEventListener("loadeddata", () => {
      const duration = video.duration;
      if(!Number.isFinite(duration) || duration<0.2) { finish(new Error("Choose a video at least 0.2 seconds long"));return; }
      try {
        const canvas=document.createElement("canvas");canvas.width=192;canvas.height=144;
        const ctx=canvas.getContext("2d");
        if(!ctx) {finish({duration});return;}
        const scale=Math.max(192/video.videoWidth,144/video.videoHeight);
        ctx.drawImage(video,(192-video.videoWidth*scale)/2,(144-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale);
        canvas.toBlob(thumbnail=>finish({duration,...(thumbnail?{thumbnail}:{})}),"image/jpeg",.72);
      } catch {finish({duration});}
    }, { once: true });
    video.addEventListener("error", () => finish(new Error("This video format cannot be played by Codex")), { once: true });
    video.src = url;
  });
}

export async function saveStartupVideo(file: File): Promise<StartupVideo> {
  if (!file.type.startsWith("video/") || file.size === 0) throw new Error("Choose a playable video file");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Choose a video smaller than 128 MB");
  const inspected = await inspectVideo(file);
  const record: StartupVideo = { id: crypto.randomUUID().replaceAll("-",""), blob: file, name: file.name, ...inspected, size: file.size, type: file.type,createdAt:Date.now() };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      let failure: Error | undefined;
      const store=transaction.objectStore(STORE_NAME), existing=store.getAll();
      existing.onsuccess=()=>{
        const videos=(existing.result as StartupVideo[]).filter(v=>v.blob instanceof Blob);
        const bytes=videos.reduce((n,v)=>n+v.blob.size+(v.thumbnail?.size??0),0)+record.blob.size+(record.thumbnail?.size??0);
        if(videos.length>=32 || bytes>512*1024*1024) {failure=new Error("Video library limit: 32 videos / 512 MB. Remove a video and retry.");transaction.abort();return;}
        store.add(record);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The video could not be saved"));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("There is not enough local storage for this video"));
    });
  } finally {
    database.close();
  }
  return record;
}

export async function removeStartupVideo(id = "selected"): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The video could not be removed"));
    });
  } finally {
    database.close();
  }
}
