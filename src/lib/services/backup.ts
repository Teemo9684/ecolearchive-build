import { STORES, repo, emitAllCollections, restoreBrowserStoresAtomically, type StoreName } from "../db/idb";
import { blobToDataUrl, dataUrlToBlob, downloadBlob, sha256 } from "../files";
import type { DocumentFile } from "../db/types";

const FORMAT = "tebessi-archive-backup";
const VERSION = 1;

interface BackupFile { format: string; version: number; createdAt: string; counts: Record<string, number>; stores: Record<string, unknown[]> }

/** Full backup: every store including binary attachments (base64 + SHA-256 for integrity). */
export async function exportFullBackup() {
  const stores: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const s of STORES) {
    const items = await repo<any>(s).list();
    if (s === "documentFiles") {
      stores[s] = await Promise.all(
        (items as DocumentFile[]).map(async (f) => ({ ...f, blob: await blobToDataUrl(f.blob) })),
      );
    } else stores[s] = items;
    counts[s] = items.length;
  }
  const data: BackupFile = { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), counts, stores };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `نسخة-احتياطية-${stamp}.json`);
  return counts;
}

export interface BackupCheck { ok: boolean; createdAt: string; counts: Partial<Record<StoreName, number>>; corrupted: string[]; data: BackupFile }

export async function verifyBackup(file: File): Promise<BackupCheck> {
  let data: BackupFile;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("الملف ليس نسخة احتياطية صالحة"); }
  if (!data || data.format !== FORMAT || data.version !== VERSION || !data.stores || typeof data.stores !== "object") throw new Error("صيغة النسخة الاحتياطية غير معروفة");
  for (const s of STORES) {
    if (!Array.isArray(data.stores[s])) throw new Error("نسخة احتياطية غير مكتملة: " + s);
    if (data.stores[s].some((x: any) => !x || typeof x.id !== "string")) throw new Error("بيانات غير صالحة في: " + s);
    if (typeof data.counts?.[s] === "number" && data.counts[s] !== data.stores[s].length) throw new Error("عدد السجلات غير متطابق في: " + s);
  }
  const corrupted: string[] = [];
  for (const f of (data.stores["documentFiles"] ?? []) as any[]) {
    const blob = await dataUrlToBlob(f.blob);
    const h = await sha256(blob);
    if (f.hash && h && h !== f.hash) corrupted.push(f.name);
  }
  const counts: Partial<Record<StoreName, number>> = {};
  for (const s of STORES) counts[s] = (data.stores[s] ?? []).length;
  return { ok: corrupted.length === 0, createdAt: data.createdAt, counts, corrupted, data };
}

export async function restoreBackup(check: BackupCheck) {
  if (!check.ok || check.corrupted.length) throw new Error("لا يمكن استرجاع نسخة احتياطية تالفة");
  for (const s of STORES) {
    if (!Array.isArray(check.data.stores[s])) throw new Error("النسخة لا تحتوي على جميع الجداول: " + s);
  }
  // Decode all files BEFORE clearing any live data.
  const prepared: Record<string, any[]> = {};
  for (const s of STORES) {
    const items = check.data.stores[s] as any[];
    prepared[s] = s === "documentFiles" ? await Promise.all(items.map(async f => ({...f,blob:await dataUrlToBlob(f.blob)}))) : items;
  }
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__?.invoke) {
    const records:{collection:string;id:string;payload:string}[]=[];
    const attachments:{id:string;name:string;mimeType:string;hash:string;base64:string;bytes:number}[]=[];
    for(const store of STORES) {
      for(const item of prepared[store]) {
        if(store==="documentFiles") {
          const file=item as DocumentFile;
          const bytes=new Uint8Array(await file.blob.arrayBuffer());
          let binary="";
          for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.slice(i,i+8192));
          attachments.push({id:file.id,name:file.name,mimeType:file.type,hash:file.hash,base64:btoa(binary),bytes:bytes.length});
        }else{
          records.push({collection:store,id:item.id,payload:JSON.stringify(item)});
        }
      }
    }
    await window.__TAURI_INTERNALS__.invoke("restore_verified_backup",{
      plan:{records,attachments,counts:check.data.counts}
    });
    emitAllCollections();
    return;
  }
  await restoreBrowserStoresAtomically(prepared);
}
