import { repo, nowIso } from "../db/idb";
import { sha256 } from "../files";
import { logAudit } from "./audit";
import type { ArchiveCategory, DocumentFile, DocumentRecord, Settings, Template } from "../db/types";

/** Keep one archive entry per edited template, with a locally stored readable snapshot. */
export async function archiveGeneratedTemplate(t: Template, settings: Settings): Promise<DocumentRecord> {
  const archives = repo<DocumentRecord>("documents");
  const files = repo<DocumentFile>("documentFiles");
  const all = await archives.list();
  const key = `generated-template:${t.id}`;
  const existing = all.find(d => d.id === `generated-document-${t.id}` || d.reference === key);
  const categories = await repo<ArchiveCategory>("archiveCategories").list();
  const categoryName =
    t.kind === "جدول إرسال" ? "جداول الإرسال" :
    t.kind === "محضر اجتماع" ? "المحاضر" :
    t.kind.includes("شهادة") || t.kind.includes("إشعار") ? "الشهادات والاستمارات" :
    "المراسلات الإدارية";
  const category = categories.find(c => c.name === categoryName) ?? categories.find(c => c.name === "وثائق المؤسسة") ?? categories[0];
  if (!category) throw new Error("تصنيفات الأرشيف غير مهيأة");
  const now = nowIso();
  const id = existing?.id ?? `generated-document-${t.id}`;
  const fileId = existing?.fileId ?? `generated-file-${t.id}`;
  const content = [
    settings.headerLine, settings.directorate,
    settings.schoolName + " — " + settings.city,
    "", t.name.trim(), "", t.body,
    "", "مديرة المدرسة: ........................",
  ].join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const fileName = (t.name.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 90) || "وثيقة") + ".txt";
  const hash = await sha256(blob);
  const priorFile = existing?.fileId ? await files.get(fileId) : undefined;
  const preserveWord = priorFile?.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!preserveWord) await files.put({ id: fileId, blob, hash: hash ?? "", name: fileName, type: blob.type });
  const year = (existing?.date ?? now).slice(0,4);
  const matching = all.map(d => /^أرش\/(\d+)\/(\d{4})$/.exec(d.reference)).filter((m): m is RegExpExecArray => !!m && m[2] === year);
  const next = Math.max(0, ...matching.map(m => Number(m[1]))) + 1;
  const officialRef = existing?.reference.startsWith("أرش/") ? existing.reference : `أرش/${String(next).padStart(3,"0")}/${year}`;
  const doc: DocumentRecord = {
    id, title: t.name.trim(), reference: officialRef, categoryId: category.id,
    subcategory: t.kind, academicYear: settings.currentYear,
    tags: ["وثيقة منشأة", t.kind],
    description: preserveWord ? (existing?.description || "وثيقة Word معتمدة") : "وثيقة محررة في وحدة إنشاء الوثائق؛ نسخة نصية محفوظة تلقائيًا",
    date: existing?.date ?? now.slice(0,10), relatedType: null, relatedId: null,
    fileId, fileName: preserveWord ? priorFile!.name : fileName,
    mimeType: preserveWord ? priorFile!.type : blob.type,
    size: preserveWord ? priorFile!.blob.size : blob.size,
    hash: preserveWord ? priorFile!.hash : hash,
    docType: preserveWord ? "word" : "other",
    status: existing?.status ?? "active", deletedAt: null,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await archives.put(doc);
  const verified = await archives.get(id);
  const savedFile = await files.get(fileId);
  if (!verified || verified.title !== doc.title || !savedFile) throw new Error("تعذر التحقق من حفظ الوثيقة في الأرشيف");
  try { await logAudit(existing ? "update" : "create", "document", id, "حفظ تلقائي من إنشاء الوثائق: " + doc.title); } catch (e) { console.warn("Archive audit unavailable", e); }
  return verified;
}

/** Replace old generated-template UUID references without changing document identity or contents. */
export async function normalizeGeneratedReferences(): Promise<number> {
  const records = repo<DocumentRecord>("documents");
  const all = await records.list();
  let changed = 0;
  const used = new Map<string, number>();
  for (const d of all) {
    const match = /^أرش\/(\d+)\/(\d{4})$/.exec(d.reference);
    if (match) used.set(match[2], Math.max(used.get(match[2]) ?? 0, Number(match[1])));
  }
  for (const d of all) {
    if (!d.reference.startsWith("generated-template:")) continue;
    const year = (d.date || d.createdAt).slice(0,4);
    const n = (used.get(year) ?? 0) + 1;
    used.set(year,n);
    await records.put({...d,reference:`أرش/${String(n).padStart(3,"0")}/${year}`,updatedAt:nowIso()});
    changed++;
  }
  return changed;
}
