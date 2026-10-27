import { preservePreviousWordVersion } from "./documentHistory";
import { repo, nowIso } from "../db/idb";
import { sha256 } from "../files";
import { archiveGeneratedTemplate } from "./generatedArchive";
import type { DocumentFile, DocumentRecord, Settings, Template } from "../db/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Store the real DOCX alongside its linked generated archive record (not just a text snapshot). */
export async function archiveGeneratedWord(
  template: Template, settings: Settings, content: Blob,
): Promise<DocumentRecord> {
  if (!template.id) throw new Error("يجب حفظ الوثيقة قبل أرشفتها");
  if (content.size === 0 || content.size > 12 * 1024 * 1024) throw new Error("حجم ملف Word غير صالح");
  const existing = await archiveGeneratedTemplate(template, settings);
  if (!existing.fileId) throw new Error("معرّف ملف الأرشيف غير موجود");
  const blob = content.type === DOCX_MIME ? content : new Blob([content], { type: DOCX_MIME });
  const name = (template.name || template.kind).replace(/[\\/:*?"<>|]/g, "-").slice(0, 90) + ".docx";
  const hash = await sha256(blob);
  await preservePreviousWordVersion(existing, hash);
  await repo<DocumentFile>("documentFiles").put({
    id: existing.fileId, blob, hash: hash ?? "", name, type: DOCX_MIME,
  });
  const doc: DocumentRecord = {
    ...existing, fileName: name, mimeType: DOCX_MIME, docType: "word",
    size: blob.size, hash, updatedAt: nowIso(),
    description: "نسخة Word قابلة للتعديل محفوظة من وحدة إنشاء الوثائق",
  };
  await repo<DocumentRecord>("documents").put(doc);
  const checked = await repo<DocumentRecord>("documents").get(doc.id);
  if (!checked || checked.mimeType !== DOCX_MIME) throw new Error("تعذر التحقق من أرشفة Word");
  return checked;
}
