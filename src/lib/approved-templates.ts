/** Select approved source documents without altering the originals. */
import PizZip from "pizzip";
const readBuffer = (file: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.readAsArrayBuffer(file);
});
export type ApprovedFormat = "docx" | "pdf";
export interface ApprovedTemplateFile { file: File; format: ApprovedFormat; name: string }
export async function readApprovedTemplate(file: File): Promise<ApprovedTemplateFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "docx" && ext !== "pdf") throw new Error("يجب اختيار ملف Word DOCX أو PDF");
  if (file.size < 8) throw new Error("ملف القالب فارغ أو غير صالح");
  const firstBytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
  const signature = [...firstBytes].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (ext === "pdf" && signature !== "25504446") throw new Error("صيغة PDF غير صالحة");
  if (ext === "docx" && !["504b0304", "504b0506", "504b0708"].includes(signature))
    throw new Error("صيغة DOCX غير صالحة");
  if (ext === "docx") {
    try {
      const zip = new PizZip(await readBuffer(file));
      if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) throw new Error("Missing OOXML parts");
    } catch { throw new Error("قالب Word غير صالح: بنية DOCX ناقصة أو تالفة"); }
  }
  return { file, format: ext, name: file.name };
}
export function copyApprovedTemplate(source: ApprovedTemplateFile): File {
  const type = source.format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return new File([source.file], source.name, { type, lastModified: Date.now() });
}
