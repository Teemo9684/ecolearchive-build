import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Correspondence, Settings, Template } from "../db/types";

const tables = vi.hoisted(() => new Map<string, Map<string, any>>());
vi.mock("../db/idb", () => ({
  repo: (name: string) => ({
    list: async () => [...(tables.get(name)?.values() ?? [])],
    get: async (id: string) => tables.get(name)?.get(id),
    put: async (value: any) => {
      if (!tables.has(name)) tables.set(name, new Map());
      tables.get(name)!.set(value.id, value);
    },
  }),
  nowIso: () => "2026-10-24T12:00:00.000Z",
}));
vi.mock("../files", () => ({ sha256: async () => "test-hash" }));
vi.mock("./audit", () => ({ logAudit: async () => undefined }));
import { archiveGeneratedTemplate } from "./generatedArchive";
import { syncCorrespondenceArchive } from "./correspondenceArchive";

const settings: Settings = {
  id:"main",schoolName:"المدرسة الابتدائية العربي التبسي",city:"خنشلة",wilaya:"خنشلة",
  directorate:"مديرية التربية",headerLine:"الجزائر",currentYear:"2026-2027",
  prefixIn:"و",prefixOut:"ص",locale:"ar"
};
beforeEach(() => {
  tables.clear();
  tables.set("archiveCategories",new Map([
    ["a",{id:"a",name:"المراسلات الإدارية"}],
    ["b",{id:"b",name:"جداول الإرسال"}],
  ]));
});
describe("automatic digital archive linking", () => {
  it("creates exactly one linked file when a generated document is saved twice", async () => {
    const doc: Template={id:"tmp1",name:"جدول إرسال تجريبي",kind:"جدول إرسال",body:"النص"};
    await archiveGeneratedTemplate(doc,settings);
    await archiveGeneratedTemplate({...doc,body:"النص المصحح"},settings);
    expect(tables.get("documents")?.size).toBe(1);
    expect(tables.get("documentFiles")?.size).toBe(1);
    expect(tables.get("documents")?.get("generated-document-tmp1")?.categoryId).toBe("b");
  });
  it("does not overwrite an archived DOCX when its editable template is saved again", async () => {
    const original: Template={id:"w1",name:"مراسلة",kind:"مراسلة إدارية",body:"مسودة"};
    await archiveGeneratedTemplate(original,settings);
    const fileId="generated-file-w1";
    const word=new Blob(["word-file-content"],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    tables.get("documentFiles")?.set(fileId,{id:fileId,blob:word,name:"مراسلة.docx",type:word.type,hash:"test-hash"});
    const old=tables.get("documents")!.get("generated-document-w1");
    tables.get("documents")!.set(old.id,{...old,docType:"word",mimeType:word.type,fileName:"مراسلة.docx",size:word.size});
    await archiveGeneratedTemplate({...original,body:"مسودة معدلة"},settings);
    const result=tables.get("documents")!.get(old.id);
    expect(result.mimeType).toBe(word.type);
    expect(result.docType).toBe("word");
    expect(tables.get("documentFiles")!.get(fileId).blob).toBe(word);
  });
  it("synchronizes incoming and outgoing records and their deletion/restore states", async () => {
    const base: Correspondence={
      id:"mail1",direction:"in",reference:"و/001/2026",subject:"موضوع",
      party:"المفتشية",date:"2026-10-24",category:"المراسلات الإدارية",
      academicYear:"2026-2027",priority:"normal",status:"pending",notes:"",
      deletedAt:null,createdAt:"2026-10-24T12:00:00.000Z"
    };
    await syncCorrespondenceArchive(base,settings);
    await syncCorrespondenceArchive({...base,subject:"موضوع معدل"},settings);
    expect(tables.get("documents")?.size).toBe(1);
    expect(tables.get("documents")?.get("corr-archive-mail1")?.title).toBe("موضوع معدل");
    // A Word file linked to the same mailing record follows the archive lifecycle.
    tables.get("documents")?.set("corr-word-mail1",{
      id:"corr-word-mail1",relatedType:"correspondence",relatedId:"mail1",
      reference:base.reference,deletedAt:null,updatedAt:base.createdAt
    });
    await syncCorrespondenceArchive({...base,deletedAt:"2026-10-24T14:00:00.000Z"},settings);
    expect(tables.get("documents")?.get("corr-archive-mail1")?.deletedAt).toBeTruthy();
    expect(tables.get("documents")?.get("corr-word-mail1")?.deletedAt).toBeTruthy();
    await syncCorrespondenceArchive({...base,deletedAt:null},settings);
    expect(tables.get("documents")?.get("corr-archive-mail1")?.deletedAt).toBeNull();
    expect(tables.get("documents")?.get("corr-word-mail1")?.deletedAt).toBeNull();
    await syncCorrespondenceArchive({...base,id:"mail2",direction:"out",reference:"ص/001/2026"},settings);
    expect(tables.get("documents")?.size).toBe(3);
  });
});
