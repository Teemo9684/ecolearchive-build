import { desktopRepo, isDesktopRuntime } from "./desktop";
/**
 * Browser persistence adapter (IndexedDB). Everything else talks to the
 * `Repository` interface so this file can be swapped for a Tauri + SQLite
 * implementation without touching UI code.
 */
export const STORES = [
  "academicYears",
  "archiveCategories",
  "documents",
  "documentFiles",
  "correspondences",
  "teachers",
  "employees",
  "staffRecords",
  "students",
  "classes",
  "inventoryItems",
  "templates",
  "settings",
  "auditLogs",
] as const;
export type StoreName = (typeof STORES)[number];

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "tebessi-school-archive";
const VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("التخزين المحلي غير متوفر في هذا المتصفح"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

const listeners = new Map<StoreName, Set<() => void>>();
export function subscribe(store: StoreName, fn: () => void) {
  if (!listeners.has(store)) listeners.set(store, new Set());
  listeners.get(store)!.add(fn);
  return () => listeners.get(store)!.delete(fn);
}
function emit(store: StoreName) {
  listeners.get(store)?.forEach((f) => f());
}
/** Refresh reactive views after a transactional native SQLite restore. */
export function emitAllCollections() { for (const store of STORES) emit(store); }

export function idbRepo<T extends { id: string }>(store: StoreName): Repository<T> {
  const os = async (mode: IDBTransactionMode) => (await openDB()).transaction(store, mode).objectStore(store);
  return {
    async list() { return wrap((await os("readonly")).getAll()) as Promise<T[]>; },
    async get(id) { return wrap((await os("readonly")).get(id)) as Promise<T | undefined>; },
    async put(item) { await wrap((await os("readwrite")).put(item)); emit(store); },
    async putMany(items) {
      const db = await openDB();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(store, "readwrite");
        items.forEach((i) => tx.objectStore(store).put(i));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      emit(store);
    },
    async remove(id) { await wrap((await os("readwrite")).delete(id)); emit(store); },
    async clear() { await wrap((await os("readwrite")).clear()); emit(store); },
  };
}

/** Replace all browser collections in a single IndexedDB transaction. */
export async function restoreBrowserStoresAtomically(prepared: Record<string, any[]>) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...STORES], "readwrite");
    for (const store of STORES) {
      const target = tx.objectStore(store);
      target.clear();
      for (const item of prepared[store] ?? []) target.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("فشلت استعادة قاعدة البيانات"));
    tx.onerror = () => reject(tx.error ?? new Error("فشلت عملية التخزين"));
  });
  emitAllCollections();
}

const cache = new Map<StoreName, Repository<any>>();
export function repo<T extends { id: string }>(store: StoreName): Repository<T> {
  if (!cache.has(store)) {
    if (isDesktopRuntime()) {
      const native = desktopRepo<T>(store);
      cache.set(store, {
        list: () => native.list(),
        get: id => native.get(id),
        async put(item) { await native.put(item); emit(store); },
        async putMany(items) { await native.putMany(items); emit(store); },
        async remove(id) { await native.remove(id); emit(store); },
        async clear() { await native.clear(); emit(store); },
      } satisfies Repository<T>);
    } else cache.set(store, idbRepo<T>(store));
  }
  return cache.get(store)!;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
export const nowIso = () => new Date().toISOString();
