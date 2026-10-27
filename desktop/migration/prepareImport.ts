import { STORES, type StoreName } from "../../src/lib/db/idb";

export interface PortableBackup {
  format: "tebessi-archive-backup";
  version: 1;
  createdAt: string;
  counts: Record<string, number>;
  stores: Record<string, Array<Record<string, unknown>>>;
}
export interface DesktopImportPlan {
  records: Array<{ collection: StoreName; id: string; payload: string }>;
  attachments: Array<{ id: string; name: string; mimeType: string; hash: string; base64: string; bytes: number }>;
  counts: Record<string, number>;
}

/**
 * Builds a read-only import plan. Does not write to SQLite or IndexedDB.
 * The Windows host must verify SHA-256 over decoded attachments and commit
 * records + attachments in one SQLite transaction (or roll back everything).
 */
export function prepareDesktopImport(input: unknown): DesktopImportPlan {
  if (!input || typeof input !== "object") throw new Error("نسخة احتياطية غير صالحة");
  const b = input as Partial<PortableBackup>;
  if (b.format !== "tebessi-archive-backup" || b.version !== 1 ||
      !b.stores || !b.counts || typeof b.counts !== "object") {
    throw new Error("صيغة النسخة الاحتياطية غير مدعومة");
  }
  const records: DesktopImportPlan["records"] = [];
  const attachments: DesktopImportPlan["attachments"] = [];
  const counts: Record<string, number> = {};
  for (const store of STORES) {
    const entries = b.stores[store];
    if (!Array.isArray(entries)) throw new Error("جدول مفقود: " + store);
    if (b.counts[store] !== entries.length) throw new Error("عدد السجلات غير مطابق: " + store);
    counts[store] = entries.length;
    const ids = new Set<string>();
    for (const value of entries) {
      if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim()) {
        throw new Error("معرّف سجل غير صالح في " + store);
      }
      if (ids.has(value.id)) throw new Error("سجل مكرر في " + store);
      ids.add(value.id);
      if (store === "documentFiles") {
        const { blob, name, type, hash } = value;
        if (typeof blob !== "string" || typeof name !== "string" ||
            typeof type !== "string" || typeof hash !== "string") {
          throw new Error("ملف مرفق غير صالح");
        }
        const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(blob);
        if (!m || !m[2] || !/^[A-Za-z0-9+/]*={0,2}$/.test(m[3]) || m[3].length % 4 !== 0) {
          throw new Error("ترميز مرفق غير صالح: " + name);
        }
        const bytes = m[3].length / 4 * 3 - (m[3].endsWith("==") ? 2 : m[3].endsWith("=") ? 1 : 0);
        attachments.push({ id: value.id, name, mimeType: type, hash, base64: m[3], bytes });
      } else {
        records.push({ collection: store, id: value.id, payload: JSON.stringify(value) });
      }
    }
  }
  const fileIds = new Set(attachments.map(a => a.id));
  const docs = b.stores.documents;
  for (const doc of docs) {
    if (doc.fileId != null && (typeof doc.fileId !== "string" || !fileIds.has(doc.fileId))) {
      throw new Error("وثيقة تشير إلى مرفق غير موجود");
    }
  }
  return { records, attachments, counts };
}
