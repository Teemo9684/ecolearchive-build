import { repo } from "../db/idb";
import { sha256 } from "../files";
import type { Correspondence, DocumentFile, DocumentRecord } from "../db/types";

export interface ArchiveHealthReport {
  checkedDocuments: number;
  checkedFiles: number;
  checkedCorrespondences: number;
  problems: string[];
  checkedAt: string;
}

/** Read-only diagnostic: does not create, delete or rewrite any records. */
export async function inspectArchiveHealth(): Promise<ArchiveHealthReport> {
  const [documents, files, correspondences] = await Promise.all([
    repo<DocumentRecord>("documents").list(),
    repo<DocumentFile>("documentFiles").list(),
    repo<Correspondence>("correspondences").list(),
  ]);
  const problems: string[] = [];
  const filesById = new Map(files.map(f => [f.id, f]));
  const mailById = new Map(correspondences.map(c => [c.id, c]));
  const refs = new Map<string, string>();
  for (const c of correspondences) {
    if (c.deletedAt) continue;
    const key = c.direction + ":" + c.reference.trim();
    const former = refs.get(key);
    if (former && former !== c.id) problems.push("مرجع بريد مكرر: " + c.reference);
    else refs.set(key,c.id);
  }
  const docIds = new Set<string>();
  for (const doc of documents) {
    if (docIds.has(doc.id)) problems.push("معرّف وثيقة مكرر: " + doc.id);
    docIds.add(doc.id);
    const file = doc.fileId ? filesById.get(doc.fileId) : undefined;
    if (doc.fileId && !file) problems.push("مرفق مفقود: " + doc.title);
    if (file && doc.hash && file.hash && doc.hash !== file.hash) problems.push("بصمة غير متطابقة: " + doc.title);
    if (doc.relatedType === "correspondence" && doc.relatedId && !mailById.has(doc.relatedId)) {
      problems.push("وثيقة بريد غير مرتبطة بسجل موجود: " + doc.title);
    }
  }
  for (const file of files) {
    try {
      const digest = await sha256(file.blob);
      if (file.hash && digest && file.hash.toLowerCase() !== digest.toLowerCase()) {
        problems.push("ملف ذو محتوى غير مطابق للبصمة: " + file.name);
      }
    } catch {
      problems.push("تعذر قراءة الملف: " + file.name);
    }
  }
  for (const c of correspondences) {
    if (c.deletedAt) continue;
    if (!documents.some(d => d.id === "corr-archive-" + c.id && !d.deletedAt)) {
      problems.push("مراسلة لا تظهر في الأرشيف الرقمي: " + c.reference);
    }
  }
  return {
    checkedDocuments: documents.length,
    checkedFiles: files.length,
    checkedCorrespondences: correspondences.length,
    problems, checkedAt: new Date().toISOString(),
  };
}
