import { describe, expect, it } from "vitest";
import type { Correspondence, DocumentRecord } from "../db/types";
import { getArchiveService, groupArchiveDocuments } from "./archiveOrganization";

const correspondence = new Map<string, Correspondence>([["c1", {
  id: "c1", direction: "in", reference: "و/1", subject: "رسالة",
  party: "مديرية التربية", date: "2026-11-08", category: "مراسلات",
  academicYear: "2026-2027", priority: "normal", status: "pending",
  notes: "", deletedAt: null, createdAt: "2026-11-08"
}]]);
const doc = (id: string, extra: Partial<DocumentRecord> = {}) => ({
  id, title: id, reference: "", categoryId: "cat1", subcategory: "",
  academicYear: "2026-2027", docType: "pdf", tags: [], description: "",
  date: "2026-11-08", relatedType: null, relatedId: null,
  fileId: null, fileName: null, mimeType: null, size: null,
  hash: null, status: "active", deletedAt: null,
  createdAt: "2026-11-08", updatedAt: "2026-11-08", ...extra,
} as DocumentRecord);

describe("archive organization", () => {
  it("uses explicit service before linked correspondence party", () => {
    const linked = doc("a", { relatedType: "correspondence", relatedId: "c1" });
    expect(getArchiveService(linked, correspondence)).toBe("مديرية التربية");
    expect(getArchiveService({ ...linked, service: "مصلحة المستخدمين" }, correspondence)).toBe("مصلحة المستخدمين");
  });
  it("does not infer a department for an unrelated document", () => {
    expect(getArchiveService(doc("a"), correspondence)).toBe("");
    expect(getArchiveService(doc("b", { relatedId: "missing", relatedType: "correspondence" }), correspondence)).toBe("");
  });
  it("groups existing documents by year, type and department without mutating them", () => {
    const records = [
      doc("a", { relatedType: "correspondence", relatedId: "c1" }),
      doc("b", { service: "مصلحة المستخدمين", docType: "word" }),
      doc("c", { academicYear: "2025-2026", docType: "word" }),
    ];
    const labels = (t: string) => ({ pdf: "PDF", word: "Word" })[t] ?? t;
    expect(groupArchiveDocuments(records, "year", correspondence, labels).map(x => [x.label, x.docs.length]))
      .toEqual([["2026-2027", 2], ["2025-2026", 1]]);
    expect(groupArchiveDocuments(records, "type", correspondence, labels).map(x => x.label))
      .toEqual(["PDF", "Word"]);
    expect(groupArchiveDocuments(records, "service", correspondence, labels).map(x => x.label))
      .toContain("غير محددة");
    expect(records[0].service).toBeUndefined();
  });
});
