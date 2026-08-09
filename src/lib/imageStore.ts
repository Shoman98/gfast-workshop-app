/**
 * IndexedDB store for analysis images awaiting upload after estimate confirmation.
 *
 * These images (several compressed photos as data URLs) are too large for
 * sessionStorage, whose ~2–5MB cap overflows on mobile browsers and throws
 * QuotaExceededError ("quota has been exceeded"). IndexedDB's per-origin quota
 * is far larger, so it holds the batch reliably across the analyze → confirm flow.
 */

const DB_NAME = 'gfast';
const STORE = 'kv';
const KEY = 'analysisImages';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAnalysisImages(images: string[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(images, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadAnalysisImages(): Promise<string[] | null> {
  const db = await openDb();
  try {
    return await new Promise<string[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as string[]) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearAnalysisImages(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
