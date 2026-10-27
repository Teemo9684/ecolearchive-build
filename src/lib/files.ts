export async function sha256(blob: Blob): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function detectDocType(name: string, mime = ""): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "excel";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext) || mime.startsWith("image/")) return "image";
  return "other";
}

export const DOC_TYPE_LABEL: Record<string, string> = { pdf: "PDF", word: "وورد", excel: "إكسل", image: "صورة", other: "أخرى" };
export const ACCEPT = ".pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.png,.jpg,.jpeg,.webp,.gif,.txt";
export const MAX_FILE_MB = 50;

export function formatSize(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} ب`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** CSV with UTF-8 BOM so Excel opens Arabic correctly. */
export function exportCsv(rows: (string | number)[][], name: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), name);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("fr-DZ", { year: "numeric", month: "2-digit", day: "2-digit" });
}
