import type { Correspondence, DocumentRecord } from "../db/types";

export type ArchiveGroupBy = "none" | "year" | "type" | "service";

export function getArchiveService(
  document: DocumentRecord,
  correspondences: ReadonlyMap<string, Correspondence>,
): string {
  const explicit = document.service?.trim();
  if (explicit) return explicit;
  if (document.relatedType === "correspondence" && document.relatedId) {
    const correspondent = correspondences.get(document.relatedId)?.party.trim();
    if (correspondent) return correspondent;
  }
  return "";
}

export function groupArchiveDocuments(
  docs: readonly DocumentRecord[],
  grouping: ArchiveGroupBy,
  correspondences: ReadonlyMap<string, Correspondence>,
  typeLabel: (type: string) => string,
): { label: string; docs: DocumentRecord[] }[] {
  if (grouping === "none") return [{ label: "", docs: [...docs] }];
  const groups = new Map<string, DocumentRecord[]>();
  for (const doc of docs) {
    const label = grouping === "year" ? doc.academicYear || "غير محددة"
      : grouping === "type" ? typeLabel(doc.docType)
      : getArchiveService(doc, correspondences) || "غير محددة";
    const current = groups.get(label) ?? [];
    current.push(doc);
    groups.set(label, current);
  }
  return [...groups].sort(([a], [b]) =>
    grouping === "year" ? b.localeCompare(a, "ar") : a.localeCompare(b, "ar")
  ).map(([label, items]) => ({ label, docs: items }));
}
