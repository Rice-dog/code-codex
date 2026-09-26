const DATABASE_NAME = "code-codex-startup-transition";
const STORE_NAME = "video";
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

export interface StartupVideo {
  id: "selected";
  blob: Blob;
  name: string;
  duration: number;
  size: number;
  type: string;
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

export async function loadStartupVideo(): Promise<StartupVideo | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("selected");
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

function inspectVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error("The video could not be read")), 10_000);
    const finish = (result: number | Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      const duration = video.duration;
      finish(Number.isFinite(duration) && duration >= 0.2 ? duration : new Error("Choose a video at least 0.2 seconds long"));
    }, { once: true });
    video.addEventListener("error", () => finish(new Error("This video format cannot be played by Codex")), { once: true });
    video.src = url;
  });
}

export async function saveStartupVideo(file: File): Promise<StartupVideo> {
  if (!file.type.startsWith("video/") || file.size === 0) throw new Error("Choose a playable video file");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Choose a video smaller than 128 MB");
  const duration = await inspectVideo(file);
  const record: StartupVideo = { id: "selected", blob: file, name: file.name, duration, size: file.size, type: file.type };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The video could not be saved"));
      transaction.onabort = () => reject(transaction.error ?? new Error("There is not enough local storage for this video"));
    });
  } finally {
    database.close();
  }
  return record;
}

export async function removeStartupVideo(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete("selected");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The video could not be removed"));
    });
  } finally {
    database.close();
  }
}
