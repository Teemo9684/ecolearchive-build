import type { Correspondence, DocumentRecord } from "../db/types";

/** Normalize common Arabic spelling variants while preserving digits and references. */
export function normalizeArchiveSearch(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/\s+/g, " ").trim();
}

/** Archive lookup includes metadata of the exact linked correspondence, never unrelated mail. */
export function archiveDocumentMatches(
  document: DocumentRecord, query: string,
  correspondences: ReadonlyMap<string, Correspondence>,
): boolean {
  const terms = normalizeArchiveSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const linked = document.relatedType === "correspondence" && document.relatedId
    ? correspondences.get(document.relatedId) : undefined;
  const fields = [
    document.title, document.reference, document.fileName,
    document.description, document.subcategory, document.academicYear,
    document.date, ...document.tags,
    linked?.reference, linked?.party, linked?.subject, linked?.date,
    linked?.academicYear, linked?.category, linked?.notes,
  ].filter((value): value is string => typeof value === "string");
  const haystack = normalizeArchiveSearch(fields.join(" "));
  return terms.every(term => haystack.includes(term));
}
