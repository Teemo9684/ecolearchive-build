import { describe, expect, it } from "vitest";
import { archiveDocumentMatches, normalizeArchiveSearch } from "./archiveSearch";
import type { Correspondence, DocumentRecord } from "../db/types";

const mail: Correspondence = {
  id: "mail-1", direction:"in", reference:"و/015/2026",
  subject:"طلب شهادة مدرسية",party:"مديرية التربية خنشلة",
  date:"2026-11-08",category:"المراسلات الإدارية",
  academicYear:"2026/2027",priority:"normal",status:"pending",
  notes:"وصل من المديرية",deletedAt:null,createdAt:"2026-11-08T10:00:00.000Z",
};
const document = {
  id:"doc-1",title:"ملف وارد",reference:"",categoryId:"cat-1",
  subcategory:"البريد الوارد",academicYear:"2026/2027",
  docType:"pdf",tags:["مرفق"],description:"",date:"2026-11-08",
  relatedType:"correspondence",relatedId:"mail-1",fileId:"f1",
  fileName:"scan.pdf",mimeType:"application/pdf",size:12,hash:null,
  status:"active",deletedAt:null,createdAt:"2026-11-08",updatedAt:"2026-11-08",
} as DocumentRecord;
const linked = new Map([[mail.id,mail]]);

describe("archive search by linked school mail", () => {
  it("matches reference, school year, sender, and subject", () => {
    for(const query of ["و/015/2026","2026/2027","مديرية التربية","شهادة مدرسية","خنشله","ملف وارد","scan.pdf"]){
      expect(archiveDocumentMatches(document,query,linked),query).toBe(true);
    }
  });
  it("normalizes Arabic spelling, diacritics and Arabic digits", () => {
    expect(normalizeArchiveSearch("إِدَارَة ٢٠٢٦")).toBe("اداره 2026");
    expect(archiveDocumentMatches(document,"مُدِيرِيَّة ٢٠٢٦",linked)).toBe(true);
  });
  it("requires all search terms, even when in different fields", () => {
    expect(archiveDocumentMatches(document,"مديرية 015",linked)).toBe(true);
    expect(archiveDocumentMatches(document,"مديرية 999",linked)).toBe(false);
  });
  it("does not use unrelated correspondence metadata", () => {
    const unlinked={...document,relatedId:"another"} as DocumentRecord;
    expect(archiveDocumentMatches(unlinked,"مديرية التربية",linked)).toBe(false);
    expect(archiveDocumentMatches({...document,relatedType:null} as DocumentRecord,"مديرية",linked)).toBe(false);
  });
  it("keeps legacy document-only lookup working", () => {
    expect(archiveDocumentMatches({...document,relatedId:null} as DocumentRecord,"scan.pdf",linked)).toBe(true);
    expect(archiveDocumentMatches(document,"   ",linked)).toBe(true);
  });
});
