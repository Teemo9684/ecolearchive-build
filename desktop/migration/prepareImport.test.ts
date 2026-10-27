import { describe, expect, it } from "vitest";
import { STORES } from "../../src/lib/db/idb";
import { prepareDesktopImport } from "./prepareImport";
const blank = () => ({
  format: "tebessi-archive-backup", version: 1, createdAt: "2026-10-24T00:00:00Z",
  stores: Object.fromEntries(STORES.map(s => [s, []])) as Record<string, any[]>,
  counts: Object.fromEntries(STORES.map(s => [s, 0])) as Record<string, number>
});
describe("Windows import preflight", () => {
  it("prepares a complete empty backup without writing data", () => {
    const result = prepareDesktopImport(blank());
    expect(result.records).toHaveLength(0);
    expect(result.attachments).toHaveLength(0);
  });
  it("rejects a missing collection before import", () => {
    const b=blank(); delete b.stores.students;
    expect(() => prepareDesktopImport(b)).toThrow("جدول مفقود");
  });
  it("rejects a mismatched count and duplicate IDs", () => {
    const b=blank(); b.stores.students=[{id:"s1"},{id:"s1"}]; b.counts.students=2;
    expect(() => prepareDesktopImport(b)).toThrow("سجل مكرر");
    b.stores.students=[{id:"s1"}];
    expect(() => prepareDesktopImport(b)).toThrow("عدد السجلات");
  });
  it("rejects missing binary attachments for a document", () => {
    const b=blank(); b.stores.documents=[{id:"d1",fileId:"lost"}]; b.counts.documents=1;
    expect(() => prepareDesktopImport(b)).toThrow("مرفق غير موجود");
  });
  it("prepares valid attachment with expected byte count", () => {
    const b=blank(); b.stores.documentFiles=[{id:"f1",name:"test.txt",type:"text/plain",hash:"hash",blob:"data:text/plain;base64,SGVsbG8="}]; b.counts.documentFiles=1;
    b.stores.documents=[{id:"d1",fileId:"f1"}]; b.counts.documents=1;
    const p=prepareDesktopImport(b);
    expect(p.attachments[0].bytes).toBe(5);
    expect(p.records.find(x=>x.collection==="documents")?.id).toBe("d1");
  });
});
