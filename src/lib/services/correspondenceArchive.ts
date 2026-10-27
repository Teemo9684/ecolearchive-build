import { repo, nowIso } from "../db/idb";
import { sha256 } from "../files";
import type { ArchiveCategory, Correspondence, DocumentFile, DocumentRecord, Settings } from "../db/types";

/** Maintain one searchable archive card for each correspondence. */
export async function syncCorrespondenceArchive(c: Correspondence, settings: Settings): Promise<void> {
  const documents = repo<DocumentRecord>("documents");
  const files = repo<DocumentFile>("documentFiles");
  const id = "corr-archive-" + c.id;
  const fileId = "corr-file-" + c.id;
  const prior = await documents.get(id);
  const categories = await repo<ArchiveCategory>("archiveCategories").list();
  const cat = categories.find(x => x.name === "المراسلات الإدارية") ?? categories[0];
  if (!cat) throw new Error("تصنيفات الأرشيف غير جاهزة");
  const direction = c.direction === "in" ? "وارد" : "صادر";
  const content = [
    settings.headerLine, settings.directorate, settings.schoolName, "",
    "بطاقة بريد " + direction, "المرجع: " + c.reference,
    "التاريخ: " + c.date, (c.direction === "in" ? "المرسل: " : "المرسل إليه: ") + c.party,
    "الموضوع: " + c.subject, "ملاحظات: " + (c.notes || "—"),
  ].join("\n");
  const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
  const name = "بريد " + direction + " - " + c.reference.replace(/[\\/:*?"<>|]/g,"-") + ".txt";
  const hash = await sha256(blob);
  await files.put({id:fileId,blob,hash:hash??"",name,type:blob.type});
  const now = nowIso();
  const document:DocumentRecord = {
    id,title:c.subject,reference:c.reference,categoryId:cat.id,
    subcategory:"البريد "+direction,academicYear:c.academicYear||settings.currentYear,
    docType:"other",tags:["مراسلة",direction],description:"بطاقة المراسلة المرتبطة بسجل البريد",
    date:c.date,relatedType:"correspondence",relatedId:c.id,fileId,
    fileName:name,mimeType:blob.type,size:blob.size,hash,status:"active",
    deletedAt:c.deletedAt,createdAt:prior?.createdAt??now,updatedAt:now
  };
  await documents.put(document);
  // Keep linked Word and attachment cards in the same deletion/restore state.
  const related = (await documents.list()).filter(d =>
    d.id !== id && d.relatedType === "correspondence" && d.relatedId === c.id
  );
  for (const d of related) {
    if (d.deletedAt !== c.deletedAt || d.reference !== c.reference) {
      await documents.put({...d,deletedAt:c.deletedAt,reference:c.reference,updatedAt:now});
    }
  }
  if(!(await documents.get(id)))throw new Error("تعذر التحقق من حفظ المراسلة في الأرشيف");
}
