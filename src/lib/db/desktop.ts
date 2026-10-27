import type { Repository, StoreName } from "./idb";

type DesktopInvoke = (command: string, args?: Record<string, unknown>) => Promise<any>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: { invoke: DesktopInvoke };
  }
}

/** Keep the web application on IndexedDB; only desktop runtime calls SQLite. */
export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const commandRunner = typeof window !== "undefined" ? window.__TAURI_INTERNALS__?.invoke : undefined;
  if (!commandRunner) return Promise.reject(new Error("محرك التخزين المكتبي غير متوفر"));
  return commandRunner(command, args);
}

type StoredFile = { id: string; name: string; mimeType: string; hash: string; base64: string };
type BrowserFile = { id: string; name: string; type: string; hash: string; blob: Blob };

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset++) bytes[offset] = binary.charCodeAt(offset);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  // Chunk to avoid stack overflows for large scanned documents.
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    let chunk = "";
    for (const b of bytes.subarray(i, i + 8192)) chunk += String.fromCharCode(b);
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
}

function toBrowserFile(value: StoredFile): BrowserFile {
  return { id: value.id, name: value.name, type: value.mimeType, hash: value.hash,
    blob: new Blob([fromBase64(value.base64)], { type: value.mimeType }) };
}

async function toStoredFile(value: BrowserFile): Promise<StoredFile> {
  return { id: value.id, name: value.name, mimeType: value.type, hash: value.hash,
    base64: toBase64(new Uint8Array(await value.blob.arrayBuffer())) };
}

export function desktopRepo<T extends { id: string }>(collection: StoreName): Repository<T> {
  if (collection === "documentFiles") {
    return {
      async list() { return (await invoke<StoredFile[]>("list_files")).map(toBrowserFile) as T[]; },
      async get(id) { const f = await invoke<StoredFile | null>("get_file", { id }); return (f ? toBrowserFile(f) : undefined) as T | undefined; },
      async put(item) { await invoke("put_file", { value: await toStoredFile(item as unknown as BrowserFile) }); },
      async putMany(items) {
        for (const item of items) await invoke("put_file", { value: await toStoredFile(item as unknown as BrowserFile) });
      },
      async remove(id) { await invoke("remove_file", { id }); },
      async clear() { await invoke("clear_files"); },
    };
  }
  return {
    async list() { return invoke<T[]>("list_records", { collection }); },
    async get(id) { return (await invoke<T | null>("get_record", { collection, id })) ?? undefined; },
    async put(value) { await invoke("put_record", { collection, value }); },
    async putMany(values) { await invoke("put_many_records", { collection, values }); },
    async remove(id) { await invoke("remove_record", { collection, id }); },
    async clear() { await invoke("clear_records", { collection }); },
  };
}
