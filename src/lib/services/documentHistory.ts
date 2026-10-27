import { repo, uid, nowIso } from "../db/idb";
import type { DocumentFile, DocumentRecord } from "../db/types";

/** Save a detached immutable copy of the previous DOCX before any replacement. */
export async function preservePreviousWordVersion(document: DocumentRecord, nextHash: string | null): Promise<void> {
  if (!document.fileId || !document.hash || document.hash === nextHash) return;
  const files=repo<DocumentFile>("documentFiles");
  const previous=await files.get(document.fileId);
  if (!previous || previous.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return;
  const versionId=uid();
  const fileId="word-history-"+versionId;
  const now=nowIso();
  await files.put({...previous,id:fileId});
  const history:DocumentRecord={
    ...document,id:"word-history-"+versionId,
    fileId,fileName:previous.name,hash:previous.hash,size:previous.blob.size,
    reference:document.reference+" — نسخة "+now.slice(0,19).replace("T"," "),
    subcategory:"نسخة سابقة من وثيقة Word",
    description:"نسخة محفوظة تلقائيًا قبل تعديل الملف الأصلي",
    tags:[...document.tags,"نسخة سابقة"],createdAt:now,updatedAt:now,
  };
  await repo<DocumentRecord>("documents").put(history);
}
