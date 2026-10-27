import { repo, uid, nowIso } from "../db/idb";
import { detectDocType, downloadBlob, sha256, MAX_FILE_MB } from "../files";
import type { DocumentFile, DocumentRecord, RelatedType } from "../db/types";
import { logAudit } from "./audit";

export interface ImportMeta {
  categoryId: string;
  subcategory: string;
  academicYear: string;
  tags: string[];
  description: string;
  date: string;
  relatedType: RelatedType | null;
  relatedId: string | null;
}

export interface PreparedFile { file: File; hash: string | null; duplicateOf: DocumentRecord | null; tooLarge: boolean }

/** Hash each file and look for an existing document with the same SHA-256. */
export async function prepareFiles(files: File[]): Promise<PreparedFile[]> {
  const existing = await repo<DocumentRecord>("documents").list();
  const out: PreparedFile[] = [];
  for (const file of files) {
    const tooLarge = file.size > MAX_FILE_MB * 1024 * 1024;
    const hash = tooLarge ? null : await sha256(file);
    const duplicateOf = hash ? existing.find((d) => d.hash === hash && !d.deletedAt) ?? null : null;
    out.push({ file, hash, duplicateOf, tooLarge });
  }
  return out;
}

/** Stores a copy of each file. The original on the user's disk is never modified. */
export async function importPrepared(items: PreparedFile[], meta: ImportMeta): Promise<number> {
  let n = 0;
  for (const it of items) {
    if (it.tooLarge) continue;
    const t = nowIso();
    const fid = uid();
    const f: DocumentFile = { id: fid, blob: it.file, hash: it.hash ?? "", name: it.file.name, type: it.file.type };
    await repo<DocumentFile>("documentFiles").put(f);
    const title = it.file.name.replace(/\.[^.]+$/, "");
    const doc: DocumentRecord = {
      id: uid(), title, reference: "", categoryId: meta.categoryId, subcategory: meta.subcategory,
      academicYear: meta.academicYear, docType: detectDocType(it.file.name, it.file.type), tags: meta.tags,
      description: meta.description, date: meta.date, relatedType: meta.relatedType, relatedId: meta.relatedId,
      fileId: fid, fileName: it.file.name, mimeType: it.file.type || null, size: it.file.size, hash: it.hash,
      status: "active", deletedAt: null, createdAt: t, updatedAt: t,
    };
    await repo<DocumentRecord>("documents").put(doc);
    await logAudit("import", "document", doc.id, `استيراد ${it.file.name}`);
    n++;
  }
  return n;
}

export async function updateDocument(doc: DocumentRecord) {
  await repo<DocumentRecord>("documents").put({ ...doc, updatedAt: nowIso() });
  await logAudit("update", "document", doc.id, `تعديل بيانات ${doc.title}`);
}
export const setArchived = (d: DocumentRecord, archived: boolean) =>
  updateDocument({ ...d, status: archived ? "archived" : "active" });
export const moveToBin = (d: DocumentRecord) => updateDocument({ ...d, deletedAt: nowIso() });
export const restoreFromBin = (d: DocumentRecord) => updateDocument({ ...d, deletedAt: null });

/** Permanent removal from the app store only (never touches files on the PC). */
export async function purgeDocument(d: DocumentRecord) {
  if (d.fileId) await repo("documentFiles").remove(d.fileId);
  await repo("documents").remove(d.id);
  await logAudit("purge", "document", d.id, `حذف نهائي ${d.title}`);
}

export async function getFile(d: DocumentRecord) {
  return d.fileId ? repo<DocumentFile>("documentFiles").get(d.fileId) : undefined;
}
export async function downloadDocument(d: DocumentRecord) {
  const f = await getFile(d);
  if (!f) throw new Error("لا يوجد ملف مرفق");
  downloadBlob(f.blob, d.fileName ?? f.name);
}
